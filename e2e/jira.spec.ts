import { webcrypto } from 'node:crypto'
import { AdaptateurMemoire } from '../src/core/adaptateur-memoire'
import { synchroniser, type ClientJira } from '../src/core/jira/synchro'
import type { TicketJira } from '../src/core/jira/ticket'
import { expect, test, type Espace } from './espace'

// Base Jira (spec §16) : créée dans l'app, remplie par le script (simulé ici
// par le vrai cœur de synchro, sur une copie en mémoire), en lecture seule.

function ticket(id: string, key: string, resume: string, statut: [string, string], f: Record<string, unknown> = {}): TicketJira {
  return {
    id,
    key,
    fields: {
      summary: resume,
      status: { name: statut[0], statusCategory: { key: statut[1] } },
      issuetype: { name: 'Story' },
      priority: { name: 'Moyenne' },
      assignee: { displayName: 'Camille Martin' },
      created: '2026-09-01T09:00:00.000+0200',
      updated: '2026-09-30T14:03:22.123+0200',
      ...f,
    },
  }
}

const TICKETS = [
  ticket('10001', 'PRVE-101', 'Corriger la connexion SSO', ['En cours', 'indeterminate'], { description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'La connexion échoue depuis le portail.' }] }] } }),
  ticket('10002', 'PRVE-102', 'Exporter les factures en PDF', ['À faire', 'new']),
  ticket('10003', 'PRVE-103', 'Mettre à jour les dépendances', ['Terminé', 'done']),
]

/** Un passage du script : la base est lue sur le disque de l'app, synchronisée en mémoire, réécrite sur le disque. */
async function passerLeScript(espace: Espace, base: string, tickets: TicketJira[]) {
  const a = new AdaptateurMemoire({ [`${base}/_schema.yaml`]: await espace.lire(`${base}/_schema.yaml`) })
  for (const nom of await espace.lister(base)) if (nom.endsWith('.md') || nom === '_synchro.yaml') await a.ecrire(`${base}/${nom}`, await espace.lire(`${base}/${nom}`))
  const client: ClientJira = { chercher: async () => ({ tickets }), champSprint: async () => undefined }
  await synchroniser(a, base, client, { maintenant: () => '2026-10-01T09:30', aleatoire: (n) => webcrypto.getRandomValues(new Uint8Array(n)) })
  for (const e of await a.lister(base)) if (e.type === 'fichier') await espace.ecrire(`${base}/${e.nom}`, await a.lire(`${base}/${e.nom}`))
  await espace.page.locator('.relire').click()
}

async function creerBaseJira(espace: Espace) {
  const page = espace.page
  await page.getByRole('button', { name: 'Nouvelle base Jira' }).click()
  const fenetre = page.locator('.fenetre')
  await fenetre.getByLabel('Site Jira').fill('https://exemple.atlassian.net/jira/software/projects/PRVE/boards/1')
  await fenetre.getByLabel('Projets suivis').fill('prve, ops')
  await fenetre.getByRole('button', { name: 'Créer la base' }).click()
  await expect(page.locator('h1', { hasText: 'Tickets Jira' })).toBeVisible()
}

test('créer une base Jira : le schéma porte la source, la base explique comment lancer le script', async ({ espace, page }) => {
  await creerBaseJira(espace)
  const schema = await espace.lire('tickets-jira/_schema.yaml')
  expect(schema).toContain('site: exemple.atlassian.net')
  expect(schema).toContain('projets: [ PRVE, OPS ]')
  const bandeau = page.locator('.bandeau-synchro')
  await expect(bandeau).toContainText('Pas encore synchronisée')
  await expect(bandeau.getByRole('link', { name: 'Télécharger le script' })).toHaveAttribute('download', 'mdbase-jira.mjs')
})

test('les tickets écrits par le script s’affichent en lecture seule ; vues et réglages de la source restent libres', async ({ espace, page }) => {
  await creerBaseJira(espace)
  await passerLeScript(espace, 'tickets-jira', TICKETS)

  const bandeau = page.locator('.bandeau-synchro')
  await expect(bandeau).toContainText('3 tickets suivis')
  await expect(espace.rangee('PRVE-101 Corriger la connexion SSO')).toBeVisible()

  // Données figées : pas de nouvelle ligne, pas d'ajout de colonne, cases non éditables.
  await expect(page.getByRole('button', { name: 'Nouvelle ligne' })).toHaveCount(0)
  await expect(espace.tableau.locator('.cellule-entete.ajout')).toHaveCount(0)
  await expect(espace.rangee('PRVE-101').locator('.cellule.lecture').first()).toBeVisible()

  // Le menu d'une colonne ne propose que l'affichage dans la vue.
  await espace.tableau.locator('.libelle-entete', { hasText: 'Statut' }).click()
  await expect(page.getByText('Colonne synchronisée depuis Jira')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Supprimer la colonne' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Masquer dans cette vue' }).click()
  await expect(espace.tableau.locator('.libelle-entete', { hasText: 'Statut' })).toHaveCount(0)

  // La page d'un ticket : titre et corps en lecture, réglages de mise en page présents.
  const r = espace.rangee('PRVE-101')
  await r.hover()
  await r.locator('.bouton-ouvrir').click()
  await expect(page.locator('h2.titre-page')).toHaveText('PRVE-101 Corriger la connexion SSO')
  await expect(page.getByText('La connexion échoue depuis le portail.')).toBeVisible()
  await page.keyboard.press('Escape')

  // Réglages de la source : un projet de plus, écrit dans le schéma.
  await bandeau.getByRole('button', { name: 'Réglages' }).click()
  await page.getByLabel('Projets suivis').fill('PRVE, OPS, DATA')
  await page.getByLabel('Filtre JQL (facultatif)').fill('statusCategory != Done')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect.poll(() => espace.lire('tickets-jira/_schema.yaml')).toContain('projets: [ PRVE, OPS, DATA ]')
  expect(await espace.lire('tickets-jira/_schema.yaml')).toContain('jql: statusCategory != Done')
})

test('une erreur du script s’affiche dans le bandeau', async ({ espace, page }) => {
  await creerBaseJira(espace)
  await espace.ecrire('tickets-jira/_synchro.yaml', 'derniere: "2026-10-01T09:30"\ntickets: 3\nerreur: "Jira : 401, e-mail ou token refusé"\n')
  await page.locator('.relire').click()
  await expect(page.locator('.bandeau-synchro.en-erreur')).toContainText('Dernier passage du script en échec : Jira : 401, e-mail ou token refusé')
})

test('une relation depuis une autre base trouve un ticket par son numéro', async ({ espace, page }) => {
  await creerBaseJira(espace)
  await passerLeScript(espace, 'tickets-jira', TICKETS)
  await espace.base('Tâches')
  await espace.tableau.locator('.cellule-entete.ajout').click()
  await page.getByPlaceholder('Nom de la colonne').fill('Ticket')
  await page.getByRole('button', { name: 'Relation…' }).click()
  await page.locator('.flottant .option', { hasText: 'Tickets Jira' }).click()
  const index = await page.locator('.entete .cellule-entete').evaluateAll((els) => els.findIndex((e) => e.textContent?.trim() === 'Ticket'))
  const cellule = espace.rangee('Intégration').locator('.case').nth(index)
  await cellule.click()
  await page.getByPlaceholder('Chercher une ligne à lier').fill('PRVE-102')
  await page.locator('.flottant .option', { hasText: 'PRVE-102 Exporter les factures en PDF' }).click()
  await page.keyboard.press('Escape')
  await expect(cellule).toContainText('PRVE-102 Exporter les factures en PDF')
})
