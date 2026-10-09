import { syntaxTree } from '@codemirror/language'
import { EditorView } from '@codemirror/view'

// Coller du texte mis en forme (page web, réponse d'une IA, Word, Outlook) :
// le presse-papiers porte du HTML et un texte brut sans titres ni listes. Le
// HTML est alors converti en Markdown, pour garder titres, gras, listes, liens
// et tableaux. Un texte brut qui est déjà du Markdown (copié d'un éditeur de
// code, d'un fichier .md, de l'éditeur lui-même) est collé tel quel.

/** Balises qui portent une mise en forme que le texte brut perd. */
const MISE_EN_FORME = /<(h[1-6]|strong|b|em|i|ul|ol|li|table|a\s|blockquote|pre)\b/i
/** Marques de Markdown dans un texte brut : il en est déjà. */
const DEJA_MARKDOWN = /(^|\n)\s{0,3}(#{1,6} |[-*+] |\d+[.)] |> |```)|\*\*\S|\]\(/

export function convertirLeHtml(html: string, texte: string): boolean {
  return MISE_EN_FORME.test(html) && !DEJA_MARKDOWN.test(texte)
}

/** Le HTML collé en Markdown ; turndown chargé au premier collage mis en forme. */
export async function htmlEnMarkdown(html: string): Promise<string> {
  const [{ default: TurndownService }, { gfm }] = await Promise.all([import('turndown'), import('turndown-plugin-gfm')])
  const t = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*', strongDelimiter: '**' })
  t.use(gfm)
  // Restes de Word et des pages : styles, scripts, commentaires conditionnels.
  t.remove(['style', 'script', 'meta', 'title'])
  return t.turndown(html).replace(/\n{3,}/g, '\n\n').trim()
}

export const collerMisEnForme = EditorView.domEventHandlers({
  paste(e, view) {
    const html = e.clipboardData?.getData('text/html') ?? ''
    const texte = e.clipboardData?.getData('text/plain') ?? ''
    if (view.state.readOnly || !html || !convertirLeHtml(html, texte)) return false
    // Dans un bloc de code, le texte brut.
    for (let n: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(view.state).resolveInner(view.state.selection.main.from); n; n = n.parent) if (n.name === 'FencedCode') return false
    e.preventDefault()
    const { from, to } = view.state.selection.main
    void htmlEnMarkdown(html).then(
      (md) => {
        // Le texte a pu bouger pendant le chargement : on colle là où était la sélection, bornée au document.
        const fin = Math.min(to, view.state.doc.length)
        view.dispatch({ changes: { from: Math.min(from, fin), to: fin, insert: md }, selection: { anchor: Math.min(from, fin) + md.length }, userEvent: 'input.paste', scrollIntoView: true })
      },
      () => view.dispatch({ changes: { from, to, insert: texte }, userEvent: 'input.paste' }),
    )
    return true
  },
})
