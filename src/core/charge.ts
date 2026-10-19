import type { LigneChargee } from './base'
import { estSaisie, type Colonne, type ColonneRelation, type Schema } from './schema'
import { decaler, jourDe, jourSemaine, lundiDe } from './temps'
import type { Valeur } from './valeurs'

// Plan de charge (spec §21) : capacité, charge et couverture des besoins, par
// semaine, en jours. Cœur sans interface : la vue, l'assistant et le MCP
// (`calculer_charge`) lisent les mêmes chiffres.

export type LienAffectations = { base: string; ressource: string; projet: string; debut: string; fin: string; jours: string }
export type LienAbsences = { base: string; ressource: string; debut: string; fin: string }
export type LienBesoins = { base: string; projet: string; role: string; jours: string; avant: string }
export type Feries = 'france' | 'aucun'

/** Réglages de la vue `charge` (vue de la base des ressources). */
export type ReglagesCharge = {
  /** Colonne `number` des ressources : jours par semaine (5 sans colonne ou sans valeur). */
  capacite?: string
  /** Colonne des ressources qui les groupe, et qui donne leur rôle pour la couverture des besoins. */
  groupe?: string
  affectations?: LienAffectations
  absences?: LienAbsences
  besoins?: LienBesoins
  feries?: Feries
}

/** Seuils de couleur d'une case : libre en dessous de 80 %, pleine jusqu'à 100 %, surchargée au-delà. */
export const SEUIL_PLEINE = 0.8

// ── Calendrier ────────────────────────────────────────────────────

/** Dimanche de Pâques d'une année (calendrier grégorien, algorithme de Meeus). */
export function paques(annee: number): string {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

const cacheFeries = new Map<number, ReadonlySet<string>>()

/** Jours fériés de France métropolitaine d'une année. */
export function feriesFrance(annee: number): ReadonlySet<string> {
  const deja = cacheFeries.get(annee)
  if (deja) return deja
  const p = paques(annee)
  const fixes = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'].map((j) => `${annee}-${j}`)
  const jours = new Set([...fixes, decaler(p, 1), decaler(p, 39), decaler(p, 50)])
  cacheFeries.set(annee, jours)
  return jours
}

/** Un jour ouvré : du lundi au vendredi, hors jours fériés si on en tient compte. */
export function estOuvre(jour: string, feries: Feries = 'france'): boolean {
  const j = jourSemaine(jour)
  if (j === 0 || j === 6) return false
  return feries === 'aucun' || !feriesFrance(Number(jour.slice(0, 4))).has(jour)
}

/** Jours ouvrés de la semaine qui commence au lundi `lundi`. */
export function ouvresDeLaSemaine(lundi: string, feries: Feries = 'france'): string[] {
  return [0, 1, 2, 3, 4].map((i) => decaler(lundi, i)).filter((j) => estOuvre(j, feries))
}

/** `n` lundis à partir de la semaine de `jour`. */
export function semaines(jour: string, n: number): string[] {
  const premier = lundiDe(jour)
  return Array.from({ length: n }, (_, i) => decaler(premier, i * 7))
}

// ── Lecture des lignes ────────────────────────────────────────────

const valeur = (l: LigneChargee, cle: string | undefined): Valeur | undefined => {
  if (!cle) return undefined
  const c = l.cellules[cle]
  return c?.etat === 'ok' ? c.valeur : undefined
}
const nombre = (l: LigneChargee, cle: string | undefined): number | null => {
  const v = valeur(l, cle)
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const ids = (l: LigneChargee, cle: string): string[] => {
  const v = valeur(l, cle)
  return Array.isArray(v) ? v.map(String) : typeof v === 'string' && v !== '' ? [v] : []
}
/** Plage d'une ligne : début, et fin (le début s'il n'y en a pas). `null` sans début. */
const plage = (l: LigneChargee, debut: string, fin: string): { debut: string; fin: string } | null => {
  const d = jourDe(valeur(l, debut))
  if (!d) return null
  const f = jourDe(valeur(l, fin)) ?? d
  return f < d ? { debut: f, fin: d } : { debut: d, fin: f }
}
/** Texte d'une cellule (option d'un choix), pour comparer un rôle. */
const texte = (l: LigneChargee, cle: string | undefined): string | null => {
  const v = valeur(l, cle)
  return typeof v === 'string' && v !== '' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null
}

export const capaciteDe = (r: ReglagesCharge, ressource: LigneChargee): number => nombre(ressource, r.capacite) ?? 5
export const roleDe = (r: ReglagesCharge, ressource: LigneChargee): string | null => texte(ressource, r.groupe)

// ── Charge par ressource ──────────────────────────────────────────

export type CaseCharge = {
  lundi: string
  /** Jours ouvrés de la semaine (fériés retirés). */
  ouvres: number
  /** Jours ouvrés d'absence de la ressource. */
  absence: number
  /** Capacité nette, en jours. */
  capacite: number
  /** Charge, en jours. */
  charge: number
  /** Charge par projet (id de ligne ; `''` pour une affectation sans projet). */
  parProjet: Record<string, number>
  /** Affectations qui composent la case. */
  affectations: string[]
}

export type EtatCase = 'vide' | 'libre' | 'pleine' | 'surchargee' | 'absente'

export function etatCase(c: CaseCharge): EtatCase {
  if (c.ouvres > 0 && c.absence >= c.ouvres) return 'absente'
  if (c.charge <= 0) return 'vide'
  if (c.capacite <= 0 || c.charge > c.capacite + 1e-9) return 'surchargee'
  return c.charge / c.capacite >= SEUIL_PLEINE ? 'pleine' : 'libre'
}

/** Jours d'une plage [debut, fin] tombant dans `jours`. */
const dans = (jours: readonly string[], p: { debut: string; fin: string }) => jours.filter((j) => j >= p.debut && j <= p.fin)

/**
 * Charge de chaque ressource, semaine par semaine. Une affectation pèse ses
 * jours par semaine × ses jours ouvrés dans la semaine / 5 : un férié réduit
 * la charge comme la capacité. Une absence ne réduit pas la charge, elle
 * réduit la capacité (le conflit se voit).
 */
export function calculerCharge(
  r: ReglagesCharge,
  ressources: readonly LigneChargee[],
  affectations: readonly LigneChargee[],
  absences: readonly LigneChargee[],
  lundis: readonly string[],
): Map<string, CaseCharge[]> {
  const feries = r.feries ?? 'france'
  const ouvres = new Map(lundis.map((l) => [l, ouvresDeLaSemaine(l, feries)]))
  const parRessource = new Map<string, LigneChargee[]>()
  const ranger = (map: Map<string, LigneChargee[]>, cle: string, l: LigneChargee) => map.set(cle, [...(map.get(cle) ?? []), l])
  const a = r.affectations
  if (a) for (const l of affectations) for (const id of ids(l, a.ressource)) ranger(parRessource, id, l)
  const absentes = new Map<string, LigneChargee[]>()
  const b = r.absences
  if (b) for (const l of absences) for (const id of ids(l, b.ressource)) ranger(absentes, id, l)

  const resultat = new Map<string, CaseCharge[]>()
  for (const res of ressources) {
    const cap = capaciteDe(r, res)
    resultat.set(
      res.id,
      lundis.map((lundi) => {
        const jours = ouvres.get(lundi)!
        const absence = new Set(
          (absentes.get(res.id) ?? []).flatMap((l) => {
            const p = b && plage(l, b.debut, b.fin)
            return p ? dans(jours, p) : []
          }),
        ).size
        const c: CaseCharge = { lundi, ouvres: jours.length, absence, capacite: (cap * (jours.length - absence)) / 5, charge: 0, parProjet: {}, affectations: [] }
        if (!a || jours.length === 0) return c
        for (const l of parRessource.get(res.id) ?? []) {
          const p = plage(l, a.debut, a.fin)
          const parSemaine = nombre(l, a.jours) ?? 0
          if (!p || parSemaine <= 0) continue
          const couverts = dans(jours, p).length
          if (couverts === 0) continue
          const part = (parSemaine * couverts) / 5
          c.charge += part
          const projet = ids(l, a.projet)[0] ?? ''
          c.parProjet[projet] = (c.parProjet[projet] ?? 0) + part
          c.affectations.push(l.id)
        }
        return c
      }),
    )
  }
  return resultat
}

// ── Couverture des besoins ────────────────────────────────────────

export type Couverture = {
  besoin: string
  projet: string | null
  role: string | null
  avant: string | null
  demandes: number
  affectes: number
}

/**
 * Pour chaque besoin, les jours affectés à son projet par des ressources de
 * son rôle jusqu'à sa date (toute affectation si le besoin n'a pas de date).
 * Un jour ouvré d'une affectation vaut ses jours par semaine / 5.
 */
export function couvrirBesoins(r: ReglagesCharge, ressources: readonly LigneChargee[], affectations: readonly LigneChargee[], besoins: readonly LigneChargee[]): Couverture[] {
  const a = r.affectations
  const bs = r.besoins
  if (!bs) return []
  const feries = r.feries ?? 'france'
  const roles = new Map(ressources.map((res) => [res.id, roleDe(r, res)]))
  return besoins.map((besoin) => {
    const projet = ids(besoin, bs.projet)[0] ?? null
    const role = texte(besoin, bs.role)
    const avant = jourDe(valeur(besoin, bs.avant))
    let affectes = 0
    if (a && projet) {
      for (const l of affectations) {
        if (!ids(l, a.projet).includes(projet)) continue
        if (role !== null && !ids(l, a.ressource).some((id) => roles.get(id) === role)) continue
        const p = plage(l, a.debut, a.fin)
        const parSemaine = nombre(l, a.jours) ?? 0
        if (!p || parSemaine <= 0) continue
        const fin = avant && avant < p.fin ? avant : p.fin
        for (let j = p.debut; j <= fin; j = decaler(j, 1)) if (estOuvre(j, feries)) affectes += parSemaine / 5
      }
    }
    return { besoin: besoin.id, projet, role, avant, demandes: nombre(besoin, bs.jours) ?? 0, affectes: Math.round(affectes * 100) / 100 }
  })
}

/** Jours arrondis au demi-jour, pour l'affichage (« 3,5 »). */
export const arrondiJours = (n: number) => Math.round(n * 2) / 2

// ── Réglages par défaut ───────────────────────────────────────────

type Schemas = ReadonlyMap<string, { depot: { schema: Schema } | null }>

const colonnesDe = (s: Schema, type: Colonne['type']) => s.colonnes.filter((c) => c.type === type)
const saisies = (s: Schema, type: Colonne['type']) => colonnesDe(s, type).filter(estSaisie)
const relationsVers = (s: Schema, cible: string) => colonnesDe(s, 'relation').filter((c): c is ColonneRelation => c.type === 'relation' && c.cible === cible && c.proprietaire)

/**
 * Réglages d'une nouvelle vue Plan de charge sur la base des ressources :
 * capacité et groupe pris dans ses colonnes, affectations, absences et besoins
 * retrouvés parmi les bases qui s'y relient (spec §21). Ce qui manque se règle dans Options.
 */
export function reglagesChargeParDefaut(bases: Schemas, base: string): ReglagesCharge {
  const schema = bases.get(base)?.depot?.schema
  if (!schema) return {}
  const nombres = saisies(schema, 'number')
  const capacite = nombres.find((c) => /capac/i.test(`${c.cle} ${c.nom}`)) ?? nombres[0]
  const groupe = saisies(schema, 'select')[0]
  const r: ReglagesCharge = { ...(capacite && { capacite: capacite.cle }), ...(groupe && { groupe: groupe.cle }) }
  const autres = [...bases].flatMap(([id, b]) => (id !== base && b.depot ? [{ id, s: b.depot.schema }] : []))

  const aff = autres.flatMap(({ id, s }) => {
    const ressource = relationsVers(s, base)[0]
    const projet = colonnesDe(s, 'relation').find((c): c is ColonneRelation => c.type === 'relation' && c.cible !== base && c.proprietaire)
    const dates = saisies(s, 'date')
    const jours = saisies(s, 'number')[0]
    return ressource && projet && dates[0] && jours ? [{ id, ressource, projet, dates, jours }] : []
  })[0]
  if (aff) r.affectations = { base: aff.id, ressource: aff.ressource.cle, projet: aff.projet.cle, debut: aff.dates[0]!.cle, fin: (aff.dates[1] ?? aff.dates[0]!).cle, jours: aff.jours.cle }

  const abs = autres.find(({ id, s }) => id !== aff?.id && relationsVers(s, base)[0] && saisies(s, 'date')[0] && saisies(s, 'number').length === 0)
  if (abs) {
    const dates = saisies(abs.s, 'date')
    r.absences = { base: abs.id, ressource: relationsVers(abs.s, base)[0]!.cle, debut: dates[0]!.cle, fin: (dates[1] ?? dates[0]!).cle }
  }

  const projets = aff?.projet.cible
  const bes = projets && autres.find(({ id, s }) => id !== aff.id && relationsVers(s, projets)[0] && saisies(s, 'select')[0] && saisies(s, 'number')[0])
  if (bes) {
    const avant = saisies(bes.s, 'date')[0]
    if (avant) r.besoins = { base: bes.id, projet: relationsVers(bes.s, projets!)[0]!.cle, role: saisies(bes.s, 'select')[0]!.cle, jours: saisies(bes.s, 'number')[0]!.cle, avant: avant.cle }
  }
  return r
}
