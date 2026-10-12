import { COULEURS } from '../couleurs'
import { lireCondition, type Format, type Regle } from './analyse'
import type { ValeurSql } from './sql'

// Mise en forme conditionnelle et formats des blocs d'analyse (spec §10
// « Analyse »).

/** Une valeur comparable : nombre, ou texte (les dates `AAAA-MM-JJ` se comparent comme du texte). */
function comparable(v: ValeurSql | undefined): number | string | null {
  if (v === null || v === undefined || Array.isArray(v)) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  return v
}

/** L'opérande d'une règle : une colonne de la ligne si elle existe, sinon un nombre, sinon le texte. */
function operande(o: string, ligne: Record<string, ValeurSql>): number | string | null {
  if (Object.hasOwn(ligne, o)) return comparable(ligne[o])
  const n = Number(o.replace(',', '.'))
  return o.trim() !== '' && Number.isFinite(n) ? n : o
}

export function remplit(si: string, valeur: ValeurSql | undefined, ligne: Record<string, ValeurSql>): boolean {
  const c = lireCondition(si)
  const a = comparable(valeur)
  if (!c || a === null) return false
  let b = operande(c.operande, ligne)
  if (b === null) return false
  // Un nombre comparé à un texte qui en est un (« 5 » dans une colonne texte) : on compare les textes.
  if (typeof a !== typeof b) b = String(b)
  const x = typeof b === 'string' ? String(a) : a
  switch (c.comparaison) {
    case '>':
      return x > b
    case '>=':
      return x >= b
    case '<':
      return x < b
    case '<=':
      return x <= b
    case '=':
      return x === b
    case '!=':
      return x !== b
  }
}

/**
 * Couleur que donnent les règles : la première qui s'applique gagne.
 * `testee` dit, pour chaque règle, quelle colonne de la ligne elle teste, ou
 * `undefined` si elle ne vaut pas ici (règle d'une autre cellule d'un tableau).
 */
export function couleurRegle(regles: readonly Regle[] | undefined, ligne: Record<string, ValeurSql>, testee: (r: Regle) => string | undefined): string | undefined {
  for (const r of regles ?? []) {
    const colonne = testee(r)
    if (colonne !== undefined && remplit(r.si, ligne[colonne], ligne)) return (COULEURS as readonly string[]).includes(r.couleur) ? r.couleur : undefined
  }
  return undefined
}

const nombre = (decimales: [number, number]) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimales[0], maximumFractionDigits: decimales[1] })
const FORMATEURS = {
  nombre: nombre([0, 2]),
  entier: nombre([0, 0]),
  decimal: nombre([2, 2]),
  pourcent: new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 }),
  euros: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
}

/** Format d'une colonne : celui du bloc, ou celui donné pour cette colonne. */
export const formatDe = (format: Format | Record<string, Format> | undefined, colonne: string): Format | undefined =>
  typeof format === 'string' ? format : format?.[colonne]

/** Texte affiché d'une valeur de résultat. */
export function formater(v: ValeurSql | undefined, format?: Format): string {
  if (v === null || v === undefined) return ''
  if (Array.isArray(v)) return v.map((x) => formater(x, format)).join(', ')
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'number') return format === 'date' || !format ? FORMATEURS.nombre.format(v) : FORMATEURS[format].format(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, j] = [v.slice(0, 4), v.slice(5, 7), v.slice(8, 10)]
    return `${j}/${m}/${a}${v.length > 10 ? ` ${v.slice(11, 16)}` : ''}`
  }
  return v
}
