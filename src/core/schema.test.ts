import { describe, expect, it } from 'vitest'
import { TEXTE_SCHEMA_PROJETS, schemaProjets } from './fixtures/schema-projets'
import { colonneOrigine, estSaisie, lireSchema, type Schema } from './schema'

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

describe('colonneOrigine', () => {
  // Tâches → Lot → Version → Projet : le projet d'une tâche remonte par deux rollups.
  const lire = (texte: string) => lireSchema(texte, /id: (\w+)/.exec(texte)![1]!).schema!
  const schemas = new Map<string, Schema>([
    ['projets', lire('version: 1\nid: projets\nnom: Projets\nchamp_titre: titre\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n')],
    [
      'versions',
      lire(
        'version: 1\nid: versions\nnom: Versions\nchamp_titre: titre\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n  - { cle: projet, nom: Projet, type: relation, cible: projets, proprietaire: true, inverse: versions }\n',
      ),
    ],
    [
      'lots',
      lire(
        'version: 1\nid: lots\nnom: Lots\nchamp_titre: titre\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n  - { cle: version, nom: Version, type: relation, cible: versions, proprietaire: true, inverse: lots }\n  - { cle: projet, nom: Projet, type: rollup, relation: version, champ: projet, calcul: afficher }\n  - { cle: nb, nom: Nb, type: rollup, relation: version, champ: projet, calcul: compter }\n',
      ),
    ],
    [
      'taches',
      lire(
        'version: 1\nid: taches\nnom: Tâches\nchamp_titre: titre\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n  - { cle: lot, nom: Lot, type: relation, cible: lots, proprietaire: true, inverse: taches }\n  - { cle: projet, nom: Projet, type: rollup, relation: lot, champ: projet, calcul: afficher_uniques }\n  - { cle: perdu, nom: Perdu, type: rollup, relation: lot, champ: disparu, calcul: afficher }\n',
      ),
    ],
  ])
  const de = (b: string) => schemas.get(b)
  const col = (b: string, cle: string) => schemas.get(b)!.colonnes.find((c) => c.cle === cle)!

  it('remonte une chaîne de rollups jusqu’à la relation d’origine', () => {
    expect(colonneOrigine(de, 'taches', col('taches', 'projet'))).toMatchObject({ type: 'relation', cible: 'projets' })
    expect(colonneOrigine(de, 'lots', col('lots', 'projet'))).toMatchObject({ type: 'relation', cible: 'projets' })
  })

  it('une colonne qui n’affiche pas de valeurs est sa propre origine ; un maillon manquant, aucune', () => {
    expect(colonneOrigine(de, 'lots', col('lots', 'nb'))).toBe(col('lots', 'nb'))
    expect(colonneOrigine(de, 'taches', col('taches', 'titre'))).toBe(col('taches', 'titre'))
    expect(colonneOrigine(de, 'taches', col('taches', 'perdu'))).toBeUndefined()
  })
})
