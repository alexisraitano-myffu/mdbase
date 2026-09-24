import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Panneau flottant sous une ancre, fermé par un clic extérieur ou Échap.
 * Rendu dans `document.body` : les lignes du tableau sont positionnées par
 * `transform`, ce qui piégerait un `position: fixed` à l'intérieur.
 */
export function Flottant(p: { ancre: HTMLElement | null; fermer: () => void; children: ReactNode }) {
  const panneau = useRef<HTMLDivElement>(null)
  const { fermer } = p
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      if (!panneau.current?.contains(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', touche)
    return () => {
      document.removeEventListener('mousedown', clic)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer])
  const r = p.ancre?.getBoundingClientRect()
  return createPortal(
    <div
      ref={panneau}
      className="flottant"
      style={{ top: (r?.bottom ?? 0) + 2, left: r?.left ?? 0, minWidth: r?.width ?? 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {p.children}
    </div>,
    document.body,
  )
}
