import type { LigneChargee } from './base'
import type { TypeCreable } from './depot-espace'
import { natureDe, type Colonne } from './schema'
import { estDateValide, lireNombre, type Valeur } from './valeurs'

// Import et export : les lignes d'une vue en tableau (CSV, Markdown), et un CSV
// relu en colonnes typées pour créer une base ou y ajouter des lignes.

export type Grille = { entetes: string[]; lignes: string[][] }

/**
 * Libellé d'un élément de liste : l'identifiant d'une relation devient le titre
 * de la ligne liée (résolu par l'appelant, qui connaît les autres bases).
 */
export type Libelle = (colonne: Colonne, element: string) => string

/**
 * Les lignes d'une vue, colonnes affichées dans l'ordre de la vue.
 * `lisible` : nombres et dates à la française (Markdown) ; sinon des valeurs
 * que tout tableur relit (CSV) : nombre avec un point, date ISO.
 */
export function grilleDeVue(lignes: readonly LigneChargee[], colonnes: readonly Colonne[], libelle: Libelle, lisible: boolean): Grille {
  return {
    entetes: colonnes.map((c) => c.nom),
    lignes: lignes.map((l) => colonnes.map((c) => texteCellule(l, c, libelle, lisible))),
  }
}

function texteCellule(ligne: LigneChargee, c: Colonne, libelle: Libelle, lisible: boolean): string {
  const cellule = ligne.cellules[c.cle]
  if (!cellule) return ''
  if (cellule.etat === 'invalide') return typeof cellule.brut === 'string' ? cellule.brut : JSON.stringify(cellule.brut) ?? ''
  const v = cellule.valeur
  switch (natureDe(c)) {
    case 'nombre': {
      const n = Number(v)
      const pourcent = c.type === 'rollup' && c.calcul.startsWith('pourcent')
      const texte = lisible ? n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : String(Math.round(n * 1e6) / 1e6)
      return pourcent && lisible ? `${texte} %` : texte
    }
    case 'date':
      return lisible ? dateLisible(String(v)) : String(v)
    case 'case':
      return v === true ? 'oui' : 'non'
    case 'liste':
      return (Array.isArray(v) ? v : [String(v)]).map((x) => libelle(c, x)).join(', ')
    default:
      return String(v)
  }
}

function dateLisible(iso: string): string {
  const [date, heure] = iso.split('T')
  const [a, m, j] = (date ?? '').split('-')
  return `${j}/${m}/${a}${heure ? ` ${heure}` : ''}`
}

// ── CSV ──────────────────────────────────────────────────────────

/**
 * CSV (RFC 4180, fins de ligne CRLF). Un texte qui commencerait par `=`, `+`,
 * `-` ou `@` est préfixé d'une apostrophe, sinon un tableur l'exécuterait comme
 * une formule ; les nombres négatifs restent intacts.
 */
export function versCsv(g: Grille, separateur = ','): string {
  const champ = (s: string) => {
    const neutre = /^[=+\-@\t\r]/.test(s) && lireNombre(s) == null ? `'${s}` : s
    return /["\r\n]/.test(neutre) || neutre.includes(separateur) ? `"${neutre.replace(/"/g, '""')}"` : neutre
  }
  return [g.entetes, ...g.lignes].map((l) => l.map(champ).join(separateur)).join('\r\n') + '\r\n'
}

/**
 * Relit un CSV : séparateur deviné sur la première ligne (virgule,
 * point-virgule ou tabulation, hors guillemets), BOM ignoré, champs entre
 * guillemets sur plusieurs lignes acceptés. Les lignes entièrement vides sont
 * retirées.
 */
export function lireCsv(texte: string): string[][] {
  const t = texte.replace(/^﻿/, '')
  const sep = devinerSeparateur(t)
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let guillemets = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') guillemets = false
      else champ += c
    } else if (c === '"' && champ === '') guillemets = true
    else if (c === sep) {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else champ += c
  }
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return lignes.filter((l) => l.some((x) => x.trim() !== ''))
}

function devinerSeparateur(t: string): string {
  const compte: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let guillemets = false
  for (const c of t) {
    if (c === '"') guillemets = !guillemets
    else if (!guillemets && (c === '\n' || c === '\r')) break
    else if (!guillemets && c in compte) compte[c]!++
  }
  const [sep, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0]!
  return n > 0 ? sep : ','
}

// ── Markdown ─────────────────────────────────────────────────────

/** Tableau Markdown (GFM) : `|` échappé, retours à la ligne en `<br>`. */
export function versMarkdown(g: Grille): string {
  const champ = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  const ligne = (l: string[]) => `| ${l.map(champ).join(' | ')} |`
  return [ligne(g.entetes), `| ${g.entetes.map(() => '---').join(' | ')} |`, ...g.lignes.map(ligne)].join('\n') + '\n'
}

/**
 * Tableau HTML, pour qu'un tableur, un traitement de texte ou Notion reçoive
 * des cases en collant. Sans en-têtes pour une plage de cellules.
 */
export function versHtml(g: Grille, avecEntetes = true): string {
  const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, '<br>')
  const ligne = (l: string[], balise: 'th' | 'td') => `<tr>${l.map((x) => `<${balise}>${echapper(x)}</${balise}>`).join('')}</tr>`
  const tete = avecEntetes ? `<thead>${ligne(g.entetes, 'th')}</thead>` : ''
  return `<table>${tete}<tbody>${g.lignes.map((l) => ligne(l, 'td')).join('')}</tbody></table>`
}

/** Cases séparées par des tabulations, comme un tableur les copie ; sans en-têtes (plage de cellules). */
export function versTsv(lignes: readonly string[][]): string {
  const champ = (s: string) => (/["\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return lignes.map((l) => l.map(champ).join('\t')).join('\r\n')
}

/**
 * Relit un tableau Markdown (GFM) : `null` si le texte n'en est pas un (il
 * faut la ligne de séparation `---` sous les en-têtes). `\\|` et `<br>`
 * redeviennent `|` et un retour à la ligne, comme les écrit `versMarkdown`.
 */
export function lireMarkdown(texte: string): string[][] | null {
  const lignes = texte.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '')
  if (lignes.length < 2 || !lignes.every((l) => l.includes('|'))) return null
  const cases = (l: string) => {
    const brut = l.replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
    const champs: string[] = []
    let champ = ''
    for (let i = 0; i < brut.length; i++) {
      const c = brut[i]!
      if (c === '\\' && (brut[i + 1] === '|' || brut[i + 1] === '\\')) champ += brut[++i]
      else if (c === '|') {
        champs.push(champ)
        champ = ''
      } else champ += c
    }
    champs.push(champ)
    return champs.map((x) => x.trim().replace(/<br\s*\/?>/gi, '\n'))
  }
  const [entetes, separation, ...corps] = lignes.map(cases)
  if (!separation!.every((x) => /^:?-{1,}:?$/.test(x))) return null
  return [entetes!, ...corps]
}

/** Texte collé dans un tableau : un tableau Markdown s'il en est un, sinon du CSV (tabulations d'un tableur comprises). */
export function lireTableauColle(texte: string): string[][] {
  return lireMarkdown(texte) ?? lireCsv(texte)
}

// ── Import ───────────────────────────────────────────────────────

export type ColonneImportee = { nom: string; type: TypeCreable; options: string[] }

const OUI = ['oui', 'true', 'vrai', 'x', 'yes', '1', '✓']
const NON = ['non', 'false', 'faux', 'no', '0', '']

/** Date ISO depuis `AAAA-MM-JJ` (heure éventuelle) ou `JJ/MM/AAAA` ; `null` sinon. */
export function lireDate(s: string): string | null {
  const t = s.trim()
  if (estDateValide(t)) return t
  const iso = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2})?$/.exec(t)
  if (iso && estDateValide(`${iso[1]}T${iso[2]}`)) return `${iso[1]}T${iso[2]}`
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (fr) {
    const d = `${fr[3]}-${fr[2]!.padStart(2, '0')}-${fr[1]!.padStart(2, '0')}`
    if (estDateValide(d)) return d
  }
  return null
}

/**
 * Types devinés d'après les valeurs : nombre, date, case, lien, sélection
 * (peu de valeurs distinctes qui se répètent) ou texte. La première colonne
 * est le titre, toujours du texte.
 */
export function deduireColonnes(entetes: readonly string[], lignes: readonly string[][]): ColonneImportee[] {
  return entetes.map((nom, i) => {
    const valeurs = lignes.map((l) => (l[i] ?? '').trim()).filter((v) => v !== '')
    const colonne = (type: TypeCreable, options: string[] = []): ColonneImportee => ({ nom: nom.trim() || `Colonne ${i + 1}`, type, options })
    if (i === 0 || valeurs.length === 0) return colonne('text')
    if (valeurs.every((v) => typeof lireNombre(v) === 'number')) return colonne('number')
    if (valeurs.every((v) => lireDate(v) !== null)) return colonne('date')
    if (valeurs.every((v) => OUI.includes(v.toLowerCase()) || NON.includes(v.toLowerCase()))) return colonne('checkbox')
    if (valeurs.every((v) => /^https?:\/\/\S+$/.test(v))) return colonne('url')
    const distinctes = [...new Set(valeurs)]
    if (distinctes.length <= 12 && distinctes.length < valeurs.length && distinctes.every((v) => v.length <= 40)) return colonne('select', distinctes)
    return colonne('text')
  })
}

/** Valeur d'une cellule importée, `undefined` si vide ou illisible pour ce type. */
export function convertirValeur(type: TypeCreable, brut: string): Valeur | undefined {
  const s = brut.trim()
  if (s === '') return undefined
  switch (type) {
    case 'number': {
      const n = lireNombre(s)
      return typeof n === 'number' ? n : undefined
    }
    case 'date':
      return lireDate(s) ?? undefined
    case 'checkbox':
      return OUI.includes(s.toLowerCase()) ? true : undefined
    case 'multiselect':
      return s.split(/\s*[,;]\s*/).filter((x) => x !== '')
    default:
      return s
  }
}
