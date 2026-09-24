import { describe, expect, it } from 'vitest'
import { barreLaterale, ErreurEspace, lireEspace, modifierEspace, type OperationEspace } from './espace-config'

const TEXTE = `version: 1
barre_laterale:
  dashboards: [pilotage]
  groupes:
    - nom: Travail # le boulot
      bases: [projets, taches, clients]
    - nom: Perso
      bases: [lectures]
  hors_groupe: [inbox]
`

const appliquer = (texte: string | null, ...ops: OperationEspace[]) =>
  lireEspace(ops.reduce<string | null>((t, op) => modifierEspace(t, op), texte))

describe('lireEspace', () => {
  it('lit groupes, hors groupe et dashboards', () => {
    expect(lireEspace(TEXTE)).toEqual({
      dashboards: ['pilotage'],
      groupes: [
        { nom: 'Travail', bases: ['projets', 'taches', 'clients'] },
        { nom: 'Perso', bases: ['lectures'] },
      ],
      horsGroupe: ['inbox'],
    })
  })

  it('tolère un fichier absent, vide ou abîmé', () => {
    const vide = { dashboards: [], groupes: [], horsGroupe: [] }
    expect(lireEspace(null)).toEqual(vide)
    expect(lireEspace('')).toEqual(vide)
    expect(lireEspace('barre_laterale: [')).toEqual(vide)
    expect(lireEspace('barre_laterale:\n  groupes: [{ bases: [x] }, 3]\n')).toEqual(vide)
  })
})

describe('barreLaterale', () => {
  it('écarte les bases absentes du disque et ajoute hors groupe celles non citées', () => {
    expect(barreLaterale(lireEspace(TEXTE), ['projets', 'lectures', 'nouvelle', 'inbox'])).toEqual({
      groupes: [
        { nom: 'Travail', bases: ['projets'] },
        { nom: 'Perso', bases: ['lectures'] },
      ],
      horsGroupe: ['inbox', 'nouvelle'],
    })
  })

  it('ne montre une base citée deux fois qu’à sa première place', () => {
    const config = { dashboards: [], groupes: [{ nom: 'A', bases: ['x'] }], horsGroupe: ['x'] }
    expect(barreLaterale(config, ['x'])).toEqual({ groupes: [{ nom: 'A', bases: ['x'] }], horsGroupe: [] })
  })
})

describe('modifierEspace', () => {
  it('déplace une base d’un groupe à un autre, à la position voulue', () => {
    const c = appliquer(TEXTE, { type: 'placer_base', base: 'taches', groupe: 'Perso', index: 0 })
    expect(c.groupes).toEqual([
      { nom: 'Travail', bases: ['projets', 'clients'] },
      { nom: 'Perso', bases: ['taches', 'lectures'] },
    ])
  })

  it('sort une base de son groupe', () => {
    const c = appliquer(TEXTE, { type: 'placer_base', base: 'lectures', groupe: null })
    expect(c.groupes[1]!.bases).toEqual([])
    expect(c.horsGroupe).toEqual(['inbox', 'lectures'])
  })

  it('garde commentaires et style du reste du fichier', () => {
    const t = modifierEspace(TEXTE, { type: 'placer_base', base: 'inbox', groupe: 'Perso' })
    expect(t).toContain('- nom: Travail # le boulot\n      bases: [ projets, taches, clients ]')
    expect(t).toContain('bases: [ lectures, inbox ]')
  })

  it('ajoute, renomme et supprime un groupe', () => {
    let c = appliquer(TEXTE, { type: 'ajouter_groupe', nom: 'Asso' }, { type: 'renommer_groupe', nom: 'Perso', nouveau: 'Maison' })
    expect(c.groupes.map((g) => g.nom)).toEqual(['Travail', 'Maison', 'Asso'])
    c = appliquer(TEXTE, { type: 'supprimer_groupe', nom: 'Travail' })
    expect(c.groupes.map((g) => g.nom)).toEqual(['Perso'])
    expect(c.horsGroupe).toEqual(['inbox', 'projets', 'taches', 'clients'])
  })

  it('refuse un nom de groupe en double ou un groupe introuvable', () => {
    expect(() => modifierEspace(TEXTE, { type: 'ajouter_groupe', nom: 'Perso' })).toThrow(ErreurEspace)
    expect(() => modifierEspace(TEXTE, { type: 'renommer_groupe', nom: 'Perso', nouveau: 'Travail' })).toThrow(ErreurEspace)
    expect(() => modifierEspace(TEXTE, { type: 'placer_base', base: 'x', groupe: 'Absent' })).toThrow(ErreurEspace)
  })

  it('crée le fichier s’il n’existe pas', () => {
    const c = appliquer(null, { type: 'ajouter_groupe', nom: 'Travail' }, { type: 'placer_base', base: 'projets', groupe: 'Travail' })
    expect(c).toEqual({ dashboards: [], groupes: [{ nom: 'Travail', bases: ['projets'] }], horsGroupe: [] })
  })
})
