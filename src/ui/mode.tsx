import { createContext, useCallback, useContext, useState } from 'react'
import { BookOpen, PenLine } from 'lucide-react'
import { Icone } from './icones'

// Mode consultation (spec §7) : l'espace en lecture seule, sans outils, pour
// regarder ses données. Réglage du navigateur, jamais écrit dans l'espace.

const CLE = 'mdbase.mode'

export const ContexteMode = createContext(false)

/** Vrai en mode consultation : rien ne se modifie, les outils disparaissent. */
export function useConsultation(): boolean {
  return useContext(ContexteMode)
}

/** Mode gardé d'une visite à l'autre (localStorage, sans échec si indisponible). */
export function useModeMemorise(): [boolean, () => void] {
  const [consultation, setConsultation] = useState(() => {
    try {
      return localStorage.getItem(CLE) === 'consultation'
    } catch {
      return false
    }
  })
  const basculer = useCallback(() => {
    setConsultation((avant) => {
      const suivant = !avant
      try {
        localStorage.setItem(CLE, suivant ? 'consultation' : 'edition')
      } catch {
        // Stockage indisponible : le mode vaut pour cette visite seulement.
      }
      return suivant
    })
  }, [])
  return [consultation, basculer]
}

/** L’icône de bascule en haut à droite de la zone principale ; comme Obsidian, elle montre le mode où elle mène. */
export function BasculeMode({ consultation, basculer }: { consultation: boolean; basculer: () => void }) {
  const titre = consultation ? 'Passer en édition (Ctrl+E)' : 'Passer en consultation (Ctrl+E)'
  return (
    <button className="discret bascule-mode" onClick={basculer} title={titre} aria-label={titre} aria-pressed={consultation}>
      <Icone de={consultation ? PenLine : BookOpen} taille={17} />
    </button>
  )
}
