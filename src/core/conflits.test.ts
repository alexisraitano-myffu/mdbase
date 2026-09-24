import { describe, expect, it } from 'vitest'
import { copieDeConflit } from './conflits'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { changerIdentifiant } from './ligne'

describe('copieDeConflit', () => {
  const noms = new Set(['tableau.yaml', 'tableau-2.yaml', 'tableau-DESKTOP-AB12.yaml', '_schema.yaml', 'navi--p0000001.md'])
  it('reconnaît le suffixe de machine OneDrive, même avec des tirets', () => {
    expect(copieDeConflit('tableau-DESKTOP-AB12.yaml', noms)).toBe('tableau.yaml')
    expect(copieDeConflit('_schema-PC-Alex.yaml', noms)).toBe('_schema.yaml')
    expect(copieDeConflit('navi--p0000001-LAPTOP.md', noms)).toBe('navi--p0000001.md')
  })
  it('ignore les noms fabriqués par l’app et les copies sans original', () => {
    expect(copieDeConflit('tableau-2.yaml', noms)).toBeNull()
    expect(copieDeConflit('tableau.yaml', noms)).toBeNull()
    expect(copieDeConflit('kanban-DESKTOP.yaml', noms)).toBeNull()
  })
})

it('changerIdentifiant ne touche qu’à l’id', () => {
  const source = '---\nid: p0000001 # stable\ntitre: Navi\ninconnu: garde\n---\nCorps\n'
  expect(changerIdentifiant(source, 'n0000009')).toBe('---\nid: n0000009 # stable\ntitre: Navi\ninconnu: garde\n---\nCorps\n')
})

const COPIE = '---\nid: p0000001\ntitre: Navi (autre PC)\nclient: c0000002\n---\nNotes du portable\n'

async function ouvrir(extra: Record<string, string>) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...extra })
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  return { a, espace }
}

describe('ids en double', () => {
  it('les deux lignes sont affichées et signalées', async () => {
    const { espace } = await ouvrir({ 'projets/navi--p0000001-DESKTOP-AB12.md': COPIE })
    const d = espace.etat().doublons.get('projets')!.get('p0000001')!
    expect(d.map((l) => l.chemin)).toEqual(['projets/navi--p0000001-DESKTOP-AB12.md', 'projets/navi--p0000001.md'])
    expect(espace.etat().bases.get('projets')!.depot!.lignes()).toHaveLength(4)
  })

  it('garder une version supprime les autres fichiers du même id, et le signalement disparaît', async () => {
    const { a, espace } = await ouvrir({ 'projets/navi--p0000001-DESKTOP-AB12.md': COPIE })
    await espace.etat().bases.get('projets')!.depot!.garderVersion('projets/navi--p0000001.md')
    expect(a.ecritures).toEqual(['✗ projets/navi--p0000001-DESKTOP-AB12.md'])
    expect(espace.etat().doublons.size).toBe(0)
  })

  it('séparer donne un nouvel id et un nouveau nom à la copie ; les liens restent sur l’autre', async () => {
    const { a, espace } = await ouvrir({ 'projets/navi--p0000001-DESKTOP-AB12.md': COPIE })
    const id = await espace.etat().bases.get('projets')!.depot!.separer('projets/navi--p0000001-DESKTOP-AB12.md')
    const nouveau = `projets/navi-autre-pc--${id}.md`
    expect(a.ecritures).toEqual([nouveau, '✗ projets/navi--p0000001-DESKTOP-AB12.md'])
    expect(await a.lire(nouveau)).toBe(COPIE.replace('p0000001', id))
    expect(espace.etat().doublons.size).toBe(0)
    // La tâche liée à p0000001 pointe toujours vers le fichier d'origine.
    expect(espace.etat().titres.get('projets')!.get('p0000001')).toBe('Navi')
  })

  it('un doublon apparu par la synchro est vu à la relecture', async () => {
    const { a, espace } = await ouvrir({})
    await a.ecrire('projets/navi--p0000001-LAPTOP.md', COPIE)
    await espace.rafraichir()
    expect([...espace.etat().doublons.get('projets')!.keys()]).toEqual(['p0000001'])
  })
})

describe('copies de conflit de configuration', () => {
  const VUE = 'nom: Tableau\ntype: tableau\n'
  const VUE_COPIE = 'nom: Tableau du portable\ntype: tableau\n'

  it('sont signalées et jamais chargées', async () => {
    const { espace } = await ouvrir({ 'taches/_vues/tableau.yaml': VUE, 'taches/_vues/tableau-DESKTOP-AB12.yaml': VUE_COPIE, 'taches/_schema-DESKTOP-AB12.yaml': 'nom: x\n' })
    expect(espace.etat().bases.get('taches')!.vues.map((v) => v.nom)).toEqual(['Tableau'])
    expect(espace.etat().copiesConflit).toEqual([
      { chemin: 'taches/_schema-DESKTOP-AB12.yaml', original: 'taches/_schema.yaml' },
      { chemin: 'taches/_vues/tableau-DESKTOP-AB12.yaml', original: 'taches/_vues/tableau.yaml' },
    ])
  })

  it('garder la copie remplace l’original ; garder l’original supprime la copie', async () => {
    const { a, espace } = await ouvrir({ 'taches/_vues/tableau.yaml': VUE, 'taches/_vues/tableau-DESKTOP-AB12.yaml': VUE_COPIE, 'taches/_schema-PC.yaml': 'nom: x\n' })
    expect(await espace.lireCopieConflit('taches/_vues/tableau-DESKTOP-AB12.yaml')).toEqual({ original: VUE, copie: VUE_COPIE })

    await espace.resoudreCopieConflit('taches/_vues/tableau-DESKTOP-AB12.yaml', 'copie')
    expect(await a.lire('taches/_vues/tableau.yaml')).toBe(VUE_COPIE)
    expect(espace.etat().bases.get('taches')!.vues.map((v) => v.nom)).toEqual(['Tableau du portable'])

    await espace.resoudreCopieConflit('taches/_schema-PC.yaml', 'original')
    expect(a.ecritures.at(-1)).toBe('✗ taches/_schema-PC.yaml')
    expect(espace.etat().copiesConflit).toEqual([])
  })
})
