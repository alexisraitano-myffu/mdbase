import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import { StateEffect, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { BookOpen, FilePlus, FileText } from 'lucide'
import type { EtatEspace } from '../../core/depot-espace'
import { ecrireLien, lireLiens, resoudreLien, titreCible } from '../../core/liens-internes'
import { DOSSIER_WIKI, parentsDe } from '../../core/wiki'
import { estDansCode } from './mise-en-forme'

// Références à une ligne (spec §9, « Références ») : « @ » propose les lignes
// de l'espace et écrit un lien wiki `[[chemin-sans-md|Titre]]` ; le lien
// s'affiche en pastille au titre actuel de la ligne, et s'ouvre au clic.

/** Ce que l'éditeur sait de l'espace : relu à chaque usage, il change pendant la saisie. */
export type SourceLiens = {
  etat: () => EtatEspace
  /** Ouvre une ligne, ou une page du wiki quand `base` vaut `_wiki`. */
  ouvrir: (base: string, id: string) => void
  /** Module Wiki actif (spec §22) : « [[ » cite une page, « / Page » en crée une. */
  wiki?: {
    /** Dans une page du wiki : « / Page » crée une sous-page sans rien demander. */
    pageEnCours?: boolean
    /** Crée une page vide ; `demander` : l'emplacement est d'abord choisi. `null` si abandonné. */
    creerPage: (demander: boolean) => Promise<{ id: string; chemin: string } | null>
  }
}

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

/** « [[ » propose les pages du wiki (module actif) ; la suite filtre les titres. */
export function menuPages(source: () => SourceLiens | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const s = source()
    if (!s?.wiki) return null
    const saisie = ctx.matchBefore(/\[\[[^\]\n|[]{0,40}$/u)
    if (!saisie || estDansCode(ctx.state, saisie.from)) return null
    const debut = saisie.from
    const { pages } = s.etat().wiki
    const options = pages.map((p) => {
      const titre = p.titre || 'Sans titre'
      const lien = ecrireLien(p.chemin, p.titre)
      return {
        label: titre,
        detail: parentsDe(pages, p.id).map((x) => x.titre || 'Sans titre').join(' / ') || 'Wiki',
        icone: BookOpen,
        classe: 'option-reference',
        apply: (view: EditorView, _c: unknown, _from: number, to: number) => {
          // Un « ]] » laissé après le curseur (saisie à la main) est absorbé.
          const fin = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to
          view.dispatch({ changes: { from: debut, to: fin, insert: lien }, selection: { anchor: debut + lien.length }, userEvent: 'input.complete' })
        },
      }
    })
    return { from: debut + 2, options, filter: true }
  }
}

/**
 * « / Page » (spec §22) : crée une page, insère un lien vers elle à la place de
 * « /saisie » et l'ouvre. Dans une page du wiki, c'est une sous-page de celle-ci ;
 * « / Page dans… », et partout ailleurs, l'emplacement est d'abord demandé.
 */
export function menuNouvellePage(source: () => SourceLiens | null) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const s = source()
    if (!s?.wiki) return null
    const saisie = ctx.matchBefore(/(?:^|\s)\/[\p{L}\d ]{0,20}$/u)
    if (!saisie) return null
    const debut = saisie.from + saisie.text.indexOf('/')
    if (estDansCode(ctx.state, debut)) return null
    const creer = (demander: boolean) => async (view: EditorView, _c: unknown, _from: number, to: number) => {
      view.dispatch({ changes: { from: debut, to, insert: '' }, selection: { anchor: debut }, userEvent: 'input.complete' })
      const page = await source()?.wiki?.creerPage(demander)
      if (!page) return
      const lien = ecrireLien(page.chemin, '')
      const at = Math.min(debut, view.state.doc.length)
      view.dispatch({ changes: { from: at, insert: lien }, selection: { anchor: at + lien.length }, userEvent: 'input.complete' })
      source()?.ouvrir(DOSSIER_WIKI, page.id)
    }
    const options = s.wiki.pageEnCours
      ? [
          { label: 'Page', detail: 'Sous-page', icone: FilePlus, apply: creer(false), boost: -1 },
          { label: 'Page dans…', detail: 'Wiki', icone: FilePlus, apply: creer(true), boost: -2 },
        ]
      : [{ label: 'Page', detail: 'Wiki', icone: FilePlus, apply: creer(true), boost: -1 }]
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
      if (this.cible.base === DOSSIER_WIKI) el.classList.add('wiki')
    } else el.title = 'Introuvable : supprimée, ou hors de cet espace'
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
        const titre = cible ? titreCible(etat, cible) : (l.alias ?? l.cible)
        deco.push(Decoration.replace({ widget: new Pastille(titre, cible) }).range(l.from, l.to))
      }
      p = ligne.to + 1
    }
  }
  return Decoration.set(deco, true)
}

/** L'espace a changé (titre renommé, page déplacée) : les pastilles se recalculent, le texte ne bouge pas. */
export const rafraichirPastilles = StateEffect.define<null>()

export function pastillesReferences(source: () => SourceLiens | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = decorations(view, source)
      }
      update(u: ViewUpdate) {
        const rafraichi = u.transactions.some((t) => t.effects.some((e) => e.is(rafraichirPastilles)))
        if (rafraichi || u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
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
