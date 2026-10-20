import type { LigneChargee } from './base'
import type { Modifications } from './ligne'
import { estSaisie, type Colonne, type ColonneRelation, type Schema } from './schema'
import { ajouterMois, decaler, jourDe, jourSemaine, lundiDe } from './temps'
import type { Valeur } from './valeurs'

// Plan de charge (spec §21) : capacité, charge et couverture des besoins, en
// jours, calculées jour ouvré par jour ouvré puis additionnées par période
// (jour, semaine ou mois). Cœur sans interface : la vue, l'assistant et le MCP
// (`calculer_charge`) lisent les mêmes chiffres.

export type LienAffectations = {
  base: string
  ressource: string
  projet: string
  debut: string
  fin: string
  /** Jours par semaine. */
  jours: string
  /** Jours au total, répartis sur les jours ouvrés de la période ; l'emporte sur `jours` quand la ligne en a. */
  total?: string
  /** Relation vers la version du projet visée. */
  version?: string
  /** Colonne `text` : les jours qui ne suivent pas la règle, une ligne `AAAA-MM-JJ: jours` par jour. */
  detail?: string
  /** Colonne `select` : vide pour le plan réel, sinon le scénario (l'essai) de l'affectation. */
  scenario?: string
}

/** Options du calcul : le scénario affiché en plus du plan réel, et des affectations d'aperçu (« Remplir »), comptées comme provisoires. */
export type OptionsCalcul = { scenario?: string | null; apercu?: readonly LigneChargee[] }
export type LienAbsences = { base: string; ressource: string; debut: string; fin: string }
export type LienBesoins = { base: string; projet: string; role: string; jours: string; avant: string }
export type Feries = 'france' | 'aucun'
export type Maille = 'jour' | 'semaine' | 'mois'

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
  maille?: Maille
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

/** Une colonne du plan : du `debut` à la `fin` comprise. */
export type Periode = { debut: string; fin: string }

/** Colonnes par défaut de chaque maille. */
export const PERIODES_PAR_DEFAUT: Record<Maille, number> = { jour: 20, semaine: 12, mois: 6 }

const finDuMois = (jour: string) => decaler(ajouterMois(jour.slice(0, 8) + '01', 1), -1)

/**
 * `n` périodes à partir de celle qui contient `jour` : jours du lundi au
 * vendredi (fériés compris, pour les montrer), semaines, ou mois.
 */
export function periodes(maille: Maille, jour: string, n: number): Periode[] {
  if (maille === 'semaine') return semaines(jour, n).map((l) => ({ debut: l, fin: decaler(l, 4) }))
  if (maille === 'mois') {
    return Array.from({ length: n }, (_, i) => {
      const debut = ajouterMois(jour.slice(0, 8) + '01', i)
      return { debut, fin: finDuMois(debut) }
    })
  }
  const sortie: Periode[] = []
  for (let j = jourSemaine(jour) === 6 || jourSemaine(jour) === 0 ? lundiDe(decaler(jour, 2)) : jour; sortie.length < n; j = decaler(j, 1)) {
    const js = jourSemaine(j)
    if (js !== 0 && js !== 6) sortie.push({ debut: j, fin: j })
  }
  return sortie
}

/** Période suivante ou précédente : `pas` périodes plus loin (un jour = un jour ouvré). */
export function decalerPeriode(maille: Maille, jour: string, pas: number): string {
  if (maille === 'mois') return ajouterMois(jour.slice(0, 8) + '01', pas)
  if (maille === 'semaine') return decaler(lundiDe(jour), pas * 7)
  let j = jour
  for (let i = 0; i < Math.abs(pas); ) {
    j = decaler(j, Math.sign(pas))
    if (jourSemaine(j) !== 0 && jourSemaine(j) !== 6) i++
  }
  return j
}

/** Jours ouvrés d'une période. */
export const ouvresDe = (p: Periode, feries: Feries = 'france'): string[] => {
  const jours: string[] = []
  for (let j = p.debut; j <= p.fin; j = decaler(j, 1)) if (estOuvre(j, feries)) jours.push(j)
  return jours
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
  debut: string
  fin: string
  /** Jours ouvrés de la période (fériés retirés). */
  ouvres: number
  /** Jours ouvrés d'absence de la ressource. */
  absence: number
  /** Capacité nette, en jours. */
  capacite: number
  /** Charge, en jours. */
  charge: number
  /** Charge par projet (id de ligne ; `''` pour une affectation sans projet). */
  parProjet: Record<string, number>
  /** Charge par version (id de ligne ; `@<projet>` pour une affectation sans version), quand la version est réglée. */
  parVersion: Record<string, number>
  /** Affectations qui composent la case. */
  affectations: string[]
  /** Charge de chaque affectation dans la case, en jours. */
  parAffectation: Record<string, number>
  /** Part de la charge qui vient d'un scénario ou d'un aperçu (provisoire), en tout, par projet et par version. */
  provisoire: number
  provisoireParProjet: Record<string, number>
  provisoireParVersion: Record<string, number>
  /** Un jour de la case suit le détail d'une affectation plutôt que sa règle. */
  ajustee: boolean
}

export type EtatCase = 'vide' | 'libre' | 'pleine' | 'surchargee' | 'absente' | 'fermee'

export function etatCase(c: CaseCharge): EtatCase {
  if (c.ouvres === 0) return 'fermee'
  if (c.absence >= c.ouvres) return 'absente'
  if (c.charge <= 1e-9) return 'vide'
  if (c.capacite <= 0 || c.charge > c.capacite + 1e-9) return 'surchargee'
  return c.charge / c.capacite >= SEUIL_PLEINE ? 'pleine' : 'libre'
}

/** Détail d'une affectation : une ligne `AAAA-MM-JJ: jours` par jour (virgule acceptée) ; les lignes illisibles sont ignorées. */
export function lireDetail(texte: string | null | undefined): Map<string, number> {
  const m = new Map<string, number>()
  for (const ligne of (texte ?? '').split('\n')) {
    const r = /^\s*(\d{4}-\d{2}-\d{2})\s*[:=]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(ligne)
    if (r && jourDe(r[1]!) === r[1]) m.set(r[1]!, Number(r[2]!.replace(',', '.')))
  }
  return m
}

/** Détail écrit : jours dans l'ordre, nombres au point ; `undefined` s'il est vide (la clé quitte le fichier). Les lignes illisibles de `ancien` sont gardées en tête. */
export function ecrireDetail(m: ReadonlyMap<string, number>, ancien?: string | null): string | undefined {
  const illisibles = (ancien ?? '').split('\n').filter((l) => l.trim() !== '' && lireDetail(l).size === 0)
  const lignes = [...illisibles, ...[...m].sort(([a], [b]) => a.localeCompare(b)).map(([j, v]) => `${j}: ${auCentieme(v)}`)]
  return lignes.length > 0 ? lignes.join('\n') : undefined
}

/** Une affectation lue : sa plage, sa charge par jour ouvré (et le détail qui l'emporte), son projet et sa version. */
type AffectationLue = { id: string; debut: string; fin: string; parJour: number; detail: ReadonlyMap<string, number>; projet: string; version: string; provisoire: boolean }

/** Charge d'une affectation un jour ouvré de sa plage. */
const chargeDuJour = (aff: AffectationLue, jour: string) => aff.detail.get(jour) ?? aff.parJour

function lireAffectations(r: ReglagesCharge, lignes: readonly LigneChargee[], feries: Feries, options: OptionsCalcul = {}): Map<string, AffectationLue[]> {
  const a = r.affectations
  const parRessource = new Map<string, AffectationLue[]>()
  if (!a) return parRessource
  const lire = (l: LigneChargee, apercu: boolean) => {
    const scenario = texte(l, a.scenario)
    if (!apercu && scenario !== null && scenario !== options.scenario) return
    const p = plage(l, a.debut, a.fin)
    if (!p) return
    const total = nombre(l, a.total)
    const parSemaine = nombre(l, a.jours)
    let parJour = 0
    if (total !== null && total > 0) {
      const n = ouvresDe(p, feries).length
      parJour = n > 0 ? total / n : 0
    } else if (parSemaine !== null && parSemaine > 0) parJour = parSemaine / 5
    const detail = lireDetail(a.detail ? texte(l, a.detail) : null)
    if (parJour <= 0 && ![...detail.values()].some((v) => v > 0)) return
    const lue = { id: l.id, ...p, parJour, detail, projet: ids(l, a.projet)[0] ?? '', version: a.version ? (ids(l, a.version)[0] ?? '') : '', provisoire: apercu || scenario !== null }
    for (const res of ids(l, a.ressource)) parRessource.set(res, [...(parRessource.get(res) ?? []), lue])
  }
  for (const l of lignes) lire(l, false)
  for (const l of options.apercu ?? []) lire(l, true)
  return parRessource
}

/**
 * Charge de chaque ressource, période par période. Chaque jour ouvré d'une
 * affectation pèse ses jours par semaine / 5 (ou son total / ses jours
 * ouvrés) : un férié réduit la charge comme la capacité. Une absence ne réduit
 * pas la charge, elle réduit la capacité (le conflit se voit).
 */
export function calculerCharge(
  r: ReglagesCharge,
  ressources: readonly LigneChargee[],
  affectations: readonly LigneChargee[],
  absences: readonly LigneChargee[],
  colonnes: readonly Periode[],
  options: OptionsCalcul = {},
): Map<string, CaseCharge[]> {
  const feries = r.feries ?? 'france'
  const ouvres = colonnes.map((p) => ouvresDe(p, feries))
  const parRessource = lireAffectations(r, affectations, feries, options)
  const absentes = new Map<string, LigneChargee[]>()
  const b = r.absences
  if (b) for (const l of absences) for (const id of ids(l, b.ressource)) absentes.set(id, [...(absentes.get(id) ?? []), l])

  const resultat = new Map<string, CaseCharge[]>()
  for (const res of ressources) {
    const cap = capaciteDe(r, res)
    const plagesAbsence = (absentes.get(res.id) ?? []).flatMap((l) => (b ? (plage(l, b.debut, b.fin) ?? []) : []))
    resultat.set(
      res.id,
      colonnes.map((periode, i) => {
        const jours = ouvres[i]!
        const absence = jours.filter((j) => plagesAbsence.some((p) => j >= p.debut && j <= p.fin)).length
        const c: CaseCharge = { ...periode, ouvres: jours.length, absence, capacite: (cap * (jours.length - absence)) / 5, charge: 0, parProjet: {}, parVersion: {}, affectations: [], parAffectation: {}, provisoire: 0, provisoireParProjet: {}, provisoireParVersion: {}, ajustee: false }
        for (const aff of parRessource.get(res.id) ?? []) {
          const couverts = jours.filter((j) => j >= aff.debut && j <= aff.fin)
          if (couverts.length === 0) continue
          const part = couverts.reduce((t, j) => t + chargeDuJour(aff, j), 0)
          if (couverts.some((j) => aff.detail.has(j))) c.ajustee = true
          c.charge += part
          c.parProjet[aff.projet] = (c.parProjet[aff.projet] ?? 0) + part
          const cle = aff.version || `@${aff.projet}`
          if (r.affectations?.version) c.parVersion[cle] = (c.parVersion[cle] ?? 0) + part
          if (aff.provisoire) {
            c.provisoire += part
            c.provisoireParProjet[aff.projet] = (c.provisoireParProjet[aff.projet] ?? 0) + part
            if (r.affectations?.version) c.provisoireParVersion[cle] = (c.provisoireParVersion[cle] ?? 0) + part
          }
          c.affectations.push(aff.id)
          c.parAffectation[aff.id] = part
        }
        return c
      }),
    )
  }
  return resultat
}

/** Charge d'un ensemble de ressources par période : par projet (ou par version) et capacité totale, pour le graphique. */
export function empiler(
  cases: ReadonlyMap<string, readonly CaseCharge[]>,
  ressources: readonly string[],
  n: number,
  par: 'projet' | 'version',
): { parts: Record<string, number>; provisoires: Record<string, number>; capacite: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const parts: Record<string, number> = {}
    const provisoires: Record<string, number> = {}
    let capacite = 0
    for (const id of ressources) {
      const c = cases.get(id)?.[i]
      if (!c) continue
      capacite += c.capacite
      for (const [cle, v] of Object.entries(par === 'version' ? c.parVersion : c.parProjet)) parts[cle] = (parts[cle] ?? 0) + v
      for (const [cle, v] of Object.entries(par === 'version' ? c.provisoireParVersion : c.provisoireParProjet)) provisoires[cle] = (provisoires[cle] ?? 0) + v
    }
    return { parts, provisoires, capacite }
  })
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
 */
export function couvrirBesoins(
  r: ReglagesCharge,
  ressources: readonly LigneChargee[],
  affectations: readonly LigneChargee[],
  besoins: readonly LigneChargee[],
  options: OptionsCalcul = {},
): Couverture[] {
  const bs = r.besoins
  if (!bs) return []
  const feries = r.feries ?? 'france'
  const roles = new Map(ressources.map((res) => [res.id, roleDe(r, res)]))
  const parRessource = lireAffectations(r, affectations, feries, options)
  return besoins.map((besoin) => {
    const projet = ids(besoin, bs.projet)[0] ?? null
    const role = texte(besoin, bs.role)
    const avant = jourDe(valeur(besoin, bs.avant))
    let affectes = 0
    if (projet) {
      const vues = new Set<string>()
      for (const [res, liste] of parRessource) {
        if (role !== null && roles.get(res) !== role) continue
        for (const aff of liste) {
          // Une affectation à plusieurs ressources compte une fois par ressource ; une même ligne vue deux fois, une seule.
          const cle = `${res}:${aff.id}`
          if (aff.projet !== projet || vues.has(cle)) continue
          vues.add(cle)
          const fin = avant && avant < aff.fin ? avant : aff.fin
          if (fin >= aff.debut) for (const j of ouvresDe({ debut: aff.debut, fin }, feries)) affectes += chargeDuJour(aff, j)
        }
      }
    }
    return { besoin: besoin.id, projet, role, avant, demandes: nombre(besoin, bs.jours) ?? 0, affectes: Math.round(affectes * 100) / 100 }
  })
}

/** Un morceau d'affectation : sa plage et sa charge, en jours par semaine ou au total. */
export type Morceau = { debut: string; fin: string; jours?: number; total?: number }

const auCentieme = (n: number) => Math.round(n * 100) / 100

/**
 * Ramène une affectation à `valeur` jours sur une période (« Camille à 0,5 j
 * ce lundi ») : elle est coupée en morceaux avant, pendant et après, dans cet
 * ordre ; avant et après gardent leur charge par jour, le morceau du milieu
 * prend `valeur` (au total si la base a une colonne de total, sinon en jours
 * par semaine). À 0, le milieu disparaît. Un morceau sans jour ouvré est
 * omis. Liste vide : l'affectation n'a plus lieu d'être. `null` si la période
 * ne touche pas l'affectation ou n'a aucun jour ouvré.
 */
export function ajusterSurPeriode(r: ReglagesCharge, aff: LigneChargee, p: Periode, valeur: number): Morceau[] | null {
  const a = r.affectations
  if (!a) return null
  const feries = r.feries ?? 'france'
  const pl = plage(aff, a.debut, a.fin)
  if (!pl || pl.fin < p.debut || pl.debut > p.fin) return null
  const milieu = { debut: pl.debut > p.debut ? pl.debut : p.debut, fin: pl.fin < p.fin ? pl.fin : p.fin }
  const nMilieu = ouvresDe(milieu, feries).length
  if (nMilieu === 0) return null
  const total = nombre(aff, a.total)
  const auTotal = total !== null && total > 0
  const parJour = auTotal ? total / Math.max(1, ouvresDe(pl, feries).length) : (nombre(aff, a.jours) ?? 0) / 5
  const bord = (debut: string, fin: string): Morceau[] => {
    const n = ouvresDe({ debut, fin }, feries).length
    if (n === 0) return []
    return [auTotal ? { debut, fin, total: auCentieme(parJour * n) } : { debut, fin, jours: nombre(aff, a.jours) ?? 0 }]
  }
  const morceaux: Morceau[] = []
  if (pl.debut < milieu.debut) morceaux.push(...bord(pl.debut, decaler(milieu.debut, -1)))
  if (valeur > 0) morceaux.push(a.total ? { ...milieu, total: auCentieme(valeur) } : { ...milieu, jours: auCentieme((valeur * 5) / nMilieu) })
  if (milieu.fin < pl.fin) morceaux.push(...bord(decaler(milieu.fin, 1), pl.fin))
  return morceaux
}

/**
 * Détail d'une affectation après avoir ramené une période à `valeur` jours,
 * répartis également sur ses jours ouvrés dans la plage ; un jour qui retombe
 * sur la charge habituelle quitte le détail. `undefined` : détail vide.
 * `null` si la période ne touche aucun jour ouvré de l'affectation.
 */
export function ajusterDetail(r: ReglagesCharge, aff: LigneChargee, p: Periode, valeur: number | null): string | undefined | null {
  const a = r.affectations
  if (!a?.detail) return null
  const feries = r.feries ?? 'france'
  const lue = lireAffectations({ ...r, affectations: { ...a, scenario: undefined } }, [ligneSansRessource(aff, a.ressource)], feries).get('')?.[0]
  const pl = plage(aff, a.debut, a.fin)
  if (!pl) return null
  const jours = ouvresDe({ debut: pl.debut > p.debut ? pl.debut : p.debut, fin: pl.fin < p.fin ? pl.fin : p.fin }, feries)
  if (jours.length === 0 || pl.fin < p.debut || pl.debut > p.fin) return null
  const ancien = texte(aff, a.detail)
  const detail = lireDetail(ancien)
  const habituel = lue?.parJour ?? 0
  for (const j of jours) {
    const v = valeur === null ? habituel : auCentieme(valeur / jours.length)
    if (Math.abs(v - habituel) < 1e-9) detail.delete(j)
    else detail.set(j, v)
  }
  return ecrireDetail(detail, ancien)
}

/** La ligne lue sous une seule ressource fictive (`''`), pour en connaître la charge habituelle. */
const ligneSansRessource = (l: LigneChargee, cle: string): LigneChargee => ({ ...l, cellules: { ...l.cellules, [cle]: { etat: 'ok', valeur: [''] } } })

/** Ligne d'aperçu (« Remplir ») : des valeurs pas encore écrites, lues comme une affectation. */
export const ligneApercu = (id: string, valeurs: Modifications): LigneChargee => ({
  id,
  chemin: '',
  cellules: Object.fromEntries(Object.entries(valeurs).flatMap(([k, v]) => (v === undefined ? [] : [[k, { etat: 'ok' as const, valeur: v }]]))),
  inconnus: [],
  corps: '',
  source: '',
  date: 0,
})

// ── Remplir ───────────────────────────────────────────────────────

export type ModeRemplissage = 'tot' | 'lisse'
export type Demande = { projet: string; version?: string | null; role?: string | null; jours: number; debut: string; fin: string; mode: ModeRemplissage; scenario?: string | null }
export type Remplissage = {
  /** Affectations à créer : la ressource et les valeurs (colonnes des affectations, titre à part). */
  affectations: { ressource: string; jours: number; valeurs: Modifications }[]
  places: number
  manque: number
}

/**
 * Place `jours` jours d'un projet sur une période, dans la capacité libre de
 * la situation affichée (plan réel et scénario de `options`), par les
 * ressources du rôle (toutes sans rôle) : au plus tôt (chaque jour, de la
 * ressource la plus disponible sur la période à la suivante) ou lissé (chaque
 * jour vise le reste divisé par les jours restants). Rien n'est écrit.
 */
export function remplir(
  r: ReglagesCharge,
  ressources: readonly LigneChargee[],
  affectations: readonly LigneChargee[],
  absences: readonly LigneChargee[],
  d: Demande,
  options: OptionsCalcul = {},
): Remplissage {
  const a = r.affectations
  const vide = { affectations: [], places: 0, manque: Math.max(0, d.jours) }
  if (!a || d.jours <= 0 || d.fin < d.debut) return vide
  const feries = r.feries ?? 'france'
  const jours = ouvresDe({ debut: d.debut, fin: d.fin }, feries)
  const candidats = ressources.filter((l) => !d.role || roleDe(r, l) === d.role)
  if (jours.length === 0 || candidats.length === 0) return vide
  const cases = calculerCharge(r, candidats, affectations, absences, jours.map((j) => ({ debut: j, fin: j })), options)
  const libre = new Map(candidats.map((l) => [l.id, cases.get(l.id)!.map((c) => Math.max(0, auCentieme(c.capacite - c.charge)))]))
  const somme = (t: number[]) => t.reduce((x, y) => x + y, 0)
  const ordre = [...candidats].sort((x, y) => somme(libre.get(y.id)!) - somme(libre.get(x.id)!))
  const alloue = new Map(candidats.map((l) => [l.id, jours.map(() => 0)]))
  let reste = d.jours
  jours.forEach((_, k) => {
    let quota = d.mode === 'lisse' ? reste / (jours.length - k) : reste
    for (const l of ordre) {
      if (quota <= 1e-9) break
      const pris = auCentieme(Math.min(libre.get(l.id)![k]!, quota))
      if (pris <= 0) continue
      alloue.get(l.id)![k] = pris
      quota -= pris
      reste = auCentieme(reste - pris)
    }
  })

  const communes: Modifications = {
    [a.projet]: [d.projet],
    ...(d.version && a.version ? { [a.version]: [d.version] } : {}),
    ...(d.scenario && a.scenario ? { [a.scenario]: d.scenario } : {}),
  }
  const resultat: Remplissage['affectations'] = []
  for (const l of ordre) {
    const t = alloue.get(l.id)!
    const utilises = t.flatMap((v, k) => (v > 0 ? [k] : []))
    if (utilises.length === 0) continue
    const total = auCentieme(somme(t))
    if (a.detail) {
      // Une affectation : les jours par semaine les plus fréquents, et le détail des jours qui s'en écartent.
      const freq = new Map<number, number>()
      for (const k of utilises) freq.set(t[k]!, (freq.get(t[k]!) ?? 0) + 1)
      const parJour = [...freq].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0]![0]
      const premier = utilises[0]!
      const dernier = utilises.at(-1)!
      const detail = new Map<string, number>()
      for (let k = premier; k <= dernier; k++) if (Math.abs(t[k]! - parJour) > 1e-9) detail.set(jours[k]!, t[k]!)
      resultat.push({
        ressource: l.id,
        jours: total,
        valeurs: { ...communes, [a.ressource]: [l.id], [a.debut]: jours[premier]!, [a.fin]: jours[dernier]!, [a.jours]: auCentieme(parJour * 5), [a.detail]: ecrireDetail(detail) },
      })
      continue
    }
    // Sans détail : une affectation par suite de jours ouvrés égaux.
    let k = 0
    while (k < t.length) {
      if (t[k]! <= 0) {
        k++
        continue
      }
      let fin = k
      while (fin + 1 < t.length && Math.abs(t[fin + 1]! - t[k]!) < 1e-9) fin++
      const n = fin - k + 1
      resultat.push({
        ressource: l.id,
        jours: auCentieme(t[k]! * n),
        valeurs: { ...communes, [a.ressource]: [l.id], [a.debut]: jours[k]!, [a.fin]: jours[fin]!, ...(a.total ? { [a.total]: auCentieme(t[k]! * n) } : { [a.jours]: auCentieme(t[k]! * 5) }) },
      })
      k = fin + 1
    }
  }
  const places = auCentieme(d.jours - reste)
  return { affectations: resultat, places, manque: auCentieme(Math.max(0, reste)) }
}

/** Nom d'un niveau tiré du nom de sa base, au singulier : « Programmes » → « programme ». */
export function nomNiveau(nom: string | undefined, defaut: string): string {
  const n = (nom ?? '').trim().toLowerCase()
  if (!n) return defaut
  return n.endsWith('s') && !n.endsWith('ss') ? n.slice(0, -1) : n
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
    const nombres = saisies(s, 'number')
    const total = nombres.length > 1 ? nombres.find((c) => /total/i.test(`${c.cle} ${c.nom}`)) : undefined
    const jours = nombres.find((c) => c !== total)
    // Version : une relation vers une base elle-même reliée à la base des projets.
    const version =
      projet &&
      colonnesDe(s, 'relation').find(
        (c): c is ColonneRelation => c.type === 'relation' && c.proprietaire && c.cible !== base && c.cible !== projet.cible && relationsVers(bases.get(c.cible)?.depot?.schema ?? schema, projet.cible).length > 0,
      )
    const detail = saisies(s, 'text').find((c) => c.cle !== s.champTitre && /d[ée]tail/i.test(`${c.cle} ${c.nom}`))
    const scenario = saisies(s, 'select').find((c) => /sc[ée]nario/i.test(`${c.cle} ${c.nom}`))
    return ressource && projet && dates[0] && jours ? [{ id, ressource, projet, dates, jours, total, version, detail, scenario }] : []
  })[0]
  if (aff) {
    r.affectations = { base: aff.id, ressource: aff.ressource.cle, projet: aff.projet.cle, debut: aff.dates[0]!.cle, fin: (aff.dates[1] ?? aff.dates[0]!).cle, jours: aff.jours.cle }
    if (aff.total) r.affectations.total = aff.total.cle
    if (aff.version) r.affectations.version = aff.version.cle
    if (aff.detail) r.affectations.detail = aff.detail.cle
    if (aff.scenario) r.affectations.scenario = aff.scenario.cle
  }

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
