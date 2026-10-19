import type { LigneChargee } from '../base'
import type { DepotBase } from '../depot-base'
import { TYPES_CREABLES, type DepotEspace, type EtatEspace, type TypeCreable } from '../depot-espace'
import { correspond, type Contexte } from '../filtres'
import { compiler, ErreurFormule, stockerExpression } from '../formules/formule'
import { calculsPour } from '../calcul'
import { appliquerEnMemoire, BLOCS_PAR_RANGEE, estAnalyse, estPropre, HAUTEUR_BLOC, LARGEUR_BLOC, type Bloc, type Dashboard, type FiltreGlobal, type OperationDashboard, type PastilleGlobale, type PlaceBloc } from '../dashboard'
import { boucle } from '../graphe'
import { nomAnalyse, type Parametre } from '../bi/analyse'
import { lireBlocAnalyseIA, lireModifsAnalyse, lireParametresIA, lireRequetesIA } from './analyse'
import { cleColonne, idBase } from '../identifiants'
import { COULEURS } from '../couleurs'
import { CALCULS, estObjet, lireSchema, natureDe, TYPES_HORODATAGE, type Calcul, type Colonne, type Option, type Schema } from '../schema'
import { nouveauSchema } from '../schema-ecriture'
import { PROFONDEUR_MAX, type Bande, type Filtre, type FiltreRapide, type ModificationVue, type Niveau, type Tri, type TypeVue, type Vue } from '../vue'
import { insererRemarque } from './connaissance'
import { erreur, lireFiltres, normaliser, texteRequis, titreDe, trouverBase, trouverColonne, trouverLigne } from './references'

// Outils de structure de l'assistant (spec §12, « Module IA ») : bases,
// colonnes, vues, dashboards, suppression de lignes, contenu des pages.
// Comme les données, chaque appel est validé ici et rien n'est écrit avant
// « Appliquer ». Les appels sont validés dans l'ordre sur un brouillon de
// l'espace : une colonne créée par un appel peut être remplie par le suivant.

type BaseBrouillon = { id: string; schema: Schema; lignes: readonly LigneChargee[]; vues: Vue[]; nouvelle: boolean }

/** L'espace tel qu'il sera après les appels déjà validés du plan. */
export class Brouillon {
  private readonly source: EtatEspace
  readonly bases = new Map<string, BaseBrouillon>()
  /** Dashboards tels qu'après les appels validés ; `dashboard` null : fichier illisible, on ne peut que le supprimer. */
  readonly dashboards: { id: string; nom: string; dashboard: Dashboard | null }[]
  /** Noms des groupes de la barre latérale, ceux que le plan crée compris. */
  readonly groupes: string[]
  /** Titres des lignes que le plan crée, par base : `ecrire_contenu` peut les viser. */
  readonly creees = new Map<string, string[]>()

  constructor(etat: EtatEspace) {
    this.source = etat
    for (const b of etat.bases.values()) {
      // Copie des vues : `creer_vue` y ajoute la sienne, l'état réel ne doit pas la voir avant « Appliquer ».
      if (b.depot) this.bases.set(b.id, { id: b.id, schema: b.depot.schema, lignes: b.depot.lignes(), vues: [...b.vues], nouvelle: false })
    }
    this.dashboards = etat.dashboards.map((d) => ({ id: d.id, nom: d.dashboard?.nom ?? d.id, dashboard: d.dashboard }))
    this.groupes = etat.groupes.map((g) => g.nom)
  }

  /** Vue de l'état attendue par les validations de données (`plan.ts`). */
  etat(): EtatEspace {
    const bases = new Map(this.source.bases)
    const titres = new Map(this.source.titres)
    for (const b of this.bases.values()) {
      const avant = this.source.bases.get(b.id)
      const depot = { schema: b.schema, lignes: () => b.lignes } as unknown as DepotBase
      bases.set(b.id, {
        id: b.id,
        chargement: avant?.chargement ?? { ok: true, base: { schema: b.schema, lignes: [], nonReconnus: [], avertissements: [] } },
        depot,
        vues: b.vues,
        pages: avant?.pages ?? [],
      })
      if (!titres.has(b.id)) titres.set(b.id, new Map())
    }
    // Lignes que le plan crée : un id prévu chacune, pour qu'une relation puisse les viser par leur titre.
    for (const [base, creees] of this.creees) {
      const t = new Map(titres.get(base))
      creees.forEach((titre, i) => t.set(idLignePrevu(base, i), titre))
      titres.set(base, t)
    }
    for (const id of [...bases.keys()]) if (!this.bases.has(id) && this.source.bases.get(id)?.depot) bases.delete(id)
    return { ...this.source, bases, titres }
  }

  base(ref: unknown): BaseBrouillon {
    const trouvee = trouverBase(this.etat(), ref)
    return this.bases.get(trouvee.id)!
  }

  remplacerSchema(base: string, schema: Schema) {
    this.bases.set(base, { ...this.bases.get(base)!, schema })
  }

  schemas(): Map<string, Schema> {
    return new Map([...this.bases.values()].map((b) => [b.id, b.schema]))
  }

  noterCreees(base: string, titres: readonly string[]) {
    this.creees.set(base, [...(this.creees.get(base) ?? []), ...titres])
  }
}

/** Id prévu de la n-ième ligne que le plan crée dans une base, remplacé par l'id réel à l'application. */
export const idLignePrevu = (base: string, n: number) => `+${base}:${n}`
const estIdPrevu = (v: string) => /^\+.+:\d+$/.test(v)

/** Colonne à créer, telle que validée. */
export type NouvelleColonne =
  | { type: TypeCreable; nom: string; options: Option[] }
  | { type: 'relation'; nom: string; cible: string; cleMiroir: string }
  | { type: 'rollup'; nom: string; relation: string; /** Base liée par la relation, où vit `champ`. */ cible: string; champ: string; calcul: Calcul }
  | { type: 'formula'; nom: string; expression: string }
  | { type: 'created'; nom: string }
  | { type: 'modified'; nom: string }

/** Modifications de structure, appliquées avant les données du plan. Les ids et clés sont ceux prévus au moment de la validation. */
export type ActionStructure =
  | { type: 'creer_base'; id: string; nom: string }
  | { type: 'ajouter_colonne'; base: string; nomBase: string; cle: string; colonne: NouvelleColonne }
  | { type: 'renommer_colonne'; base: string; nomBase: string; cle: string; ancien: string; nom: string }
  /** Options ajoutées à un select existant, et couleurs changées d'options qui y étaient déjà. */
  | { type: 'ajouter_options'; base: string; nomBase: string; cle: string; nomColonne: string; ajouts: Option[]; couleurs: Required<Option>[] }
  /** `remplacement` absent : les `lignes` qui ont l'option perdent la valeur. */
  | { type: 'retirer_option'; base: string; nomBase: string; cle: string; nomColonne: string; option: string; remplacement?: string; lignes: number }
  | { type: 'supprimer_colonne'; base: string; nomBase: string; cle: string; nom: string; remplies: number }
  | { type: 'creer_vue'; base: string; nomBase: string; id: string; nom: string; genre: TypeVue; reglages: ModificationVue }
  | { type: 'modifier_vue'; base: string; nomBase: string; vue: string; nomVue: string; reglages: ModificationVue }
  | { type: 'supprimer_vue'; base: string; nomBase: string; vue: string; nomVue: string }
  | { type: 'creer_dashboard'; id: string; nom: string; rangees: { blocs: Bloc[]; hauteur?: number }[]; requetes: Record<string, string>; parametres: Parametre[] }
  /** Opérations sur la mise en page d'avant chacune ; `base` : celle du bloc dont la vue propre change (ses clés suivent). `resume` : une phrase par opération, pour l'aperçu. */
  | { type: 'modifier_dashboard'; id: string; nom: string; operations: { op: OperationDashboard; base?: string }[]; resume: string[] }
  | { type: 'retirer_bloc'; id: string; nom: string; place: PlaceBloc; bloc: string }
  | { type: 'supprimer_dashboard'; id: string; nom: string }
  /** `relations` : « Base › Colonne » des relations qui deviendront du texte. */
  | { type: 'supprimer_base'; base: string; nom: string; lignes: number; relations: string[] }
  /** `groupe: null` : hors groupe ; `nouveau` : le groupe est créé. */
  | { type: 'placer_base'; base: string; nom: string; groupe: string | null; nouveau: boolean }

/** Actions sur les lignes appliquées après les données : suppressions, contenu des pages. */
export type ActionSuite =
  | { type: 'supprimer_lignes'; base: string; nomBase: string; lignes: { id: string; titre: string }[]; liens: number }
  /** `ligne` : l'id d'une ligne existante, ou `null` pour une ligne créée par le plan (retrouvée par `titre`). */
  | { type: 'ecrire_contenu'; base: string; nomBase: string; ligne: string | null; titre: string; contenu: string; mode: 'remplacer' | 'ajouter' }
  /** Entrée datée ajoutée à une section de la page (spec §18), sans réécrire le reste. */
  | { type: 'ajouter_remarque'; base: string; nomBase: string; ligne: string | null; titre: string; section?: string; entree: string }

export const TYPES_COLONNE = [...TYPES_CREABLES, 'relation', 'rollup', 'formula', ...TYPES_HORODATAGE] as const
export const TYPES_VUE: readonly TypeVue[] = ['tableau', 'kanban', 'collection', 'calendrier', 'timeline']

/** Options données en libellés (« Ouvert ») ou avec leur couleur ({ label, couleur }) ; doublons retirés. */
function lireOptions(brut: unknown): Option[] {
  const options: Option[] = []
  for (const o of Array.isArray(brut) ? brut : []) {
    const label = (typeof o === 'string' ? o : estObjet(o) && typeof o.label === 'string' ? o.label : '').trim()
    if (label === '') continue
    const couleur = estObjet(o) ? o.couleur : undefined
    if (couleur !== undefined && couleur !== null && !(COULEURS as readonly unknown[]).includes(couleur)) erreur(`couleur inconnue pour « ${label} » : ${JSON.stringify(couleur)} (couleurs : ${COULEURS.join(', ')})`)
    if (options.some((x) => normaliser(x.label) === normaliser(label))) continue
    options.push(typeof couleur === 'string' ? { label, couleur } : { label })
  }
  return options
}

/** Libellés d'une cellule à choix (select : un, multiselect : plusieurs). */
function valeursChoix(c: LigneChargee['cellules'][string] | undefined): string[] {
  if (c?.etat !== 'ok') return []
  return Array.isArray(c.valeur) ? c.valeur.map(String) : [String(c.valeur)]
}

const avecDate = (genre: TypeVue) => genre === 'calendrier' || genre === 'timeline'

function lireColonne(b: Brouillon, base: string, brut: unknown): { action: ActionStructure; colonne: Colonne; miroir?: [string, Colonne] } {
  if (!estObjet(brut)) return erreur('colonne : objet { nom, type } attendu')
  const nom = texteRequis(brut, 'nom')
  const type = brut.type
  if (!(TYPES_COLONNE as readonly unknown[]).includes(type)) return erreur(`type de colonne inconnu : ${JSON.stringify(type)} (types : ${TYPES_COLONNE.join(', ')})`)
  const bb = b.bases.get(base)!
  const schema = bb.schema
  if (schema.colonnes.some((c) => normaliser(c.nom) === normaliser(nom))) erreur(`une colonne « ${nom} » existe déjà dans ${base}`)
  const cle = cleColonne(nom, schema.colonnes.map((c) => c.cle))
  const action = (colonne: NouvelleColonne): ActionStructure => ({ type: 'ajouter_colonne', base, nomBase: schema.nom, cle, colonne })

  if (type === 'relation') {
    const cible = b.base(brut.cible)
    if (cible.id === base) erreur('une relation relie deux bases différentes')
    const cleMiroir = cleColonne(schema.nom, cible.schema.colonnes.map((c) => c.cle))
    return {
      action: action({ type, nom, cible: cible.id, cleMiroir }),
      colonne: { cle, nom, type, cible: cible.id, proprietaire: true, inverse: cleMiroir },
      miroir: [cible.id, { cle: cleMiroir, nom: schema.nom, type, cible: base, proprietaire: false, inverse: cle }],
    }
  }
  if (type === 'rollup') {
    const relation = trouverColonne(schema, brut.relation)
    if (relation.type !== 'relation') erreur(`${relation.cle} n'est pas une relation`)
    const cible = b.bases.get((relation as Extract<Colonne, { type: 'relation' }>).cible)
    if (!cible) return erreur(`base liée introuvable pour ${relation.cle}`)
    const champ = trouverColonne(cible.schema, brut.champ)
    const calcul = brut.calcul
    if (!(CALCULS as readonly unknown[]).includes(calcul)) erreur(`calcul inconnu : ${JSON.stringify(calcul)} (calculs : ${CALCULS.join(', ')})`)
    const colonne: Colonne = { cle, nom, type, relation: relation.cle, champ: champ.cle, calcul: calcul as Calcul }
    const schemas = b.schemas()
    schemas.set(base, { ...schema, colonnes: [...schema.colonnes, colonne] })
    const probleme = boucle(schemas)
    if (probleme) erreur(`rollup refusé : ${probleme}`)
    return { action: action({ type, nom, relation: relation.cle, cible: cible.id, champ: champ.cle, calcul: calcul as Calcul }), colonne }
  }
  if (type === 'created' || type === 'modified') return { action: action({ type, nom }), colonne: { cle, nom, type } }
  if (type === 'formula') {
    const texte = texteRequis(brut, 'expression')
    const essai = (expression: string): Colonne | null => {
      const colonne: Colonne = { cle, nom, type, expression }
      const colonnes = [...schema.colonnes, colonne]
      try {
        compiler(expression, (k) => colonnes.find((c) => c.cle === k))
      } catch (e) {
        if (e instanceof ErreurFormule) return null
        throw e
      }
      const schemas = b.schemas()
      schemas.set(base, { ...schema, colonnes })
      return boucle(schemas) ? null : colonne
    }
    // Clés (prop("cle")) ou noms de colonnes (prop("Nom")), comme dans l'éditeur.
    const colonne = essai(texte) ?? essai(stockerExpression(texte, schema.colonnes))
    if (!colonne) return erreur(`formule refusée : « ${texte} » (syntaxe, type ou boucle)`)
    return { action: action({ type, nom, expression: (colonne as Extract<Colonne, { type: 'formula' }>).expression }), colonne }
  }
  const options = type === 'select' || type === 'multiselect' ? lireOptions(brut.options) : []
  const colonne: Colonne =
    type === 'select' || type === 'multiselect'
      ? { cle, nom, type, options }
      : { cle, nom, type: type as Exclude<TypeCreable, 'select' | 'multiselect'> }
  return { action: action({ type: type as TypeCreable, nom, options }), colonne }
}

function ajouterColonnes(b: Brouillon, base: string, brut: unknown): ActionStructure[] {
  if (!Array.isArray(brut) || brut.length === 0) return erreur('`colonnes` : liste de colonnes attendue')
  return brut.map((c) => {
    const { action, colonne, miroir } = lireColonne(b, base, c)
    const s = b.bases.get(base)!.schema
    b.remplacerSchema(base, { ...s, colonnes: [...s.colonnes, colonne] })
    if (miroir) {
      const sc = b.bases.get(miroir[0])!.schema
      b.remplacerSchema(miroir[0], { ...sc, colonnes: [...sc.colonnes, miroir[1]] })
    }
    return action
  })
}

function trouverVue(bb: BaseBrouillon, ref: unknown): Vue {
  if (typeof ref !== 'string') return erreur('`vue` manquante')
  const v = bb.vues.find((x) => x.id === ref) ?? bb.vues.find((x) => normaliser(x.nom) === normaliser(ref))
  return v ?? erreur(`vue inconnue dans ${bb.id} : « ${ref} » (vues : ${bb.vues.map((x) => x.id).join(', ')})`)
}

/**
 * Niveau déplié proposé, avec la base qu'il affiche : `Correspondances`
 * s'en sert pour suivre les clés réelles, l'écriture de la vue l'ignore.
 */
type NiveauPrevu = Niveau & { base?: string }

const colonneDate = (schema: Schema, ref: unknown) => {
  const c = trouverColonne(schema, ref)
  return natureDe(c) === 'date' ? c.cle : erreur(`« ${c.nom} » n'est pas une colonne date de ${schema.id}`)
}

/** Couleur des barres (calendrier, timeline, niveau déplié) : fixe, ou selon une colonne select. null la retire. */
function lireCouleur(schema: Schema, args: Record<string, unknown>): { couleur?: string; couleurPar?: string } {
  const r: { couleur?: string; couleurPar?: string } = {}
  if (args.couleur === null) r.couleur = undefined
  else if (args.couleur !== undefined) {
    if (!(COULEURS as readonly unknown[]).includes(args.couleur)) erreur(`couleur inconnue : ${JSON.stringify(args.couleur)} (couleurs : ${COULEURS.join(', ')})`)
    r.couleur = args.couleur as string
  }
  if (args.couleur_par === null) r.couleurPar = undefined
  else if (args.couleur_par !== undefined) {
    const c = trouverColonne(schema, args.couleur_par)
    if (c.type !== 'select' && c.type !== 'multiselect') erreur(`couleur_par : « ${c.nom} » n'est pas une colonne à choix de ${schema.id}`)
    r.couleurPar = c.cle
  }
  return r
}

/** Niveaux dépliés de la timeline : chaque relation, ses dates et ses filtres sont vérifiés dans la base liée. */
function lireNiveaux(b: Brouillon, bb: BaseBrouillon, brut: unknown, profondeur: number): NiveauPrevu[] {
  if (!Array.isArray(brut)) return erreur('`deplier` : liste de niveaux attendue')
  if (profondeur > PROFONDEUR_MAX) erreur(`deplier : ${PROFONDEUR_MAX} niveaux au plus`)
  return brut.map((n): NiveauPrevu => {
    if (!estObjet(n)) return erreur('deplier : objet { relation, champ_debut, … } attendu')
    const rel = trouverColonne(bb.schema, n.relation)
    if (rel.type !== 'relation') erreur(`deplier : « ${rel.nom} » n'est pas une relation de ${bb.id}`)
    const cible = b.bases.get((rel as Extract<Colonne, { type: 'relation' }>).cible) ?? erreur(`deplier : base liée par « ${rel.nom} » introuvable`)
    const debut = n.champ_debut !== undefined ? colonneDate(cible.schema, n.champ_debut) : cible.schema.colonnes.find((c) => natureDe(c) === 'date')?.cle
    const fin = n.champ_fin !== undefined && n.champ_fin !== null ? colonneDate(cible.schema, n.champ_fin) : undefined
    const jalons = Array.isArray(n.champs_jalons) ? n.champs_jalons.map((j) => colonneDate(cible.schema, j)) : []
    const couleur = lireCouleur(cible.schema, n)
    return {
      relation: rel.cle,
      base: cible.id,
      ...(debut && { champDebut: debut }),
      ...(fin && { champFin: fin }),
      ...(jalons.length > 0 && { champsJalons: jalons }),
      ...(couleur.couleur && { couleur: couleur.couleur }),
      ...(couleur.couleurPar && { couleurPar: couleur.couleurPar }),
      filtres: n.filtres === undefined ? [] : lireFiltres({ id: cible.id, schema: cible.schema, lignes: [...cible.lignes] }, n.filtres),
      deplier: n.deplier === undefined ? [] : lireNiveaux(b, cible, n.deplier, profondeur + 1),
      ...(n.sur_la_ligne === true && { surLaLigne: true }),
      ...(Array.isArray(n.champs_carte) && n.champs_carte.length > 0 && { champsCarte: n.champs_carte.map((c) => trouverColonne(cible.schema, c).cle) }),
      ...(n.sans_titre === true && { sansTitre: true }),
    }
  })
}

/** Bandes de la timeline : chaque base, ses dates et sa couleur sont vérifiées. */
function lireBandes(b: Brouillon, brut: unknown): Bande[] {
  if (!Array.isArray(brut)) return erreur('`bandes` : liste de sources attendue')
  return brut.map((x): Bande => {
    if (!estObjet(x)) return erreur('bandes : objet { base, champ_debut, … } attendu')
    const cible = b.base(x.base)
    const debut = x.champ_debut !== undefined ? colonneDate(cible.schema, x.champ_debut) : cible.schema.colonnes.find((c) => natureDe(c) === 'date')?.cle
    if (!debut) erreur(`bandes : ${cible.id} n'a pas de colonne date`)
    const fin = x.champ_fin !== undefined && x.champ_fin !== null ? colonneDate(cible.schema, x.champ_fin) : undefined
    const couleur = lireCouleur(cible.schema, x)
    return {
      base: cible.id,
      champDebut: debut,
      ...(fin && { champFin: fin }),
      ...(couleur.couleur && { couleur: couleur.couleur }),
      ...(couleur.couleurPar && { couleurPar: couleur.couleurPar }),
    }
  })
}

/** Liste de clés : null ou [] la retire (liste vide, la clé disparaît du fichier). */
const listeColonnes = (brut: unknown, col: (ref: unknown) => string, nom: string): string[] => {
  if (brut === null) return []
  if (!Array.isArray(brut)) return erreur(`${nom} : liste de colonnes attendue (null la retire)`)
  return brut.map(col)
}

/**
 * Réglages de vue proposés : colonnes vérifiées, filtres comme ceux de
 * `modifier_lignes`. `existante` : la vue modifiée ; seuls les réglages
 * passés changent (sans elle, c'est une création et les défauts s'appliquent).
 */
function lireReglagesVue(b: Brouillon, bb: BaseBrouillon, args: Record<string, unknown>, genre: TypeVue, existante?: Vue): ModificationVue {
  const base = { id: bb.id, schema: bb.schema, lignes: [...bb.lignes] }
  const r: ModificationVue = {}
  const col = (ref: unknown) => trouverColonne(bb.schema, ref).cle
  if (typeof args.nom === 'string' && args.nom.trim() !== '') r.nom = args.nom.trim()
  if (Array.isArray(args.filtres)) r.filtres = lireFiltres(base, args.filtres)
  if (Array.isArray(args.tris)) {
    r.tris = args.tris.map((t): Tri => {
      if (!estObjet(t)) return erreur('tri : objet { colonne, sens } attendu')
      return { colonne: col(t.colonne), sens: t.sens === 'desc' ? 'desc' : 'asc' }
    })
  }
  if (args.groupe === null) r.groupe = undefined
  else if (args.groupe !== undefined) r.groupe = col(args.groupe)
  if (args.colonnes_masquees !== undefined) r.masquees = listeColonnes(args.colonnes_masquees, col, 'colonnes_masquees')
  if (args.colonnes !== undefined) r.ordre = listeColonnes(args.colonnes, col, 'colonnes')
  if (args.champs_carte !== undefined) r.champsCarte = listeColonnes(args.champs_carte, col, 'champs_carte')
  if (typeof args.sans_titre === 'boolean') r.sansTitre = args.sans_titre
  if (typeof args.retour_ligne === 'boolean') r.retourLigne = args.retour_ligne
  if (args.sous_groupe === null) r.sousGroupe = undefined
  else if (args.sous_groupe !== undefined) r.sousGroupe = col(args.sous_groupe)
  if (args.filtres_ou !== undefined) {
    if (args.filtres_ou !== null && !Array.isArray(args.filtres_ou)) erreur('filtres_ou : liste de groupes de filtres attendue')
    r.filtresOu = ((args.filtres_ou ?? []) as unknown[]).map((g): Filtre[] => (Array.isArray(g) && g.length > 0 ? lireFiltres(base, g) : erreur('filtres_ou : chaque groupe est une liste non vide de filtres')))
  }
  if (args.filtres_rapides !== undefined) {
    if (args.filtres_rapides !== null && !Array.isArray(args.filtres_rapides)) erreur('filtres_rapides : liste attendue ([] les retire)')
    r.filtresRapides = ((args.filtres_rapides ?? []) as unknown[]).map((p): FiltreRapide => {
      if (!estObjet(p)) return erreur('filtre rapide : objet { colonne, operateur, valeur } attendu')
      if (p.operateur === undefined) return { colonne: col(p.colonne), ...(p.valeur !== undefined && { valeur: p.valeur }) }
      const [f] = lireFiltres(base, [p])
      return f!
    })
  }
  if (args.largeurs !== undefined) {
    if (args.largeurs !== null && !estObjet(args.largeurs)) erreur('largeurs : objet { colonne: pixels } attendu (null les retire)')
    r.largeurs = Object.fromEntries(
      Object.entries((args.largeurs ?? {}) as Record<string, unknown>).map(([c, px]) => {
        if (typeof px !== 'number' || px < 40 || px > 2000) erreur(`largeurs : nombre de pixels de 40 à 2000 pour « ${c} »`)
        return [col(c), Math.round(px as number)]
      }),
    )
  }
  if (args.calculs !== undefined) {
    if (args.calculs !== null && !estObjet(args.calculs)) erreur('calculs : objet { colonne: calcul } attendu (null les retire)')
    r.calculs = Object.fromEntries(
      Object.entries((args.calculs ?? {}) as Record<string, unknown>).map(([ref, calcul]) => {
        const c = trouverColonne(bb.schema, ref)
        const possibles = calculsPour(c)
        if (!possibles.includes(calcul as Calcul)) erreur(`calcul impossible sur « ${c.nom} » : ${JSON.stringify(calcul)} (possibles : ${possibles.join(', ')})`)
        return [c.cle, calcul as string]
      }),
    )
  }
  if (args.champ_debut !== undefined) r.champDebut = col(args.champ_debut)
  if (args.champ_fin === null) r.champFin = undefined
  else if (args.champ_fin !== undefined) r.champFin = col(args.champ_fin)
  if (Array.isArray(args.champs_jalons)) r.champsJalons = args.champs_jalons.map((j) => colonneDate(bb.schema, j))
  if (typeof args.noms_jalons === 'boolean') {
    if (genre !== 'timeline') erreur('noms_jalons : seulement pour une vue timeline')
    r.nomsJalons = args.noms_jalons
  }
  if (args.echelle !== undefined) {
    const echelles = genre === 'calendrier' ? ['mois', 'semaine'] : ['semaine', 'mois', 'trimestre']
    if (!echelles.includes(String(args.echelle))) erreur(`echelle : ${echelles.join(', ')} pour une vue ${genre}`)
    r.echelle = args.echelle as ModificationVue['echelle']
  }
  Object.assign(r, lireCouleur(bb.schema, args))
  if (args.deplier !== undefined) {
    if (genre !== 'timeline') erreur('deplier : seulement pour une vue timeline')
    r.deplier = args.deplier === null ? [] : lireNiveaux(b, bb, args.deplier, 1)
  }
  if (args.bandes !== undefined) {
    if (genre !== 'timeline') erreur('bandes : seulement pour une vue timeline')
    r.bandes = args.bandes === null ? [] : lireBandes(b, args.bandes)
  }
  // Date par défaut à la création seulement : une modification ne touche qu'aux réglages passés.
  if (avecDate(genre) && !r.champDebut && !existante?.champDebut) {
    const date = bb.schema.colonnes.find((c) => c.type === 'date')
    if (!date) erreur(`une vue ${genre} demande une colonne date dans ${bb.id}`)
    r.champDebut = date!.cle
  }
  return r
}

function trouverDashboard(b: Brouillon, ref: unknown) {
  if (typeof ref !== 'string' || ref.trim() === '') return erreur('`dashboard` manquant')
  const d = b.dashboards.find((x) => x.id === ref) ?? b.dashboards.find((x) => normaliser(x.nom) === normaliser(ref))
  if (!d) return erreur(`dashboard inconnu : « ${ref} » (dashboards : ${b.dashboards.map((x) => x.id).join(', ') || 'aucun'})`)
  if (!d.dashboard) return erreur(`le fichier du dashboard « ${d.nom} » est illisible : il ne peut que se supprimer`)
  return d
}

function lireHauteur(x: unknown): number | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x !== 'number' || !Number.isFinite(x)) return erreur(`hauteur : nombre de pixels attendu (${HAUTEUR_BLOC.min} à ${HAUTEUR_BLOC.max})`)
  return Math.round(Math.max(HAUTEUR_BLOC.min, Math.min(HAUTEUR_BLOC.max, x)))
}

function lireLargeur(x: unknown): number | undefined {
  if (x === undefined || x === null) return undefined
  if (typeof x !== 'number' || x < LARGEUR_BLOC.min || x > LARGEUR_BLOC.max) return erreur(`largeur : pourcentage de la rangée, de ${LARGEUR_BLOC.min} à ${LARGEUR_BLOC.max}`)
  return Math.round(x)
}

/**
 * Bloc proposé : une vue de la base (`vue`, sa première par défaut), ou une
 * vue propre au dashboard (`vue_propre`, réglée comme `creer_vue`). `ids` :
 * ids des vues propres déjà prises dans le dashboard, complété au passage.
 */
function lireBloc(b: Brouillon, brut: unknown, ids: string[], requetes: Readonly<Record<string, string>>): Bloc {
  if (!estObjet(brut)) return erreur('bloc : objet { base, vue }, { base, vue_propre } ou { type, donnees | sql, … } (analyse) attendu')
  const largeur = lireLargeur(brut.largeur)
  const avecLargeur = largeur !== undefined ? { largeur } : {}
  // Bloc d'analyse (spec §10 « Analyse ») : un `type` de visuel et pas de base.
  if (brut.base === undefined && brut.type !== undefined) return { ...lireBlocAnalyseIA(brut, requetes), ...avecLargeur }
  const bb = b.base(brut.base)
  if (brut.vue_propre === undefined) return { base: bb.id, vue: trouverVue(bb, brut.vue ?? bb.vues[0]!.id).id, ...avecLargeur }
  if (brut.vue !== undefined) erreur('bloc : `vue` ou `vue_propre`, pas les deux')
  if (!estObjet(brut.vue_propre)) return erreur('vue_propre : objet { nom, type, ... } attendu')
  const nom = texteRequis(brut.vue_propre, 'nom')
  const genre = (brut.vue_propre.type ?? 'tableau') as TypeVue
  if (!TYPES_VUE.includes(genre)) erreur(`type de vue inconnu : ${JSON.stringify(brut.vue_propre.type)} (types : ${TYPES_VUE.join(', ')})`)
  const reglages = lireReglagesVue(b, bb, { ...brut.vue_propre, nom: undefined }, genre)
  const id = idBase(nom, ids)
  ids.push(id)
  return { base: bb.id, vue: { id, nom, type: genre, filtres: [], tris: [], filtresRapides: [], ...reglages }, ...avecLargeur }
}

/** « Base › Vue », pour l'aperçu. */
function nomBloc(b: Brouillon, bloc: Bloc): string {
  if (estAnalyse(bloc)) return nomAnalyse(bloc)
  const bb = b.bases.get(bloc.base)
  const vue = estPropre(bloc) ? `${bloc.vue.nom} (vue propre)` : (bb?.vues.find((v) => v.id === bloc.vue)?.nom ?? bloc.vue)
  return `${bb?.schema.nom ?? bloc.base} › ${vue}`
}

/** Numéro compté à partir de 1, rendu en indice. */
function rang(args: Record<string, unknown>, cle: string, max: number, quoi: string): number {
  const v = args[cle]
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > max) return erreur(`${cle} : ${quoi} de 1 à ${max} attendu${v === undefined ? '' : `, reçu ${JSON.stringify(v)}`}`)
  return v - 1
}

/** Place d'un bloc donnée par `rangee` et `bloc`, comptés à partir de 1. */
function lirePlace(d: Dashboard, args: Record<string, unknown>): PlaceBloc {
  if (d.rangees.length === 0) return erreur('le dashboard n’a aucun bloc')
  const rangee = rang(args, 'rangee', d.rangees.length, 'numéro de rangée')
  return { rangee, bloc: rang(args, 'bloc', d.rangees[rangee]!.blocs.length, `numéro de bloc dans la rangée ${rangee + 1}`) }
}

const idsPropres = (d: Dashboard) => d.rangees.flatMap((r) => r.blocs.flatMap((x) => (estPropre(x) ? [x.vue.id] : [])))

/** Une opération de `modifier_dashboard`, lue sur la mise en page qu'ont laissée les précédentes. */
function lireOperation(b: Brouillon, d: Dashboard, brut: unknown): { ops: { op: OperationDashboard; base?: string }[]; texte: string } {
  if (!estObjet(brut)) return erreur('objet { type, ... } attendu')
  const n = d.rangees.length
  const pleine = (r: number) => {
    if (d.rangees[r]!.blocs.length >= BLOCS_PAR_RANGEE) erreur(`la rangée ${r + 1} est pleine (${BLOCS_PAR_RANGEE} blocs au plus)`)
  }
  switch (brut.type) {
    case 'renommer': {
      const nom = texteRequis(brut, 'nom')
      return { ops: [{ op: { type: 'renommer', nom } }], texte: `renommer en « ${nom} »` }
    }
    case 'ajouter_bloc': {
      const bloc = lireBloc(b, brut.nouveau, idsPropres(d), d.requetes)
      if (brut.rangee === undefined || brut.rangee === n + 1) return { ops: [{ op: { type: 'ajouter_bloc', rangee: null, bloc } }], texte: `ajouter ${nomBloc(b, bloc)} dans une nouvelle rangée en bas` }
      const rangee = rang(brut, 'rangee', n + 1, 'numéro de rangée (le suivant de la dernière : nouvelle rangée)')
      pleine(rangee)
      const taille = d.rangees[rangee]!.blocs.length
      const position = brut.position === undefined ? taille : rang(brut, 'position', taille + 1, 'position')
      return { ops: [{ op: { type: 'ajouter_bloc', rangee, position, bloc } }], texte: `ajouter ${nomBloc(b, bloc)} dans la rangée ${rangee + 1}, position ${position + 1}` }
    }
    case 'deplacer_bloc': {
      const de = lirePlace(d, brut)
      const nom = nomBloc(b, d.rangees[de.rangee]!.blocs[de.bloc]!)
      if (brut.nouvelle_rangee !== undefined) {
        const r = rang(brut, 'nouvelle_rangee', n + 1, 'place de la nouvelle rangée')
        return { ops: [{ op: { type: 'deplacer_bloc', de, vers: { nouvelleRangee: r } } }], texte: `déplacer ${nom} seul dans une nouvelle rangée, place ${r + 1}` }
      }
      const rangee = rang(brut, 'vers_rangee', n, 'numéro de rangée')
      if (rangee !== de.rangee) pleine(rangee)
      const taille = d.rangees[rangee]!.blocs.length
      const position = brut.position === undefined ? taille : rang(brut, 'position', taille + 1, 'position')
      return { ops: [{ op: { type: 'deplacer_bloc', de, vers: { rangee, position } } }], texte: `déplacer ${nom} dans la rangée ${rangee + 1}, position ${position + 1}` }
    }
    case 'remplacer_bloc': {
      const place = lirePlace(d, brut)
      const ancien = nomBloc(b, d.rangees[place.rangee]!.blocs[place.bloc]!)
      const bloc = lireBloc(b, brut.par, idsPropres(d), d.requetes)
      return { ops: [{ op: { type: 'remplacer_bloc', place, bloc } }], texte: `remplacer ${ancien} par ${nomBloc(b, bloc)}` }
    }
    case 'deplacer_rangee': {
      if (n === 0) erreur('le dashboard n’a aucune rangée')
      const de = rang(brut, 'rangee', n, 'numéro de rangée')
      const vers = rang(brut, 'vers', n, 'place une fois déplacée')
      return { ops: [{ op: { type: 'deplacer_rangee', de, vers } }], texte: `déplacer la rangée ${de + 1} en place ${vers + 1}` }
    }
    case 'hauteur': {
      if (n === 0) erreur('le dashboard n’a aucune rangée')
      const rangee = rang(brut, 'rangee', n, 'numéro de rangée')
      const hauteur = lireHauteur(brut.hauteur) ?? null
      return { ops: [{ op: { type: 'hauteur_rangee', rangee, hauteur } }], texte: hauteur === null ? `hauteur par défaut pour la rangée ${rangee + 1}` : `hauteur de la rangée ${rangee + 1} : ${hauteur} px` }
    }
    case 'largeurs': {
      if (n === 0) erreur('le dashboard n’a aucune rangée')
      const rangee = rang(brut, 'rangee', n, 'numéro de rangée')
      const taille = d.rangees[rangee]!.blocs.length
      if (!Array.isArray(brut.largeurs) || brut.largeurs.length !== taille) erreur(`largeurs : une par bloc de la rangée ${rangee + 1} (${taille}), null pour une part égale`)
      const largeurs = (brut.largeurs as unknown[]).map((x) => lireLargeur(x) ?? null)
      const fixees = largeurs.filter((x): x is number => x !== null)
      if (fixees.reduce((a, x) => a + x, 0) > 100) erreur('largeurs : leur somme dépasse 100 %')
      return { ops: [{ op: { type: 'largeurs_rangee', rangee, largeurs } }], texte: `largeurs de la rangée ${rangee + 1} : ${largeurs.map((x) => (x === null ? 'part égale' : `${x} %`)).join(', ')}` }
    }
    case 'modifier_vue': {
      const place = lirePlace(d, brut)
      const bloc = d.rangees[place.rangee]!.blocs[place.bloc]!
      if (!estPropre(bloc)) return erreur(`${nomBloc(b, bloc)} affiche une vue de la base : modifie-la avec l'outil modifier_vue, ou remplace le bloc par une vue_propre`)
      const bb = b.bases.get(bloc.base) ?? erreur(`base introuvable : ${bloc.base}`)
      const { largeurs: _blocs, largeurs_colonnes, ...reglages } = brut
      const modifs = lireReglagesVue(b, bb, { ...reglages, ...(largeurs_colonnes !== undefined && { largeurs: largeurs_colonnes }) }, bloc.vue.type, bloc.vue)
      if (Object.keys(modifs).length === 0) erreur('modifier_vue : aucun réglage à changer')
      return { ops: [{ op: { type: 'modifier_vue', place, modifs }, base: bloc.base }], texte: `modifier la vue propre ${nomBloc(b, bloc)} (${Object.keys(modifs).join(', ')})` }
    }
    case 'filtres': {
      if (brut.filtres === undefined && brut.filtres_rapides === undefined) return erreur('filtres : `filtres` et/ou `filtres_rapides` attendus ([] les retire)')
      const ops: { op: OperationDashboard }[] = []
      const textes: string[] = []
      if (brut.filtres !== undefined) {
        if (!Array.isArray(brut.filtres)) return erreur('filtres : liste de { base, colonne, operateur, valeur } attendue ; vide les retire')
        const filtres = brut.filtres.map((f): FiltreGlobal => {
          if (!estObjet(f)) return erreur('filtre : objet { base, colonne, operateur, valeur } attendu')
          const bb = b.base(f.base)
          const [lu] = lireFiltres({ id: bb.id, schema: bb.schema, lignes: [...bb.lignes] }, [f])
          return { ...lu!, base: bb.id }
        })
        ops.push({ op: { type: 'filtres', filtres } })
        textes.push(filtres.length === 0 ? 'retirer les filtres du dashboard' : `filtres du dashboard : ${filtres.map((f) => `${f.base}.${f.colonne} ${f.operateur}`).join(', ')}`)
      }
      if (brut.filtres_rapides !== undefined) {
        if (!Array.isArray(brut.filtres_rapides)) return erreur('filtres_rapides : liste de { base, colonne, operateur, valeur } attendue ; vide les retire')
        const pastilles = brut.filtres_rapides.map((p): PastilleGlobale => {
          if (!estObjet(p)) return erreur('filtre rapide : objet { base, colonne } attendu')
          const bb = b.base(p.base)
          // Sans colonne : le choix de lignes de la base (spec §10).
          if (p.colonne === undefined) return { base: bb.id, ...(p.valeur !== undefined && { valeur: p.valeur }) }
          if (p.operateur === undefined) return { base: bb.id, colonne: trouverColonne(bb.schema, p.colonne).cle, ...(p.valeur !== undefined && { valeur: p.valeur }) }
          const [f] = lireFiltres({ id: bb.id, schema: bb.schema, lignes: [...bb.lignes] }, [p])
          return { base: bb.id, ...f! }
        })
        ops.push({ op: { type: 'filtres_rapides', pastilles } })
        textes.push(pastilles.length === 0 ? 'retirer les filtres rapides du dashboard' : `filtres rapides du dashboard : ${pastilles.map((p) => `${p.base}${p.colonne ? `.${p.colonne}` : ''}`).join(', ')}`)
      }
      return { ops, texte: textes.join(' ; ') }
    }
    case 'modifier_bloc': {
      const place = lirePlace(d, brut)
      const bloc = d.rangees[place.rangee]!.blocs[place.bloc]!
      if (!estAnalyse(bloc)) return erreur(`${nomBloc(b, bloc)} montre une vue : règle-la avec modifier_vue`)
      const modifs = lireModifsAnalyse(brut, bloc, d.requetes)
      return { ops: [{ op: { type: 'modifier_analyse', place, modifs } }], texte: `régler ${nomBloc(b, bloc)} (${Object.keys(modifs).join(', ')})` }
    }
    case 'requete': {
      const nom = texteRequis(brut, 'nom')
      if (brut.sql === null) {
        if (d.requetes[nom] === undefined) return erreur(`requête « ${nom} » inconnue (requêtes : ${Object.keys(d.requetes).join(', ') || 'aucune'})`)
        const utilisee = d.rangees.flatMap((r) => r.blocs).find((x) => estAnalyse(x) && x.donnees === nom)
        if (utilisee) return erreur(`la requête « ${nom} » sert encore à ${nomBloc(b, utilisee)} : change d’abord ses données`)
        return { ops: [{ op: { type: 'requete', nom, sql: null } }], texte: `retirer la requête « ${nom} »` }
      }
      const sql = lireRequetesIA({ [nom]: brut.sql })[nom]!
      return { ops: [{ op: { type: 'requete', nom, sql } }], texte: `${d.requetes[nom] === undefined ? 'ajouter' : 'remplacer'} la requête « ${nom} »` }
    }
    case 'parametres': {
      const parametres = lireParametresIA(brut.parametres)
      return { ops: [{ op: { type: 'parametres', parametres } }], texte: parametres.length === 0 ? 'retirer les paramètres' : `paramètres : ${parametres.map((p) => `${p.nom} (${p.type})`).join(', ')}` }
    }
    case 'valeur_parametre': {
      const nom = texteRequis(brut, 'nom')
      if (!d.parametres.some((p) => p.nom === nom)) return erreur(`paramètre « ${nom} » inconnu (paramètres : ${d.parametres.map((p) => p.nom).join(', ') || 'aucun'})`)
      return { ops: [{ op: { type: 'valeur_parametre', nom, valeur: brut.valeur ?? null } }], texte: brut.valeur === null || brut.valeur === undefined ? `paramètre ${nom} : valeur par défaut` : `paramètre ${nom} = ${JSON.stringify(brut.valeur)}` }
    }
    default:
      return erreur(`type d'opération inconnu : ${JSON.stringify(brut.type)} (types : ${TYPES_OPERATION.join(', ')})`)
  }
}

export const TYPES_OPERATION = ['renommer', 'ajouter_bloc', 'deplacer_bloc', 'remplacer_bloc', 'deplacer_rangee', 'hauteur', 'largeurs', 'modifier_vue', 'filtres', 'modifier_bloc', 'requete', 'parametres', 'valeur_parametre'] as const

/** Valide un appel d'outil de structure ; `null` si l'outil n'en est pas un. */
export function validerStructure(b: Brouillon, nom: string, args: Record<string, unknown>, ctx: Contexte): { structure: ActionStructure[] } | { suite: ActionSuite } | null {
  switch (nom) {
    case 'creer_base': {
      const nomBase = texteRequis(args, 'nom')
      if ([...b.bases.values()].some((x) => normaliser(x.schema.nom) === normaliser(nomBase))) erreur(`une base « ${nomBase} » existe déjà`)
      const id = idBase(nomBase, [...b.bases.keys()])
      const schema = lireSchema(nouveauSchema(id, nomBase), id).schema!
      b.bases.set(id, { id, schema, lignes: [], vues: [{ id: 'tableau', nom: 'Tableau', type: 'tableau', filtres: [], tris: [], filtresRapides: [], implicite: true }], nouvelle: true })
      const colonnes = Array.isArray(args.colonnes) && args.colonnes.length > 0 ? ajouterColonnes(b, id, args.colonnes) : []
      return { structure: [{ type: 'creer_base', id, nom: nomBase }, ...colonnes] }
    }
    case 'ajouter_colonnes':
      return { structure: ajouterColonnes(b, b.base(args.base).id, args.colonnes) }
    case 'renommer_colonne': {
      const bb = b.base(args.base)
      const c = trouverColonne(bb.schema, args.colonne)
      const nouveau = texteRequis(args, 'nom')
      b.remplacerSchema(bb.id, { ...bb.schema, colonnes: bb.schema.colonnes.map((x) => (x.cle === c.cle ? { ...x, nom: nouveau } : x)) })
      return { structure: [{ type: 'renommer_colonne', base: bb.id, nomBase: bb.schema.nom, cle: c.cle, ancien: c.nom, nom: nouveau }] }
    }
    case 'ajouter_options': {
      const bb = b.base(args.base)
      const c = trouverColonne(bb.schema, args.colonne)
      if (c.type !== 'select' && c.type !== 'multiselect') erreur(`« ${c.nom} » n'est pas une colonne à choix (select, multiselect)`)
      if (c.type !== 'select' && c.type !== 'multiselect') return null
      const demandees = lireOptions(args.options)
      if (demandees.length === 0) erreur('options : au moins un libellé')
      const ajouts: Option[] = []
      const couleurs: Required<Option>[] = []
      for (const o of demandees) {
        const existante = c.options.find((x) => normaliser(x.label) === normaliser(o.label))
        if (!existante) ajouts.push(o)
        else if (o.couleur && o.couleur !== existante.couleur) couleurs.push({ label: existante.label, couleur: o.couleur })
      }
      if (ajouts.length === 0 && couleurs.length === 0) erreur(`ces options existent déjà dans « ${c.nom} », avec ces couleurs`)
      const options = [...c.options.map((x) => ({ ...x, ...couleurs.find((y) => y.label === x.label) })), ...ajouts]
      b.remplacerSchema(bb.id, { ...bb.schema, colonnes: bb.schema.colonnes.map((x) => (x.cle === c.cle ? { ...c, options } : x)) })
      return { structure: [{ type: 'ajouter_options', base: bb.id, nomBase: bb.schema.nom, cle: c.cle, nomColonne: c.nom, ajouts, couleurs }] }
    }
    case 'retirer_option': {
      const bb = b.base(args.base)
      const c = trouverColonne(bb.schema, args.colonne)
      if (c.type !== 'select' && c.type !== 'multiselect') erreur(`« ${c.nom} » n'est pas une colonne à choix (select, multiselect)`)
      if (c.type !== 'select' && c.type !== 'multiselect') return null
      const libelles = `[${c.options.map((o) => o.label).join(', ')}]`
      const option = c.options.find((o) => normaliser(o.label) === normaliser(texteRequis(args, 'option')))
      if (!option) return erreur(`option introuvable dans « ${c.nom} » : ${JSON.stringify(args.option)} (options : ${libelles})`)
      let remplacement: string | undefined
      if (args.remplacer_par !== undefined && args.remplacer_par !== null && args.remplacer_par !== '') {
        const r = c.options.find((o) => normaliser(o.label) === normaliser(String(args.remplacer_par)))
        if (!r) erreur(`remplacer_par : option parmi ${libelles} (ajouter_options d'abord pour une nouvelle)`)
        if (r === option) erreur('remplacer_par : une autre option que celle retirée')
        remplacement = r!.label
      }
      const lignes = bb.lignes.filter((l) => valeursChoix(l.cellules[c.cle]).includes(option.label)).length
      b.remplacerSchema(bb.id, { ...bb.schema, colonnes: bb.schema.colonnes.map((x) => (x.cle === c.cle ? { ...c, options: c.options.filter((o) => o !== option) } : x)) })
      return { structure: [{ type: 'retirer_option', base: bb.id, nomBase: bb.schema.nom, cle: c.cle, nomColonne: c.nom, option: option.label, ...(remplacement !== undefined && { remplacement }), lignes }] }
    }
    case 'supprimer_colonne': {
      const bb = b.base(args.base)
      const c = trouverColonne(bb.schema, args.colonne)
      if (c.cle === bb.schema.champTitre) erreur('la colonne titre ne se supprime pas')
      const remplies = bb.lignes.filter((l) => l.cellules[c.cle] !== undefined).length
      b.remplacerSchema(bb.id, { ...bb.schema, colonnes: bb.schema.colonnes.filter((x) => x.cle !== c.cle) })
      if (c.type === 'relation') {
        const autre = b.bases.get(c.cible)
        if (autre) b.remplacerSchema(autre.id, { ...autre.schema, colonnes: autre.schema.colonnes.filter((x) => x.cle !== c.inverse) })
      }
      return { structure: [{ type: 'supprimer_colonne', base: bb.id, nomBase: bb.schema.nom, cle: c.cle, nom: c.nom, remplies }] }
    }
    case 'creer_vue': {
      const bb = b.base(args.base)
      const nomVue = texteRequis(args, 'nom')
      const genre = (args.type ?? 'tableau') as TypeVue
      if (!TYPES_VUE.includes(genre)) erreur(`type de vue inconnu : ${JSON.stringify(args.type)} (types : ${TYPES_VUE.join(', ')})`)
      const reglages = lireReglagesVue(b, bb, { ...args, nom: undefined }, genre)
      const id = idBase(nomVue, bb.vues.filter((v) => !v.implicite).map((v) => v.id))
      bb.vues.push({ id, nom: nomVue, type: genre, filtres: [], tris: [], filtresRapides: [], ...reglages })
      return { structure: [{ type: 'creer_vue', base: bb.id, nomBase: bb.schema.nom, id, nom: nomVue, genre, reglages }] }
    }
    case 'modifier_vue': {
      const bb = b.base(args.base)
      const vue = trouverVue(bb, args.vue)
      const reglages = lireReglagesVue(b, bb, args, vue.type, vue)
      if (Object.keys(reglages).length === 0) erreur('modifier_vue : aucun réglage à changer')
      return { structure: [{ type: 'modifier_vue', base: bb.id, nomBase: bb.schema.nom, vue: vue.id, nomVue: vue.nom, reglages }] }
    }
    case 'supprimer_vue': {
      const bb = b.base(args.base)
      const vue = trouverVue(bb, args.vue)
      if (bb.vues.length <= 1) erreur('une base garde toujours au moins une vue')
      bb.vues.splice(bb.vues.indexOf(vue), 1)
      return { structure: [{ type: 'supprimer_vue', base: bb.id, nomBase: bb.schema.nom, vue: vue.id, nomVue: vue.nom }] }
    }
    case 'creer_dashboard': {
      const nomDashboard = texteRequis(args, 'nom')
      // `blocs` seuls : un par rangée (forme d'avant les rangées, toujours comprise).
      const brutes = Array.isArray(args.rangees) ? args.rangees : Array.isArray(args.blocs) ? args.blocs.map((x) => ({ blocs: [x] })) : []
      const ids: string[] = []
      const requetes = lireRequetesIA(args.requetes)
      const parametres = args.parametres === undefined ? [] : lireParametresIA(args.parametres)
      const rangees = brutes.map((r, i) => {
        if (!estObjet(r) || !Array.isArray(r.blocs) || r.blocs.length === 0) return erreur(`rangée ${i + 1} : objet { blocs: [...] } attendu, avec au moins un bloc`)
        if (r.blocs.length > BLOCS_PAR_RANGEE) erreur(`rangée ${i + 1} : ${BLOCS_PAR_RANGEE} blocs au plus`)
        const hauteur = lireHauteur(r.hauteur)
        return { blocs: r.blocs.map((x) => lireBloc(b, x, ids, requetes)), ...(hauteur !== undefined && { hauteur }) }
      })
      const id = idBase(nomDashboard, b.dashboards.map((d) => d.id))
      b.dashboards.push({ id, nom: nomDashboard, dashboard: { id, nom: nomDashboard, rangees, filtres: [], filtresRapides: [], requetes, parametres, couleurs: {}, etats: {} } })
      return { structure: [{ type: 'creer_dashboard', id, nom: nomDashboard, rangees, requetes, parametres }] }
    }
    case 'modifier_dashboard': {
      const d = trouverDashboard(b, args.dashboard)
      if (!Array.isArray(args.operations) || args.operations.length === 0) return erreur('`operations` : liste d’opérations attendue')
      const operations: { op: OperationDashboard; base?: string }[] = []
      const resume: string[] = []
      args.operations.forEach((brut, i) => {
        try {
          const lue = lireOperation(b, d.dashboard!, brut)
          for (const o of lue.ops) d.dashboard = appliquerEnMemoire(d.dashboard!, o.op)
          operations.push(...lue.ops)
          resume.push(lue.texte)
        } catch (e) {
          erreur(`opération ${i + 1} : ${e instanceof Error ? e.message : String(e)}`)
        }
      })
      const nom = d.nom
      d.nom = d.dashboard!.nom
      return { structure: [{ type: 'modifier_dashboard', id: d.id, nom, operations, resume }] }
    }
    case 'retirer_bloc': {
      const d = trouverDashboard(b, args.dashboard)
      const place = lirePlace(d.dashboard!, args)
      const bloc = nomBloc(b, d.dashboard!.rangees[place.rangee]!.blocs[place.bloc]!)
      d.dashboard = appliquerEnMemoire(d.dashboard!, { type: 'retirer_bloc', place })
      return { structure: [{ type: 'retirer_bloc', id: d.id, nom: d.nom, place, bloc }] }
    }
    case 'supprimer_dashboard': {
      const ref = texteRequis(args, 'dashboard')
      const d = b.dashboards.find((x) => x.id === ref) ?? b.dashboards.find((x) => normaliser(x.nom) === normaliser(ref))
      if (!d) return erreur(`dashboard inconnu : « ${ref} » (dashboards : ${b.dashboards.map((x) => x.id).join(', ') || 'aucun'})`)
      b.dashboards.splice(b.dashboards.indexOf(d), 1)
      return { structure: [{ type: 'supprimer_dashboard', id: d.id, nom: d.nom }] }
    }
    case 'placer_base': {
      const bb = b.base(args.base)
      const demande = args.groupe === null || args.groupe === undefined ? '' : String(args.groupe).trim()
      if (demande === '') return { structure: [{ type: 'placer_base', base: bb.id, nom: bb.schema.nom, groupe: null, nouveau: false }] }
      const existant = b.groupes.find((g) => normaliser(g) === normaliser(demande))
      if (!existant) b.groupes.push(demande)
      return { structure: [{ type: 'placer_base', base: bb.id, nom: bb.schema.nom, groupe: existant ?? demande, nouveau: !existant }] }
    }
    case 'supprimer_base': {
      const bb = b.base(args.base)
      const relations: string[] = []
      for (const autre of b.bases.values()) {
        if (autre.id === bb.id || !autre.schema.colonnes.some((c) => c.type === 'relation' && c.cible === bb.id)) continue
        const colonnes = autre.schema.colonnes.map((c): Colonne => {
          if (c.type !== 'relation' || c.cible !== bb.id) return c
          relations.push(`${autre.schema.nom} › ${c.nom}`)
          return { cle: c.cle, nom: c.nom, type: 'text' }
        })
        b.remplacerSchema(autre.id, { ...autre.schema, colonnes })
      }
      b.bases.delete(bb.id)
      return { structure: [{ type: 'supprimer_base', base: bb.id, nom: bb.schema.nom, lignes: bb.lignes.length, relations }] }
    }
    case 'supprimer_lignes': {
      const etat = b.etat()
      const base = trouverBase(etat, args.base)
      let cibles: LigneChargee[]
      if (Array.isArray(args.lignes) && args.lignes.length > 0) {
        const ids = new Set(args.lignes.map((ref) => trouverLigne(etat, base.id, ref)))
        cibles = base.lignes.filter((l) => ids.has(l.id))
      } else if (Array.isArray(args.filtres) && args.filtres.length > 0) {
        const filtres = lireFiltres(base, args.filtres)
        cibles = base.lignes.filter((l) => filtres.every((f) => correspond(l, base.schema, f, ctx)))
        if (cibles.length === 0) erreur('aucune ligne ne correspond à ces filtres')
      } else {
        return erreur('désigner les lignes par `lignes` (ids) ou `filtres`')
      }
      const ids = new Set(cibles.map((l) => l.id))
      let liens = 0
      for (const autre of b.bases.values()) {
        for (const c of autre.schema.colonnes) {
          if (c.type !== 'relation' || !c.proprietaire || c.cible !== base.id) continue
          for (const l of autre.lignes) {
            const v = l.cellules[c.cle]
            if (v?.etat === 'ok' && Array.isArray(v.valeur)) liens += v.valeur.filter((x) => ids.has(String(x))).length
          }
        }
      }
      const bb = b.bases.get(base.id)!
      b.bases.set(base.id, { ...bb, lignes: bb.lignes.filter((l) => !ids.has(l.id)) })
      return {
        suite: { type: 'supprimer_lignes', base: base.id, nomBase: base.schema.nom, lignes: cibles.map((l) => ({ id: l.id, titre: titreDe(etat, base.id, l.id) })), liens },
      }
    }
    case 'ecrire_contenu': {
      const bb = b.base(args.base)
      const contenu = texteRequis(args, 'contenu')
      const mode = args.mode === 'ajouter' ? 'ajouter' : 'remplacer'
      const ref = texteRequis(args, 'ligne')
      const nouvelle = (b.creees.get(bb.id) ?? []).find((t) => normaliser(t) === normaliser(ref))
      if (nouvelle) return { suite: { type: 'ecrire_contenu', base: bb.id, nomBase: bb.schema.nom, ligne: null, titre: nouvelle, contenu, mode } }
      const etat = b.etat()
      const id = trouverLigne(etat, bb.id, ref)
      return { suite: { type: 'ecrire_contenu', base: bb.id, nomBase: bb.schema.nom, ligne: id, titre: titreDe(etat, bb.id, id), contenu, mode } }
    }
    case 'ajouter_remarque': {
      const bb = b.base(args.base)
      const [a, m, j] = ctx.aujourdhui.split('-')
      const entree = `${j}/${m}/${a} : ${texteRequis(args, 'texte')}`
      const section = typeof args.section === 'string' && args.section.trim() !== '' ? args.section.trim().replace(/^#+\s*/, '') : undefined
      const ref = texteRequis(args, 'ligne')
      const nouvelle = (b.creees.get(bb.id) ?? []).find((t) => normaliser(t) === normaliser(ref))
      const etat = b.etat()
      const id = nouvelle ? null : trouverLigne(etat, bb.id, ref)
      return { suite: { type: 'ajouter_remarque', base: bb.id, nomBase: bb.schema.nom, ligne: id, titre: id === null ? nouvelle! : titreDe(etat, bb.id, id), ...(section ? { section } : {}), entree } }
    }
    default:
      return null
  }
}

const NOMS_TYPES: Record<string, string> = {
  text: 'texte',
  number: 'nombre',
  date: 'date',
  checkbox: 'case à cocher',
  select: 'choix',
  multiselect: 'choix multiple',
  url: 'lien',
  relation: 'relation',
  rollup: 'rollup',
  formula: 'formule',
  created: 'date de création',
  modified: 'date de modification',
}
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Une ligne de l'aperçu (et du résumé relu par le modèle). `danger` : suppression, que Ctrl+Z ne défait pas toujours. */
export function decrireAction(a: ActionStructure | ActionSuite): { texte: string; danger: boolean } {
  switch (a.type) {
    case 'creer_base':
      return { texte: `Créer la base « ${a.nom} »`, danger: false }
    case 'ajouter_colonne': {
      const c = a.colonne
      const detail =
        c.type === 'relation'
          ? ` vers ${c.cible}`
          : c.type === 'rollup'
            ? ` (${c.calcul} de ${c.champ} via ${c.relation})`
            : c.type === 'formula'
              ? ` : ${c.expression}`
              : 'options' in c && c.options.length > 0
                ? ` [${c.options.map((o) => o.label).join(', ')}]`
                : ''
      return { texte: `Ajouter la colonne « ${c.nom} » (${NOMS_TYPES[c.type]}${detail}) à ${a.nomBase}`, danger: false }
    }
    case 'ajouter_options': {
      const parties = [
        ...(a.ajouts.length > 0 ? [`ajouter ${a.ajouts.map((o) => `« ${o.label} »${o.couleur ? ` (${o.couleur})` : ''}`).join(', ')}`] : []),
        ...(a.couleurs.length > 0 ? [`colorer ${a.couleurs.map((o) => `« ${o.label} » en ${o.couleur}`).join(', ')}`] : []),
      ]
      return { texte: `Options de « ${a.nomColonne} » (${a.nomBase}) : ${parties.join(' ; ')}`, danger: false }
    }
    case 'retirer_option': {
      const effet = a.lignes === 0 ? 'aucune ligne ne l’a' : a.remplacement ? `${pluriel(a.lignes, 'ligne')} passent à « ${a.remplacement} »` : `${pluriel(a.lignes, 'ligne')} perdent cette valeur`
      return { texte: `Retirer l'option « ${a.option} » de « ${a.nomColonne} » (${a.nomBase}) : ${effet}`, danger: a.lignes > 0 && !a.remplacement }
    }
    case 'renommer_colonne':
      return { texte: `Renommer la colonne « ${a.ancien} » en « ${a.nom} » dans ${a.nomBase}`, danger: false }
    case 'supprimer_colonne':
      return { texte: `Supprimer la colonne « ${a.nom} » de ${a.nomBase}${a.remplies > 0 ? `, et sa valeur dans ${pluriel(a.remplies, 'ligne')}` : ''} (définitif)`, danger: true }
    case 'creer_vue':
      return { texte: `Créer la vue ${a.genre} « ${a.nom} » dans ${a.nomBase}`, danger: false }
    case 'modifier_vue':
      return { texte: `Modifier la vue « ${a.nomVue} » de ${a.nomBase} (${Object.keys(a.reglages).join(', ')})`, danger: false }
    case 'supprimer_vue':
      return { texte: `Supprimer la vue « ${a.nomVue} » de ${a.nomBase} (définitif, les lignes restent)`, danger: true }
    case 'creer_dashboard': {
      const blocs = a.rangees.reduce((n, r) => n + r.blocs.length, 0)
      const requetes = Object.keys(a.requetes).length
      const analyse = [requetes > 0 && pluriel(requetes, 'requête'), a.parametres.length > 0 && pluriel(a.parametres.length, 'paramètre')].filter(Boolean).join(', ')
      return { texte: `Créer le dashboard « ${a.nom} »${blocs > 0 ? ` avec ${pluriel(blocs, 'bloc')} sur ${pluriel(a.rangees.length, 'rangée')}` : ''}${analyse ? ` (${analyse})` : ''}`, danger: false }
    }
    case 'modifier_dashboard':
      return { texte: `Dashboard « ${a.nom} » : ${a.resume.join(' ; ')}`, danger: false }
    case 'retirer_bloc':
      return { texte: `Retirer le bloc ${a.bloc} (rangée ${a.place.rangee + 1}) du dashboard « ${a.nom} » (la vue reste dans sa base)`, danger: true }
    case 'supprimer_dashboard':
      return { texte: `Supprimer le dashboard « ${a.nom} » (définitif)`, danger: true }
    case 'supprimer_base': {
      const relations = a.relations.length > 0 ? ` ; relations devenues texte : ${a.relations.join(', ')}` : ''
      return { texte: `Supprimer la base « ${a.nom} » et ${pluriel(a.lignes, 'ligne')} (définitif)${relations}`, danger: true }
    }
    case 'placer_base':
      return { texte: a.groupe === null ? `Sortir la base « ${a.nom} » de son groupe` : `Ranger la base « ${a.nom} » dans le groupe « ${a.groupe} »${a.nouveau ? ' (nouveau)' : ''}`, danger: false }
    case 'supprimer_lignes': {
      const titres = a.lignes.slice(0, 10).map((l) => l.titre).join(', ')
      const reste = a.lignes.length > 10 ? ` et ${a.lignes.length - 10} autres` : ''
      const liens = a.liens > 0 ? ` ; ${pluriel(a.liens, 'lien')} vers elles retirés` : ''
      return { texte: `Supprimer ${pluriel(a.lignes.length, 'ligne')} de ${a.nomBase} : ${titres}${reste}${liens}`, danger: true }
    }
    case 'ajouter_remarque':
      return { texte: `Noter dans « ${a.titre} » (${a.nomBase})${a.section ? `, section ${a.section}` : ''} : ${a.entree}`, danger: false }
    case 'ecrire_contenu':
      return { texte: `${a.mode === 'ajouter' ? 'Compléter' : 'Écrire'} le contenu de la page « ${a.titre} » (${a.nomBase}) : ${a.contenu.length > 80 ? `${a.contenu.slice(0, 80)}…` : a.contenu}`, danger: false }
  }
}

/** Ids et clés prévus à la validation → ceux obtenus à l'application (identiques, sauf si le disque a changé entre-temps). */
export class Correspondances {
  private readonly bases = new Map<string, string>()
  private readonly cles = new Map<string, string>()
  private readonly vues = new Map<string, string>()
  private readonly lignes = new Map<string, string>()
  private readonly dashboards = new Map<string, string>()
  base = (id: string) => this.bases.get(id) ?? id
  dashboard = (id: string) => this.dashboards.get(id) ?? id
  noterDashboard = (prevu: string, reel: string) => void this.dashboards.set(prevu, reel)
  cle = (base: string, cle: string) => this.cles.get(`${base}\u0000${cle}`) ?? cle
  vue = (base: string, vue: string) => this.vues.get(`${base}\u0000${vue}`) ?? vue
  noterBase = (prevu: string, reel: string) => void this.bases.set(prevu, reel)
  noterCle = (base: string, prevue: string, reelle: string) => void this.cles.set(`${base}\u0000${prevue}`, reelle)
  noterVue = (base: string, prevue: string, reelle: string) => void this.vues.set(`${base}\u0000${prevue}`, reelle)
  noterLigne = (prevu: string, reel: string) => void this.lignes.set(prevu, reel)
  /** Ids d'une relation : les lignes créées par le plan prennent leur id réel ; une ligne pas encore créée est laissée de côté. */
  liens = (ids: readonly string[]): string[] => ids.map((id) => this.lignes.get(id) ?? id).filter((id) => !estIdPrevu(id))

  /** Bloc aux ids réels : sa base, sa vue de la base, ou les colonnes de sa vue propre. */
  bloc(b: Bloc): Bloc {
    if (estAnalyse(b)) return b
    if (!estPropre(b)) return { ...b, base: this.base(b.base), vue: this.vue(b.base, b.vue) }
    return { ...b, base: this.base(b.base), vue: { ...b.vue, ...this.reglages(b.base, b.vue) } }
  }

  /** Opération de dashboard aux ids réels. */
  operation({ op, base }: { op: OperationDashboard; base?: string }): OperationDashboard {
    switch (op.type) {
      case 'ajouter_bloc':
      case 'remplacer_bloc':
        return { ...op, bloc: this.bloc(op.bloc) }
      case 'modifier_vue':
        return base ? { ...op, modifs: this.reglages(base, op.modifs) } : op
      case 'filtres':
        return { ...op, filtres: op.filtres.map((f) => ({ ...f, base: this.base(f.base), colonne: this.cle(f.base, f.colonne) })) }
      case 'filtres_rapides':
        return { ...op, pastilles: op.pastilles.map((p) => ({ ...p, base: this.base(p.base), ...(p.colonne && { colonne: this.cle(p.base, p.colonne) }) })) }
      default:
        return op
    }
  }

  /** Réglages de vue dont les colonnes suivent les clés réelles. */
  reglages(base: string, r: ModificationVue): ModificationVue {
    const k = (c: string) => this.cle(base, c)
    return {
      ...r,
      ...(r.filtres ? { filtres: r.filtres.map((f) => ({ ...f, colonne: k(f.colonne) })) } : {}),
      ...(r.tris ? { tris: r.tris.map((t) => ({ ...t, colonne: k(t.colonne) })) } : {}),
      ...(r.groupe ? { groupe: k(r.groupe) } : {}),
      ...(r.masquees ? { masquees: r.masquees.map(k) } : {}),
      ...(r.ordre ? { ordre: r.ordre.map(k) } : {}),
      ...(r.champsCarte ? { champsCarte: r.champsCarte.map(k) } : {}),
      ...(r.sousGroupe ? { sousGroupe: k(r.sousGroupe) } : {}),
      ...(r.largeurs ? { largeurs: Object.fromEntries(Object.entries(r.largeurs).map(([c, v]) => [k(c), v])) } : {}),
      ...(r.calculs ? { calculs: Object.fromEntries(Object.entries(r.calculs).map(([c, v]) => [k(c), v])) } : {}),
      ...(r.filtresOu ? { filtresOu: r.filtresOu.map((g) => g.map((f) => ({ ...f, colonne: k(f.colonne) }))) } : {}),
      ...(r.filtresRapides ? { filtresRapides: r.filtresRapides.map((p) => ({ ...p, colonne: k(p.colonne) })) } : {}),
      ...(r.champDebut ? { champDebut: k(r.champDebut) } : {}),
      ...(r.champFin ? { champFin: k(r.champFin) } : {}),
      ...(r.champsJalons ? { champsJalons: r.champsJalons.map(k) } : {}),
      ...(r.couleurPar ? { couleurPar: k(r.couleurPar) } : {}),
      ...(r.deplier ? { deplier: this.niveaux(base, r.deplier) } : {}),
      ...(r.bandes
        ? {
            bandes: r.bandes.map((bd) => ({
              ...bd,
              ...(bd.champDebut ? { champDebut: this.cle(bd.base, bd.champDebut) } : {}),
              ...(bd.champFin ? { champFin: this.cle(bd.base, bd.champFin) } : {}),
              ...(bd.couleurPar ? { couleurPar: this.cle(bd.base, bd.couleurPar) } : {}),
            })),
          }
        : {}),
    }
  }

  /** Niveaux dépliés aux clés réelles, chacun dans sa base (et sans la base notée à la validation). */
  private niveaux(base: string, niveaux: readonly NiveauPrevu[]): Niveau[] {
    return niveaux.map(({ base: cible = base, ...n }) => {
      const k = (c: string) => this.cle(cible, c)
      return {
        ...n,
        relation: this.cle(base, n.relation),
        ...(n.champDebut ? { champDebut: k(n.champDebut) } : {}),
        ...(n.champFin ? { champFin: k(n.champFin) } : {}),
        ...(n.champsJalons ? { champsJalons: n.champsJalons.map(k) } : {}),
        ...(n.couleurPar ? { couleurPar: k(n.couleurPar) } : {}),
        ...(n.champsCarte ? { champsCarte: n.champsCarte.map(k) } : {}),
        filtres: n.filtres.map((f) => ({ ...f, colonne: k(f.colonne) })),
        deplier: this.niveaux(cible, n.deplier),
      }
    })
  }
}

/** Applique la structure d'un plan confirmé, dans l'ordre des appels. */
export async function appliquerStructure(espace: DepotEspace, actions: readonly ActionStructure[], corr: Correspondances): Promise<void> {
  for (const a of actions) {
    switch (a.type) {
      case 'creer_base':
        corr.noterBase(a.id, await espace.creerBase(a.nom))
        break
      case 'ajouter_colonne': {
        const base = corr.base(a.base)
        const c = a.colonne
        let cle: string
        if (c.type === 'relation') cle = await espace.ajouterRelation(base, c.nom, corr.base(c.cible))
        else if (c.type === 'rollup') cle = await espace.ajouterRollup(base, c.nom, corr.cle(a.base, c.relation), corr.cle(c.cible, c.champ), c.calcul)
        else if (c.type === 'formula') cle = await espace.ajouterFormule(base, c.nom, c.expression)
        else if (c.type === 'created' || c.type === 'modified') cle = await espace.ajouterHorodatage(base, c.nom, c.type)
        else {
          cle = await espace.ajouterColonne(base, c.nom, c.type)
          for (const o of c.options) {
            await espace.ajouterOption(base, cle, o.label)
            if (o.couleur) await espace.changerCouleurOption(base, cle, o.label, o.couleur)
          }
        }
        corr.noterCle(a.base, a.cle, cle)
        break
      }
      case 'ajouter_options': {
        const base = corr.base(a.base)
        const cle = corr.cle(a.base, a.cle)
        for (const o of a.ajouts) {
          await espace.ajouterOption(base, cle, o.label)
          if (o.couleur) await espace.changerCouleurOption(base, cle, o.label, o.couleur)
        }
        for (const o of a.couleurs) await espace.changerCouleurOption(base, cle, o.label, o.couleur)
        break
      }
      case 'retirer_option':
        await espace.retirerOption(corr.base(a.base), corr.cle(a.base, a.cle), a.option, a.remplacement)
        break
      case 'renommer_colonne':
        await espace.renommerColonne(corr.base(a.base), corr.cle(a.base, a.cle), a.nom)
        break
      case 'supprimer_colonne':
        await espace.supprimerColonne(corr.base(a.base), corr.cle(a.base, a.cle))
        break
      case 'creer_vue':
        corr.noterVue(a.base, a.id, await espace.creerVue(corr.base(a.base), a.nom, a.genre, corr.reglages(a.base, a.reglages)))
        break
      case 'modifier_vue':
        await espace.modifierVue(corr.base(a.base), corr.vue(a.base, a.vue), corr.reglages(a.base, a.reglages))
        break
      case 'supprimer_vue':
        await espace.supprimerVue(corr.base(a.base), corr.vue(a.base, a.vue))
        break
      case 'creer_dashboard': {
        const id = await espace.creerDashboard(a.nom)
        corr.noterDashboard(a.id, id)
        for (const [nom, sql] of Object.entries(a.requetes)) await espace.modifierDashboard(id, { type: 'requete', nom, sql })
        if (a.parametres.length > 0) await espace.modifierDashboard(id, { type: 'parametres', parametres: a.parametres })
        for (const [i, r] of a.rangees.entries()) {
          for (const [j, bloc] of r.blocs.entries()) await espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: j === 0 ? null : i, bloc: corr.bloc(bloc) })
          if (r.hauteur !== undefined) await espace.modifierDashboard(id, { type: 'hauteur_rangee', rangee: i, hauteur: r.hauteur })
        }
        break
      }
      case 'modifier_dashboard':
        for (const o of a.operations) await espace.modifierDashboard(corr.dashboard(a.id), corr.operation(o))
        break
      case 'retirer_bloc':
        await espace.modifierDashboard(corr.dashboard(a.id), { type: 'retirer_bloc', place: a.place })
        break
      case 'supprimer_dashboard':
        await espace.supprimerDashboard(corr.dashboard(a.id))
        break
      case 'supprimer_base':
        await espace.supprimerBase(corr.base(a.base))
        break
      case 'placer_base':
        if (a.groupe !== null && !espace.etat().groupes.some((g) => g.nom === a.groupe)) await espace.ajouterGroupe(a.groupe)
        await espace.placerBase(corr.base(a.base), a.groupe)
        break
    }
  }
}

/** Applique les suppressions de lignes et le contenu des pages, après les données du plan. */
export async function appliquerSuite(espace: DepotEspace, actions: readonly ActionSuite[], corr: Correspondances): Promise<void> {
  for (const a of actions) {
    const base = corr.base(a.base)
    const depot = espace.etat().bases.get(base)?.depot
    if (!depot) continue
    if (a.type === 'supprimer_lignes') {
      const chemins = a.lignes.flatMap((l) => depot.lignes().find((x) => x.id === l.id)?.chemin ?? [])
      await espace.supprimerLignes(base, chemins, true)
      continue
    }
    // Une ligne créée par le plan se retrouve par son titre : la dernière créée qui le porte.
    const titre = depot.schema.champTitre
    const ligne =
      a.ligne !== null
        ? depot.lignes().find((x) => x.id === a.ligne)
        : [...depot.lignes()].reverse().find((x) => {
            const t = x.cellules[titre]
            return t?.etat === 'ok' && normaliser(String(t.valeur)) === normaliser(a.titre)
          })
    if (!ligne) continue
    if (a.type === 'ajouter_remarque') {
      depot.modifierCorps(ligne.chemin, insererRemarque(ligne.corps, a.section, a.entree))
      continue
    }
    const corps = a.mode === 'ajouter' && ligne.corps.trim() !== '' ? `${ligne.corps.trimEnd()}\n\n${a.contenu.trim()}\n` : `${a.contenu.trim()}\n`
    depot.modifierCorps(ligne.chemin, corps)
  }
}
