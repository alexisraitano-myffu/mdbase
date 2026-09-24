import { describe, expect, it } from 'vitest'
import { chargerBase } from './base'
import { DepotBase } from './depot-base'
import { ErreurEcriture } from './ligne'
import { TEXTE_SCHEMA_PROJETS } from './fixtures/schema-projets'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir() {
  const a = new AdaptateurCompteur({
    'projets/_schema.yaml': TEXTE_SCHEMA_PROJETS,
    'projets/navi--k2x9m4pq.md': '---\nid: k2x9m4pq\ntitre: Navi\nstatut: En cours\n---\nCorps\n',
  })
  const r = await chargerBase(a, 'projets')
  if (!r.ok) throw new Error(r.raison)
  const m = minuteur()
  const depot = new DepotBase(a, r.base.schema, r.base.lignes, { aleatoire, planifier: m.planifier })
  return { a, depot, m }
}

const NAVI = 'projets/navi--k2x9m4pq.md'

describe('DepotBase', () => {
  it('affiche une modification immédiatement et ne l’écrit qu’après le délai', async () => {
    const { a, depot, m } = await ouvrir()
    let notifications = 0
    depot.abonner(() => notifications++)
    depot.modifier(NAVI, 'statut', 'Terminé')
    expect(depot.lignes()[0]!.cellules.statut).toEqual({ etat: 'ok', valeur: 'Terminé' })
    expect(notifications).toBe(1)
    expect(a.ecritures).toEqual([])
    m.avancer()
    await depot.vider()
    expect(await a.lire(NAVI)).toContain('statut: Terminé')
  })

  it('regroupe les frappes rapides en une seule écriture', async () => {
    const { a, depot, m } = await ouvrir()
    for (const t of ['N', 'Na', 'Nav', 'Navi 2']) depot.modifier(NAVI, 'titre', t)
    expect(m.enAttente()).toBe(1)
    m.avancer()
    await depot.vider()
    expect(a.ecritures).toEqual([NAVI])
    expect(await a.lire(NAVI)).toContain('titre: Navi 2')
  })

  it('vider écrit ce qui est en attente sans attendre le délai', async () => {
    const { a, depot } = await ouvrir()
    depot.modifier(NAVI, 'urgent', true)
    await depot.vider()
    expect(await a.lire(NAVI)).toContain('urgent: true')
  })

  it('vider un champ le retire de l’affichage et du fichier', async () => {
    const { a, depot } = await ouvrir()
    depot.modifier(NAVI, 'statut', undefined)
    expect(depot.lignes()[0]!.cellules.statut).toBeUndefined()
    await depot.vider()
    expect(await a.lire(NAVI)).not.toContain('statut')
  })

  it('garde l’instantané stable tant que rien ne change', async () => {
    const { depot } = await ouvrir()
    expect(depot.lignes()).toBe(depot.lignes())
  })

  it('refuse de modifier une colonne calculée ou non propriétaire', async () => {
    const { depot } = await ouvrir()
    expect(() => depot.modifier(NAVI, 'nb_taches', 3)).toThrow(ErreurEcriture)
    expect(() => depot.modifier(NAVI, 'taches', ['a'])).toThrow(ErreurEcriture)
  })

  it('crée une ligne immédiatement, en fin de liste', async () => {
    const { a, depot } = await ouvrir()
    const ligne = await depot.creer({ statut: 'À faire' })
    expect(ligne.id).toMatch(/^[a-z][a-z0-9]{7}$/)
    expect(ligne.chemin).toBe(`projets/${ligne.id}.md`)
    expect(await a.lire(ligne.chemin)).toBe(`---\nid: ${ligne.id}\nstatut: À faire\n---\n`)
    expect(depot.lignes().at(-1)!.id).toBe(ligne.id)
  })

  it('renomme le fichier selon le titre, écriture en attente comprise', async () => {
    const { a, depot } = await ouvrir()
    const ligne = await depot.creer()
    depot.modifier(ligne.chemin, 'titre', 'Réunion équipe')
    await depot.renommerSelonTitre(ligne.chemin)
    const attendu = `projets/reunion-equipe--${ligne.id}.md`
    expect(depot.lignes().at(-1)!.chemin).toBe(attendu)
    expect(await a.lire(attendu)).toContain('titre: Réunion équipe')
    await expect(a.lire(ligne.chemin)).rejects.toThrow()
  })

  it('ne renomme rien si le nom est déjà bon', async () => {
    const { a, depot } = await ouvrir()
    await depot.renommerSelonTitre(NAVI)
    expect(depot.lignes()[0]!.chemin).toBe(NAVI)
    expect(a.ecritures).toEqual([])
  })

  it('continue à modifier une ligne après son renommage', async () => {
    const { a, depot } = await ouvrir()
    depot.modifier(NAVI, 'titre', 'Navi v2')
    await depot.renommerSelonTitre(NAVI)
    const nouveau = 'projets/navi-v2--k2x9m4pq.md'
    depot.modifier(nouveau, 'budget', 10)
    await depot.vider()
    expect(await a.lire(nouveau)).toBe('---\nid: k2x9m4pq\ntitre: Navi v2\nstatut: En cours\nbudget: 10\n---\nCorps\n')
  })

  it('signale une écriture impossible sans perdre l’affichage', async () => {
    const { a, depot } = await ouvrir()
    await a.ecrire(NAVI, 'plus de frontmatter') // abîmé par la synchro
    depot.modifier(NAVI, 'statut', 'Terminé')
    await depot.vider()
    expect(depot.erreur()).toContain(NAVI)
    expect(await a.lire(NAVI)).toBe('plus de frontmatter')
  })
})
