import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { ErreurSchema } from './schema-ecriture'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

const SCHEMA_PROJETS = `version: 1
id: projets
nom: Projets
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: code, nom: Code, type: text }
  - { cle: statut, nom: Statut, type: select, options: [{ label: En cours }] }
  - { cle: budget, nom: Budget, type: number }
  - { cle: client, nom: Client, type: relation, cible: clients, proprietaire: true, inverse: projets }
  - { cle: nb, nom: Nb tâches, type: rollup, relation: client, champ: titre, calcul: compter }
  - { cle: marge, nom: Marge, type: formula, expression: 'prop("budget") * 0.2' }
`

const SCHEMA_CLIENTS = `version: 1
id: clients
nom: Clients
champ_titre: nom
colonnes:
  - { cle: nom, nom: Nom, type: text }
  - { cle: projets, nom: Projets, type: relation, cible: projets, proprietaire: false, inverse: client }
  - { cle: budget_total, nom: Budget total, type: rollup, relation: projets, champ: budget, calcul: somme }
`

async function ouvrir() {
  const a = new AdaptateurCompteur({
    '_espace.yaml': 'version: 1\nbarre_laterale:\n  groupes:\n    - nom: Travail\n      bases: [projets]\n  hors_groupe: []\n',
    'projets/_schema.yaml': SCHEMA_PROJETS,
    'projets/navi--k2x9m4pq.md': '---\nid: k2x9m4pq\ntitre: Navi\ncode: NAV\nstatut: Terminé\nbudget: 100\n---\n',
    'projets/sinam--p4m1z8rt.md': '---\nid: p4m1z8rt\ntitre: sinam\n---\n',
    'clients/_schema.yaml': SCHEMA_CLIENTS,
  })
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier })
  a.ecritures = []
  return { a, espace }
}

const schemaDe = (espace: DepotEspace, base: string) => {
  const c = espace.etat().bases.get(base)!.chargement
  if (!c.ok) throw new Error(c.raison)
  return c.base.schema
}

describe('DepotEspace : barre latérale', () => {
  it('range les bases selon _espace.yaml, les autres hors groupe', async () => {
    const { espace } = await ouvrir()
    expect(espace.etat().groupes).toEqual([{ nom: 'Travail', bases: ['projets'] }])
    expect(espace.etat().horsGroupe).toEqual(['clients'])
  })

  it('invariant 4 : déplacer une base ne modifie que _espace.yaml', async () => {
    const { a, espace } = await ouvrir()
    await espace.placerBase('clients', 'Travail', 0)
    await espace.placerBase('projets', null)
    expect(new Set(a.ecritures)).toEqual(new Set(['_espace.yaml']))
    expect(espace.etat().groupes).toEqual([{ nom: 'Travail', bases: ['clients'] }])
    expect(espace.etat().horsGroupe).toEqual(['projets'])
  })

  it('crée une base : dossier, schéma avec titre, place dans la barre', async () => {
    const { a, espace } = await ouvrir()
    const id = await espace.creerBase('Lectures', 'Travail')
    expect(id).toBe('lectures')
    expect(a.ecritures).toEqual(['lectures/_schema.yaml', '_espace.yaml'])
    expect(schemaDe(espace, 'lectures')).toMatchObject({ nom: 'Lectures', champTitre: 'titre' })
    expect(espace.etat().groupes[0]!.bases).toEqual(['projets', 'lectures'])
  })

  it('ne réutilise jamais un dossier existant', async () => {
    const { espace } = await ouvrir()
    expect(await espace.creerBase('Projets')).toBe('projets-2')
  })

  it('renomme une base sans toucher à son dossier', async () => {
    const { a, espace } = await ouvrir()
    await espace.renommerBase('projets', 'Mes projets')
    expect(a.ecritures).toEqual(['projets/_schema.yaml'])
    expect(schemaDe(espace, 'projets').nom).toBe('Mes projets')
  })

  it('gère les groupes', async () => {
    const { espace } = await ouvrir()
    await espace.ajouterGroupe('Perso')
    await espace.renommerGroupe('Travail', 'Boulot')
    await espace.supprimerGroupe('Boulot')
    expect(espace.etat().groupes).toEqual([{ nom: 'Perso', bases: [] }])
    expect(espace.etat().horsGroupe).toEqual(['projets', 'clients'])
  })
})

describe('DepotEspace : colonnes', () => {
  it('invariant 3 : renommer une colonne ne modifie aucun fichier de ligne', async () => {
    const { a, espace } = await ouvrir()
    await espace.renommerColonne('projets', 'statut', 'État')
    expect(a.ecritures).toEqual(['projets/_schema.yaml'])
    const ligne = espace.etat().bases.get('projets')!.depot!.lignes()[0]!
    expect(ligne.cellules.statut).toBeDefined()
  })

  it('ajoute une colonne avec une clé dérivée du nom', async () => {
    const { a, espace } = await ouvrir()
    const cle = await espace.ajouterColonne('projets', 'Date de fin', 'date')
    expect(cle).toBe('date_de_fin')
    expect(a.ecritures).toEqual(['projets/_schema.yaml'])
    expect(schemaDe(espace, 'projets').colonnes.at(-1)).toEqual({ cle, nom: 'Date de fin', type: 'date' })
  })

  it('réordonne les colonnes', async () => {
    const { espace } = await ouvrir()
    await espace.deplacerColonne('projets', 'budget', 0)
    expect(schemaDe(espace, 'projets').colonnes[0]!.cle).toBe('budget')
  })

  it('supprime une colonne et son contenu dans les seuls fichiers concernés', async () => {
    const { a, espace } = await ouvrir()
    const n = await espace.supprimerColonne('projets', 'code')
    expect(n).toBe(1)
    expect(a.ecritures).toEqual(['projets/navi--k2x9m4pq.md', 'projets/_schema.yaml'])
    expect(await a.lire('projets/navi--k2x9m4pq.md')).toBe('---\nid: k2x9m4pq\ntitre: Navi\nstatut: Terminé\nbudget: 100\n---\n')
    expect(schemaDe(espace, 'projets').colonnes.map((c) => c.cle)).not.toContain('code')
  })

  it('refuse de supprimer la colonne titre', async () => {
    const { a, espace } = await ouvrir()
    await expect(espace.supprimerColonne('projets', 'titre')).rejects.toThrow(ErreurSchema)
    expect(a.ecritures).toEqual([])
  })

  it('liste les colonnes calculées dépendantes, y compris dans une autre base', async () => {
    const { espace } = await ouvrir()
    expect(espace.dependants('projets', 'budget')).toEqual(['Clients › Budget total', 'Projets › Marge'])
    expect(espace.dependants('projets', 'client')).toEqual(['Projets › Nb tâches'])
    expect(espace.dependants('projets', 'code')).toEqual([])
  })

  it('change la colonne titre et renomme les fichiers', async () => {
    const { a, espace } = await ouvrir()
    await espace.changerTitre('projets', 'code')
    expect(a.ecritures).toEqual(['projets/_schema.yaml', 'projets/navi--k2x9m4pq.md → projets/nav--k2x9m4pq.md', 'projets/sinam--p4m1z8rt.md → projets/p4m1z8rt.md'])
    await expect(espace.changerTitre('projets', 'budget')).rejects.toThrow(ErreurSchema)
  })

  it('ajoute une option : une valeur jusque-là invalide devient valide', async () => {
    const { espace } = await ouvrir()
    const depot = espace.etat().bases.get('projets')!.depot!
    expect(depot.lignes()[0]!.cellules.statut).toMatchObject({ etat: 'invalide' })
    const option = await espace.ajouterOption('projets', 'statut', 'Terminé')
    expect(option).toEqual({ label: 'Terminé', couleur: 'bleu' })
    expect(depot.lignes()[0]!.cellules.statut).toEqual({ etat: 'ok', valeur: 'Terminé' })
    expect(await espace.ajouterOption('projets', 'statut', 'Terminé')).toEqual(option)
  })

  it('une opération refusée ne bloque pas les suivantes', async () => {
    const { espace } = await ouvrir()
    await expect(espace.supprimerColonne('projets', 'titre')).rejects.toThrow()
    await espace.renommerColonne('projets', 'code', 'Référence')
    expect(schemaDe(espace, 'projets').colonnes[1]!.nom).toBe('Référence')
  })
})
