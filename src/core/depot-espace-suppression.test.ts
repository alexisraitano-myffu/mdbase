import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir(extra: Record<string, string> = {}) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...extra })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire }
}

describe('supprimer une ligne', () => {
  it('sans nettoyage : seul son fichier disparaît, les liens vers elle deviennent cassés et restent dans les fichiers', async () => {
    const { a, espace, ecrire } = await ouvrir()
    expect(espace.liensVers('projets', 'p0000001').map((l) => l.chemin)).toEqual(['taches/a--t0000001.md', 'taches/b--t0000002.md'])
    await espace.supprimerLigne('projets', 'projets/navi--p0000001.md', false)
    await ecrire()
    expect(a.ecritures).toEqual(['✗ projets/navi--p0000001.md'])
    expect(espace.etat().titres.get('projets')!.has('p0000001')).toBe(false)
    expect(espace.liensCasses('taches', 'projet').map((x) => [x.chemin, x.ids])).toEqual([
      ['taches/a--t0000001.md', ['p0000001']],
      ['taches/b--t0000002.md', ['p0000001']],
      ['taches/c--t0000003.md', ['zzzzzzzz']],
    ])
  })

  it('avec nettoyage : les liens vers elle sont retirés des fichiers qui les portent, rien d’autre', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.supprimerLigne('projets', 'projets/navi--p0000001.md', true)
    await ecrire()
    expect(a.ecritures.sort()).toEqual(['taches/a--t0000001.md', 'taches/b--t0000002.md', '✗ projets/navi--p0000001.md'])
    expect(await a.lire('taches/a--t0000001.md')).not.toContain('projet:')
    expect(espace.liensCasses('taches', 'projet').map((x) => x.chemin)).toEqual(['taches/c--t0000003.md'])
  })

  it('une modification en attente sur la ligne supprimée n’est jamais écrite', async () => {
    const { a, espace, ecrire } = await ouvrir()
    espace.etat().bases.get('taches')!.depot!.modifier('taches/a--t0000001.md', 'heures', 10)
    await espace.supprimerLigne('taches', 'taches/a--t0000001.md', false)
    await ecrire()
    expect(a.ecritures).toEqual(['✗ taches/a--t0000001.md'])
    expect(await a.lister('taches').then((es) => es.map((e) => e.nom))).not.toContain('a--t0000001.md')
  })

  it('le nettoyage ne touche à rien si un autre fichier porte le même id', async () => {
    const { a, espace, ecrire } = await ouvrir({ 'projets/navi--p0000001-PC.md': '---\nid: p0000001\ntitre: Navi\n---\n' })
    await espace.supprimerLigne('projets', 'projets/navi--p0000001-PC.md', true)
    await ecrire()
    expect(a.ecritures).toEqual(['✗ projets/navi--p0000001-PC.md'])
  })
})

it('nettoyer les liens cassés d’une relation ne retire que les ids introuvables', async () => {
  const { a, espace, ecrire } = await ouvrir()
  expect(espace.nettoyerLiensCasses('taches', 'projet')).toBe(1)
  await ecrire()
  expect(a.ecritures).toEqual(['taches/c--t0000003.md'])
  expect(await a.lire('taches/c--t0000003.md')).toContain('projet: p0000002\n')
  expect(espace.liensCasses('taches', 'projet')).toEqual([])
})
