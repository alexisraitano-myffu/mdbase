import { chargerBase, type ChargementBase, type LigneChargee } from './base'
import { calculer, type BaseACalculer, type Calculs } from './calcul'
import { DepotBase, type OptionsDepot } from './depot-base'
import { barreLaterale, lireEspace, modifierEspace, type ConfigEspace, type Groupe, type OperationEspace } from './espace-config'
import { listerBases } from './espace'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { cleColonne, idBase } from './identifiants'
import { compiler, ErreurFormule } from './formules/formule'
import { boucle } from './graphe'
import type { Modifications } from './ligne'
import { CALCULS, colonne, estObjet, estSaisie, lireSchema, type Calcul, type Colonne, type ColonneRelation, type Option, type Schema } from './schema'
import { ErreurSchema, modifierSchema, nouveauSchema, type OperationSchema } from './schema-ecriture'
import { CHAMPS_MODIFIABLES, lireVue, modifierVue, vueParDefaut, type ModificationVue, type TypeVue, type Vue } from './vue'
import {
  lireMiseEnPage,
  miseEnPageParDefaut,
  modifierMiseEnPage,
  type MiseEnPage,
  type ModificationMiseEnPage,
} from './mise-en-page'

// Orchestration d'un espace ouvert : bases, barre latérale, et modifications de
// schéma qui touchent à la fois la configuration et les lignes (spec §3, §5).

export const FICHIER_ESPACE = '_espace.yaml'
const FICHIER_SCHEMA = '_schema.yaml'
const DOSSIER_VUES = '_vues'
const DOSSIER_PAGES = '_pages'

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
  /** Jamais vide : une base sans `_pages/` a une mise en page implicite. */
  pages: MiseEnPage[]
}

export type EtatEspace = {
  groupes: Groupe[]
  horsGroupe: string[]
  bases: ReadonlyMap<string, EtatBase>
  /** Valeurs des colonnes calculées (relations non propriétaires, rollups), par base puis par id. */
  calculs: Calculs
  /** Titre de chaque ligne, par base puis par id : pastilles de relation, liens cassés. */
  titres: ReadonlyMap<string, ReadonlyMap<string, string>>
}

export type OptionsEspace = OptionsDepot & {
  /** Date du jour `AAAA-MM-JJ`, pour les filtres relatifs des rollups et les formules. */
  aujourdhui: () => string
  /** Date et heure `AAAA-MM-JJTHH:mm`, pour `maintenant()` ; minuit du jour par défaut. */
  maintenant?: () => string
}

export class DepotEspace {
  private readonly adaptateur: AdaptateurFichiers
  private readonly options: OptionsEspace
  private readonly bases = new Map<string, EtatBase>()
  private config: ConfigEspace = lireEspace(null)
  private instantane: EtatEspace = { groupes: [], horsGroupe: [], bases: new Map(), calculs: new Map(), titres: new Map() }
  private readonly abonnes = new Set<() => void>()
  /** Sérialise les modifications de configuration. */
  private file: Promise<unknown> = Promise.resolve()

  private constructor(adaptateur: AdaptateurFichiers, options: OptionsEspace) {
    this.adaptateur = adaptateur
    this.options = options
  }

  static async ouvrir(adaptateur: AdaptateurFichiers, options: OptionsEspace): Promise<DepotEspace> {
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
    const cibles: [string, string][] = [[base, cle]]
    // Supprimer une relation supprime aussi sa colonne miroir : ses dépendants comptent.
    const c = this.bases.get(base)?.chargement.ok ? colonne(this.schema(base), cle) : undefined
    if (c?.type === 'relation') cibles.push([c.cible, c.inverse])
    const trouves: string[] = []
    for (const [b, k] of cibles) {
      for (const autre of this.bases.values()) {
        if (!autre.chargement.ok) continue
        const s = autre.chargement.base.schema
        for (const x of s.colonnes) {
          if (x.cle === k && autre.id === b) continue
          const local = autre.id === b
          const depend =
            (local && x.type === 'formula' && x.expression.includes(`prop("${k}")`)) ||
            (local && x.type === 'rollup' && x.relation === k) ||
            (x.type === 'rollup' && relationVers(s, x.relation) === b && x.champ === k)
          if (depend) trouves.push(`${s.nom} › ${x.nom}`)
        }
      }
    }
    return [...new Set(trouves)]
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
      const c = colonne(schema, cle)
      if (c?.type === 'relation') return this.supprimerRelation(base, c)
      const n = c && estSaisie(c) ? await this.depot(base).effacerColonne(cle) : 0
      await this.modifierSchema(base, { type: 'supprimer_colonne', cle })
      return n
    })
  }

  /**
   * Supprime une relation depuis l'un ou l'autre côté (spec §5) : les ids sont
   * retirés des fichiers du côté propriétaire, puis les deux colonnes des schémas.
   */
  private async supprimerRelation(base: string, c: ColonneRelation): Promise<number> {
    const [baseProprio, cleProprio, baseMiroir, cleMiroir] = c.proprietaire
      ? [base, c.cle, c.cible, c.inverse]
      : [c.cible, c.inverse, base, c.cle]
    const proprio = this.bases.get(baseProprio)?.chargement.ok ? colonne(this.schema(baseProprio), cleProprio) : undefined
    const n = proprio?.type === 'relation' && proprio.proprietaire ? await this.depot(baseProprio).effacerColonne(cleProprio) : 0
    if (proprio) await this.modifierSchema(baseProprio, { type: 'supprimer_colonne', cle: cleProprio })
    const miroir = this.bases.get(baseMiroir)?.chargement.ok ? colonne(this.schema(baseMiroir), cleMiroir) : undefined
    if (miroir?.type === 'relation' && miroir.cible === baseProprio) {
      await this.modifierSchema(baseMiroir, { type: 'supprimer_colonne', cle: cleMiroir })
    }
    return n
  }

  /**
   * Crée une relation bidirectionnelle (spec §5) : la colonne propriétaire ici,
   * la colonne miroir (nommée d'après cette base) dans la base cible.
   */
  ajouterRelation(base: string, nom: string, cible: string): Promise<string> {
    return this.enFile(async () => {
      if (cible === base) throw new ErreurSchema('Une relation relie deux bases différentes (auto-relation : plus tard)')
      const schema = this.schema(base)
      const schemaCible = this.schema(cible)
      const cle = cleColonne(nom, schema.colonnes.map((c) => c.cle))
      const cleMiroir = cleColonne(schema.nom, schemaCible.colonnes.map((c) => c.cle))
      await this.modifierSchema(base, {
        type: 'ajouter_colonne',
        colonne: { cle, nom: nom.trim() || schemaCible.nom, type: 'relation', cible, proprietaire: true, inverse: cleMiroir },
      })
      await this.modifierSchema(cible, {
        type: 'ajouter_colonne',
        colonne: { cle: cleMiroir, nom: schema.nom, type: 'relation', cible: base, proprietaire: false, inverse: cle },
      })
      return cle
    })
  }

  /** Crée un rollup ; refusé s'il créerait une boucle de dépendances (invariant 7). */
  ajouterRollup(base: string, nom: string, relation: string, champ: string, calcul: Calcul): Promise<string> {
    return this.enFile(async () => {
      const schema = this.schema(base)
      const rel = colonne(schema, relation)
      if (rel?.type !== 'relation') throw new ErreurSchema(`Pas une relation : ${relation}`)
      if (!colonne(this.schema(rel.cible), champ)) throw new ErreurSchema(`Colonne introuvable : ${champ}`)
      if (!(CALCULS as readonly string[]).includes(calcul)) throw new ErreurSchema(`Calcul inconnu : ${calcul}`)
      const cle = cleColonne(nom, schema.colonnes.map((c) => c.cle))
      const nouvelle: Colonne = { cle, nom: nom.trim() || cle, type: 'rollup', relation, champ, calcul }
      const schemas = new Map(this.schemas())
      schemas.set(base, { ...schema, colonnes: [...schema.colonnes, nouvelle] })
      const b = boucle(schemas)
      if (b) throw new ErreurSchema(`Rollup refusé. ${b}`)
      await this.modifierSchema(base, { type: 'ajouter_colonne', colonne: nouvelle })
      return cle
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

  /** Change la relation, la colonne remontée ou le calcul d'un rollup ; refusé s'il créerait une boucle. */
  modifierRollup(base: string, cle: string, modifs: { relation?: string; champ?: string; calcul?: Calcul }): Promise<void> {
    return this.enFile(async () => {
      const schema = this.schema(base)
      const actuel = colonne(schema, cle)
      if (actuel?.type !== 'rollup') throw new ErreurSchema(`Pas un rollup : ${cle}`)
      const suivant = { ...actuel, ...modifs }
      const rel = colonne(schema, suivant.relation)
      if (rel?.type !== 'relation') throw new ErreurSchema(`Pas une relation : ${suivant.relation}`)
      if (!colonne(this.schema(rel.cible), suivant.champ)) throw new ErreurSchema(`Colonne introuvable : ${suivant.champ}`)
      if (!(CALCULS as readonly string[]).includes(suivant.calcul)) throw new ErreurSchema(`Calcul inconnu : ${suivant.calcul}`)
      const schemas = new Map(this.schemas())
      schemas.set(base, { ...schema, colonnes: schema.colonnes.map((c) => (c.cle === cle ? suivant : c)) })
      const b = boucle(schemas)
      if (b) throw new ErreurSchema(`Modification refusée. ${b}`)
      const proprietes: Record<string, unknown> = { ...modifs }
      if (modifs.relation !== undefined && modifs.relation !== actuel.relation) {
        // Le filtre portait sur les lignes de l'ancienne base liée : il n'a plus de sens.
        proprietes.filtre = undefined
      } else if (modifs.champ !== undefined && modifs.champ !== actuel.champ && estObjet(actuel.filtre) && actuel.filtre.colonne === undefined) {
        // Un filtre sans colonne porte sur la colonne remontée : on le fixe sur l'ancienne pour qu'il garde son sens.
        proprietes.filtre = { colonne: actuel.champ, ...actuel.filtre }
      }
      await this.modifierSchema(base, { type: 'modifier_colonne', cle, proprietes })
    })
  }

  /**
   * Crée une formule (spec §6) à partir de son expression stockée (clés). Refusée
   * si elle ne se compile pas ou créerait une boucle (invariant 7).
   */
  ajouterFormule(base: string, nom: string, expression: string): Promise<string> {
    return this.enFile(async () => {
      const schema = this.schema(base)
      const cle = cleColonne(nom, schema.colonnes.map((c) => c.cle))
      const nouvelle: Colonne = { cle, nom: nom.trim() || cle, type: 'formula', expression }
      this.verifierFormule(base, nouvelle)
      await this.modifierSchema(base, { type: 'ajouter_colonne', colonne: nouvelle })
      return cle
    })
  }

  modifierFormule(base: string, cle: string, expression: string): Promise<void> {
    return this.enFile(async () => {
      const actuelle = colonne(this.schema(base), cle)
      if (actuelle?.type !== 'formula') throw new ErreurSchema(`Pas une formule : ${cle}`)
      if (actuelle.expression === expression) return
      this.verifierFormule(base, { ...actuelle, expression })
      await this.modifierSchema(base, { type: 'modifier_colonne', cle, proprietes: { expression } })
    })
  }

  private verifierFormule(base: string, formule: Extract<Colonne, { type: 'formula' }>) {
    const schema = this.schema(base)
    const colonnes = schema.colonnes.some((c) => c.cle === formule.cle)
      ? schema.colonnes.map((c) => (c.cle === formule.cle ? formule : c))
      : [...schema.colonnes, formule]
    const schemas = new Map(this.schemas())
    schemas.set(base, { ...schema, colonnes })
    const b = boucle(schemas)
    if (b) throw new ErreurSchema(`Formule refusée. ${b}`)
    try {
      compiler(formule.expression, (cle) => colonnes.find((c) => c.cle === cle))
    } catch (e) {
      if (e instanceof ErreurFormule) throw new ErreurSchema(`Formule refusée : ${e.message}`)
      throw e
    }
  }

  /** Recalcule les colonnes calculées : au changement de jour, pour `aujourdhui()` (spec §6). */
  recalculer(): void {
    this.publier()
  }

  // ── Lignes et liens ──────────────────────────────────────────────

  /**
   * Remplace les liens d'une relation pour une ligne (spec §5). Côté
   * propriétaire : son propre fichier. Côté non propriétaire : chaque lien
   * ajouté ou retiré s'écrit dans le fichier de la ligne liée, un seul
   * fichier par lien (invariant 2).
   */
  modifierRelation(base: string, idLigne: string, cle: string, ids: readonly string[]): void {
    const c = colonne(this.schema(base), cle)
    if (c?.type !== 'relation') throw new ErreurSchema(`Pas une relation : ${cle}`)
    const ligne = this.ligne(base, idLigne)
    if (c.proprietaire) {
      this.depot(base).modifier(ligne.chemin, cle, [...ids])
      return
    }
    const actuels = this.idsCalcules(base, idLigne, cle)
    const depotCible = this.depot(c.cible)
    const basculer = (idCible: string, lier: boolean) => {
      const cibleLigne = this.ligne(c.cible, idCible)
      const cellule = cibleLigne.cellules[c.inverse]
      const liens = cellule?.etat === 'ok' && Array.isArray(cellule.valeur) ? cellule.valeur : []
      const suivants = lier ? [...liens.filter((x) => x !== idLigne), idLigne] : liens.filter((x) => x !== idLigne)
      depotCible.modifier(cibleLigne.chemin, c.inverse, suivants)
    }
    for (const id of ids) if (!actuels.includes(id)) basculer(id, true)
    for (const id of actuels) if (!ids.includes(id)) basculer(id, false)
  }

  /**
   * Crée une ligne (spec §8). Les valeurs d'une relation non propriétaire
   * (héritées d'un filtre « contient ») s'écrivent dans les lignes liées.
   */
  async creerLigne(base: string, valeurs: Modifications = {}): Promise<LigneChargee> {
    const schema = this.schema(base)
    const saisies: Modifications = {}
    const liens: [string, string[]][] = []
    for (const [cle, v] of Object.entries(valeurs)) {
      const c = colonne(schema, cle)
      if (!c) continue
      if (estSaisie(c)) saisies[cle] = v
      else if (c.type === 'relation' && Array.isArray(v)) liens.push([cle, v])
    }
    const ligne = await this.depot(base).creer(saisies)
    for (const [cle, ids] of liens) this.modifierRelation(base, ligne.id, cle, ids)
    return ligne
  }

  // ── Vues ─────────────────────────────────────────────────────────

  /**
   * Modifie une vue : l'état en mémoire change tout de suite (deux modifications
   * rapides partent ainsi de la bonne base), le fichier suit. La vue implicite
   * d'une base obtient alors son fichier.
   */
  modifierVue(base: string, idVue: string, modifs: ModificationVue): Promise<void> {
    this.vue(base, idVue)
    this.remplacerVues(base, (vues) => vues.map((v) => (v.id === idVue ? { ...v, ...modifs } : v)))
    return this.enFile(async () => {
      const vue = this.vue(base, idVue)
      const chemin = cheminVue(base, idVue)
      const texte = modifierVue(vue.implicite ? null : await this.lireOuNull(chemin), vue, modifs)
      await this.adaptateur.ecrire(chemin, texte)
      const relue = lireVue(texte, idVue).vue
      if (relue) this.remplacerVues(base, (vues) => vues.map((v) => (v.id === idVue ? { ...relue, ...enAttente(v, relue) } : v)))
    })
  }

  creerVue(base: string, nom: string, type: TypeVue = 'tableau', reglages: ModificationVue = {}): Promise<string> {
    return this.enFile(async () => {
      const vues = this.etatBase(base).vues
      const id = idBase(nom, vues.map((v) => v.id))
      const vue: Vue = { ...vueParDefaut(), ...reglages, id, nom: nom.trim() || id, type }
      delete vue.implicite
      await this.adaptateur.ecrire(cheminVue(base, id), modifierVue(null, vue, reglages))
      // La vue implicite n'a pas de fichier : la garder ferait croire qu'elle existe encore.
      const suivantes = [...vues.filter((v) => !v.implicite), vue]
      this.remplacerVues(base, () => suivantes)
      // La nouvelle vue prend le dernier onglet, y compris après un rechargement.
      await this.modifierSchema(base, { type: 'ordre_vues', ids: suivantes.map((v) => v.id) })
      return id
    })
  }

  supprimerVue(base: string, idVue: string): Promise<void> {
    return this.enFile(async () => {
      const vues = this.etatBase(base).vues
      if (vues.length <= 1) throw new ErreurSchema('Une base garde toujours au moins une vue')
      if (!this.vue(base, idVue).implicite) await this.adaptateur.supprimer(cheminVue(base, idVue))
      this.remplacerVues(base, (vs) => vs.filter((v) => v.id !== idVue))
      const ordre = this.schema(base).ordreVues
      if (ordre.includes(idVue)) await this.modifierSchema(base, { type: 'ordre_vues', ids: ordre.filter((x) => x !== idVue) })
    })
  }

  /** Réordonne les onglets de vues ; l'ordre est gardé dans `_schema.yaml` (clé `vues`). */
  ordonnerVues(base: string, ids: string[]): Promise<void> {
    const vues = this.etatBase(base).vues
    const parId = new Map(vues.map((v) => [v.id, v]))
    const ordonnees = [...ids.flatMap((id) => parId.get(id) ?? []), ...vues.filter((v) => !ids.includes(v.id))]
    this.remplacerVues(base, () => ordonnees)
    return this.enFile(() =>
      this.modifierSchema(base, { type: 'ordre_vues', ids: ordonnees.filter((v) => !v.implicite).map((v) => v.id) }),
    )
  }

  // ── Mises en page ────────────────────────────────────────────────

  /**
   * Modifie une mise en page (en mémoire tout de suite, puis le fichier).
   * La marquer par défaut retire ce statut aux autres.
   */
  modifierMiseEnPage(base: string, id: string, modifs: ModificationMiseEnPage): Promise<void> {
    this.page(base, id)
    const anciennesParDefaut = modifs.defaut ? this.etatBase(base).pages.filter((p) => p.id !== id && p.defaut) : []
    this.remplacerPages(base, (pages) =>
      pages.map((p) => (p.id === id ? { ...p, ...modifs } : modifs.defaut ? { ...p, defaut: false } : p)),
    )
    return this.enFile(async () => {
      await this.ecrireMiseEnPage(base, id, modifs)
      for (const p of anciennesParDefaut) if (!p.implicite) await this.ecrireMiseEnPage(base, p.id, { defaut: false })
    })
  }

  /** Crée une mise en page, en partant des réglages d'une existante. */
  creerMiseEnPage(base: string, nom: string, depuis?: string): Promise<string> {
    return this.enFile(async () => {
      const pages = this.etatBase(base).pages
      const modele = pages.find((p) => p.id === depuis)
      const id = idBase(nom, pages.map((p) => p.id))
      const nouvelle: MiseEnPage = { id, nom: nom.trim() || id, defaut: false, champs: modele?.champs ?? [], onglets: modele?.onglets ?? [] }
      await this.adaptateur.ecrire(cheminPage(base, id), modifierMiseEnPage(null, nouvelle, { champs: nouvelle.champs, onglets: nouvelle.onglets }))
      // La mise en page implicite n'a pas de fichier : on l'écrit pour ne pas la perdre.
      const implicite = pages.find((p) => p.implicite)
      if (implicite) {
        await this.adaptateur.ecrire(cheminPage(base, implicite.id), modifierMiseEnPage(null, implicite, {}))
        delete implicite.implicite
      }
      this.remplacerPages(base, (ps) => [...ps.map((p) => ({ ...p })), nouvelle])
      return id
    })
  }

  supprimerMiseEnPage(base: string, id: string): Promise<void> {
    return this.enFile(async () => {
      const pages = this.etatBase(base).pages
      if (pages.length <= 1) throw new ErreurSchema('Une base garde toujours au moins une mise en page')
      const p = this.page(base, id)
      if (!p.implicite) await this.adaptateur.supprimer(cheminPage(base, id))
      this.remplacerPages(base, (ps) => ps.filter((x) => x.id !== id))
    })
  }

  // ── Interne ──────────────────────────────────────────────────────

  private page(base: string, id: string): MiseEnPage {
    const p = this.etatBase(base).pages.find((x) => x.id === id)
    if (!p) throw new ErreurSchema(`Mise en page introuvable : ${id}`)
    return p
  }

  private remplacerPages(base: string, f: (pages: MiseEnPage[]) => MiseEnPage[]) {
    const b = this.etatBase(base)
    this.bases.set(base, { ...b, pages: f(b.pages) })
    this.publier()
  }

  private async ecrireMiseEnPage(base: string, id: string, modifs: ModificationMiseEnPage) {
    const p = this.page(base, id)
    const chemin = cheminPage(base, id)
    const texte = modifierMiseEnPage(p.implicite ? null : await this.lireOuNull(chemin), p, modifs)
    await this.adaptateur.ecrire(chemin, texte)
    if (p.implicite) this.remplacerPages(base, (ps) => ps.map((x) => (x.id === id ? { ...x, implicite: undefined } : x)))
  }

  private schemas(): Map<string, Schema> {
    const m = new Map<string, Schema>()
    for (const b of this.bases.values()) if (b.depot) m.set(b.id, b.depot.schema)
    return m
  }

  private ligne(base: string, id: string): LigneChargee {
    const l = this.depot(base).lignes().find((x) => x.id === id)
    if (!l) throw new ErreurSchema(`Ligne introuvable : ${base}/${id}`)
    return l
  }

  private idsCalcules(base: string, id: string, cle: string): string[] {
    const c = this.instantane.calculs.get(base)?.get(id)?.[cle]
    return c?.etat === 'ok' && Array.isArray(c.valeur) ? c.valeur : []
  }

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

  private async chargerPages(base: string): Promise<{ pages: MiseEnPage[]; avertissements: string[] }> {
    const dossier = joindre(base, DOSSIER_PAGES)
    let entrees
    try {
      entrees = await this.adaptateur.lister(dossier)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return { pages: [miseEnPageParDefaut()], avertissements: [] }
      throw e
    }
    const pages: MiseEnPage[] = []
    const avertissements: string[] = []
    for (const e of entrees) {
      if (e.type !== 'fichier' || !e.nom.endsWith('.yaml')) continue
      const lue = lireMiseEnPage(await this.adaptateur.lire(joindre(dossier, e.nom)), e.nom.slice(0, -'.yaml'.length))
      avertissements.push(...lue.avertissements)
      if (lue.miseEnPage) pages.push(lue.miseEnPage)
    }
    return { pages: pages.length > 0 ? pages : [miseEnPageParDefaut()], avertissements }
  }

  private async chargerVues(base: string, ordre: readonly string[]): Promise<{ vues: Vue[]; avertissements: string[] }> {
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
    const rang = (id: string) => (ordre.includes(id) ? ordre.indexOf(id) : ordre.length)
    vues.sort((a, b) => rang(a.id) - rang(b.id))
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
      this.bases.set(id, { id, chargement, depot: null, vues: [], pages: [] })
      return
    }
    const { vues, avertissements } = await this.chargerVues(id, chargement.base.schema.ordreVues)
    const { pages, avertissements: avertissementsPages } = await this.chargerPages(id)
    chargement.base.avertissements.push(...avertissements, ...avertissementsPages)
    const depot = new DepotBase(this.adaptateur, chargement.base.schema, chargement.base.lignes, this.options)
    // Toute modification de lignes peut changer les colonnes calculées de n'importe quelle base.
    depot.abonner(() => this.publier())
    this.bases.set(id, { id, chargement, depot, vues, pages })
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
    const aCalculer = new Map<string, BaseACalculer>()
    const titres = new Map<string, Map<string, string>>()
    for (const b of this.bases.values()) {
      if (!b.depot) continue
      const lignes = b.depot.lignes()
      aCalculer.set(b.id, { schema: b.depot.schema, lignes })
      const champ = b.depot.schema.champTitre
      titres.set(b.id, new Map(lignes.map((l) => {
        const t = l.cellules[champ]
        return [l.id, t?.etat === 'ok' && typeof t.valeur === 'string' ? t.valeur : ''] as const
      })))
    }
    const aujourdhui = this.options.aujourdhui()
    const calculs = calculer(aCalculer, { aujourdhui, maintenant: this.options.maintenant?.() ?? `${aujourdhui}T00:00` })
    this.instantane = { groupes, horsGroupe, bases: new Map(this.bases), calculs, titres }
    for (const fn of this.abonnes) fn()
  }
}

/** Champs modifiés en mémoire mais pas encore écrits : on ne les écrase pas à la relecture. */
function enAttente(memoire: Vue, relue: Vue): Partial<Vue> {
  return Object.fromEntries(
    CHAMPS_MODIFIABLES.filter((k) => JSON.stringify(memoire[k]) !== JSON.stringify(relue[k])).map((k) => [k, memoire[k]]),
  )
}

function cheminPage(base: string, id: string): string {
  return joindre(base, DOSSIER_PAGES, `${id}.yaml`)
}

function cheminVue(base: string, idVue: string): string {
  return joindre(base, DOSSIER_VUES, `${idVue}.yaml`)
}

function relationVers(schema: Schema, cle: string): string | undefined {
  const c = colonne(schema, cle)
  return c?.type === 'relation' ? c.cible : undefined
}
