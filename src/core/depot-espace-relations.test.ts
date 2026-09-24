import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { correspond } from './filtres'
import { ErreurSchema } from './schema-ecriture'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  return { a, espace }
}

const calcul = (e: DepotEspace, base: string, id: string, cle: string) => e.etat().calculs.get(base)?.get(id)?.[cle]
const schema = (e: DepotEspace, base: string) => e.etat().bases.get(base)!.depot!.schema

describe('relations : édition des liens', () => {
  it('invariant 2 : lier depuis le côté propriétaire modifie exactement un fichier', async () => {
    const { a, espace } = await ouvrir()
    espace.modifierRelation('taches', 't0000003', 'projet', ['p0000002', 'p0000001'])
    await espace.vider()
    expect(a.ecritures).toEqual(['taches/c--t0000003.md'])
  })

  it('invariant 2 : lier depuis le côté non propriétaire écrit dans le seul fichier de la ligne liée', async () => {
    const { a, espace } = await ouvrir()
    // Ajoute la tâche C au projet Seul, depuis le projet.
    espace.modifierRelation('projets', 'p0000003', 'taches', ['t0000003'])
    expect(calcul(espace, 'projets', 'p0000003', 'taches')).toEqual({ etat: 'ok', valeur: ['t0000003'] })
    await espace.vider()
    expect(a.ecritures).toEqual(['taches/c--t0000003.md'])
    expect(await a.lire('taches/c--t0000003.md')).toContain('projet: [p0000002, zzzzzzzz, p0000003]')
  })

  it('invariant 2 : délier depuis le côté non propriétaire, un fichier par lien retiré', async () => {
    const { a, espace } = await ouvrir()
    espace.modifierRelation('projets', 'p0000001', 'taches', ['t0000002'])
    await espace.vider()
    expect(a.ecritures).toEqual(['taches/a--t0000001.md'])
    expect(await a.lire('taches/a--t0000001.md')).not.toContain('projet')
    expect(calcul(espace, 'projets', 'p0000001', 'taches')).toEqual({ etat: 'ok', valeur: ['t0000002'] })
  })

  it('les rollups suivent immédiatement une modification', async () => {
    const { espace } = await ouvrir()
    expect(calcul(espace, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 8 })
    const b = espace.etat().bases.get('taches')!.depot!
    b.modifier('taches/a--t0000001.md', 'heures', 10)
    expect(calcul(espace, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 15 })
    expect(calcul(espace, 'clients', 'c0000001', 'heures')).toEqual({ etat: 'ok', valeur: 17 })
  })

  it('invariant 9 : une ligne créée avec un filtre « contient » sur une relation non propriétaire est liée', async () => {
    const { a, espace } = await ouvrir()
    const filtre = { colonne: 'taches', operateur: 'contient' as const, valeur: 't0000003' }
    const ligne = await espace.creerLigne('projets', { titre: 'Nouveau', taches: ['t0000003'] })
    await espace.vider()
    expect(a.ecritures).toEqual([ligne.chemin, 'taches/c--t0000003.md'])
    const enrichie = { ...ligne, cellules: { ...ligne.cellules, ...espace.etat().calculs.get('projets')!.get(ligne.id) } }
    expect(correspond(enrichie, schema(espace, 'projets'), filtre, { aujourdhui: '2026-09-24' })).toBe(true)
  })
})

describe('relations : configuration', () => {
  it('crée une relation et sa colonne miroir', async () => {
    const { a, espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Client', 'clients')
    expect(a.ecritures).toEqual(['taches/_schema.yaml', 'clients/_schema.yaml'])
    expect(schema(espace, 'taches').colonnes.at(-1)).toEqual({
      cle,
      nom: 'Client',
      type: 'relation',
      cible: 'clients',
      proprietaire: true,
      inverse: 'taches',
    })
    expect(schema(espace, 'clients').colonnes.at(-1)).toEqual({
      cle: 'taches',
      nom: 'Tâches',
      type: 'relation',
      cible: 'taches',
      proprietaire: false,
      inverse: cle,
    })
  })

  it('refuse une auto-relation', async () => {
    const { espace } = await ouvrir()
    await expect(espace.ajouterRelation('taches', 'Parent', 'taches')).rejects.toThrow(ErreurSchema)
  })

  it('supprime une relation depuis le côté non propriétaire : deux colonnes, ids retirés côté propriétaire', async () => {
    const { a, espace } = await ouvrir()
    const n = await espace.supprimerColonne('projets', 'taches')
    expect(n).toBe(3)
    expect(a.ecritures.filter((e) => e.endsWith('.md')).sort()).toEqual(['taches/a--t0000001.md', 'taches/b--t0000002.md', 'taches/c--t0000003.md'])
    expect(schema(espace, 'taches').colonnes.map((c) => c.cle)).not.toContain('projet')
    expect(schema(espace, 'projets').colonnes.map((c) => c.cle)).not.toContain('taches')
    // Le rollup qui en dépendait passe en erreur, il n'est pas supprimé.
    expect(calcul(espace, 'projets', 'p0000001', 'heures')).toMatchObject({ etat: 'invalide' })
  })

  it('crée un rollup', async () => {
    const { espace } = await ouvrir()
    const cle = await espace.ajouterRollup('taches', 'Client du projet', 'projet', 'client', 'afficher')
    expect(calcul(espace, 'taches', 't0000001', cle)).toEqual({ etat: 'ok', valeur: ['c0000001'] })
  })

  it('invariant 7 : refuse un rollup qui fermerait une boucle', async () => {
    // Schéma modifié à la main : Projets › Boucle remonte Clients › retour, qui n'existe pas encore.
    const { espace } = await ouvrir({
      ...FICHIERS_RELATIONS,
      'projets/_schema.yaml': FICHIERS_RELATIONS['projets/_schema.yaml'] + '  - { cle: boucle, nom: Boucle, type: rollup, relation: client, champ: retour, calcul: somme }\n',
    })
    await expect(espace.ajouterRollup('clients', 'Retour', 'projets', 'boucle', 'somme')).rejects.toThrow(
      /Rollup refusé\. Boucle de dépendances : .*Clients › Retour.*Projets › Boucle|Rollup refusé\. Boucle de dépendances : .*Projets › Boucle.*Clients › Retour/,
    )
    expect(schema(espace, 'clients').colonnes.map((c) => c.cle)).not.toContain('retour')
  })
})
