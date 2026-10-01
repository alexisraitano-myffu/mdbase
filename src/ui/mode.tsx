import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Schema } from '../core/schema'
import { BookOpen, Maximize2, Minimize2, PenLine } from 'lucide-react'
import { Icone } from './icones'

// Mode consultation (spec §7) : l'espace en lecture seule, sans outils, pour
// regarder ses données. Réglage du navigateur, jamais écrit dans l'espace.

const CLE = 'mdbase.mode'

export const ContexteMode = createContext(false)

/** Données d'une base synchronisée (`source`, spec §16) : figées comme en consultation, sans toucher au reste. */
const ContexteFige = createContext(false)

/**
 * Vrai en mode consultation, ou dans les données d'une base synchronisée :
 * rien ne se modifie, les outils disparaissent.
 */
export function useConsultation(): boolean {
  const consultation = useContext(ContexteMode)
  const fige = useContext(ContexteFige)
  return consultation || fige
}

/** Vrai en mode consultation seulement : les réglages de vue d'une base synchronisée restent permis. */
export function useModeConsultation(): boolean {
  return useContext(ContexteMode)
}

/**
 * Enveloppe les données d'une base : figées si elle est synchronisée. Remplace
 * le réglage du dessus, pour qu'une base libre affichée dans une page Jira
 * (onglet relation, contenus) reste modifiable.
 */
export function DonneesDe({ schema, children }: { schema: Schema | undefined; children: ReactNode }) {
  return <ContexteFige.Provider value={!!schema?.source}>{children}</ContexteFige.Provider>
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

/**
 * Plein écran : la vue seule, sans barre latérale ni titre, et l'écran entier
 * quand le navigateur l'accepte. Quitter le plein écran du navigateur (Échap)
 * quitte aussi celui de l'app. Réglage de la visite, jamais mémorisé.
 */
export function usePleinEcran(): [boolean, () => void] {
  const [actif, setActif] = useState(false)
  useEffect(() => {
    const suivre = () => {
      if (!document.fullscreenElement) setActif(false)
    }
    document.addEventListener('fullscreenchange', suivre)
    return () => document.removeEventListener('fullscreenchange', suivre)
  }, [])
  const basculer = useCallback(() => {
    setActif((avant) => {
      const suivant = !avant
      // Refusé (réglage du navigateur, iframe) : l'app passe quand même en plein écran dans la fenêtre.
      if (suivant && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
      if (!suivant && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      return suivant
    })
  }, [])
  return [actif, basculer]
}

export function BasculePleinEcran({ actif, basculer }: { actif: boolean; basculer: () => void }) {
  const titre = actif ? 'Quitter le plein écran' : 'Plein écran'
  return (
    <button className="discret bascule-mode" onClick={basculer} title={titre} aria-label={titre} aria-pressed={actif}>
      <Icone de={actif ? Minimize2 : Maximize2} taille={16} />
    </button>
  )
}
