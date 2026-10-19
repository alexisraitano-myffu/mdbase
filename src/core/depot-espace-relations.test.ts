import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { correspond } from './filtres'
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

describe('rollups : modification', () => {
  it('change le calcul d’un rollup existant', async () => {
    const { a, espace } = await ouvrir()
    await espace.modifierRollup('projets', 'heures', { calcul: 'max' })
    expect(a.ecritures).toEqual(['projets/_schema.yaml'])
    expect(await a.lire('projets/_schema.yaml')).toContain('{ cle: heures, nom: Heures, type: rollup, relation: taches, champ: heures, calcul: max }')
    expect(calcul(espace, 'projets', 'p0000001', 'heures')).toEqual({ etat: 'ok', valeur: 5 })
    // Le rollup de rollup des clients suit.
    expect(calcul(espace, 'clients', 'c0000001', 'heures')).toEqual({ etat: 'ok', valeur: 7 })
  })

  it('change la colonne remontée, et retire le filtre quand la relation change', async () => {
    const { a, espace } = await ouvrir()
    await espace.modifierRollup('projets', 'ouvertes', { champ: 'heures', calcul: 'somme' })
    expect(calcul(espace, 'projets', 'p0000001', 'ouvertes')).toEqual({ etat: 'ok', valeur: 3 })
    await espace.modifierRollup('projets', 'ouvertes', { relation: 'client', champ: 'nom', calcul: 'afficher' })
    expect(await a.lire('projets/_schema.yaml')).not.toContain('filtre')
    expect(calcul(espace, 'projets', 'p0000001', 'ouvertes')).toEqual({ etat: 'ok', valeur: ['Acme'] })
  })

  it('invariant 7 : refuse une modification qui créerait une boucle', async () => {
    const { espace } = await ouvrir()
    // Projets › Heures remonterait Tâches › Total, qui remonte Projets › Heures.
    await espace.ajouterRollup('taches', 'Total', 'projet', 'heures', 'somme')
    await expect(espace.modifierRollup('projets', 'heures', { champ: 'total' })).rejects.toThrow(/Modification refusée\. Boucle de dépendances/)
    expect(schema(espace, 'projets').colonnes.find((c) => c.cle === 'heures')).toMatchObject({ champ: 'heures' })
  })

  it('rollup de rollup créé depuis zéro : clients ← projets ← tâches', async () => {
    const { espace } = await ouvrir()
    const nb = await espace.ajouterRollup('projets', 'Tâches faites', 'taches', 'fait', 'pourcent_coches')
    const moyenne = await espace.ajouterRollup('clients', 'Avancement moyen', 'projets', nb, 'moyenne')
    // Navi : 1 tâche faite sur 2 = 50 % ; sinam : 0 %. Moyenne Acme : 25 %.
    expect(calcul(espace, 'clients', 'c0000001', moyenne)).toEqual({ etat: 'ok', valeur: 25 })
  })
})

describe('auto-relation (relation d’une base vers elle-même)', () => {
  it('crée les deux colonnes dans le même schéma ; le côté miroir se calcule', async () => {
    const { espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Tâche parente', 'taches', 'Sous-tâches')
    const parente = schema(espace, 'taches').colonnes.find((c) => c.cle === cle)
    expect(parente).toMatchObject({ type: 'relation', cible: 'taches', proprietaire: true, inverse: 'sous_taches' })
    expect(schema(espace, 'taches').colonnes.find((c) => c.cle === 'sous_taches')).toMatchObject({ type: 'relation', cible: 'taches', proprietaire: false, inverse: cle })
    espace.modifierRelation('taches', 't0000002', cle, ['t0000001'])
    espace.modifierRelation('taches', 't0000001', 'sous_taches', ['t0000002', 't0000003'])
    expect(calcul(espace, 'taches', 't0000001', 'sous_taches')).toEqual({ etat: 'ok', valeur: ['t0000002', 't0000003'] })
  })

  it('sans nom de miroir, « <nom> (inverse) » ; une clé déjà prise est dédoublonnée', async () => {
    const { espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Liée', 'taches')
    const miroir = schema(espace, 'taches').colonnes.find((c) => c.type === 'relation' && c.inverse === cle)
    expect(miroir?.nom).toBe('Liée (inverse)')
    expect(miroir?.cle).not.toBe(cle)
  })

  it('une ligne ne se lie jamais à elle-même', async () => {
    const { espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Tâche parente', 'taches', 'Sous-tâches')
    espace.modifierRelation('taches', 't0000001', cle, ['t0000001', 't0000002'])
    espace.modifierRelation('taches', 't0000003', 'sous_taches', ['t0000003'])
    await espace.vider()
    const a = espace.etat().bases.get('taches')!.depot!.lignes().find((l) => l.id === 't0000001')!
    expect(a.cellules[cle]).toEqual({ etat: 'ok', valeur: ['t0000002'] })
    expect(calcul(espace, 'taches', 't0000003', 'sous_taches')).toBeUndefined()
  })

  it('supprimer l’auto-relation retire ses deux colonnes et les ids des fichiers', async () => {
    const { a, espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Tâche parente', 'taches', 'Sous-tâches')
    espace.modifierRelation('taches', 't0000002', cle, ['t0000001'])
    await espace.vider()
    await espace.supprimerColonne('taches', 'sous_taches')
    expect(schema(espace, 'taches').colonnes.some((c) => c.cle === cle || c.cle === 'sous_taches')).toBe(false)
    expect(await a.lire('taches/b--t0000002.md')).not.toContain('tache_parente')
  })

  it('dupliquer la base : l’auto-relation vise la copie, liens gardés', async () => {
    const { espace } = await ouvrir()
    const cle = await espace.ajouterRelation('taches', 'Tâche parente', 'taches', 'Sous-tâches')
    espace.modifierRelation('taches', 't0000002', cle, ['t0000001'])
    await espace.vider()
    const copie = await espace.dupliquerBase('taches')
    expect(schema(espace, copie).colonnes.find((c) => c.cle === cle)).toMatchObject({ cible: copie, proprietaire: true, inverse: 'sous_taches' })
    expect(schema(espace, copie).colonnes.find((c) => c.cle === 'sous_taches')).toMatchObject({ cible: copie, proprietaire: false })
    expect(calcul(espace, copie, 't0000001', 'sous_taches')).toEqual({ etat: 'ok', valeur: ['t0000002'] })
    // La base d'origine ne gagne pas de colonne miroir vers la copie.
    expect(schema(espace, 'taches').colonnes.some((c) => c.type === 'relation' && c.cible === copie)).toBe(false)
  })
})

describe('relation créée à la volée (masquée dans l’affichage existant)', () => {
  it('masque les deux colonnes dans les vues des deux bases, « masqué si vide » dans leurs mises en page', async () => {
    const fichiers = {
      ...FICHIERS_RELATIONS,
      'clients/_vues/tableau.yaml': 'id: tableau\nnom: Tableau\ntype: tableau\ncolonnes_masquees: [heures]\n',
      'taches/_pages/defaut.yaml': 'id: defaut\nnom: Par défaut\ndefaut: true\nchamps:\n  - { cle: statut, affichage: visible }\n',
    }
    const { a, espace } = await ouvrir(fichiers)
    const { cle, miroir } = await espace.ajouterRelationDiscrete('taches', 'Clients', 'clients')
    expect(espace.etat().bases.get('clients')!.vues[0]!.masquees).toEqual(['heures', miroir])
    expect(espace.etat().bases.get('taches')!.vues.every((v) => v.masquees?.includes(cle))).toBe(true)
    expect(await a.lire('clients/_vues/tableau.yaml')).toContain(`colonnes_masquees: [ heures, ${miroir} ]`)
    expect(await a.lire('taches/_pages/defaut.yaml')).toContain(`{ cle: ${cle}, affichage: masque_si_vide }`)
    expect(espace.etat().bases.get('taches')!.pages[0]!.champs.at(-1)).toEqual({ cle, affichage: 'masque_si_vide' })
  })
})
