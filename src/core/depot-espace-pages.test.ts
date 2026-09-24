import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { ErreurSchema } from './schema-ecriture'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  return { a, espace }
}
const pages = (e: DepotEspace, base: string) => e.etat().bases.get(base)!.pages

describe('mises en page', () => {
  it('donne une mise en page implicite, sans fichier', async () => {
    const { a, espace } = await ouvrir()
    expect(pages(espace, 'projets')).toEqual([expect.objectContaining({ id: 'defaut', defaut: true, implicite: true })])
    expect(a.ecritures).toEqual([])
  })

  it('écrit la mise en page implicite à sa première modification, sans toucher aux lignes', async () => {
    const { a, espace } = await ouvrir()
    await espace.modifierMiseEnPage('projets', 'defaut', { champs: [{ cle: 'heures', affichage: 'masque' }] })
    expect(a.ecritures).toEqual(['projets/_pages/defaut.yaml'])
    expect(pages(espace, 'projets')[0]).toMatchObject({ implicite: undefined, champs: [{ cle: 'heures', affichage: 'masque' }] })
  })

  it('crée une mise en page à partir d’une autre, et en change la mise en page par défaut', async () => {
    const { a, espace } = await ouvrir()
    await espace.modifierMiseEnPage('projets', 'defaut', { onglets: [{ type: 'corps' }] })
    const id = await espace.creerMiseEnPage('projets', 'Suivi', 'defaut')
    expect(pages(espace, 'projets').find((p) => p.id === id)).toMatchObject({ nom: 'Suivi', defaut: false, onglets: [{ type: 'corps' }] })
    await espace.modifierMiseEnPage('projets', id, { defaut: true })
    expect(pages(espace, 'projets').map((p) => [p.id, p.defaut])).toEqual([
      ['defaut', false],
      [id, true],
    ])
    expect(await a.lire('projets/_pages/defaut.yaml')).toContain('defaut: false')
    expect(await a.lire(`projets/_pages/${id}.yaml`)).toContain('defaut: true')
  })

  it('écrit la mise en page implicite quand on en crée une autre', async () => {
    const { a, espace } = await ouvrir()
    await espace.creerMiseEnPage('projets', 'Suivi')
    expect(a.ecritures.sort()).toEqual(['projets/_pages/defaut.yaml', 'projets/_pages/suivi.yaml'])
  })

  it('supprime une mise en page, jamais la dernière', async () => {
    const { espace } = await ouvrir()
    const id = await espace.creerMiseEnPage('projets', 'Suivi')
    await espace.supprimerMiseEnPage('projets', id)
    expect(pages(espace, 'projets').map((p) => p.id)).toEqual(['defaut'])
    await expect(espace.supprimerMiseEnPage('projets', 'defaut')).rejects.toThrow(ErreurSchema)
  })

  it('une vue retient la mise en page à utiliser pour ouvrir ses lignes', async () => {
    const { a, espace } = await ouvrir()
    const id = await espace.creerMiseEnPage('projets', 'Suivi')
    await espace.modifierVue('projets', 'tableau', { miseEnPage: id })
    expect(await a.lire('projets/_vues/tableau.yaml')).toContain(`mise_en_page: ${id}`)
    expect(espace.etat().bases.get('projets')!.vues[0]!.miseEnPage).toBe(id)
  })

  it('charge les mises en page existantes', async () => {
    const { espace } = await ouvrir({ ...FICHIERS_RELATIONS, 'projets/_pages/suivi.yaml': 'nom: Suivi\ndefaut: true\nonglets:\n  - type: corps\n' })
    expect(pages(espace, 'projets')).toEqual([{ id: 'suivi', nom: 'Suivi', defaut: true, champs: [], onglets: [{ type: 'corps' }] }])
  })
})
