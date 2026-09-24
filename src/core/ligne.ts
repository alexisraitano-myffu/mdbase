import { Document, isMap, isScalar, isSeq, parseDocument, type Pair, type YAMLMap } from 'yaml'
import { CLE_ID, colonne, estObjet, estSaisie, type Schema } from './schema'
import { decoder, encoder, type Cellule, type Valeur } from './valeurs'

// Fichier d'une ligne (spec §3) : frontmatter YAML + corps Markdown.
// L'app écrit strictement mais lit avec tolérance (spec §4), et la réécriture
// passe par l'API Document de `yaml` pour préserver le formatage, commentaires compris.

export type Ligne = {
  id: string
  chemin: string
  /** Colonnes saisies présentes dans le fichier. Une clé absente = champ vide. */
  cellules: Record<string, Cellule>
  /** Clés hors schéma (ou de colonnes calculées), conservées à la réécriture. */
  inconnus: string[]
  corps: string
  /** Texte complet lu, base de toute réécriture. */
  source: string
}

export type LectureLigne = { ok: true; ligne: Ligne } | { ok: false; raison: string }

/** Modifications à appliquer : `undefined` vide le champ. */
export type Modifications = Record<string, Valeur | undefined>

export class ErreurEcriture extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurEcriture'
  }
}

const OPTIONS_SORTIE = { lineWidth: 0, flowCollectionPadding: false } as const
const FRONTMATTER = /^---\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/

type Decoupage = { frontmatter: string; corps: string; crlf: boolean }

function decouper(texte: string): Decoupage | null {
  texte = texte.replace(/^\uFEFF/, '') // BOM ajouté par certains éditeurs Windows
  const m = FRONTMATTER.exec(texte)
  if (!m) return null
  return { frontmatter: m[1] ?? '', corps: texte.slice(m[0].length), crlf: texte.includes('\r\n') }
}

export function lireLigne(chemin: string, texte: string, schema: Schema): LectureLigne {
  const d = decouper(texte)
  if (!d) return { ok: false, raison: 'pas de frontmatter' }
  const doc = parseDocument(d.frontmatter)
  if (doc.errors.length > 0) return { ok: false, raison: `frontmatter illisible : ${doc.errors[0]!.message}` }
  const donnees: unknown = doc.toJS()
  if (!estObjet(donnees)) return { ok: false, raison: 'frontmatter vide ou mal formé' }

  const id = donnees[CLE_ID]
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id) === '') {
    return { ok: false, raison: 'pas d’id' }
  }

  const cellules: Record<string, Cellule> = {}
  const inconnus: string[] = []
  for (const [cle, brut] of Object.entries(donnees)) {
    if (cle === CLE_ID) continue
    const c = colonne(schema, cle)
    if (!c || !estSaisie(c)) inconnus.push(cle)
    else if (brut !== null) cellules[cle] = decoder(c, brut)
  }
  return { ok: true, ligne: { id: String(id), chemin, cellules, inconnus, corps: d.corps, source: texte } }
}

/**
 * Applique des modifications au texte d'une ligne, en ne touchant qu'aux clés
 * modifiées. Refuse d'écrire une colonne calculée (invariant 1).
 *
 * Limite connue : `yaml` normalise l'espacement du reste du frontmatter (espaces
 * avant un commentaire). Valeurs, commentaires, ordre et style de citation sont
 * conservés. Sans modification, le texte est rendu tel quel.
 *
 * @param corps nouveau corps ; omis, le corps existant est gardé à l'identique.
 */
export function reecrireLigne(source: string, schema: Schema, modifs: Modifications, corps?: string): string {
  const d = decouper(source)
  if (!d) throw new ErreurEcriture('Fichier sans frontmatter : réécriture refusée')
  if (Object.keys(modifs).length === 0 && corps === undefined) return source
  const doc = parseDocument(d.frontmatter)
  if (doc.errors.length > 0 || !isMap(doc.contents)) {
    throw new ErreurEcriture('Frontmatter illisible : réécriture refusée pour ne rien perdre')
  }
  appliquer(doc, doc.contents, schema, modifs)
  return assembler(doc, corps ?? d.corps, d.crlf)
}

/** Texte d'une nouvelle ligne, clés dans l'ordre du schéma (spec §3). */
export function creerLigne(schema: Schema, id: string, valeurs: Modifications = {}, corps = ''): string {
  const doc = new Document({ [CLE_ID]: id })
  appliquer(doc, doc.contents as YAMLMap, schema, valeurs)
  return assembler(doc, corps, false)
}

function appliquer(doc: Document, carte: YAMLMap, schema: Schema, modifs: Modifications) {
  for (const [cle, valeur] of Object.entries(modifs)) {
    const c = colonne(schema, cle)
    if (!c) throw new ErreurEcriture(`Colonne inconnue : ${cle}`)
    if (!estSaisie(c)) throw new ErreurEcriture(`Colonne calculée, jamais écrite : ${cle}`)

    const encodee = encoder(c, valeur)
    const index = carte.items.findIndex((p) => cleDe(p) === cle)
    if (encodee === undefined) {
      if (index >= 0) carte.items.splice(index, 1)
      continue
    }
    const noeud = doc.createNode(encodee, { flow: true })
    if (index >= 0) {
      const paire = carte.items[index]!
      // Garde le commentaire de fin de ligne et le style de liste existants.
      if (isScalar(paire.value) && isScalar(noeud)) noeud.comment = paire.value.comment
      if (isSeq(paire.value) && isSeq(noeud)) noeud.flow = paire.value.flow ?? false
      paire.value = noeud
    } else {
      carte.items.splice(positionInsertion(carte, schema, cle), 0, doc.createPair(cle, noeud))
    }
  }
}

/** Avant la première clé du schéma qui doit venir après, sinon en fin. */
function positionInsertion(carte: YAMLMap, schema: Schema, cle: string): number {
  const rang = (k: string) => schema.colonnes.findIndex((c) => c.cle === k)
  const cible = rang(cle)
  const apres = carte.items.findIndex((p) => {
    const k = cleDe(p)
    return k !== CLE_ID && rang(k) > cible
  })
  return apres >= 0 ? apres : carte.items.length
}

function cleDe(p: Pair): string {
  return isScalar(p.key) ? String(p.key.value) : String(p.key)
}

function assembler(doc: Document, corps: string, crlf: boolean): string {
  let frontmatter = doc.toString(OPTIONS_SORTIE)
  if (crlf) frontmatter = frontmatter.replace(/\r?\n/g, '\r\n')
  const fin = crlf ? '\r\n' : '\n'
  return `---${fin}${frontmatter}---${fin}${corps}`
}
