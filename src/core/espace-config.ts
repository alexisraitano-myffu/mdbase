import { Document, isMap, isSeq, parse, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import { estObjet } from './schema'
import { OPTIONS_SORTIE_CONFIG } from './schema-ecriture'

// `_espace.yaml` (spec §3) : organisation de la barre latérale. Les groupes
// n'existent que là : déplacer une base ne touche aucun autre fichier (invariant 4).

export type Groupe = { nom: string; bases: string[] }
export type ConfigEspace = { dashboards: string[]; groupes: Groupe[]; horsGroupe: string[] }

export type OperationEspace =
  /** Place une base dans un groupe (null = hors groupe), en la retirant d'où elle était. */
  | { type: 'placer_base'; base: string; groupe: string | null; index?: number }
  | { type: 'ajouter_groupe'; nom: string }
  | { type: 'renommer_groupe'; nom: string; nouveau: string }
  /** Les bases du groupe passent hors groupe. */
  | { type: 'supprimer_groupe'; nom: string }
  | { type: 'ajouter_dashboard'; id: string }
  | { type: 'retirer_dashboard'; id: string }
  /** Retire une base supprimée de tous les groupes. */
  | { type: 'retirer_base'; base: string }

export class ErreurEspace extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurEspace'
  }
}

const chaines = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s) => typeof s === 'string') : [])

/** Lecture tolérante ; `null` (fichier absent) donne un espace vide. */
export function lireEspace(texte: string | null): ConfigEspace {
  let brut: unknown = null
  try {
    brut = texte === null ? null : parse(texte)
  } catch {
    brut = null
  }
  const barre = estObjet(brut) && estObjet(brut.barre_laterale) ? brut.barre_laterale : {}
  const groupes = (Array.isArray(barre.groupes) ? barre.groupes : []).flatMap((g): Groupe[] =>
    estObjet(g) && typeof g.nom === 'string' ? [{ nom: g.nom, bases: chaines(g.bases) }] : [],
  )
  return { dashboards: chaines(barre.dashboards), groupes, horsGroupe: chaines(barre.hors_groupe) }
}

/**
 * Barre latérale effective : les bases absentes du disque sont écartées, et
 * celles du disque que `_espace.yaml` ne cite pas s'ajoutent hors groupe.
 */
export function barreLaterale(config: ConfigEspace, basesSurDisque: readonly string[]): Omit<ConfigEspace, 'dashboards'> {
  const presentes = new Set(basesSurDisque)
  const vues = new Set<string>()
  const garder = (bases: string[]) =>
    bases.filter((b) => {
      if (!presentes.has(b) || vues.has(b)) return false
      vues.add(b)
      return true
    })
  const groupes = config.groupes.map((g) => ({ nom: g.nom, bases: garder(g.bases) }))
  const horsGroupe = garder(config.horsGroupe)
  horsGroupe.push(...basesSurDisque.filter((b) => !vues.has(b)))
  return { groupes, horsGroupe }
}

/** Ordre des dashboards : celui de `_espace.yaml`, puis ceux qu'il ne cite pas, par identifiant. */
export function ordreDashboards(config: ConfigEspace, surDisque: readonly string[]): string[] {
  const presents = new Set(surDisque)
  const cites = [...new Set(config.dashboards)].filter((d) => presents.has(d))
  return [...cites, ...[...surDisque].filter((d) => !cites.includes(d)).sort()]
}

export function modifierEspace(texte: string | null, op: OperationEspace): string {
  const doc = texte === null ? new Document({ version: 1 }) : parseDocument(texte)
  if (doc.errors.length > 0 || !isMap(doc.contents)) throw new ErreurEspace('_espace.yaml illisible : modification refusée')

  const barre = assurerMap(doc, doc.contents, 'barre_laterale')
  const dashboards = assurerListe(doc, barre, 'dashboards')
  const groupes = assurerListe(doc, barre, 'groupes', false)
  const horsGroupe = assurerListe(doc, barre, 'hors_groupe')
  const groupeNomme = (nom: string) => groupes.items.find((g): g is YAMLMap => isMap(g) && g.get('nom') === nom)
  const noms = () => groupes.items.flatMap((g) => (isMap(g) ? [String(g.get('nom'))] : []))

  switch (op.type) {
    case 'ajouter_dashboard':
      if (!dashboards.items.some((n) => valeur(n) === op.id)) dashboards.items.push(doc.createNode(op.id))
      break
    case 'retirer_dashboard':
      dashboards.items = dashboards.items.filter((n) => valeur(n) !== op.id)
      break
    case 'ajouter_groupe': {
      if (noms().includes(op.nom)) throw new ErreurEspace(`Le groupe « ${op.nom} » existe déjà`)
      const g = doc.createNode({ nom: op.nom, bases: [] }) as YAMLMap
      ;(g.get('bases') as YAMLSeq).flow = true
      groupes.items.push(g)
      break
    }
    case 'renommer_groupe': {
      if (op.nouveau !== op.nom && noms().includes(op.nouveau)) throw new ErreurEspace(`Le groupe « ${op.nouveau} » existe déjà`)
      const g = groupeNomme(op.nom)
      if (!g) throw new ErreurEspace(`Groupe introuvable : ${op.nom}`)
      g.set('nom', op.nouveau)
      break
    }
    case 'supprimer_groupe': {
      const i = groupes.items.findIndex((g) => isMap(g) && g.get('nom') === op.nom)
      if (i < 0) throw new ErreurEspace(`Groupe introuvable : ${op.nom}`)
      const bases = chaines((groupes.items[i] as YAMLMap).toJSON().bases)
      groupes.items.splice(i, 1)
      for (const b of bases) horsGroupe.items.push(doc.createNode(b))
      break
    }
    case 'retirer_base':
      for (const liste of [horsGroupe, ...groupes.items.flatMap((g) => (isMap(g) && isSeq(g.get('bases')) ? [g.get('bases') as YAMLSeq] : []))]) {
        liste.items = liste.items.filter((n) => valeur(n) !== op.base)
      }
      break
    case 'placer_base': {
      const cible = op.groupe === null ? horsGroupe : assurerListe(doc, groupeNomme(op.groupe) ?? introuvable(op.groupe), 'bases')
      for (const liste of [horsGroupe, ...groupes.items.flatMap((g) => (isMap(g) && isSeq(g.get('bases')) ? [g.get('bases') as YAMLSeq] : []))]) {
        liste.items = liste.items.filter((n) => valeur(n) !== op.base)
      }
      const index = Math.max(0, Math.min(op.index ?? cible.items.length, cible.items.length))
      cible.items.splice(index, 0, doc.createNode(op.base))
      break
    }
  }
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}

function introuvable(groupe: string): never {
  throw new ErreurEspace(`Groupe introuvable : ${groupe}`)
}

function valeur(n: unknown): unknown {
  return n && typeof n === 'object' && 'value' in n ? (n as { value: unknown }).value : n
}

function assurerMap(doc: Document, parent: YAMLMap, cle: string): YAMLMap {
  const n = parent.get(cle)
  if (isMap(n)) return n
  const vide = doc.createNode({}) as YAMLMap
  parent.set(cle, vide)
  return vide
}

function assurerListe(doc: Document, parent: YAMLMap, cle: string, flow = true): YAMLSeq {
  const n = parent.get(cle)
  if (isSeq(n)) return n
  const vide = doc.createNode([]) as YAMLSeq
  vide.flow = flow
  parent.set(cle, vide)
  return vide
}
