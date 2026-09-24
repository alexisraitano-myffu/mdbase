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

export type Vue = {
  id: string
  nom: string
  type: TypeVue
  filtres: Filtre[]
  tris: Tri[]
  filtresRapides: FiltreRapide[]
  miseEnPage?: string
  /** Vue par défaut d'une base sans `_vues/` : aucun fichier tant qu'on ne la modifie pas. */
  implicite?: boolean
}

export type ModificationVue = Partial<Pick<Vue, 'nom' | 'filtres' | 'tris' | 'filtresRapides'>>

export function vueParDefaut(): Vue {
  return { id: 'tableau', nom: 'Tableau', type: 'tableau', filtres: [], tris: [], filtresRapides: [], implicite: true }
}

const TYPES: readonly string[] = ['tableau', 'kanban', 'collection', 'calendrier', 'timeline']

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
      ...(typeof brut.mise_en_page === 'string' && { miseEnPage: brut.mise_en_page }),
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

  if (modifs.nom !== undefined) doc.set('nom', modifs.nom)
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
