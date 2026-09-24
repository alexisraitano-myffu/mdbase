import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir() {
  const a = new AdaptateurCompteur(FICHIERS_RELATIONS)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  return { a, espace }
}

const trouves = (e: DepotEspace, q: string) => e.chercher(q).map((r) => `${r.base}/${r.ligne}`)

describe('recherche globale dans un espace', () => {
  it('indexe toutes les bases à l’ouverture et suit chaque modification', async () => {
    const { espace } = await ouvrir()
    const taches = espace.etat().bases.get('taches')!.depot!
    const [t] = taches.lignes()
    expect(espace.chercher('zanzibar')).toEqual([])

    taches.modifier(t!.chemin, 'titre', 'Voyage à Zanzibar')
    expect(trouves(espace, 'zanzibar')).toEqual([`taches/${t!.id}`])

    taches.modifierCorps(t!.chemin, '\nPrévoir la crème solaire.\n')
    const [r] = espace.chercher('creme')
    expect(r).toMatchObject({ base: 'taches', ligne: t!.id, titre: 'Voyage à Zanzibar' })
    expect(r!.extrait.slice(...r!.surlignages[0]!)).toBe('crème')

    const nouvelle = await espace.etat().bases.get('projets')!.depot!.creer({ titre: 'Zanzibar 2027' })
    expect(trouves(espace, 'zanzibar')).toEqual(expect.arrayContaining([`projets/${nouvelle.id}`, `taches/${t!.id}`]))
  })
})
