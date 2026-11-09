import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'

// Tableaux Markdown (GFM) de l'aperçu en direct : hors du curseur, un vrai
// tableau à la place des lignes `| a | b |` ; un clic y remet le curseur et le
// Markdown revient, pour être modifié comme du texte. Rien n'est réécrit.
// Un tableau couvre plusieurs lignes : ses décorations viennent d'un champ
// d'état (CodeMirror refuse un remplacement de blocs depuis un plugin de vue).

type Alignement = 'left' | 'center' | 'right' | null

/** Cellules d'une ligne `| a | b |` ; les barres échappées (`\|`) restent dans la cellule. */
export function cellulesDe(ligne: string): string[] {
  let t = ligne.trim()
  if (t.startsWith('|')) t = t.slice(1)
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1)
  const cellules: string[] = []
  let courante = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (c === '\\' && t[i + 1] === '|') {
      courante += '|'
      i++
    } else if (c === '|') {
      cellules.push(courante.trim())
      courante = ''
    } else courante += c
  }
  cellules.push(courante.trim())
  return cellules
}

/** Alignement des colonnes lu sur la ligne `|:---|:---:|---:|`. */
export function alignementsDe(ligne: string): Alignement[] {
  return cellulesDe(ligne).map((c) => {
    const g = c.startsWith(':')
    const d = c.endsWith(':')
    return g && d ? 'center' : d ? 'right' : g ? 'left' : null
  })
}

/**
 * Le texte d'une cellule, mis en forme sans HTML injecté : gras, italique,
 * code, barré, et le texte seul d'un lien (`[t](url)`, `[[chemin|Titre]]`).
 */
export function remplirCellule(el: HTMLElement, texte: string): void {
  const motif = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|~~(.+?)~~|\[\[([^\]|]+)(?:\|([^\]]*))?\]\]|\[([^\]]*)\]\([^)]*\)/g
  let reste = 0
  for (const m of texte.matchAll(motif)) {
    if (m.index > reste) el.append(texte.slice(reste, m.index))
    const balise = (nom: string, contenu: string, classe?: string) => {
      const b = document.createElement(nom)
      if (classe) b.className = classe
      remplirCellule(b, contenu)
      el.append(b)
    }
    if (m[2] !== undefined) balise('strong', m[2])
    else if (m[4] !== undefined) balise('em', m[4])
    else if (m[5] !== undefined) {
      const code = document.createElement('code')
      code.textContent = m[5]
      el.append(code)
    } else if (m[6] !== undefined) balise('s', m[6])
    else if (m[7] !== undefined) balise('span', m[8] || m[7].replace(/^.*\//, '').replace(/--[^-]*$/, ''), 'cm-tableau-lien')
    else if (m[9] !== undefined) balise('span', m[9], 'cm-tableau-lien')
    reste = m.index + m[0].length
  }
  if (reste < texte.length) el.append(texte.slice(reste))
}

class Tableau extends WidgetType {
  constructor(readonly source: string) {
    super()
  }
  eq(autre: Tableau) {
    return autre.source === this.source
  }
  toDOM(view: EditorView) {
    const lignes = this.source.split('\n')
    const alignements = alignementsDe(lignes[1] ?? '')
    const enveloppe = document.createElement('div')
    enveloppe.className = 'cm-tableau'
    const table = document.createElement('table')
    const ajouterLigne = (parent: HTMLElement, cellules: string[], balise: 'th' | 'td', colonnes: number) => {
      const tr = document.createElement('tr')
      for (let i = 0; i < colonnes; i++) {
        const c = document.createElement(balise)
        const a = alignements[i]
        if (a) c.style.textAlign = a
        remplirCellule(c, cellules[i] ?? '')
        tr.append(c)
      }
      parent.append(tr)
    }
    const entete = cellulesDe(lignes[0] ?? '')
    const thead = document.createElement('thead')
    ajouterLigne(thead, entete, 'th', entete.length)
    const tbody = document.createElement('tbody')
    for (const l of lignes.slice(2)) if (l.trim() !== '') ajouterLigne(tbody, cellulesDe(l), 'td', entete.length)
    table.append(thead, tbody)
    enveloppe.append(table)
    // Un clic remet le curseur dans le tableau : le Markdown revient, prêt à être modifié.
    enveloppe.addEventListener('mousedown', (e) => {
      if (view.state.readOnly || e.button !== 0) return
      e.preventDefault()
      view.dispatch({ selection: { anchor: view.posAtDOM(enveloppe) }, scrollIntoView: false })
      view.focus()
    })
    return enveloppe
  }
  ignoreEvent() {
    return true
  }
}

/** L'éditeur prend ou perd le focus : hors focus, tous les tableaux s'affichent mis en forme. */
const focusChange = StateEffect.define<boolean>()

type EtatTableaux = { focus: boolean; decorations: DecorationSet }

function construire(state: EditorState, focus: boolean): DecorationSet {
  const plages = focus && !state.readOnly ? state.selection.ranges : []
  const deco: Range<Decoration>[] = []
  syntaxTree(state).iterate({
    enter: (n) => {
      if (n.name !== 'Table') return
      const debut = state.doc.lineAt(n.from).from
      const fin = state.doc.lineAt(n.to).to
      if (!plages.some((p) => p.from <= fin && p.to >= debut) && aUneLigneDeSeparation(n.node)) {
        deco.push(Decoration.replace({ widget: new Tableau(state.doc.sliceString(debut, fin)), block: true }).range(debut, fin))
      }
      return false
    },
  })
  return Decoration.set(deco, true)
}

/** Un tableau sans ligne `|---|` n'en est pas un pour le lecteur : laissé tel quel. */
const aUneLigneDeSeparation = (n: SyntaxNode) => n.getChild('TableDelimiter') !== null || n.getChild('TableHeader') !== null

const champ = StateField.define<EtatTableaux>({
  create: (state) => ({ focus: false, decorations: construire(state, false) }),
  update(valeur, tr) {
    let focus = valeur.focus
    for (const e of tr.effects) if (e.is(focusChange)) focus = e.value
    if (focus === valeur.focus && !tr.docChanged && !tr.selection && syntaxTree(tr.startState) === syntaxTree(tr.state)) return valeur
    return { focus, decorations: construire(tr.state, focus) }
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.decorations),
})

export const tableaux = [champ, EditorView.focusChangeEffect.of((_state, focus) => focusChange.of(focus))]
