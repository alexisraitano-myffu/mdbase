import { describe, expect, it } from 'vitest'
import { appliquerEnMemoire, lireDashboard, modifierDashboard, nouveauDashboard, type OperationDashboard } from './dashboard'
import { vueParDefaut } from './vue'

const PILOTAGE = `id: pilotage
nom: Pilotage
rangees:
  - blocs:
      - { base: projets, vue: kanban-statut }        # référence
  - blocs:
      - base: taches                                 # vue propre au dashboard
        vue:
          id: taches-en-retard
          nom: En retard
          type: tableau
          filtres:
            - { colonne: echeance, operateur: avant, valeur: aujourdhui }
      - { base: clients, vue: tableau-principal }
`

describe('lireDashboard', () => {
  it('lit l’exemple de la spec : références et vue propre', () => {
    const { dashboard, avertissements } = lireDashboard(PILOTAGE, 'pilotage')
    expect(avertissements).toEqual([])
    expect(dashboard).toEqual({
      id: 'pilotage',
      nom: 'Pilotage',
      rangees: [
        { blocs: [{ base: 'projets', vue: 'kanban-statut' }] },
        {
          blocs: [
            {
              base: 'taches',
              vue: {
                id: 'taches-en-retard',
                nom: 'En retard',
                type: 'tableau',
                filtres: [{ colonne: 'echeance', operateur: 'avant', valeur: 'aujourdhui' }],
                tris: [],
                filtresRapides: [],
              },
            },
            { base: 'clients', vue: 'tableau-principal' },
          ],
        },
      ],
      filtres: [],
      filtresRapides: [],
    })
  })

  it('tolérant : bloc sans base écarté, trois blocs coupés en deux rangées, fichier illisible refusé', () => {
    const { dashboard, avertissements } = lireDashboard(
      'rangees:\n  - blocs:\n      - { vue: x }\n      - { base: a, vue: v }\n      - { base: b, vue: v }\n      - { base: c, vue: v }\n',
      'd',
    )
    expect(dashboard?.rangees.map((r) => r.blocs.map((b) => b.base))).toEqual([['a', 'b'], ['c']])
    expect(avertissements).toHaveLength(2)
    expect(lireDashboard('rangees: [', 'd').dashboard).toBeNull()
  })
})

describe('modifierDashboard', () => {
  const appliquer = (texte: string, ...ops: OperationDashboard[]) => ops.reduce(modifierDashboard, texte)

  it('ajoute des blocs à un dashboard neuf, lisiblement', () => {
    const propre = { ...vueParDefaut(), id: 'retard', nom: 'Retard', filtres: [{ colonne: 'fait', operateur: 'egal' as const, valeur: false }] }
    delete propre.implicite
    const texte = appliquer(
      nouveauDashboard('suivi', 'Suivi'),
      { type: 'ajouter_bloc', rangee: null, bloc: { base: 'projets', vue: 'tableau' } },
      { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'taches', vue: propre } },
    )
    expect(texte).toBe(`id: suivi
nom: Suivi
rangees:
  - blocs:
      - { base: projets, vue: tableau }
      - base: taches
        vue:
          id: retard
          nom: Retard
          type: tableau
          filtres:
            - { colonne: fait, operateur: egal, valeur: false }
`)
    expect(lireDashboard(texte, 'suivi').dashboard!.rangees[0]!.blocs[1]).toMatchObject({ base: 'taches', vue: { id: 'retard', filtres: [{ colonne: 'fait' }] } })
  })

  it('modifie la vue propre en gardant les commentaires, refuse de modifier une référence', () => {
    const texte = modifierDashboard(PILOTAGE, { type: 'modifier_vue', place: { rangee: 1, bloc: 0 }, modifs: { tris: [{ colonne: 'echeance', sens: 'asc' }] } })
    expect(texte).toContain('# référence')
    expect(texte).toContain('          tris:\n            - { colonne: echeance, sens: asc }\n')
    expect(() => modifierDashboard(PILOTAGE, { type: 'modifier_vue', place: { rangee: 0, bloc: 0 }, modifs: { tris: [] } })).toThrow('propre fichier')
  })

  it('retire un bloc (la rangée vidée disparaît), déplace une rangée, refuse un troisième bloc', () => {
    const sans = modifierDashboard(PILOTAGE, { type: 'retirer_bloc', place: { rangee: 0, bloc: 0 } })
    expect(lireDashboard(sans, 'p').dashboard!.rangees).toHaveLength(1)
    const inverse = modifierDashboard(PILOTAGE, { type: 'deplacer_rangee', de: 1, vers: 0 })
    expect(lireDashboard(inverse, 'p').dashboard!.rangees[1]!.blocs[0]).toEqual({ base: 'projets', vue: 'kanban-statut' })
    expect(() => modifierDashboard(PILOTAGE, { type: 'ajouter_bloc', rangee: 1, bloc: { base: 'x', vue: 'y' } })).toThrow('2 blocs au plus')
  })

  it('la mémoire suit exactement le fichier', () => {
    const ops: OperationDashboard[] = [
      { type: 'renommer', nom: 'Pilotage 2' },
      { type: 'modifier_vue', place: { rangee: 1, bloc: 0 }, modifs: { nom: 'Retards' } },
      { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'clients', vue: 'cartes' } },
      { type: 'deplacer_rangee', de: 0, vers: 1 },
      { type: 'retirer_bloc', place: { rangee: 0, bloc: 1 } },
    ]
    let memoire = lireDashboard(PILOTAGE, 'pilotage').dashboard!
    let texte = PILOTAGE
    for (const op of ops) {
      memoire = appliquerEnMemoire(memoire, op)
      texte = modifierDashboard(texte, op)
      expect(memoire).toEqual(lireDashboard(texte, 'pilotage').dashboard)
    }
  })
})

describe('filtres globaux', () => {
  it('s’écrivent un par ligne, se relisent, et disparaissent quand on les vide', () => {
    let texte = modifierDashboard(PILOTAGE, { type: 'filtres', filtres: [{ base: 'projets', colonne: 'statut', operateur: 'egal', valeur: 'En cours' }] })
    texte = modifierDashboard(texte, { type: 'filtres_rapides', pastilles: [{ base: 'projets', valeur: ['psite001'] }, { base: 'taches', colonne: 'priorite', operateur: 'parmi' }] })
    expect(texte).toContain('filtres:\n  - { base: projets, colonne: statut, operateur: egal, valeur: En cours }\n')
    expect(texte).toContain('filtres_rapides:\n  - { base: projets, valeur: [ psite001 ] }\n  - { base: taches, colonne: priorite, operateur: parmi }\n')
    const lu = lireDashboard(texte, 'pilotage')
    expect(lu.avertissements).toEqual([])
    expect(lu.dashboard).toMatchObject({
      filtres: [{ base: 'projets', colonne: 'statut', operateur: 'egal', valeur: 'En cours' }],
      filtresRapides: [{ base: 'projets', valeur: ['psite001'] }, { base: 'taches', colonne: 'priorite', operateur: 'parmi' }],
    })
    expect(modifierDashboard(texte, { type: 'filtres', filtres: [] })).not.toContain('\nfiltres:')
  })

  it('un filtre global sans base est écarté avec un avertissement', () => {
    const lu = lireDashboard('nom: X\nfiltres:\n  - { colonne: statut, operateur: egal }\n', 'x')
    expect(lu.dashboard!.filtres).toEqual([])
    expect(lu.avertissements).toEqual(['Dashboard x : filtre global ignoré (base, colonne ou opérateur manquant)'])
  })
})
