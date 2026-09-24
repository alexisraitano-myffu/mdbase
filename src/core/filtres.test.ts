import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { appliquerVue, correspond, filtreDePastille, trier, valeursHeritees, type Contexte } from './filtres'
import { decaler } from './temps'
import { schemaProjets } from './fixtures/schema-projets'
import { creerLigne, lireLigne, type Modifications } from './ligne'
import type { Filtre } from './vue'

const schema = schemaProjets()
// Jeudi 24 septembre 2026.
const ctx: Contexte = { aujourdhui: '2026-09-24' }

let n = 0
function ligne(valeurs: Modifications, texte?: string): LigneChargee {
  const id = `l${String(++n).padStart(7, '0')}`
  const r = lireLigne(`projets/${id}.md`, texte ?? creerLigne(schema, id, valeurs), schema)
  if (!r.ok) throw new Error(r.raison)
  return { ...r.ligne, date: 0 }
}

const f = (colonne: string, operateur: Filtre['operateur'], valeur?: unknown): Filtre => ({
  colonne,
  operateur,
  ...(valeur !== undefined && { valeur }),
})
const ok = (l: LigneChargee, filtre: Filtre) => correspond(l, schema, filtre, ctx)

describe('correspond', () => {
  it('texte : insensible à la casse et aux accents', () => {
    const l = ligne({ titre: 'Réunion Équipe' })
    expect(ok(l, f('titre', 'egal', 'reunion equipe'))).toBe(true)
    expect(ok(l, f('titre', 'contient', 'équipe'))).toBe(true)
    expect(ok(l, f('titre', 'commence_par', 'REU'))).toBe(true)
    expect(ok(l, f('titre', 'finit_par', 'pe'))).toBe(true)
    expect(ok(l, f('titre', 'ne_contient_pas', 'equipe'))).toBe(false)
    expect(ok(l, f('titre', 'different_de', 'autre'))).toBe(true)
  })

  it('vide / non vide, et un champ vide satisfait les opérateurs négatifs', () => {
    const vide = ligne({})
    expect(ok(vide, f('titre', 'vide'))).toBe(true)
    expect(ok(vide, f('titre', 'non_vide'))).toBe(false)
    expect(ok(vide, f('titre', 'different_de', 'x'))).toBe(true)
    expect(ok(vide, f('titre', 'contient', 'x'))).toBe(false)
    expect(ok(vide, f('budget', 'inferieur', 10))).toBe(false)
  })

  it('nombres', () => {
    const l = ligne({ budget: 100 })
    expect(ok(l, f('budget', 'superieur', 99))).toBe(true)
    expect(ok(l, f('budget', 'inferieur_egal', 100))).toBe(true)
    expect(ok(l, f('budget', 'superieur_egal', '100'))).toBe(true)
    expect(ok(l, f('budget', 'egal', 101))).toBe(false)
    expect(ok(l, f('budget', 'superieur'))).toBe(true) // valeur pas encore saisie : n'écarte rien
  })

  it('dates absolues, « aujourdhui » comme valeur, et entre', () => {
    const l = ligne({ echeance: '2026-09-20T14:00' })
    expect(ok(l, f('echeance', 'egal', '2026-09-20'))).toBe(true)
    expect(ok(l, f('echeance', 'avant', 'aujourdhui'))).toBe(true)
    expect(ok(l, f('echeance', 'apres', 'aujourdhui'))).toBe(false)
    expect(ok(l, f('echeance', 'entre', ['2026-09-25', '2026-09-01']))).toBe(true)
  })

  it('dates relatives', () => {
    const d = (jours: number) => ligne({ echeance: decaler(ctx.aujourdhui, jours) })
    expect(ok(d(0), f('echeance', 'aujourdhui'))).toBe(true)
    // Semaine du lundi 21 au dimanche 27 septembre.
    expect(ok(d(-3), f('echeance', 'cette_semaine'))).toBe(true)
    expect(ok(d(3), f('echeance', 'cette_semaine'))).toBe(true)
    expect(ok(d(-4), f('echeance', 'cette_semaine'))).toBe(false)
    expect(ok(d(4), f('echeance', 'cette_semaine'))).toBe(false)
    expect(ok(d(6), f('echeance', 'ce_mois'))).toBe(true)
    expect(ok(d(7), f('echeance', 'ce_mois'))).toBe(false)
    expect(ok(d(-7), f('echeance', 'jours_passes', 7))).toBe(true)
    expect(ok(d(-8), f('echeance', 'jours_passes', 7))).toBe(false)
    expect(ok(d(1), f('echeance', 'jours_passes', 7))).toBe(false)
    expect(ok(d(7), f('echeance', 'jours_a_venir', 7))).toBe(true)
    expect(ok(d(-1), f('echeance', 'jours_a_venir', 7))).toBe(false)
  })

  it('checkbox : une case absente vaut faux', () => {
    expect(ok(ligne({}), f('urgent', 'egal', false))).toBe(true)
    expect(ok(ligne({ urgent: true }), f('urgent', 'egal', true))).toBe(true)
  })

  it('select, multiselect, relation', () => {
    const l = ligne({ statut: 'En cours', tags: ['pro', 'client'], client: ['c1'] })
    expect(ok(l, f('statut', 'egal', 'En cours'))).toBe(true)
    expect(ok(l, f('statut', 'parmi', ['À faire', 'En cours']))).toBe(true)
    expect(ok(l, f('statut', 'different_de', 'En cours'))).toBe(false)
    expect(ok(l, f('tags', 'contient', 'pro'))).toBe(true)
    expect(ok(l, f('tags', 'ne_contient_pas', 'perso'))).toBe(true)
    expect(ok(l, f('client', 'contient', 'c1'))).toBe(true)
  })

  it('une valeur invalide est non vide mais ne satisfait rien de positif', () => {
    const l = ligne({}, '---\nid: x1\nbudget: beaucoup\n---\n')
    expect(ok(l, f('budget', 'non_vide'))).toBe(true)
    expect(ok(l, f('budget', 'superieur', 0))).toBe(false)
    expect(ok(l, f('budget', 'different_de', 3))).toBe(true)
  })

  it('ignore un filtre sur une colonne disparue', () => {
    expect(ok(ligne({}), f('supprimee', 'egal', 'x'))).toBe(true)
  })
})

describe('trier', () => {
  const titres = (ls: LigneChargee[]) => ls.map((l) => l.cellules.titre?.etat === 'ok' ? l.cellules.titre.valeur : '∅')

  it('trie texte à la française, vides en bas dans les deux sens', () => {
    const ls = [ligne({ titre: 'été' }), ligne({}), ligne({ titre: 'Abricot' }), ligne({ titre: 'zèbre' })]
    expect(titres(trier(ls, schema, [{ colonne: 'titre', sens: 'asc' }]))).toEqual(['Abricot', 'été', 'zèbre', '∅'])
    expect(titres(trier(ls, schema, [{ colonne: 'titre', sens: 'desc' }]))).toEqual(['zèbre', 'été', 'Abricot', '∅'])
  })

  it('trie un select dans l’ordre de ses options', () => {
    const ls = [ligne({ titre: 'c', statut: 'Terminé' }), ligne({ titre: 'a', statut: 'À faire' }), ligne({ titre: 'b', statut: 'En cours' })]
    expect(titres(trier(ls, schema, [{ colonne: 'statut', sens: 'asc' }]))).toEqual(['a', 'b', 'c'])
  })

  it('applique plusieurs critères et reste stable', () => {
    const ls = [
      ligne({ titre: '1', budget: 5, statut: 'En cours' }),
      ligne({ titre: '2', budget: 5, statut: 'À faire' }),
      ligne({ titre: '3', budget: 1 }),
      ligne({ titre: '4', budget: 5, statut: 'À faire' }),
    ]
    const r = trier(ls, schema, [
      { colonne: 'budget', sens: 'desc' },
      { colonne: 'statut', sens: 'asc' },
    ])
    expect(titres(r)).toEqual(['2', '4', '1', '3'])
  })
})

describe('appliquerVue', () => {
  it('garde une ligne persistante hors filtre, marquée « sortira »', () => {
    const a = ligne({ titre: 'a', statut: 'En cours' })
    const b = ligne({ titre: 'b', statut: 'Terminé' })
    const filtres = [f('statut', 'egal', 'En cours')]
    expect(appliquerVue([a, b], schema, filtres, [], ctx).map((x) => x.ligne.id)).toEqual([a.id])
    expect(appliquerVue([a, b], schema, filtres, [], ctx, new Set([b.id]))).toEqual([
      { ligne: a, sortira: false },
      { ligne: b, sortira: true },
    ])
  })
})

describe('valeursHeritees', () => {
  it('reprend egal, parmi à une valeur et contient sur relation ; ignore le reste', () => {
    expect(
      valeursHeritees(schema, [
        f('statut', 'egal', 'En cours'),
        f('urgent', 'egal', true),
        f('budget', 'egal', '12'),
        f('echeance', 'egal', '2026-10-01'),
        f('client', 'contient', 'c1'),
        f('titre', 'contient', 'x'),
        f('echeance', 'avant', 'aujourdhui'),
        f('tags', 'contient', 'pro'),
        f('budget', 'superieur', 3),
      ]),
    ).toEqual({ statut: 'En cours', urgent: true, budget: 12, echeance: '2026-10-01', client: ['c1'] })
    expect(valeursHeritees(schema, [f('statut', 'parmi', ['À faire'])])).toEqual({ statut: 'À faire' })
    expect(valeursHeritees(schema, [f('statut', 'parmi', ['À faire', 'Terminé'])])).toEqual({})
    expect(valeursHeritees(schema, [f('echeance', 'egal', 'aujourdhui')])).toEqual({})
  })

  it('invariant 9 : une ligne créée depuis une vue filtrée sur egal / relation satisfait ces filtres', () => {
    const filtres = [
      f('statut', 'egal', 'Terminé'),
      f('urgent', 'egal', true),
      f('urgent', 'egal', 'true'),
      f('budget', 'egal', 42),
      f('titre', 'egal', 'Réunion'),
      f('echeance', 'egal', '2026-12-01'),
      f('client', 'contient', 'c1'),
      f('client', 'contient', 'c2'),
      f('statut', 'parmi', ['Terminé']),
    ]
    const creee = ligne(valeursHeritees(schema, filtres))
    for (const filtre of filtres) expect(ok(creee, filtre), JSON.stringify(filtre)).toBe(true)
  })
})

describe('filtreDePastille', () => {
  it('ne filtre rien tant que la pastille n’est pas réglée', () => {
    expect(filtreDePastille(schema, { colonne: 'statut' })).toBeNull()
    expect(filtreDePastille(schema, { colonne: 'statut', operateur: 'parmi', valeur: [] })).toBeNull()
    expect(filtreDePastille(schema, { colonne: 'titre', valeur: '' })).toBeNull()
    expect(filtreDePastille(schema, { colonne: 'echeance', operateur: 'entre', valeur: ['2026-01-01', ''] })).toBeNull()
    expect(filtreDePastille(schema, { colonne: 'supprimee', valeur: 'x' })).toBeNull()
  })

  it('prend l’opérateur par défaut du type, ou celui choisi', () => {
    expect(filtreDePastille(schema, { colonne: 'statut', valeur: ['En cours'] })).toEqual({ colonne: 'statut', operateur: 'parmi', valeur: ['En cours'] })
    expect(filtreDePastille(schema, { colonne: 'titre', valeur: 'nav' })).toEqual({ colonne: 'titre', operateur: 'contient', valeur: 'nav' })
    expect(filtreDePastille(schema, { colonne: 'echeance', operateur: 'cette_semaine' })).toEqual({ colonne: 'echeance', operateur: 'cette_semaine' })
    expect(filtreDePastille(schema, { colonne: 'urgent', valeur: false })).toEqual({ colonne: 'urgent', operateur: 'egal', valeur: false })
  })
})
