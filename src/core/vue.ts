import { Document, isMap, parse, parseDocument, type YAMLSeq } from 'yaml'
import { estObjet } from './schema'
import { OPTIONS_SORTIE_CONFIG } from './schema-ecriture'

// Fichiers de vues `_vues/<id>.yaml` (spec §7). Lecture tolérante : un filtre
// mal formé est écarté avec un avertissement. Les clés inconnues du fichier
// (propres à un type de vue à venir) sont conservées à la réécriture.

export const OPERATEURS = [
  'vide',
  'non_vide',
  'egal',
  'different_de',
  'contient',
  'ne_contient_pas',
  'commence_par',
  'finit_par',
  'superieur',
  'inferieur',
  'superieur_egal',
  'inferieur_egal',
  'avant',
  'apres',
  'entre',
  'aujourdhui',
  'cette_semaine',
  'ce_mois',
  'jours_passes',
  'jours_a_venir',
  'parmi',
] as const
export type Operateur = (typeof OPERATEURS)[number]

export type Filtre = { colonne: string; operateur: Operateur; valeur?: unknown }
export type Tri = { colonne: string; sens: 'asc' | 'desc' }
/**
 * Pastille de filtre rapide (spec §7) : une colonne épinglée au-dessus de la
 * vue, réglée en un clic. Sans valeur, elle ne filtre rien. `operateur` absent :
 * celui par défaut du type de la colonne.
 */
export type FiltreRapide = { colonne: string; operateur?: Operateur; valeur?: unknown }
export type TypeVue = 'tableau' | 'kanban' | 'collection' | 'calendrier' | 'timeline'
export type EchelleVue = 'semaine' | 'mois' | 'trimestre'

export type Vue = {
  id: string
  nom: string
  type: TypeVue
  filtres: Filtre[]
  tris: Tri[]
  filtresRapides: FiltreRapide[]
  miseEnPage?: string
  /** Ordre des colonnes dans la vue ; celles qu'il ne cite pas suivent, dans l'ordre du schéma. */
  ordre?: string[]
  /** Colonnes masquées dans cette vue. */
  masquees?: string[]
  /** Largeur des colonnes du tableau, en pixels. */
  largeurs?: Record<string, number>
  /** Tableau : le texte des cellules passe à la ligne au lieu d'être coupé. */
  retourLigne?: boolean
  /** Tableau : calcul affiché en pied de chaque colonne (mêmes calculs que les rollups). */
  calculs?: Record<string, string>
  /** Tableau et kanban : colonne de groupement. */
  groupe?: string
  /** Kanban : couloirs horizontaux. */
  sousGroupe?: string
  /** Kanban et collection : champs affichés sur la carte. */
  champsCarte?: string[]
  /** Collection : premières lignes du corps sur la carte. */
  apercuCorps?: boolean
  /** Calendrier et timeline : colonne de date qui place la ligne (début de la plage). */
  champDebut?: string
  /** Calendrier et timeline : fin optionnelle de la plage. */
  champFin?: string
  /** Timeline : colonnes de date affichées comme des points sur la barre. */
  champsJalons?: string[]
  /** Calendrier : `mois` ou `semaine` ; timeline : `semaine`, `mois` ou `trimestre`. */
  echelle?: EchelleVue
  /** Vue par défaut d'une base sans `_vues/` : aucun fichier tant qu'on ne la modifie pas. */
  implicite?: boolean
}

export type ModificationVue = Partial<Omit<Vue, 'id' | 'type' | 'implicite'>>

/**
 * Réglages simples de la vue et leur clé dans le fichier. Une valeur absente,
 * vide ou fausse retire la clé du fichier.
 */
const REGLAGES = {
  nom: 'nom',
  miseEnPage: 'mise_en_page',
  ordre: 'colonnes',
  masquees: 'colonnes_masquees',
  largeurs: 'largeurs',
  retourLigne: 'retour_ligne',
  calculs: 'calculs',
  groupe: 'groupe',
  sousGroupe: 'sous_groupe',
  champsCarte: 'champs_carte',
  apercuCorps: 'apercu_corps',
  champDebut: 'champ_debut',
  champFin: 'champ_fin',
  champsJalons: 'champs_jalons',
  echelle: 'echelle',
} as const satisfies Partial<Record<keyof ModificationVue, string>>

/** Champs de la vue modifiables ; sert aussi à comparer mémoire et fichier. */
export const CHAMPS_MODIFIABLES = [...Object.keys(REGLAGES), 'filtres', 'tris', 'filtresRapides'] as (keyof ModificationVue)[]

export function vueParDefaut(): Vue {
  return { id: 'tableau', nom: 'Tableau', type: 'tableau', filtres: [], tris: [], filtresRapides: [], implicite: true }
}

const TYPES: readonly string[] = ['tableau', 'kanban', 'collection', 'calendrier', 'timeline']

const chaines = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined)
const table = <T>(x: unknown, garder: (v: unknown) => v is T): Record<string, T> | undefined =>
  estObjet(x) ? Object.fromEntries(Object.entries(x).filter((e): e is [string, T] => garder(e[1]))) : undefined
const estNombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const estChaine = (v: unknown): v is string => typeof v === 'string'

/** Réglages optionnels lus avec tolérance : une valeur mal formée est ignorée. */
function lireReglages(brut: Record<string, unknown>): Partial<Vue> {
  const r: Partial<Vue> = {}
  const texte = (x: unknown) => (typeof x === 'string' ? x : undefined)
  const miseEnPage = texte(brut.mise_en_page)
  if (miseEnPage) r.miseEnPage = miseEnPage
  const ordre = chaines(brut.colonnes)
  if (ordre) r.ordre = ordre
  const masquees = chaines(brut.colonnes_masquees)
  if (masquees) r.masquees = masquees
  const largeurs = table(brut.largeurs, estNombre)
  if (largeurs) r.largeurs = largeurs
  if (brut.retour_ligne === true) r.retourLigne = true
  const calculs = table(brut.calculs, estChaine)
  if (calculs) r.calculs = calculs
  const groupe = texte(brut.groupe)
  if (groupe) r.groupe = groupe
  const sousGroupe = texte(brut.sous_groupe)
  if (sousGroupe) r.sousGroupe = sousGroupe
  const champsCarte = chaines(brut.champs_carte)
  if (champsCarte) r.champsCarte = champsCarte
  if (brut.apercu_corps === true) r.apercuCorps = true
  const champDebut = texte(brut.champ_debut)
  if (champDebut) r.champDebut = champDebut
  const champFin = texte(brut.champ_fin)
  if (champFin) r.champFin = champFin
  const champsJalons = chaines(brut.champs_jalons)
  if (champsJalons) r.champsJalons = champsJalons
  if (brut.echelle === 'semaine' || brut.echelle === 'mois' || brut.echelle === 'trimestre') r.echelle = brut.echelle
  return r
}

export function lireVue(texte: string, id: string): { vue: Vue | null; avertissements: string[] } {
  const avertissements: string[] = []
  let brut: unknown
  try {
    brut = parse(texte)
  } catch (e) {
    return { vue: null, avertissements: [`Vue ${id} illisible : ${(e as Error).message}`] }
  }
  if (!estObjet(brut)) return { vue: null, avertissements: [`Vue ${id} vide ou mal formée`] }

  const type = TYPES.includes(String(brut.type)) ? (brut.type as TypeVue) : 'tableau'
  if (brut.type !== undefined && type !== brut.type) avertissements.push(`Vue ${id} : type « ${String(brut.type)} » inconnu, affichée en tableau`)

  const filtres = (liste: unknown, ou: string) =>
    (Array.isArray(liste) ? liste : []).flatMap((f): Filtre[] => {
      const lu = lireFiltre(f)
      if (typeof lu === 'string') {
        avertissements.push(`Vue ${id}, ${ou} : filtre ignoré (${lu})`)
        return []
      }
      return [lu]
    })

  const tris = (Array.isArray(brut.tris) ? brut.tris : []).flatMap((t): Tri[] =>
    estObjet(t) && typeof t.colonne === 'string' ? [{ colonne: t.colonne, sens: t.sens === 'desc' ? 'desc' : 'asc' }] : [],
  )
  const filtresRapides = (Array.isArray(brut.filtres_rapides) ? brut.filtres_rapides : []).flatMap((r): FiltreRapide[] => {
    if (!estObjet(r) || typeof r.colonne !== 'string') {
      avertissements.push(`Vue ${id} : filtre rapide ignoré (colonne manquante)`)
      return []
    }
    const operateur = (OPERATEURS as readonly string[]).includes(String(r.operateur)) ? (r.operateur as Operateur) : undefined
    return [{ colonne: r.colonne, ...(operateur && { operateur }), ...(r.valeur !== undefined && { valeur: r.valeur }) }]
  })

  return {
    vue: {
      id,
      nom: typeof brut.nom === 'string' ? brut.nom : id,
      type,
      filtres: filtres(brut.filtres, 'filtres'),
      tris,
      filtresRapides,
      ...lireReglages(brut),
    },
    avertissements,
  }
}

function lireFiltre(f: unknown): Filtre | string {
  if (!estObjet(f)) return 'pas un objet'
  if (typeof f.colonne !== 'string') return 'colonne manquante'
  if (!(OPERATEURS as readonly string[]).includes(String(f.operateur))) return `opérateur « ${String(f.operateur)} » inconnu`
  return { colonne: f.colonne, operateur: f.operateur as Operateur, ...(f.valeur !== undefined && { valeur: f.valeur }) }
}

/** Réécrit une vue (ou la crée si `texte` est null), en ne touchant qu'aux clés modifiées. */
export function modifierVue(texte: string | null, vue: Vue, modifs: ModificationVue): string {
  const doc = texte === null ? new Document({ id: vue.id, nom: vue.nom, type: vue.type }) : parseDocument(texte)
  if (doc.errors.length > 0 || !isMap(doc.contents)) throw new Error(`Vue ${vue.id} illisible : modification refusée`)

  for (const [prop, cle] of Object.entries(REGLAGES) as [keyof typeof REGLAGES, string][]) {
    if (!(prop in modifs)) continue
    const v = modifs[prop]
    const vide = v === undefined || v === false || v === '' || (Array.isArray(v) && v.length === 0) || (estObjet(v) && Object.keys(v).length === 0)
    if (vide) {
      if (prop !== 'nom') doc.delete(cle)
      continue
    }
    doc.set(cle, doc.createNode(v, { flow: true }))
  }
  const listes: [keyof ModificationVue, string, unknown[] | undefined][] = [
    ['filtres', 'filtres', modifs.filtres?.map(ecrireFiltre)],
    ['tris', 'tris', modifs.tris?.map((t) => ({ colonne: t.colonne, sens: t.sens }))],
    [
      'filtresRapides',
      'filtres_rapides',
      modifs.filtresRapides?.map((r) => ({
        colonne: r.colonne,
        ...(r.operateur && { operateur: r.operateur }),
        ...(r.valeur !== undefined && { valeur: r.valeur }),
      })),
    ],
  ]
  for (const [, cle, valeur] of listes) {
    if (valeur === undefined) continue
    if (valeur.length === 0) {
      doc.delete(cle)
      continue
    }
    const noeud = doc.createNode(valeur) as YAMLSeq
    // Chaque filtre, tri ou pastille sur une ligne, comme dans l'exemple de la spec.
    for (const item of noeud.items) if (isMap(item)) item.flow = true
    doc.set(cle, noeud)
  }
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

function ecrireFiltre(f: Filtre) {
  return f.valeur === undefined ? { colonne: f.colonne, operateur: f.operateur } : { colonne: f.colonne, operateur: f.operateur, valeur: f.valeur }
}
