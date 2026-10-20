import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { ajusterDetail, ajusterSurPeriode, besoinsAPlacer, calculerCharge, confirmerScenario, fenetreBesoin, ecrireDetail, ligneApercu, lireDetail, nomNiveau, remplir, couvrirBesoins, decalerPeriode, empiler, estOuvre, etatCase, feriesFrance, ouvresDeLaSemaine, paques, periodes, semaines, type ReglagesCharge } from './charge'

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
  affectations: { base: 'affectations', ressource: 'ressource', projet: 'projet', debut: 'debut', fin: 'fin', jours: 'jours', total: 'total', version: 'version', detail: 'detail', scenario: 'scenario' },
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

  it('périodes : jours du lundi au vendredi, semaines, mois ; décaler d’une période', () => {
    expect(periodes('jour', '2026-10-23', 3).map((p) => p.debut)).toEqual(['2026-10-23', '2026-10-26', '2026-10-27'])
    expect(periodes('jour', '2026-10-24', 1)[0]!.debut).toBe('2026-10-26') // un samedi : le lundi suivant
    expect(periodes('semaine', '2026-10-21', 1)).toEqual([{ debut: '2026-10-19', fin: '2026-10-23' }])
    expect(periodes('mois', '2026-12-15', 2)).toEqual([
      { debut: '2026-12-01', fin: '2026-12-31' },
      { debut: '2027-01-01', fin: '2027-01-31' },
    ])
    expect(decalerPeriode('jour', '2026-10-23', 1)).toBe('2026-10-26')
    expect(decalerPeriode('jour', '2026-10-26', -1)).toBe('2026-10-23')
    expect(decalerPeriode('mois', '2026-10-19', -1)).toBe('2026-09-01')
  })
})

describe('charge par ressource', () => {
  const lundis = ['2026-10-19', '2026-10-26', '2026-11-09'].map((l) => periodes('semaine', l, 1)[0]!)

  it('une affectation pèse ses jours par semaine × la part de semaine couverte', () => {
    const aff = [
      ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-11-30', jours: 3 }),
      ligne('a2', { ressource: 'alice', projet: 'p2', debut: '2026-10-21', fin: '2026-10-23', jours: 5 }), // 3 jours sur 5
    ]
    const c = calculerCharge(R, RESSOURCES, aff, [], lundis).get('alice')!
    expect(c[0]).toMatchObject({ ouvres: 5, capacite: 5, charge: 6, parProjet: { p1: 3, p2: 3 }, affectations: ['a1', 'a2'], parAffectation: { a1: 3, a2: 3 } })
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

describe('jour, mois, total et graphique', () => {
  it('à la journée : capacité d’un jour, un férié est fermé, une absence un jour', () => {
    const jours = periodes('jour', '2026-11-10', 3) // mar. 10, mer. 11 (férié), jeu. 12
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-11-01', fin: '2026-11-30', jours: 5 })]
    const abs = [ligne('x1', { ressource: 'alice', debut: '2026-11-12', fin: '2026-11-12' })]
    const c = calculerCharge(R, RESSOURCES, aff, abs, jours).get('alice')!
    expect(c.map((x) => [x.capacite, x.charge])).toEqual([[1, 1], [0, 0], [0, 1]])
    expect(c.map(etatCase)).toEqual(['pleine', 'fermee', 'absente'])
  })

  it('un total se répartit sur les jours ouvrés de sa période, et l’emporte sur les jours par semaine', () => {
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-30', total: 4, jours: 5 })]
    const c = calculerCharge(R, RESSOURCES, aff, [], periodes('semaine', '2026-10-19', 2)).get('alice')!
    expect(c.map((x) => x.charge)).toEqual([2, 2])
  })

  it('au mois : les jours ouvrés du mois, fériés retirés', () => {
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-11-01', fin: '2026-11-30', jours: 5 })]
    const [nov] = calculerCharge(R, RESSOURCES, aff, [], periodes('mois', '2026-11-01', 1)).get('alice')!
    expect(nov).toMatchObject({ ouvres: 20, capacite: 20, charge: 20 }) // 21 jours de semaine, moins le 11 novembre (le 1er tombe un dimanche)
  })

  it('empiler : charge par projet ou par version, et capacité totale des ressources choisies', () => {
    const aff = [
      ligne('a1', { ressource: 'alice', projet: 'p1', version: 'v1', debut: '2026-10-19', fin: '2026-10-23', jours: 3 }),
      ligne('a2', { ressource: 'bob', projet: 'p2', debut: '2026-10-19', fin: '2026-10-23', jours: 2 }),
      ligne('a3', { ressource: 'carla', projet: 'p1', version: 'v2', debut: '2026-10-19', fin: '2026-10-23', jours: 1 }),
    ]
    const cases = calculerCharge(R, RESSOURCES, aff, [], periodes('semaine', '2026-10-19', 1))
    expect(empiler(cases, ['alice', 'bob', 'carla'], 1, 'projet')).toEqual([{ parts: { p1: 4, p2: 2 }, provisoires: {}, capacite: 14 }])
    expect(empiler(cases, ['alice', 'bob', 'carla'], 1, 'version')).toEqual([{ parts: { v1: 3, '@p2': 2, v2: 1 }, provisoires: {}, capacite: 14 }])
    expect(empiler(cases, ['alice', 'bob'], 1, 'projet')).toEqual([{ parts: { p1: 3, p2: 2 }, provisoires: {}, capacite: 9 }])
  })
})

describe('ajuster une case', () => {
  const lundi = { debut: '2026-10-19', fin: '2026-10-19' }

  it('un jour au milieu : avant, le jour ramené au total, après', () => {
    const aff = ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-12', fin: '2026-10-30', jours: 5 })
    expect(ajusterSurPeriode(R, aff, lundi, 0.5)).toEqual([
      { debut: '2026-10-12', fin: '2026-10-18', jours: 5 },
      { debut: '2026-10-19', fin: '2026-10-19', total: 0.5 },
      { debut: '2026-10-20', fin: '2026-10-30', jours: 5 },
    ])
  })

  it('au total : les bords gardent leur charge par jour ; sans colonne de total, le milieu passe en jours par semaine', () => {
    const aff = ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', total: 5 })
    expect(ajusterSurPeriode(R, aff, lundi, 0)).toEqual([{ debut: '2026-10-20', fin: '2026-10-23', total: 4 }])
    const sansTotal = { ...R, affectations: { ...R.affectations!, total: undefined } }
    const aff2 = ligne('a2', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 5 })
    expect(ajusterSurPeriode(sansTotal, aff2, periodes('semaine', '2026-10-19', 1)[0]!, 2)).toEqual([{ debut: '2026-10-19', fin: '2026-10-23', jours: 2 }])
  })

  it('à 0 sur toute sa plage, plus rien ; hors de sa plage ou un jour férié, rien à faire', () => {
    const aff = ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-19', jours: 5 })
    expect(ajusterSurPeriode(R, aff, lundi, 0)).toEqual([])
    expect(ajusterSurPeriode(R, aff, { debut: '2026-10-20', fin: '2026-10-20' }, 1)).toBeNull()
    const nov = ligne('a2', { ressource: 'alice', projet: 'p1', debut: '2026-11-01', fin: '2026-11-30', jours: 5 })
    expect(ajusterSurPeriode(R, nov, { debut: '2026-11-11', fin: '2026-11-11' }, 1)).toBeNull()
  })
})

describe('détail jour par jour', () => {
  const semaine = periodes('jour', '2026-10-19', 5)

  it('se lit et s’écrit une ligne par jour ; une ligne illisible est gardée', () => {
    expect([...lireDetail('2026-10-20: 0,5\nn’importe quoi\n2026-10-19 = 0')]).toEqual([['2026-10-20', 0.5], ['2026-10-19', 0]])
    expect(ecrireDetail(new Map([['2026-10-21', 0.25], ['2026-10-19', 1]]), 'à garder\n2026-10-01: 3')).toBe('à garder\n2026-10-19: 1\n2026-10-21: 0.25')
    expect(ecrireDetail(new Map())).toBeUndefined()
  })

  it('un jour du détail pèse sa valeur à la place de la règle ; hors plage ou non ouvré, ignoré ; la case est repérée', () => {
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-22', jours: 5, detail: '2026-10-20: 0.5\n2026-10-24: 1\n2026-10-23: 1' })]
    const c = calculerCharge(R, RESSOURCES, aff, [], semaine).get('alice')!
    expect(c.map((x) => x.charge)).toEqual([1, 0.5, 1, 1, 0])
    expect(c.map((x) => x.ajustee)).toEqual([false, true, false, false, false])
    const sem = calculerCharge(R, RESSOURCES, aff, [], periodes('semaine', '2026-10-19', 1)).get('alice')![0]!
    expect(sem).toMatchObject({ charge: 3.5, ajustee: true })
  })

  it('ajuster une période écrit le détail réparti ; revenir à la charge habituelle le retire', () => {
    const aff = ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-12', fin: '2026-10-30', jours: 5, detail: '2026-10-27: 0' })
    expect(ajusterDetail(R, aff, semaine[0]!, 0.5)).toBe('2026-10-19: 0.5\n2026-10-27: 0')
    expect(ajusterDetail(R, aff, periodes('semaine', '2026-10-19', 1)[0]!, 2)).toBe('2026-10-19: 0.4\n2026-10-20: 0.4\n2026-10-21: 0.4\n2026-10-22: 0.4\n2026-10-23: 0.4\n2026-10-27: 0')
    expect(ajusterDetail(R, aff, { debut: '2026-10-27', fin: '2026-10-27' }, 1)).toBeUndefined()
    expect(ajusterDetail(R, aff, { debut: '2026-10-27', fin: '2026-10-27' }, null)).toBeUndefined()
    expect(ajusterDetail(R, aff, { debut: '2026-11-02', fin: '2026-11-02' }, 1)).toBeNull()
  })
})

describe('scénarios', () => {
  const sem = periodes('semaine', '2026-10-19', 1)
  const aff = [
    ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 2 }),
    ligne('a2', { ressource: 'alice', projet: 'p2', debut: '2026-10-19', fin: '2026-10-23', jours: 3, scenario: 'Option A' }),
    ligne('a3', { ressource: 'alice', projet: 'p3', debut: '2026-10-19', fin: '2026-10-23', jours: 1, scenario: 'Option B' }),
  ]

  it('le plan réel seul, ou avec le scénario affiché, compté comme provisoire', () => {
    expect(calculerCharge(R, RESSOURCES, aff, [], sem).get('alice')![0]).toMatchObject({ charge: 2, provisoire: 0 })
    const a = calculerCharge(R, RESSOURCES, aff, [], sem, { scenario: 'Option A' }).get('alice')![0]!
    expect(a).toMatchObject({ charge: 5, provisoire: 3, provisoireParProjet: { p2: 3 } })
    expect(empiler(new Map([['alice', [a]]]), ['alice'], 1, 'projet')[0]).toEqual({ parts: { p1: 2, p2: 3 }, provisoires: { p2: 3 }, capacite: 5 })
  })

  it('un aperçu compte comme provisoire, quel que soit le scénario', () => {
    const apercu = [ligneApercu('x', { ressource: ['bob'], projet: ['p9'], debut: '2026-10-19', fin: '2026-10-23', jours: 1 })]
    expect(calculerCharge(R, RESSOURCES, aff, [], sem, { apercu }).get('bob')![0]).toMatchObject({ charge: 1, provisoire: 1 })
  })
})

describe('un scénario qui remplace une affectation réelle', () => {
  const S = { ...R, affectations: { ...R.affectations!, remplace: 'remplace' } }
  const sem = periodes('semaine', '2026-10-19', 1)
  const aff = [
    ligne('a1', { titre: 'Alice sur p1', ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 5 }),
    ligne('c1', { titre: 'Alice sur p1', ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 2, scenario: 'Option A', remplace: 'a1' }),
    ligne('b1', { ressource: 'bob', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 4 }),
    ligne('c2', { ressource: 'bob', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 0, scenario: 'Option A', remplace: 'b1' }),
  ]

  it('la copie masque l’originale quand le scénario est affiché ; une copie à 0 retire la ressource ; le plan réel ne bouge pas', () => {
    expect(calculerCharge(S, RESSOURCES, aff, [], sem).get('alice')![0]).toMatchObject({ charge: 5, affectations: ['a1'] })
    const essai = calculerCharge(S, RESSOURCES, aff, [], sem, { scenario: 'Option A' })
    expect(essai.get('alice')![0]).toMatchObject({ charge: 2, provisoire: 2, affectations: ['c1'] })
    expect(essai.get('bob')![0]).toMatchObject({ charge: 0 })
  })

  it('confirmer : chaque copie se recopie sur son originale puis disparaît ; les autres deviennent réelles', () => {
    const avecNouvelle = [...aff, ligne('n1', { ressource: 'carla', projet: 'p2', debut: '2026-10-19', fin: '2026-10-23', jours: 1, scenario: 'Option A' })]
    const plan = confirmerScenario(S, avecNouvelle, 'Option A', ['titre', 'ressource', 'projet', 'debut', 'fin', 'jours', 'total', 'detail', 'scenario', 'remplace'], 'titre')
    expect(plan.recopier).toEqual([
      { copie: 'c1.md', originale: 'a1.md', valeurs: { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 2, total: undefined, detail: undefined } },
      { copie: 'c2.md', originale: 'b1.md', valeurs: { ressource: 'bob', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 0, total: undefined, detail: undefined } },
    ])
    expect(plan.supprimer).toEqual(['c1.md', 'c2.md'])
    expect(plan.rendreReelles).toEqual(['n1.md'])
  })
})

describe('remplir', () => {
  // Alice (Dev, 5 j) a 3 j/sem. sur p1 ; Bob (Dev, 4 j) est libre ; Carla est en Test.
  const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-30', jours: 3 })]
  const dev = { role: 'Dev', jours: 6, debut: '2026-10-19', fin: '2026-10-30' }
  const demande = { projet: 'p2', mode: 'tot' as const, scenario: 'Option A', lignes: [dev] }

  it('au plus tôt : la ressource la plus disponible d’abord, chaque jour, une affectation par ressource avec son détail', () => {
    const res = remplir(R, RESSOURCES, aff, [], demande)
    expect(res).toMatchObject({ places: 6, manque: 0 })
    expect(res.lignes).toEqual([{ role: 'Dev', jours: 6, places: 6, manque: 0, fin: '2026-10-30', gel: null, finTravail: '2026-10-23' }])
    // Bob (0,8 j libre par jour) puis Alice (0,4 j) : 1,2 j par jour pendant 5 jours.
    expect(res.affectations.map((x) => [x.ressource, x.jours, x.valeurs['debut'], x.valeurs['fin'], x.valeurs['jours'], x.valeurs['detail']])).toEqual([
      ['bob', 4, '2026-10-19', '2026-10-23', 4, undefined],
      ['alice', 2, '2026-10-19', '2026-10-23', 2, undefined],
    ])
    expect(res.affectations[0]!.valeurs).toMatchObject({ projet: ['p2'], ressource: ['bob'], scenario: 'Option A' })
  })

  it('lissé : réparti sur toute la période ; ce qui ne tient pas est signalé', () => {
    const res = remplir(R, RESSOURCES, aff, [], { ...demande, mode: 'lisse' })
    expect(res.places).toBe(6)
    expect(res.affectations.map((x) => [x.ressource, x.valeurs['debut'], x.valeurs['fin'], x.valeurs['jours']])).toEqual([['bob', '2026-10-19', '2026-10-30', 3]])
    expect(remplir(R, RESSOURCES, aff, [], { ...demande, lignes: [{ ...dev, jours: 30 }] })).toMatchObject({ places: 12, manque: 18 })
  })

  it('sans colonne de détail : une affectation par suite de jours égaux, au total', () => {
    const sansDetail = { ...R, affectations: { ...R.affectations!, detail: undefined } }
    const res = remplir(sansDetail, RESSOURCES, aff, [], { ...demande, lignes: [{ ...dev, jours: 1.2, role: null }] })
    expect(res.affectations.map((x) => [x.ressource, x.valeurs['debut'], x.valeurs['fin'], x.valeurs['total']])).toEqual([['carla', '2026-10-19', '2026-10-19', 1], ['bob', '2026-10-19', '2026-10-19', 0.2]])
  })

  it('la situation du scénario affiché compte : sa capacité prise ne se redonne pas', () => {
    const avecEssai = [...aff, ligne('a2', { ressource: 'bob', projet: 'p3', debut: '2026-10-19', fin: '2026-10-30', jours: 4, scenario: 'Option A' })]
    expect(remplir(R, RESSOURCES, avecEssai, [], demande, { scenario: 'Option A' }).affectations.map((x) => x.ressource)).toEqual(['alice'])
  })

  it('une ligne par rôle, chacune sur ses ressources ; la deuxième ne reprend pas la capacité de la première', () => {
    const res = remplir(R, RESSOURCES, aff, [], {
      ...demande,
      lignes: [dev, { role: 'Test', jours: 3, debut: '2026-10-26', fin: '2026-10-30' }, { role: 'Dev', jours: 2, debut: '2026-10-19', fin: '2026-10-23' }],
    })
    expect(res.affectations.map((x) => [x.ligne, x.ressource])).toEqual([[0, 'bob'], [0, 'alice'], [1, 'carla']])
    expect(res.lignes.map((l) => [l.places, l.manque, l.finTravail])).toEqual([[6, 0, '2026-10-23'], [3, 0, '2026-10-28'], [0, 2, null]])
  })
})

describe('moratoires', () => {
  const M = { ...R, moratoires: { base: 'moratoires', debut: 'debut', fin: 'fin', ferme: 'ferme' } }
  const moratoires = [ligne('m1', { debut: '2026-10-21', fin: '2026-10-22', ferme: true }), ligne('m2', { debut: '2026-10-28', fin: '2026-11-03' })]

  it('fermé : personne ne travaille, comme un jour férié (capacité et charge)', () => {
    const aff = [ligne('a1', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 5 })]
    const c = calculerCharge(M, RESSOURCES, aff, [], periodes('jour', '2026-10-19', 5), { moratoires }).get('alice')!
    expect(c.map(etatCase)).toEqual(['pleine', 'pleine', 'fermee', 'fermee', 'pleine'])
    expect(calculerCharge(M, RESSOURCES, aff, [], periodes('semaine', '2026-10-19', 1), { moratoires }).get('alice')![0]).toMatchObject({ capacite: 3, charge: 3 })
  })

  it('gel des livraisons : on travaille, mais la fin d’une ligne à remplir recule à la veille du gel', () => {
    const res = remplir(M, RESSOURCES, [], [], { projet: 'p2', mode: 'lisse', lignes: [{ role: 'Test', jours: 4, debut: '2026-10-19', fin: '2026-10-30' }] }, { moratoires })
    expect(res.lignes[0]).toMatchObject({ fin: '2026-10-27', gel: 'm2', places: 4 })
    expect(res.affectations[0]!.valeurs['fin']).toBe('2026-10-27')
  })
})

describe('fenêtre d’un besoin', () => {
  const P = { ...R, besoins: { ...R.besoins!, apres: 'apres', phase: 'phase' }, phases: { base: 'phases', debut: 'debut', fin: 'fin', role: 'role' } }
  const phases = [ligne('ph1', { debut: '2026-10-26', fin: '2026-10-30', role: 'Test' })]
  const aff = [
    ligne('a1', { ressource: 'carla', projet: 'p1', debut: '2026-10-19', fin: '2026-10-30', jours: 5 }),
    ligne('a2', { ressource: 'alice', projet: 'p1', debut: '2026-10-19', fin: '2026-10-23', jours: 5 }),
  ]

  it('une phase donne la fenêtre et le rôle ; les dates du besoin l’emportent', () => {
    expect(fenetreBesoin(P, ligne('b1', { projet: 'p1', jours: 5, phase: 'ph1' }), phases)).toEqual({ role: 'Test', debut: '2026-10-26', fin: '2026-10-30', phase: 'ph1' })
    expect(fenetreBesoin(P, ligne('b2', { projet: 'p1', role: 'Dev', jours: 5, phase: 'ph1', apres: '2026-10-27' }), phases)).toMatchObject({ role: 'Dev', debut: '2026-10-27', fin: '2026-10-30' })
  })

  it('la couverture ne compte que la fenêtre ; les lignes à placer partent de ce qui manque', () => {
    const besoins = [ligne('b1', { projet: 'p1', jours: 8, phase: 'ph1' }), ligne('b2', { projet: 'p1', role: 'Dev', jours: 10, avant: '2026-10-23' })]
    expect(couvrirBesoins(P, RESSOURCES, aff, besoins, { phases }).map((c) => [c.besoin, c.role, c.apres, c.avant, c.affectes])).toEqual([
      ['b1', 'Test', '2026-10-26', '2026-10-30', 5],
      ['b2', 'Dev', null, '2026-10-23', 5],
    ])
    expect(besoinsAPlacer(P, RESSOURCES, aff, besoins, 'p1', '2026-10-20', '2026-12-31', { phases })).toEqual([
      { role: 'Test', jours: 3, debut: '2026-10-26', fin: '2026-10-30', besoin: 'b1' },
      { role: 'Dev', jours: 5, debut: '2026-10-20', fin: '2026-10-23', besoin: 'b2' },
    ])
  })
})

describe('nom d’un niveau', () => {
  it('le nom de la base au singulier, en minuscules', () => {
    expect(nomNiveau('Programmes', 'projet')).toBe('programme')
    expect(nomNiveau('Étapes', 'version')).toBe('étape')
    expect(nomNiveau('Process', 'x')).toBe('process')
    expect(nomNiveau(undefined, 'projet')).toBe('projet')
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
      { besoin: 'b1', projet: 'p1', role: 'Dev', apres: null, avant: '2026-10-30', demandes: 20, affectes: 10 },
      { besoin: 'b2', projet: 'p1', role: 'Test', apres: null, avant: null, demandes: 5, affectes: 10 },
    ])
  })
})
