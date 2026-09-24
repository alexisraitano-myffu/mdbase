import { describe, expect, it } from 'vitest'
import { AdaptateurMemoire } from './adaptateur-memoire'
import { listerBases } from './espace'

describe('listerBases', () => {
  it('ne retient que les dossiers hors configuration', async () => {
    const a = new AdaptateurMemoire({
      '_espace.yaml': 'version: 1\n',
      '_dashboards/pilotage.yaml': '',
      'projets/_schema.yaml': '',
      'taches/_schema.yaml': '',
      '.obsidian/app.json': '',
      'notes.md': '',
    })
    expect(await listerBases(a)).toEqual(['projets', 'taches'])
  })

  it('renvoie une liste vide pour un espace vide', async () => {
    expect(await listerBases(new AdaptateurMemoire())).toEqual([])
  })
})
