import { useEffect, useState } from 'react'
import type { LigneVue } from '../core/filtres'

export type PageOuverte = { base: string; id: string }

/**
 * Page ouverte (spec §9) : panneau à droite ou plein écran, Échap pour fermer.
 * Avec `navigation`, ↑ ↓ passent à la ligne voisine de la vue.
 */
export function usePageOuverte(navigation: { base: string; lignesVue: LigneVue[] } | null) {
  const [page, setPage] = useState<PageOuverte | null>(null)
  const [pleinEcran, setPleinEcran] = useState(false)
  const fermer = () => {
    setPage(null)
    setPleinEcran(false)
  }

  useEffect(() => {
    if (!page) return
    const clavier = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement
      const enSaisie = cible.closest('input, textarea, select, [contenteditable="true"]')
      if (e.key === 'Escape') {
        if (document.querySelector('.flottant')) return // le menu ouvert se ferme d'abord
        if (enSaisie) return (cible as HTMLElement).blur()
        setPage(null)
        setPleinEcran(false)
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !enSaisie && navigation && page.base === navigation.base) {
        const i = navigation.lignesVue.findIndex((l) => l.ligne.id === page.id)
        const suivante = navigation.lignesVue[i + (e.key === 'ArrowDown' ? 1 : -1)]
        if (i >= 0 && suivante) {
          e.preventDefault()
          setPage({ base: navigation.base, id: suivante.ligne.id })
        }
      }
    }
    document.addEventListener('keydown', clavier)
    return () => document.removeEventListener('keydown', clavier)
  }, [page, navigation?.lignesVue, navigation?.base]) // `navigation` est recréé à chaque rendu : ses champs suffisent

  return { page, ouvrir: (base: string, id: string) => setPage({ base, id }), pleinEcran, basculerPleinEcran: () => setPleinEcran((p) => !p), fermer }
}
