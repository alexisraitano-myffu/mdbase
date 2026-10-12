import { avecCalculs, type SourceArbre } from '../arbre-temps'
import type { EtatEspace } from '../depot-espace'
import { natureDe, type Colonne } from '../schema'
import type { Cellule } from '../valeurs'
import { identifiant, litteral, litteralDate } from './sql'

// Tables SQL de l'analyse (spec §10 « Analyse ») : une par base, une colonne
// par clé, colonnes calculées comprises, plus `id`, `_cree` et `_modifie`.

export type TypeSql = 'VARCHAR' | 'DOUBLE' | 'BOOLEAN' | 'DATE' | 'TIMESTAMP' | 'VARCHAR[]'
export type ColonneSql = { nom: string; type: TypeSql }
export type TableSql = { nom: string; colonnes: ColonneSql[]; lignes: unknown[][] }

/** Schémas, lignes et calculs de toutes les bases lues de l'espace. */
export function sourceDe(etat: EtatEspace): SourceArbre {
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot ? [{ id: b.id, depot: b.depot }] : []))
  return {
    schemas: new Map(bases.map((b) => [b.id, b.depot.schema])),
    lignes: new Map(bases.map((b) => [b.id, b.depot.lignes()])),
    calculs: etat.calculs,
  }
}

/** Lignes par instruction `INSERT` : de quoi garder des textes de taille raisonnable. */
const PAQUET = 500

function typeDe(c: Colonne, cellules: (Cellule | undefined)[]): TypeSql {
  switch (natureDe(c)) {
    case 'nombre':
      return 'DOUBLE'
    case 'case':
      return 'BOOLEAN'
    case 'liste':
      return 'VARCHAR[]'
    case 'date':
      if (c.type === 'created' || c.type === 'modified') return 'TIMESTAMP'
      return cellules.some((x) => x?.etat === 'ok' && typeof x.valeur === 'string' && x.valeur.includes('T')) ? 'TIMESTAMP' : 'DATE'
    default:
      return 'VARCHAR'
  }
}

/** Valeur d'une cellule pour une colonne SQL ; `null` si vide, en erreur ou d'un autre type. */
function valeurDe(type: TypeSql, cellule: Cellule | undefined): unknown {
  if (cellule?.etat !== 'ok') return null
  const v = cellule.valeur
  switch (type) {
    case 'DOUBLE':
      return typeof v === 'number' && Number.isFinite(v) ? v : null
    case 'BOOLEAN':
      return typeof v === 'boolean' ? v : null
    case 'VARCHAR[]':
      return Array.isArray(v) ? v.map(String) : v === '' ? [] : [String(v)]
    case 'DATE':
    case 'TIMESTAMP':
      return typeof v === 'string' ? v : null
    default:
      return Array.isArray(v) ? v.join(', ') : String(v)
  }
}

/**
 * Tables de toutes les bases lues. `retenues` : les lignes gardées par les
 * filtres du dashboard, par base filtrée ; une autre base garde les lignes
 * liées à une ligne retenue (même règle que les blocs vue).
 */
export function tablesSql(src: SourceArbre, retenues: ReadonlyMap<string, ReadonlySet<string>> = new Map()): TableSql[] {
  return [...src.schemas].map(([base, schema]) => {
    const lignes = (src.lignes.get(base) ?? []).map((l) => avecCalculs(src, base, l))
    const tests = [...retenues].flatMap(([filtree, ids]): ((cellules: Record<string, Cellule>, id: string) => boolean)[] => {
      if (filtree === base) return [(_, id) => ids.has(id)]
      const relations = schema.colonnes.filter((c) => c.type === 'relation' && c.cible === filtree)
      if (relations.length === 0) return []
      return [(cellules) => relations.some((c) => { const x = cellules[c.cle]; return x?.etat === 'ok' && Array.isArray(x.valeur) && x.valeur.some((v) => ids.has(String(v))) })]
    })
    const gardees = tests.length === 0 ? lignes : lignes.filter((l) => tests.every((t) => t(l.cellules, l.id)))
    const colonnes = schema.colonnes.map((c) => ({ c, type: typeDe(c, gardees.map((l) => l.cellules[c.cle])) }))
    return {
      nom: base,
      colonnes: [{ nom: 'id', type: 'VARCHAR' as const }, ...colonnes.map(({ c, type }) => ({ nom: c.cle, type })), { nom: '_cree', type: 'TIMESTAMP' as const }, { nom: '_modifie', type: 'TIMESTAMP' as const }],
      lignes: gardees.map((l) => [l.id, ...colonnes.map(({ c, type }) => valeurDe(type, l.cellules[c.cle])), l.cree ?? null, l.modifie ?? null]),
    }
  })
}

const litteralTyped = (type: TypeSql, v: unknown) => (type === 'DATE' || type === 'TIMESTAMP' ? (v === null ? 'NULL' : litteralDate(v)) : litteral(v))

/** Instructions qui (re)créent les tables dans une base en mémoire. */
export function instructionsChargement(tables: readonly TableSql[]): string[] {
  return tables.flatMap((t) => {
    const nom = identifiant(t.nom)
    const creation = `create or replace table ${nom} (${t.colonnes.map((c) => `${identifiant(c.nom)} ${c.type}`).join(', ')})`
    const inserts: string[] = []
    for (let i = 0; i < t.lignes.length; i += PAQUET) {
      const valeurs = t.lignes.slice(i, i + PAQUET).map((l) => `(${l.map((v, k) => litteralTyped(t.colonnes[k]!.type, v)).join(', ')})`)
      inserts.push(`insert into ${nom} values ${valeurs.join(',\n')}`)
    }
    return [creation, ...inserts]
  })
}
