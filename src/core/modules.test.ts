import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { usagesModules } from './modules'

async function usages(fichiers: Record<string, string> = {}) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...fichiers })
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-10-19' })
  return usagesModules(espace.etat())
}

describe('modules utilisés par l’espace', () => {
  it('un espace de bases simples n’en utilise aucun', async () => {
    expect(await usages()).toEqual({})
  })

  it('une vue écrite de son type ; le tableau et la vue implicite ne comptent pas', async () => {
    const u = await usages({
      'projets/_vues/k.yaml': 'id: k\nnom: K\ntype: kanban\n',
      'taches/_vues/k.yaml': 'id: k\nnom: K\ntype: kanban\n',
      'taches/_vues/t.yaml': 'id: t\nnom: T\ntype: tableau\n',
    })
    expect(u).toEqual({ kanban: 'Utilisé par 2 vues' })
  })

  it('une vue propre à un dashboard compte aussi, et le dashboard lui-même', async () => {
    const u = await usages({
      '_dashboards/suivi.yaml': 'nom: Suivi\nrangees:\n  - blocs:\n      - base: projets\n        vue: { id: cal, nom: Cal, type: calendrier, date: debut }\n      - { base: projets, vue: tableau }\n',
    })
    expect(u.calendrier).toBe('Utilisé par 1 bloc de dashboard')
    expect(u.dashboards).toBe('Utilisé par 1 dashboard')
  })

  it('tâches : la base des tâches, un onglet Tâches, ou une case à cocher dans un corps', async () => {
    expect((await usages({ '_espace.yaml': 'taches: { base: taches, fait: fait }\n' })).taches).toBe('L’espace a une base des tâches')
    expect((await usages({ 'projets/_pages/defaut.yaml': 'id: defaut\nnom: Défaut\ndefaut: true\nonglets:\n  - { type: taches }\n' })).taches).toBe('Utilisé par l’onglet Tâches de 1 base')
    expect((await usages({ 'projets/x--p0000009.md': '---\nid: p0000009\ntitre: X\n---\n- [ ] appeler\n' })).taches).toBe('Des pages contiennent des cases à cocher')
  })

  it('une case dans un bloc de code n’est pas une tâche', async () => {
    expect((await usages({ 'projets/x--p0000009.md': '---\nid: p0000009\ntitre: X\n---\n```\n- [ ] exemple\n```\n' })).taches).toBeUndefined()
  })

  it('jira : une base synchronisée', async () => {
    const u = await usages({ 'tickets/_schema.yaml': 'nom: Tickets\nsource: { type: jira, site: exemple.atlassian.net, projets: [ABC] }\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n' })
    expect(u.jira).toBe('Utilisé par 1 base Jira')
  })
})
