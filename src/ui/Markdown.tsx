import { useMemo, type ReactNode } from 'react'
import { lireMarkdown, type BlocMd, type Enligne } from '../core/markdown-leger'

// Affichage du Markdown des réponses de l'assistant (spec §12) : des éléments
// React construits depuis la structure lue par le cœur, jamais de HTML injecté.

function enligne(e: Enligne, cle: number): ReactNode {
  switch (e.type) {
    case 'texte':
      return e.texte
    case 'code':
      return <code key={cle}>{e.texte}</code>
    case 'gras':
      return <strong key={cle}>{e.enfants.map(enligne)}</strong>
    case 'italique':
      return <em key={cle}>{e.enfants.map(enligne)}</em>
    case 'barre':
      return <del key={cle}>{e.enfants.map(enligne)}</del>
    case 'lien':
      return (
        <a key={cle} href={e.adresse} target="_blank" rel="noopener noreferrer">
          {e.enfants.map(enligne)}
        </a>
      )
  }
}

function bloc(b: BlocMd, cle: number): ReactNode {
  switch (b.type) {
    case 'paragraphe':
      return <p key={cle}>{b.enfants.map(enligne)}</p>
    case 'titre': {
      // Dans une bulle, un titre reste modeste : h3 à h6 seulement.
      const Titre = `h${Math.min(6, b.niveau + 2)}` as 'h3'
      return <Titre key={cle}>{b.enfants.map(enligne)}</Titre>
    }
    case 'liste': {
      const elements = b.elements.map((e, i) => <li key={i}>{e.map(enligne)}</li>)
      return b.ordonnee ? (
        <ol key={cle} start={b.debut}>
          {elements}
        </ol>
      ) : (
        <ul key={cle}>{elements}</ul>
      )
    }
    case 'code':
      return (
        <pre key={cle}>
          <code>{b.texte}</code>
        </pre>
      )
    case 'citation':
      return <blockquote key={cle}>{b.enfants.map(enligne)}</blockquote>
    case 'separateur':
      return <hr key={cle} />
    case 'tableau':
      return (
        <div key={cle} className="tableau-md">
          <table>
            <thead>
              <tr>
                {b.entetes.map((c, i) => (
                  <th key={i}>{c.map(enligne)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.lignes.map((l, i) => (
                <tr key={i}>
                  {l.map((c, j) => (
                    <td key={j}>{c.map(enligne)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

export function ContenuMarkdown({ texte, className }: { texte: string; className?: string }) {
  const blocs = useMemo(() => lireMarkdown(texte), [texte])
  return <div className={`markdown-ia ${className ?? ''}`}>{blocs.map(bloc)}</div>
}
