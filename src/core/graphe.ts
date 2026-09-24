import { colonne as colonneDe, estObjet, estSaisie, type Colonne, type Schema } from './schema'

// Graphe de dépendances des colonnes calculées (spec §5) : relations non
// propriétaires, rollups, formules. Calcul en ordre topologique ; une
// configuration qui créerait une boucle est refusée (invariant 7).

export type Schemas = ReadonlyMap<string, Schema>

/** Identifiant d'une colonne dans l'espace : `base.cle`. */
export type Noeud = string
export const noeud = (base: string, cle: string): Noeud => `${base}.${cle}`

export function estCalculee(c: Colonne): boolean {
  return !estSaisie(c)
}

/** Clés référencées par `prop("…")` dans une expression de formule. */
export function referencesFormule(expression: string): string[] {
  return [...expression.matchAll(/prop\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]!)
}

/** Colonnes calculées dont dépend directement la colonne `c` de `base`. */
export function dependancesDirectes(schemas: Schemas, base: string, c: Colonne): Noeud[] {
  const schema = schemas.get(base)
  if (!schema) return []
  const siCalculee = (b: string, cle: string): Noeud[] => {
    const cc = schemas.get(b) && colonneDe(schemas.get(b)!, cle)
    return cc && estCalculee(cc) ? [noeud(b, cle)] : []
  }
  switch (c.type) {
    case 'rollup': {
      const relation = colonneDe(schema, c.relation)
      if (relation?.type !== 'relation') return []
      const filtre = estObjet(c.filtre) && typeof c.filtre.colonne === 'string' ? c.filtre.colonne : null
      return [
        ...siCalculee(base, relation.cle),
        ...siCalculee(relation.cible, c.champ),
        ...(filtre && filtre !== c.champ ? siCalculee(relation.cible, filtre) : []),
      ]
    }
    case 'formula':
      return referencesFormule(c.expression).flatMap((cle) => siCalculee(base, cle))
    default:
      // Une relation non propriétaire lit les ids stockés de l'autre côté : pas de dépendance calculée.
      return []
  }
}

export type Ordre = {
  /** Colonnes calculées, chacune après celles dont elle dépend. */
  ordre: { base: string; colonne: Colonne }[]
  /** Colonnes prises dans une boucle (ou qui en dépendent), avec la boucle à afficher. */
  enBoucle: Map<Noeud, string>
}

export function ordonner(schemas: Schemas): Ordre {
  const colonnes = new Map<Noeud, { base: string; colonne: Colonne }>()
  for (const [base, s] of schemas) for (const c of s.colonnes) if (estCalculee(c)) colonnes.set(noeud(base, c.cle), { base, colonne: c })

  const deps = new Map<Noeud, Noeud[]>()
  const restantes = new Map<Noeud, number>()
  const dependants = new Map<Noeud, Noeud[]>()
  for (const [n, { base, colonne }] of colonnes) {
    const d = dependancesDirectes(schemas, base, colonne).filter((x) => colonnes.has(x))
    deps.set(n, d)
    restantes.set(n, d.length)
    for (const x of d) dependants.set(x, [...(dependants.get(x) ?? []), n])
  }

  // Kahn : on retire au fur et à mesure les colonnes dont toutes les dépendances sont calculées.
  const pretes = [...colonnes.keys()].filter((n) => restantes.get(n) === 0)
  const ordre: Ordre['ordre'] = []
  while (pretes.length > 0) {
    const n = pretes.shift()!
    ordre.push(colonnes.get(n)!)
    for (const suivant of dependants.get(n) ?? []) {
      const r = restantes.get(suivant)! - 1
      restantes.set(suivant, r)
      if (r === 0) pretes.push(suivant)
    }
  }

  const enBoucle = new Map<Noeud, string>()
  const bloquees = [...colonnes.keys()].filter((n) => restantes.get(n)! > 0)
  if (bloquees.length > 0) {
    const message = decrireBoucle(schemas, trouverCycle(bloquees, deps) ?? bloquees)
    for (const n of bloquees) enBoucle.set(n, message)
  }
  return { ordre, enBoucle }
}

/**
 * Boucle que créerait cette configuration, décrite avec les noms des colonnes,
 * ou `null`. À appeler avant d'accepter une modification de schéma.
 */
export function boucle(schemas: Schemas): string | null {
  const { enBoucle } = ordonner(schemas)
  return enBoucle.size === 0 ? null : enBoucle.values().next().value!
}

function trouverCycle(noeuds: Noeud[], deps: Map<Noeud, Noeud[]>): Noeud[] | null {
  const dansLeGraphe = new Set(noeuds)
  const etat = new Map<Noeud, 'en_cours' | 'fini'>()
  const pile: Noeud[] = []
  const visiter = (n: Noeud): Noeud[] | null => {
    etat.set(n, 'en_cours')
    pile.push(n)
    for (const d of deps.get(n) ?? []) {
      if (!dansLeGraphe.has(d)) continue
      if (etat.get(d) === 'en_cours') return pile.slice(pile.indexOf(d))
      if (!etat.has(d)) {
        const c = visiter(d)
        if (c) return c
      }
    }
    pile.pop()
    etat.set(n, 'fini')
    return null
  }
  for (const n of noeuds) {
    if (etat.has(n)) continue
    const c = visiter(n)
    if (c) return c
  }
  return null
}

function decrireBoucle(schemas: Schemas, cycle: Noeud[]): string {
  const nom = (n: Noeud) => {
    const i = n.indexOf('.')
    const s = schemas.get(n.slice(0, i))
    const c = s && colonneDe(s, n.slice(i + 1))
    return `${s?.nom ?? n.slice(0, i)} › ${c?.nom ?? n.slice(i + 1)}`
  }
  const noms = cycle.map(nom)
  return `Boucle de dépendances : ${[...noms, noms[0]].join(' → ')}`
}
