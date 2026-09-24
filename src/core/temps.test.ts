import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { creerLigne, lireLigne, type Modifications } from './ligne'
import { colonne, lireSchema } from './schema'
import {
  ajouterMois,
  apresGeste,
  ecartJours,
  etendue,
  graduations,
  grilleMois,
  lundiDe,
  placerSemaine,
  plageApresGeste,
  plageDe,
  type Plage,
} from './temps'

const { schema } = lireSchema(
  `version: 1
id: jalons
nom: Jalons
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: debut, nom: Début, type: date }
  - { cle: fin, nom: Fin, type: date }
`,
  'jalons',
)
const debut = colonne(schema!, 'debut')!
const fin = colonne(schema!, 'fin')!

let n = 0
function ligne(valeurs: Modifications): LigneChargee {
  const id = `l${String(++n).padStart(7, '0')}`
  const r = lireLigne(`jalons/${id}.md`, creerLigne(schema!, id, valeurs), schema!)
  if (!r.ok) throw new Error(r.raison)
  return { ...r.ligne, date: 0 }
}

describe('arithmétique des jours', () => {
  it('lundi, écart, mois suivants', () => {
    expect(lundiDe('2026-09-24')).toBe('2026-09-21')
    expect(lundiDe('2026-09-21')).toBe('2026-09-21')
    expect(lundiDe('2026-09-27')).toBe('2026-09-21')
    expect(ecartJours('2026-09-24', '2026-10-02')).toBe(8)
    expect(ecartJours('2026-10-02', '2026-09-24')).toBe(-8)
    expect(ajouterMois('2026-11-15', 2)).toBe('2027-01-01')
    expect(ajouterMois('2026-01-31', -1)).toBe('2025-12-01')
  })

  it('la grille du mois commence un lundi et couvre tout le mois', () => {
    const g = grilleMois('2026-09-24')
    expect(g[0]![0]).toBe('2026-08-31')
    expect(g.at(-1)!.at(-1)).toBe('2026-10-04')
    expect(g).toHaveLength(5)
    expect(grilleMois('2027-02-10')).toHaveLength(4) // février 2027 : du lundi 1er au dimanche 28
    expect(grilleMois('2026-02-10')).toHaveLength(5) // commence un dimanche
  })
})

describe('plageDe', () => {
  it('début seul : un jour ; fin avant le début : ignorée ; heure retirée', () => {
    expect(plageDe(ligne({ debut: '2026-09-03' }), debut, fin)).toEqual({ debut: '2026-09-03', fin: '2026-09-03' })
    expect(plageDe(ligne({ debut: '2026-09-03', fin: '2026-09-01' }), debut, fin)).toEqual({ debut: '2026-09-03', fin: '2026-09-03' })
    expect(plageDe(ligne({ debut: '2026-09-03T14:30', fin: '2026-09-05' }), debut, fin)).toEqual({ debut: '2026-09-03', fin: '2026-09-05' })
    expect(plageDe(ligne({ fin: '2026-09-05' }), debut, fin)).toBeNull()
  })
})

describe('apresGeste', () => {
  const l = ligne({ debut: '2026-09-03T09:00', fin: '2026-09-05' })

  it('déplacer décale les deux bornes et garde l’heure', () => {
    expect(apresGeste(l, 'deplacer', 7, debut, fin)).toEqual({ debut: '2026-09-10T09:00', fin: '2026-09-12' })
  })

  it('étirer un bord ne dépasse jamais l’autre', () => {
    expect(apresGeste(l, 'debut', 1, debut, fin)).toEqual({ debut: '2026-09-04T09:00' })
    expect(apresGeste(l, 'debut', 10, debut, fin)).toEqual({ debut: '2026-09-05T09:00' })
    expect(apresGeste(l, 'fin', -10, debut, fin)).toEqual({ fin: '2026-09-03T09:00' })
    expect(apresGeste(l, 'fin', 3, debut, fin)).toEqual({ fin: '2026-09-08' })
  })

  it('sans fin : déplacer ne crée pas de fin, étirer la crée depuis le début', () => {
    const seule = ligne({ debut: '2026-09-03' })
    expect(apresGeste(seule, 'deplacer', -2, debut, fin)).toEqual({ debut: '2026-09-01' })
    expect(apresGeste(seule, 'fin', 2, debut, fin)).toEqual({ fin: '2026-09-05' })
    expect(apresGeste(seule, 'fin', 2, debut)).toEqual({})
  })

  it('rien à écrire sans début ou sans décalage', () => {
    expect(apresGeste(ligne({}), 'deplacer', 3, debut, fin)).toEqual({})
    expect(apresGeste(l, 'deplacer', 0, debut, fin)).toEqual({})
  })
})

describe('plageApresGeste', () => {
  it('donne la même plage que les valeurs écrites', () => {
    const p = { debut: '2026-09-03', fin: '2026-09-05' }
    expect(plageApresGeste(p, 'deplacer', 7)).toEqual({ debut: '2026-09-10', fin: '2026-09-12' })
    expect(plageApresGeste(p, 'debut', 10)).toEqual({ debut: '2026-09-05', fin: '2026-09-05' })
    expect(plageApresGeste(p, 'fin', -10)).toEqual({ debut: '2026-09-03', fin: '2026-09-03' })
  })
})

describe('placerSemaine', () => {
  const p = (d: string, f = d): Plage => ({ debut: d, fin: f })
  const lundi = '2026-09-21'

  it('coupe les plages au bord de la semaine', () => {
    const [s] = placerSemaine([{ element: 'a', plage: p('2026-09-18', '2026-09-30') }], lundi)
    expect(s).toMatchObject({ colonne: 0, largeur: 7, coupeAvant: true, coupeApres: true })
  })

  it('empile les chevauchements, réutilise les rangées libres, ignore le hors semaine', () => {
    const segments = placerSemaine(
      [
        { element: 'court', plage: p('2026-09-22') },
        { element: 'long', plage: p('2026-09-21', '2026-09-23') },
        { element: 'apres', plage: p('2026-09-25') },
        { element: 'loin', plage: p('2026-10-05') },
      ],
      lundi,
    )
    expect(segments.map((s) => [s.element, s.colonne, s.largeur, s.rang])).toEqual([
      ['long', 0, 3, 0],
      ['court', 1, 1, 1],
      ['apres', 4, 1, 0],
    ])
  })
})

describe('timeline', () => {
  it('l’étendue couvre les plages et aujourd’hui, avec un mois de marge avant', () => {
    expect(etendue([{ debut: '2026-09-03', fin: '2026-12-01' }], '2026-09-24')).toEqual({ debut: '2026-08-01', fin: '2027-02-28' })
    expect(etendue([], '2026-09-24')).toEqual({ debut: '2026-08-01', fin: '2026-11-30' })
  })

  it('les graduations couvrent exactement l’étendue', () => {
    const e = { debut: '2026-08-01', fin: '2026-11-30' }
    const total = ecartJours(e.debut, e.fin) + 1
    for (const echelle of ['semaine', 'mois', 'trimestre'] as const) {
      const { haut, bas } = graduations(e, echelle)
      expect(haut.reduce((s, g) => s + g.jours, 0)).toBe(total)
      expect(bas.reduce((s, g) => s + g.jours, 0)).toBe(total)
      expect(bas[0]!.debut).toBe(e.debut)
    }
    expect(graduations(e, 'trimestre').haut.map((g) => g.libelle)).toEqual(['T3 2026', 'T4 2026'])
    expect(graduations(e, 'mois').haut[0]!.libelle).toBe('août 2026')
  })
})
