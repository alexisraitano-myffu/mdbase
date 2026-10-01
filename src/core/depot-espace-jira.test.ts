import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { synchroniser } from './jira/synchro'

// Base Jira dans l'app (spec §16) : créée et réglée ici, remplie par le script,
// en lecture seule pour ses lignes et ses colonnes.

const SOURCE = { type: 'jira', site: 'exemple.atlassian.net', projets: ['PRVE'] }

async function ouvrir() {
  const a = new AdaptateurCompteur(FICHIERS_RELATIONS)
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-24' })
  const id = await espace.creerBaseJira('Tickets', SOURCE)
  // Le script passe : un ticket écrit dans la base, relu par l'app.
  const client = {
    chercher: async () => ({ tickets: [{ id: '10001', key: 'PRVE-1', fields: { summary: 'Corriger la connexion', status: { name: 'À faire', statusCategory: { key: 'new' } } } }] }),
    champSprint: async () => undefined,
  }
  await synchroniser(a, id, client, { maintenant: () => '2026-09-24T10:00', aleatoire })
  await espace.rafraichir()
  a.ecritures = []
  return { a, espace, id, depot: espace.etat().bases.get(id)!.depot! }
}

describe('base Jira dans l’app', () => {
  it('se crée avec sa source et ses colonnes, et montre les tickets écrits par le script', async () => {
    const { espace, id, depot } = await ouvrir()
    expect(id).toBe('tickets')
    expect(depot.schema.source).toEqual(SOURCE)
    expect(depot.schema.colonnes.map((c) => c.cle)).toContain('jira_id')
    // Vue de départ : les tickets qui ont bougé en tête, sans les colonnes de correspondance.
    const vue = espace.etat().bases.get(id)!.vues[0]!
    expect(vue.tris).toEqual([{ colonne: 'bouge', sens: 'desc' }])
    expect(vue.masquees).toContain('jira_id')
    expect(depot.lignes().map((l) => l.cellules.titre)).toEqual([{ etat: 'ok', valeur: 'PRVE-1 Corriger la connexion' }])
    expect(espace.etat().bases.get(id)!.synchro).toMatchObject({ derniere: '2026-09-24T10:00', tickets: 1 })
  })

  it('suit `_synchro.yaml` à la relecture, même quand aucun ticket ne change', async () => {
    const { a, espace, id } = await ouvrir()
    await a.ecrire('tickets/_synchro.yaml', 'derniere: "2026-09-24T10:05"\ntickets: 1\nerreur: "Jira : 401"\n')
    expect(await espace.rafraichir()).toBe(true)
    expect(espace.etat().bases.get(id)!.synchro).toEqual({ derniere: '2026-09-24T10:05', tickets: 1, erreur: 'Jira : 401' })
    expect(await espace.rafraichir()).toBe(false)
  })

  it('refuse toute écriture de ligne : cellule, corps, création, suppression', async () => {
    const { a, depot } = await ouvrir()
    const chemin = depot.lignes()[0]!.chemin
    expect(() => depot.modifier(chemin, 'resume', 'autre')).toThrow(/lecture seule/)
    expect(() => depot.modifierCorps(chemin, 'autre')).toThrow(/lecture seule/)
    await expect(depot.creer({ titre: 'X' })).rejects.toThrow(/lecture seule/)
    await expect(depot.supprimer(chemin)).rejects.toThrow(/lecture seule/)
    await expect(depot.renommerSelonTitre(chemin)).rejects.toThrow(/lecture seule/)
    expect(a.ecritures).toEqual([])
  })

  it('refuse les changements de colonnes, mais accepte une relation vers elle et ses réglages de source', async () => {
    const { a, espace, id, depot } = await ouvrir()
    await expect(espace.ajouterColonne(id, 'Note', 'text')).rejects.toThrow(/ses colonnes ne se modifient pas/)
    await expect(espace.renommerColonne(id, 'statut', 'État Jira')).rejects.toThrow(/ses colonnes/)
    await expect(espace.supprimerColonne(id, 'labels')).rejects.toThrow(/ses colonnes/)
    await expect(espace.ajouterRelation(id, 'Tâches', 'taches')).rejects.toThrow(/ses colonnes/)
    expect(a.ecritures).toEqual([])

    // Une relation depuis une autre base : la colonne miroir de la base Jira est calculée.
    const cle = await espace.ajouterRelation('taches', 'Ticket', id)
    expect(depot.schema.colonnes.find((c) => c.type === 'relation')).toMatchObject({ cible: 'taches', proprietaire: false, inverse: cle })
    const ligneTache = espace.etat().bases.get('taches')!.depot!.lignes()[0]!
    espace.etat().bases.get('taches')!.depot!.modifier(ligneTache.chemin, cle, [depot.lignes()[0]!.id])

    await espace.modifierSource(id, { ...SOURCE, projets: ['PRVE', 'OPS'], jql: 'labels = support' })
    expect(espace.etat().bases.get(id)!.depot!.schema.source).toEqual({ ...SOURCE, projets: ['PRVE', 'OPS'], jql: 'labels = support' })
    expect(await a.lire('tickets/_schema.yaml')).toContain('projets: [ PRVE, OPS ]')
  })
})
