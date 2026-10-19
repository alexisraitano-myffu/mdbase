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
  /** Auto-relation, côté qui liste les sous-tâches d'une tâche. */
  sousTaches?: ColonneRelation
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
  const sousTaches = config.sous_taches ? colonneDe(depot.schema, config.sous_taches) : undefined
  if (config.sous_taches && (sousTaches?.type !== 'relation' || sousTaches.cible !== config.base)) return { ok: false, erreur: `La colonne « ${config.sous_taches} » doit être une relation de la base vers elle-même` }
  return {
    ok: true,
    taches: { base: config.base, depot, fait: fait as BaseTaches['fait'], terminees, ...(echeance && { echeance }), ...(sousTaches?.type === 'relation' && { sousTaches }) },
  }
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

/**
 * Tâches liées à une ligne, triées, avec la relation qu'une tâche créée là
 * reçoit : d'une autre base, celles liées par la relation vers elle ; de la
 * base des tâches, ses sous-tâches (relation vers la tâche parente). `null`
 * sans relation.
 */
export function tachesLiees(etat: Pick<EtatEspace, 'calculs'>, t: BaseTaches, base: string, idLigne: string): { relation: ColonneRelation; lignes: LigneChargee[] } | null {
  if (base === t.base) {
    const parente = t.sousTaches && colonneDe(t.depot.schema, t.sousTaches.inverse)
    if (parente?.type !== 'relation') return null
    const toutes = lignesTaches(etat, t)
    const ligne = toutes.find((l) => l.id === idLigne)
    return { relation: parente, lignes: ligne ? sousTachesDe(t, new Map(toutes.map((l) => [l.id, l])), ligne).filter((l) => l.id !== idLigne) : [] }
  }
  const relation = relationVers(t, base)
  if (!relation) return null
  const lignes = lignesTaches(etat, t).filter((l) => {
    const v = valeurDe(l, relation.cle)
    return Array.isArray(v) ? v.map(String).includes(idLigne) : v === idLigne
  })
  return { relation, lignes: trierTaches(t, lignes) }
}

// ── Sous-tâches ──────────────────────────────────────────────────

export type NoeudTache = { ligne: LigneChargee; enfants: NoeudTache[] }

const idsDe = (l: LigneChargee, cle: string): string[] => {
  const v = valeurDe(l, cle)
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v !== '' ? [v] : []
}

/** Sous-tâches directes d'une tâche, triées ; rien sans auto-relation. */
export function sousTachesDe(t: BaseTaches, parId: ReadonlyMap<string, LigneChargee>, l: LigneChargee): LigneChargee[] {
  if (!t.sousTaches) return []
  return trierTaches(t, idsDe(l, t.sousTaches.cle).flatMap((id) => parId.get(id) ?? []))
}

/** Les tâches de `lignes` qui ne sont sous-tâche d'aucune autre de `lignes`. */
export function racinesParmi(t: BaseTaches, lignes: readonly LigneChargee[]): LigneChargee[] {
  if (!t.sousTaches) return [...lignes]
  const presentes = new Set(lignes.map((l) => l.id))
  const enfants = new Set(lignes.flatMap((l) => idsDe(l, t.sousTaches!.cle).filter((id) => id !== l.id && presentes.has(id))))
  return lignes.filter((l) => !enfants.has(l.id))
}

/**
 * Arbre des tâches sous `racines` : chaque tâche avec ses sous-tâches, à toute
 * profondeur ; une tâche déjà sur le chemin n'est pas redescendue (boucle).
 * `toutes` sert à retrouver les sous-tâches (lignes enrichies de la base).
 */
export function arbreTaches(t: BaseTaches, toutes: readonly LigneChargee[], racines: readonly LigneChargee[]): NoeudTache[] {
  const parId = new Map(toutes.map((l) => [l.id, l]))
  const noeud = (l: LigneChargee, chemin: ReadonlySet<string>): NoeudTache => {
    const suite = new Set([...chemin, l.id])
    return { ligne: l, enfants: sousTachesDe(t, parId, l).filter((e) => !suite.has(e.id)).map((e) => noeud(e, suite)) }
  }
  return racines.map((l) => noeud(l, new Set()))
}

/**
 * Arbre de toute la base : les tâches sans parent, puis, pour une boucle sans
 * entrée (A sous B, B sous A), sa première tâche, pour qu'aucune ne disparaisse.
 */
export function arbreComplet(t: BaseTaches, lignes: readonly LigneChargee[]): NoeudTache[] {
  const triees = trierTaches(t, lignes)
  const arbre = arbreTaches(t, lignes, racinesParmi(t, triees))
  const vues = new Set(idsArbre(arbre))
  for (const l of triees) {
    if (vues.has(l.id)) continue
    const [n] = arbreTaches(t, lignes, [l])
    arbre.push(n!)
    for (const id of idsArbre([n!])) vues.add(id)
  }
  return arbre
}

/** Ids des tâches d'un arbre, chacune une fois (une tâche à deux parents y figure deux fois). */
export function idsArbre(noeuds: readonly NoeudTache[]): string[] {
  const ids = new Set<string>()
  const parcourir = (n: NoeudTache) => {
    ids.add(n.ligne.id)
    n.enfants.forEach(parcourir)
  }
  noeuds.forEach(parcourir)
  return [...ids]
}

/**
 * Garde d'un arbre ce qui passe le filtre : une tâche gardée par `garde` et
 * trouvée (par `trouve`, ou parce qu'un parent l'est), ou dont une sous-tâche
 * reste ; une tâche faite reste ainsi tant qu'une sous-tâche est à faire, et
 * la recherche garde les parents d'une sous-tâche trouvée.
 */
export function filtrerArbre(noeuds: readonly NoeudTache[], garde: (l: LigneChargee) => boolean, trouve: (l: LigneChargee) => boolean, parentTrouve = false): NoeudTache[] {
  return noeuds.flatMap((n) => {
    const ici = parentTrouve || trouve(n.ligne)
    const enfants = filtrerArbre(n.enfants, garde, trouve, ici)
    return (garde(n.ligne) && ici) || enfants.length > 0 ? [{ ligne: n.ligne, enfants }] : []
  })
}
