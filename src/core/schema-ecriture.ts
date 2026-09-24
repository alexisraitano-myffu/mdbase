import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import type { Colonne, Option } from './schema'

// Réécriture de `_schema.yaml` par l'API Document de `yaml` : seule la partie
// concernée change, commentaires et mise en forme du reste sont conservés.

export type OperationSchema =
  | { type: 'ajouter_colonne'; colonne: Colonne }
  | { type: 'renommer_colonne'; cle: string; nom: string }
  | { type: 'deplacer_colonne'; cle: string; index: number }
  | { type: 'supprimer_colonne'; cle: string }
  | { type: 'champ_titre'; cle: string }
  | { type: 'ajouter_option'; cle: string; option: Option }
  | { type: 'renommer_base'; nom: string }
  /** Remplace des propriétés d'une colonne (config d'un rollup…) ; `undefined` retire la propriété. */
  | { type: 'modifier_colonne'; cle: string; proprietes: Record<string, unknown> }

export class ErreurSchema extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurSchema'
  }
}

// Espaces dans les accolades : style des exemples de la spec (`{ label: À faire, couleur: gris }`).
export const OPTIONS_SORTIE_CONFIG = { lineWidth: 0, flowCollectionPadding: true } as const

/** Texte du schéma d'une nouvelle base : une seule colonne, le titre. */
export function nouveauSchema(id: string, nom: string): string {
  const doc = new Document({
    version: 1,
    id,
    nom,
    champ_titre: 'titre',
    colonnes: [{ cle: 'titre', nom: 'Titre', type: 'text' }],
  })
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

export function modifierSchema(texte: string, op: OperationSchema): string {
  const doc = parseDocument(texte)
  if (doc.errors.length > 0 || !isMap(doc.contents)) throw new ErreurSchema('_schema.yaml illisible : modification refusée')

  switch (op.type) {
    case 'renommer_base':
      doc.set('nom', op.nom)
      break
    case 'champ_titre':
      doc.set('champ_titre', op.cle)
      break
    case 'ajouter_colonne': {
      const { cle, nom, type, ...reste } = op.colonne
      const noeud = doc.createNode({ cle, nom, type, ...reste }) as YAMLMap
      const options = noeud.get('options')
      if (isSeq(options)) for (const o of options.items) if (isMap(o)) o.flow = true
      colonnes(doc).items.push(noeud)
      break
    }
    case 'renommer_colonne':
      trouverColonne(doc, op.cle).set('nom', op.nom)
      break
    case 'modifier_colonne': {
      const c = trouverColonne(doc, op.cle)
      for (const [k, v] of Object.entries(op.proprietes)) {
        if (k === 'cle' || k === 'type') throw new ErreurSchema(`La propriété « ${k} » d'une colonne ne change pas`)
        if (v === undefined) c.delete(k)
        else c.set(k, doc.createNode(v, { flow: true }))
      }
      break
    }
    case 'supprimer_colonne': {
      const seq = colonnes(doc)
      seq.items.splice(indexColonne(seq, op.cle), 1)
      break
    }
    case 'deplacer_colonne': {
      const seq = colonnes(doc)
      const [noeud] = seq.items.splice(indexColonne(seq, op.cle), 1)
      seq.items.splice(Math.max(0, Math.min(op.index, seq.items.length)), 0, noeud)
      break
    }
    case 'ajouter_option': {
      const colonne = trouverColonne(doc, op.cle)
      let options = colonne.get('options')
      if (!isSeq(options)) {
        options = doc.createNode([])
        colonne.set('options', options)
      }
      const noeud = doc.createNode({ label: op.option.label, ...(op.option.couleur && { couleur: op.option.couleur }) })
      noeud.flow = true
      ;(options as YAMLSeq).items.push(noeud)
      break
    }
  }
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

function colonnes(doc: Document): YAMLSeq {
  const seq = doc.get('colonnes')
  if (isSeq(seq)) return seq
  const vide = doc.createNode([]) as YAMLSeq
  doc.set('colonnes', vide)
  return vide
}

function indexColonne(seq: YAMLSeq, cle: string): number {
  const i = seq.items.findIndex((n) => isMap(n) && n.get('cle') === cle)
  if (i < 0) throw new ErreurSchema(`Colonne introuvable dans _schema.yaml : ${cle}`)
  return i
}

function trouverColonne(doc: Document, cle: string): YAMLMap {
  const seq = colonnes(doc)
  return seq.items[indexColonne(seq, cle)] as YAMLMap
}
