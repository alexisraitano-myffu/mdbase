import { DataType, type Table } from 'apache-arrow'
import type { NatureSql, ResultatSql, ValeurSql } from '../../core/bi/sql'

// Résultat Arrow de DuckDB-WASM → valeurs simples du cœur. Le moteur est
// ouvert avec les grands entiers et les décimaux en flottants, les horodatages
// en dates à la milliseconde (voir `OUVERTURE`).

/** Réglages d'ouverture communs aux deux adaptateurs. */
export const OUVERTURE = { query: { castBigIntToDouble: true, castDecimalToDouble: true, castTimestampToDate: true } } as const

const deux = (n: number) => String(n).padStart(2, '0')

function nature(t: DataType): NatureSql {
  if (DataType.isInt(t) || DataType.isFloat(t) || DataType.isDecimal(t)) return 'nombre'
  if (DataType.isUtf8(t) || DataType.isLargeUtf8(t)) return 'texte'
  if (DataType.isBool(t)) return 'case'
  if (DataType.isDate(t) || DataType.isTimestamp(t)) return 'date'
  if (DataType.isList(t)) return 'liste'
  return 'autre'
}

/** Une date Arrow (millisecondes UTC) : `AAAA-MM-JJ`, avec l'heure si elle n'est pas minuit. */
function date(ms: number, avecHeure: boolean): string {
  const d = new Date(ms)
  const jour = `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
  return avecHeure && (d.getUTCHours() || d.getUTCMinutes()) ? `${jour}T${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}` : jour
}

function valeur(v: unknown, t: DataType): ValeurSql {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return Number(v)
  if (DataType.isDate(t) || DataType.isTimestamp(t)) {
    const ms = v instanceof Date ? v.getTime() : Number(v)
    return Number.isFinite(ms) ? date(ms, !(DataType.isDate(t) && t.unit === 0)) : null
  }
  if (DataType.isList(t)) {
    const enfant = t.children[0]!.type
    return [...(v as Iterable<unknown>)].map((x) => valeur(x, enfant))
  }
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v
  return JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? Number(x) : x))
}

export function convertir(table: Table): ResultatSql {
  const champs = table.schema.fields
  const colonnes = champs.map((f) => ({ nom: f.name, nature: nature(f.type) }))
  const vecteurs = champs.map((_, k) => table.getChildAt(k))
  const lignes: Record<string, ValeurSql>[] = []
  for (let i = 0; i < table.numRows; i++) {
    const ligne: Record<string, ValeurSql> = {}
    champs.forEach((f, k) => (ligne[f.name] = valeur(vecteurs[k]?.get(i), f.type)))
    lignes.push(ligne)
  }
  return { colonnes, lignes }
}
