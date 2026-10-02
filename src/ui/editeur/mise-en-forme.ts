import { autocompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { EditorSelection, type EditorState } from '@codemirror/state'
import { EditorView, tooltips, type KeyBinding } from '@codemirror/view'
import { Code, Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Minus, Pilcrow, TextQuote, type IconNode } from 'lucide'
import { iconeDom } from './icone-dom'

// Mise en forme au clavier (Ctrl+B, Ctrl+I) et menu « / » des blocs : tout
// s'écrit en Markdown dans le texte, rien n'est caché derrière un format.

/** Entoure la sélection de `marque`, ou la retire si elle y est déjà. */
function basculer(marque: string) {
  return (view: EditorView) => {
    if (view.state.readOnly) return false
    const n = marque.length
    view.dispatch(
      view.state.changeByRange((r) => {
        const avant = view.state.sliceDoc(r.from - n, r.from)
        const apres = view.state.sliceDoc(r.to, r.to + n)
        if (avant === marque && apres === marque) {
          return {
            changes: [
              { from: r.from - n, to: r.from },
              { from: r.to, to: r.to + n },
            ],
            range: EditorSelection.range(r.from - n, r.to - n),
          }
        }
        return {
          changes: [
            { from: r.from, insert: marque },
            { from: r.to, insert: marque },
          ],
          range: EditorSelection.range(r.from + n, r.to + n),
        }
      }),
      { userEvent: 'input.format' },
    )
    return true
  }
}

export const raccourcisMiseEnForme: KeyBinding[] = [
  { key: 'Mod-b', run: basculer('**') },
  { key: 'Mod-i', run: basculer('*') },
]

/** Début de ligne d'un bloc (titre, liste, citation, tâche), remplacé quand on change de bloc. */
const PREFIXE = /^(\s*)(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )?/

type Bloc = { label: string; detail: string; icone: IconNode; prefixe?: string; texte?: string; curseur?: number }

const BLOCS: Bloc[] = [
  { label: 'Texte', detail: 'Paragraphe', icone: Pilcrow, prefixe: '' },
  { label: 'Titre 1', detail: '#', icone: Heading1, prefixe: '# ' },
  { label: 'Titre 2', detail: '##', icone: Heading2, prefixe: '## ' },
  { label: 'Titre 3', detail: '###', icone: Heading3, prefixe: '### ' },
  { label: 'Tâche', detail: '- [ ]', icone: ListChecks, prefixe: '- [ ] ' },
  { label: 'Liste à puces', detail: '-', icone: List, prefixe: '- ' },
  { label: 'Liste numérotée', detail: '1.', icone: ListOrdered, prefixe: '1. ' },
  { label: 'Citation', detail: '>', icone: TextQuote, prefixe: '> ' },
  { label: 'Bloc de code', detail: '```', icone: Code, texte: '```\n\n```', curseur: 4 },
  { label: 'Séparateur', detail: '---', icone: Minus, texte: '---\n', curseur: 4 },
]

/** Change le bloc de la ligne : retire « /saisie », remplace le début de ligne. */
function appliquerBloc(bloc: Bloc) {
  return (view: EditorView, _c: Completion, apresBarre: number, to: number) => {
    const state = view.state
    const from = apresBarre - 1
    const ligne = state.doc.lineAt(from)
    const sans = ligne.text.slice(0, from - ligne.from) + ligne.text.slice(to - ligne.from)
    if (bloc.texte !== undefined) {
      // Bloc de code, séparateur : sur une ligne à lui, à la place de la ligne vide ou après elle.
      const vide = sans.trim() === ''
      const insert = vide ? bloc.texte : `${sans}\n${bloc.texte}`
      const debut = vide ? ligne.from : ligne.from + sans.length + 1
      view.dispatch({ changes: { from: ligne.from, to: ligne.to, insert }, selection: { anchor: debut + bloc.curseur! }, userEvent: 'input.complete' })
      return
    }
    const m = PREFIXE.exec(sans)!
    const retrait = m[1] ?? ''
    const reste = sans.slice(m[0].length)
    const insert = `${retrait}${bloc.prefixe}${reste}`
    const curseur = ligne.from + retrait.length + bloc.prefixe!.length + Math.max(0, from - ligne.from - m[0].length)
    view.dispatch({ changes: { from: ligne.from, to: ligne.to, insert }, selection: { anchor: Math.min(curseur, ligne.from + insert.length) }, userEvent: 'input.complete' })
  }
}

/** « / » en début de ligne ou après une espace ouvre le menu ; la suite filtre. */
function menuBlocs(ctx: CompletionContext): CompletionResult | null {
  const saisie = ctx.matchBefore(/(?:^|\s)\/[\p{L}\d ]{0,20}$/u)
  if (!saisie) return null
  const debut = saisie.from + saisie.text.indexOf('/')
  if (estDansCode(ctx.state, debut)) return null
  return {
    // Le « / » reste hors du texte filtré : « /tit » cherche « tit ».
    from: debut + 1,
    // Le rang départage à score égal : sans saisie, le menu garde l'ordre de BLOCS.
    options: BLOCS.map((b, i) => ({ label: b.label, detail: b.detail, apply: appliquerBloc(b), icone: b.icone, boost: BLOCS.length - i })),
    filter: true,
  }
}

export function estDansCode(state: EditorState, pos: number): boolean {
  const ligne = state.doc.lineAt(pos)
  let ouvert = false
  for (let n = 1; n < ligne.number; n++) if (/^\s*```/.test(state.doc.line(n).text)) ouvert = !ouvert
  return ouvert
}

// Le thème de CodeMirror est injecté après app.css : le style du menu passe donc par lui.
const themeMenu = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': { background: 'var(--surface)', border: '1px solid var(--bordure)', borderRadius: '8px', boxShadow: 'var(--ombre)', padding: '4px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', maxHeight: '19rem', minWidth: '15rem' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '6px', color: 'var(--texte)', lineHeight: '1.5' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { background: 'var(--survol)', color: 'var(--texte)' },
  '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '1.5em', fontStyle: 'normal', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: '0.85em', color: 'var(--tres-discret-texte)' },
  '.cm-completionMatchedText': { textDecoration: 'none', fontWeight: '600' },
  // Menu « @ » : le détail est le nom de la base, pas un raccourci.
  '.option-reference .cm-completionDetail': { fontFamily: 'inherit', fontSize: '0.9em' },
})

/** Menus de l'éditeur : « / » pour les blocs, et les autres sources données (« @ » des références). */
export const menu = (...autres: CompletionSource[]) => [
  themeMenu,
  // Dans le body : le panneau de la page ne coupe plus le menu.
  tooltips({ parent: document.body }),
  autocompletion({
  override: [menuBlocs, ...autres],
  icons: false,
  optionClass: (c) => (c as Completion & { classe?: string }).classe ?? '',
  addToOptions: [
    {
      render: (c) => iconeDom((c as Completion & { icone: IconNode }).icone),
      position: 20,
    },
  ],
  }),
]
