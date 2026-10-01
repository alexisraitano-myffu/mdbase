import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { lireEspace } from './espace-config'

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

const calcul = (e: DepotEspace, base: string, id: string, cle: string) => e.etat().calculs.get(base)?.get(id)?.[cle]

describe('dupliquer une base', () => {
  const ESPACE = { '_espace.yaml': 'version: 1\nbarre_laterale:\n  groupes:\n    - { nom: Travail, bases: [projets, taches] }\n  hors_groupe: [clients]\n' }
  const VUE = { 'projets/_vues/tableau.yaml': 'id: tableau\nnom: Tableau\ntype: tableau\n' }

  it('copie lignes et vues, place la copie juste après l’original, schéma écrit en dernier parmi ses fichiers', async () => {
    const { a, espace } = await ouvrir({ ...ESPACE, ...VUE })
    const id = await espace.dupliquerBase('projets')
    expect(id).toBe('projets-copie')
    expect(espace.schema(id).nom).toBe('Projets (copie)')
    expect(await a.lire('projets-copie/navi--p0000001.md')).toBe(await a.lire('projets/navi--p0000001.md').then((t) => t.replace('\n---', '\ntaches: [t0000001, t0000002]\n---')))
    expect(await a.lire('projets-copie/_vues/tableau.yaml')).toBe(VUE['projets/_vues/tableau.yaml'])
    const copies = a.ecritures.filter((e) => e.startsWith('projets-copie/'))
    expect(copies.indexOf('projets-copie/_schema.yaml')).toBeGreaterThan(copies.indexOf('projets-copie/_vues/tableau.yaml'))
    expect(lireEspace(await a.lire('_espace.yaml')).groupes[0]!.bases).toEqual(['projets', 'projets-copie', 'taches'])
  })

  it('chaque relation de la copie a sa propre colonne miroir ; l’original ne change pas', async () => {
    const { espace, ecrire } = await ouvrir()
    const id = await espace.dupliquerBase('projets')
    await ecrire()
    const relations = espace.schema(id).colonnes.filter((c) => c.type === 'relation')
    expect(relations.map((c) => [c.cle, c.cible, c.type === 'relation' && c.proprietaire, c.type === 'relation' && c.inverse])).toEqual([
      ['client', 'clients', true, 'projets_copie'],
      ['taches', 'taches', true, 'projets_copie'],
    ])
    expect(espace.schema('clients').colonnes.find((c) => c.cle === 'projets_copie')).toMatchObject({ type: 'relation', cible: id, proprietaire: false, inverse: 'client' })
    expect(espace.schema('taches').colonnes.find((c) => c.cle === 'projets_copie')).toMatchObject({ type: 'relation', cible: id, proprietaire: false, inverse: 'taches' })

    // Les liens d'un côté calculé sont écrits dans la copie ; les rollups suivent.
    expect(calcul(espace, id, 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 8 })
    expect(calcul(espace, 'taches', 't0000003', 'projets_copie')).toEqual({ etat: 'ok', valeur: ['p0000002'] })
    expect(calcul(espace, 'clients', 'c0000001', 'projets_copie')).toEqual({ etat: 'ok', valeur: ['p0000001', 'p0000002'] })
    expect(calcul(espace, 'clients', 'c0000001', 'projets')).toEqual({ etat: 'ok', valeur: ['p0000001', 'p0000002'] })
    expect(calcul(espace, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 8 })
  })

  it('deux copies ne se marchent pas dessus', async () => {
    const { espace } = await ouvrir()
    await espace.dupliquerBase('projets')
    expect(await espace.dupliquerBase('projets')).toBe('projets-copie-2')
    expect(espace.schema('clients').colonnes.map((c) => c.cle)).toEqual(['nom', 'projets', 'heures', 'projets_copie', 'projets_copie_2'])
  })
})

describe('dashboards : dupliquer, réordonner', () => {
  const DASHBOARDS = {
    '_espace.yaml': 'version: 1\nbarre_laterale:\n  dashboards: [suivi, pilotage]\n',
    '_dashboards/suivi.yaml': 'id: suivi\nnom: Suivi\nrangees:\n  - blocs:\n      - { base: projets, vue: tableau } # gardé\n',
    '_dashboards/pilotage.yaml': 'id: pilotage\nnom: Pilotage\nrangees: []\n',
  }

  it('dupliquer copie le fichier tel quel sous un autre id et le place juste après', async () => {
    const { a, espace } = await ouvrir(DASHBOARDS)
    expect(await espace.dupliquerDashboard('suivi')).toBe('suivi-copie')
    expect(await a.lire('_dashboards/suivi-copie.yaml')).toBe(DASHBOARDS['_dashboards/suivi.yaml'].replace('id: suivi\nnom: Suivi', 'id: suivi-copie\nnom: Suivi (copie)'))
    expect(espace.etat().dashboards.map((d) => d.id)).toEqual(['suivi', 'suivi-copie', 'pilotage'])
  })

  it('déplacer ne réécrit que _espace.yaml, et compte aussi les dashboards qu’il ne citait pas', async () => {
    const { a, espace } = await ouvrir({ ...DASHBOARDS, '_dashboards/aaa.yaml': 'nom: AAA\n' })
    await espace.deplacerDashboard('aaa', 0)
    expect(a.ecritures).toEqual(['_espace.yaml'])
    expect(espace.etat().dashboards.map((d) => d.id)).toEqual(['aaa', 'suivi', 'pilotage'])
    await espace.deplacerDashboard('suivi', 2)
    expect(lireEspace(await a.lire('_espace.yaml')).dashboards).toEqual(['aaa', 'pilotage', 'suivi'])
  })
})
