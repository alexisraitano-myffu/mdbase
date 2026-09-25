import type { LigneChargee } from '../base'
import type { DepotEspace, EtatEspace } from '../depot-espace'
import { lireDate } from '../echange'
import { correspond, operateursPour, type Contexte } from '../filtres'
import type { Modifications } from '../ligne'
import { estSaisie, estObjet, type Colonne, type Schema } from '../schema'
import { lireNombre, type Cellule, type Valeur } from '../valeurs'
import type { Filtre, Operateur } from '../vue'
import type { AppelOutil } from './modele'

// Validation des appels d'outils du modèle (spec §12, « Module IA ») : chaque
// valeur passe les mêmes contrôles qu'une saisie dans l'interface. Un appel
// invalide est refusé en entier ; rien n'est écrit avant la confirmation.

/** Une proposition refusée ; le message est renvoyé au modèle, puis montré à l'utilisateur. */
export class ErreurProposition extends Error {}

export type Changement = { colonne: string; avant: string; apres: string }
export type LignePlan = {
  /** `null` pour une ligne à créer. */
  id: string | null
  titre: string
  valeurs: Modifications
  changements: Changement[]
}
export type Operation = { type: 'modifier' | 'creer'; base: string; nomBase: string; lignes: LignePlan[] }
export type Plan = { operations: Operation[] }

export type AppelValide = { type: 'operation'; operation: Operation } | { type: 'reponse'; texte: string }

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const erreur = (message: string): never => {
  throw new ErreurProposition(message)
}

type BaseOuverte = { id: string; schema: Schema; lignes: LigneChargee[] }

/** Base désignée par son id, ou à défaut par son nom. */
function trouverBase(etat: EtatEspace, ref: unknown): BaseOuverte {
  if (typeof ref !== 'string') return erreur('`base` manquante')
  const bases = [...etat.bases.values()]
  const b = bases.find((x) => x.id === ref) ?? bases.find((x) => x.depot && normaliser(x.depot.schema.nom) === normaliser(ref))
  if (!b?.depot) return erreur(`base inconnue : « ${ref} » (bases : ${bases.map((x) => x.id).join(', ')})`)
  // Lignes avec leurs colonnes calculées, comme dans les vues : les filtres portent aussi sur elles.
  const calculs = etat.calculs.get(b.id)
  const lignes = b.depot.lignes().map((l) => {
    const c = calculs?.get(l.id)
    return c ? { ...l, cellules: { ...l.cellules, ...c } } : l
  })
  return { id: b.id, schema: b.depot.schema, lignes }
}

function trouverColonne(schema: Schema, ref: unknown): Colonne {
  if (typeof ref !== 'string') return erreur('colonne manquante')
  const c = schema.colonnes.find((x) => x.cle === ref) ?? schema.colonnes.find((x) => normaliser(x.nom) === normaliser(ref))
  return c ?? erreur(`colonne inconnue dans ${schema.id} : « ${ref} » (colonnes : ${schema.colonnes.map((x) => x.cle).join(', ')})`)
}

function titreDe(etat: EtatEspace, base: string, id: string): string {
  return etat.titres.get(base)?.get(id) || 'Sans titre'
}

/** Ligne désignée par son id, ou à défaut par un titre qui ne désigne qu'elle. */
function trouverLigne(etat: EtatEspace, base: string, ref: unknown): string {
  if (typeof ref !== 'string') return erreur('id de ligne attendu')
  const titres = etat.titres.get(base) ?? new Map<string, string>()
  if (titres.has(ref)) return ref
  const memes = [...titres].filter(([, t]) => normaliser(t) === normaliser(ref))
  if (memes.length === 1) return memes[0]![0]
  return erreur(memes.length > 1 ? `plusieurs lignes s'appellent « ${ref} » dans ${base} : donner l'id` : `ligne inconnue dans ${base} : « ${ref} »`)
}

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

function lireFiltres(base: BaseOuverte, brut: unknown): Filtre[] {
  if (!Array.isArray(brut)) return erreur('`filtres` : liste attendue')
  return brut.map((f) => {
    if (!estObjet(f)) return erreur('filtre : objet { colonne, operateur, valeur } attendu')
    const c = trouverColonne(base.schema, f.colonne)
    const operateurs = operateursPour(c)
    if (!operateurs.includes(f.operateur as Operateur)) erreur(`opérateur « ${String(f.operateur)} » impossible sur ${c.cle} (possibles : ${operateurs.join(', ')})`)
    return { colonne: c.cle, operateur: f.operateur as Operateur, ...(f.valeur !== undefined ? { valeur: f.valeur } : {}) }
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

/** Valide un appel d'outil contre l'état de l'espace ; lève `ErreurProposition` s'il est refusé. */
export function validerAppel(etat: EtatEspace, appel: AppelOutil, ctx: Contexte): AppelValide {
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
    case 'creer_lignes':
      return { type: 'operation', operation: creer(etat, args) }
    case 'repondre':
      return { type: 'reponse', texte: typeof args.texte === 'string' ? args.texte : '' }
    default:
      return erreur(`outil inconnu : ${appel.nom}`)
  }
}

/**
 * Applique un plan confirmé. Une ligne supprimée entre l'aperçu et la
 * confirmation est ignorée ; renvoie le nombre de lignes écrites.
 */
export async function appliquerPlan(espace: DepotEspace, plan: Plan): Promise<number> {
  let n = 0
  for (const op of plan.operations) {
    const depot = espace.etat().bases.get(op.base)?.depot
    if (!depot) continue
    for (const l of op.lignes) {
      if (op.type === 'creer') {
        await espace.creerLigne(op.base, l.valeurs)
        n++
        continue
      }
      const ligne = depot.lignes().find((x) => x.id === l.id)
      if (!ligne) continue
      for (const [cle, v] of Object.entries(l.valeurs)) {
        const c = depot.schema.colonnes.find((x) => x.cle === cle)
        if (c?.type === 'relation') espace.modifierRelation(op.base, ligne.id, cle, Array.isArray(v) ? v : [])
        else depot.modifier(ligne.chemin, cle, v)
      }
      if (depot.schema.champTitre in l.valeurs) await depot.renommerSelonTitre(ligne.chemin)
      n++
    }
  }
  return n
}
