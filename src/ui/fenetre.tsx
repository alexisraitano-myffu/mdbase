import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Icone } from './icones'
import { flottantOuvert } from './flottant'

/**
 * Fenêtre modale : fermée par Échap, la croix ou un clic sur le voile.
 * `immediate` : sans animation d'ouverture, pour une fenêtre ouverte au raccourci clavier.
 */
export function Fenetre({ titre, fermer, immediate, children }: { titre: string; fermer: () => void; immediate?: boolean; children: ReactNode }) {
  useEffect(() => {
    // Un menu ouvert dans la fenêtre prend Échap pour lui.
    const clavier = (e: KeyboardEvent) => e.key === 'Escape' && !flottantOuvert() && fermer()
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [fermer])
  return createPortal(
    <div className={`voile-fenetre ${immediate ? 'immediate' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && fermer()}>
      <div className="fenetre" role="dialog" aria-label={titre}>
        <div className="entete-fenetre">
          <h2>{titre}</h2>
          <button className="discret" onClick={fermer} aria-label="Fermer">
            <Icone de={X} />
          </button>
        </div>
        <div className="corps-fenetre">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
