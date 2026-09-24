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
  - { colonne: client }
  - { colonne: echeance, operateur: avant, valeur: aujourdhui }
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
      filtresRapides: [{ colonne: 'client' }, { colonne: 'echeance', operateur: 'avant', valeur: 'aujourdhui' }],
      miseEnPage: 'suivi',
      groupe: 'statut',
      sousGroupe: 'client',
      champsCarte: ['echeance', 'nb_taches_ouvertes'],
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

  it('écrit une pastille par ligne, réglée ou non', () => {
    const apres = modifierVue(null, vueParDefaut(), {
      filtresRapides: [{ colonne: 'statut', operateur: 'parmi', valeur: ['En cours'] }, { colonne: 'client' }],
    })
    expect(apres).toBe(
      'id: tableau\nnom: Tableau\ntype: tableau\nfiltres_rapides:\n  - { colonne: statut, operateur: parmi, valeur: [ En cours ] }\n  - { colonne: client }\n',
    )
  })

  it('ignore une pastille sans colonne (ancien format à nom) avec un avertissement', () => {
    const { vue, avertissements } = lireVue('filtres_rapides:\n  - nom: Urgent\n    filtres: []\n  - { colonne: a }\n', 'v')
    expect(vue?.filtresRapides).toEqual([{ colonne: 'a' }])
    expect(avertissements).toHaveLength(1)
  })

  it('retire une liste vidée, renomme', () => {
    const vue = lireVue(KANBAN, 'k').vue!
    const apres = modifierVue(KANBAN, vue, { tris: [], nom: 'Statuts' })
    expect(apres).not.toContain('tris')
    expect(lireVue(apres, 'k').vue!.nom).toBe('Statuts')
  })
})

describe('réglages de la vue', () => {
  it('écrit et relit ordre, colonnes masquées, largeurs, retour à la ligne, calculs, groupe', () => {
    const vue = vueParDefaut()
    const texte = modifierVue(null, vue, {
      ordre: ['titre', 'statut'],
      masquees: ['budget'],
      largeurs: { titre: 300, statut: 120 },
      retourLigne: true,
      calculs: { budget: 'somme', titre: 'compter' },
      groupe: 'statut',
    })
    expect(texte).toBe(
      'id: tableau\nnom: Tableau\ntype: tableau\ncolonnes: [ titre, statut ]\ncolonnes_masquees: [ budget ]\nlargeurs: { titre: 300, statut: 120 }\nretour_ligne: true\ncalculs: { budget: somme, titre: compter }\ngroupe: statut\n',
    )
    expect(lireVue(texte, 'tableau').vue).toMatchObject({
      ordre: ['titre', 'statut'],
      masquees: ['budget'],
      largeurs: { titre: 300, statut: 120 },
      retourLigne: true,
      calculs: { budget: 'somme', titre: 'compter' },
      groupe: 'statut',
    })
  })

  it('retire une clé vidée ou désactivée', () => {
    const avec = modifierVue(null, vueParDefaut(), { retourLigne: true, groupe: 'statut', masquees: ['a'] })
    const sans = modifierVue(avec, vueParDefaut(), { retourLigne: false, groupe: undefined, masquees: [] })
    expect(sans).toBe('id: tableau\nnom: Tableau\ntype: tableau\n')
  })

  it('ignore un réglage mal formé', () => {
    const { vue } = lireVue('largeurs: { titre: large, statut: 90 }\ncolonnes: oui\nretour_ligne: peut-être\n', 'v')
    expect(vue?.largeurs).toEqual({ statut: 90 })
    expect(vue?.ordre).toBeUndefined()
    expect(vue?.retourLigne).toBeUndefined()
  })
})
