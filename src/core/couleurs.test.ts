import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { couleurDeLigne } from './couleurs'
import type { Schema } from './schema'

const schema = {
  id: 'taches',
  nom: 'Tâches',
  champTitre: 'titre',
  colonnes: [
    { cle: 'titre', nom: 'Titre', type: 'text' },
    { cle: 'priorite', nom: 'Priorité', type: 'select', options: [{ label: 'Haute', couleur: 'rouge' }, { label: 'Basse' }] },
    { cle: 'tags', nom: 'Tags', type: 'multiselect', options: [{ label: 'Web', couleur: 'bleu' }] },
  ],
} as unknown as Schema

const ligne = (cellules: Record<string, unknown>) =>
  ({ id: 'l', chemin: 'l.md', corps: '', cellules: Object.fromEntries(Object.entries(cellules).map(([k, v]) => [k, { etat: 'ok', valeur: v }])) }) as unknown as LigneChargee

describe('couleurDeLigne', () => {
  it('prend la couleur de l’option de la colonne choisie', () => {
    expect(couleurDeLigne(ligne({ priorite: 'Haute' }), schema, { couleurPar: 'priorite' })).toBe('rouge')
    expect(couleurDeLigne(ligne({ tags: ['Web'] }), schema, { couleurPar: 'tags' })).toBe('bleu')
  })

  it('option sans couleur : gris ; cellule vide : neutre', () => {
    expect(couleurDeLigne(ligne({ priorite: 'Basse' }), schema, { couleurPar: 'priorite' })).toBe('gris')
    expect(couleurDeLigne(ligne({}), schema, { couleurPar: 'priorite' })).toBeUndefined()
  })

  it('la colonne l’emporte sur la couleur fixe ; une couleur inconnue ou une colonne non select reste neutre', () => {
    expect(couleurDeLigne(ligne({ priorite: 'Haute' }), schema, { couleur: 'vert', couleurPar: 'priorite' })).toBe('rouge')
    expect(couleurDeLigne(ligne({}), schema, { couleur: 'vert' })).toBe('vert')
    expect(couleurDeLigne(ligne({}), schema, { couleur: 'fuchsia' })).toBeUndefined()
    expect(couleurDeLigne(ligne({ titre: 'x' }), schema, { couleurPar: 'titre' })).toBeUndefined()
  })
})
