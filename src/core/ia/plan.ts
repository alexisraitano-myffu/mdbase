import type { LigneChargee } from '../base'
import type { DepotEspace, EtatEspace } from '../depot-espace'
import { lireDate } from '../echange'
import { correspond, type Contexte } from '../filtres'
import type { Modifications } from '../ligne'
import { estSaisie, estObjet, type Colonne } from '../schema'
import { lireNombre, type Cellule, type Valeur } from '../valeurs'
import type { Assistant, Skill } from './memoire'
import { appliquerStructure, appliquerSuite, Brouillon, Correspondances, decrireAction, validerStructure, type ActionStructure, type ActionSuite } from './structure'
import { erreur, ErreurProposition, lireFiltres, normaliser, texteRequis, titreDe, trouverBase, trouverColonne, trouverLigne, type BaseOuverte } from './references'
import type { AppelOutil } from './modele'

// Validation des appels d'outils du modèle (spec §12, « Module IA ») : chaque
// valeur passe les mêmes contrôles qu'une saisie dans l'interface. Un appel
// invalide est refusé en entier ; rien n'est écrit avant la confirmation.

export { ErreurProposition }


export type Changement = { colonne: string; avant: string; apres: string }
export type LignePlan = {
  /** `null` pour une ligne à créer. */
  id: string | null
  titre: string
  valeurs: Modifications
  changements: Changement[]
}
export type Operation = { type: 'modifier' | 'creer'; base: string; nomBase: string; lignes: LignePlan[] }
/** Skill proposé : écrit seulement après confirmation, comme une modification de données (spec §12). */
export type SkillPropose = Skill & { remplace: boolean }
export type Plan = {
  /** Bases, colonnes, vues, dashboards : appliqués d'abord, dans l'ordre des appels. */
  structure?: ActionStructure[]
  operations: Operation[]
  /** Suppressions de lignes et contenu des pages : appliqués après les données. */
  suite?: ActionSuite[]
  skills?: SkillPropose[]
}

/** Retenir ou oublier : écrit aussitôt, avec une mention annulable (spec §12). */
export type ActionMemoire = { type: 'retenir' | 'oublier'; fait: string }

export type AppelValide =
  | { type: 'operation'; operation: Operation }
  | { type: 'structure'; actions: ActionStructure[] }
  | { type: 'suite'; action: ActionSuite }
  | { type: 'reponse'; texte: string }
  | { type: 'memoire'; action: ActionMemoire }
  | { type: 'skill'; skill: SkillPropose }



/** Valeur proposée par le modèle, convertie comme une saisie ; `undefined` vide le champ. */
function convertir(etat: EtatEspace, c: Colonne, brut: unknown): Valeur | undefined {
  if (brut === null || brut === undefined || brut === '') return undefined
  const refus = (attendu: string) => erreur(`${c.cle} : ${attendu}, reçu ${JSON.stringify(brut)}`)
  const option = (options: readonly { label: string }[], v: unknown) => {
    const o = typeof v === 'string' ? options.find((x) => normaliser(x.label) === normaliser(v)) : undefined
    return o?.label ?? refus(`option parmi [${options.map((x) => x.label).join(', ')}]`)
  }
  switch (c.type) {
    case 'text':
    case 'url':
      return typeof brut === 'string' || typeof brut === 'number' ? String(brut) : refus('texte attendu')
    case 'number': {
      const n = typeof brut === 'number' ? brut : typeof brut === 'string' ? lireNombre(brut) : null
      return typeof n === 'number' && Number.isFinite(n) ? n : refus('nombre attendu')
    }
    case 'date':
      return (typeof brut === 'string' && lireDate(brut)) || refus('date AAAA-MM-JJ attendue')
    case 'checkbox':
      if (typeof brut === 'boolean') return brut
      return brut === 'true' ? true : brut === 'false' ? false : refus('true ou false attendu')
    case 'select':
      return option(c.options, brut)
    case 'multiselect':
      return (Array.isArray(brut) ? brut : [brut]).map((v) => option(c.options, v))
    case 'relation':
      return (Array.isArray(brut) ? brut : [brut]).map((v) => trouverLigne(etat, c.cible, v))
    default:
      return erreur(`${c.cle} est une colonne calculée : lecture seule`)
  }
}

/** Texte d'une valeur pour l'aperçu : titres des lignes liées, « oui / non » pour une case. */
function lisible(etat: EtatEspace, c: Colonne, v: Valeur | undefined): string {
  if (v === undefined || v === false) return c.type === 'checkbox' ? 'non' : ''
  if (v === true) return 'oui'
  if (c.type === 'relation' && Array.isArray(v)) return v.map((id) => titreDe(etat, c.cible, id)).join(', ')
  if (Array.isArray(v)) return v.join(', ')
  return typeof v === 'number' ? String(v).replace('.', ',') : v
}

function valeurActuelle(cellule: Cellule | undefined): Valeur | undefined {
  return cellule?.etat === 'ok' ? cellule.valeur : undefined
}

const memeValeur = (a: Valeur | undefined, b: Valeur | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function lireValeurs(etat: EtatEspace, base: BaseOuverte, brut: unknown): [Colonne, Valeur | undefined][] {
  if (!estObjet(brut) || Object.keys(brut).length === 0) return erreur('`valeurs` : objet { clé de colonne: valeur } attendu')
  return Object.entries(brut).map(([ref, v]) => {
    const c = trouverColonne(base.schema, ref)
    if (!estSaisie(c) && c.type !== 'relation') erreur(`${c.cle} est une colonne calculée : lecture seule`)
    return [c, convertir(etat, c, v)]
  })
}


function modifier(etat: EtatEspace, args: Record<string, unknown>, ctx: Contexte): Operation {
  const base = trouverBase(etat, args.base)
  const valeurs = lireValeurs(etat, base, args.valeurs)
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
  const lignes = cibles.flatMap((l): LignePlan[] => {
    const changements: Changement[] = []
    const modifs: Modifications = {}
    for (const [c, v] of valeurs) {
      const avant = valeurActuelle(l.cellules[c.cle])
      if (memeValeur(avant, v)) continue
      modifs[c.cle] = v
      changements.push({ colonne: c.nom, avant: lisible(etat, c, avant), apres: lisible(etat, c, v) })
    }
    return changements.length > 0 ? [{ id: l.id, titre: titreDe(etat, base.id, l.id), valeurs: modifs, changements }] : []
  })
  return { type: 'modifier', base: base.id, nomBase: base.schema.nom, lignes }
}

function creer(etat: EtatEspace, args: Record<string, unknown>): Operation {
  const base = trouverBase(etat, args.base)
  if (!Array.isArray(args.lignes) || args.lignes.length === 0) return erreur('`lignes` : liste de lignes à créer attendue')
  const lignes = args.lignes.map((brut): LignePlan => {
    const valeurs = lireValeurs(etat, base, brut)
    const modifs = Object.fromEntries(valeurs.map(([c, v]) => [c.cle, v]))
    const titre = modifs[base.schema.champTitre]
    return {
      id: null,
      titre: typeof titre === 'string' && titre !== '' ? titre : 'Sans titre',
      valeurs: modifs,
      changements: valeurs
        .filter(([c, v]) => c.cle !== base.schema.champTitre && v !== undefined)
        .map(([c, v]) => ({ colonne: c.nom, avant: '', apres: lisible(etat, c, v) })),
    }
  })
  return { type: 'creer', base: base.id, nomBase: base.schema.nom, lignes }
}


/**
 * Valide un appel d'outil ; lève `ErreurProposition` s'il est refusé. Avec un
 * `Brouillon`, les appels d'un même plan se valident dans l'ordre : chacun voit
 * les bases et colonnes que les précédents créent.
 */
export function validerAppel(espace: EtatEspace | Brouillon, appel: AppelOutil, ctx: Contexte, assistant: Assistant = { memoire: [], skills: [] }): AppelValide {
  const brouillon = espace instanceof Brouillon ? espace : new Brouillon(espace)
  const etat = brouillon.etat()
  let args: unknown
  try {
    args = JSON.parse(appel.arguments || '{}')
  } catch {
    return erreur(`${appel.nom} : arguments illisibles (JSON attendu)`)
  }
  if (!estObjet(args)) return erreur(`${appel.nom} : objet d'arguments attendu`)
  switch (appel.nom) {
    case 'modifier_lignes':
      return { type: 'operation', operation: modifier(etat, args, ctx) }
    case 'creer_lignes': {
      const operation = creer(etat, args)
      brouillon.noterCreees(operation.base, operation.lignes.map((l) => l.titre))
      return { type: 'operation', operation }
    }
    case 'repondre':
      return { type: 'reponse', texte: typeof args.texte === 'string' ? args.texte : '' }
    case 'retenir':
      return { type: 'memoire', action: { type: 'retenir', fait: texteRequis(args, 'fait') } }
    case 'oublier': {
      const fait = texteRequis(args, 'fait')
      const trouve = assistant.memoire.find((f) => normaliser(f) === normaliser(fait))
      return trouve ? { type: 'memoire', action: { type: 'oublier', fait: trouve } } : erreur(`fait absent de la mémoire : « ${fait} »`)
    }
    case 'creer_skill': {
      const nom = texteRequis(args, 'nom')
      const skill = { nom, description: texteRequis(args, 'description'), instructions: texteRequis(args, 'instructions') }
      return { type: 'skill', skill: { ...skill, remplace: assistant.skills.some((x) => normaliser(x.nom) === normaliser(nom)) } }
    }
    default: {
      const r = validerStructure(brouillon, appel.nom, args, ctx)
      if (!r) return erreur(`outil inconnu : ${appel.nom}`)
      return 'structure' in r ? { type: 'structure', actions: r.structure } : { type: 'suite', action: r.suite }
    }
  }
}

const LIGNES_RESUMEES = 15

/** Résumé texte d'un plan : ce que le modèle relit de la conversation, et ce qui en reste affiché après coup. */
export function resumerPlan(plan: Plan): string {
  const skills = (plan.skills ?? []).map((s) => `${s.remplace ? 'Remplacer' : 'Créer'} le skill « ${s.nom} » : ${s.description}`)
  const structure = (plan.structure ?? []).map((a) => decrireAction(a).texte)
  const suite = (plan.suite ?? []).map((a) => decrireAction(a).texte)
  const operations = plan.operations
    .map((op) => {
      const n = op.lignes.length
      const lignes = op.lignes.slice(0, LIGNES_RESUMEES).map((l) => {
        const c = l.changements.map((x) => `${x.colonne} → ${x.apres || 'vide'}`).join(', ')
        return c ? `${l.titre} (${c})` : l.titre
      })
      const reste = n > LIGNES_RESUMEES ? ` ; et ${n - LIGNES_RESUMEES} autres` : ''
      return `${op.type === 'creer' ? 'Créer' : 'Modifier'} ${n} ligne${n > 1 ? 's' : ''} dans ${op.nomBase} : ${lignes.join(' ; ')}${reste}`
    })
  return [...structure, ...operations, ...suite, ...skills].join('\n')
}

/**
 * Applique un plan confirmé, skills compris. Une ligne supprimée entre
 * l'aperçu et la confirmation est ignorée ; renvoie le nombre de lignes écrites.
 */
export async function appliquerPlan(espace: DepotEspace, plan: Plan): Promise<number> {
  const corr = new Correspondances()
  await appliquerStructure(espace, plan.structure ?? [], corr)
  let n = 0
  for (const op of plan.operations) {
    const base = corr.base(op.base)
    const depot = espace.etat().bases.get(base)?.depot
    if (!depot) continue
    for (const l of op.lignes) {
      // Les clés prévues à la validation suivent celles obtenues pour les colonnes créées par le plan.
      const valeurs = Object.fromEntries(Object.entries(l.valeurs).map(([cle, v]) => [corr.cle(op.base, cle), v]))
      if (op.type === 'creer') {
        await espace.creerLigne(base, valeurs)
        n++
        continue
      }
      const ligne = depot.lignes().find((x) => x.id === l.id)
      if (!ligne) continue
      for (const [cle, v] of Object.entries(valeurs)) {
        const c = depot.schema.colonnes.find((x) => x.cle === cle)
        if (c?.type === 'relation') espace.modifierRelation(base, ligne.id, cle, Array.isArray(v) ? v : [])
        else depot.modifier(ligne.chemin, cle, v)
      }
      if (depot.schema.champTitre in valeurs) await depot.renommerSelonTitre(ligne.chemin)
      n++
    }
  }
  await appliquerSuite(espace, plan.suite ?? [], corr)
  for (const { remplace: _, ...skill } of plan.skills ?? []) await espace.assistant.enregistrerSkill(skill)
  return n
}
