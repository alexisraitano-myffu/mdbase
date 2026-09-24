import { chargerBase, type ChargementBase } from './base'
import { DepotBase, type OptionsDepot } from './depot-base'
import { barreLaterale, lireEspace, modifierEspace, type ConfigEspace, type Groupe, type OperationEspace } from './espace-config'
import { listerBases } from './espace'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { cleColonne, idBase } from './identifiants'
import { colonne, lireSchema, type Colonne, type Option, type Schema } from './schema'
import { ErreurSchema, modifierSchema, nouveauSchema, type OperationSchema } from './schema-ecriture'

// Orchestration d'un espace ouvert : bases, barre latérale, et modifications de
// schéma qui touchent à la fois la configuration et les lignes (spec §3, §5).

export const FICHIER_ESPACE = '_espace.yaml'
const FICHIER_SCHEMA = '_schema.yaml'

/** Types proposés à la création d'une colonne (relations, rollups, formules : jalons suivants). */
export const TYPES_CREABLES = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url'] as const
export type TypeCreable = (typeof TYPES_CREABLES)[number]

const COULEURS = ['gris', 'bleu', 'vert', 'orange', 'violet', 'rose', 'jaune', 'rouge', 'marron']

export type EtatBase = { id: string; chargement: ChargementBase; depot: DepotBase | null }

export type EtatEspace = {
  groupes: Groupe[]
  horsGroupe: string[]
  bases: ReadonlyMap<string, EtatBase>
}

export class DepotEspace {
  private readonly adaptateur: AdaptateurFichiers
  private readonly options: OptionsDepot
  private readonly bases = new Map<string, EtatBase>()
  private config: ConfigEspace = lireEspace(null)
  private instantane: EtatEspace = { groupes: [], horsGroupe: [], bases: new Map() }
  private readonly abonnes = new Set<() => void>()
  /** Sérialise les modifications de configuration. */
  private file: Promise<unknown> = Promise.resolve()

  private constructor(adaptateur: AdaptateurFichiers, options: OptionsDepot) {
    this.adaptateur = adaptateur
    this.options = options
  }

  static async ouvrir(adaptateur: AdaptateurFichiers, options: OptionsDepot): Promise<DepotEspace> {
    const d = new DepotEspace(adaptateur, options)
    d.config = lireEspace(await d.lireOuNull(FICHIER_ESPACE))
    for (const id of await listerBases(adaptateur)) await d.chargerBase(id)
    d.publier()
    return d
  }

  etat = (): EtatEspace => this.instantane

  abonner = (fn: () => void): (() => void) => {
    this.abonnes.add(fn)
    return () => this.abonnes.delete(fn)
  }

  async vider(): Promise<void> {
    await Promise.all([...this.bases.values()].map((b) => b.depot?.vider()))
  }

  // ── Bases et groupes ─────────────────────────────────────────────

  creerBase(nom: string, groupe: string | null = null): Promise<string> {
    return this.enFile(async () => {
      const pris = (await this.adaptateur.lister('')).map((e) => e.nom)
      const id = idBase(nom, pris)
      await this.adaptateur.ecrire(joindre(id, FICHIER_SCHEMA), nouveauSchema(id, nom.trim() || id))
      await this.modifierEspace({ type: 'placer_base', base: id, groupe })
      await this.chargerBase(id)
      this.publier()
      return id
    })
  }

  renommerBase(id: string, nom: string): Promise<void> {
    return this.enFile(() => this.modifierSchema(id, { type: 'renommer_base', nom }))
  }

  placerBase(id: string, groupe: string | null, index?: number): Promise<void> {
    return this.enFile(() => this.modifierEspace({ type: 'placer_base', base: id, groupe, ...(index !== undefined && { index }) }))
  }

  ajouterGroupe(nom: string): Promise<void> {
    return this.enFile(() => this.modifierEspace({ type: 'ajouter_groupe', nom }))
  }

  renommerGroupe(nom: string, nouveau: string): Promise<void> {
    return this.enFile(() => this.modifierEspace({ type: 'renommer_groupe', nom, nouveau }))
  }

  supprimerGroupe(nom: string): Promise<void> {
    return this.enFile(() => this.modifierEspace({ type: 'supprimer_groupe', nom }))
  }

  // ── Colonnes ─────────────────────────────────────────────────────

  ajouterColonne(base: string, nom: string, type: TypeCreable): Promise<string> {
    return this.enFile(async () => {
      const schema = this.schema(base)
      const cle = cleColonne(nom, schema.colonnes.map((c) => c.cle))
      const nomAffiche = nom.trim() || cle
      const nouvelle: Colonne =
        type === 'select' || type === 'multiselect'
          ? { cle, nom: nomAffiche, type, options: [] }
          : { cle, nom: nomAffiche, type }
      await this.modifierSchema(base, { type: 'ajouter_colonne', colonne: nouvelle })
      return cle
    })
  }

  /** Ne modifie que `_schema.yaml` : la clé ne change jamais (invariant 3). */
  renommerColonne(base: string, cle: string, nom: string): Promise<void> {
    return this.enFile(() => this.modifierSchema(base, { type: 'renommer_colonne', cle, nom }))
  }

  deplacerColonne(base: string, cle: string, index: number): Promise<void> {
    return this.enFile(() => this.modifierSchema(base, { type: 'deplacer_colonne', cle, index }))
  }

  /** Colonnes calculées qui dépendent de `cle`, à montrer avant une suppression (spec §5). */
  dependants(base: string, cle: string): string[] {
    const trouves: string[] = []
    for (const b of this.bases.values()) {
      if (!b.chargement.ok) continue
      const s = b.chargement.base.schema
      for (const c of s.colonnes) {
        const local = b.id === base
        const depend =
          (local && c.type === 'formula' && c.expression.includes(`prop("${cle}")`)) ||
          (local && c.type === 'rollup' && c.relation === cle) ||
          (c.type === 'rollup' && relationVers(s, c.relation) === base && c.champ === cle)
        if (depend) trouves.push(`${s.nom} › ${c.nom}`)
      }
    }
    return trouves
  }

  /**
   * Supprime une colonne et son contenu (spec §5) : les valeurs sont d'abord
   * retirées des fichiers de lignes, puis la colonne du schéma. Une coupure en
   * cours de route laisse donc une colonne existante, partiellement vidée.
   * Renvoie le nombre de fichiers de lignes réécrits.
   */
  supprimerColonne(base: string, cle: string): Promise<number> {
    return this.enFile(async () => {
      const schema = this.schema(base)
      if (cle === schema.champTitre) {
        throw new ErreurSchema('La colonne titre ne peut pas être supprimée : choisis d’abord une autre colonne titre')
      }
      const n = await this.depot(base).effacerColonne(cle)
      await this.modifierSchema(base, { type: 'supprimer_colonne', cle })
      return n
    })
  }

  /** Change la colonne titre, puis renomme les fichiers selon le nouveau titre (spec §3). */
  changerTitre(base: string, cle: string): Promise<void> {
    return this.enFile(async () => {
      const c = colonne(this.schema(base), cle)
      if (c?.type !== 'text') throw new ErreurSchema('Seule une colonne texte peut servir de titre')
      await this.modifierSchema(base, { type: 'champ_titre', cle })
      await this.depot(base).renommerTousSelonTitre()
    })
  }

  /** Ajoute une option à un select ou multiselect, ou renvoie celle qui porte déjà ce libellé. */
  ajouterOption(base: string, cle: string, label: string): Promise<Option> {
    return this.enFile(async () => {
      const c = colonne(this.schema(base), cle)
      if (c?.type !== 'select' && c?.type !== 'multiselect') throw new ErreurSchema(`Pas une colonne à options : ${cle}`)
      const existante = c.options.find((o) => o.label === label)
      if (existante) return existante
      const option = { label, couleur: COULEURS[c.options.length % COULEURS.length]! }
      await this.modifierSchema(base, { type: 'ajouter_option', cle, option })
      return option
    })
  }

  // ── Interne ──────────────────────────────────────────────────────

  private enFile<T>(operation: () => Promise<T>): Promise<T> {
    const resultat = this.file.then(operation)
    this.file = resultat.catch(() => undefined)
    return resultat
  }

  private schema(base: string): Schema {
    const b = this.bases.get(base)
    if (!b?.chargement.ok) throw new ErreurSchema(`Base introuvable : ${base}`)
    return b.chargement.base.schema
  }

  private depot(base: string): DepotBase {
    const d = this.bases.get(base)?.depot
    if (!d) throw new ErreurSchema(`Base introuvable : ${base}`)
    return d
  }

  /** Relit le fichier sur le disque, applique l'opération, réécrit (spec §4). */
  private async modifierSchema(base: string, op: OperationSchema): Promise<void> {
    const chemin = joindre(base, FICHIER_SCHEMA)
    const texte = modifierSchema(await this.adaptateur.lire(chemin), op)
    await this.adaptateur.ecrire(chemin, texte)
    const { schema, avertissements } = lireSchema(texte, base)
    const b = this.bases.get(base)
    if (!schema || !b?.chargement.ok || !b.depot) return
    b.depot.remplacerSchema(schema)
    this.bases.set(base, { ...b, chargement: { ok: true, base: { ...b.chargement.base, schema, avertissements } } })
    this.publier()
  }

  private async modifierEspace(op: OperationEspace): Promise<void> {
    const texte = modifierEspace(await this.lireOuNull(FICHIER_ESPACE), op)
    await this.adaptateur.ecrire(FICHIER_ESPACE, texte)
    this.config = lireEspace(texte)
    this.publier()
  }

  private async chargerBase(id: string) {
    const chargement = await chargerBase(this.adaptateur, id)
    const depot = chargement.ok
      ? new DepotBase(this.adaptateur, chargement.base.schema, chargement.base.lignes, this.options)
      : null
    this.bases.set(id, { id, chargement, depot })
  }

  private async lireOuNull(chemin: string): Promise<string | null> {
    try {
      return await this.adaptateur.lire(chemin)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return null
      throw e
    }
  }

  private publier() {
    const { groupes, horsGroupe } = barreLaterale(this.config, [...this.bases.keys()])
    this.instantane = { groupes, horsGroupe, bases: new Map(this.bases) }
    for (const fn of this.abonnes) fn()
  }
}

function relationVers(schema: Schema, cle: string): string | undefined {
  const c = colonne(schema, cle)
  return c?.type === 'relation' ? c.cible : undefined
}
