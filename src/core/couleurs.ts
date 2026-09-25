import type { LigneChargee } from './base'
import { colonne, type Schema } from './schema'

// Couleurs nommées de l'espace : options de select, barres des vues temporelles.

export const COULEURS = ['gris', 'bleu', 'vert', 'orange', 'violet', 'rose', 'jaune', 'rouge', 'marron'] as const

/** Réglage de couleur d'une vue temporelle ou d'un niveau déplié (spec §7). */
export type ReglageCouleur = {
  /** Couleur fixe, une des `COULEURS`. */
  couleur?: string
  /** Colonne select (ou multiselect) : la ligne prend la couleur de son option (la première, pour un multiselect). */
  couleurPar?: string
}

/**
 * Couleur d'une ligne : celle de son option quand la vue colore par une
 * colonne, sinon la couleur fixe. `undefined` : couleur neutre.
 */
export function couleurDeLigne(ligne: LigneChargee, schema: Schema, r: ReglageCouleur): string | undefined {
  if (r.couleurPar) {
    const c = colonne(schema, r.couleurPar)
    if (c?.type !== 'select' && c?.type !== 'multiselect') return undefined
    const cellule = ligne.cellules[c.cle]
    if (cellule?.etat !== 'ok') return undefined
    const label = Array.isArray(cellule.valeur) ? cellule.valeur[0] : cellule.valeur
    return c.options.find((o) => o.label === label)?.couleur ?? (label === undefined ? undefined : 'gris')
  }
  return r.couleur && (COULEURS as readonly string[]).includes(r.couleur) ? r.couleur : undefined
}
