import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const MARGE = 8

/**
 * Panneaux ouverts, du plus ancien au plus récent. Un menu peut s'ouvrir dans
 * un panneau (une liste de choix dans « Filtrer ») : cliquer dans le menu ne
 * ferme pas le panneau, et Échap ne ferme que le dernier ouvert.
 */
const pile: HTMLElement[] = []

/** Vrai quand un panneau flottant est ouvert (Échap lui revient, pas à la fenêtre dessous). */
export const flottantOuvert = () => pile.length > 0

/**
 * Panneau flottant sous une ancre, fermé par un clic extérieur ou Échap.
 * Rendu dans `document.body` : les lignes du tableau sont positionnées par
 * `transform`, ce qui piégerait un `position: fixed` à l'intérieur.
 * Toujours gardé dans la fenêtre : aligné à droite de l'ancre s'il déborde à
 * droite, ouvert au-dessus s'il déborde en bas, repositionné quand il grandit.
 */
export function Flottant(p: {
  ancre: HTMLElement | null
  fermer: () => void
  children: ReactNode
  /** Un clic extérieur ne ferme pas (saisie longue, ex. formule) ; Échap ferme toujours. */
  garderOuvert?: boolean
}) {
  const panneau = useRef<HTMLDivElement>(null)
  const { fermer, ancre, garderOuvert } = p

  useEffect(() => {
    const el = panneau.current
    if (el) pile.push(el)
    // Ce panneau et ceux ouverts depuis lui (plus haut dans la pile).
    const dedans = (cible: Node) => el !== null && pile.slice(pile.indexOf(el)).some((x) => x.contains(cible))
    const clic = (e: MouseEvent) => {
      if (!garderOuvert && !dedans(e.target as Node)) fermer()
    }
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pile.at(-1) !== el) return
      e.preventDefault()
      fermer()
    }
    document.addEventListener('mousedown', clic)
    document.addEventListener('keydown', touche)
    return () => {
      if (el) pile.splice(pile.indexOf(el), 1)
      document.removeEventListener('mousedown', clic)
      document.removeEventListener('keydown', touche)
    }
  }, [fermer, garderOuvert])

  useLayoutEffect(() => {
    const el = panneau.current
    if (!el) return
    const placer = () => {
      const r = ancre?.getBoundingClientRect() ?? new DOMRect(MARGE, MARGE, 0, 0)
      const largeurFenetre = document.documentElement.clientWidth
      const hauteurFenetre = window.innerHeight
      el.style.maxHeight = `${hauteurFenetre - 2 * MARGE}px`
      el.style.maxWidth = `${largeurFenetre - 2 * MARGE}px`
      // Tailles hors transform : l'apparition part d'une échelle réduite.
      const width = el.offsetWidth
      const height = el.offsetHeight

      let gauche = r.left
      if (gauche + width > largeurFenetre - MARGE) gauche = r.right - width
      gauche = Math.max(MARGE, Math.min(gauche, largeurFenetre - width - MARGE))

      let haut = r.bottom + 2
      if (haut + height > hauteurFenetre - MARGE) {
        const auDessus = r.top - height - 2
        haut = auDessus >= MARGE ? auDessus : Math.max(MARGE, hauteurFenetre - height - MARGE)
      }
      // Le panneau grandit depuis son ancre : du haut s'il s'ouvre dessous, du bas s'il s'ouvre dessus.
      el.style.transformOrigin = `${gauche + width / 2 < r.left + r.width / 2 ? 'right' : 'left'} ${haut < r.top ? 'bottom' : 'top'}`
      el.style.left = `${gauche}px`
      el.style.top = `${haut}px`
      el.style.visibility = 'visible'
    }
    placer()
    const observateur = new ResizeObserver(placer)
    observateur.observe(el)
    window.addEventListener('resize', placer)
    return () => {
      observateur.disconnect()
      window.removeEventListener('resize', placer)
    }
  }, [ancre])

  return createPortal(
    <div
      ref={panneau}
      className="flottant"
      // Caché jusqu'au premier placement, pour ne pas clignoter hors de l'écran.
      style={{ visibility: 'hidden', minWidth: ancre?.getBoundingClientRect().width ?? 180 }}
      onClick={(e) => e.stopPropagation()}
    >
      {p.children}
    </div>,
    document.body,
  )
}
