import type { LigneChargee } from '../base'
import type { DepotBase } from '../depot-base'
import { TYPES_CREABLES, type DepotEspace, type EtatEspace, type TypeCreable } from '../depot-espace'
import { correspond, type Contexte } from '../filtres'
import { compiler, ErreurFormule, stockerExpression } from '../formules/formule'
import { boucle } from '../graphe'
import { cleColonne, idBase } from '../identifiants'
import { CALCULS, estObjet, lireSchema, type Calcul, type Colonne, type Schema } from '../schema'
import { nouveauSchema } from '../schema-ecriture'
import type { ModificationVue, Tri, TypeVue, Vue } from '../vue'
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
  readonly dashboards: { id: string; nom: string }[]
  /** Titres des lignes que le plan crée, par base : `ecrire_contenu` peut les viser. */
  readonly creees = new Map<string, string[]>()

  constructor(etat: EtatEspace) {
    this.source = etat
    for (const b of etat.bases.values()) {
      if (b.depot) this.bases.set(b.id, { id: b.id, schema: b.depot.schema, lignes: b.depot.lignes(), vues: b.vues, nouvelle: false })
    }
    this.dashboards = etat.dashboards.map((d) => ({ id: d.id, nom: d.dashboard?.nom ?? d.id }))
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

/** Colonne à créer, telle que validée. */
export type NouvelleColonne =
  | { type: TypeCreable; nom: string; options: string[] }
  | { type: 'relation'; nom: string; cible: string; cleMiroir: string }
  | { type: 'rollup'; nom: string; relation: string; /** Base liée par la relation, où vit `champ`. */ cible: string; champ: string; calcul: Calcul }
  | { type: 'formula'; nom: string; expression: string }

/** Modifications de structure, appliquées avant les données du plan. Les ids et clés sont ceux prévus au moment de la validation. */
export type ActionStructure =
  | { type: 'creer_base'; id: string; nom: string }
  | { type: 'ajouter_colonne'; base: string; nomBase: string; cle: string; colonne: NouvelleColonne }
  | { type: 'renommer_colonne'; base: string; nomBase: string; cle: string; ancien: string; nom: string }
  | { type: 'supprimer_colonne'; base: string; nomBase: string; cle: string; nom: string; remplies: number }
  | { type: 'creer_vue'; base: string; nomBase: string; id: string; nom: string; genre: TypeVue; reglages: ModificationVue }
  | { type: 'modifier_vue'; base: string; nomBase: string; vue: string; nomVue: string; reglages: ModificationVue }
  | { type: 'supprimer_vue'; base: string; nomBase: string; vue: string; nomVue: string }
  | { type: 'creer_dashboard'; id: string; nom: string; blocs: { base: string; vue: string }[] }
  | { type: 'supprimer_dashboard'; id: string; nom: string }

/** Actions sur les lignes appliquées après les données : suppressions, contenu des pages. */
export type ActionSuite =
  | { type: 'supprimer_lignes'; base: string; nomBase: string; lignes: { id: string; titre: string }[]; liens: number }
  /** `ligne` : l'id d'une ligne existante, ou `null` pour une ligne créée par le plan (retrouvée par `titre`). */
  | { type: 'ecrire_contenu'; base: string; nomBase: string; ligne: string | null; titre: string; contenu: string; mode: 'remplacer' | 'ajouter' }

export const TYPES_COLONNE = [...TYPES_CREABLES, 'relation', 'rollup', 'formula'] as const
export const TYPES_VUE: readonly TypeVue[] = ['tableau', 'kanban', 'collection', 'calendrier', 'timeline']

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
  const options = type === 'select' || type === 'multiselect' ? (Array.isArray(brut.options) ? brut.options : []).filter((o): o is string => typeof o === 'string' && o.trim() !== '').map((o) => o.trim()) : []
  const colonne: Colonne =
    type === 'select' || type === 'multiselect'
      ? { cle, nom, type, options: options.map((label) => ({ label })) }
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

/** Réglages de vue proposés : colonnes vérifiées, filtres comme ceux de `modifier_lignes`. */
function lireReglagesVue(bb: BaseBrouillon, args: Record<string, unknown>, genre: TypeVue): ModificationVue {
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
  if (Array.isArray(args.colonnes_masquees)) r.masquees = args.colonnes_masquees.map(col)
  if (args.champ_debut !== undefined) r.champDebut = col(args.champ_debut)
  if (args.champ_fin !== undefined) r.champFin = col(args.champ_fin)
  if (avecDate(genre) && !r.champDebut) {
    const date = bb.schema.colonnes.find((c) => c.type === 'date')
    if (!date) erreur(`une vue ${genre} demande une colonne date dans ${bb.id}`)
    r.champDebut = date!.cle
  }
  return r
}

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
      const reglages = lireReglagesVue(bb, { ...args, nom: undefined }, genre)
      const id = idBase(nomVue, bb.vues.filter((v) => !v.implicite).map((v) => v.id))
      bb.vues.push({ id, nom: nomVue, type: genre, filtres: [], tris: [], filtresRapides: [], ...reglages })
      return { structure: [{ type: 'creer_vue', base: bb.id, nomBase: bb.schema.nom, id, nom: nomVue, genre, reglages }] }
    }
    case 'modifier_vue': {
      const bb = b.base(args.base)
      const vue = trouverVue(bb, args.vue)
      const reglages = lireReglagesVue(bb, args, vue.type)
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
      const blocs = (Array.isArray(args.blocs) ? args.blocs : []).map((x) => {
        if (!estObjet(x)) return erreur('bloc : objet { base, vue } attendu')
        const bb = b.base(x.base)
        return { base: bb.id, vue: trouverVue(bb, x.vue ?? bb.vues[0]!.id).id }
      })
      const id = idBase(nomDashboard, b.dashboards.map((d) => d.id))
      b.dashboards.push({ id, nom: nomDashboard })
      return { structure: [{ type: 'creer_dashboard', id, nom: nomDashboard, blocs }] }
    }
    case 'supprimer_dashboard': {
      const ref = texteRequis(args, 'dashboard')
      const d = b.dashboards.find((x) => x.id === ref) ?? b.dashboards.find((x) => normaliser(x.nom) === normaliser(ref))
      if (!d) return erreur(`dashboard inconnu : « ${ref} » (dashboards : ${b.dashboards.map((x) => x.id).join(', ') || 'aucun'})`)
      b.dashboards.splice(b.dashboards.indexOf(d), 1)
      return { structure: [{ type: 'supprimer_dashboard', id: d.id, nom: d.nom }] }
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
                ? ` [${c.options.join(', ')}]`
                : ''
      return { texte: `Ajouter la colonne « ${c.nom} » (${NOMS_TYPES[c.type]}${detail}) à ${a.nomBase}`, danger: false }
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
    case 'creer_dashboard':
      return { texte: `Créer le dashboard « ${a.nom} »${a.blocs.length > 0 ? ` avec ${pluriel(a.blocs.length, 'bloc')}` : ''}`, danger: false }
    case 'supprimer_dashboard':
      return { texte: `Supprimer le dashboard « ${a.nom} » (définitif)`, danger: true }
    case 'supprimer_lignes': {
      const titres = a.lignes.slice(0, 10).map((l) => l.titre).join(', ')
      const reste = a.lignes.length > 10 ? ` et ${a.lignes.length - 10} autres` : ''
      const liens = a.liens > 0 ? ` ; ${pluriel(a.liens, 'lien')} vers elles retirés` : ''
      return { texte: `Supprimer ${pluriel(a.lignes.length, 'ligne')} de ${a.nomBase} : ${titres}${reste}${liens}`, danger: true }
    }
    case 'ecrire_contenu':
      return { texte: `${a.mode === 'ajouter' ? 'Compléter' : 'Écrire'} le contenu de la page « ${a.titre} » (${a.nomBase}) : ${a.contenu.length > 80 ? `${a.contenu.slice(0, 80)}…` : a.contenu}`, danger: false }
  }
}

/** Ids et clés prévus à la validation → ceux obtenus à l'application (identiques, sauf si le disque a changé entre-temps). */
export class Correspondances {
  private readonly bases = new Map<string, string>()
  private readonly cles = new Map<string, string>()
  private readonly vues = new Map<string, string>()
  base = (id: string) => this.bases.get(id) ?? id
  cle = (base: string, cle: string) => this.cles.get(`${base}\u0000${cle}`) ?? cle
  vue = (base: string, vue: string) => this.vues.get(`${base}\u0000${vue}`) ?? vue
  noterBase = (prevu: string, reel: string) => void this.bases.set(prevu, reel)
  noterCle = (base: string, prevue: string, reelle: string) => void this.cles.set(`${base}\u0000${prevue}`, reelle)
  noterVue = (base: string, prevue: string, reelle: string) => void this.vues.set(`${base}\u0000${prevue}`, reelle)

  /** Réglages de vue dont les colonnes suivent les clés réelles. */
  reglages(base: string, r: ModificationVue): ModificationVue {
    const k = (c: string) => this.cle(base, c)
    return {
      ...r,
      ...(r.filtres ? { filtres: r.filtres.map((f) => ({ ...f, colonne: k(f.colonne) })) } : {}),
      ...(r.tris ? { tris: r.tris.map((t) => ({ ...t, colonne: k(t.colonne) })) } : {}),
      ...(r.groupe ? { groupe: k(r.groupe) } : {}),
      ...(r.masquees ? { masquees: r.masquees.map(k) } : {}),
      ...(r.champDebut ? { champDebut: k(r.champDebut) } : {}),
      ...(r.champFin ? { champFin: k(r.champFin) } : {}),
    }
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
        else {
          cle = await espace.ajouterColonne(base, c.nom, c.type)
          for (const o of c.options) await espace.ajouterOption(base, cle, o)
        }
        corr.noterCle(a.base, a.cle, cle)
        break
      }
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
        for (const bloc of a.blocs) {
          await espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: null, bloc: { base: corr.base(bloc.base), vue: corr.vue(bloc.base, bloc.vue) } })
        }
        break
      }
      case 'supprimer_dashboard':
        await espace.supprimerDashboard(a.id)
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
    const corps = a.mode === 'ajouter' && ligne.corps.trim() !== '' ? `${ligne.corps.trimEnd()}\n\n${a.contenu.trim()}\n` : `${a.contenu.trim()}\n`
    depot.modifierCorps(ligne.chemin, corps)
  }
}
