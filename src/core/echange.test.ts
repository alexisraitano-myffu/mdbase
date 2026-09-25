import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { convertirValeur, deduireColonnes, grilleDeVue, lireCsv, lireDate, versCsv, versMarkdown } from './echange'
import { schemas } from './fixtures/espace-relations'
import type { Cellule, Valeur } from './valeurs'

const taches = schemas().get('taches')!
const projets = schemas().get('projets')!

function ligne(id: string, cellules: Record<string, Cellule>): LigneChargee {
  return { id, chemin: `taches/${id}.md`, cellules, inconnus: [], corps: '', source: '', date: 0 }
}
const ok = (valeur: Valeur): Cellule => ({ etat: 'ok', valeur })

const LIGNES = [
  ligne('t1', {
    titre: ok('Maquettes, v2'),
    projet: ok(['p0000001']),
    statut: ok('À faire'),
    heures: ok(1234.5),
    fait: ok(true),
    echeance: ok('2026-10-05'),
  }),
  ligne('t2', { titre: ok('=SOMME(A1)'), heures: ok(-3), echeance: { etat: 'invalide', brut: 'bientôt', raison: 'date attendue' } }),
]
const libelle = (_: unknown, id: string) => (id === 'p0000001' ? 'Navi' : id)

describe('grille d’une vue', () => {
  it('colonnes dans l’ordre donné, relations en titres, valeurs relisibles par un tableur (CSV)', () => {
    const g = grilleDeVue(LIGNES, taches.colonnes, libelle, false)
    expect(g.entetes).toEqual(['Titre', 'Projet', 'Statut', 'Heures', 'Fait', 'Échéance'])
    expect(g.lignes[0]).toEqual(['Maquettes, v2', 'Navi', 'À faire', '1234.5', 'oui', '2026-10-05'])
    expect(g.lignes[1]).toEqual(['=SOMME(A1)', '', '', '-3', '', 'bientôt'])
  })

  it('lisible (Markdown) : nombres et dates à la française, pourcentage d’un rollup', () => {
    const g = grilleDeVue(LIGNES.slice(0, 1), taches.colonnes, libelle, true)
    expect(g.lignes[0]![3]).toBe('1 234,5')
    expect(g.lignes[0]![5]).toBe('05/10/2026')
    const pourcent = { cle: 'p', nom: 'Avancement', type: 'rollup', relation: 'taches', champ: 'fait', calcul: 'pourcent_coche' } as const
    expect(grilleDeVue([ligne('x', { p: ok(33.3333) })], [pourcent], libelle, true).lignes[0]).toEqual(['33,33 %'])
  })

  it('case décochée : « non »', () => {
    const g = grilleDeVue([ligne('x', { fait: ok(false) })], projets.colonnes.slice(0, 1).concat(taches.colonnes[4]!), libelle, false)
    expect(g.lignes[0]).toEqual(['', 'non'])
  })
})

describe('CSV', () => {
  it('guillemets autour des champs à séparateur, guillemet ou retour ; formule neutralisée, nombre négatif intact', () => {
    const csv = versCsv({ entetes: ['Titre', 'Note', 'N'], lignes: [['a, b', 'dit "oui"\nfin', '-3'], ['=SOMME(A1)', '@x', '+33 6']] })
    expect(csv).toBe('Titre,Note,N\r\n"a, b","dit ""oui""\nfin",-3\r\n\'=SOMME(A1),\'@x,+33 6\r\n')
  })

  it('aller-retour : relu à l’identique', () => {
    const g = { entetes: ['A', 'B'], lignes: [['x, "y"', 'deux\r\nlignes'], ['', 'z']] }
    expect(lireCsv(versCsv(g))).toEqual([g.entetes, ...g.lignes])
  })

  it('point-virgule ou tabulation devinés, BOM ignoré, lignes vides retirées, dernière ligne sans retour', () => {
    expect(lireCsv('﻿nom;prix\nA;1,5\n\n;\nB;2')).toEqual([['nom', 'prix'], ['A', '1,5'], ['B', '2']])
    expect(lireCsv('nom\tville\nA\tLyon, Rhône\n')).toEqual([['nom', 'ville'], ['A', 'Lyon, Rhône']])
    expect(lireCsv('"a;b",c\n1,2')).toEqual([['a;b', 'c'], ['1', '2']])
  })
})

describe('Markdown', () => {
  it('tableau GFM, barre verticale échappée, retour à la ligne en <br>', () => {
    expect(versMarkdown({ entetes: ['Titre', 'Note'], lignes: [['a | b', 'l1\nl2']] })).toBe('| Titre | Note |\n| --- | --- |\n| a \\| b | l1<br>l2 |\n')
  })
})

describe('import : types devinés', () => {
  it('titre, nombre, date, case, lien, sélection, texte', () => {
    const entetes = ['Nom', 'Prix', 'Livraison', 'Payé', 'Site', 'Statut', 'Note']
    const lignes = [
      ['A', '1 200,50', '05/10/2026', 'oui', 'https://a.fr', 'En cours', 'libre'],
      ['B', '3', '2026-10-06', 'non', 'https://b.fr', 'En cours', 'autre'],
      ['C', '', '', '', '', 'Terminé', 'encore'],
    ]
    expect(deduireColonnes(entetes, lignes).map((c) => [c.nom, c.type, c.options])).toEqual([
      ['Nom', 'text', []],
      ['Prix', 'number', []],
      ['Livraison', 'date', []],
      ['Payé', 'checkbox', []],
      ['Site', 'url', []],
      ['Statut', 'select', ['En cours', 'Terminé']],
      ['Note', 'text', []],
    ])
  })

  it('la première colonne reste du texte même si elle est numérique ; en-tête vide nommé', () => {
    expect(deduireColonnes(['N°', ''], [['1', 'a'], ['2', 'a']]).map((c) => [c.nom, c.type])).toEqual([
      ['N°', 'text'],
      ['Colonne 2', 'select'],
    ])
  })

  it('valeurs converties selon le type ; illisible ou vide → rien', () => {
    expect(convertirValeur('number', '1 234,5')).toBe(1234.5)
    expect(convertirValeur('number', 'beaucoup')).toBeUndefined()
    expect(convertirValeur('date', '5/9/2026')).toBe('2026-09-05')
    expect(convertirValeur('date', '31/02/2026')).toBeUndefined()
    expect(convertirValeur('checkbox', 'Oui')).toBe(true)
    expect(convertirValeur('checkbox', 'non')).toBeUndefined()
    expect(convertirValeur('multiselect', 'a, b;c')).toEqual(['a', 'b', 'c'])
    expect(convertirValeur('text', '  ')).toBeUndefined()
    expect(lireDate('2026-10-05 14:30:00')).toBe('2026-10-05T14:30')
  })
})
