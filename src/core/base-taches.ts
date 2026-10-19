import type { LigneChargee } from './base'
import type { DepotBase } from './depot-base'
import type { EtatEspace } from './depot-espace'
import type { ConfigTaches } from './espace-config'
import { colonne as colonneDe, type Colonne, type ColonneRelation } from './schema'
import type { Valeur } from './valeurs'

// Base des tâches (spec §9 « Base des tâches ») : une base de l'espace dont
// chaque ligne est une tâche. La clé `taches` de `_espace.yaml` la désigne ;
// on la résout ici contre les schémas, et tout ce qui ne colle pas est dit.

export type BaseTaches = {
  base: string
  depot: DepotBase
  fait: Colonne & { type: 'checkbox' | 'select' }
  /** Options d'un choix qui comptent comme faites (vide pour une case). */
  terminees: string[]
  echeance?: Colonne
}

export type ResolutionTaches = { ok: true; taches: BaseTaches } | { ok: false; erreur: string }

/** La base des tâches désignée, `null` s'il n'y en a pas, ou ce qui l'empêche de servir. */
export function resoudreBaseTaches(etat: Pick<EtatEspace, 'bases'>, config: ConfigTaches | undefined): ResolutionTaches | null {
  if (!config) return null
  const depot = etat.bases.get(config.base)?.depot
  if (!depot) return { ok: false, erreur: `Base des tâches introuvable : ${config.base}` }
  const fait = colonneDe(depot.schema, config.fait)
  if (!fait || (fait.type !== 'checkbox' && fait.type !== 'select')) return { ok: false, erreur: `La colonne « ${config.fait} » doit être une case à cocher ou un choix` }
  let terminees: string[] = []
  if (fait.type === 'select') {
    const labels = fait.options.map((o) => o.label)
    terminees = (config.terminees ?? []).filter((t) => labels.includes(t))
    if (terminees.length === 0 && labels.length > 0) terminees = [labels.at(-1)!]
    if (terminees.length === 0) return { ok: false, erreur: `Le choix « ${fait.nom} » n'a aucune option` }
  }
  const echeance = config.echeance ? colonneDe(depot.schema, config.echeance) : undefined
  if (config.echeance && echeance?.type !== 'date') return { ok: false, erreur: `La colonne « ${config.echeance} » doit être une date` }
  return { ok: true, taches: { base: config.base, depot, fait: fait as BaseTaches['fait'], terminees, ...(echeance && { echeance }) } }
}

const valeurDe = (l: LigneChargee, cle: string): Valeur | undefined => {
  const c = l.cellules[cle]
  return c?.etat === 'ok' ? c.valeur : undefined
}

export function estFaite(t: BaseTaches, l: LigneChargee): boolean {
  const v = valeurDe(l, t.fait.cle)
  return t.fait.type === 'checkbox' ? v === true : typeof v === 'string' && t.terminees.includes(v)
}

/**
 * Valeur à écrire pour cocher ou décocher : la case, ou la première option
 * terminée ; décocher un choix écrit la première option qui ne l'est pas (vide sinon).
 */
export function valeurFait(t: BaseTaches, faite: boolean): Valeur | undefined {
  if (t.fait.type === 'checkbox') return faite || undefined
  if (faite) return t.terminees[0]
  return t.fait.options.find((o) => !t.terminees.includes(o.label))?.label
}

/** Échéance `AAAA-MM-JJ` d'une tâche, s'il y en a une. */
export function echeanceDe(t: BaseTaches, l: LigneChargee): string | null {
  const v = t.echeance ? valeurDe(l, t.echeance.cle) : undefined
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
}

/** Par échéance (la plus proche d'abord), puis celles sans échéance, dans l'ordre reçu. */
export function trierTaches(t: BaseTaches, lignes: readonly LigneChargee[]): LigneChargee[] {
  return lignes
    .map((l, i) => ({ l, i, e: echeanceDe(t, l) }))
    .sort((a, b) => (a.e === b.e ? a.i - b.i : a.e === null ? 1 : b.e === null ? -1 : a.e < b.e ? -1 : 1))
    .map((x) => x.l)
}

/** Les lignes de la base des tâches, avec leurs colonnes calculées (relations non propriétaires). */
export function lignesTaches(etat: Pick<EtatEspace, 'calculs'>, t: BaseTaches): LigneChargee[] {
  const calculs = etat.calculs.get(t.base)
  return t.depot.lignes().map((l) => {
    const c = calculs?.get(l.id)
    return c ? { ...l, cellules: { ...l.cellules, ...c } } : l
  })
}

/** La relation de la base des tâches vers `base` (la première, s'il y en a plusieurs). */
export function relationVers(t: BaseTaches, base: string): ColonneRelation | undefined {
  if (base === t.base) return undefined
  return t.depot.schema.colonnes.find((c): c is ColonneRelation => c.type === 'relation' && c.cible === base)
}

/** Tâches de la base des tâches liées à une ligne d'une autre base, triées ; `null` sans relation vers cette base. */
export function tachesLiees(etat: Pick<EtatEspace, 'calculs'>, t: BaseTaches, base: string, idLigne: string): { relation: ColonneRelation; lignes: LigneChargee[] } | null {
  const relation = relationVers(t, base)
  if (!relation) return null
  const lignes = lignesTaches(etat, t).filter((l) => {
    const v = valeurDe(l, relation.cle)
    return Array.isArray(v) ? v.map(String).includes(idLigne) : v === idLigne
  })
  return { relation, lignes: trierTaches(t, lignes) }
}
