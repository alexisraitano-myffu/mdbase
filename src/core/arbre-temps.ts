import type { LigneChargee } from './base'
import type { Calculs } from './calcul'
import { correspond, type Contexte } from './filtres'
import { colonne, type Schema } from './schema'
import { jourDe } from './temps'
import { PROFONDEUR_MAX, type Filtre, type Niveau, type Operateur } from './vue'

// Timeline en arbre (spec §7) : sous chaque ligne, les lignes liées par les
// relations cochées, niveau par niveau (un projet, ses versions, leurs jalons).

/** Opérateurs qui se suffisent : les autres attendent une valeur. */
const SANS_VALEUR: readonly Operateur[] = ['vide', 'non_vide', 'aujourdhui', 'cette_semaine', 'ce_mois']

/** Un filtre en cours de saisie (valeur pas encore tapée) ne filtre rien. */
const complet = (f: Filtre) => SANS_VALEUR.includes(f.operateur) || (f.valeur !== undefined && f.valeur !== '' && !(Array.isArray(f.valeur) && f.valeur.length === 0))

/** Ce qu'il faut de l'espace pour descendre les relations. */
export type SourceArbre = {
  schemas: ReadonlyMap<string, Schema>
  lignes: ReadonlyMap<string, readonly LigneChargee[]>
  calculs: Calculs
}

/**
 * Une ligne dépliée. `cle` est le chemin depuis la racine : une ligne liée à
 * deux parents apparaît sous chacun, avec deux clés différentes.
 */
export type Noeud = {
  cle: string
  base: string
  ligne: LigneChargee
  niveau: Niveau
  /** 1 pour les enfants directs d'une ligne de la vue. */
  profondeur: number
  enfants: Noeud[]
}

/** Ligne avec ses colonnes calculées : relations côté miroir, rollups, formules (pour lire les liens et filtrer). */
export function avecCalculs(src: SourceArbre, base: string, ligne: LigneChargee): LigneChargee {
  const c = src.calculs.get(base)?.get(ligne.id)
  return c ? { ...ligne, cellules: { ...ligne.cellules, ...c } } : ligne
}

/**
 * Enfants d'une ligne (déjà munie de ses calculs) pour les niveaux donnés :
 * dans l'ordre des niveaux, puis par date de début (sans date à la fin). Une
 * ligne déjà présente sur le chemin n'est pas redescendue (boucle de relations).
 */
export function enfantsDe(
  src: SourceArbre,
  base: string,
  ligne: LigneChargee,
  niveaux: readonly Niveau[],
  ctx: Contexte,
  cleParent: string,
  profondeur = 1,
): Noeud[] {
  if (profondeur > PROFONDEUR_MAX) return []
  const schema = src.schemas.get(base)
  if (!schema) return []
  return niveaux.flatMap((niveau) => {
    const rel = colonne(schema, niveau.relation)
    if (rel?.type !== 'relation') return []
    const schemaCible = src.schemas.get(rel.cible)
    if (!schemaCible) return []
    const cellule = ligne.cellules[rel.cle]
    const ids = new Set(cellule?.etat === 'ok' && Array.isArray(cellule.valeur) ? cellule.valeur : [])
    const filtres = niveau.filtres.filter(complet)
    const debut = niveau.champDebut ? colonne(schemaCible, niveau.champDebut) : undefined
    const date = (l: LigneChargee) => {
      const c = debut && l.cellules[debut.cle]
      return (c?.etat === 'ok' && jourDe(c.valeur)) || '\uffff' // sans date : à la fin
    }
    return (src.lignes.get(rel.cible) ?? [])
      .filter((l) => ids.has(l.id))
      .map((l) => avecCalculs(src, rel.cible, l))
      .filter((l) => filtres.every((f) => correspond(l, schemaCible, f, ctx)))
      .sort((a, b) => date(a).localeCompare(date(b)))
      .flatMap((l): Noeud[] => {
        const cle = `${cleParent}/${rel.cible}:${l.id}`
        if (cleParent.split('/').includes(`${rel.cible}:${l.id}`)) return []
        return [{ cle, base: rel.cible, ligne: l, niveau, profondeur, enfants: enfantsDe(src, rel.cible, l, niveau.deplier, ctx, cle, profondeur + 1) }]
      })
  })
}

/** Tous les descendants d'une liste de nœuds, en profondeur d'abord. */
export function descendants(noeuds: readonly Noeud[]): Noeud[] {
  return noeuds.flatMap((n) => [n, ...descendants(n.enfants)])
}
