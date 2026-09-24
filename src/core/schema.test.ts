import { describe, expect, it } from 'vitest'
import { TEXTE_SCHEMA_PROJETS, schemaProjets } from './fixtures/schema-projets'
import { estSaisie, lireSchema } from './schema'

describe('lireSchema', () => {
  it('lit toutes les colonnes du schéma d’exemple', () => {
    const { schema, avertissements } = lireSchema(TEXTE_SCHEMA_PROJETS, 'projets')
    expect(avertissements).toEqual([])
    expect(schema?.champTitre).toBe('titre')
    expect(schema?.colonnes.map((c) => c.type)).toEqual([
      'text', 'select', 'date', 'number', 'checkbox', 'multiselect', 'url',
      'relation', 'relation', 'rollup', 'formula',
    ])
  })

  it('accepte des options en chaînes simples', () => {
    const tags = schemaProjets().colonnes.find((c) => c.cle === 'tags')
    expect(tags).toMatchObject({ options: [{ label: 'perso' }, { label: 'pro' }, { label: 'client' }] })
  })

  it('distingue colonnes saisies et calculées', () => {
    const saisies = schemaProjets().colonnes.filter(estSaisie).map((c) => c.cle)
    expect(saisies).toEqual(['titre', 'statut', 'echeance', 'budget', 'urgent', 'tags', 'site', 'client'])
  })

  it('réserve la clé id', () => {
    const { schema, avertissements } = lireSchema(
      'champ_titre: t\ncolonnes:\n  - { cle: t, type: text }\n  - { cle: id, nom: Id, type: text }\n',
      'b',
    )
    expect(schema?.colonnes.map((c) => c.cle)).toEqual(['t'])
    expect(avertissements[0]).toContain('réservée')
  })

  it('écarte une colonne mal formée sans perdre le reste', () => {
    const { schema, avertissements } = lireSchema(
      'champ_titre: t\ncolonnes:\n  - { cle: t, type: text }\n  - { cle: x, type: hologramme }\n  - { type: text }\n  - { cle: t, type: number }\n',
      'b',
    )
    expect(schema?.colonnes.map((c) => c.cle)).toEqual(['t'])
    expect(avertissements).toHaveLength(3)
  })

  it('prend la première colonne texte si champ_titre est invalide', () => {
    const { schema, avertissements } = lireSchema(
      'champ_titre: absent\ncolonnes:\n  - { cle: n, type: number }\n  - { cle: nom, type: text }\n',
      'b',
    )
    expect(schema?.champTitre).toBe('nom')
    expect(avertissements).toHaveLength(1)
  })

  it('refuse une base sans colonne texte', () => {
    expect(lireSchema('colonnes:\n  - { cle: n, type: number }\n', 'b').schema).toBeNull()
  })

  it('fait foi du dossier si l’id du schéma diffère', () => {
    const { schema, avertissements } = lireSchema('id: autre\nchamp_titre: t\ncolonnes:\n  - { cle: t, type: text }\n', 'projets')
    expect(schema?.id).toBe('projets')
    expect(avertissements).toHaveLength(1)
  })

  it('refuse un YAML illisible sans lever d’exception', () => {
    expect(lireSchema('colonnes: [\n', 'b').schema).toBeNull()
  })
})
