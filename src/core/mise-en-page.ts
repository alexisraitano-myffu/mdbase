import { Document, isMap, isSeq, parse, parseDocument, type YAMLSeq } from 'yaml'
import type { LigneChargee } from './base'
import { estObjet, type Colonne, type Schema } from './schema'
import { OPTIONS_SORTIE_CONFIG } from './schema-ecriture'
import { ecrireFiltre, lireFiltre, type Filtre, type Tri } from './vue'

// Mises en page des lignes `_pages/<id>.yaml` (spec §9). Une mise en page ne
// modifie jamais les fichiers de lignes : elle décide seulement de ce qui
// s'affiche, dans quel ordre, et où (propriétés, onglets, corps).

export type Affichage = 'visible' | 'masque_si_vide' | 'masque'
export const AFFICHAGES: readonly Affichage[] = ['visible', 'masque_si_vide', 'masque']

export type ChampPage = { cle: string; affichage: Affichage }

export type OngletPage =
  | { type: 'proprietes' }
  | { type: 'corps' }
  /** Vue tableau de la base liée, filtrée sur « lié à cette page ». */
  | { type: 'relation'; relation: string; colonnes: string[] }

/**
 * Contenus liés (spec §9) : sous le corps de la page, le corps des lignes
 * d'une relation, chacune dépliable, puis au niveau suivant celui des lignes
 * d'une relation de leur base. Affichage seulement : chaque texte reste dans
 * le fichier de sa ligne.
 */
export type NiveauContenus = {
  relation: string
  /** Champs montrés à côté du titre de chaque ligne liée. */
  champs: string[]
  /** Filtres et tris des lignes liées, au format des vues (§7). Sans tri : l'ordre de la relation. */
  filtres?: Filtre[]
  tris?: Tri[]
  puis?: NiveauContenus
}

/** Profondeur maximale des contenus liés : au-delà, le fichier est tronqué à la lecture. */
export const PROFONDEUR_CONTENUS = 5

export type MiseEnPage = {
  id: string
  nom: string
  defaut: boolean
  champs: ChampPage[]
  onglets: OngletPage[]
  contenus?: NiveauContenus
  /** Mise en page par défaut d'une base sans `_pages/` : aucun fichier tant qu'on ne la modifie pas. */
  implicite?: boolean
}

export type ModificationMiseEnPage = Partial<Pick<MiseEnPage, 'nom' | 'defaut' | 'champs' | 'onglets'>> & {
  /** `null` retire les contenus liés. */
  contenus?: NiveauContenus | null
}

function lireNiveau(brut: unknown, profondeur: number): NiveauContenus | undefined {
  if (!estObjet(brut) || typeof brut.relation !== 'string' || profondeur > PROFONDEUR_CONTENUS) return undefined
  const champs = Array.isArray(brut.champs) ? brut.champs.filter((x): x is string => typeof x === 'string') : []
  const puis = lireNiveau(brut.puis, profondeur + 1)
  // Un filtre illisible est écarté sans bruit : le niveau reste affiché, moins filtré.
  const filtres = (Array.isArray(brut.filtres) ? brut.filtres : []).flatMap((f) => {
    const lu = lireFiltre(f)
    return typeof lu === 'string' ? [] : [lu]
  })
  const tris = (Array.isArray(brut.tris) ? brut.tris : []).flatMap((t): Tri[] =>
    estObjet(t) && typeof t.colonne === 'string' ? [{ colonne: t.colonne, sens: t.sens === 'desc' ? 'desc' : 'asc' }] : [],
  )
  return { relation: brut.relation, champs, ...(filtres.length > 0 && { filtres }), ...(tris.length > 0 && { tris }), ...(puis && { puis }) }
}

/** Retire les clés vides (champs sans entrée) pour un fichier court. */
function niveauEcrit(n: NiveauContenus): Record<string, unknown> {
  return {
    relation: n.relation,
    ...(n.champs.length > 0 && { champs: n.champs }),
    ...(n.filtres?.length && { filtres: n.filtres.map(ecrireFiltre) }),
    ...(n.tris?.length && { tris: n.tris.map((t) => ({ colonne: t.colonne, sens: t.sens })) }),
    ...(n.puis && { puis: niveauEcrit(n.puis) }),
  }
}

export function miseEnPageParDefaut(): MiseEnPage {
  return { id: 'defaut', nom: 'Par défaut', defaut: true, champs: [], onglets: [], implicite: true }
}

export function lireMiseEnPage(texte: string, id: string): { miseEnPage: MiseEnPage | null; avertissements: string[] } {
  const avertissements: string[] = []
  let brut: unknown
  try {
    brut = parse(texte)
  } catch (e) {
    return { miseEnPage: null, avertissements: [`Mise en page ${id} illisible : ${(e as Error).message}`] }
  }
  if (!estObjet(brut)) return { miseEnPage: null, avertissements: [`Mise en page ${id} vide ou mal formée`] }

  const champs = (Array.isArray(brut.champs) ? brut.champs : []).flatMap((c): ChampPage[] => {
    if (!estObjet(c) || typeof c.cle !== 'string') return []
    const affichage = AFFICHAGES.includes(c.affichage as Affichage) ? (c.affichage as Affichage) : 'visible'
    return [{ cle: c.cle, affichage }]
  })
  const onglets = (Array.isArray(brut.onglets) ? brut.onglets : []).flatMap((o): OngletPage[] => {
    if (!estObjet(o)) return []
    if (o.type === 'proprietes' || o.type === 'corps') return [{ type: o.type }]
    if (o.type === 'relation' && typeof o.relation === 'string') {
      const colonnes = Array.isArray(o.colonnes) ? o.colonnes.filter((x): x is string => typeof x === 'string') : []
      return [{ type: 'relation', relation: o.relation, colonnes }]
    }
    avertissements.push(`Mise en page ${id} : onglet ignoré (${JSON.stringify(o)})`)
    return []
  })
  const contenus = lireNiveau(brut.contenus, 1)
  if (brut.contenus !== undefined && !contenus) avertissements.push(`Mise en page ${id} : contenus liés ignorés (relation manquante)`)
  return {
    miseEnPage: { id, nom: typeof brut.nom === 'string' ? brut.nom : id, defaut: brut.defaut === true, champs, onglets, ...(contenus && { contenus }) },
    avertissements,
  }
}

export function modifierMiseEnPage(texte: string | null, mep: MiseEnPage, modifs: ModificationMiseEnPage): string {
  const doc = texte === null ? new Document({ id: mep.id, nom: mep.nom, defaut: mep.defaut }) : parseDocument(texte)
  if (doc.errors.length > 0 || !isMap(doc.contents)) throw new Error(`Mise en page ${mep.id} illisible : modification refusée`)
  if (modifs.nom !== undefined) doc.set('nom', modifs.nom)
  if (modifs.defaut !== undefined) doc.set('defaut', modifs.defaut)
  if (modifs.contenus === null) doc.delete('contenus')
  else if (modifs.contenus !== undefined) {
    const noeud = doc.createNode(niveauEcrit(modifs.contenus))
    // Les champs d'un niveau tiennent sur une ligne, comme les colonnes d'un onglet ; un filtre ou un tri par ligne.
    for (let n: unknown = noeud; isMap(n); n = n.get('puis', true)) {
      const champs = n.get('champs', true)
      if (isSeq(champs)) champs.flow = true
      for (const cle of ['filtres', 'tris']) {
        const liste = n.get(cle, true)
        if (isSeq(liste)) for (const item of liste.items) if (isMap(item)) item.flow = true
      }
    }
    doc.set('contenus', noeud)
  }
  const listes: [string, unknown[] | undefined][] = [
    ['champs', modifs.champs],
    ['onglets', modifs.onglets],
  ]
  for (const [cle, valeur] of listes) {
    if (valeur === undefined) continue
    if (valeur.length === 0) {
      doc.delete(cle)
      continue
    }
    const noeud = doc.createNode(valeur) as YAMLSeq
    // Un champ par ligne, comme dans l'exemple de la spec ; les onglets relation gardent leurs colonnes en ligne.
    for (const item of noeud.items) {
      if (!isMap(item)) continue
      if (cle === 'champs') item.flow = true
      const colonnes = item.get('colonnes', true)
      if (isSeq(colonnes)) colonnes.flow = true
    }
    doc.set(cle, noeud)
  }
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

/**
 * Mise en page à utiliser (spec §9) : celle de la vue d'où l'on ouvre la
 * ligne, sinon celle marquée par défaut, sinon la première.
 */
export function choisirMiseEnPage(mises: readonly MiseEnPage[], deLaVue?: string): MiseEnPage {
  return mises.find((m) => m.id === deLaVue) ?? mises.find((m) => m.defaut) ?? mises[0] ?? miseEnPageParDefaut()
}

/** Affichage de chaque colonne dans l'ordre de la mise en page ; les colonnes qu'elle ne cite pas suivent, visibles. */
export function champsOrdonnes(schema: Schema, mep: MiseEnPage): { colonne: Colonne; affichage: Affichage }[] {
  const parCle = new Map(schema.colonnes.map((c) => [c.cle, c]))
  const cites = mep.champs.flatMap((c) => {
    const colonne = parCle.get(c.cle)
    return colonne ? [{ colonne, affichage: c.affichage }] : []
  })
  const vus = new Set(cites.map((c) => c.colonne.cle))
  const autres = schema.colonnes.filter((c) => !vus.has(c.cle)).map((colonne) => ({ colonne, affichage: 'visible' as Affichage }))
  return [...cites, ...autres]
}

/** Relations affichées en onglet : elles ne figurent pas dans la liste des propriétés. */
export function relationsEnOnglet(mep: MiseEnPage): Set<string> {
  return new Set(mep.onglets.flatMap((o) => (o.type === 'relation' ? [o.relation] : [])))
}

/**
 * Propriétés à afficher pour une ligne : sans le titre (affiché en tête), sans
 * les relations en onglet, sans les masquées, sans les vides « masque_si_vide ».
 * `masquees` compte ce qui a été retiré, pour proposer de l'afficher.
 */
export function proprietesVisibles(schema: Schema, mep: MiseEnPage, ligne: LigneChargee): { visibles: Colonne[]; masquees: Colonne[] } {
  const enOnglet = relationsEnOnglet(mep)
  const visibles: Colonne[] = []
  const masquees: Colonne[] = []
  for (const { colonne, affichage } of champsOrdonnes(schema, mep)) {
    if (colonne.cle === schema.champTitre || enOnglet.has(colonne.cle)) continue
    const vide = ligne.cellules[colonne.cle] === undefined
    if (affichage === 'masque' || (affichage === 'masque_si_vide' && vide)) masquees.push(colonne)
    else visibles.push(colonne)
  }
  return { visibles, masquees }
}

/** Le corps a-t-il son propre onglet ? Sinon il s'affiche sous les propriétés. */
export function corpsEnOnglet(mep: MiseEnPage): boolean {
  return mep.onglets.some((o) => o.type === 'corps')
}

/**
 * Onglets d'une mise en page à partir des réglages : dès qu'une relation ou le
 * corps a son onglet, les propriétés deviennent le premier onglet.
 */
export function ongletsDe(relations: readonly { relation: string; colonnes: string[] }[], corpsDansUnOnglet: boolean): OngletPage[] {
  if (relations.length === 0 && !corpsDansUnOnglet) return []
  return [
    { type: 'proprietes' },
    ...relations.map((r) => ({ type: 'relation' as const, relation: r.relation, colonnes: r.colonnes })),
    ...(corpsDansUnOnglet ? [{ type: 'corps' as const }] : []),
  ]
}
