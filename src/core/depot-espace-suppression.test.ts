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

describe('supprimer une base', () => {
  const DASHBOARD = { '_dashboards/suivi.yaml': 'nom: Suivi\nrangees:\n  - blocs:\n      - { base: projets, vue: tableau }\n      - { base: taches, vue: tableau }\n' }
  const ESPACE = { '_espace.yaml': 'version: 1\nbarre_laterale:\n  groupes:\n    - { nom: Travail, bases: [projets, taches] }\n  hors_groupe: [clients]\n' }

  it('portée montrée avant : lignes, relations converties, colonnes qui passeront en erreur, blocs de dashboard', async () => {
    const { espace } = await ouvrir(DASHBOARD)
    expect(espace.porteeSuppressionBase('projets')).toEqual({
      lignes: 3,
      relations: ['Clients › Projets', 'Tâches › Projet'],
      dependants: ['Clients › Heures totales'],
      blocs: 1,
    })
  })

  it('les relations vers elle deviennent du texte avec les titres liés, des deux côtés ; aucune donnée perdue', async () => {
    const { a, espace, ecrire } = await ouvrir({ ...DASHBOARD, ...ESPACE, 'projets/_vues/tableau.yaml': 'nom: Tableau\ntype: tableau\n' })
    await espace.supprimerBase('projets')
    await ecrire()
    expect((await a.lister('')).map((e) => e.nom)).not.toContain('projets')
    expect(espace.etat().bases.has('projets')).toBe(false)
    // Côté propriétaire : les ids écrits deviennent des titres ; un id cassé reste tel quel.
    expect(await a.lire('taches/a--t0000001.md')).toContain('projet: Navi\n')
    expect(await a.lire('taches/c--t0000003.md')).toContain('projet: sinam, zzzzzzzz\n')
    // Côté miroir : les liens étaient dans la base supprimée, ils sont recopiés ici.
    expect(await a.lire('clients/acme--c0000001.md')).toContain('projets: Navi, sinam\n')
    expect(await a.lire('clients/globex--c0000002.md')).not.toContain('projets:')
    const schema = await a.lire('taches/_schema.yaml')
    expect(schema).toContain('{ cle: projet, nom: Projet, type: text }')
    expect(await a.lire('_dashboards/suivi.yaml')).not.toContain('base: projets')
    expect(await a.lire('_espace.yaml')).toContain('bases: [ taches ]')
  })

  it('la colonne convertie se relit comme du texte, et le rollup qui en dépendait est en erreur', async () => {
    const { espace } = await ouvrir()
    await espace.supprimerBase('projets')
    const taches = espace.etat().bases.get('taches')!
    expect(taches.chargement.ok && taches.chargement.base.schema.colonnes.find((c) => c.cle === 'projet')?.type).toBe('text')
    expect(espace.etat().calculs.get('clients')!.get('c0000001')!.heures!.etat).not.toBe('ok')
  })
})
