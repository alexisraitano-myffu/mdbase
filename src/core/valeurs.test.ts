import { describe, expect, it } from 'vitest'
import { schemaProjets } from './fixtures/schema-projets'
import { decoder, encoder, estDateValide, lireNombre } from './valeurs'

const col = (cle: string) => schemaProjets().colonnes.find((c) => c.cle === cle)!

describe('decoder', () => {
  it('accepte les valeurs conformes', () => {
    expect(decoder(col('titre'), 'Navi')).toEqual({ etat: 'ok', valeur: 'Navi' })
    expect(decoder(col('budget'), 12.5)).toEqual({ etat: 'ok', valeur: 12.5 })
    expect(decoder(col('echeance'), '2026-10-15')).toEqual({ etat: 'ok', valeur: '2026-10-15' })
    expect(decoder(col('echeance'), '2026-10-15T09:30')).toEqual({ etat: 'ok', valeur: '2026-10-15T09:30' })
    expect(decoder(col('urgent'), true)).toEqual({ etat: 'ok', valeur: true })
    expect(decoder(col('statut'), 'En cours')).toEqual({ etat: 'ok', valeur: 'En cours' })
    expect(decoder(col('tags'), ['pro', 'client'])).toEqual({ etat: 'ok', valeur: ['pro', 'client'] })
  })

  it('lit un titre numérique saisi à la main comme du texte', () => {
    expect(decoder(col('titre'), 2024)).toEqual({ etat: 'ok', valeur: '2024' })
  })

  it('met toujours une relation sous forme de liste', () => {
    expect(decoder(col('client'), 'c7ab3kx1')).toEqual({ etat: 'ok', valeur: ['c7ab3kx1'] })
    expect(decoder(col('client'), ['a', 'b'])).toEqual({ etat: 'ok', valeur: ['a', 'b'] })
  })

  it('garde une valeur invalide telle quelle, avec une raison', () => {
    for (const [cle, brut] of [
      ['budget', 'beaucoup'],
      ['echeance', '2026-02-30'],
      ['echeance', '15/10/2026'],
      ['urgent', 'oui'],
      ['statut', 'Abandonné'],
      ['tags', ['pro', 'inconnu']],
      ['client', 42],
    ] as const) {
      const c = decoder(col(cle), brut)
      expect(c.etat, cle).toBe('invalide')
      if (c.etat === 'invalide') expect(c.brut).toEqual(brut)
    }
  })
})

describe('encoder', () => {
  it('omet les champs vides et les cases décochées', () => {
    expect(encoder(col('titre'), '')).toBeUndefined()
    expect(encoder(col('urgent'), false)).toBeUndefined()
    expect(encoder(col('tags'), [])).toBeUndefined()
    expect(encoder(col('client'), [])).toBeUndefined()
    expect(encoder(col('titre'), undefined)).toBeUndefined()
  })

  it('écrit un lien seul comme un id, plusieurs comme une liste', () => {
    expect(encoder(col('client'), ['a'])).toBe('a')
    expect(encoder(col('client'), ['a', 'b'])).toEqual(['a', 'b'])
  })

  it("n'encode jamais une colonne calculée", () => {
    expect(encoder(col('nb_taches'), 3)).toBeUndefined()
    expect(encoder(col('jours_restants'), 3)).toBeUndefined()
  })
})

it('estDateValide refuse les heures impossibles', () => {
  expect(estDateValide('2026-10-15T24:00')).toBe(false)
  expect(estDateValide('2024-02-29')).toBe(true)
  expect(estDateValide('2025-02-29')).toBe(false)
})

describe('lireNombre', () => {
  it('accepte la virgule, les espaces de milliers et le signe', () => {
    expect(lireNombre('1 234,5')).toBe(1234.5)
    expect(lireNombre('-3')).toBe(-3)
    expect(lireNombre(' 0.25 ')).toBe(0.25)
  })
  it('distingue vide et invalide', () => {
    expect(lireNombre('  ')).toBeUndefined()
    expect(lireNombre('12a')).toBeNull()
    expect(lireNombre('1,2,3')).toBeNull()
  })
})
