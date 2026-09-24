import MiniSearch from 'minisearch'
import type { LigneChargee } from './base'
import type { Schema } from './schema'

// Recherche globale (spec §11) : plein texte sur les titres, les champs texte et
// le corps de toutes les bases. Index en mémoire, tenu à jour ligne par ligne :
// seules les lignes dont le texte a changé sont réindexées.

type Document = { id: string; base: string; ligne: string; titre: string; texte: string; corps: string }

export type Resultat = {
  base: string
  ligne: string
  titre: string
  /** Passage qui contient un des mots cherchés, et les plages à surligner. */
  extrait: string
  surlignages: [number, number][]
  score: number
}

/** Minuscules sans accents, caractère par caractère : les positions restent celles du texte d'origine. */
function normaliser(texte: string): string {
  let sortie = ''
  for (const c of texte) {
    const simple = String.fromCodePoint(c.normalize('NFD').codePointAt(0)!).toLowerCase()
    // Une lettre qui change de longueur (émoji, ligature) reste telle quelle.
    sortie += simple.length === c.length ? simple : c
  }
  return sortie
}

const RAYON_EXTRAIT = 50

export class IndexRecherche {
  private readonly index = new MiniSearch<Document>({
    fields: ['titre', 'texte', 'corps'],
    storeFields: ['base', 'ligne', 'titre'],
    processTerm: (t) => normaliser(t),
    searchOptions: { boost: { titre: 3, texte: 1.5 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  })
  private readonly documents = new Map<string, Document>()

  /** Aligne l'index sur l'état des bases : ajouts, modifications et suppressions. */
  synchroniser(bases: Iterable<{ schema: Schema; lignes: readonly LigneChargee[] }>): void {
    const vus = new Set<string>()
    for (const { schema, lignes } of bases) {
      const champsTexte = schema.colonnes.filter((c) => (c.type === 'text' || c.type === 'url') && c.cle !== schema.champTitre)
      for (const l of lignes) {
        const id = `${schema.id}/${l.id}`
        if (vus.has(id)) continue // id en double : la première ligne l'emporte, comme partout
        vus.add(id)
        const lire = (cle: string) => {
          const c = l.cellules[cle]
          return c?.etat === 'ok' && typeof c.valeur === 'string' ? c.valeur : ''
        }
        const doc: Document = {
          id,
          base: schema.id,
          ligne: l.id,
          titre: lire(schema.champTitre),
          texte: champsTexte.map((c) => lire(c.cle)).filter(Boolean).join(' · '),
          corps: l.corps,
        }
        const avant = this.documents.get(id)
        if (avant && avant.titre === doc.titre && avant.texte === doc.texte && avant.corps === doc.corps) continue
        if (avant) this.index.discard(id)
        this.index.add(doc)
        this.documents.set(id, doc)
      }
    }
    for (const id of [...this.documents.keys()]) {
      if (vus.has(id)) continue
      this.index.discard(id)
      this.documents.delete(id)
    }
  }

  chercher(requete: string, limite = 50): Resultat[] {
    if (requete.trim() === '') return []
    return this.index
      .search(requete)
      .slice(0, limite)
      .map((r) => {
        const doc = this.documents.get(String(r.id))!
        return { base: doc.base, ligne: doc.ligne, titre: doc.titre, score: r.score, ...extrait(doc, r.terms) }
      })
  }
}

/** Premier passage (titre exclu : il est déjà affiché) où apparaît un des termes trouvés. */
function extrait(doc: Document, termes: string[]): { extrait: string; surlignages: [number, number][] } {
  for (const source of [doc.texte, doc.corps.replace(/\s+/g, ' ')]) {
    const n = normaliser(source)
    const positions = termes.flatMap((t) => {
      const i = n.indexOf(t)
      return i >= 0 ? [[i, i + t.length] as [number, number]] : []
    })
    if (positions.length === 0) continue
    const premier = Math.min(...positions.map(([d]) => d))
    const debut = Math.max(0, premier - RAYON_EXTRAIT)
    const fin = Math.min(source.length, premier + RAYON_EXTRAIT * 2)
    const prefixe = debut > 0 ? '…' : ''
    const texte = `${prefixe}${source.slice(debut, fin).trim()}${fin < source.length ? '…' : ''}`
    const decalage = prefixe.length - debut - (source.slice(debut, fin).length - source.slice(debut, fin).trimStart().length)
    const surlignages = positions
      .filter(([d, f]) => d >= debut && f <= fin)
      .map(([d, f]): [number, number] => [d + decalage, f + decalage])
      .sort((a, b) => a[0] - b[0])
    return { extrait: texte, surlignages }
  }
  return { extrait: '', surlignages: [] }
}
