import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { FileText } from 'lucide'
import type { EtatEspace } from '../../core/depot-espace'
import { ecrireLien, lireLiens, resoudreLien } from '../../core/liens-internes'
import { estDansCode } from './mise-en-forme'

// Références à une ligne (spec §9, « Références ») : « @ » propose les lignes
// de l'espace et écrit un lien wiki `[[chemin-sans-md|Titre]]` ; le lien
// s'affiche en pastille au titre actuel de la ligne, et s'ouvre au clic.

/** Ce que l'éditeur sait de l'espace : relu à chaque usage, il change pendant la saisie. */
export type SourceLiens = { etat: () => EtatEspace; ouvrir: (base: string, id: string) => void }

/** « @ » en début de ligne ou après une espace ou une parenthèse ; la suite filtre les titres. */
export function menuReferences(source: () => SourceLiens | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const s = source()
    if (!s) return null
    const saisie = ctx.matchBefore(/(?:^|[\s(])@[^\n@[\]|]{0,30}$/u)
    if (!saisie) return null
    const debut = saisie.from + saisie.text.indexOf('@')
    if (estDansCode(ctx.state, debut)) return null
    const etat = s.etat()
    const options = [...etat.bases.values()].flatMap((b) => {
      if (!b.depot) return []
      const titres = etat.titres.get(b.id)
      return b.depot.lignes().map((l) => {
        const titre = titres?.get(l.id) || 'Sans titre'
        const lien = ecrireLien(l.chemin, titre)
        return {
          label: titre,
          detail: b.depot!.schema.nom,
          icone: FileText,
          classe: 'option-reference',
          apply: (view: EditorView, _c: unknown, _from: number, to: number) =>
            view.dispatch({ changes: { from: debut, to, insert: lien }, selection: { anchor: debut + lien.length }, userEvent: 'input.complete' }),
        }
      })
    })
    // Le « @ » reste hors du texte filtré : « @site » cherche « site ».
    return { from: debut + 1, options, filter: true }
  }
}

class Pastille extends WidgetType {
  constructor(
    readonly texte: string,
    readonly cible: { base: string; id: string } | null,
  ) {
    super()
  }
  eq(autre: Pastille) {
    return autre.texte === this.texte && autre.cible?.base === this.cible?.base && autre.cible?.id === this.cible?.id
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = this.cible ? 'cm-reference' : 'cm-reference cassee'
    el.textContent = this.texte
    if (this.cible) {
      el.dataset.base = this.cible.base
      el.dataset.id = this.cible.id
      el.title = 'Ouvrir la page'
    } else el.title = 'Ligne introuvable'
    return el
  }
  ignoreEvent() {
    return false
  }
}

const DANS_CODE = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

function dansCodeEnLigne(state: EditorState, pos: number): boolean {
  for (let n: { name: string; parent: unknown } | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent as typeof n) if (DANS_CODE.has(n.name)) return true
  return false
}

function decorations(view: EditorView, source: () => SourceLiens | null): DecorationSet {
  const s = source()
  if (!s) return Decoration.none
  const etat = s.etat()
  const { state } = view
  const plages = view.hasFocus && !state.readOnly ? state.selection.ranges : []
  const deco: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    for (let p = from; p <= to; ) {
      const ligne = state.doc.lineAt(p)
      for (const l of lireLiens(ligne.text, ligne.from)) {
        if (plages.some((r) => r.from <= l.to && r.to >= l.from) || dansCodeEnLigne(state, l.from)) continue
        const cible = resoudreLien(etat, l.cible)
        const titre = cible ? etat.titres.get(cible.base)?.get(cible.id) || 'Sans titre' : (l.alias ?? l.cible)
        deco.push(Decoration.replace({ widget: new Pastille(titre, cible) }).range(l.from, l.to))
      }
      p = ligne.to + 1
    }
  }
  return Decoration.set(deco, true)
}

export function pastillesReferences(source: () => SourceLiens | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorations(view, source)
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = decorations(u.view, source)
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        mousedown(e) {
          const el = (e.target as HTMLElement).closest<HTMLElement>('.cm-reference')
          const { base, id } = el?.dataset ?? {}
          if (!base || !id || e.button !== 0) return false
          e.preventDefault()
          source()?.ouvrir(base, id)
          return true
        },
      },
    },
  )
}
