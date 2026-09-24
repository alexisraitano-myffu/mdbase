import { describe, expect, it } from 'vitest'
import { lireVue, modifierVue, vueParDefaut } from './vue'

const KANBAN = `id: kanban-statut
nom: Par statut
type: kanban
groupe: statut
sous_groupe: client
champs_carte: [echeance, nb_taches_ouvertes]
filtres:
  - { colonne: statut, operateur: different_de, valeur: Terminé }
tris:
  - { colonne: echeance, sens: asc }
filtres_rapides:
  - nom: En retard
    filtres:
      - { colonne: jours_restants, operateur: inferieur, valeur: 0 }
mise_en_page: suivi
`

describe('lireVue', () => {
  it('lit l’exemple de la spec', () => {
    const { vue, avertissements } = lireVue(KANBAN, 'kanban-statut')
    expect(avertissements).toEqual([])
    expect(vue).toEqual({
      id: 'kanban-statut',
      nom: 'Par statut',
      type: 'kanban',
      filtres: [{ colonne: 'statut', operateur: 'different_de', valeur: 'Terminé' }],
      tris: [{ colonne: 'echeance', sens: 'asc' }],
      filtresRapides: [{ nom: 'En retard', filtres: [{ colonne: 'jours_restants', operateur: 'inferieur', valeur: 0 }] }],
      miseEnPage: 'suivi',
    })
  })

  it('écarte un filtre mal formé avec un avertissement', () => {
    const { vue, avertissements } = lireVue('filtres:\n  - { colonne: a, operateur: ressemble }\n  - { operateur: vide }\n  - { colonne: b, operateur: vide }\n', 'v')
    expect(vue?.filtres).toEqual([{ colonne: 'b', operateur: 'vide' }])
    expect(avertissements).toHaveLength(2)
  })

  it('refuse un fichier illisible sans lever d’exception', () => {
    expect(lireVue('filtres: [', 'v').vue).toBeNull()
  })
})

describe('modifierVue', () => {
  it('réécrit les filtres au format de la spec, sans toucher aux clés propres au kanban', () => {
    const vue = lireVue(KANBAN, 'kanban-statut').vue!
    const apres = modifierVue(KANBAN, vue, {
      filtres: [
        { colonne: 'statut', operateur: 'parmi', valeur: ['À faire', 'En cours'] },
        { colonne: 'echeance', operateur: 'vide' },
      ],
    })
    expect(apres).toContain('groupe: statut\nsous_groupe: client\nchamps_carte: [ echeance, nb_taches_ouvertes ]\n')
    expect(apres).toContain(
      'filtres:\n  - { colonne: statut, operateur: parmi, valeur: [ À faire, En cours ] }\n  - { colonne: echeance, operateur: vide }\ntris:',
    )
    expect(lireVue(apres, 'kanban-statut').vue!.filtres[0]!.valeur).toEqual(['À faire', 'En cours'])
  })

  it('écrit les filtres rapides avec un filtre par ligne', () => {
    const apres = modifierVue(null, vueParDefaut(), {
      filtresRapides: [{ nom: 'Urgent', filtres: [{ colonne: 'urgent', operateur: 'egal', valeur: true }] }],
    })
    expect(apres).toBe(
      'id: tableau\nnom: Tableau\ntype: tableau\nfiltres_rapides:\n  - nom: Urgent\n    filtres:\n      - { colonne: urgent, operateur: egal, valeur: true }\n',
    )
  })

  it('retire une liste vidée, renomme', () => {
    const vue = lireVue(KANBAN, 'k').vue!
    const apres = modifierVue(KANBAN, vue, { tris: [], nom: 'Statuts' })
    expect(apres).not.toContain('tris')
    expect(lireVue(apres, 'k').vue!.nom).toBe('Statuts')
  })
})
