import type { LigneChargee } from '../base'
import type { EtatEspace } from '../depot-espace'
import { operateursPour } from '../filtres'
import { estObjet, type Colonne, type Schema } from '../schema'
import type { Filtre, Operateur } from '../vue'

// Ce que le modèle désigne (base, colonne, ligne, filtres), retrouvé dans
// l'état de l'espace par id ou à défaut par nom ; refus explicite sinon.

/** Une proposition refusée ; le message est renvoyé au modèle, puis montré à l'utilisateur. */
export class ErreurProposition extends Error {}

export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const erreur = (message: string): never => {
  throw new ErreurProposition(message)
}

export type BaseOuverte = { id: string; schema: Schema; lignes: LigneChargee[] }

/** Base désignée par son id, ou à défaut par son nom. */
export function trouverBase(etat: EtatEspace, ref: unknown): BaseOuverte {
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

export function trouverColonne(schema: Schema, ref: unknown): Colonne {
  if (typeof ref !== 'string') return erreur('colonne manquante')
  const c = schema.colonnes.find((x) => x.cle === ref) ?? schema.colonnes.find((x) => normaliser(x.nom) === normaliser(ref))
  return c ?? erreur(`colonne inconnue dans ${schema.id} : « ${ref} » (colonnes : ${schema.colonnes.map((x) => x.cle).join(', ')})`)
}

export function titreDe(etat: EtatEspace, base: string, id: string): string {
  return etat.titres.get(base)?.get(id) || 'Sans titre'
}

/** Ligne désignée par son id, ou à défaut par un titre qui ne désigne qu'elle. */
export function trouverLigne(etat: EtatEspace, base: string, ref: unknown): string {
  if (typeof ref !== 'string') return erreur('id de ligne attendu')
  const titres = etat.titres.get(base) ?? new Map<string, string>()
  if (titres.has(ref)) return ref
  const memes = [...titres].filter(([, t]) => normaliser(t) === normaliser(ref))
  if (memes.length === 1) return memes[0]![0]
  return erreur(memes.length > 1 ? `plusieurs lignes s'appellent « ${ref} » dans ${base} : donner l'id` : `ligne inconnue dans ${base} : « ${ref} »`)
}

export function lireFiltres(base: BaseOuverte, brut: unknown): Filtre[] {
  if (!Array.isArray(brut)) return erreur('`filtres` : liste attendue')
  return brut.map((f) => {
    if (!estObjet(f)) return erreur('filtre : objet { colonne, operateur, valeur } attendu')
    const c = trouverColonne(base.schema, f.colonne)
    const operateurs = operateursPour(c)
    if (!operateurs.includes(f.operateur as Operateur)) erreur(`opérateur « ${String(f.operateur)} » impossible sur ${c.cle} (possibles : ${operateurs.join(', ')})`)
    return { colonne: c.cle, operateur: f.operateur as Operateur, ...(f.valeur !== undefined ? { valeur: f.valeur } : {}) }
  })
}

export const texteRequis = (args: Record<string, unknown>, cle: string): string => {
  const v = args[cle]
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : erreur(`\`${cle}\` : texte attendu`)
}
