import { COULEURS } from '../couleurs'
import { estObjet } from '../schema'
import type { ResultatSql } from './sql'

// Analyse dans les dashboards (spec §10 « Analyse ») : des requêtes SQL
// nommées, des paramètres, et des blocs qui montrent un résultat (chiffre clé,
// graphique, tableau, texte). Lecture tolérante : un réglage mal formé est
// écarté avec un avertissement, le bloc reste.

export const TYPES_VISUEL = ['valeur', 'barres', 'courbe', 'aire', 'secteurs', 'nuage', 'tableau', 'texte', 'entete', 'compte_a_rebours', 'etapes', 'liste', 'repartition', 'frise'] as const
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

/** Couleurs spéciales d'une fiche : « à planifier » (gris clair) et « sans objet » (contour pointillé). */
/** Blocs des fiches (spec §10 « Fiches ») : une carte à la hauteur de son contenu, titre en petites capitales. */
export const TYPES_FICHE: ReadonlySet<TypeVisuel> = new Set(['entete', 'compte_a_rebours', 'etapes', 'liste', 'repartition', 'frise'])

export const COULEURS_SPECIALES = ['vide', 'aucune'] as const
const HEXA = /^#[0-9a-f]{6}$/i

/** Une couleur de l'espace (§3), un hexadécimal (`#2f6fc2`), `vide` ou `aucune`. */
export const estCouleur = (x: unknown): x is string => typeof x === 'string' && ((COULEURS as readonly string[]).includes(x) || (COULEURS_SPECIALES as readonly string[]).includes(x) || HEXA.test(x))

/** Une étape d'un bloc `etapes`, dans l'ordre du bandeau ; `court` : son nom dans l'en-tête. */
export type Etape = { nom: string; court?: string }

/** Requête secondaire d'une frise : jalons (`date`, `libelle`, `ligne`, `couleur`) ou périodes (`debut`, `fin`, `libelle`). */
export type SourceSecondaire = { donnees?: string; sql?: string; date?: string; debut?: string; fin?: string; libelle?: string; ligne?: string; couleur?: string }

/** Une entrée d'état : la première dont l'expression SQL `si` est vraie gagne ; sans `si`, l'état par défaut. */
export type EntreeEtat = { si?: string; couleur: string; libelle?: string; raison?: string }

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
  // Fiches (spec §10 « Fiches »)
  sous_titre?: string
  /** Nom d'un état du dashboard. */
  etat?: string
  date?: string
  libelle?: string
  /** Compte à rebours : rouge sous le premier nombre de jours, orange sous le second. */
  seuils?: [number, number]
  vide?: string
  element?: string
  etape?: string
  statut?: string
  groupe?: string
  detail_groupe?: string
  etapes?: Etape[]
  /** Nom d'une table de couleurs du dashboard, ou une table valeur → couleur. */
  couleurs?: string | Record<string, string>
  detail?: string
  /** Liste : colonne passée par `couleurs`, ou nom d'un état. */
  pastille?: string
  garder?: string
  tri?: string
  max?: number
  ordre?: string[]
  ligne?: string
  debut?: string
  fin?: string
  categorie?: string
  previsionnel?: string
  jalons?: SourceSecondaire
  periodes?: SourceSecondaire
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
  /** Choix : `boutons` en fait le sélecteur de ligne d'une fiche (valeur retenue sur la machine). */
  affichage?: 'boutons'
  /** Sélecteur : nom de l'état qui colore la pastille de chaque option. */
  pastille?: string
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
  for (const cle of CLES_TEXTE) {
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
  lireReglagesFiche(b, bloc, ou, avertissements)
  if (bloc.type !== 'texte' && !bloc.donnees && !bloc.sql) avertissements.push(`${ou} : ni « donnees » ni « sql », le bloc n'a rien à montrer`)
  return bloc
}

const CLES_TEXTE = ['titre', 'donnees', 'sql', 'x', 'serie', 'taille', 'valeur', 'comparer', 'texte', 'sous_titre', 'etat', 'date', 'libelle', 'vide', 'element', 'etape', 'statut', 'groupe', 'detail_groupe', 'detail', 'pastille', 'garder', 'tri', 'ligne', 'debut', 'fin', 'categorie', 'previsionnel'] as const

/** Une table valeur → couleur ; les couleurs inconnues sont écartées avec un avertissement. */
export function lireTableCouleurs(brut: unknown, ou: string, avertissements: string[]): Record<string, string> | null {
  if (!estObjet(brut)) return null
  const table: Record<string, string> = {}
  for (const [valeur, couleur] of Object.entries(brut)) {
    if (estCouleur(couleur)) table[valeur] = couleur
    else avertissements.push(`${ou} : couleur « ${String(couleur)} » de « ${valeur} » inconnue (une couleur de l'espace, #rrggbb, vide ou aucune)`)
  }
  return table
}

function lireSource(brut: unknown, ou: string, avertissements: string[]): SourceSecondaire | undefined {
  if (brut === undefined) return undefined
  if (!estObjet(brut)) {
    avertissements.push(`${ou} ignoré (un objet avec donnees ou sql attendu)`)
    return undefined
  }
  const source: SourceSecondaire = {}
  for (const cle of ['donnees', 'sql', 'date', 'debut', 'fin', 'libelle', 'ligne', 'couleur'] as const) {
    const v = texte(brut[cle])
    if (v !== undefined) source[cle] = v
  }
  if (!source.donnees && !source.sql) {
    avertissements.push(`${ou} ignoré : ni « donnees » ni « sql »`)
    return undefined
  }
  return source
}

function lireReglagesFiche(b: Record<string, unknown>, bloc: BlocAnalyse, ou: string, avertissements: string[]) {
  if (b.seuils !== undefined) {
    const s = b.seuils
    if (Array.isArray(s) && s.length === 2 && s.every((n) => typeof n === 'number' && Number.isFinite(n)) && s[0] <= s[1]) bloc.seuils = [s[0] as number, s[1] as number]
    else avertissements.push(`${ou} : « seuils » ignoré (deux nombres de jours croissants, comme [8, 31])`)
  }
  if (b.max !== undefined) {
    if (typeof b.max === 'number' && Number.isInteger(b.max) && b.max > 0) bloc.max = b.max
    else avertissements.push(`${ou} : « max » ignoré (un nombre entier positif)`)
  }
  const ordre = listeTextes(b.ordre)
  if (ordre) bloc.ordre = ordre
  if (Array.isArray(b.etapes)) {
    const etapes = b.etapes.flatMap((e): Etape[] => {
      if (typeof e === 'string' && e !== '') return [{ nom: e }]
      if (estObjet(e) && texte(e.nom)) return [{ nom: e.nom as string, ...(texte(e.court) && { court: e.court as string }) }]
      avertissements.push(`${ou} : étape ignorée (un nom, ou { nom, court })`)
      return []
    })
    if (etapes.length > 0) bloc.etapes = etapes
  } else if (b.etapes !== undefined) avertissements.push(`${ou} : « etapes » ignoré (une liste attendue)`)
  if (typeof b.couleurs === 'string' && b.couleurs !== '') bloc.couleurs = b.couleurs
  else if (b.couleurs !== undefined) {
    const table = lireTableCouleurs(b.couleurs, ou, avertissements)
    if (table) bloc.couleurs = table
    else avertissements.push(`${ou} : « couleurs » ignoré (le nom d'une table, ou valeur: couleur)`)
  }
  const jalons = lireSource(b.jalons, `${ou}, jalons`, avertissements)
  if (jalons) bloc.jalons = jalons
  const periodes = lireSource(b.periodes, `${ou}, periodes`, avertissements)
  if (periodes) bloc.periodes = periodes
}

/** Tables de couleurs nommées du dashboard. */
export function lireCouleurs(brut: unknown, id: string, avertissements: string[]): Record<string, Record<string, string>> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) {
    avertissements.push(`Dashboard ${id} : « couleurs » ignoré (des tables nom: { valeur: couleur } attendues)`)
    return {}
  }
  const tables: Record<string, Record<string, string>> = {}
  for (const [nom, table] of Object.entries(brut)) {
    const lue = lireTableCouleurs(table, `Dashboard ${id}, couleurs ${nom}`, avertissements)
    if (lue) tables[nom] = lue
    else avertissements.push(`Dashboard ${id} : table de couleurs « ${nom} » ignorée (valeur: couleur attendu)`)
  }
  return tables
}

/** États nommés du dashboard : chacun, une liste ordonnée d'entrées. */
export function lireEtats(brut: unknown, id: string, avertissements: string[]): Record<string, EntreeEtat[]> {
  if (brut === undefined) return {}
  if (!estObjet(brut)) {
    avertissements.push(`Dashboard ${id} : « etats » ignoré (des listes nom: [{ si, couleur, libelle }] attendues)`)
    return {}
  }
  const etats: Record<string, EntreeEtat[]> = {}
  for (const [nom, liste] of Object.entries(brut)) {
    if (!NOM_VALIDE.test(nom) || !Array.isArray(liste)) {
      avertissements.push(`Dashboard ${id} : état « ${nom} » ignoré (nom en minuscules, chiffres et _, et une liste)`)
      continue
    }
    const entrees = liste.flatMap((e): EntreeEtat[] => {
      if (estObjet(e) && estCouleur(e.couleur) && (e.si === undefined || texte(e.si))) {
        return [{ ...(texte(e.si) && { si: e.si as string }), couleur: e.couleur, ...(texte(e.libelle) && { libelle: e.libelle as string }), ...(texte(e.raison) && { raison: e.raison as string }) }]
      }
      avertissements.push(`Dashboard ${id}, état ${nom} : entrée ignorée (« couleur » attendue, « si » en SQL)`)
      return []
    })
    if (entrees.length > 0) etats[nom] = entrees
  }
  return etats
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
        ...(p.affichage === 'boutons' && { affichage: 'boutons' as const }),
        ...(texte(p.pastille) && { pastille: p.pastille as string }),
      },
    ]
  })
}

export function objetParametre(p: Parametre): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ nom: p.nom, libelle: p.libelle, type: p.type, options: p.options, affichage: p.affichage, pastille: p.pastille, defaut: p.defaut, valeur: p.valeur }).filter(([, v]) => v !== undefined),
  )
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
  entete: 'En-tête de fiche',
  compte_a_rebours: 'Compte à rebours',
  etapes: 'Barres d’étapes',
  liste: 'Liste à pastilles',
  repartition: 'Répartition',
  frise: 'Frise',
}

/** « Barres « Par statut » », pour l'aperçu et les messages. */
export const nomAnalyse = (b: BlocAnalyse) => `${LIBELLES_VISUEL[b.type]}${b.titre ? ` « ${b.titre} »` : ''}`

/** Tous les réglages d'un bloc d'analyse, en une ligne lisible (description de l'espace). */
export function detailAnalyse(b: BlocAnalyse): string {
  const { type: _t, titre: _ti, largeur: _l, sql, regles, format, y, colonnes, texte: t, ...reste } = b
  const parties = [`bloc d'analyse ${b.type}${b.titre ? ` « ${b.titre} »` : ''}`]
  for (const [cle, v] of Object.entries(reste)) parties.push(`${cle}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  if (y) parties.push(`y: ${y.join(', ')}`)
  if (colonnes) parties.push(`colonnes: ${colonnes.join(', ')}`)
  if (format) parties.push(`format: ${typeof format === 'string' ? format : Object.entries(format).map(([c, f]) => `${c}=${f}`).join(', ')}`)
  if (regles) parties.push(`regles: ${regles.map((r) => `${r.colonne ? `${r.colonne} ` : ''}${r.si} → ${r.couleur}${r.ligne ? ' (ligne)' : ''}`).join(' ; ')}`)
  if (sql) parties.push(`sql: ${sql.replace(/\s+/g, ' ').trim()}`)
  if (t) parties.push(`texte: ${JSON.stringify(t)}`)
  return parties.join(', ')
}

/** Colonnes de réglage absentes du résultat : le bloc les nomme plutôt que d'afficher un graphique vide. */
export function colonnesManquantes(b: BlocAnalyse, r: ResultatSql, etats: Readonly<Record<string, unknown>> = {}): string[] {
  const noms = new Set(r.colonnes.map((c) => c.nom))
  const voulues = colonnesVoulues(b, etats)
  return voulues.filter((c): c is string => c !== undefined && !noms.has(c))
}

function colonnesVoulues(b: BlocAnalyse, etats: Readonly<Record<string, unknown>>): (string | undefined)[] {
  switch (b.type) {
    case 'valeur':
      return [b.valeur, b.comparer]
    case 'tableau':
      return b.colonnes ?? []
    case 'texte':
    case 'entete':
      return []
    case 'compte_a_rebours':
      return [b.date, b.libelle]
    case 'etapes':
      return [b.element, b.etape, b.statut, b.date, b.groupe, b.detail_groupe]
    case 'liste':
      return [b.libelle, b.detail, b.pastille && Object.hasOwn(etats, b.pastille) ? undefined : b.pastille]
    case 'repartition':
      return [b.x, b.y?.[0]]
    case 'frise':
      return [b.ligne, b.debut, b.fin, b.categorie, b.previsionnel]
    default:
      return [b.x, ...(b.y ?? []), b.serie, b.taille]
  }
}

/** Mesures d'un graphique : `y`, ou à défaut toutes les colonnes de nombres sauf `x`. */
export function mesures(b: BlocAnalyse, r: ResultatSql): string[] {
  return b.y ?? r.colonnes.filter((c) => c.nature === 'nombre' && c.nom !== b.x && c.nom !== b.serie && c.nom !== b.taille).map((c) => c.nom)
}

/** Axe des catégories : `x`, ou à défaut la première colonne qui n'est pas un nombre. */
export const axe = (b: BlocAnalyse, r: ResultatSql) => b.x ?? r.colonnes.find((c) => c.nature !== 'nombre')?.nom ?? r.colonnes[0]?.nom

