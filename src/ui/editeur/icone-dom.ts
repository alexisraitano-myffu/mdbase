import { createElement, type IconNode } from 'lucide'

// L'éditeur dessine ses éléments hors de React (widgets CodeMirror) : les
// icônes y viennent de Lucide sans React, aux réglages de `Icone`.

export function iconeDom(icone: IconNode, classe = ''): HTMLElement {
  const el = document.createElement('span')
  el.className = `icone-editeur ${classe}`.trim()
  el.append(createElement(icone, { class: 'icone', width: 15, height: 15, 'stroke-width': 1.75, 'aria-hidden': 'true' }))
  return el
}
