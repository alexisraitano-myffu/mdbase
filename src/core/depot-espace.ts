import { chargerBase, type ChargementBase } from './base'
import { DepotBase, type OptionsDepot } from './depot-base'
import { barreLaterale, lireEspace, modifierEspace, type ConfigEspace, type Groupe, type OperationEspace } from './espace-config'
import { listerBases } from './espace'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { cleColonne, idBase } from './identifiants'
import { colonne, lireSchema, type Colonne, type Option, type Schema } from './schema'
import { ErreurSchema, modifierSchema, nouveauSchema, type OperationSchema } from './schema-ecriture'
import { lireVue, modifierVue, vueParDefaut, type ModificationVue, type Vue } from './vue'

// Orchestration d'un espace ouvert : bases, barre latérale, et modifications de
// schéma qui touchent à la fois la configuration et les lignes (spec §3, §5).

export const FICHIER_ESPACE = '_espace.yaml'
const FICHIER_SCHEMA = '_schema.yaml'
const DOSSIER_VUES = '_vues'

/** Types proposés à la création d'une colonne (relations, rollups, formules : jalons suivants). */
export const TYPES_CREABLES = ['text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'url'] as const
export type TypeCreable = (typeof TYPES_CREABLES)[number]

const COULEURS = ['gris', 'bleu', 'vert', 'orange', 'violet', 'rose', 'jaune', 'rouge', 'marron']

export type EtatBase = {
  id: string
  chargement: ChargementBase
  depot: DepotBase | null
  /** Jamais vide : une base sans `_vues/` a une vue tableau implicite. */
  vues: Vue[]
}

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

  // ── Vues ─────────────────────────────────────────────────────────

  /** Modifie une vue ; la vue implicite d'une base obtient alors son fichier. */
  modifierVue(base: string, idVue: string, modifs: ModificationVue): Promise<void> {
    return this.enFile(async () => {
      const vue = this.vue(base, idVue)
      const chemin = cheminVue(base, idVue)
      const texte = modifierVue(vue.implicite ? null : await this.lireOuNull(chemin), vue, modifs)
      await this.adaptateur.ecrire(chemin, texte)
      const relue = lireVue(texte, idVue).vue
      if (relue) this.remplacerVues(base, (vues) => vues.map((v) => (v.id === idVue ? relue : v)))
    })
  }

  creerVue(base: string, nom: string): Promise<string> {
    return this.enFile(async () => {
      const vues = this.etatBase(base).vues
      const id = idBase(nom, vues.map((v) => v.id))
      const vue: Vue = { ...vueParDefaut(), id, nom: nom.trim() || id }
      delete vue.implicite
      await this.adaptateur.ecrire(cheminVue(base, id), modifierVue(null, vue, {}))
      // La vue implicite n'a pas de fichier : la garder ferait croire qu'elle existe encore.
      this.remplacerVues(base, (vs) => [...vs.filter((v) => !v.implicite), vue])
      return id
    })
  }

  supprimerVue(base: string, idVue: string): Promise<void> {
    return this.enFile(async () => {
      const vues = this.etatBase(base).vues
      if (vues.length <= 1) throw new ErreurSchema('Une base garde toujours au moins une vue')
      if (!this.vue(base, idVue).implicite) await this.adaptateur.supprimer(cheminVue(base, idVue))
      this.remplacerVues(base, (vs) => vs.filter((v) => v.id !== idVue))
    })
  }

  // ── Interne ──────────────────────────────────────────────────────

  private etatBase(base: string): EtatBase {
    const b = this.bases.get(base)
    if (!b) throw new ErreurSchema(`Base introuvable : ${base}`)
    return b
  }

  private vue(base: string, idVue: string): Vue {
    const v = this.etatBase(base).vues.find((x) => x.id === idVue)
    if (!v) throw new ErreurSchema(`Vue introuvable : ${idVue}`)
    return v
  }

  private remplacerVues(base: string, f: (vues: Vue[]) => Vue[]) {
    const b = this.etatBase(base)
    this.bases.set(base, { ...b, vues: f(b.vues) })
    this.publier()
  }

  private async chargerVues(base: string): Promise<{ vues: Vue[]; avertissements: string[] }> {
    const dossier = joindre(base, DOSSIER_VUES)
    let entrees
    try {
      entrees = await this.adaptateur.lister(dossier)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return { vues: [vueParDefaut()], avertissements: [] }
      throw e
    }
    const vues: Vue[] = []
    const avertissements: string[] = []
    for (const e of entrees) {
      if (e.type !== 'fichier' || !e.nom.endsWith('.yaml')) continue
      const lue = lireVue(await this.adaptateur.lire(joindre(dossier, e.nom)), e.nom.slice(0, -'.yaml'.length))
      avertissements.push(...lue.avertissements)
      if (lue.vue) vues.push(lue.vue)
    }
    return { vues: vues.length > 0 ? vues : [vueParDefaut()], avertissements }
  }


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
    if (!chargement.ok) {
      this.bases.set(id, { id, chargement, depot: null, vues: [] })
      return
    }
    const { vues, avertissements } = await this.chargerVues(id)
    chargement.base.avertissements.push(...avertissements)
    const depot = new DepotBase(this.adaptateur, chargement.base.schema, chargement.base.lignes, this.options)
    this.bases.set(id, { id, chargement, depot, vues })
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

function cheminVue(base: string, idVue: string): string {
  return joindre(base, DOSSIER_VUES, `${idVue}.yaml`)
}

function relationVers(schema: Schema, cle: string): string | undefined {
  const c = colonne(schema, cle)
  return c?.type === 'relation' ? c.cible : undefined
}
