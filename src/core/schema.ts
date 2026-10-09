import { parse } from 'yaml'
import type { TypeFormule } from './formules/fonctions'
import { typerFormules } from './formules/formule'

// Lecture de `_schema.yaml` (spec §3). Lecture tolérante : une colonne mal
// formée est écartée avec un avertissement, le reste de la base reste utilisable.

export const CLE_ID = 'id'
/** Dates écrites par l'app sur chaque ligne (spec §3) ; « _ » : jamais une clé de colonne. */
export const CLE_CREE = '_cree'
export const CLE_MODIFIE = '_modifie'

export type Option = { label: string; couleur?: string }

type Commun = { cle: string; nom: string }
export type ColonneSimple = Commun & { type: 'text' | 'number' | 'date' | 'checkbox' | 'url' }
export type ColonneChoix = Commun & { type: 'select' | 'multiselect'; options: Option[] }
export type ColonneRelation = Commun & {
  type: 'relation'
  cible: string
  proprietaire: boolean
  inverse: string
}
export type ColonneRollup = Commun & {
  type: 'rollup'
  relation: string
  champ: string
  calcul: string
  filtre?: unknown
}
/** Date de création ou de dernière modification de la ligne, lue dans `_cree` / `_modifie` (spec §3). */
export type ColonneHorodatage = Commun & { type: 'created' | 'modified' }
export const TYPES_HORODATAGE = ['created', 'modified'] as const
export type ColonneFormule = Commun & {
  type: 'formula'
  expression: string
  /** Type du résultat, déduit à la lecture du schéma (jamais écrit) ; absent si la formule est en erreur. */
  resultat?: TypeFormule
}

export type Colonne = ColonneSimple | ColonneChoix | ColonneRelation | ColonneRollup | ColonneFormule | ColonneHorodatage
export type TypeColonne = Colonne['type']

export type Schema = {
  version: number
  id: string
  nom: string
  champTitre: string
  colonnes: Colonne[]
  /** Ordre des onglets de vues (clé `vues`) ; les vues non citées suivent, par nom de fichier. */
  ordreVues: string[]
  /** Base remplie par une source externe (§16, Jira) : en lecture seule dans l'app. */
  source?: Source
}

/**
 * Source d'une base (§16). Tout type inconnu garde la base en lecture seule :
 * mieux vaut ne pas écrire là où un script écrit.
 */
export type Source = { type: string; site: string; projets: string[]; jql?: string }

/** Nom affiché d'une source : « Jira », ou le type tel qu'écrit. */
export function nomSource(type: string): string {
  return type === 'jira' ? 'Jira' : type
}

function lireSource(brut: unknown): Source | undefined {
  if (brut === undefined) return undefined
  const o = estObjet(brut) ? brut : {}
  const projets = Array.isArray(o.projets) ? o.projets.filter((p): p is string => typeof p === 'string' && p.trim() !== '') : []
  return {
    type: typeof o.type === 'string' ? o.type : 'inconnue',
    site: typeof o.site === 'string' ? o.site : '',
    projets,
    ...(typeof o.jql === 'string' && o.jql.trim() !== '' && { jql: o.jql }),
  }
}

/** Calculs de rollup (spec §5). */
export const CALCULS = [
  'afficher',
  'afficher_uniques',
  'compter',
  'compter_valeurs',
  'compter_uniques',
  'compter_vides',
  'compter_non_vides',
  'pourcent_coches',
  'pourcent_non_coches',
  'somme',
  'moyenne',
  'mediane',
  'min',
  'max',
  'amplitude',
  'date_plus_tot',
  'date_plus_tard',
] as const
export type Calcul = (typeof CALCULS)[number]

/**
 * Nature de la valeur d'une colonne : elle décide des filtres, des tris et de
 * l'affichage. Un rollup a la nature de son résultat (spec §5 : « se comporte
 * exactement comme une colonne saisie »).
 */
export type Nature = 'texte' | 'nombre' | 'date' | 'case' | 'choix' | 'liste'

/** Rollup qui montre les valeurs remontées (toutes, ou chacune une fois) plutôt qu'un calcul. */
export function afficheValeurs(c: Colonne): boolean {
  return c.type === 'rollup' && (c.calcul === 'afficher' || c.calcul === 'afficher_uniques')
}

/**
 * Colonne d'origine des valeurs d'un rollup qui les affiche : on remonte la
 * chaîne des rollups (rollup de rollup…) jusqu'à la colonne saisie ou calculée
 * qui les produit, pour les montrer comme elle (titres d'une relation, couleurs
 * d'un select). Toute autre colonne est sa propre origine ; `undefined` si un
 * maillon manque.
 */
export function colonneOrigine(schemaDe: (base: string) => Schema | undefined, base: string, c: Colonne): Colonne | undefined {
  const dans = (b: string, cle: string) => {
    const s = schemaDe(b)
    return s && colonne(s, cle)
  }
  let courante = c
  let baseCourante = base
  // Le graphe refuse les boucles ; la borne protège d'un fichier modifié à la main.
  for (let i = 0; i < 20 && courante.type === 'rollup' && afficheValeurs(courante); i++) {
    const relation = dans(baseCourante, courante.relation)
    if (relation?.type !== 'relation') return undefined
    const champ = dans(relation.cible, courante.champ)
    if (!champ) return undefined
    courante = champ
    baseCourante = relation.cible
  }
  return courante
}

export function natureDe(c: Colonne): Nature {
  switch (c.type) {
    case 'text':
    case 'url':
      return 'texte'
    case 'number':
      return 'nombre'
    case 'date':
    case 'created':
    case 'modified':
      return 'date'
    case 'checkbox':
      return 'case'
    case 'select':
      return 'choix'
    case 'multiselect':
    case 'relation':
      return 'liste'
    case 'rollup':
      if (afficheValeurs(c)) return 'liste'
      if (c.calcul === 'date_plus_tot' || c.calcul === 'date_plus_tard') return 'date'
      return 'nombre'
    case 'formula':
      return c.resultat ?? 'texte'
  }
}

export type LectureSchema = { schema: Schema | null; avertissements: string[] }

/** Colonne dont la valeur est écrite dans les fichiers de lignes (spec §3, invariant 1). */
export function estSaisie(c: Colonne): boolean {
  if (c.type === 'relation') return c.proprietaire
  return c.type !== 'rollup' && c.type !== 'formula' && c.type !== 'created' && c.type !== 'modified'
}

export function colonne(schema: Schema, cle: string): Colonne | undefined {
  return schema.colonnes.find((c) => c.cle === cle)
}

/**
 * @param idBase nom du dossier de la base, qui fait foi comme identifiant (spec §3).
 */
export function lireSchema(texte: string, idBase: string): LectureSchema {
  const avertissements: string[] = []
  let brut: unknown
  try {
    brut = parse(texte)
  } catch (e) {
    return { schema: null, avertissements: [`_schema.yaml illisible : ${(e as Error).message}`] }
  }
  if (!estObjet(brut)) return { schema: null, avertissements: ['_schema.yaml ne décrit pas une base'] }

  if (brut.id !== undefined && String(brut.id) !== idBase) {
    avertissements.push(`L'id du schéma (${String(brut.id)}) diffère du dossier (${idBase}) : le dossier fait foi`)
  }

  const colonnes: Colonne[] = []
  for (const [i, c] of (Array.isArray(brut.colonnes) ? brut.colonnes : []).entries()) {
    const lue = lireColonne(c)
    if (typeof lue === 'string') avertissements.push(`Colonne n°${i + 1} ignorée : ${lue}`)
    else if (lue.cle === CLE_ID) avertissements.push(`Colonne « ${lue.nom} » ignorée : la clé « id » est réservée`)
    else if (colonnes.some((x) => x.cle === lue.cle)) avertissements.push(`Colonne « ${lue.cle} » en double, ignorée`)
    else colonnes.push(lue)
  }

  let champTitre = typeof brut.champ_titre === 'string' ? brut.champ_titre : ''
  if (!colonnes.some((c) => c.cle === champTitre && c.type === 'text')) {
    const repli = colonnes.find((c) => c.type === 'text')
    if (!repli) return { schema: null, avertissements: [...avertissements, 'Aucune colonne texte pour servir de titre'] }
    avertissements.push(`champ_titre « ${champTitre} » invalide : « ${repli.cle} » utilisé à la place`)
    champTitre = repli.cle
  }

  const types = typerFormules(colonnes)
  const typees = colonnes.map((c): Colonne => {
    const t = types.get(c.cle)
    return c.type === 'formula' && (t === 'nombre' || t === 'texte' || t === 'date' || t === 'case') ? { ...c, resultat: t } : c
  })

  return {
    schema: {
      version: typeof brut.version === 'number' ? brut.version : 1,
      id: idBase,
      nom: typeof brut.nom === 'string' ? brut.nom : idBase,
      champTitre,
      colonnes: typees,
      ordreVues: Array.isArray(brut.vues) ? brut.vues.filter((v): v is string => typeof v === 'string') : [],
      ...(brut.source !== undefined && { source: lireSource(brut.source) }),
    },
    avertissements,
  }
}

/** Renvoie la colonne, ou la raison du refus. */
function lireColonne(c: unknown): Colonne | string {
  if (!estObjet(c)) return 'pas un objet'
  if (typeof c.cle !== 'string' || c.cle === '') return 'clé manquante'
  const commun = { cle: c.cle, nom: typeof c.nom === 'string' ? c.nom : c.cle }
  switch (c.type) {
    case 'text':
    case 'number':
    case 'date':
    case 'checkbox':
    case 'url':
    case 'created':
    case 'modified':
      return { ...commun, type: c.type }
    case 'select':
    case 'multiselect':
      return { ...commun, type: c.type, options: lireOptions(c.options) }
    case 'relation':
      if (typeof c.cible !== 'string') return `relation « ${c.cle} » sans cible`
      return {
        ...commun,
        type: 'relation',
        cible: c.cible,
        proprietaire: c.proprietaire === true,
        inverse: typeof c.inverse === 'string' ? c.inverse : '',
      }
    case 'rollup':
      if (typeof c.relation !== 'string' || typeof c.champ !== 'string') {
        return `rollup « ${c.cle} » incomplet`
      }
      return {
        ...commun,
        type: 'rollup',
        relation: c.relation,
        champ: c.champ,
        calcul: typeof c.calcul === 'string' ? c.calcul : 'afficher',
        ...(c.filtre !== undefined && { filtre: c.filtre }),
      }
    case 'formula':
      return { ...commun, type: 'formula', expression: typeof c.expression === 'string' ? c.expression : '' }
    default:
      return `type « ${String(c.type)} » inconnu pour « ${c.cle} »`
  }
}

function lireOptions(brut: unknown): Option[] {
  if (!Array.isArray(brut)) return []
  return brut.flatMap((o): Option[] => {
    if (typeof o === 'string') return [{ label: o }]
    if (estObjet(o) && typeof o.label === 'string') {
      return [{ label: o.label, ...(typeof o.couleur === 'string' && { couleur: o.couleur }) }]
    }
    return []
  })
}

export function estObjet(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
