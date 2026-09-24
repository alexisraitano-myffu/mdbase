import type { LigneChargee } from './base'
import { correspond, type Contexte } from './filtres'
import { noeud, ordonner, type Schemas } from './graphe'
import { CALCULS, colonne as colonneDe, type Calcul, estObjet, natureDe, type Colonne, type ColonneRelation, type ColonneRollup, type Schema } from './schema'
import { OPERATEURS, type Operateur } from './vue'
import type { Cellule, Valeur } from './valeurs'

// Valeurs des colonnes calculées (spec §5) : recalculées à partir des lignes,
// jamais stockées (invariant 1). Le calcul suit l'ordre topologique du graphe
// de dépendances, ce qui permet les rollups de rollups.

export type BaseACalculer = { schema: Schema; lignes: readonly LigneChargee[] }

/** Par base, par id de ligne : les cellules des colonnes calculées. */
export type Calculs = Map<string, Map<string, Record<string, Cellule>>>

const erreur = (raison: string): Cellule => ({ etat: 'invalide', brut: undefined, raison })

export function calculer(bases: ReadonlyMap<string, BaseACalculer>, ctx: Contexte): Calculs {
  const schemas: Schemas = new Map([...bases].map(([id, b]) => [id, b.schema]))
  const resultats: Calculs = new Map([...bases.keys()].map((id) => [id, new Map()]))

  // Index des lignes par id ; en cas d'id en double, la première l'emporte.
  const parId = new Map<string, Map<string, LigneChargee>>()
  for (const [id, b] of bases) {
    const m = new Map<string, LigneChargee>()
    for (const l of b.lignes) if (!m.has(l.id)) m.set(l.id, l)
    parId.set(id, m)
  }

  const poser = (base: string, id: string, cle: string, c: Cellule | undefined) => {
    if (!c) return
    const m = resultats.get(base)!
    m.set(id, { ...m.get(id), [cle]: c })
  }
  const cellule = (base: string, l: LigneChargee, cle: string): Cellule | undefined =>
    resultats.get(base)?.get(l.id)?.[cle] ?? l.cellules[cle]
  /** La ligne avec ses valeurs calculées jusqu'ici, pour évaluer un filtre de rollup. */
  const enrichie = (base: string, l: LigneChargee): LigneChargee => {
    const calcule = resultats.get(base)?.get(l.id)
    return calcule ? { ...l, cellules: { ...l.cellules, ...calcule } } : l
  }

  const { ordre, enBoucle } = ordonner(schemas)
  for (const [n, message] of enBoucle) {
    const i = n.indexOf('.')
    const base = n.slice(0, i)
    for (const l of bases.get(base)!.lignes) poser(base, l.id, n.slice(i + 1), erreur(message))
  }

  for (const { base, colonne } of ordre) {
    const lignes = bases.get(base)!.lignes
    if (enBoucle.has(noeud(base, colonne.cle))) continue
    if (colonne.type === 'relation') {
      calculerInverse(base, colonne, lignes, bases, poser)
    } else if (colonne.type === 'rollup') {
      const r = preparerRollup(schemas, base, colonne)
      for (const l of lignes) {
        if (typeof r === 'string') {
          poser(base, l.id, colonne.cle, erreur(r))
          continue
        }
        const ids = cellule(base, l, r.relation.cle)
        const liees = (ids?.etat === 'ok' && Array.isArray(ids.valeur) ? ids.valeur : [])
          .map((id) => parId.get(r.cible)!.get(id))
          .filter((x): x is LigneChargee => x !== undefined)
          .filter((x) => !r.filtre || correspond(enrichie(r.cible, x), r.schemaCible, r.filtre, ctx))
        poser(base, l.id, colonne.cle, agreger(colonne.calcul, r.champ, liees.map((x) => cellule(r.cible, x, r.champ.cle))))
      }
    }
    // Formules : jalon 10.
  }
  return resultats
}

/** Côté non propriétaire d'une relation : les lignes de la cible qui pointent vers chaque ligne. */
function calculerInverse(
  base: string,
  colonne: ColonneRelation,
  lignes: readonly LigneChargee[],
  bases: ReadonlyMap<string, BaseACalculer>,
  poser: (base: string, id: string, cle: string, c: Cellule | undefined) => void,
) {
  const cible = bases.get(colonne.cible)
  const proprietaire = cible && colonneDe(cible.schema, colonne.inverse)
  if (!cible || proprietaire?.type !== 'relation' || !proprietaire.proprietaire || proprietaire.cible !== base) {
    for (const l of lignes) poser(base, l.id, colonne.cle, erreur('Relation miroir introuvable'))
    return
  }
  const pointeurs = new Map<string, string[]>()
  for (const t of cible.lignes) {
    const c = t.cellules[proprietaire.cle]
    if (c?.etat !== 'ok' || !Array.isArray(c.valeur)) continue
    for (const id of c.valeur) pointeurs.set(id, [...(pointeurs.get(id) ?? []), t.id])
  }
  for (const l of lignes) {
    const ids = pointeurs.get(l.id)
    if (ids) poser(base, l.id, colonne.cle, { etat: 'ok', valeur: ids })
  }
}

type RollupPret = {
  relation: ColonneRelation
  cible: string
  schemaCible: Schema
  champ: Colonne
  filtre: { colonne: string; operateur: Operateur; valeur?: unknown } | null
}

function preparerRollup(schemas: Schemas, base: string, c: ColonneRollup): RollupPret | string {
  const relation = colonneDe(schemas.get(base)!, c.relation)
  if (relation?.type !== 'relation') return `Relation « ${c.relation} » supprimée`
  const schemaCible = schemas.get(relation.cible)
  if (!schemaCible) return `Base « ${relation.cible} » introuvable`
  const champ = colonneDe(schemaCible, c.champ)
  if (!champ) return `Colonne « ${c.champ} » supprimée dans ${schemaCible.nom}`
  if (!(CALCULS as readonly string[]).includes(c.calcul)) return `Calcul « ${c.calcul} » inconnu`
  let filtre: RollupPret['filtre'] = null
  if (estObjet(c.filtre)) {
    const op = String(c.filtre.operateur)
    if (!(OPERATEURS as readonly string[]).includes(op)) return `Filtre du rollup : opérateur « ${op} » inconnu`
    filtre = {
      colonne: typeof c.filtre.colonne === 'string' ? c.filtre.colonne : c.champ,
      operateur: op as Operateur,
      ...(c.filtre.valeur !== undefined && { valeur: c.filtre.valeur }),
    }
  }
  return { relation, cible: relation.cible, schemaCible, champ, filtre }
}

/** Calcul d'un rollup sur les cellules du champ remonté, une par ligne liée. */
export function agreger(calcul: string, champ: Colonne, cellules: (Cellule | undefined)[]): Cellule | undefined {
  const ok = (valeur: Valeur): Cellule => ({ etat: 'ok', valeur })
  const case_ = natureDe(champ) === 'case'
  const valeurs = cellules.flatMap((c) => (c?.etat === 'ok' ? (Array.isArray(c.valeur) ? c.valeur : [c.valeur]) : []))
  const nonVides = valeurs.filter((v) => v !== '' && !(case_ && v === false))
  const vides = cellules.filter((c) => c === undefined || (c.etat === 'ok' && (c.valeur === '' || (Array.isArray(c.valeur) && c.valeur.length === 0) || (case_ && c.valeur === false)))).length
  const nombres = valeurs.filter((v): v is number => typeof v === 'number')
  const dates = valeurs.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)).sort()
  const pourcent = (n: number) => (cellules.length === 0 ? undefined : ok(Math.round((n / cellules.length) * 10000) / 100))

  switch (calcul) {
    case 'afficher':
      return nonVides.length === 0 ? undefined : ok(nonVides.map((v) => (typeof v === 'boolean' ? (v ? '☑' : '☐') : String(v))))
    case 'compter':
      return ok(cellules.length)
    case 'compter_valeurs':
      return ok(nonVides.length)
    case 'compter_uniques':
      return ok(new Set(nonVides.map(String)).size)
    case 'compter_vides':
      return ok(vides)
    case 'compter_non_vides':
      return ok(cellules.length - vides)
    case 'pourcent_coches':
      return pourcent(valeurs.filter((v) => v === true).length)
    case 'pourcent_non_coches':
      return pourcent(cellules.length - valeurs.filter((v) => v === true).length)
    case 'somme':
      return nombres.length === 0 ? undefined : ok(nombres.reduce((a, b) => a + b, 0))
    case 'moyenne':
      return nombres.length === 0 ? undefined : ok(nombres.reduce((a, b) => a + b, 0) / nombres.length)
    case 'mediane': {
      if (nombres.length === 0) return undefined
      const t = [...nombres].sort((a, b) => a - b)
      const m = Math.floor(t.length / 2)
      return ok(t.length % 2 ? t[m]! : (t[m - 1]! + t[m]!) / 2)
    }
    case 'min':
      return nombres.length === 0 ? undefined : ok(Math.min(...nombres))
    case 'max':
      return nombres.length === 0 ? undefined : ok(Math.max(...nombres))
    case 'amplitude':
      return nombres.length === 0 ? undefined : ok(Math.max(...nombres) - Math.min(...nombres))
    case 'date_plus_tot':
      return dates.length === 0 ? undefined : ok(dates[0]!)
    case 'date_plus_tard':
      return dates.length === 0 ? undefined : ok(dates.at(-1)!)
    default:
      return erreur(`Calcul « ${calcul} » inconnu`)
  }
}

/**
 * Calculs qui ont un sens pour une colonne, selon sa nature : pour un rollup
 * (colonne remontée) comme pour le pied d'une colonne de tableau.
 */
export function calculsPour(c: Colonne): Calcul[] {
  const comptes: Calcul[] = ['afficher', 'compter', 'compter_valeurs', 'compter_uniques', 'compter_vides', 'compter_non_vides']
  switch (natureDe(c)) {
    case 'nombre':
      return [...comptes, 'somme', 'moyenne', 'mediane', 'min', 'max', 'amplitude']
    case 'case':
      return [...comptes, 'pourcent_coches', 'pourcent_non_coches']
    case 'date':
      return [...comptes, 'date_plus_tot', 'date_plus_tard']
    default:
      return comptes
  }
}
