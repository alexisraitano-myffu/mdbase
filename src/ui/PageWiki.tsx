import { FileText } from 'lucide-react'
import { comparerPages } from '../core/wiki'
import { useEspace } from './contexte-espace'
import { Icone } from './icones'
import { ContenuMarkdown } from './Markdown'

// Page du wiki ouverte dans la zone principale (spec §22) : son titre, son
// corps, et ses sous-pages, puisqu'une page qui en a sert aussi de dossier.

export function VuePageWiki(p: { id: string; ouvrir: (id: string) => void }) {
  const { etat } = useEspace()
  const { pages } = etat.wiki
  const page = pages.find((x) => x.id === p.id)
  if (!page) return <p className="discret">Cette page n’existe plus.</p>
  const sousPages = pages.filter((x) => x.parent === page.id).sort(comparerPages)
  const vide = page.corps.trim() === ''
  return (
    <article className="page-wiki">
      <h1>{page.titre || 'Sans titre'}</h1>
      {!vide && <ContenuMarkdown texte={page.corps} />}
      {sousPages.length > 0 && (
        <ul className="sous-pages-wiki" aria-label="Sous-pages">
          {sousPages.map((x) => (
            <li key={x.id}>
              <button className="discret" onClick={() => p.ouvrir(x.id)}>
                <Icone de={FileText} />
                {x.titre || 'Sans titre'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {vide && sousPages.length === 0 && <p className="discret">Page vide.</p>}
    </article>
  )
}
