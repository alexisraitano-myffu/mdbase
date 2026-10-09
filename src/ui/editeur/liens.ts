import { syntaxTree } from '@codemirror/language'
import { EditorSelection, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { EditorView, showTooltip, type KeyBinding, type Tooltip } from '@codemirror/view'
import { ExternalLink, Unlink } from 'lucide'
import { ouvrirAdresse } from '../../adapters/tauri/bureau'
import { iconeDom } from './icone-dom'

// Liens au clavier : Ctrl+K sur un texte sélectionné ouvre un petit champ où
// coller l'adresse, et le texte devient « [texte](adresse) ». Sur un lien
// existant, le même champ change ou retire son adresse. Sans sélection ni lien,
// Ctrl+K reste la recherche globale.

/** Un lien à créer (sur la sélection) ou à modifier ; `url` : place de l'adresse d'un lien existant. */
type Cible = { from: number; to: number; texte: string; adresse: string; url?: { from: number; to: number } }

const ouvrir = StateEffect.define<Cible>()
const fermer = StateEffect.define<null>()

/** Lien Markdown « [texte](adresse) » sous la position, s'il y en a un. */
function lienSous(state: EditorState, pos: number): Cible | null {
  for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name !== 'Link') continue
    const marques = n.getChildren('LinkMark')
    const url = n.getChild('URL')
    if (marques.length < 2 || !url) return null
    return { from: n.from, to: n.to, texte: state.sliceDoc(marques[0]!.to, marques[1]!.from), adresse: state.sliceDoc(url.from, url.to), url: { from: url.from, to: url.to } }
  }
  return null
}

/** « exemple.fr/page » devient « https://exemple.fr/page » ; espaces et parenthèses encodés pour ne pas casser le lien. */
export function adresseLien(saisie: string): string {
  const a = saisie.trim()
  const complete = /^[a-z][a-z0-9+.-]*:/i.test(a) || /^[#/]/.test(a) || !/^[\w-]+(\.[\w-]+)+([/?#]|$)/.test(a) ? a : `https://${a}`
  return complete.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')
}

function appliquer(view: EditorView, c: Cible, saisie: string) {
  const adresse = adresseLien(saisie)
  if (adresse === '' && !c.url) return fermerChamp(view)
  const changes =
    adresse === ''
      ? { from: c.from, to: c.to, insert: c.texte } // adresse vidée : le lien redevient du texte
      : c.url
        ? { from: c.url.from, to: c.url.to, insert: adresse }
        : { from: c.from, to: c.to, insert: `[${c.texte}](${adresse})` }
  const fin = changes.from + changes.insert.length + (c.url && adresse !== '' ? c.to - c.url.to : 0)
  view.dispatch({ changes, selection: EditorSelection.cursor(fin), effects: fermer.of(null), userEvent: 'input.format' })
  view.focus()
}

function fermerChamp(view: EditorView) {
  view.dispatch({ effects: fermer.of(null) })
  view.focus()
}

function champLien(c: Cible): Tooltip {
  return {
    pos: c.from,
    above: false,
    create(view) {
      const dom = document.createElement('div')
      dom.className = 'cm-champ-lien'
      const input = document.createElement('input')
      input.value = c.adresse
      input.placeholder = 'Colle une adresse (https://…)'
      input.setAttribute('aria-label', 'Adresse du lien')
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          appliquer(view, c, input.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          fermerChamp(view)
        }
      })
      dom.append(input)
      const bouton = (icone: Parameters<typeof iconeDom>[0], titre: string, action: () => void) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'discret'
        b.title = titre
        b.setAttribute('aria-label', titre)
        b.append(iconeDom(icone, 'icone-lien'))
        b.addEventListener('mousedown', (e) => e.preventDefault())
        b.addEventListener('click', action)
        dom.append(b)
      }
      if (c.url) {
        bouton(ExternalLink, 'Ouvrir le lien', () => ouvrirAdresse(adresseLien(input.value)))
        bouton(Unlink, 'Retirer le lien', () => appliquer(view, c, ''))
      }
      return {
        dom,
        mount: () => {
          input.focus()
          input.select()
        },
      }
    },
  }
}

const champ = StateField.define<Cible | null>({
  create: () => null,
  update(valeur, tr) {
    for (const e of tr.effects) {
      if (e.is(ouvrir)) return e.value
      if (e.is(fermer)) return null
    }
    return tr.docChanged ? null : valeur
  },
  provide: (f) => showTooltip.from(f, (c) => (c ? champLien(c) : null)),
})

/** Ctrl+K : lier la sélection, ou modifier le lien sous le curseur ; sinon, la main passe à la recherche globale. */
export function lier(view: EditorView): boolean {
  const { state } = view
  if (state.readOnly) return false
  const sel = state.selection.main
  const existant = lienSous(state, sel.head)
  if (existant) {
    view.dispatch({ effects: ouvrir.of(existant) })
    return true
  }
  if (sel.empty || state.doc.lineAt(sel.from).number !== state.doc.lineAt(sel.to).number) return false
  view.dispatch({ effects: ouvrir.of({ from: sel.from, to: sel.to, texte: state.sliceDoc(sel.from, sel.to), adresse: '' }) })
  return true
}

export const raccourcisLiens: KeyBinding[] = [{ key: 'Mod-k', run: lier }]

const themeLien = EditorView.theme({
  '.cm-tooltip.cm-champ-lien, .cm-champ-lien': { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px', background: 'var(--surface)', border: '1px solid var(--bordure)', borderRadius: '8px', boxShadow: 'var(--ombre)' },
  '.cm-champ-lien input': { width: '20rem', maxWidth: '60vw', font: 'inherit', padding: '4px 6px', border: '1px solid var(--bordure)', borderRadius: '6px', background: 'var(--fond)', color: 'var(--texte)' },
  '.cm-champ-lien button': { display: 'inline-flex', padding: '4px' },
})

export const liens = [champ, themeLien]
