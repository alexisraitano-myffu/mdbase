import type { BlocAnalyse, EntreeEtat, Etape } from './analyse'
import type { ResultatSql, ValeurSql } from './sql'

// Fiches (spec §10 « Fiches ») : états et sélections calculés en SQL autour
// de la requête d'un bloc, puis ce que chaque bloc tire de son résultat
// (prochaine date, grille d'étapes, fenêtre de la frise).

/** Colonnes ajoutées au résultat : rang de l'état qui s'applique, ligne gardée par la sélection d'une liste. */
export const COLONNE_ETAT = '_etat'
export const COLONNE_GARDE = '_garde'

/** Expression SQL qui donne le rang de la première entrée vraie (ou de l'entrée par défaut), sinon NULL. */
export function expressionEtat(entrees: readonly EntreeEtat[]): string {
  const conditions = entrees.flatMap((e, i) => (e.si ? [`when (${e.si}) then ${i}`] : []))
  const defaut = entrees.findIndex((e) => !e.si)
  const sinon = defaut >= 0 ? `else ${defaut} ` : ''
  return conditions.length > 0 ? `case ${conditions.join(' ')} ${sinon}end` : defaut >= 0 ? String(defaut) : 'null'
}

/**
 * La requête d'un bloc, enrichie : rang d'état (`_etat`), ligne gardée
 * (`_garde`, les gardées d'abord ; une condition qui vaut NULL, sur une
 * colonne vide, garde la ligne), tri. Sans rien à ajouter, la requête telle quelle.
 */
export function enrichir(sql: string, ajout: { etat?: readonly EntreeEtat[]; garder?: string; tri?: string }): string {
  const colonnes = [
    ...(ajout.etat ? [`${expressionEtat(ajout.etat)} as ${COLONNE_ETAT}`] : []),
    ...(ajout.garder ? [`coalesce((${ajout.garder}), true) as ${COLONNE_GARDE}`] : []),
  ]
  const tri = [...(ajout.garder ? [`${COLONNE_GARDE} desc`] : []), ...(ajout.tri ? [ajout.tri] : [])]
  if (colonnes.length === 0 && tri.length === 0) return sql
  return `select *${colonnes.map((c) => `, ${c}`).join('')} from (\n${sql}\n) as source${tri.length > 0 ? ` order by ${tri.join(', ')}` : ''}`
}

/** L'entrée d'état d'une ligne enrichie, s'il y en a une. */
export function etatDe(ligne: Record<string, ValeurSql> | undefined, entrees: readonly EntreeEtat[] | undefined): EntreeEtat | undefined {
  const rang = ligne?.[COLONNE_ETAT]
  return typeof rang === 'number' ? entrees?.[rang] : undefined
}

/** Lignes d'une liste : gardées (au plus `max`), et écartées par la règle ou le maximum, qu'on ne cache jamais sans le dire. */
export function selection(r: ResultatSql, max: number | undefined): { gardees: Record<string, ValeurSql>[]; ecartees: Record<string, ValeurSql>[] } {
  const gardees = r.lignes.filter((l) => l[COLONNE_GARDE] !== false)
  const ecartees = r.lignes.filter((l) => l[COLONNE_GARDE] === false)
  if (max === undefined || gardees.length <= max) return { gardees, ecartees }
  return { gardees: gardees.slice(0, max), ecartees: [...gardees.slice(max), ...ecartees] }
}

// ── Dates ────────────────────────────────────────────────────────

const JOUR = 86_400_000
const jourDe = (v: ValeurSql | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const temps = (jour: string) => Date.parse(`${jour}T00:00:00Z`)

/** Jours d'aujourd'hui à une date (`AAAA-MM-JJ`), négatif si elle est passée. */
export const joursJusqua = (jour: string, aujourdhui: string) => Math.round((temps(jour) - temps(aujourdhui)) / JOUR)

/** Seuils par défaut d'un compte à rebours : rouge sous 8 jours, orange sous 31. */
export const SEUILS = [8, 31] as const

/** Couleur d'un nombre de jours à venir selon les seuils. */
export const couleurJours = (jours: number, seuils: readonly [number, number] = SEUILS) => (jours < seuils[0] ? 'rouge' : jours < seuils[1] ? 'orange' : 'vert')

/** La date à venir la plus proche du résultat (aujourd'hui compris), avec sa ligne. */
export function prochaine(r: ResultatSql, colonne: string, aujourdhui: string): { jour: string; jours: number; ligne: Record<string, ValeurSql> } | null {
  let meilleure: { jour: string; jours: number; ligne: Record<string, ValeurSql> } | null = null
  for (const ligne of r.lignes) {
    const jour = jourDe(ligne[colonne])
    if (!jour) continue
    const jours = joursJusqua(jour, aujourdhui)
    if (jours >= 0 && (!meilleure || jours < meilleure.jours)) meilleure = { jour, jours, ligne }
  }
  return meilleure
}

// ── Étapes ───────────────────────────────────────────────────────

export type CaseEtape = { statut: string | null; date: string | null }
export type ElementEtapes = { nom: string; cases: CaseEtape[] }
export type GroupeEtapes = { titre: string | null; detail: string | null; elements: ElementEtapes[] }

const texteDe = (v: ValeurSql | undefined): string | null => (v === null || v === undefined || Array.isArray(v) ? null : String(v))

/**
 * Grille d'un bloc `etapes` : le résultat a une ligne par élément et par
 * étape. Les étapes suivent `etapes` (sinon leur ordre d'apparition), les
 * éléments et les groupes leur ordre d'apparition ; une étape absente est vide.
 */
export function grilleEtapes(b: BlocAnalyse, r: ResultatSql): { etapes: Etape[]; groupes: GroupeEtapes[] } {
  const colEtape = b.etape ?? 'etape'
  const etapes: Etape[] = b.etapes ? [...b.etapes] : []
  if (!b.etapes) for (const l of r.lignes) {
    const nom = texteDe(l[colEtape])
    if (nom !== null && !etapes.some((e) => e.nom === nom)) etapes.push({ nom })
  }
  const rang = new Map(etapes.map((e, i) => [e.nom, i]))
  const groupes: GroupeEtapes[] = []
  for (const l of r.lignes) {
    const titre = b.groupe ? texteDe(l[b.groupe]) : null
    let g = groupes.find((x) => x.titre === titre)
    if (!g) groupes.push((g = { titre, detail: b.detail_groupe ? texteDe(l[b.detail_groupe]) : null, elements: [] }))
    const nom = texteDe(l[b.element ?? 'element']) ?? ''
    let e = g.elements.find((x) => x.nom === nom)
    if (!e) g.elements.push((e = { nom, cases: etapes.map(() => ({ statut: null, date: null })) }))
    const i = rang.get(texteDe(l[colEtape]) ?? '')
    if (i !== undefined) e.cases[i] = { statut: texteDe(l[b.statut ?? 'statut']), date: b.date ? jourDe(l[b.date]) : null }
  }
  return { etapes, groupes }
}

// ── Frise ────────────────────────────────────────────────────────

const premierDuMois = (jour: string) => `${jour.slice(0, 7)}-01`
const finDuMois = (jour: string) => {
  const [a, m] = [Number(jour.slice(0, 4)), Number(jour.slice(5, 7))]
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

/** Fenêtre d'une frise : du début du mois d'il y a deux semaines à la fin du mois de la dernière date (au moins ce mois-là). */
export function fenetreFrise(dates: readonly string[], aujourdhui: string): { debut: string; fin: string } {
  const debut = premierDuMois(new Date(temps(aujourdhui) - 14 * JOUR).toISOString().slice(0, 10))
  const derniere = [...dates, aujourdhui].sort().at(-1)!
  return { debut, fin: finDuMois(derniere) }
}

/** Position d'une date dans la fenêtre, de 0 à 1 (bornée). */
export function position(jour: string, f: { debut: string; fin: string }): number {
  const total = temps(f.fin) + JOUR - temps(f.debut)
  return Math.min(1, Math.max(0, (temps(jour) - temps(f.debut)) / total))
}

/** Débuts de mois de la fenêtre, pour l'en-tête. */
export function moisDe(f: { debut: string; fin: string }): string[] {
  const mois: string[] = []
  for (let a = Number(f.debut.slice(0, 4)), m = Number(f.debut.slice(5, 7)); `${a}-${String(m).padStart(2, '0')}-01` <= f.fin; m === 12 ? ((a += 1), (m = 1)) : (m += 1)) mois.push(`${a}-${String(m).padStart(2, '0')}-01`)
  return mois
}

export { jourDe, texteDe }
