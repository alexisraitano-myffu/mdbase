import type { PointerEvent as PointerReact } from 'react'

type Suivi = {
  /** Pendant le glisser, une fois le seuil franchi : déplacement depuis le départ. */
  bouger: (dx: number, e: PointerEvent) => void
  finir: (dx: number, e: PointerEvent) => void
  /** Relâché sans avoir franchi le seuil : c'est un clic. */
  cliquer?: () => void
  annuler: () => void
}

const SEUIL = 4

/**
 * Glisser à la souris des vues temporelles, sur les événements pointeur :
 * sous quelques pixels, c'est un clic (ouvrir la ligne) ; au-delà, un geste.
 * Échap annule le geste en cours.
 */
export function glisser(depart: PointerReact, suivi: Suivi) {
  if (depart.button !== 0) return
  depart.stopPropagation()
  const x0 = depart.clientX
  const y0 = depart.clientY
  let actif = false
  const bouger = (e: PointerEvent) => {
    if (!actif && Math.hypot(e.clientX - x0, e.clientY - y0) < SEUIL) return
    actif = true
    suivi.bouger(e.clientX - x0, e)
  }
  const fin = () => {
    window.removeEventListener('pointermove', bouger)
    window.removeEventListener('pointerup', relacher)
    window.removeEventListener('pointercancel', abandon)
    window.removeEventListener('keydown', echap)
    document.body.classList.remove('en-glisser')
  }
  const relacher = (e: PointerEvent) => {
    fin()
    if (actif) suivi.finir(e.clientX - x0, e)
    else suivi.cliquer?.()
  }
  const abandon = () => {
    fin()
    suivi.annuler()
  }
  const echap = (e: KeyboardEvent) => {
    if (e.key === 'Escape') abandon()
  }
  window.addEventListener('pointermove', bouger)
  window.addEventListener('pointerup', relacher)
  window.addEventListener('pointercancel', abandon)
  window.addEventListener('keydown', echap)
  document.body.classList.add('en-glisser')
}
