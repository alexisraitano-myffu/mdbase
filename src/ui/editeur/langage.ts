import { markdownKeymap, markdownLanguage, pasteURLAsLink } from '@codemirror/lang-markdown'
import { foldNodeProp, foldService, Language, LanguageSupport, syntaxTree } from '@codemirror/language'
import { Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import type { MarkdownParser } from '@lezer/markdown'

// Markdown (GFM) assemblé à la main plutôt que par `markdown()` : celle-ci
// embarque la coloration du HTML, du CSS et du JavaScript (un tiers du poids
// de l'éditeur) pour du HTML glissé dans le texte, qu'on n'utilise pas.

const niveauTitre = (n: SyntaxNode) => {
  const m = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name)
  return m ? Number(m[1]) : null
}

/** Un titre se replie jusqu'au titre suivant de même niveau ou plus haut (comme le fait `markdown()`). */
const sections = foldService.of((state, debut, fin) => {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(fin, -1); n; n = n.parent) {
    if (n.from < debut) break
    const niveau = niveauTitre(n)
    if (niveau === null) continue
    let dernier = n
    for (let suivant = dernier.nextSibling; suivant; suivant = dernier.nextSibling) {
      const autre = niveauTitre(suivant)
      if (autre !== null && autre <= niveau) break
      dernier = suivant
    }
    if (dernier.to > fin) return { from: fin, to: dernier.to }
  }
  return null
})

/**
 * Seuls les titres se replient : la grammaire de CodeMirror rend repliable tout bloc de plusieurs
 * lignes (paragraphe, citation, code, tableau), ce qui mettait un chevron presque partout. Même
 * facette de données que `markdownLanguage`, pour que ses commandes (`markdownKeymap`) s'y reconnaissent.
 */
const markdownSansRepliDesBlocs = new Language(
  markdownLanguage.data,
  (markdownLanguage.parser as MarkdownParser).configure({ props: [foldNodeProp.add((type) => (type.is('Block') && !type.is('Document') ? () => null : undefined))] }),
  [],
  'markdown',
)

export const langageMarkdown = new LanguageSupport(markdownSansRepliDesBlocs, [sections, pasteURLAsLink, Prec.high(keymap.of(markdownKeymap))])
