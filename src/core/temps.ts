import type { LigneChargee } from './base'
import type { Modifications } from './ligne'
import type { Colonne } from './schema'
import { estDateValide } from './valeurs'

// Dates des vues temporelles (spec §7) : calendrier et timeline. Tout se
// calcule sur des jours `AAAA-MM-JJ` en UTC pur, sans fuseau ni horloge : une
// date saisie avec une heure garde son heure quand on la déplace.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
export const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

function enUTC(iso: string): Date {
  const [a, m, j] = iso.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, j!))
}

/** 0 = dimanche … 6 = samedi. */
export function jourSemaine(iso: string): number {
  return enUTC(iso).getUTCDay()
}

export function decaler(iso: string, jours: number): string {
  const d = enUTC(iso)
  d.setUTCDate(d.getUTCDate() + jours)
  return d.toISOString().slice(0, 10)
}

/** Nombre de jours de `a` à `b` (négatif si `b` est avant). */
export function ecartJours(a: string, b: string): number {
  return Math.round((enUTC(b).getTime() - enUTC(a).getTime()) / 86_400_000)
}

export function lundiDe(iso: string): string {
  return decaler(iso, -((jourSemaine(iso) + 6) % 7))
}

export function debutMois(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

export function ajouterMois(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number)
  const total = a! * 12 + (m! - 1) + n
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}-01`
}

export function libelleMois(iso: string): string {
  return `${MOIS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** Jour d'une valeur de date (`AAAA-MM-JJ` ou `AAAA-MM-JJTHH:mm`), null sinon. */
export function jourDe(v: unknown): string | null {
  return typeof v === 'string' && estDateValide(v) ? v.slice(0, 10) : null
}

/** Décale une valeur de date d'un nombre de jours, en gardant son heure. */
export function decalerValeur(v: string, jours: number): string {
  return decaler(v.slice(0, 10), jours) + v.slice(10)
}

/** Semaines (lundi → dimanche) qui couvrent le mois de `iso`. */
export function grilleMois(iso: string): string[][] {
  const premier = debutMois(iso)
  const dernier = decaler(ajouterMois(premier, 1), -1)
  const semaines: string[][] = []
  for (let lundi = lundiDe(premier); lundi <= dernier; lundi = decaler(lundi, 7)) {
    semaines.push(Array.from({ length: 7 }, (_, i) => decaler(lundi, i)))
  }
  return semaines
}

// ── Plages ──────────────────────────────────────────────────────────

export type Plage = { debut: string; fin: string }

const valeur = (ligne: LigneChargee, c: Colonne | undefined): unknown => {
  const cellule = c ? ligne.cellules[c.cle] : undefined
  return cellule?.etat === 'ok' ? cellule.valeur : undefined
}

/**
 * Plage d'une ligne : du champ de début au champ de fin. Sans fin, ou avec une
 * fin avant le début (saisie à la main), la plage tient en un jour. Sans début,
 * pas de plage : la ligne n'a pas de place sur l'axe du temps.
 */
export function plageDe(ligne: LigneChargee, debut: Colonne, fin?: Colonne): Plage | null {
  const d = jourDe(valeur(ligne, debut))
  if (!d) return null
  const f = jourDe(valeur(ligne, fin))
  return { debut: d, fin: f && f >= d ? f : d }
}

export type Geste = 'deplacer' | 'debut' | 'fin'

/**
 * Valeurs à écrire après un glisser de `jours` : déplacer décale début et fin,
 * étirer un bord ne touche que ce bord, sans passer l'autre. Étirer la fin
 * d'une ligne qui n'en a pas encore la crée à partir du début. Seules les
 * colonnes qui changent sont renvoyées.
 */
export function apresGeste(ligne: LigneChargee, geste: Geste, jours: number, debut: Colonne, fin?: Colonne): Modifications {
  const d = valeur(ligne, debut)
  if (typeof d !== 'string' || !jourDe(d) || jours === 0) return {}
  const f = valeur(ligne, fin)
  const finLue = typeof f === 'string' && jourDe(f) && f.slice(0, 10) >= d.slice(0, 10) ? f : undefined
  const modifs: Modifications = {}
  if (geste === 'deplacer') {
    modifs[debut.cle] = decalerValeur(d, jours)
    if (fin && finLue) modifs[fin.cle] = decalerValeur(finLue, jours)
  } else if (geste === 'debut') {
    const limite = (finLue ?? d).slice(0, 10)
    const nouveau = decalerValeur(d, jours)
    modifs[debut.cle] = nouveau.slice(0, 10) > limite ? limite + d.slice(10) : nouveau
  } else if (fin) {
    const base = finLue ?? d
    const nouveau = decalerValeur(base, jours)
    modifs[fin.cle] = nouveau.slice(0, 10) < d.slice(0, 10) ? d : nouveau
  }
  return modifs
}

/** Même geste que `apresGeste`, sur une plage : l'aperçu pendant le glisser. */
export function plageApresGeste(p: Plage, geste: Geste, jours: number): Plage {
  if (geste === 'deplacer') return { debut: decaler(p.debut, jours), fin: decaler(p.fin, jours) }
  if (geste === 'debut') {
    const debut = decaler(p.debut, jours)
    return { debut: debut > p.fin ? p.fin : debut, fin: p.fin }
  }
  const fin = decaler(p.fin, jours)
  return { debut: p.debut, fin: fin < p.debut ? p.debut : fin }
}

// ── Calendrier ─────────────────────────────────────────────────────

export type Segment<T> = {
  element: T
  plage: Plage
  /** Colonne de départ dans la semaine (0 = lundi) et nombre de jours couverts. */
  colonne: number
  largeur: number
  /** Rangée dans la semaine : deux segments d'une même rangée ne se chevauchent pas. */
  rang: number
  /** La plage commence avant cette semaine, ou finit après. */
  coupeAvant: boolean
  coupeApres: boolean
}

/**
 * Place les plages qui touchent la semaine commençant `lundi` : les plus
 * anciennes puis les plus longues d'abord, chacune dans la première rangée
 * libre. L'ordre d'entrée départage les égalités (tri de la vue).
 */
export function placerSemaine<T>(elements: readonly { element: T; plage: Plage }[], lundi: string): Segment<T>[] {
  const dimanche = decaler(lundi, 6)
  const touchent = elements
    .map((e, i) => ({ ...e, i }))
    .filter((e) => e.plage.debut <= dimanche && e.plage.fin >= lundi)
    .sort((a, b) => (a.plage.debut < b.plage.debut ? -1 : a.plage.debut > b.plage.debut ? 1 : b.plage.fin.localeCompare(a.plage.fin) || a.i - b.i))
  const occupees: boolean[][] = []
  return touchent.map(({ element, plage }) => {
    const colonne = plage.debut < lundi ? 0 : ecartJours(lundi, plage.debut)
    const largeur = (plage.fin > dimanche ? 6 : ecartJours(lundi, plage.fin)) - colonne + 1
    let rang = 0
    while (occupees[rang]?.slice(colonne, colonne + largeur).some(Boolean)) rang++
    const rangee = (occupees[rang] ??= Array<boolean>(7).fill(false))
    for (let c = colonne; c < colonne + largeur; c++) rangee[c] = true
    return { element, plage, colonne, largeur, rang, coupeAvant: plage.debut < lundi, coupeApres: plage.fin > dimanche }
  })
}

// ── Timeline ───────────────────────────────────────────────────────

export type Echelle = 'semaine' | 'mois' | 'trimestre'

/**
 * Étendue affichée par la timeline : toutes les plages et aujourd'hui, avec de
 * la marge, calée sur un début de mois pour que les graduations tombent juste.
 */
export function etendue(plages: readonly Plage[], aujourdhui: string): Plage {
  let debut = aujourdhui
  let fin = aujourdhui
  for (const p of plages) {
    if (p.debut < debut) debut = p.debut
    if (p.fin > fin) fin = p.fin
  }
  return { debut: ajouterMois(debutMois(debut), -1), fin: decaler(ajouterMois(debutMois(fin), 3), -1) }
}

/**
 * Sous-lignes de plages dessinées sur une même rangée (timeline, niveau « sur
 * la ligne ») : chaque plage va sur la première sous-ligne où elle ne touche
 * aucune autre, dans l'ordre des débuts. Rend l'indice de sous-ligne de chaque
 * plage, dans l'ordre reçu.
 */
export function empiler(plages: readonly Plage[]): number[] {
  const ordre = plages.map((p, i) => ({ p, i })).sort((a, b) => a.p.debut.localeCompare(b.p.debut) || a.p.fin.localeCompare(b.p.fin))
  const finsParSousLigne: string[] = []
  const sousLignes: number[] = new Array(plages.length)
  for (const { p, i } of ordre) {
    let s = finsParSousLigne.findIndex((fin) => fin < p.debut)
    if (s < 0) s = finsParSousLigne.length
    finsParSousLigne[s] = p.fin
    sousLignes[i] = s
  }
  return sousLignes
}

/** Plage qui couvre toutes les autres (en-tête d'un groupe de la timeline) ; null s'il n'y en a aucune. */
export function enveloppe(plages: readonly (Plage | null)[]): Plage | null {
  const presentes = plages.filter((p): p is Plage => p !== null)
  if (presentes.length === 0) return null
  return {
    debut: presentes.reduce((m, p) => (p.debut < m ? p.debut : m), presentes[0]!.debut),
    fin: presentes.reduce((m, p) => (p.fin > m ? p.fin : m), presentes[0]!.fin),
  }
}

export type Graduation = { debut: string; jours: number; libelle: string }

/** Graduations de l'en-tête : une rangée haute (mois ou trimestres) et une rangée basse (jours, semaines ou mois). */
export function graduations(e: Plage, echelle: Echelle): { haut: Graduation[]; bas: Graduation[] } {
  const couper = (pas: (d: string) => string, libelle: (d: string) => string, premier: string): Graduation[] => {
    const liste: Graduation[] = []
    for (let d = premier; d <= e.fin; d = pas(d)) {
      const debut = d < e.debut ? e.debut : d
      const suivant = pas(d)
      const fin = suivant > e.fin ? decaler(e.fin, 1) : suivant
      liste.push({ debut, jours: ecartJours(debut, fin), libelle: libelle(d) })
    }
    return liste
  }
  const mois = couper((d) => ajouterMois(d, 1), libelleMois, debutMois(e.debut))
  if (echelle === 'semaine') return { haut: mois, bas: couper((d) => decaler(d, 1), (d) => String(Number(d.slice(8))), e.debut) }
  if (echelle === 'mois') return { haut: mois, bas: couper((d) => decaler(d, 7), (d) => String(Number(d.slice(8))), lundiDe(e.debut)) }
  const trimestre = (d: string) => ajouterMois(d, 3 - ((Number(d.slice(5, 7)) - 1) % 3))
  return {
    haut: couper(trimestre, (d) => `T${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1} ${d.slice(0, 4)}`, debutMois(e.debut)),
    bas: mois.map((g) => ({ ...g, libelle: MOIS_COURTS[Number(g.debut.slice(5, 7)) - 1]! })),
  }
}

// ── Jours fériés (plan de charge §21, formules §6) ────────────────

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

// ── Heures (spec §3 « Date avec heure ») ─────────────────────────

/** Minutes depuis l'origine d'une date `AAAA-MM-JJ` ou `AAAA-MM-JJTHH:mm` (heure locale, sans fuseau ; sans heure : minuit). */
export function minutesDe(v: string): number {
  const h = Number(v.slice(11, 13)) || 0
  const m = Number(v.slice(14, 16)) || 0
  return enUTC(v.slice(0, 10)).getTime() / 60_000 + h * 60 + m
}

/** Heures de `a` à `b`, décimales comprises (négatif si `b` est avant). */
export function ecartHeures(a: string, b: string): number {
  return (minutesDe(b) - minutesDe(a)) / 60
}

/** Un jour ouvré : du lundi au vendredi, hors jours fériés de France. */
function ouvre(jour: string): boolean {
  const j = jourSemaine(jour)
  return j !== 0 && j !== 6 && !feriesFrance(Number(jour.slice(0, 4))).has(jour)
}

/** Jours ouvrés de `a` à `b`, bornes comprises (négatif si `b` est avant). */
export function joursOuvres(a: string, b: string): number {
  const [debut, fin, signe] = a.slice(0, 10) <= b.slice(0, 10) ? [a.slice(0, 10), b.slice(0, 10), 1] : [b.slice(0, 10), a.slice(0, 10), -1]
  let n = 0
  for (let j = debut; j <= fin; j = decaler(j, 1)) if (ouvre(j)) n++
  return signe * n
}

/** `HH:mm` → minutes depuis minuit ; `null` si ce n'est pas une heure. */
export function lireHeure(h: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim())
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Heures de `a` à `b` comptées dans la plage `[debut, fin]` (minutes depuis
 * minuit) des jours ouvrés seulement ; négatif si `b` est avant.
 */
export function heuresOuvrees(a: string, b: string, debut: number, fin: number): number {
  if (minutesDe(b) < minutesDe(a)) return -heuresOuvrees(b, a, debut, fin)
  const de = minutesDe(a)
  const a_ = minutesDe(b)
  let total = 0
  for (let j = a.slice(0, 10); j <= b.slice(0, 10); j = decaler(j, 1)) {
    if (!ouvre(j)) continue
    const minuit = minutesDe(j)
    const d = Math.max(de, minuit + debut)
    const f = Math.min(a_, minuit + fin)
    if (f > d) total += f - d
  }
  return total / 60
}
