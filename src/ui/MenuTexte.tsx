import { useLayoutEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { Bold, ClipboardPaste, Code, Copy, Eraser, Italic, Link, Scissors, Strikethrough, type LucideIcon } from 'lucide-react'
import { convertirLeHtml, htmlEnMarkdown } from './editeur/coller'
import { lier } from './editeur/liens'
import { barre, codeEnLigne, COULEURS_SURLIGNAGE, gras, italique, surligner } from './editeur/mise-en-forme'
import { couleurOption } from './couleurs'
import { Flottant } from './flottant'
import { Icone } from './icones'

// Menu du clic droit dans le corps d'une page (spec §9) : mise en forme du mot
// ou de la sélection, surlignage par couleur, couper, copier, coller. Tout
// passe par les mêmes commandes que le clavier : du Markdown dans le texte.

const NOMS: Record<string, string> = {
  jaune: 'Jaune',
  orange: 'Orange',
  rouge: 'Rouge',
  rose: 'Rose',
  violet: 'Violet',
  bleu: 'Bleu',
  vert: 'Vert',
  marron: 'Marron',
  gris: 'Gris',
}

/** Coller depuis le menu : le presse-papiers mis en forme passe en Markdown, comme Ctrl+V. */
async function coller(view: EditorView) {
  let texte = ''
  try {
    const elements = await navigator.clipboard.read()
    for (const e of elements) {
      const html = e.types.includes('text/html') ? await (await e.getType('text/html')).text() : ''
      texte = e.types.includes('text/plain') ? await (await e.getType('text/plain')).text() : ''
      if (html && convertirLeHtml(html, texte)) texte = await htmlEnMarkdown(html)
      break
    }
  } catch {
    texte = await navigator.clipboard.readText().catch(() => '')
  }
  if (texte) view.dispatch(view.state.replaceSelection(texte), { userEvent: 'input.paste', scrollIntoView: true })
}

export function MenuTexte(p: { vue: EditorView; x: number; y: number; fermer: () => void }) {
  const ancre = useRef<HTMLSpanElement>(null)
  const [pret, setPret] = useState(false)
  useLayoutEffect(() => setPret(true), [])
  const { vue } = p
  const selection = vue.state.sliceDoc(vue.state.selection.main.from, vue.state.selection.main.to)

  const faire = (commande: (v: EditorView) => unknown) => () => {
    p.fermer()
    commande(vue)
    vue.focus()
  }
  const action = (icone: LucideIcon, libelle: string, commande: (v: EditorView) => unknown, touches?: string) => (
    <button className="option" onClick={faire(commande)}>
      <Icone de={icone} /> {libelle}
      {touches && <span className="discret raccourci-menu">{touches}</span>}
    </button>
  )
  const mod = /Mac/.test(navigator.platform) ? 'Cmd+' : 'Ctrl+'

  return (
    <>
      <span ref={ancre} className="ancre-menu-texte" style={{ left: p.x, top: p.y }} />
      {pret && (
        <Flottant ancre={ancre.current} fermer={p.fermer}>
          <div className="menu-texte" role="menu" aria-label="Mise en forme">
            {action(Bold, 'Gras', gras, `${mod}B`)}
            {action(Italic, 'Italique', italique, `${mod}I`)}
            {action(Strikethrough, 'Barré', barre)}
            {action(Code, 'Code', codeEnLigne)}
            {action(Link, 'Lien', lier, `${mod}K`)}
            <div className="separateur-menu" />
            <div className="titre-menu discret">Surligner</div>
            <div className="couleurs-surlignage">
              {COULEURS_SURLIGNAGE.map((c) => (
                <button key={c} className="pastille-surlignage" title={NOMS[c]} aria-label={`Surligner en ${NOMS[c]!.toLowerCase()}`} style={{ background: couleurOption(c).fond }} onClick={faire(surligner(c))} />
              ))}
              <button className="discret pastille-surlignage sans" title="Retirer le surlignage" aria-label="Retirer le surlignage" onClick={faire(surligner(null))}>
                <Icone de={Eraser} />
              </button>
            </div>
            <div className="separateur-menu" />
            {selection !== '' &&
              action(Scissors, 'Couper', (v) => {
                void navigator.clipboard.writeText(selection)
                v.dispatch(v.state.replaceSelection(''), { userEvent: 'delete.cut' })
              })}
            {selection !== '' && action(Copy, 'Copier', () => void navigator.clipboard.writeText(selection))}
            {action(ClipboardPaste, 'Coller', (v) => void coller(v))}
          </div>
        </Flottant>
      )}
    </>
  )
}
