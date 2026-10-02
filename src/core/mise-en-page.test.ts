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

describe('onglet des tâches', () => {
  const TACHES = `id: suivi
nom: Suivi
onglets:
  - type: proprietes
  - type: taches
    liees:
      relation: taches
      filtres:
        - { colonne: fait, operateur: egal, valeur: false }
      puis:
        relation: livrables
`
  it('se lit avec ses lignes liées, et se réécrit à l’identique', () => {
    const mep = lireMiseEnPage(TACHES, 'suivi').miseEnPage!
    expect(mep.onglets[1]).toEqual({
      type: 'taches',
      liees: { relation: 'taches', champs: [], filtres: [{ colonne: 'fait', operateur: 'egal', valeur: false }], puis: { relation: 'livrables', champs: [] } },
    })
    const texte = modifierMiseEnPage(TACHES, mep, { onglets: mep.onglets })
    expect(texte).toBe(TACHES)
  })
  it('sans lignes liées, un onglet nu ; une relation manquante est signalée', () => {
    expect(lireMiseEnPage('onglets:\n  - type: taches\n', 'm').miseEnPage!.onglets).toEqual([{ type: 'taches' }])
    const { miseEnPage, avertissements } = lireMiseEnPage('onglets:\n  - type: taches\n    liees: { champs: [a] }\n', 'm')
    expect(miseEnPage!.onglets).toEqual([{ type: 'taches' }])
    expect(avertissements[0]).toContain('tâches des lignes liées ignorées')
  })
  it('se place entre les relations et le corps', () => {
    expect(ongletsDe([{ relation: 'r', colonnes: [] }], true, { type: 'taches' })).toEqual([
      { type: 'proprietes' },
      { type: 'relation', relation: 'r', colonnes: [] },
      { type: 'taches' },
      { type: 'corps' },
    ])
    expect(ongletsDe([], false, { type: 'taches' })).toEqual([{ type: 'proprietes' }, { type: 'taches' }])
  })
})

describe('contenus liés', () => {
  const AVEC = `id: suivi
nom: Suivi
contenus:
  relation: taches
  champs: [ statut, echeance ]
  puis:
    relation: sous_taches
`

  it('lit les niveaux, champs vides par défaut', () => {
    const { miseEnPage, avertissements } = lireMiseEnPage(AVEC, 'suivi')
    expect(avertissements).toEqual([])
    expect(miseEnPage?.contenus).toEqual({ relation: 'taches', champs: ['statut', 'echeance'], puis: { relation: 'sous_taches', champs: [] } })
  })

  it('écarte des contenus sans relation, avec un avertissement', () => {
    const { miseEnPage, avertissements } = lireMiseEnPage('contenus:\n  champs: [a]\n', 'm')
    expect(miseEnPage?.contenus).toBeUndefined()
    expect(avertissements).toHaveLength(1)
  })

  it('tronque au-delà de la profondeur maximale', () => {
    let n = 'relation: r6\n'
    for (let i = 5; i >= 1; i--) n = `relation: r${i}\npuis:\n${n.replace(/^/gm, '  ')}`
    const contenus = lireMiseEnPage(`contenus:\n${n.replace(/^/gm, '  ')}`, 'm').miseEnPage!.contenus!
    let profondeur = 0
    for (let x: typeof contenus | undefined = contenus; x; x = x.puis) profondeur++
    expect(profondeur).toBe(5)
  })

  it('filtres et tris au format des vues, un par ligne ; un filtre illisible est écarté', () => {
    const texte = `contenus:
  relation: taches
  filtres:
    - { colonne: fait, operateur: egal, valeur: false }
    - { colonne: statut, operateur: clignote }
  tris:
    - { colonne: echeance, sens: desc }
`
    const mep = lireMiseEnPage(texte, 'm').miseEnPage!
    expect(mep.contenus).toEqual({ relation: 'taches', champs: [], filtres: [{ colonne: 'fait', operateur: 'egal', valeur: false }], tris: [{ colonne: 'echeance', sens: 'desc' }] })
    const ecrit = modifierMiseEnPage('id: m\n', mep, { contenus: mep.contenus! })
    expect(ecrit).toContain('  filtres:\n    - { colonne: fait, operateur: egal, valeur: false }\n  tris:\n    - { colonne: echeance, sens: desc }\n')
    expect(lireMiseEnPage(ecrit, 'm').miseEnPage!.contenus).toEqual(mep.contenus)
  })

  it('écrit les champs en ligne, sans clé vide, et `null` retire la clé', () => {
    const texte = modifierMiseEnPage('id: suivi\nnom: Suivi\n', lireMiseEnPage(AVEC, 'suivi').miseEnPage!, {
      contenus: { relation: 'taches', champs: ['statut', 'echeance'], puis: { relation: 'sous_taches', champs: [] } },
    })
    expect(texte).toBe(AVEC)
    expect(modifierMiseEnPage(texte, lireMiseEnPage(texte, 'suivi').miseEnPage!, { contenus: null })).toBe('id: suivi\nnom: Suivi\n')
  })
})
