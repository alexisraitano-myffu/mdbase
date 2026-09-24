import { describe, expect, it } from 'vitest'
import { lireSchema } from './schema'
import { ErreurSchema, modifierSchema, nouveauSchema } from './schema-ecriture'

const TEXTE = `version: 1
id: projets
nom: Projets # nom affiché
champ_titre: titre
colonnes:
  - cle: titre
    nom: Titre
    type: text
  # le statut du projet
  - cle: statut
    nom: Statut
    type: select
    options:
      - { label: À faire, couleur: gris }
  - { cle: echeance, nom: Échéance, type: date }
`

const cles = (texte: string) => lireSchema(texte, 'projets').schema!.colonnes.map((c) => c.cle)

describe('modifierSchema', () => {
  it('renomme une colonne sans toucher à sa clé ni au reste', () => {
    const apres = modifierSchema(TEXTE, { type: 'renommer_colonne', cle: 'statut', nom: 'État' })
    expect(apres).toBe(TEXTE.replace('    nom: Statut', '    nom: État'))
  })

  it('ajoute une colonne en fin de liste', () => {
    const apres = modifierSchema(TEXTE, {
      type: 'ajouter_colonne',
      colonne: { cle: 'tags', nom: 'Tags', type: 'multiselect', options: [{ label: 'pro', couleur: 'bleu' }] },
    })
    expect(apres.startsWith(TEXTE)).toBe(true)
    expect(apres.slice(TEXTE.length)).toBe(
      '  - cle: tags\n    nom: Tags\n    type: multiselect\n    options:\n      - { label: pro, couleur: bleu }\n',
    )
    expect(lireSchema(apres, 'projets').schema!.colonnes.at(-1)).toEqual({
      cle: 'tags',
      nom: 'Tags',
      type: 'multiselect',
      options: [{ label: 'pro', couleur: 'bleu' }],
    })
  })

  it('déplace une colonne', () => {
    expect(cles(modifierSchema(TEXTE, { type: 'deplacer_colonne', cle: 'echeance', index: 0 }))).toEqual([
      'echeance',
      'titre',
      'statut',
    ])
    expect(cles(modifierSchema(TEXTE, { type: 'deplacer_colonne', cle: 'titre', index: 99 }))).toEqual([
      'statut',
      'echeance',
      'titre',
    ])
  })

  it('supprime une colonne', () => {
    expect(cles(modifierSchema(TEXTE, { type: 'supprimer_colonne', cle: 'statut' }))).toEqual(['titre', 'echeance'])
  })

  it('change la colonne titre et le nom de la base', () => {
    let t = modifierSchema(TEXTE, { type: 'champ_titre', cle: 'echeance' })
    t = modifierSchema(t, { type: 'renommer_base', nom: 'Mes projets' })
    expect(t).toContain('champ_titre: echeance\n')
    expect(t).toContain('nom: Mes projets # nom affiché\n')
  })

  it('ajoute une option, y compris à une colonne qui n’en a pas encore', () => {
    const t = modifierSchema(TEXTE, { type: 'ajouter_option', cle: 'statut', option: { label: 'Fini', couleur: 'vert' } })
    expect(t).toContain('      - { label: À faire, couleur: gris }\n      - { label: Fini, couleur: vert }\n')
    const sans = modifierSchema(
      modifierSchema(TEXTE, { type: 'ajouter_colonne', colonne: { cle: 'tags', nom: 'Tags', type: 'multiselect', options: [] } }),
      { type: 'ajouter_option', cle: 'tags', option: { label: 'pro' } },
    )
    expect(lireSchema(sans, 'projets').schema!.colonnes.at(-1)).toMatchObject({ options: [{ label: 'pro' }] })
  })

  it('refuse une colonne introuvable ou un fichier illisible', () => {
    expect(() => modifierSchema(TEXTE, { type: 'renommer_colonne', cle: 'absente', nom: 'x' })).toThrow(ErreurSchema)
    expect(() => modifierSchema('colonnes: [', { type: 'renommer_base', nom: 'x' })).toThrow(ErreurSchema)
  })
})

it('nouveauSchema donne une base lisible avec une colonne titre', () => {
  const { schema, avertissements } = lireSchema(nouveauSchema('lectures', 'Lectures'), 'lectures')
  expect(avertissements).toEqual([])
  expect(schema).toMatchObject({ id: 'lectures', nom: 'Lectures', champTitre: 'titre', colonnes: [{ cle: 'titre' }] })
})
