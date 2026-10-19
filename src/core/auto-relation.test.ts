import { describe, expect, it } from 'vitest'
import { avecCalculs, descendants, enfantsDe, sousElements, type Noeud } from './arbre-temps'
import { DepotEspace } from './depot-espace'
import { appliquerVue, correspond, valeursHeritees } from './filtres'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { grouper } from './groupes'
import type { Niveau } from './vue'

// Auto-relation (spec §5) dans ce qui descend ou lit les relations : timeline
// en arbre, rollups, kanban, filtres. A > B > C, et D ↔ E en boucle.

const ctx = { aujourdhui: '2026-09-25' }
const SCHEMA = `${FICHIERS_RELATIONS['taches/_schema.yaml']}  - { cle: parente, nom: Tâche parente, type: relation, cible: taches, proprietaire: true, inverse: sous_taches }
  - { cle: sous_taches, nom: Sous-tâches, type: relation, cible: taches, proprietaire: false, inverse: parente }
  - { cle: heures_sous, nom: Heures des sous-tâches, type: rollup, relation: sous_taches, champ: heures, calcul: somme }
  - { cle: boucle, nom: Boucle, type: rollup, relation: sous_taches, champ: boucle, calcul: somme }
`

async function ouvrir(schema = SCHEMA) {
  const fichiers = {
    ...FICHIERS_RELATIONS,
    'taches/_schema.yaml': schema,
    'taches/b--t0000002.md': '---\nid: t0000002\ntitre: B\nheures: 5\nparente: t0000001\n---\n',
    'taches/c--t0000003.md': '---\nid: t0000003\ntitre: C\nheures: 2\nparente: t0000002\n---\n',
    'taches/d--t0000004.md': '---\nid: t0000004\ntitre: D\nheures: 1\nparente: t0000005\n---\n',
    'taches/e--t0000005.md': '---\nid: t0000005\ntitre: E\nheures: 4\nparente: t0000004\n---\n',
  }
  return DepotEspace.ouvrir(new AdaptateurCompteur(fichiers), { aleatoire, planifier: minuteur().planifier, aujourdhui: () => ctx.aujourdhui })
}

const niveau = (relation: string, reglages: Partial<Niveau> = {}): Niveau => ({ relation, filtres: [], deplier: [], ...reglages })
const texte = (noeuds: Noeud[]) => descendants(noeuds).map((n) => `${'  '.repeat(n.profondeur - 1)}${n.ligne.id}`)
const calcul = (e: DepotEspace, id: string, cle: string) => e.etat().calculs.get('taches')?.get(id)?.[cle]

async function arbre(id: string, niveaux: Niveau[]) {
  const espace = await ouvrir()
  const etat = espace.etat()
  const bases = [...etat.bases.values()].filter((b) => b.depot)
  const src = { schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])), lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])), calculs: etat.calculs }
  const ligne = avecCalculs(src, 'taches', src.lignes.get('taches')!.find((l) => l.id === id)!)
  return enfantsDe(src, 'taches', ligne, niveaux, ctx, `taches:${id}`)
}

describe('auto-relation : timeline en arbre', () => {
  it('descend les sous-tâches niveau par niveau', async () => {
    expect(texte(await arbre('t0000001', [niveau('sous_taches', { deplier: [niveau('sous_taches')] })]))).toEqual(['t0000002', '  t0000003'])
  })

  it('une boucle (D sous E, E sous D) s’arrête sans repasser par la ligne de départ', async () => {
    const profond = niveau('sous_taches', { deplier: [niveau('sous_taches', { deplier: [niveau('sous_taches', { deplier: [niveau('sous_taches')] })] })] })
    expect(texte(await arbre('t0000004', [profond]))).toEqual(['t0000005'])
  })

  it('remonter par le côté propriétaire (la tâche parente) marche aussi', async () => {
    expect(texte(await arbre('t0000003', [niveau('parente', { deplier: [niveau('parente')] })]))).toEqual(['t0000002', '  t0000001'])
  })
})

describe('auto-relation : lignes de la timeline à ne pas répéter en tête', () => {
  async function masquees(niveaux: Niveau[]) {
    const espace = await ouvrir()
    const etat = espace.etat()
    const bases = [...etat.bases.values()].filter((b) => b.depot)
    const src = { schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])), lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])), calculs: etat.calculs }
    const arbres = src.lignes.get('taches')!.map((l) => [l.id, enfantsDe(src, 'taches', avecCalculs(src, 'taches', l), niveaux, ctx, `taches:${l.id}`)] as const)
    return [...sousElements(src.schemas.get('taches')!, arbres)].sort()
  }

  it('les sous-tâches dépliées sous leur parente ne reviennent pas en tête ; une boucle garde sa première ligne', async () => {
    // B sous A, C sous B (deux niveaux), E sous D ; D reste en tête (boucle D ↔ E).
    expect(await masquees([niveau('sous_taches', { deplier: [niveau('sous_taches')] })])).toEqual(['t0000002', 't0000003', 't0000005'])
  })

  it('un seul niveau déplié : seules les sous-tâches directes sont masquées', async () => {
    // C n'est déplié sous personne en tête (B est masquée) : il revient, avec sa sous-tâche affichée sous lui.
    expect(await masquees([niveau('sous_taches')])).toEqual(['t0000002', 't0000005'])
  })

  it('un dépliage vers une autre base ne masque rien, même s’il revient à la base de la vue', async () => {
    expect(await masquees([niveau('projet', { deplier: [niveau('taches')] })])).toEqual([])
  })
})

describe('auto-relation : colonnes calculées', () => {
  it('un rollup sur les sous-tâches se calcule', async () => {
    const espace = await ouvrir()
    expect(calcul(espace, 't0000001', 'heures_sous')).toEqual({ etat: 'ok', valeur: 5 })
    expect(calcul(espace, 't0000002', 'heures_sous')).toEqual({ etat: 'ok', valeur: 2 })
  })

  it('créer un rollup qui se remonterait lui-même par les sous-tâches est refusé à la configuration', async () => {
    const espace = await ouvrir(SCHEMA.replace(/ {2}- \{ cle: boucle.*\n/, ''))
    const cle = await espace.ajouterRollup('taches', 'Total', 'sous_taches', 'heures', 'somme')
    await expect(espace.modifierRollup('taches', cle, { champ: cle })).rejects.toThrow(/boucle/i)
  })

  it('un rollup qui se remonte lui-même écrit à la main est une boucle signalée, pas un calcul sans fin', async () => {
    const espace = await ouvrir()
    expect(calcul(espace, 't0000001', 'boucle')?.etat).toBe('invalide')
  })
})

describe('auto-relation : vues', () => {
  it('kanban groupé par tâche parente : un groupe par parente, titres lus dans la même base', async () => {
    const espace = await ouvrir()
    const etat = espace.etat()
    const schema = etat.bases.get('taches')!.depot!.schema
    const lignes = appliquerVue(etat.bases.get('taches')!.depot!.lignes(), schema, [], [], ctx)
    const groupes = grouper(lignes, schema.colonnes.find((c) => c.cle === 'parente')!, (id) => etat.titres.get('taches')?.get(id) ?? null)
    expect(groupes.map((g) => `${g.libelle}:${g.lignes.length}`).sort()).toEqual(['A:1', 'B:1', 'D:1', 'E:1', 'Sans tâche parente:1'])
  })

  it('filtre « contient » sur la tâche parente, et une ligne créée dans cette vue hérite du lien', async () => {
    const espace = await ouvrir()
    const schema = espace.etat().bases.get('taches')!.depot!.schema
    const filtre = { colonne: 'parente', operateur: 'contient' as const, valeur: 't0000001' }
    expect(espace.etat().bases.get('taches')!.depot!.lignes().filter((l) => correspond(l, schema, filtre, ctx)).map((l) => l.id)).toEqual(['t0000002'])
    expect(valeursHeritees(schema, [filtre])).toEqual({ parente: ['t0000001'] })
  })
})
