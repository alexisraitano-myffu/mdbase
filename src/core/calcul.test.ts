import { describe, expect, it } from 'vitest'
import { AdaptateurMemoire } from './adaptateur-memoire'
import { chargerBase } from './base'
import { agreger, calculer, type BaseACalculer } from './calcul'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import type { Colonne } from './schema'
import type { Cellule, Valeur } from './valeurs'

const ctx = { aujourdhui: '2026-09-24' }

async function espace(fichiers = FICHIERS_RELATIONS) {
  const a = new AdaptateurMemoire(fichiers)
  const bases = new Map<string, BaseACalculer>()
  for (const id of ['clients', 'projets', 'taches']) {
    const r = await chargerBase(a, id)
    if (!r.ok) throw new Error(r.raison)
    bases.set(id, { schema: r.base.schema, lignes: r.base.lignes })
  }
  return bases
}

const valeur = (c: ReturnType<typeof calculer>, base: string, id: string, cle: string) => c.get(base)?.get(id)?.[cle]

describe('calculer', () => {
  it('calcule le côté non propriétaire d’une relation', async () => {
    const c = calculer(await espace(), ctx)
    expect(valeur(c, 'projets', 'p0000001', 'taches')).toEqual({ etat: 'ok', valeur: ['t0000001', 't0000002'] })
    expect(valeur(c, 'projets', 'p0000002', 'taches')).toEqual({ etat: 'ok', valeur: ['t0000003'] })
    expect(valeur(c, 'projets', 'p0000003', 'taches')).toBeUndefined()
    expect(valeur(c, 'clients', 'c0000001', 'projets')).toEqual({ etat: 'ok', valeur: ['p0000001', 'p0000002'] })
  })

  it('calcule un rollup, avec son filtre', async () => {
    const c = calculer(await espace(), ctx)
    expect(valeur(c, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 8 })
    // Tâche B terminée : exclue ; tâche A restante.
    expect(valeur(c, 'projets', 'p0000001', 'ouvertes')).toEqual({ etat: 'ok', valeur: 1 })
    // Tâche C sans statut : « différent de Terminé » l'inclut.
    expect(valeur(c, 'projets', 'p0000002', 'ouvertes')).toEqual({ etat: 'ok', valeur: 1 })
    expect(valeur(c, 'projets', 'p0000003', 'ouvertes')).toEqual({ etat: 'ok', valeur: 0 })
  })

  it('calcule un rollup de rollup', async () => {
    const c = calculer(await espace(), ctx)
    // Acme : Navi (3 + 5) + sinam (2).
    expect(valeur(c, 'clients', 'c0000001', 'heures')).toEqual({ etat: 'ok', valeur: 10 })
    expect(valeur(c, 'clients', 'c0000002', 'heures')).toBeUndefined()
  })

  it('ignore un lien cassé dans le calcul', async () => {
    // La tâche C pointe aussi vers zzzzzzzz, qui n'existe pas.
    const c = calculer(await espace(), ctx)
    expect([...c.get('projets')!.keys()]).not.toContain('zzzzzzzz')
  })

  it('passe en erreur un rollup dont la relation a été supprimée', async () => {
    const fichiers = {
      ...FICHIERS_RELATIONS,
      'projets/_schema.yaml': FICHIERS_RELATIONS['projets/_schema.yaml']!.replace(/ {2}- \{ cle: taches.*\n/, ''),
    }
    const c = calculer(await espace(fichiers), ctx)
    expect(valeur(c, 'projets', 'p0000001', 'heures')).toMatchObject({ etat: 'invalide', raison: 'Relation « taches » supprimée' })
  })

  it('passe en erreur les colonnes prises dans une boucle, calcule les autres', async () => {
    const fichiers = {
      ...FICHIERS_RELATIONS,
      'projets/_schema.yaml': FICHIERS_RELATIONS['projets/_schema.yaml'] + '  - { cle: boucle, nom: Boucle, type: rollup, relation: client, champ: retour, calcul: afficher }\n',
      'clients/_schema.yaml': FICHIERS_RELATIONS['clients/_schema.yaml'] + '  - { cle: retour, nom: Retour, type: rollup, relation: projets, champ: boucle, calcul: afficher }\n',
    }
    const c = calculer(await espace(fichiers), ctx)
    expect(valeur(c, 'projets', 'p0000001', 'boucle')).toMatchObject({ etat: 'invalide' })
    expect(valeur(c, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 8 })
  })
})

describe('agreger', () => {
  const nombre: Colonne = { cle: 'n', nom: 'N', type: 'number' }
  const caseC: Colonne = { cle: 'c', nom: 'C', type: 'checkbox' }
  const date: Colonne = { cle: 'd', nom: 'D', type: 'date' }
  const tags: Colonne = { cle: 't', nom: 'T', type: 'multiselect', options: [] }
  const ok = (valeur: unknown): Cellule => ({ etat: 'ok', valeur: valeur as Valeur })
  const v = (c: Cellule | undefined) => (c?.etat === 'ok' ? c.valeur : c)

  it('nombres', () => {
    const cs = [ok(4), ok(1), undefined, ok(7)]
    expect(v(agreger('somme', nombre, cs))).toBe(12)
    expect(v(agreger('moyenne', nombre, cs))).toBe(4)
    expect(v(agreger('mediane', nombre, cs))).toBe(4)
    expect(v(agreger('mediane', nombre, [ok(1), ok(2)]))).toBe(1.5)
    expect(v(agreger('min', nombre, cs))).toBe(1)
    expect(v(agreger('max', nombre, cs))).toBe(7)
    expect(v(agreger('amplitude', nombre, cs))).toBe(6)
    expect(agreger('somme', nombre, [undefined])).toBeUndefined()
  })

  it('comptages', () => {
    const cs = [ok(['a', 'b']), ok(['a']), undefined]
    expect(v(agreger('compter', tags, cs))).toBe(3)
    expect(v(agreger('compter_valeurs', tags, cs))).toBe(3)
    expect(v(agreger('compter_uniques', tags, cs))).toBe(2)
    expect(v(agreger('compter_vides', tags, cs))).toBe(1)
    expect(v(agreger('compter_non_vides', tags, cs))).toBe(2)
    expect(v(agreger('compter', tags, []))).toBe(0)
  })

  it('pourcentages de cases cochées (une case absente est décochée)', () => {
    const cs = [ok(true), undefined, ok(true), ok(false)]
    expect(v(agreger('pourcent_coches', caseC, cs))).toBe(50)
    expect(v(agreger('pourcent_non_coches', caseC, cs))).toBe(50)
    expect(v(agreger('compter_vides', caseC, cs))).toBe(2)
    expect(agreger('pourcent_coches', caseC, [])).toBeUndefined()
  })

  it('dates et affichage', () => {
    const cs = [ok('2026-10-01'), ok('2026-09-01T10:00'), undefined]
    expect(v(agreger('date_plus_tot', date, cs))).toBe('2026-09-01T10:00')
    expect(v(agreger('date_plus_tard', date, cs))).toBe('2026-10-01')
    expect(v(agreger('afficher', date, cs))).toEqual(['2026-10-01', '2026-09-01T10:00'])
    expect(v(agreger('afficher', caseC, [ok(true), ok(false)]))).toEqual(['☑'])
  })

  it('signale un calcul inconnu', () => {
    expect(agreger('moyenne_geometrique', nombre, [])).toMatchObject({ etat: 'invalide' })
  })
})
