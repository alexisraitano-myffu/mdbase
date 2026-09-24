import { createContext, useContext } from 'react'
import type { DepotEspace, EtatEspace } from '../core/depot-espace'

// L'espace ouvert, accessible aux composants profonds (cellules de relation,
// filtres) sans le faire passer de composant en composant.

export const ContexteEspace = createContext<{ espace: DepotEspace; etat: EtatEspace } | null>(null)

export function useEspace() {
  const c = useContext(ContexteEspace)
  if (!c) throw new Error('useEspace hors d’un espace ouvert')
  return c
}

/** Titre d'une ligne d'une base, ou `null` si l'id ne correspond à aucune ligne (lien cassé). */
export function titreDe(etat: EtatEspace, base: string, id: string): string | null {
  const t = etat.titres.get(base)?.get(id)
  return t === undefined ? null : t || 'Sans titre'
}
