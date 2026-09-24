import { parse } from 'yaml'

// Lecture de `_schema.yaml` (spec §3). Lecture tolérante : une colonne mal
// formée est écartée avec un avertissement, le reste de la base reste utilisable.

export const CLE_ID = 'id'

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
export type ColonneFormule = Commun & { type: 'formula'; expression: string }

export type Colonne = ColonneSimple | ColonneChoix | ColonneRelation | ColonneRollup | ColonneFormule
export type TypeColonne = Colonne['type']

export type Schema = {
  version: number
  id: string
  nom: string
  champTitre: string
  colonnes: Colonne[]
  /** Ordre des onglets de vues (clé `vues`) ; les vues non citées suivent, par nom de fichier. */
  ordreVues: string[]
}

/** Calculs de rollup (spec §5). */
export const CALCULS = [
  'afficher',
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

export function natureDe(c: Colonne): Nature {
  switch (c.type) {
    case 'text':
    case 'url':
      return 'texte'
    case 'number':
      return 'nombre'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'case'
    case 'select':
      return 'choix'
    case 'multiselect':
    case 'relation':
      return 'liste'
    case 'rollup':
      if (c.calcul === 'afficher') return 'liste'
      if (c.calcul === 'date_plus_tot' || c.calcul === 'date_plus_tard') return 'date'
      return 'nombre'
    case 'formula':
      return 'texte' // précisé au jalon 10, selon le type du résultat
  }
}

export type LectureSchema = { schema: Schema | null; avertissements: string[] }

/** Colonne dont la valeur est écrite dans les fichiers de lignes (spec §3, invariant 1). */
export function estSaisie(c: Colonne): boolean {
  if (c.type === 'relation') return c.proprietaire
  return c.type !== 'rollup' && c.type !== 'formula'
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

  return {
    schema: {
      version: typeof brut.version === 'number' ? brut.version : 1,
      id: idBase,
      nom: typeof brut.nom === 'string' ? brut.nom : idBase,
      champTitre,
      colonnes,
      ordreVues: Array.isArray(brut.vues) ? brut.vues.filter((v): v is string => typeof v === 'string') : [],
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
