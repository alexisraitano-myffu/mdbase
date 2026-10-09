import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { apercu } from './editeur/apercu'
import { langageMarkdown } from './editeur/langage'
import { liens as champLiens, raccourcisLiens } from './editeur/liens'
import { collerMisEnForme } from './editeur/coller'
import { menu, raccourcisMiseEnForme } from './editeur/mise-en-forme'
import { menuReferences, pastillesReferences, type SourceLiens } from './editeur/references'
import { repli } from './editeur/repli'
import { MenuTexte } from './MenuTexte'

// Mise en forme du texte : les tailles de titre viennent des classes de ligne
// (app.css), ici seulement le gras, l'italique, le code et la syntaxe atténuée.
const styleMarkdown = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.heading, fontWeight: '600' },
  { tag: tags.monospace, class: 'cm-code-en-ligne' },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], class: 'cm-syntaxe' },
  { tag: [tags.url, tags.link], class: 'cm-syntaxe' },
  { tag: tags.quote, class: 'cm-texte-cite' },
])

/**
 * Corps d'une page (spec §9) : CodeMirror 6 en aperçu en direct, comme
 * Obsidian. Monté une fois par ligne (clé du parent) : `initial` n'est lu
 * qu'au montage.
 *
 * Le texte n'est jamais normalisé : seul ce que l'utilisateur tape change le
 * fichier, et ouvrir une page ne le réécrit jamais.
 */
export function EditeurCorps({ initial, changer, lecture = false, liens }: { initial: string; changer: (markdown: string) => void; lecture?: boolean; liens?: SourceLiens }) {
  const racine = useRef<HTMLDivElement>(null)
  const changerCourant = useRef(changer)
  changerCourant.current = changer
  // Relu à chaque usage : l'espace change pendant que la page est ouverte.
  const liensCourants = useRef(liens)
  liensCourants.current = liens
  const vue = useRef<EditorView | null>(null)
  const modifiable = useRef(new Compartment())
  const lectureInitiale = useRef(lecture)

  useEffect(() => {
    const view = new EditorView({
      parent: racine.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          langageMarkdown,
          indentUnit.of('    '),
          syntaxHighlighting(styleMarkdown),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Contenu de la page', spellcheck: 'true', lang: 'fr' }),
          placeholder('Écris ici, tape « / » pour insérer un bloc ou « @ » pour citer une page'),
          apercu,
          pastillesReferences(() => liensCourants.current ?? null),
          repli,
          champLiens,
          collerMisEnForme,
          menu(menuReferences(() => liensCourants.current ?? null)),
          keymap.of([...raccourcisMiseEnForme, ...raccourcisLiens, ...defaultKeymap, ...historyKeymap, indentWithTab]),
          modifiable.current.of(etatLecture(lectureInitiale.current)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) changerCourant.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    vue.current = view
    return () => {
      vue.current = null
      view.destroy()
    }
    // `initial` volontairement lu une seule fois : le parent remonte l'éditeur à chaque changement de ligne.
  }, [])

  // Mode consultation : le texte reste affiché, rien ne s'y tape.
  useEffect(() => {
    vue.current?.dispatch({ effects: modifiable.current.reconfigure(etatLecture(lecture)) })
  }, [lecture])

  // Clic droit sur un mot (il est sélectionné) ou dans la sélection : le menu de mise en forme.
  // Maj+clic droit garde le menu du système, pour ses suggestions d'orthographe.
  const [menuTexte, setMenuTexte] = useState<{ x: number; y: number } | null>(null)
  const clicDroit = (e: MouseEvent) => {
    const view = vue.current
    if (!view || lecture || e.shiftKey) return
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
    if (pos === null) return
    const sel = view.state.selection.main
    if (sel.empty || pos < sel.from || pos > sel.to) {
      const mot = view.state.wordAt(pos)
      view.dispatch({ selection: mot ? { anchor: mot.from, head: mot.to } : { anchor: pos } })
    }
    e.preventDefault()
    view.focus()
    setMenuTexte({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <div className="editeur-corps" ref={racine} onContextMenu={clicDroit} />
      {menuTexte && vue.current && <MenuTexte vue={vue.current} x={menuTexte.x} y={menuTexte.y} fermer={() => setMenuTexte(null)} />}
    </>
  )
}

function etatLecture(lecture: boolean) {
  return [EditorState.readOnly.of(lecture), EditorView.editable.of(!lecture)]
}
