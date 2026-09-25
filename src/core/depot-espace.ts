import { chargerBase, type ChargementBase, type LigneChargee } from './base'
import { calculer, type BaseACalculer, type Calculs } from './calcul'
import { DepotBase, type OptionsDepot } from './depot-base'
import { barreLaterale, lireEspace, modifierEspace, ordreDashboards, type ConfigEspace, type Groupe, type OperationEspace } from './espace-config'
import { listerBases } from './espace'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { cleColonne, idBase } from './identifiants'
import { compiler, ErreurFormule } from './formules/formule'
import {
  appliquerEnMemoire,
  ErreurDashboard,
  lireDashboard,
  modifierDashboard,
  nouveauDashboard,
  type Dashboard,
  type OperationDashboard,
} from './dashboard'
import { boucle } from './graphe'
import { copieDeConflit, doublons } from './conflits'
import { convertirValeur, type ColonneImportee } from './echange'
import { IndexRecherche, type Resultat } from './recherche'
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
const DOSSIER_DASHBOARDS = '_dashboards'

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

/** Un dashboard (spec §10) ; `dashboard` null si son fichier est illisible. */
export type EtatDashboard = { id: string; dashboard: Dashboard | null; avertissements: string[] }

export type EtatEspace = {
  /** Dans l'ordre de la barre latérale. */
  dashboards: EtatDashboard[]
  groupes: Groupe[]
  horsGroupe: string[]
  bases: ReadonlyMap<string, EtatBase>
  /** Valeurs des colonnes calculées (relations non propriétaires, rollups), par base puis par id. */
  calculs: Calculs
  /** Titre de chaque ligne, par base puis par id : pastilles de relation, liens cassés. */
  titres: ReadonlyMap<string, ReadonlyMap<string, string>>
  /** Ids portés par plusieurs fichiers, par base (seulement les bases concernées). */
  doublons: ReadonlyMap<string, ReadonlyMap<string, LigneChargee[]>>
  /** Copies de conflit de fichiers de configuration, jamais chargées (spec §4). */
  copiesConflit: CopieConflit[]
}

/** `chemin` est une copie de conflit de synchro de `original` (même dossier). */
export type CopieConflit = { chemin: string; original: string }

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
  private readonly dashboards = new Map<string, EtatDashboard>()
  private config: ConfigEspace = lireEspace(null)
  private instantane: EtatEspace = { dashboards: [], groupes: [], horsGroupe: [], bases: new Map(), calculs: new Map(), titres: new Map(), doublons: new Map(), copiesConflit: [] }
  private readonly abonnes = new Set<() => void>()
  private readonly recherche = new IndexRecherche()
  /** Sérialise les modifications de configuration. */
  private file: Promise<unknown> = Promise.resolve()
  /** Modifications de configuration appliquées en mémoire mais pas encore écrites. */
  private configEnVol = 0
  private copies: CopieConflit[] = []

  private constructor(adaptateur: AdaptateurFichiers, options: OptionsEspace) {
    this.adaptateur = adaptateur
    this.options = options
  }

  static async ouvrir(adaptateur: AdaptateurFichiers, options: OptionsEspace): Promise<DepotEspace> {
    const d = new DepotEspace(adaptateur, options)
    d.config = lireEspace(await d.lireOuNull(FICHIER_ESPACE))
    for (const id of await listerBases(adaptateur)) await d.chargerBase(id)
    await d.chargerDashboards()
    d.copies = await d.chercherCopies()
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

  // ── Changements externes ─────────────────────────────────────────

  /**
   * Relit l'espace sur le disque (spec §12) : au retour sur l'onglet ou à la
   * demande. Bases ajoutées ou retirées, schémas, lignes, vues, mises en page,
   * dashboards et barre latérale. Ce qui n'a pas changé garde son état en mémoire.
   * Renvoie vrai si quelque chose a changé.
   */
  rafraichir(): Promise<boolean> {
    return this.enFile(() => this.relire())
  }

  private async relire(): Promise<boolean> {
    let change = false
    const config = lireEspace(await this.lireOuNull(FICHIER_ESPACE))
    if (!memes(config, this.config)) {
      this.config = config
      change = true
    }
    const ids = await listerBases(this.adaptateur)
    for (const id of [...this.bases.keys()]) {
      if (ids.includes(id)) continue
      this.bases.delete(id)
      change = true
    }
    for (const id of ids) {
      const b = this.bases.get(id)
      if (b?.depot) {
        change = (await this.rafraichirBase(b, b.depot)) || change
        continue
      }
      // Nouveau dossier, ou dossier qui n'était pas une base : on le recharge en entier.
      await this.chargerBase(id)
      if (!b || !memes(b.chargement, this.bases.get(id)!.chargement)) change = true
    }
    if (this.configEnVol === 0) {
      const avant = new Map(this.dashboards)
      this.dashboards.clear()
      await this.chargerDashboards()
      if (!memes([...avant], [...this.dashboards])) change = true
      else for (const [id, d] of avant) this.dashboards.set(id, d) // mêmes objets : rien ne se redessine
    }
    const copies = await this.chercherCopies()
    if (!memes(copies, this.copies)) {
      this.copies = copies
      change = true
    }
    if (change) this.publier()
    return change
  }

  /** Les deux textes d'une copie de conflit, pour choisir. */
  async lireCopieConflit(chemin: string): Promise<{ original: string | null; copie: string }> {
    const c = this.copies.find((x) => x.chemin === chemin)
    if (!c) throw new ErreurSchema(`Copie de conflit inconnue : ${chemin}`)
    return { original: await this.lireOuNull(c.original), copie: await this.adaptateur.lire(chemin) }
  }

  /**
   * Tranche une copie de conflit : garder l'original (la copie est supprimée)
   * ou garder la copie (elle remplace l'original). Puis relit l'espace.
   */
  resoudreCopieConflit(chemin: string, garder: 'original' | 'copie'): Promise<void> {
    return this.enFile(async () => {
      const c = this.copies.find((x) => x.chemin === chemin)
      if (!c) throw new ErreurSchema(`Copie de conflit inconnue : ${chemin}`)
      if (garder === 'copie') await this.adaptateur.ecrire(c.original, await this.adaptateur.lire(chemin))
      await this.adaptateur.supprimer(chemin)
      await this.relire()
    })
  }

  /** Copies de conflit parmi les fichiers de configuration : racine, dashboards, et chaque base avec ses vues et mises en page. */
  private async chercherCopies(): Promise<CopieConflit[]> {
    const dossiers = ['', DOSSIER_DASHBOARDS, ...[...this.bases.keys()].flatMap((b) => [b, joindre(b, DOSSIER_VUES), joindre(b, DOSSIER_PAGES)])]
    const copies: CopieConflit[] = []
    for (const dossier of dossiers) {
      let entrees
      try {
        entrees = await this.adaptateur.lister(dossier)
      } catch (e) {
        if (e instanceof FichierIntrouvable) continue
        throw e
      }
      const noms = new Set(entrees.filter((e) => e.type === 'fichier').map((e) => e.nom))
      for (const nom of noms) {
        if (!nom.endsWith('.yaml')) continue
        const original = copieDeConflit(nom, noms)
        if (original) copies.push({ chemin: joindre(dossier, nom), original: joindre(dossier, original) })
      }
    }
    return copies
  }

  private async rafraichirBase(b: EtatBase, depot: DepotBase): Promise<boolean> {
    if (!b.chargement.ok) return false
    let change = false
    let base = b.chargement.base
    const texte = await this.lireOuNull(joindre(b.id, FICHIER_SCHEMA))
    if (texte === null) {
      this.bases.set(b.id, { id: b.id, chargement: { ok: false, raison: 'pas de _schema.yaml' }, depot: null, vues: [], pages: [] })
      return true
    }
    const lu = lireSchema(texte, b.id)
    const avertissementsSchema = lu.schema ? lu.avertissements : [`_schema.yaml illisible sur le disque, dernière version lisible gardée : ${lu.avertissements.join(' ; ')}`]
    if (lu.schema && !memes(lu.schema, depot.schema)) {
      depot.remplacerSchema(lu.schema)
      change = true
    }
    const lignes = await depot.rafraichir()
    if (lignes) {
      change ||= lignes.change
      if (!memes(lignes.nonReconnus, base.nonReconnus)) {
        base = { ...base, nonReconnus: lignes.nonReconnus }
        change = true
      }
    }
    let { vues, pages } = b
    if (this.configEnVol === 0) {
      const v = await this.chargerVues(b.id, depot.schema.ordreVues)
      const p = await this.chargerPages(b.id)
      if (!memes(v.vues, vues)) vues = v.vues
      if (!memes(p.pages, pages)) pages = p.pages
      const avertissements = [...avertissementsSchema, ...v.avertissements, ...p.avertissements]
      if (!memes(avertissements, base.avertissements)) base = { ...base, avertissements }
    }
    if (vues !== b.vues || pages !== b.pages || base !== b.chargement.base || depot.schema !== b.chargement.base.schema) {
      this.bases.set(b.id, { ...b, vues, pages, chargement: { ok: true, base: { ...base, schema: depot.schema } } })
      change = true
    }
    return change
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

  // ── Dashboards ───────────────────────────────────────────────────

  creerDashboard(nom: string): Promise<string> {
    return this.enFile(async () => {
      const id = idBase(nom, [...this.dashboards.keys()])
      const texte = nouveauDashboard(id, nom.trim() || id)
      await this.adaptateur.ecrire(cheminDashboard(id), texte)
      this.dashboards.set(id, { id, ...lireDashboard(texte, id) })
      await this.modifierEspace({ type: 'ajouter_dashboard', id })
      return id
    })
  }

  supprimerDashboard(id: string): Promise<void> {
    return this.enFile(async () => {
      await this.adaptateur.supprimer(cheminDashboard(id))
      this.dashboards.delete(id)
      await this.modifierEspace({ type: 'retirer_dashboard', id })
    })
  }

  /**
   * Modifie un dashboard : l'affichage change tout de suite, le fichier suit,
   * relu sur le disque et réécrit seulement là où l'opération le touche.
   */
  modifierDashboard(id: string, op: OperationDashboard): Promise<void> {
    const d = this.dashboards.get(id)?.dashboard
    if (!d) return Promise.reject(new ErreurDashboard(`Dashboard introuvable ou illisible : ${id}`))
    if (op.type === 'ajouter_bloc') {
      if (!this.bases.get(op.bloc.base)?.chargement.ok) return Promise.reject(new ErreurDashboard(`Base introuvable : ${op.bloc.base}`))
      if (op.rangee !== null && (d.rangees[op.rangee]?.blocs.length ?? 2) >= 2) return Promise.reject(new ErreurDashboard('Une rangée tient 2 blocs au plus'))
    }
    this.dashboards.set(id, { ...this.dashboards.get(id)!, dashboard: appliquerEnMemoire(d, op) })
    this.publier()
    return this.apresMemoire(async () => {
      const chemin = cheminDashboard(id)
      await this.adaptateur.ecrire(chemin, modifierDashboard(await this.adaptateur.lire(chemin), op))
    })
  }

  private async chargerDashboards() {
    let entrees
    try {
      entrees = await this.adaptateur.lister(DOSSIER_DASHBOARDS)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return
      throw e
    }
    const noms = new Set(entrees.map((e) => e.nom))
    for (const e of entrees) {
      if (e.type !== 'fichier' || !e.nom.endsWith('.yaml') || copieDeConflit(e.nom, noms)) continue
      const id = e.nom.slice(0, -'.yaml'.length)
      this.dashboards.set(id, { id, ...lireDashboard(await this.adaptateur.lire(joindre(DOSSIER_DASHBOARDS, e.nom)), id) })
    }
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
    const probleme = this.problemeFormule(base, formule)
    if (probleme) throw new ErreurSchema(`Formule refusée : ${probleme}`)
  }

  /**
   * Ce qui empêcherait d'enregistrer cette expression (stockée, avec les clés) :
   * erreur de syntaxe ou de type, ou boucle. `null` si elle est acceptable.
   * `cle` : la formule modifiée, absente pour une nouvelle.
   */
  essayerFormule(base: string, cle: string | null, expression: string): string | null {
    return this.problemeFormule(base, { cle: cle ?? '\u0000nouvelle', nom: 'Nouvelle formule', type: 'formula', expression })
  }

  private problemeFormule(base: string, formule: Extract<Colonne, { type: 'formula' }>): string | null {
    const schema = this.schema(base)
    const colonnes = schema.colonnes.some((c) => c.cle === formule.cle)
      ? schema.colonnes.map((c) => (c.cle === formule.cle ? formule : c))
      : [...schema.colonnes, formule]
    const schemas = new Map(this.schemas())
    schemas.set(base, { ...schema, colonnes })
    const b = boucle(schemas)
    if (b) return b
    try {
      compiler(formule.expression, (cle) => colonnes.find((c) => c.cle === cle))
    } catch (e) {
      if (e instanceof ErreurFormule) return e.message
      throw e
    }
    return null
  }

  /** Recherche globale (spec §11) : titres, champs texte et corps de toutes les bases. */
  chercher(requete: string, limite?: number): Resultat[] {
    return this.recherche.chercher(requete, limite)
  }

  /** Lignes proches d'une demande en langage libre (assistant IA). */
  candidats(texte: string, limite?: number): { base: string; ligne: string }[] {
    return this.recherche.candidats(texte, limite)
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

  /** Liens (côté propriétaire, dans les autres bases) qui pointent vers une ligne. */
  liensVers(base: string, id: string): LienVers[] {
    const liens: LienVers[] = []
    for (const b of this.bases.values()) {
      if (!b.depot) continue
      const relations = b.depot.schema.colonnes.filter((c): c is ColonneRelation => c.type === 'relation' && c.proprietaire && c.cible === base)
      for (const l of b.depot.lignes()) {
        for (const c of relations) if (idsDe(l, c.cle).includes(id)) liens.push({ base: b.id, chemin: l.chemin, cle: c.cle })
      }
    }
    return liens
  }

  /**
   * Supprime une ligne (son fichier). Les liens qui pointaient vers elle
   * deviennent des liens cassés, sauf si `nettoyer` : ils sont alors retirés
   * des fichiers qui les portent (spec §5, nettoyage proposé, jamais silencieux).
   * Si un autre fichier porte le même id, les liens restent : ils pointent vers lui.
   */
  async supprimerLigne(base: string, chemin: string, nettoyer: boolean): Promise<void> {
    const depot = this.depot(base)
    const ligne = depot.lignes().find((l) => l.chemin === chemin)
    if (!ligne) throw new ErreurSchema(`Ligne introuvable : ${chemin}`)
    const encoreLa = depot.lignes().some((l) => l.id === ligne.id && l.chemin !== chemin)
    if (nettoyer && !encoreLa) {
      for (const lien of this.liensVers(base, ligne.id)) {
        const d = this.depot(lien.base)
        const l = d.lignes().find((x) => x.chemin === lien.chemin)!
        d.modifier(lien.chemin, lien.cle, idsDe(l, lien.cle).filter((x) => x !== ligne.id))
      }
    }
    await depot.supprimer(chemin)
  }

  /** Lignes d'une relation (côté propriétaire) qui portent des liens cassés, et ces ids. */
  liensCasses(base: string, cle: string): { chemin: string; ids: string[] }[] {
    const c = colonne(this.schema(base), cle)
    if (c?.type !== 'relation' || !c.proprietaire) return []
    const existants = this.instantane.titres.get(c.cible)
    return this.depot(base)
      .lignes()
      .map((l) => ({ chemin: l.chemin, ids: idsDe(l, cle).filter((id) => !existants?.has(id)) }))
      .filter((x) => x.ids.length > 0)
  }

  /** Retire les liens cassés d'une relation dans toutes les lignes ; renvoie le nombre de liens retirés. */
  nettoyerLiensCasses(base: string, cle: string): number {
    const depot = this.depot(base)
    let n = 0
    for (const { chemin, ids } of this.liensCasses(base, cle)) {
      const l = depot.lignes().find((x) => x.chemin === chemin)!
      depot.modifier(chemin, cle, idsDe(l, cle).filter((id) => !ids.includes(id)))
      n += ids.length
    }
    return n
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

  // ── Import CSV ───────────────────────────────────────────────────

  /**
   * Nouvelle base depuis un CSV : la première colonne devient le titre, les
   * autres sont créées avec le type choisi, puis une ligne par enregistrement.
   */
  async importerBase(nom: string, colonnes: readonly ColonneImportee[], lignes: readonly string[][], groupe: string | null = null): Promise<string> {
    const base = await this.creerBase(nom, groupe)
    const [titre, ...autres] = colonnes
    const cles: string[] = [this.schema(base).champTitre]
    if (titre) await this.renommerColonne(base, cles[0]!, titre.nom)
    for (const c of autres) cles.push(await this.ajouterColonne(base, c.nom, c.type))
    await this.importerLignes(base, cles, lignes)
    return base
  }

  /**
   * Colonne de la base qui reçoit chaque colonne du CSV : même nom, sans tenir
   * compte de la casse ni des accents. `null` si aucune, ou si la colonne n'est
   * pas saisissable à la main (relation, rollup, formule).
   */
  correspondances(base: string, entetes: readonly string[]): (string | null)[] {
    const norme = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
    const colonnes = this.schema(base).colonnes.filter((c) => (TYPES_CREABLES as readonly string[]).includes(c.type))
    return entetes.map((e) => colonnes.find((c) => norme(c.nom) === norme(e))?.cle ?? null)
  }

  /**
   * Ajoute une ligne par enregistrement ; `cles[i]` est la colonne qui reçoit
   * la i-ème valeur (`null` : ignorée). Les options de sélection absentes sont
   * créées d'abord. Une valeur illisible pour le type de sa colonne est laissée vide.
   */
  async importerLignes(base: string, cles: readonly (string | null)[], lignes: readonly string[][]): Promise<number> {
    const cibles = cles.map((cle) => {
      const c = cle === null ? undefined : colonne(this.schema(base), cle)
      return c && (TYPES_CREABLES as readonly string[]).includes(c.type) ? { cle: c.cle, type: c.type as TypeCreable } : null
    })
    for (const [i, cible] of cibles.entries()) {
      if (cible?.type !== 'select' && cible?.type !== 'multiselect') continue
      const labels = new Set(lignes.flatMap((l) => [convertirValeur(cible.type, l[i] ?? '')].flat()).filter((v): v is string => typeof v === 'string'))
      for (const label of labels) await this.ajouterOption(base, cible.cle, label)
    }
    for (const l of lignes) {
      const valeurs: Modifications = {}
      for (const [i, cible] of cibles.entries()) {
        if (!cible) continue
        const v = convertirValeur(cible.type, l[i] ?? '')
        if (v !== undefined) valeurs[cible.cle] = v
      }
      await this.creerLigne(base, valeurs)
    }
    return lignes.length
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
    return this.apresMemoire(async () => {
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
    return this.apresMemoire(() =>
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
    return this.apresMemoire(async () => {
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
    const noms = new Set(entrees.map((e) => e.nom))
    for (const e of entrees) {
      if (e.type !== 'fichier' || !e.nom.endsWith('.yaml') || copieDeConflit(e.nom, noms)) continue
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
    const noms = new Set(entrees.map((e) => e.nom))
    for (const e of entrees) {
      if (e.type !== 'fichier' || !e.nom.endsWith('.yaml') || copieDeConflit(e.nom, noms)) continue
      const lue = lireVue(await this.adaptateur.lire(joindre(dossier, e.nom)), e.nom.slice(0, -'.yaml'.length))
      avertissements.push(...lue.avertissements)
      if (lue.vue) vues.push(lue.vue)
    }
    const rang = (id: string) => (ordre.includes(id) ? ordre.indexOf(id) : ordre.length)
    vues.sort((a, b) => rang(a.id) - rang(b.id))
    return { vues: vues.length > 0 ? vues : [vueParDefaut()], avertissements }
  }


  /** Écriture d'une modification déjà appliquée en mémoire : un rafraîchissement ne doit pas l'effacer entre-temps. */
  private apresMemoire<T>(operation: () => Promise<T>): Promise<T> {
    this.configEnVol++
    return this.enFile(operation).finally(() => this.configEnVol--)
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
    const enDouble = new Map<string, Map<string, LigneChargee[]>>()
    for (const b of this.bases.values()) {
      if (!b.depot) continue
      const lignes = b.depot.lignes()
      const d = doublons(lignes)
      if (d.size > 0) enDouble.set(b.id, d)
      aCalculer.set(b.id, { schema: b.depot.schema, lignes })
      const champ = b.depot.schema.champTitre
      titres.set(b.id, new Map(lignes.map((l) => {
        const t = l.cellules[champ]
        return [l.id, t?.etat === 'ok' && typeof t.valeur === 'string' ? t.valeur : ''] as const
      })))
    }
    const aujourdhui = this.options.aujourdhui()
    this.recherche.synchroniser(aCalculer.values())
    const calculs = calculer(aCalculer, { aujourdhui, maintenant: this.options.maintenant?.() ?? `${aujourdhui}T00:00` })
    const dashboards = ordreDashboards(this.config, [...this.dashboards.keys()]).map((id) => this.dashboards.get(id)!)
    this.instantane = { dashboards, groupes, horsGroupe, bases: new Map(this.bases), calculs, titres, doublons: enDouble, copiesConflit: this.copies }
    for (const fn of this.abonnes) fn()
  }
}

export type LienVers = { base: string; chemin: string; cle: string }

/** Ids d'une cellule relation stockée (vide si absente ou invalide). */
function idsDe(l: LigneChargee, cle: string): string[] {
  const c = l.cellules[cle]
  return c?.etat === 'ok' && Array.isArray(c.valeur) ? c.valeur.map(String) : []
}

/** Égalité de contenu, pour ne remplacer que ce qui a vraiment changé. */
function memes(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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

function cheminDashboard(id: string): string {
  return joindre(DOSSIER_DASHBOARDS, `${id}.yaml`)
}

function cheminVue(base: string, idVue: string): string {
  return joindre(base, DOSSIER_VUES, `${idVue}.yaml`)
}

function relationVers(schema: Schema, cle: string): string | undefined {
  const c = colonne(schema, cle)
  return c?.type === 'relation' ? c.cible : undefined
}
