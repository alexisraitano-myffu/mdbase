import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

// Aperçu en direct, à la manière d'Obsidian : le Markdown s'affiche mis en
// forme, et sa syntaxe (# d'un titre, ** du gras, crochets d'un lien)
// réapparaît là où se trouve le curseur, pour être modifiée comme du texte.
// Rien n'est réécrit : seul l'affichage change, le fichier reste tel quel.

/** Une case à cocher à la place de « - [ ] » ; cliquer réécrit la case dans le texte. */
class Case extends WidgetType {
  constructor(
    readonly cochee: boolean,
    readonly position: number,
  ) {
    super()
  }
  eq(autre: Case) {
    return autre.cochee === this.cochee && autre.position === this.position
  }
  toDOM(view: EditorView) {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.className = 'cm-case'
    el.checked = this.cochee
    el.disabled = view.state.readOnly
    el.setAttribute('aria-label', this.cochee ? 'Tâche faite' : 'Tâche à faire')
    el.addEventListener('mousedown', (e) => e.preventDefault())
    el.addEventListener('click', (e) => {
      e.preventDefault()
      if (view.state.readOnly) return
      // La position du widget plutôt que celle d'origine : le texte a pu bouger avant lui.
      const debut = view.posAtDOM(el)
      const marque = view.state.doc.sliceString(debut, debut + 40).indexOf('[')
      if (marque < 0) return
      const at = debut + marque + 1
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.cochee ? ' ' : 'x' }, userEvent: 'input.case' })
    })
    return el
  }
  ignoreEvent() {
    return false
  }
}

class Puce extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-puce'
    return el
  }
}

class Separateur extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-separateur'
    return el
  }
}

const cache = Decoration.replace({})
const puce = Decoration.replace({ widget: new Puce() })
const separateur = Decoration.replace({ widget: new Separateur() })
const ligne = (classe: string) => Decoration.line({ class: classe })
const TITRES = [1, 2, 3, 4, 5, 6].map((n) => ligne(`cm-titre cm-titre-${n}`))
const CITATION = ligne('cm-citation')
const CODE = ligne('cm-bloc-code')
// Le texte seulement : barrer toute la ligne barrerait aussi le retrait d'une sous-tâche.
const FAITE = Decoration.mark({ class: 'cm-tache-faite' })

/** Les plages de la sélection, ou aucune quand l'éditeur n'a pas le focus (tout s'affiche mis en forme). */
function plagesActives(view: EditorView): { from: number; to: number }[] {
  if (!view.hasFocus || view.state.readOnly) return []
  return view.state.selection.ranges.map((r) => ({ from: r.from, to: r.to }))
}

const touche = (plages: { from: number; to: number }[], from: number, to: number) => plages.some((p) => p.from <= to && p.to >= from)

/** Les lignes que la sélection touche : la syntaxe d'un titre ou d'une citation y reste visible. */
function lignesActives(state: EditorState, plages: { from: number; to: number }[]): Set<number> {
  const lignes = new Set<number>()
  for (const p of plages) {
    for (let n = state.doc.lineAt(p.from).number; n <= state.doc.lineAt(p.to).number; n++) lignes.add(n)
  }
  return lignes
}

/** Masque une marque et l'espace qui la suit (« # Titre », « > citation »). */
function masquerAvecEspace(state: EditorState, deco: Range<Decoration>[], noeud: SyntaxNode) {
  const fin = state.doc.sliceString(noeud.to, noeud.to + 1) === ' ' ? noeud.to + 1 : noeud.to
  deco.push(cache.range(noeud.from, fin))
}

const MARQUES_EN_LIGNE = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark'])
const EN_LIGNE = new Set(['Emphasis', 'StrongEmphasis', 'InlineCode', 'Strikethrough'])

function decorations(view: EditorView): DecorationSet {
  const { state } = view
  const plages = plagesActives(view)
  const actives = lignesActives(state, plages)
  const deco: Range<Decoration>[] = []
  const ligneActive = (pos: number) => actives.has(state.doc.lineAt(pos).number)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (n) => {
        const nom = n.name
        const titre = /^ATXHeading(\d)$/.exec(nom) ?? /^SetextHeading(\d)$/.exec(nom)
        if (titre) {
          deco.push(TITRES[Number(titre[1]) - 1]!.range(state.doc.lineAt(n.from).from))
          return
        }
        if (nom === 'HeaderMark') {
          if (n.node.parent?.name.startsWith('ATXHeading') && !ligneActive(n.from)) masquerAvecEspace(state, deco, n.node)
          return
        }
        if (nom === 'Blockquote') {
          for (let p = n.from; p <= n.to; ) {
            const l = state.doc.lineAt(p)
            deco.push(CITATION.range(l.from))
            p = l.to + 1
          }
          return
        }
        if (nom === 'QuoteMark') {
          if (!ligneActive(n.from)) masquerAvecEspace(state, deco, n.node)
          return
        }
        if (nom === 'FencedCode' || nom === 'CodeBlock') {
          for (let p = n.from; p <= n.to; ) {
            const l = state.doc.lineAt(p)
            deco.push(CODE.range(l.from))
            p = l.to + 1
          }
          return false
        }
        if (nom === 'HorizontalRule') {
          if (!ligneActive(n.from)) deco.push(separateur.range(n.from, n.to))
          return
        }
        if (EN_LIGNE.has(nom)) {
          if (touche(plages, n.from, n.to)) return false
          return
        }
        if (MARQUES_EN_LIGNE.has(nom)) {
          deco.push(cache.range(n.from, n.to))
          return
        }
        if (nom === 'Link') {
          lien(state, n.node, plages, deco)
          return false
        }
        if (nom === 'URL' && n.node.parent?.name !== 'Link') {
          deco.push(Decoration.mark({ class: 'cm-lien', attributes: { 'data-adresse': state.doc.sliceString(n.from, n.to) } }).range(n.from, n.to))
          return
        }
        if (nom === 'ListItem') {
          puceOuCase(state, n.node, plages, deco)
          return
        }
      },
    })
  }
  return Decoration.set(deco, true)
}

/** « [texte](adresse) » : seul le texte reste, souligné et cliquable, tant que le curseur n'y est pas. */
function lien(state: EditorState, noeud: SyntaxNode, plages: { from: number; to: number }[], deco: Range<Decoration>[]) {
  const marques = noeud.getChildren('LinkMark')
  const url = noeud.getChild('URL')
  if (marques.length < 2 || !url) return
  const ouvrant = marques[0]!
  const fermant = marques[1]!
  const adresse = state.doc.sliceString(url.from, url.to)
  if (fermant.from > ouvrant.to) {
    deco.push(Decoration.mark({ class: 'cm-lien', attributes: { 'data-adresse': adresse } }).range(ouvrant.to, fermant.from))
  }
  if (touche(plages, noeud.from, noeud.to)) return
  deco.push(cache.range(ouvrant.from, ouvrant.to))
  deco.push(cache.range(fermant.from, noeud.to))
}

/** Puce dessinée à la place de « - », case à la place de « - [ ] » ; la syntaxe revient quand le curseur la touche. */
function puceOuCase(state: EditorState, item: SyntaxNode, plages: { from: number; to: number }[], deco: Range<Decoration>[]) {
  const marque = item.getChild('ListMark')
  if (!marque) return
  const tache = item.getChild('Task')?.getChild('TaskMarker')
  if (tache) {
    const cochee = /x/i.test(state.doc.sliceString(tache.from, tache.to))
    const fin = state.doc.sliceString(tache.to, tache.to + 1) === ' ' ? tache.to + 1 : tache.to
    const finLigne = state.doc.lineAt(tache.from).to
    if (cochee && finLigne > fin) deco.push(FAITE.range(fin, finLigne))
    if (touche(plages, marque.from, fin)) return
    deco.push(Decoration.replace({ widget: new Case(cochee, marque.from) }).range(marque.from, fin))
    return
  }
  if (item.parent?.name !== 'BulletList') return
  if (touche(plages, marque.from, marque.to + 1)) return
  deco.push(puce.range(marque.from, marque.to))
}

export const apercu = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorations(view)
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        this.decorations = decorations(u.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      // Un lien mis en forme s'ouvre au clic (dans un nouvel onglet) ; on l'édite en y venant au clavier.
      mousedown(e, view) {
        const cible = (e.target as HTMLElement).closest<HTMLElement>('.cm-lien')
        const adresse = cible?.dataset.adresse
        if (!cible || !adresse || e.button !== 0) return false
        const pos = view.posAtDOM(cible)
        if (touche(plagesActives(view), pos, pos + (cible.textContent?.length ?? 0)) && !(e.ctrlKey || e.metaKey)) return false
        if (!/^(https?:\/\/|mailto:|www\.)/i.test(adresse)) return false
        e.preventDefault()
        window.open(adresse.startsWith('www.') ? `https://${adresse}` : adresse, '_blank', 'noopener')
        return true
      },
    },
  },
)
