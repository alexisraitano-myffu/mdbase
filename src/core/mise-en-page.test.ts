import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { lireSchema } from './schema'
import { SCHEMA_PROJETS } from './fixtures/espace-relations'
import {
  champsOrdonnes,
  choisirMiseEnPage,
  corpsEnOnglet,
  lireMiseEnPage,
  miseEnPageParDefaut,
  modifierMiseEnPage,
  ongletsDe,
  proprietesVisibles,
  type MiseEnPage,
} from './mise-en-page'

// Exemple de la spec §9.
const SUIVI = `id: suivi
nom: Suivi
defaut: false
champs:
  - { cle: statut, affichage: visible }
  - { cle: echeance, affichage: visible }
  - { cle: client, affichage: visible }
  - { cle: jours_restants, affichage: masque_si_vide }
onglets:
  - type: proprietes
  - type: relation
    relation: taches
    colonnes: [titre, statut, echeance]
  - type: corps
`

const schema = lireSchema(SCHEMA_PROJETS, 'projets').schema!

describe('lireMiseEnPage', () => {
  it('lit l’exemple de la spec', () => {
    const { miseEnPage, avertissements } = lireMiseEnPage(SUIVI, 'suivi')
    expect(avertissements).toEqual([])
    expect(miseEnPage).toEqual({
      id: 'suivi',
      nom: 'Suivi',
      defaut: false,
      champs: [
        { cle: 'statut', affichage: 'visible' },
        { cle: 'echeance', affichage: 'visible' },
        { cle: 'client', affichage: 'visible' },
        { cle: 'jours_restants', affichage: 'masque_si_vide' },
      ],
      onglets: [{ type: 'proprietes' }, { type: 'relation', relation: 'taches', colonnes: ['titre', 'statut', 'echeance'] }, { type: 'corps' }],
    })
  })

  it('tolère un affichage inconnu et écarte un onglet mal formé', () => {
    const { miseEnPage, avertissements } = lireMiseEnPage('champs:\n  - { cle: a, affichage: clignotant }\nonglets:\n  - type: galerie\n', 'm')
    expect(miseEnPage?.champs).toEqual([{ cle: 'a', affichage: 'visible' }])
    expect(miseEnPage?.onglets).toEqual([])
    expect(avertissements).toHaveLength(1)
  })
})

describe('modifierMiseEnPage', () => {
  it('écrit une mise en page au format de la spec', () => {
    const mep = lireMiseEnPage(SUIVI, 'suivi').miseEnPage!
    const texte = modifierMiseEnPage(null, { ...mep, implicite: true } as MiseEnPage, { champs: mep.champs, onglets: mep.onglets })
    expect(lireMiseEnPage(texte, 'suivi').miseEnPage).toEqual(mep)
    expect(texte).toContain('  - { cle: statut, affichage: visible }\n')
    expect(texte).toContain('    colonnes: [ titre, statut, echeance ]\n')
  })
})

describe('règles d’affichage', () => {
  const ligne = (cellules: LigneChargee['cellules']): LigneChargee => ({
    id: 'p1',
    chemin: 'projets/p1.md',
    cellules,
    inconnus: [],
    corps: '',
    source: '',
    date: 0,
  })

  it('choisit la mise en page de la vue, sinon celle par défaut, sinon la première', () => {
    const a: MiseEnPage = { ...miseEnPageParDefaut(), id: 'a', defaut: false, implicite: undefined as never }
    const b: MiseEnPage = { ...a, id: 'b', defaut: true }
    expect(choisirMiseEnPage([a, b], 'a').id).toBe('a')
    expect(choisirMiseEnPage([a, b], 'absente').id).toBe('b')
    expect(choisirMiseEnPage([a, { ...b, defaut: false }]).id).toBe('a')
    expect(choisirMiseEnPage([]).implicite).toBe(true)
  })

  it('ordonne les champs cités puis ajoute les autres colonnes, visibles', () => {
    const mep = lireMiseEnPage('champs:\n  - { cle: heures, affichage: masque }\n  - { cle: client, affichage: visible }\n', 'm').miseEnPage!
    expect(champsOrdonnes(schema, mep).map((c) => `${c.colonne.cle}:${c.affichage}`)).toEqual([
      'heures:masque',
      'client:visible',
      'titre:visible',
      'taches:visible',
      'ouvertes:visible',
    ])
  })

  it('masque le titre, les relations en onglet, les masqués et les vides « masque_si_vide »', () => {
    const mep = lireMiseEnPage(
      'champs:\n  - { cle: heures, affichage: masque }\n  - { cle: client, affichage: masque_si_vide }\nonglets:\n  - { type: relation, relation: taches, colonnes: [] }\n',
      'm',
    ).miseEnPage!
    const vide = proprietesVisibles(schema, mep, ligne({}))
    expect(vide.visibles.map((c) => c.cle)).toEqual(['ouvertes'])
    expect(vide.masquees.map((c) => c.cle)).toEqual(['heures', 'client'])
    const remplie = proprietesVisibles(schema, mep, ligne({ client: { etat: 'ok', valeur: ['c1'] } }))
    expect(remplie.visibles.map((c) => c.cle)).toEqual(['client', 'ouvertes'])
  })

  it('le corps a son onglet seulement si la mise en page le dit', () => {
    expect(corpsEnOnglet(miseEnPageParDefaut())).toBe(false)
    expect(corpsEnOnglet(lireMiseEnPage(SUIVI, 's').miseEnPage!)).toBe(true)
  })
})

describe('ongletsDe', () => {
  it('sans onglet relation ni corps : pas d’onglets', () => {
    expect(ongletsDe([], false)).toEqual([])
  })
  it('propriétés en premier, puis relations, puis corps', () => {
    expect(ongletsDe([{ relation: 'taches', colonnes: [] }], true)).toEqual([
      { type: 'proprietes' },
      { type: 'relation', relation: 'taches', colonnes: [] },
      { type: 'corps' },
    ])
  })
})
