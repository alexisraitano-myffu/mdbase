import type { LigneChargee } from './base'
import type { Modifications } from './ligne'
import { colonne as colonneDe, natureDe, type Colonne, type Schema } from './schema'
import { decaler, jourSemaine } from './temps'
import type { Valeur } from './valeurs'
import type { Filtre, FiltreRapide, Operateur, Tri } from './vue'

// Filtres, tris et héritage des filtres à la création (spec §7, §8).
// Tout s'évalue sur les valeurs de l'index, sans accès aux fichiers.

/** « Aujourd'hui » est injecté : le cœur ne lit pas l'horloge lui-même. */
export type Contexte = { aujourdhui: string; /** `AAAA-MM-JJTHH:mm`, pour `maintenant()` dans les formules. */ maintenant?: string }

/** Opérateurs proposés pour une colonne, selon la nature de sa valeur (spec §7). */
export function operateursPour(c: Colonne): Operateur[] {
  const communs: Operateur[] = ['vide', 'non_vide']
  switch (natureDe(c)) {
    case 'texte':
      return ['egal', 'different_de', 'contient', 'ne_contient_pas', 'commence_par', 'finit_par', ...communs]
    case 'nombre':
      return ['egal', 'different_de', 'superieur', 'inferieur', 'superieur_egal', 'inferieur_egal', ...communs]
    case 'date':
      return ['egal', 'avant', 'apres', 'entre', 'aujourdhui', 'cette_semaine', 'ce_mois', 'jours_passes', 'jours_a_venir', ...communs]
    case 'case':
      return ['egal']
    case 'choix':
      return ['egal', 'different_de', 'parmi', ...communs]
    case 'liste':
      return ['contient', 'ne_contient_pas', ...communs]
  }
}

/** Opérateurs qui ne demandent aucune valeur. */
export const SANS_VALEUR: readonly Operateur[] = ['vide', 'non_vide', 'aujourdhui', 'cette_semaine', 'ce_mois']

/** Opérateur d'une pastille nouvellement épinglée : le plus utile pour le type. */
export function operateurParDefaut(c: Colonne): Operateur {
  switch (natureDe(c)) {
    case 'choix':
      return 'parmi'
    case 'liste':
    case 'texte':
      return 'contient'
    default:
      return 'egal'
  }
}

/** Filtre appliqué par une pastille, ou `null` si elle n'est pas encore réglée (elle ne filtre alors rien). */
export function filtreDePastille(schema: Schema, p: FiltreRapide): Filtre | null {
  const c = colonneDe(schema, p.colonne)
  if (!c) return null
  const operateur = p.operateur ?? operateurParDefaut(c)
  if (SANS_VALEUR.includes(operateur)) return { colonne: c.cle, operateur }
  const v = p.valeur
  const renseignee = Array.isArray(v)
    ? v.length > 0 && (operateur !== 'entre' || v.every((x) => x !== '' && x !== undefined))
    : v !== undefined && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
  return renseignee ? { colonne: c.cle, operateur, valeur: v } : null
}

/** Valeur d'une cellule pour les filtres et tris ; une valeur invalide compte comme non vide mais ne correspond à rien. */
type Lue = { vide: true } | { vide: false; valeur: Valeur | undefined }

function lire(ligne: LigneChargee, c: Colonne): Lue {
  const cellule = ligne.cellules[c.cle]
  if (!cellule) return natureDe(c) === 'case' ? { vide: false, valeur: false } : { vide: true }
  return { vide: false, valeur: cellule.etat === 'ok' ? cellule.valeur : undefined }
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function correspond(ligne: LigneChargee, schema: Schema, f: Filtre, ctx: Contexte): boolean {
  const c = colonneDe(schema, f.colonne)
  if (!c) return true // filtre sur une colonne disparue : ignoré
  const lue = lire(ligne, c)
  if (f.operateur === 'vide') return lue.vide
  if (f.operateur === 'non_vide') return !lue.vide
  const negatif = f.operateur === 'different_de' || f.operateur === 'ne_contient_pas'
  if (lue.vide || lue.valeur === undefined) return negatif

  const v = lue.valeur
  switch (natureDe(c)) {
    case 'texte':
      return comparerTexte(String(v), f)
    case 'nombre':
      return comparerNombre(Number(v), f)
    case 'date':
      return comparerDate(String(v).slice(0, 10), f, ctx)
    case 'case':
      return v === (f.valeur === true || f.valeur === 'true')
    case 'choix':
      if (f.operateur === 'parmi') return Array.isArray(f.valeur) && f.valeur.includes(v)
      return f.operateur === 'egal' ? v === f.valeur : f.operateur === 'different_de' ? v !== f.valeur : false
    case 'liste': {
      const liste = Array.isArray(v) ? v : [String(v)]
      const contient = liste.includes(String(f.valeur))
      return f.operateur === 'contient' ? contient : f.operateur === 'ne_contient_pas' ? !contient : false
    }
  }
}

function comparerTexte(v: string, f: Filtre): boolean {
  const a = normaliser(v)
  const b = normaliser(String(f.valeur ?? ''))
  switch (f.operateur) {
    case 'egal':
      return a === b
    case 'different_de':
      return a !== b
    case 'contient':
      return a.includes(b)
    case 'ne_contient_pas':
      return !a.includes(b)
    case 'commence_par':
      return a.startsWith(b)
    case 'finit_par':
      return a.endsWith(b)
    default:
      return false
  }
}

function comparerNombre(v: number, f: Filtre): boolean {
  const b = Number(f.valeur)
  if (!Number.isFinite(b)) return true // valeur de filtre pas encore saisie
  switch (f.operateur) {
    case 'egal':
      return v === b
    case 'different_de':
      return v !== b
    case 'superieur':
      return v > b
    case 'inferieur':
      return v < b
    case 'superieur_egal':
      return v >= b
    case 'inferieur_egal':
      return v <= b
    default:
      return false
  }
}

/** Une date de filtre : `AAAA-MM-JJ` ou le mot `aujourdhui`. */
function dateFiltre(x: unknown, ctx: Contexte): string | null {
  if (x === 'aujourdhui') return ctx.aujourdhui
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null
}

function comparerDate(v: string, f: Filtre, ctx: Contexte): boolean {
  switch (f.operateur) {
    case 'egal':
    case 'avant':
    case 'apres': {
      const d = dateFiltre(f.valeur, ctx)
      if (d === null) return true
      return f.operateur === 'egal' ? v === d : f.operateur === 'avant' ? v < d : v > d
    }
    case 'entre': {
      const [a, b] = Array.isArray(f.valeur) ? f.valeur.map((x) => dateFiltre(x, ctx)) : []
      if (!a || !b) return true
      return v >= (a < b ? a : b) && v <= (a < b ? b : a)
    }
    case 'aujourdhui':
      return v === ctx.aujourdhui
    case 'cette_semaine': {
      const debut = decaler(ctx.aujourdhui, -((jourSemaine(ctx.aujourdhui) + 6) % 7))
      return v >= debut && v <= decaler(debut, 6)
    }
    case 'ce_mois':
      return v.slice(0, 7) === ctx.aujourdhui.slice(0, 7)
    case 'jours_passes':
      return v <= ctx.aujourdhui && v >= decaler(ctx.aujourdhui, -Math.abs(Number(f.valeur) || 0))
    case 'jours_a_venir':
      return v >= ctx.aujourdhui && v <= decaler(ctx.aujourdhui, Math.abs(Number(f.valeur) || 0))
    default:
      return false
  }
}

// ── Tris ───────────────────────────────────────────────────────────

const collateur = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

/** Tri stable, multi-critères ; les cellules vides vont toujours en bas. */
export function trier(lignes: readonly LigneChargee[], schema: Schema, tris: readonly Tri[]): LigneChargee[] {
  const criteres = tris.flatMap((t) => {
    const c = colonneDe(schema, t.colonne)
    return c ? [{ c, signe: t.sens === 'desc' ? -1 : 1 }] : []
  })
  if (criteres.length === 0) return [...lignes]
  return lignes
    .map((ligne, i) => ({ ligne, i }))
    .sort((x, y) => {
      for (const { c, signe } of criteres) {
        const a = lire(x.ligne, c)
        const b = lire(y.ligne, c)
        if (a.vide || b.vide) {
          if (a.vide !== b.vide) return a.vide ? 1 : -1
          continue
        }
        const r = comparer(c, a.valeur, b.valeur)
        if (r !== 0) return r * signe
      }
      return x.i - y.i
    })
    .map((x) => x.ligne)
}

function comparer(c: Colonne, a: Valeur | undefined, b: Valeur | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  switch (natureDe(c)) {
    case 'nombre':
    case 'case':
      return Number(a) - Number(b)
    case 'choix': {
      // Ordre des options, comme dans Notion.
      const options = c.type === 'select' ? c.options : []
      const rang = (x: Valeur) => options.findIndex((o) => o.label === x)
      return rang(a) - rang(b)
    }
    case 'date':
      return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
    default:
      return collateur.compare(Array.isArray(a) ? a.join(', ') : String(a), Array.isArray(b) ? b.join(', ') : String(b))
  }
}

// ── Application d'une vue ─────────────────────────────────────────

export type LigneVue = { ligne: LigneChargee; sortira: boolean }

/**
 * Lignes affichées par une vue : filtrées (ET), triées. Les lignes
 * `persistantes` (créées ou modifiées pendant la session) restent visibles
 * même si elles ne satisfont plus les filtres, marquées « sortira » (spec §8).
 */
export function appliquerVue(
  lignes: readonly LigneChargee[],
  schema: Schema,
  filtres: readonly Filtre[],
  tris: readonly Tri[],
  ctx: Contexte,
  persistantes: ReadonlySet<string> = new Set(),
): LigneVue[] {
  const retenues: LigneVue[] = []
  for (const ligne of lignes) {
    const ok = filtres.every((f) => correspond(ligne, schema, f, ctx))
    if (ok || persistantes.has(ligne.id)) retenues.push({ ligne, sortira: !ok })
  }
  const triees = trier(
    retenues.map((r) => r.ligne),
    schema,
    tris,
  )
  const sortira = new Map(retenues.map((r) => [r.ligne, r.sortira]))
  return triees.map((ligne) => ({ ligne, sortira: sortira.get(ligne) ?? false }))
}

/**
 * Valeurs pré-remplies d'une ligne créée depuis une vue filtrée (spec §8) :
 * `egal` sur select, checkbox, text, number, date (hors date relative) ;
 * `contient` sur relation ; `parmi` sur select à une seule valeur.
 * Tout le reste est ignoré.
 */
export function valeursHeritees(schema: Schema, filtres: readonly Filtre[]): Modifications {
  const valeurs: Modifications = {}
  for (const f of filtres) {
    const c = colonneDe(schema, f.colonne)
    if (!c) continue
    if (f.operateur === 'egal') {
      if (c.type === 'text' && typeof f.valeur === 'string') valeurs[c.cle] = f.valeur
      if (c.type === 'select' && typeof f.valeur === 'string') valeurs[c.cle] = f.valeur
      if (c.type === 'checkbox') valeurs[c.cle] = f.valeur === true || f.valeur === 'true'
      if (c.type === 'number' && Number.isFinite(Number(f.valeur)) && f.valeur !== '') valeurs[c.cle] = Number(f.valeur)
      if (c.type === 'date' && typeof f.valeur === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.valeur)) valeurs[c.cle] = f.valeur
    }
    if (f.operateur === 'parmi' && c.type === 'select' && Array.isArray(f.valeur) && f.valeur.length === 1) {
      valeurs[c.cle] = String(f.valeur[0])
    }
    if (f.operateur === 'contient' && c.type === 'relation' && typeof f.valeur === 'string' && f.valeur !== '') {
      const deja = valeurs[c.cle]
      valeurs[c.cle] = [...(Array.isArray(deja) ? deja : []), f.valeur]
    }
  }
  return valeurs
}
