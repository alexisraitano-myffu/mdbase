import { useCallback, useState, type PointerEvent } from 'react'

// Largeur d'un panneau ouvert à droite (page d'une ligne, assistant IA) :
// préférence d'affichage propre à ce navigateur, gardée dans localStorage
// (jamais dans les fichiers de l'espace).

const MIN = 320

const borner = (n: number) => Math.round(Math.max(MIN, Math.min(n, window.innerWidth * 0.75)))

function lire(cle: string, defaut: number): number {
  try {
    const v = Number(localStorage.getItem(cle))
    return v >= MIN ? v : defaut
  } catch {
    return defaut
  }
}

/** Largeur courante et gestionnaire de la poignée (tirer vers la gauche élargit). */
export function useLargeurPanneau(cle = 'mdbase.largeurPage', defaut = 520): [number, (e: PointerEvent) => void] {
  const [largeur, setLargeur] = useState(() => lire(cle, defaut))
  const saisir = useCallback(
    (e: PointerEvent) => {
      e.preventDefault()
      const depart = e.clientX
      const initiale = largeur
      let courante = initiale
      const bouger = (m: globalThis.PointerEvent) => {
        courante = borner(initiale + depart - m.clientX)
        setLargeur(courante)
      }
      const lacher = () => {
        document.removeEventListener('pointermove', bouger)
        document.removeEventListener('pointerup', lacher)
        document.body.classList.remove('redimensionnement')
        try {
          localStorage.setItem(cle, String(courante))
        } catch {
          // Stockage indisponible (navigation privée…) : la largeur vaut pour la session.
        }
      }
      document.body.classList.add('redimensionnement')
      document.addEventListener('pointermove', bouger)
      document.addEventListener('pointerup', lacher)
    },
    [largeur, cle],
  )
  return [largeur, saisir]
}
