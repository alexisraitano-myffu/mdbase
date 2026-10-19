import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { calculerCharge, couvrirBesoins, estOuvre, etatCase, feriesFrance, ouvresDeLaSemaine, paques, semaines, type ReglagesCharge } from './charge'

const ligne = (id: string, champs: Record<string, unknown>): LigneChargee => ({
  id,
  chemin: `${id}.md`,
  cellules: Object.fromEntries(Object.entries(champs).map(([k, v]) => [k, { etat: 'ok', valeur: v as never }])),
  inconnus: [],
  corps: '',
  source: '',
  date: 0,
})

const R: ReglagesCharge = {
  capacite: 'capacite',
  groupe: 'role',
  affectations: { base: 'affectations', ressource: 'ressource', projet: 'projet', debut: 'debut', fin: 'fin', jours: 'jours' },
  absences: { base: 'absences', ressource: 'ressource', debut: 'debut', fin: 'fin' },
  besoins: { base: 'besoins', projet: 'projet', role: 'role', jours: 'jours', avant: 'avant' },
}

const RESSOURCES = [ligne('alice', { role: 'Dev', capacite: 5 }), ligne('bob', { role: 'Dev', capacite: 4 }), ligne('carla', { role: 'Test' })]

describe('calendrier', () => {
  it('Pâques et les fériés mobiles', () => {
    expect(paques(2026)).toBe('2026-04-05')
    expect(paques(2027)).toBe('2027-03-28')
    expect([...feriesFrance(2026)]).toEqual(expect.arrayContaining(['2026-04-06', '2026-05-14', '2026-05-25', '2026-11-11']))
  })

  it('jours ouvrés : week-end et fériés retirés, sauf « aucun »', () => {
    expect(estOuvre('2026-10-24')).toBe(false) // samedi
    expect(ouvresDeLaSemaine('2026-11-09')).toHaveLength(4) // 11 novembre
    expect(ouvresDeLaSemaine('2026-11-09', 'aucun')).toHaveLength(5)
  })

  it('semaines : n lundis à partir de la semaine du jour', () => {
    expect(semaines('2026-10-21', 3)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02'])
  })
})

describe('charge par ressource', () => {
  const lundis = ['2026-10-19', '2026-10-26', '2026-11-09']

  it('une affectation pèse ses jours par semaine × la part de semaine couverte', () => {
    const aff = [
      ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-11-30', jours: 3 }),
      ligne('a2', { ressource: 'alice', projet: 'p2', debut: '2026-10-21', fin: '2026-10-23', jours: 5 }), // 3 jours sur 5
    ]
    const c = calculerCharge(R, RESSOURCES, aff, [], lundis).get('alice')!
    expect(c[0]).toMatchObject({ ouvres: 5, capacite: 5, charge: 6, parProjet: { p1: 3, p2: 3 }, affectations: ['a1', 'a2'] })
    expect(etatCase(c[0]!)).toBe('surchargee')
    expect(c[1]).toMatchObject({ charge: 3 })
    expect(etatCase(c[1]!)).toBe('libre')
  })

  it('un férié réduit la capacité et la charge d’autant : un plein temps reste à plein', () => {
    const aff = [ligne('a1', { ressource: 'bob', projet: 'p1', debut: '2026-11-01', fin: '2026-11-30', jours: 4 })]
    const c = calculerCharge(R, RESSOURCES, aff, [], lundis).get('bob')![2]!
    expect(c).toMatchObject({ ouvres: 4, capacite: 3.2, charge: 3.2 })
    expect(etatCase(c)).toBe('pleine')
  })

  it('une absence réduit la capacité, sans toucher la charge ; une semaine entière est « absente »', () => {
    const abs = [ligne('x1', { ressource: 'alice', debut: '2026-10-26', fin: '2026-10-30' }), ligne('x2', { ressource: 'alice', debut: '2026-10-19', fin: '2026-10-20' })]
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-30', jours: 3 })]
    const c = calculerCharge(R, RESSOURCES, aff, abs, lundis).get('alice')!
    expect(c[0]).toMatchObject({ absence: 2, capacite: 3, charge: 3 })
    expect(etatCase(c[0]!)).toBe('pleine')
    expect(etatCase(c[1]!)).toBe('absente')
  })

  it('capacité 5 par défaut ; sans affectation, une case est vide', () => {
    const c = calculerCharge(R, RESSOURCES, [], [], lundis).get('carla')![0]!
    expect(c.capacite).toBe(5)
    expect(etatCase(c)).toBe('vide')
  })
})

describe('couverture des besoins', () => {
  it('jours affectés au projet par le rôle, jusqu’à la date du besoin', () => {
    const aff = [
      ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-11-30', jours: 5 }),
      ligne('a2', { ressource: 'carla', projet: 'p1', debut: '2026-10-19', fin: '2026-10-30', jours: 5 }), // autre rôle
      ligne('a3', { ressource: 'bob', projet: 'p2', debut: '2026-10-19', fin: '2026-10-30', jours: 5 }), // autre projet
    ]
    const besoins = [ligne('b1', { projet: 'p1', role: 'Dev', jours: 20, avant: '2026-10-30' }), ligne('b2', { projet: 'p1', role: 'Test', jours: 5 })]
    expect(couvrirBesoins(R, RESSOURCES, aff, besoins)).toEqual([
      { besoin: 'b1', projet: 'p1', role: 'Dev', avant: '2026-10-30', demandes: 20, affectes: 10 },
      { besoin: 'b2', projet: 'p1', role: 'Test', avant: null, demandes: 5, affectes: 10 },
    ])
  })
})
