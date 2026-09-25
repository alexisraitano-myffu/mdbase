import type { Page, Request } from '@playwright/test'
import { expect, test } from './espace'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, avertissement
// avant activation, aperçu avant toute écriture. Le service est simulé.

const SERVICE = 'https://ia.exemple.test/v1'
const SITE = 'projets/site-vitrine--psite001.md'

/** Faux service compatible OpenAI : répond les messages donnés, dans l'ordre, et garde les requêtes. */
async function simulerService(page: Page, ...messages: object[]) {
  const recues: Request[] = []
  await page.route(`${SERVICE}/**`, async (route) => {
    recues.push(route.request())
    const message = messages.shift() ?? { content: 'plus de réponse' }
    await route.fulfill({ json: { choices: [{ message }] }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  return recues
}

const appel = (nom: string, args: object) => ({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: nom, arguments: JSON.stringify(args) } }] })

async function activer(page: Page) {
  await page.getByRole('button', { name: /Assistant IA/ }).click()
  const fenetre = page.getByRole('dialog', { name: 'Assistant IA' })
  await expect(fenetre).toContainText('À chaque demande, l’assistant envoie au service choisi')
  await fenetre.getByPlaceholder(/compatible OpenAI/).fill(SERVICE)
  await fenetre.getByPlaceholder(/serveur local/).fill('cle-de-test')
  await fenetre.getByPlaceholder(/modèle/).fill('qwen-test')
  await fenetre.getByRole('button', { name: 'J’ai compris, activer' }).click()
  await expect(page.getByPlaceholder(/passe les tâches en retard/)).toBeFocused()
}

test('désactivé par défaut : l’avertissement s’affiche et rien n’est envoyé sans activation', async ({ espace, page }) => {
  const recues = await simulerService(page)
  await page.keyboard.press('Control+j')
  const fenetre = page.getByRole('dialog', { name: 'Assistant IA' })
  await expect(fenetre.getByRole('button', { name: 'J’ai compris, activer' })).toBeDisabled()

  // Un service préréglé remplit l'adresse ; ses modèles de discussion sont proposés.
  await page.route('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models', (route) =>
    route.fulfill({ json: { data: [{ id: 'Qwen3.8-27B' }, { id: 'whisper-large-v3' }] }, headers: { 'Access-Control-Allow-Origin': '*' } }),
  )
  await fenetre.getByRole('button', { name: 'OVH (Europe)' }).click()
  await expect(fenetre.getByPlaceholder(/compatible OpenAI/)).toHaveValue('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1')
  await expect(fenetre.locator('#modeles-ia option')).toHaveCount(1)
  await expect(fenetre.locator('#modeles-ia option')).toHaveAttribute('value', 'Qwen3.8-27B')
  await page.keyboard.press('Escape')
  await expect(fenetre).toHaveCount(0)
  expect(recues).toHaveLength(0)
  expect(espace).toBeTruthy()
})

test('une demande : aperçu avant → après, rien d’écrit avant « Appliquer »', async ({ espace, page }) => {
  const recues = await simulerService(page, appel('modifier_lignes', { base: 'projets', lignes: ['psite001'], valeurs: { statut: 'Terminé' } }))
  await espace.base('Projets')
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Le site vitrine est terminé')
  await page.keyboard.press('Enter')

  const plan = page.locator('.operation-ia')
  await expect(plan.locator('h3')).toHaveText('Modifier 1 ligne · Projets')
  await expect(plan.locator('li')).toContainText('Site vitrine')
  await expect(plan.locator('.changement-ia')).toHaveText('Statut : En cours → Terminé')
  expect(await espace.lire(SITE)).toContain('statut: En cours\n')

  const requete = recues[0]!
  expect(await requete.headerValue('authorization')).toBe('Bearer cle-de-test')
  const corps = requete.postDataJSON() as { model: string; messages: { role: string; content: string }[] }
  expect(corps.model).toBe('qwen-test')
  expect(corps.messages[1]).toEqual({ role: 'user', content: 'Le site vitrine est terminé' })
  expect(corps.messages[0]!.content).toContain('Base ouverte : projets')

  await page.getByRole('button', { name: 'Appliquer (1 ligne)' }).click()
  await expect(page.getByRole('dialog', { name: 'Assistant IA' })).toHaveCount(0)
  await expect.poll(() => espace.lire(SITE)).toContain('statut: Terminé\n')
})

test('question du modèle affichée ; réglages gardés à la réouverture', async ({ espace, page }) => {
  await simulerService(page, appel('repondre', { texte: 'Quel projet ?' }))
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Termine le projet')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('Quel projet ?')
  await expect(page.getByRole('button', { name: /Appliquer/ })).toHaveCount(0)

  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+j')
  await expect(page.getByPlaceholder(/passe les tâches en retard/)).toBeVisible()
  expect(espace).toBeTruthy()
})
