import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language'
import { keymap } from '@codemirror/view'
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide'
import { iconeDom } from './icone-dom'

// Repli des titres : un chevron dans la marge, à gauche de chaque titre, replie
// tout ce qui suit jusqu'au titre suivant de même niveau ou plus haut (le
// découpage en sections vient de la grammaire Markdown de CodeMirror). Le
// repli ne touche pas au fichier et ne survit pas à la fermeture de la page.

export const repli = [
  codeFolding({
    placeholderDOM: (_view, deplier) => {
      const el = iconeDom(Ellipsis, 'cm-replie')
      el.title = 'Déplier'
      el.addEventListener('click', deplier)
      return el
    },
  }),
  foldGutter({
    markerDOM: (ouvert) => {
      const el = iconeDom(ouvert ? ChevronDown : ChevronRight, ouvert ? 'cm-repli-ouvert' : 'cm-repli-ferme')
      el.title = ouvert ? 'Replier' : 'Déplier'
      return el
    },
  }),
  keymap.of(foldKeymap),
]
