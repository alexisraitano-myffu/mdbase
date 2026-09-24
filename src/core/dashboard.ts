import { Document, isMap, isSeq, parse, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import { estObjet } from './schema'
import { OPTIONS_SORTIE_CONFIG } from './schema-ecriture'
import { appliquerModificationsVue, lireVueDepuis, type ModificationVue, type Vue } from './vue'

// Dashboards `_dashboards/<id>.yaml` (spec §10) : des rangées empilées d'un ou
// deux blocs. Un bloc montre une vue d'une base : une référence à une vue de
// la base, ou une vue propre, écrite dans le fichier au format des `_vues/`.

export type BlocReference = { base: string; vue: string }
export type BlocPropre = { base: string; vue: Vue }
export type Bloc = BlocReference | BlocPropre
export type Rangee = { blocs: Bloc[] }
export type Dashboard = { id: string; nom: string; rangees: Rangee[] }

/** Deux blocs côte à côte au plus (spec §10). */
export const BLOCS_PAR_RANGEE = 2

export const estPropre = (b: Bloc): b is BlocPropre => typeof b.vue !== 'string'

/** Place d'un bloc : sa rangée et sa position dans la rangée. */
export type PlaceBloc = { rangee: number; bloc: number }

export type OperationDashboard =
  | { type: 'renommer'; nom: string }
  /** `rangee: null` : nouvelle rangée en bas ; sinon à droite de la rangée donnée. */
  | { type: 'ajouter_bloc'; rangee: number | null; bloc: Bloc }
  /** Retire le bloc ; une rangée vidée disparaît. */
  | { type: 'retirer_bloc'; place: PlaceBloc }
  /** Monte ou descend une rangée entière. */
  | { type: 'deplacer_rangee'; de: number; vers: number }
  /** Modifie la vue propre d'un bloc (une référence se modifie dans le fichier de sa vue). */
  | { type: 'modifier_vue'; place: PlaceBloc; modifs: ModificationVue }

export class ErreurDashboard extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurDashboard'
  }
}

export function lireDashboard(texte: string, id: string): { dashboard: Dashboard | null; avertissements: string[] } {
  let brut: unknown
  try {
    brut = parse(texte)
  } catch (e) {
    return { dashboard: null, avertissements: [`Dashboard ${id} illisible : ${(e as Error).message}`] }
  }
  if (!estObjet(brut)) return { dashboard: null, avertissements: [`Dashboard ${id} vide ou mal formé`] }
  const avertissements: string[] = []
  const rangees = (Array.isArray(brut.rangees) ? brut.rangees : []).flatMap((r, i): Rangee[] => {
    const blocs = (estObjet(r) && Array.isArray(r.blocs) ? r.blocs : []).flatMap((b, j): Bloc[] => {
      const ou = `rangée ${i + 1}, bloc ${j + 1}`
      if (!estObjet(b) || typeof b.base !== 'string') {
        avertissements.push(`Dashboard ${id}, ${ou} ignoré : base manquante`)
        return []
      }
      if (typeof b.vue === 'string') return [{ base: b.base, vue: b.vue }]
      const idVue = estObjet(b.vue) && typeof b.vue.id === 'string' ? b.vue.id : `bloc-${i + 1}-${j + 1}`
      const lue = lireVueDepuis(b.vue, idVue)
      avertissements.push(...lue.avertissements.map((a) => `Dashboard ${id}, ${ou} : ${a}`))
      if (!lue.vue) return []
      return [{ base: b.base, vue: lue.vue }]
    })
    if (blocs.length > BLOCS_PAR_RANGEE) avertissements.push(`Dashboard ${id}, rangée ${i + 1} : plus de ${BLOCS_PAR_RANGEE} blocs, les suivants passent à la ligne`)
    // Au-delà de deux blocs, on coupe en rangées plutôt que de perdre un bloc.
    const coupees: Rangee[] = []
    for (let k = 0; k < blocs.length; k += BLOCS_PAR_RANGEE) coupees.push({ blocs: blocs.slice(k, k + BLOCS_PAR_RANGEE) })
    return coupees
  })
  return { dashboard: { id, nom: typeof brut.nom === 'string' ? brut.nom : id, rangees }, avertissements }
}

export function nouveauDashboard(id: string, nom: string): string {
  return new Document({ id, nom, rangees: [] }).toString(OPTIONS_SORTIE_CONFIG)
}

/** Applique l'opération au fichier (relu sur le disque), en ne touchant qu'à la partie concernée. */
export function modifierDashboard(texte: string, op: OperationDashboard): string {
  const doc = parseDocument(texte)
  if (doc.errors.length > 0 || !isMap(doc.contents)) throw new ErreurDashboard('Dashboard illisible : modification refusée')
  const rangees = liste(doc, doc.contents, 'rangees')

  switch (op.type) {
    case 'renommer':
      doc.set('nom', op.nom)
      break
    case 'ajouter_bloc': {
      const noeud = noeudBloc(doc, op.bloc)
      if (op.rangee === null) {
        rangees.items.push(doc.createNode({ blocs: [noeud] }))
        break
      }
      const blocs = liste(doc, rangee(rangees, op.rangee), 'blocs')
      if (blocs.items.length >= BLOCS_PAR_RANGEE) throw new ErreurDashboard(`Une rangée tient ${BLOCS_PAR_RANGEE} blocs au plus`)
      blocs.items.push(noeud)
      break
    }
    case 'retirer_bloc': {
      const blocs = liste(doc, rangee(rangees, op.place.rangee), 'blocs')
      if (!blocs.items[op.place.bloc]) throw new ErreurDashboard('Bloc introuvable')
      blocs.items.splice(op.place.bloc, 1)
      if (blocs.items.length === 0) rangees.items.splice(op.place.rangee, 1)
      break
    }
    case 'deplacer_rangee': {
      const [r] = rangees.items.splice(op.de, 1)
      if (!r) throw new ErreurDashboard('Rangée introuvable')
      rangees.items.splice(Math.max(0, Math.min(op.vers, rangees.items.length)), 0, r)
      break
    }
    case 'modifier_vue': {
      const b = liste(doc, rangee(rangees, op.place.rangee), 'blocs').items[op.place.bloc]
      const vue = isMap(b) ? b.get('vue') : undefined
      if (!isMap(vue)) throw new ErreurDashboard('Ce bloc montre une vue de la base : elle se modifie dans son propre fichier')
      appliquerModificationsVue(doc, vue, op.modifs)
      break
    }
  }
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

/**
 * La même opération sur le dashboard en mémoire : l'affichage suit tout de
 * suite, et deux modifications rapides partent de la bonne base.
 */
export function appliquerEnMemoire(d: Dashboard, op: OperationDashboard): Dashboard {
  const rangees = d.rangees.map((r) => ({ blocs: [...r.blocs] }))
  switch (op.type) {
    case 'renommer':
      return { ...d, nom: op.nom }
    case 'ajouter_bloc':
      if (op.rangee === null) rangees.push({ blocs: [op.bloc] })
      else rangees[op.rangee]?.blocs.push(op.bloc)
      break
    case 'retirer_bloc': {
      const r = rangees[op.place.rangee]
      r?.blocs.splice(op.place.bloc, 1)
      if (r && r.blocs.length === 0) rangees.splice(op.place.rangee, 1)
      break
    }
    case 'deplacer_rangee': {
      const [r] = rangees.splice(op.de, 1)
      if (r) rangees.splice(Math.max(0, Math.min(op.vers, rangees.length)), 0, r)
      break
    }
    case 'modifier_vue': {
      const r = rangees[op.place.rangee]
      const b = r?.blocs[op.place.bloc]
      if (r && b && estPropre(b)) r.blocs[op.place.bloc] = { ...b, vue: { ...b.vue, ...op.modifs } }
      break
    }
  }
  return { ...d, rangees }
}

function noeudBloc(doc: Document, b: Bloc) {
  if (!estPropre(b)) {
    const n = doc.createNode({ base: b.base, vue: b.vue }) as YAMLMap
    n.flow = true
    return n
  }
  const vue = doc.createNode({ id: b.vue.id, nom: b.vue.nom, type: b.vue.type }) as YAMLMap
  const { id: _i, nom: _n, type: _t, implicite: _x, ...reglages } = b.vue
  appliquerModificationsVue(doc, vue, reglages)
  return doc.createNode({ base: b.base, vue })
}

function rangee(rangees: YAMLSeq, i: number): YAMLMap {
  const r = rangees.items[i]
  if (!isMap(r)) throw new ErreurDashboard('Rangée introuvable')
  return r
}

/** Liste en bloc (une rangée, un bloc par ligne) : un `[]` vide du fichier devient une liste en bloc en grandissant. */
function liste(doc: Document, parent: YAMLMap, cle: string): YAMLSeq {
  const n = parent.get(cle)
  if (isSeq(n)) {
    n.flow = false
    return n
  }
  const vide = doc.createNode([]) as YAMLSeq
  parent.set(cle, vide)
  return vide
}
