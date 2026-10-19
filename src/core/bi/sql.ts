import type { Parametre } from './analyse'

// Moteur SQL de l'analyse (spec §10 « Analyse ») : le cœur prépare le texte
// (tables, paramètres, enveloppe en lecture seule) ; un adaptateur l'exécute
// (DuckDB-WASM dans la page ou dans Node).

/** Valeur d'une cellule de résultat : les dates en `AAAA-MM-JJ` (ou `AAAA-MM-JJTHH:mm`). */
export type ValeurSql = string | number | boolean | null | ValeurSql[]
export type NatureSql = 'nombre' | 'texte' | 'date' | 'case' | 'liste' | 'autre'
export type ResultatSql = { colonnes: { nom: string; nature: NatureSql }[]; lignes: Record<string, ValeurSql>[] }

/** Ce que fournit un adaptateur : exécuter un texte SQL et en rendre le résultat converti. */
export interface MoteurSql {
  executer(sql: string): Promise<ResultatSql>
}

export class ErreurSql extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurSql'
  }
}

/** Lignes gardées d'un résultat au plus (spec : « un résultat se coupe à 5 000 lignes »). */
export const LIGNES_MAX = 5000

/** Identifiant entre guillemets doubles. */
export const identifiant = (nom: string) => `"${nom.replace(/"/g, '""')}"`

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_HEURE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/

/** Littéral SQL échappé : jamais une valeur collée telle quelle dans une requête. */
export function litteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (Array.isArray(v)) return `[${v.map((x) => litteral(x === null || x === undefined ? null : String(x))).join(', ')}]::VARCHAR[]`
  return `'${String(v).replace(/\0/g, '').replace(/'/g, "''")}'`
}

/** Littéral de date : `DATE '…'` ou `TIMESTAMP '…'` ; `NULL` si ce n'est pas une date. */
export function litteralDate(v: unknown): string {
  if (typeof v !== 'string') return 'NULL'
  if (DATE.test(v)) return `DATE '${v}'`
  const m = DATE_HEURE.exec(v)
  return m ? `TIMESTAMP '${m[1]} ${m[2]}:00'` : 'NULL'
}

const decalerMois = (aujourdhui: string, n: number) => {
  const d = new Date(Date.UTC(Number(aujourdhui.slice(0, 4)), Number(aujourdhui.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

/**
 * Valeur effective d'un paramètre : celle choisie, sinon le défaut ; un mois
 * `courant` ou `precedent` se résout au jour donné. `undefined` : sans valeur.
 */
export function valeurParametre(p: Parametre, aujourdhui: string): unknown {
  const v = p.valeur ?? p.defaut
  if (v === undefined || v === null || v === '') return undefined
  if (p.type === 'mois') {
    if (v === 'courant') return aujourdhui.slice(0, 7)
    if (v === 'precedent') return decalerMois(aujourdhui, -1)
    return typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : undefined
  }
  if (p.type === 'nombre') return typeof v === 'number' ? v : undefined
  if (p.type === 'periode') {
    if (!Array.isArray(v) || v.length !== 2) return undefined
    return v.map((x) => (typeof x === 'string' && DATE.test(x) ? x : null))
  }
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined
}

/**
 * Remplace `{{nom}}` (et `{{nom.debut}}`, `{{nom.fin}}` d'une période) par le
 * littéral de la valeur. Un nom inconnu est une erreur ; un paramètre sans valeur vaut `NULL`.
 */
export function substituer(sql: string, parametres: readonly Parametre[], aujourdhui: string): string {
  return sql.replace(/\{\{\s*([a-z_][a-z0-9_]*)(?:\.(debut|fin))?\s*\}\}/g, (_, nom: string, borne?: string) => {
    const p = parametres.find((x) => x.nom === nom)
    // Paramètre intégré : la date du jour de l'app (current_date demande une extension absente du moteur).
    if (!p && nom === 'aujourdhui' && !borne) return litteralDate(aujourdhui)
    if (!p) throw new ErreurSql(`paramètre « ${nom} » inconnu`)
    const v = valeurParametre(p, aujourdhui)
    if (p.type === 'periode') {
      if (!borne) throw new ErreurSql(`« ${nom} » est une période : écrire {{${nom}.debut}} et {{${nom}.fin}}`)
      return litteralDate(Array.isArray(v) ? v[borne === 'debut' ? 0 : 1] : undefined)
    }
    if (borne) throw new ErreurSql(`« ${nom} » n'est pas une période : écrire {{${nom}}}`)
    return p.type === 'date' ? litteralDate(v) : litteral(v)
  })
}

/**
 * Enveloppe une requête : une seule instruction de lecture (une sous-requête
 * ne peut être ni une écriture ni une création), coupée à `LIGNES_MAX` + 1
 * lignes pour savoir si le résultat a été coupé.
 */
export function envelopper(sql: string, limite = LIGNES_MAX): string {
  const corps = sql.trim().replace(/;\s*$/, '')
  if (corps === '') throw new ErreurSql('requête vide')
  return `select * from (\n${corps}\n) as resultat limit ${limite + 1}`
}

/** Exécute une requête de l'utilisateur, déjà substituée : lecture seule, résultat coupé. */
export async function requete(moteur: MoteurSql, sql: string, limite = LIGNES_MAX): Promise<ResultatSql & { coupe: boolean }> {
  const r = await moteur.executer(envelopper(sql, limite))
  return { ...r, lignes: r.lignes.slice(0, limite), coupe: r.lignes.length > limite }
}
