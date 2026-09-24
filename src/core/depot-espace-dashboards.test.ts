import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { vueParDefaut } from './vue'

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  return { a, espace }
}

describe('dashboards dans un espace', () => {
  it('se chargent dans l’ordre de _espace.yaml, puis les autres', async () => {
    const { espace } = await ouvrir({
      ...FICHIERS_RELATIONS,
      '_espace.yaml': 'barre_laterale:\n  dashboards: [suivi, fantome]\n',
      '_dashboards/aaa.yaml': 'nom: AAA\n',
      '_dashboards/suivi.yaml': 'nom: Suivi\nrangees:\n  - blocs:\n      - { base: projets, vue: tableau }\n',
    })
    expect(espace.etat().dashboards.map((d) => [d.id, d.dashboard?.nom])).toEqual([
      ['suivi', 'Suivi'],
      ['aaa', 'AAA'],
    ])
  })

  it('créer, remplir, supprimer : un fichier par dashboard, la barre latérale dans _espace.yaml', async () => {
    const { a, espace } = await ouvrir()
    const id = await espace.creerDashboard('Pilotage')
    expect(id).toBe('pilotage')
    expect(await a.lire('_espace.yaml')).toContain('dashboards: [ pilotage ]')

    await espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: null, bloc: { base: 'projets', vue: 'tableau' } })
    const propre = { ...vueParDefaut(), id: 'ouvertes', nom: 'Ouvertes' }
    await espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'taches', vue: propre } })
    await espace.modifierDashboard(id, { type: 'modifier_vue', place: { rangee: 0, bloc: 1 }, modifs: { filtres: [{ colonne: 'fait', operateur: 'egal', valeur: false }] } })
    expect(espace.etat().dashboards[0]!.dashboard!.rangees[0]!.blocs).toHaveLength(2)
    const texte = await a.lire('_dashboards/pilotage.yaml')
    expect(texte).toContain('            - { colonne: fait, operateur: egal, valeur: false }')
    // Une vue propre n'apparaît pas dans les vues de la base (spec §10).
    expect(espace.etat().bases.get('taches')!.vues.map((v) => v.id)).toEqual(['tableau'])

    await expect(espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'clients', vue: 'tableau' } })).rejects.toThrow('2 blocs')
    await expect(espace.modifierDashboard(id, { type: 'ajouter_bloc', rangee: null, bloc: { base: 'inconnue', vue: 'tableau' } })).rejects.toThrow('Base introuvable')

    a.ecritures = []
    await espace.supprimerDashboard(id)
    expect(espace.etat().dashboards).toEqual([])
    expect(a.ecritures).toEqual(['✗ _dashboards/pilotage.yaml', '_espace.yaml'])
    await expect(a.lire('_dashboards/pilotage.yaml')).rejects.toThrow()
  })
})
