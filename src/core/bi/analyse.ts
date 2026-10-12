import { estObjet } from '../schema'
import type { ResultatSql } from './sql'

// Analyse dans les dashboards (spec §10 « Analyse ») : des requêtes SQL
// nommées, des paramètres, et des blocs qui montrent un résultat (chiffre clé,
// graphique, tableau, texte). Lecture tolérante : un réglage mal formé est
// écarté avec un avertissement, le bloc reste.

export const TYPES_VISUEL = ['valeur', 'barres', 'courbe', 'aire', 'secteurs', 'nuage', 'tableau', 'texte'] as const
export type TypeVisuel = (typeof TYPES_VISUEL)[number]

export const FORMATS = ['nombre', 'entier', 'decimal', 'pourcent', 'euros', 'date'] as const
export type Format = (typeof FORMATS)[number]

/** Opérateurs d'une règle de mise en forme, écrits en tête de `si` (`'> 50'`). */
export const COMPARAISONS = ['>=', '<=', '!=', '>', '<', '='] as const
export type Comparaison = (typeof COMPARAISONS)[number]

/**
 * Règle de mise en forme conditionnelle : la première qui s'applique gagne.
 * `colonne` : la colonne testée (par défaut, la mesure du bloc) ; sur un
 * tableau, `ligne` colore toute la ligne plutôt que la cellule.
 */
export type Regle = { colonne?: string; si: string; couleur: string; ligne?: boolean }

export type BlocAnalyse = {
  type: TypeVisuel
  titre?: string
  /** Nom d'une requête du dashboard. */
  donnees?: string
  /** Requête propre au bloc, à la place de `donnees`. */
  sql?: string
  largeur?: number
  x?: string
  /** Une ou plusieurs colonnes de mesure. */
  y?: string[]
  serie?: string
  taille?: string
  valeur?: string
  comparer?: string
  empile?: boolean
  horizontal?: boolean
  colonnes?: string[]
  /** Un format pour tout le bloc, ou un par colonne. */
  format?: Format | Record<string, Format>
  regles?: Regle[]
  texte?: string
}

export const TYPES_PARAMETRE = ['choix', 'texte', 'nombre', 'date', 'mois', 'periode'] as const
export type TypeParametre = (typeof TYPES_PARAMETRE)[number]

export type Parametre = {
  nom: string
  libelle?: string
  type: TypeParametre
  /** Choix : une liste, ou le nom d'une requête dont la première colonne donne les options. */
  options?: string[] | string
  defaut?: unknown
  valeur?: unknown
}

/** Nom de requête ou de paramètre : un identifiant SQL simple. */
export const NOM_VALIDE = /^[a-z_][a-z0-9_]*$/

const texte = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x : undefined)
const listeTextes = (x: unknown): string[] | undefined => {
  const l = (Array.isArray(x) ? x : typeof x === 'string' ? [x] : []).filter((v): v is string => typeof v === 'string' && v !== '')
  return l.length > 0 ? l : undefined
}

export const estFormat = (x: unknown): x is Format => (FORMATS as readonly string[]).includes(String(x))

/** Lit `si` : un opérateur, puis une valeur (nombre, texte) ou un nom de colonne. */
export function lireCondition(si: string): { comparaison: Comparaison; operande: string } | null {
  const s = si.trim()
  const comparaison = COMPARAISONS.find((c) => s.startsWith(c))
  if (!comparaison) return null
  const operande = s.slice(comparaison.length).trim().replace(/^'(.*)'$|^"(.*)"$/, '$1$2')
  return operande === '' ? null : { comparaison, operande }
}

/** Le bloc d'analyse décrit par un objet du fichier ; `null` si son type est inconnu. */
export function lireBlocAnalyse(b: Record<string, unknown>, ou: string, avertissements: string[]): BlocAnalyse | null {
  if (!(TYPES_VISUEL as readonly string[]).includes(String(b.type))) {
    avertissements.push(`${ou} ignoré : type « ${String(b.type)} » inconnu (${TYPES_VISUEL.join(', ')})`)
    return null
  }
  const bloc: BlocAnalyse = { type: b.type as TypeVisuel }
  for (const cle of ['titre', 'donnees', 'sql', 'x', 'serie', 'taille', 'valeur', 'comparer', 'texte'] as const) {
    const v = texte(b[cle])
    if (v !== undefined) bloc[cle] = v
  }
  const y = listeTextes(b.y)
  if (y) bloc.y = y
  const colonnes = listeTextes(b.colonnes)
  if (colonnes) bloc.colonnes = colonnes
  if (b.empile === true) bloc.empile = true
  if (b.horizontal === true) bloc.horizontal = true
  if (estFormat(b.format)) bloc.format = b.format
  else if (estObjet(b.format)) {
    const parColonne = Object.fromEntries(Object.entries(b.format).filter((e): e is [string, Format] => estFormat(e[1])))
    if (Object.keys(parColonne).length > 0) bloc.format = parColonne
  } else if (b.format !== undefined) avertissements.push(`${ou} : format « ${String(b.format)} » inconnu (${FORMATS.join(', ')})`)
  if (Array.isArray(b.regles)) {
    const regles = b.regles.flatMap((r): Regle[] => {
      if (estObjet(r) && typeof r.si === 'string' && lireCondition(r.si) && typeof r.couleur === 'string') {
        return [{ ...(typeof r.colonne === 'string' && { colonne: r.colonne }), si: r.si, couleur: r.couleur, ...(r.ligne === true && { ligne: true }) }]
      }
      avertissements.push(`${ou} : règle ignorée (« si » comme '> 50' et « couleur » attendus)`)
      return []
    })
    if (regles.length > 0) bloc.regles = regles
  }
  if (bloc.type !== 'texte' && !bloc.donnees && !bloc.sql) avertissements.push(`${ou} : ni « donnees » ni « sql », le bloc n'a rien à montrer`)
  return bloc
}

/** L'objet écrit dans le fichier pour un bloc d'analyse (clés dans un ordre stable). */
export function objetBlocAnalyse(b: BlocAnalyse): Record<string, unknown> {
  const { type, titre, donnees, sql, largeur, ...reste } = b
  return Object.fromEntries(
    Object.entries({ type, titre, donnees, sql, ...reste, largeur }).filter(([, v]) => v !== undefined),
  )
}

export function lireRequetes(brut: unknown, id: string, avertissements: string[]): Record<string, string> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) {
    avertissements.push(`Dashboard ${id} : « requetes » ignoré (une liste nom: requête attendue)`)
    return {}
  }
  const requetes: Record<string, string> = {}
  for (const [nom, sql] of Object.entries(brut)) {
    if (!NOM_VALIDE.test(nom)) avertissements.push(`Dashboard ${id} : requête « ${nom} » ignorée (nom en minuscules, chiffres et _)`)
    else if (typeof sql !== 'string' || sql.trim() === '') avertissements.push(`Dashboard ${id} : requête « ${nom} » vide`)
    else requetes[nom] = sql
  }
  return requetes
}

export function lireParametres(brut: unknown, id: string, avertissements: string[]): Parametre[] {
  if (brut === undefined) return []
  if (!Array.isArray(brut)) {
    avertissements.push(`Dashboard ${id} : « parametres » ignoré (une liste attendue)`)
    return []
  }
  const vus = new Set<string>()
  return brut.flatMap((p): Parametre[] => {
    if (!estObjet(p) || typeof p.nom !== 'string' || !NOM_VALIDE.test(p.nom) || vus.has(p.nom)) {
      avertissements.push(`Dashboard ${id} : paramètre ignoré (nom manquant, en double ou invalide)`)
      return []
    }
    if (!(TYPES_PARAMETRE as readonly string[]).includes(String(p.type))) {
      avertissements.push(`Dashboard ${id} : paramètre « ${p.nom} » ignoré (type parmi ${TYPES_PARAMETRE.join(', ')})`)
      return []
    }
    vus.add(p.nom)
    const options = typeof p.options === 'string' ? p.options : listeTextes(p.options)
    return [
      {
        nom: p.nom,
        type: p.type as TypeParametre,
        ...(texte(p.libelle) && { libelle: p.libelle as string }),
        ...(options !== undefined && { options }),
        ...(p.defaut !== undefined && { defaut: p.defaut }),
        ...(p.valeur !== undefined && { valeur: p.valeur }),
      },
    ]
  })
}

export function objetParametre(p: Parametre): Record<string, unknown> {
  return Object.fromEntries(Object.entries({ nom: p.nom, libelle: p.libelle, type: p.type, options: p.options, defaut: p.defaut, valeur: p.valeur }).filter(([, v]) => v !== undefined))
}

const LIBELLES_VISUEL: Record<TypeVisuel, string> = {
  valeur: 'Chiffre clé',
  barres: 'Barres',
  courbe: 'Courbe',
  aire: 'Aire',
  secteurs: 'Secteurs',
  nuage: 'Nuage de points',
  tableau: 'Tableau SQL',
  texte: 'Texte',
}

/** « Barres « Par statut » », pour l'aperçu et les messages. */
export const nomAnalyse = (b: BlocAnalyse) => `${LIBELLES_VISUEL[b.type]}${b.titre ? ` « ${b.titre} »` : ''}`

/** Tous les réglages d'un bloc d'analyse, en une ligne lisible (description de l'espace). */
export function detailAnalyse(b: BlocAnalyse): string {
  const { type: _t, titre: _ti, largeur: _l, sql, regles, format, y, colonnes, texte: t, ...reste } = b
  const parties = [`bloc d'analyse ${b.type}${b.titre ? ` « ${b.titre} »` : ''}`]
  for (const [cle, v] of Object.entries(reste)) parties.push(`${cle}: ${String(v)}`)
  if (y) parties.push(`y: ${y.join(', ')}`)
  if (colonnes) parties.push(`colonnes: ${colonnes.join(', ')}`)
  if (format) parties.push(`format: ${typeof format === 'string' ? format : Object.entries(format).map(([c, f]) => `${c}=${f}`).join(', ')}`)
  if (regles) parties.push(`regles: ${regles.map((r) => `${r.colonne ? `${r.colonne} ` : ''}${r.si} → ${r.couleur}${r.ligne ? ' (ligne)' : ''}`).join(' ; ')}`)
  if (sql) parties.push(`sql: ${sql.replace(/\s+/g, ' ').trim()}`)
  if (t) parties.push(`texte: ${JSON.stringify(t)}`)
  return parties.join(', ')
}

/** Colonnes de réglage absentes du résultat : le bloc les nomme plutôt que d'afficher un graphique vide. */
export function colonnesManquantes(b: BlocAnalyse, r: ResultatSql): string[] {
  const noms = new Set(r.colonnes.map((c) => c.nom))
  const voulues = b.type === 'valeur' ? [b.valeur, b.comparer] : b.type === 'tableau' ? (b.colonnes ?? []) : b.type === 'texte' ? [] : [b.x, ...(b.y ?? []), b.serie, b.taille]
  return voulues.filter((c): c is string => c !== undefined && !noms.has(c))
}

/** Mesures d'un graphique : `y`, ou à défaut toutes les colonnes de nombres sauf `x`. */
export function mesures(b: BlocAnalyse, r: ResultatSql): string[] {
  return b.y ?? r.colonnes.filter((c) => c.nature === 'nombre' && c.nom !== b.x && c.nom !== b.serie && c.nom !== b.taille).map((c) => c.nom)
}

/** Axe des catégories : `x`, ou à défaut la première colonne qui n'est pas un nombre. */
export const axe = (b: BlocAnalyse, r: ResultatSql) => b.x ?? r.colonnes.find((c) => c.nature !== 'nombre')?.nom ?? r.colonnes[0]?.nom

