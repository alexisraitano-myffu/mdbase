import type { Page, Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { choisir, expect, test } from './espace'

// Assistant IA (spec §12, « Module IA ») : désactivé par défaut, avertissement
// avant activation, aperçu avant toute écriture. Le service est simulé.

const SERVICE = 'https://ia.exemple.test/v1'
const SITE = 'projets/site-vitrine--psite001.md'

/** Faux service compatible OpenAI : répond les messages donnés, dans l'ordre, et garde les requêtes. */
async function simulerService(page: Page, ...messages: object[]) {
  const recues: Request[] = []
  await page.route(`${SERVICE}/chat/completions`, async (route) => {
    recues.push(route.request())
    const message = messages.shift() ?? { content: 'plus de réponse' }
    await route.fulfill({ json: { choices: [{ message }] }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  return recues
}

const appel = (nom: string, args: object) => ({ content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: nom, arguments: JSON.stringify(args) } }] })

/** Active l'assistant ; le faux service liste `modeles` (demandés à l'ouverture du panneau). */
/** Allume un module dans la fenêtre Modules (spec §19) ; l'assistant ouvre alors son activation. */
async function allumer(page: Page, module: string) {
  await page.getByRole('button', { name: 'Modules' }).click()
  await page.getByRole('dialog', { name: 'Modules' }).getByRole('switch', { name: module }).click()
  if (module !== 'Assistant IA') await page.keyboard.press('Escape')
}

async function activer(page: Page, modeles: string[] = []) {
  await page.route(`${SERVICE}/models`, (route) => route.fulfill({ json: { data: modeles.map((id) => ({ id })) }, headers: { 'Access-Control-Allow-Origin': '*' } }))
  await allumer(page, 'Assistant IA')
  const fenetre = page.getByRole('dialog', { name: 'Assistant IA' })
  await expect(fenetre).toContainText('À chaque demande, l’assistant envoie au service choisi')
  await fenetre.getByPlaceholder(/compatible OpenAI/).fill(SERVICE)
  await fenetre.getByLabel('Clé d’API').fill('cle-de-test')
  await fenetre.getByPlaceholder(/modèle/).fill('qwen-test')
  await fenetre.getByRole('button', { name: 'J’ai compris, activer' }).click()
  await expect(page.getByPlaceholder(/passe les tâches en retard/)).toBeFocused()
}

/** Faux service qui répond au fil de l'eau, quand `repondre` est appelée ; une requête coupée par le navigateur est notée. */
async function serviceEnAttente(page: Page) {
  let partir: (evenements: object[]) => void = () => {}
  const reponse = new Promise<object[]>((r) => (partir = r))
  const etat = { recue: false, coupee: false }
  page.on('requestfailed', (r) => {
    if (r.url().startsWith(SERVICE)) etat.coupee = true
  })
  await page.route(`${SERVICE}/chat/completions`, async (route) => {
    etat.recue = true
    const evenements = await reponse
    const corps = evenements.map((e) => `data: ${JSON.stringify({ choices: [{ delta: e }] })}\n\n`).join('') + 'data: [DONE]\n\n'
    await route.fulfill({ body: corps, headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' } }).catch(() => {})
  })
  return { etat, repondre: (evenements: object[]) => partir(evenements) }
}

test('panneau fermé pendant la demande : elle continue, la barre latérale le signale, la réponse attend', async ({ espace, page }) => {
  const service = await serviceEnAttente(page)
  await espace.base('Projets')
  await activer(page)
  await expect(page.locator('.panneau-ia')).toBeVisible()
  // Le contenu reste visible à côté du panneau.
  await expect(page.locator('.contenu')).toBeVisible()
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Le site vitrine est terminé')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Arrêter' })).toBeVisible()
  await expect.poll(() => service.etat.recue).toBe(true)

  await page.getByRole('button', { name: 'Fermer l’assistant' }).click()
  await expect(page.locator('.panneau-ia')).toHaveCount(0)
  await expect(page.locator('.indicateur-ia')).toHaveAttribute('title', 'Demande en cours')

  service.repondre([
    { content: 'C’est noté.' },
    { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'modifier_lignes', arguments: '{"base":"projets",' } }] },
    { tool_calls: [{ index: 0, function: { arguments: '"lignes":["psite001"],"valeurs":{"statut":"Terminé"}}' } }] },
  ])
  await expect(page.locator('.indicateur-ia')).toHaveAttribute('title', 'Proposition à relire')
  await page.getByRole('button', { name: /Assistant IA/ }).click()
  await expect(page.locator('.changement-ia')).toHaveText('Statut : En cours Terminé')
  await expect(page.locator('.indicateur-ia')).toHaveCount(0)
  expect(await espace.lire(SITE)).toContain('statut: En cours\n')
})

test('Arrêter : la requête est coupée pour de bon et le tour marqué « Arrêté »', async ({ espace, page }) => {
  const service = await serviceEnAttente(page)
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Une longue demande')
  await page.keyboard.press('Enter')
  await expect.poll(() => service.etat.recue).toBe(true)
  await page.getByRole('button', { name: 'Arrêter' }).click()
  await expect(page.locator('.tour-ia .etat-ia')).toHaveText('Arrêté')
  await expect(page.getByRole('button', { name: 'Envoyer' })).toBeVisible()
  await expect.poll(() => service.etat.coupee).toBe(true)
  // La réponse qui arrive trop tard n'est plus lue.
  service.repondre([{ content: 'trop tard' }])
  await expect(page.locator('.reponse-ia')).toHaveCount(0)
  expect(espace).toBeTruthy()
})

test('champ de demande : grandit avec le texte, Maj+Entrée va à la ligne', async ({ espace, page }) => {
  await activer(page)
  const champ = page.getByPlaceholder(/passe les tâches en retard/)
  const avant = (await champ.boundingBox())!.height
  await champ.pressSequentially('ligne 1')
  for (let i = 2; i <= 4; i++) {
    await page.keyboard.press('Shift+Enter')
    await champ.pressSequentially(`ligne ${i}`)
  }
  await expect(champ).toHaveValue('ligne 1\nligne 2\nligne 3\nligne 4')
  expect((await champ.boundingBox())!.height).toBeGreaterThan(avant * 2.5)
  expect(espace).toBeTruthy()
})

test('services préremplis : un clic remplit l’adresse et le modèle, la clé reste à coller', async ({ espace: _, page }) => {
  await allumer(page, 'Assistant IA')
  const fenetre = page.getByRole('dialog', { name: 'Assistant IA' })
  await fenetre.getByRole('button', { name: 'Anthropic' }).click()
  await expect(fenetre.getByLabel('Adresse du service')).toHaveValue('https://api.anthropic.com/v1')
  await expect(fenetre.getByLabel('Modèle')).toHaveValue('claude-haiku-4-5')
  await expect(fenetre.getByLabel('Clé d’API')).toHaveAttribute('placeholder', 'sk-ant-…')
  await expect(fenetre.getByRole('link', { name: 'Créer une clé Anthropic' })).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys')
  await fenetre.getByLabel('Clé d’API').fill('sk-ant-test')
  await expect(fenetre.getByRole('button', { name: 'J’ai compris, activer' })).toBeEnabled()

  // Changer de service : son modèle, et la clé de l'autre service est retirée.
  await fenetre.getByRole('button', { name: 'Google Gemini' }).click()
  await expect(fenetre.getByLabel('Modèle')).toHaveValue('gemini-3.6-flash')
  await expect(fenetre.getByLabel('Clé d’API')).toHaveValue('')
  await expect(fenetre.getByRole('button', { name: 'Google Gemini' })).toHaveClass(/active/)
})

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
  await expect(plan.locator('.changement-ia')).toHaveText('Statut : En cours Terminé') // la flèche est une icône
  expect(await espace.lire(SITE)).toContain('statut: En cours\n')

  const requete = recues[0]!
  expect(await requete.headerValue('authorization')).toBe('Bearer cle-de-test')
  const corps = requete.postDataJSON() as { model: string; messages: { role: string; content: string }[] }
  expect(corps.model).toBe('qwen-test')
  expect(corps.messages[1]).toEqual({ role: 'user', content: 'Le site vitrine est terminé' })
  expect(corps.messages[0]!.content).toContain('Base ouverte : projets')

  await page.getByRole('button', { name: 'Appliquer (1 ligne)' }).click()
  await expect(page.locator('.applique-ia')).toHaveText('Appliqué')
  await expect.poll(() => espace.lire(SITE)).toContain('statut: Terminé\n')
})

test('après « Appliquer », le modèle reprend la demande : il propose l’étape suivante, puis se tait quand tout est fait', async ({ espace, page }) => {
  const MOBILE = 'projets/application-mobile--pmobi002.md'
  const recues = await simulerService(
    page,
    appel('modifier_lignes', { base: 'projets', lignes: ['psite001'], valeurs: { statut: 'Terminé' } }),
    appel('modifier_lignes', { base: 'projets', lignes: ['pmobi002'], valeurs: { statut: 'Terminé' } }),
    { content: 'fait' },
  )
  await espace.base('Projets')
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Le site vitrine puis l’application mobile sont terminés')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Appliquer (1 ligne)' }).click()
  await expect.poll(() => espace.lire(SITE)).toContain('statut: Terminé\n')

  // La suite part seule, sans bulle de demande : l'étape suivante est proposée.
  await expect(page.getByRole('button', { name: 'Appliquer (1 ligne)' })).toBeVisible()
  await expect(page.locator('.operation-ia').last().locator('li')).toContainText('Application mobile')
  await expect(page.locator('.bulle-ia.moi')).toHaveCount(1)
  const suite = recues[1]!.postDataJSON() as { messages: { role: string; content: string }[] }
  expect(suite.messages.at(-1)!.content).toContain('C’est appliqué. Reprends ma demande d’origine')

  await page.getByRole('button', { name: 'Appliquer (1 ligne)' }).click()
  await expect.poll(() => espace.lire(MOBILE)).toContain('statut: Terminé\n')
  // « fait » : rien de plus à montrer, le fil s'arrête sur le plan appliqué.
  await expect.poll(() => recues.length).toBe(3)
  await expect(page.locator('.tour-ia')).toHaveCount(2)
  await expect(page.locator('.applique-ia')).toHaveCount(2)
})

test('conversation : on répond à la question du modèle, qui relit l’échange ; gardée à la réouverture', async ({ espace, page }) => {
  const recues = await simulerService(
    page,
    appel('repondre', { texte: 'Quel projet ?' }),
    appel('modifier_lignes', { base: 'projets', lignes: ['psite001'], valeurs: { statut: 'Terminé' } }),
  )
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Termine le projet')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('Quel projet ?')
  await expect(page.getByRole('button', { name: /Appliquer/ })).toHaveCount(0)

  await page.getByPlaceholder('Répondre…').fill('Le site vitrine')
  await page.keyboard.press('Enter')
  await expect(page.locator('.changement-ia')).toHaveText('Statut : En cours Terminé') // la flèche est une icône
  const messages = (recues[1]!.postDataJSON() as { messages: { role: string; content: string }[] }).messages
  expect(messages.slice(1)).toEqual([
    { role: 'user', content: 'Termine le projet' },
    { role: 'assistant', content: 'Quel projet ?' },
    { role: 'user', content: 'Le site vitrine' },
  ])

  // Panneau fermé puis rouvert : la conversation est là.
  await page.keyboard.press('Control+j')
  await expect(page.locator('.panneau-ia')).toHaveCount(0)
  await page.keyboard.press('Control+j')
  await expect(page.locator('.bulle-ia.moi')).toHaveText(['Termine le projet', 'Le site vitrine'])
  const garde = await page.evaluate(() => localStorage.getItem('mdbase.ia.conversations.espace'))
  expect(JSON.parse(garde!)[0].tours).toEqual([
    { demande: 'Termine le projet', type: 'reponse', texte: 'Quel projet ?' },
    { demande: 'Le site vitrine', type: 'plan', texte: 'Modifier 1 ligne dans Projets : Site vitrine (Statut → Terminé)', statut: 'annule' },
  ])
  expect(await espace.lire(SITE)).toContain('statut: En cours\n')
})

test('nouvelle conversation : le fil est vidé', async ({ espace, page }) => {
  await simulerService(page, appel('repondre', { texte: 'Bonjour' }))
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Salut')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('Bonjour')
  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await expect(page.locator('.tour-ia')).toHaveCount(0)
  await page.keyboard.press('Control+j')
  await page.keyboard.press('Control+j')
  await expect(page.locator('.tour-ia')).toHaveCount(0)
  expect(espace).toBeTruthy()
})

test('mémoire : retenue aussitôt avec une mention annulable', async ({ espace, page }) => {
  await simulerService(page, appel('retenir', { fait: 'Mes semaines commencent le mardi' }))
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Retiens que mes semaines commencent le mardi')
  await page.keyboard.press('Enter')
  const mention = page.locator('.mention-ia')
  await expect(mention).toContainText('Retenu : Mes semaines commencent le mardi')
  await expect.poll(() => espace.lire('_assistant/memoire.md')).toContain('- Mes semaines commencent le mardi\n')

  await mention.getByRole('button', { name: 'Annuler' }).click()
  await expect(mention).toContainText('annulé')
  await expect.poll(() => espace.lire('_assistant/memoire.md')).not.toContain('mardi')
})

test('skill : aperçu, écrit seulement après « Appliquer », listé dans les réglages et supprimable', async ({ espace, page }) => {
  const recues = await simulerService(
    page,
    appel('creer_skill', { nom: 'Revue du lundi', description: 'le lundi matin', instructions: 'Tâches en retard en priorité haute.' }),
    { content: 'fait' }, // la suite après « Appliquer » : rien de plus à faire
    { content: 'ok' },
  )
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Crée un skill revue du lundi')
  await page.keyboard.press('Enter')
  await expect(page.locator('.skill-ia h3')).toHaveText('Nouveau skill « Revue du lundi »')
  await expect(page.locator('.skill-ia pre')).toHaveText('Tâches en retard en priorité haute.')
  expect(await espace.lister('')).not.toContain('_assistant')

  await page.getByRole('button', { name: 'Appliquer (1 skill)' }).click()
  await expect(page.locator('.applique-ia')).toBeVisible()
  await expect.poll(() => espace.lire('_assistant/skills/revue-du-lundi.md')).toContain('nom: Revue du lundi')
  await expect.poll(() => recues.length).toBe(2)
  await expect(page.locator('.tour-ia')).toHaveCount(1)

  // La demande suivante envoie le skill au modèle.
  await page.getByPlaceholder('Répondre…').fill('merci')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia').last()).toHaveText('ok')
  expect((recues[2]!.postDataJSON() as { messages: { content: string }[] }).messages[0]!.content).toContain('### Revue du lundi')

  await page.getByRole('button', { name: 'Réglages' }).click()
  const reglages = page.getByRole('dialog', { name: 'Assistant IA' })
  await expect(reglages.locator('.memoire-ia')).toContainText('Revue du lundi')
  await reglages.getByRole('button', { name: 'Supprimer le skill « Revue du lundi »' }).click()
  await expect(reglages.locator('.memoire-ia')).toHaveCount(0)
  await expect.poll(async () => (await espace.lister('_assistant/skills')).length).toBe(0)
  // Le dossier `_assistant/` n'apparaît jamais comme une base.
  await expect(page.locator('.entree-base', { hasText: '_assistant' })).toHaveCount(0)
})

test('structure : colonne créée puis remplie, vue ajoutée ; une suppression est signalée en rouge', async ({ espace, page }) => {
  const outil = (id: string, nom: string, args: object) => ({ id, type: 'function', function: { name: nom, arguments: JSON.stringify(args) } })
  await simulerService(page, {
    content: null,
    tool_calls: [
      outil('c1', 'ajouter_colonnes', { base: 'projets', colonnes: [{ nom: 'Priorité', type: 'select', options: ['Haute', 'Basse'] }] }),
      outil('c2', 'modifier_lignes', { base: 'projets', lignes: ['psite001'], valeurs: { Priorité: 'Haute' } }),
      outil('c3', 'creer_vue', { base: 'projets', nom: 'Prioritaires', type: 'tableau', filtres: [{ colonne: 'Priorité', operateur: 'egal', valeur: 'Haute' }] }),
      outil('c4', 'supprimer_colonne', { base: 'projets', colonne: 'revue' }),
    ],
  })
  await espace.base('Projets')
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Ajoute une priorité')
  await page.keyboard.press('Enter')

  const structure = page.locator('.operation-ia').filter({ has: page.getByRole('heading', { name: 'Structure' }) })
  await expect(structure).toContainText('Ajouter la colonne « Priorité »')
  await expect(structure).toContainText('Créer la vue tableau « Prioritaires »')
  await expect(structure.locator('.danger-ia')).toContainText('Supprimer la colonne « Revue client »')
  await expect(page.locator('.changement-ia')).toHaveText('Priorité : vide Haute')
  expect(await espace.lire('projets/_schema.yaml')).not.toContain('Priorité')

  await page.getByRole('button', { name: 'Appliquer (3 actions et 1 ligne)' }).click()
  await expect(page.locator('.applique-ia')).toHaveText('Appliqué')
  await expect.poll(() => espace.lire(SITE)).toContain('priorite: Haute\n')
  expect(await espace.lire('projets/_schema.yaml')).not.toContain('cle: revue')
})

test('réponse en Markdown ; copier, relancer, modifier la dernière demande', async ({ espace, page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const recues = await simulerService(page, { content: '## Bilan\n**Deux** projets en retard :\n- Site vitrine\n- `Boutique`' }, { content: 'Autre réponse' }, { content: 'Corrigé' })
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Fais le bilan')
  await page.keyboard.press('Enter')
  const reponse = page.locator('.reponse-ia')
  await expect(reponse.locator('h4')).toHaveText('Bilan')
  await expect(reponse.locator('strong')).toHaveText('Deux')
  await expect(reponse.locator('li')).toHaveText(['Site vitrine', 'Boutique'])
  await expect(reponse.locator('li code')).toHaveText('Boutique')

  await page.getByRole('button', { name: 'Copier la réponse' }).click()
  await expect(page.getByRole('button', { name: 'Copié' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('**Deux** projets')

  // Relancer : la même demande repart, sa réponse remplace l'ancienne.
  await page.getByRole('button', { name: 'Relancer la demande' }).click()
  await expect(reponse).toHaveText('Autre réponse')
  await expect(page.locator('.tour-ia')).toHaveCount(1)
  expect((recues[1]!.postDataJSON() as { messages: { content: string }[] }).messages.at(-1)!.content).toBe('Fais le bilan')

  // Modifier : la demande revient dans le champ, le tour est retiré.
  await page.getByRole('button', { name: 'Modifier la demande' }).click()
  const champ = page.getByLabel('Demande à l’assistant')
  await expect(champ).toHaveValue('Fais le bilan')
  await expect(page.locator('.tour-ia')).toHaveCount(0)
  await champ.fill('Fais le bilan de septembre')
  await page.keyboard.press('Enter')
  await expect(reponse).toHaveText('Corrigé')
  expect(espace).toBeTruthy()
})

test('@ cite une base, / lance un skill : pastilles, et le modèle les reçoit', async ({ espace, page }) => {
  await espace.ecrire('_assistant/skills/revue-du-lundi.md', '---\nnom: Revue du lundi\ndescription: le lundi matin\n---\n\nTâches en retard en priorité haute.\n')
  const recues = await simulerService(page, { content: 'ok' })
  await activer(page)
  const champ = page.getByLabel('Demande à l’assistant')
  await champ.pressSequentially('/rev')
  await expect(page.getByRole('option')).toHaveText([/Revue du lundi/])
  await page.keyboard.press('Enter')
  // Frappe enchaînée aussitôt : le curseur est déjà à sa place.
  await champ.pressSequentially('sur @tâc')
  await expect(page.locator('.demande-ia .citation-ia').first()).toHaveText('Revue du lundi')
  await expect(page.getByRole('option', { name: 'Tâches' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator('.demande-ia .citation-ia')).toHaveText(['Revue du lundi', 'Tâches'])
  await expect(champ).toHaveValue('sur ')
  await page.keyboard.press('Enter')

  await expect(page.locator('.bulle-ia.moi .citation-ia')).toHaveText(['Revue du lundi', 'Tâches'])
  // La bulle s'affiche avant que la requête parte : attendre qu'elle soit reçue.
  await expect.poll(() => recues.length).toBe(1)
  const messages = (recues[0]!.postDataJSON() as { messages: { content: string }[] }).messages
  expect(messages.at(-1)!.content).toBe('Applique le skill « Revue du lundi ».\nsur')
  expect(messages[0]!.content).toContain("Bases citées par l'utilisateur : taches")
})

test('modèle changé depuis le panneau ; historique : reprendre une conversation précédente', async ({ espace, page }) => {
  const recues: { model: string; messages: { content: string }[] }[] = []
  await page.route(`${SERVICE}/chat/completions`, async (route) => {
    recues.push(route.request().postDataJSON())
    await route.fulfill({ json: { choices: [{ message: { content: `réponse ${recues.length}` } }] }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await activer(page, ['qwen-test', 'mistral-large'])
  await choisir(page.getByRole('button', { name: 'Modèle' }), 'mistral-large')
  const champ = page.getByLabel('Demande à l’assistant')
  await champ.fill('Première conversation')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('réponse 1')
  expect(recues[0]!.model).toBe('mistral-large')
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('mdbase.ia')))!).modele).toBe('mistral-large')

  await page.getByRole('button', { name: 'Nouvelle conversation' }).click()
  await champ.fill('Deuxième conversation')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('réponse 2')
  // La deuxième ne relit pas la première.
  expect(recues[1]!.messages.map((m) => m.content)).not.toContain('Première conversation')

  await page.getByRole('button', { name: 'Conversations précédentes' }).click()
  const historique = page.getByRole('list', { name: 'Conversations précédentes' })
  await expect(historique.locator('.libelle-choix')).toHaveText(['Deuxième conversation', 'Première conversation'])
  await historique.locator('.ouvrir-conversation', { hasText: 'Première conversation' }).click()
  await expect(page.locator('.bulle-ia.moi')).toHaveText('Première conversation')
  await expect(page.locator('.reponse-ia')).toHaveText('réponse 1')

  // Gardées dans le navigateur, la plus récente d'abord ; une conversation s'efface.
  const gardees = JSON.parse((await page.evaluate(() => localStorage.getItem('mdbase.ia.conversations.espace')))!) as { tours: { demande: string }[] }[]
  expect(gardees.map((c) => c.tours[0]!.demande)).toEqual(['Première conversation', 'Deuxième conversation'])
  await page.getByRole('button', { name: 'Conversations précédentes' }).click()
  await page.getByRole('button', { name: 'Effacer « Deuxième conversation »' }).click()
  await expect(page.getByRole('list', { name: 'Conversations précédentes' }).locator('li')).toHaveCount(1)
  expect(espace).toBeTruthy()
})

test('le modèle lit les lignes qui lui manquent, voit le résultat, puis répond', async ({ espace, page }) => {
  const recues = await simulerService(
    page,
    appel('chercher_lignes', { base: 'projets', filtres: [{ colonne: 'statut', operateur: 'egal', valeur: 'En cours' }] }),
    appel('repondre', { texte: 'Deux projets en cours : Site vitrine, Boutique en ligne.' }),
  )
  await espace.base('Projets')
  await activer(page)
  await page.getByPlaceholder(/passe les tâches en retard/).fill('Quels projets sont en cours ?')
  await page.keyboard.press('Enter')
  await expect(page.locator('.reponse-ia')).toHaveText('Deux projets en cours : Site vitrine, Boutique en ligne.')
  // La seconde requête porte le résultat de la lecture, calculé par l'app sur toutes les lignes.
  const messages = (recues[1]!.postDataJSON() as { messages: { role: string; content: string }[] }).messages
  const lu = messages.find((m) => m.role === 'tool')!
  expect(lu.content).toMatch(/^2 lignes dans projets :/)
  expect(lu.content).toContain('psite001 | Site vitrine')
  expect(lu.content).toContain('pbout003 | Boutique en ligne')
  expect(lu.content).not.toContain('Application mobile')
})

/** Ouvre la page Inbox (module allumé au besoin). */
async function ouvrirInbox(page: Page) {
  if ((await page.getByRole('button', { name: /^Inbox/ }).count()) === 0) await allumer(page, 'Inbox')
  await page.getByRole('button', { name: /^Inbox/ }).click()
  await expect(page.getByRole('complementary', { name: 'Inbox' })).toBeVisible()
}

test('inbox : page à part, sans l’assistant ; déposer, marquer traité, historique replié, supprimer', async ({ espace, page }) => {
  await espace.base('Projets')
  // Désactivée par défaut : ni entrée Inbox, ni bouton de l'assistant.
  await expect(page.getByRole('button', { name: /^Inbox/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Assistant IA/ })).toHaveCount(0)
  await ouvrirInbox(page)
  const panneau = page.getByRole('complementary', { name: 'Inbox' })
  await panneau.getByLabel('Information à déposer').fill('Site vitrine : la recette glisse')
  await panneau.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await panneau.getByLabel('Information à déposer').fill('Appeler le client')
  await page.keyboard.press('Control+Enter')
  const attente = panneau.getByRole('list', { name: 'À traiter' })
  await expect(attente.locator(':scope > li')).toHaveCount(2)
  await expect(page.locator('.barre-laterale').getByRole('button', { name: /^Inbox/ })).toContainText('2')
  // Sans l'assistant, pas d'envoi à l'IA.
  await expect(panneau.getByRole('button', { name: /à l’IA/ })).toHaveCount(0)

  await panneau.getByRole('button', { name: 'Marquer « Appeler le client » traité' }).click()
  await expect(attente.locator(':scope > li')).toHaveCount(1)
  await panneau.getByRole('button', { name: 'Traités (1)' }).click()
  await expect(panneau.getByRole('list', { name: 'Traités' })).toContainText('Marqué traité')
  expect((await espace.lister('_assistant/inbox/traites')).length).toBe(1)
  await panneau.getByRole('button', { name: 'Supprimer « Site vitrine : la recette glisse »' }).click()
  await expect(panneau).toContainText('Rien en attente.')
  await panneau.getByRole('button', { name: 'Vider l’historique' }).click()
  await panneau.getByRole('button', { name: 'Tout supprimer' }).click()
  await expect(panneau.getByRole('button', { name: /^Traités/ })).toHaveCount(0)
})

test('inbox : un élément envoyé à l’IA, l’autre reste ; après « Appliquer », il passe dans les traités avec son bilan', async ({ espace, page }) => {
  // Le faux service lit l'id de l'élément reçu, comme le ferait le modèle.
  const recues: string[] = []
  await page.route(`${SERVICE}/chat/completions`, async (route) => {
    const corps = route.request().postData() ?? ''
    recues.push(corps)
    const ids = [...corps.matchAll(/Élément (\d{8}-\d{6}--[a-z0-9-]+)/g)].map((m) => m[1]!)
    const appels = [
      { nom: 'ajouter_remarque', args: { base: 'projets', ligne: 'psite001', section: 'Remarques', texte: 'Recette décalée de deux semaines.' } },
      { nom: 'signaler_incoherence', args: { constat: 'Le compte rendu dit « terminé », la base dit « En cours ».' } },
      ...ids.map((id) => ({ nom: 'classer_element', args: { element: id, garder: true, titre: 'Compte rendu', date: '2026-10-07' } })),
    ]
    const message = { content: null, tool_calls: appels.map((a, i) => ({ id: `c${i}`, type: 'function', function: { name: a.nom, arguments: JSON.stringify(a.args) } })) }
    await route.fulfill({ json: { choices: [{ message }] }, headers: { 'Access-Control-Allow-Origin': '*' } })
  })
  await espace.base('Projets')
  await activer(page)
  await ouvrirInbox(page)
  const panneau = page.getByRole('complementary', { name: 'Inbox' })
  await panneau.getByLabel('Information à déposer').fill('Une autre remarque')
  await panneau.getByRole('button', { name: 'Ajouter', exact: true }).click()
  await panneau.locator('input[type=file]').setInputFiles({ name: 'Compte rendu.md', mimeType: 'text/markdown', buffer: Buffer.from('# Compte rendu\n\nLe site vitrine est terminé.\n') })
  await expect(panneau.getByRole('list', { name: 'À traiter' }).locator(':scope > li')).toHaveCount(2)
  await expect(panneau.getByRole('button', { name: 'Tout envoyer à l’IA' })).toBeVisible()
  await page.screenshot({ path: 'test-results/inbox-page.png' })

  await panneau.getByRole('button', { name: 'Envoyer « Compte rendu » à l’IA' }).click()
  // L'assistant prend la place de l'inbox, avec la demande sur ce seul élément.
  await expect(page.getByRole('complementary', { name: 'Inbox' })).toHaveCount(0)
  await expect(page.locator('.bulle-ia.moi').last()).toHaveText('Traite cet élément de l’inbox : « Compte rendu ».')
  await expect(page.locator('.incoherences-ia')).toContainText('Le compte rendu dit « terminé »')
  await expect(page.locator('.plan-ia')).toContainText('Ranger « Compte rendu » dans les documents')
  expect(recues[0]).toContain('Le site vitrine est terminé.')
  expect(recues[0]).not.toContain('Une autre remarque')
  await page.getByRole('button', { name: /^Appliquer/ }).click()
  await expect(page.locator('.applique-ia')).toBeVisible()
  await expect.poll(() => espace.lire(SITE)).toMatch(/## Remarques\n\n- \d\d\/\d\d\/\d{4} : Recette décalée de deux semaines\./)

  await ouvrirInbox(page)
  await expect(panneau.getByRole('list', { name: 'À traiter' }).locator(':scope > li')).toHaveCount(1)
  await panneau.getByRole('button', { name: 'Traités (1)' }).click()
  const traites = panneau.getByRole('list', { name: 'Traités' })
  await expect(traites).toContainText('Noter dans « Site vitrine » (Projets), section Remarques')
  await expect(traites).toContainText('À vérifier : Le compte rendu dit « terminé »')
  await expect(traites).toContainText('Rangé dans les documents (« Compte rendu », du 07/10/2026)')
  await page.screenshot({ path: 'test-results/inbox-traites.png' })
})

test('inbox : PowerPoint, Word et PDF lâchés sur le panneau, convertis dans le navigateur', async ({ espace, page }) => {
  const recues = await simulerService(page, { content: 'Lu.' })
  await espace.base('Projets')
  await activer(page)
  await ouvrirInbox(page)

  // Vrais fichiers Office et PDF (fictifs), lâchés comme depuis l'explorateur.
  const fichiers = ['Point hebdo Atlas S41.pptx', 'CR comite Atlas.docx', 'Planning Atlas.pdf'].map((nom) => ({ nom, octets: [...readFileSync(`e2e/fichiers/${nom}`)] }))
  const panneau = page.getByRole('complementary', { name: 'Inbox' })
  await panneau.evaluate((el, fichiers) => {
    const dt = new DataTransfer()
    for (const f of fichiers) dt.items.add(new File([new Uint8Array(f.octets)], f.nom))
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  }, fichiers)
  await expect(panneau.getByRole('list', { name: 'À traiter' }).locator(':scope > li')).toHaveCount(3)
  await expect(panneau).toContainText('Point hebdo Atlas S41')
  await expect(panneau).toContainText('Planning Atlas')
  await panneau.getByRole('button', { name: 'Point hebdo Atlas S41', exact: true }).click()
  await expect(panneau.locator('.texte-element')).toContainText('## Diapositive 3 : Feuille de route')

  await panneau.getByRole('button', { name: 'Tout envoyer à l’IA' }).click()
  await expect(page.locator('.bulle-ia').last()).toContainText('Lu.')
  const demande = (recues[0]!.postDataJSON() as { messages: { content: string }[] }).messages.at(-1)!.content
  // PowerPoint : titres, puces, notes, tableau et graphique.
  expect(demande).toContain('## Diapositive 2 : Faits marquants')
  expect(demande).toContain('- Lot 2 (paiement) : recette décalée au 22/10')
  expect(demande).toContain('Notes : Annoncer que la date de mise en production de la V1.5 glisse au 12/11.')
  expect(demande).toContain('| 1.5 | Lot 2 Paiement | En recette | 22/10 |')
  expect(demande).toContain('| Faits | 34 |')
  // Word et PDF.
  expect(demande).toContain('- La V1.5 passe au 12/11.')
  expect(demande).toContain('## Page 2\n\nLot 3 Notifications : fin prevue le 05/11.')
})

test('modules : Jira caché par défaut, le contexte s’édite et part avec chaque demande', async ({ espace, page }) => {
  const recues = await simulerService(page, { content: 'ok' })
  await espace.base('Projets')
  await expect(page.getByRole('button', { name: 'Nouvelle base Jira' })).toHaveCount(0)
  await allumer(page, 'Jira')
  await expect(page.getByRole('button', { name: 'Nouvelle base Jira' })).toBeVisible()

  await activer(page)
  await page.getByRole('button', { name: 'Modules' }).click()
  const modules = page.getByRole('dialog', { name: 'Modules' })
  await modules.getByRole('switch', { name: 'Contexte IA' }).click()
  await expect(modules.getByRole('switch', { name: 'Contexte IA' })).toBeChecked()
  await page.screenshot({ path: 'test-results/modules.png' })
  await modules.getByRole('button', { name: 'Éditer le contexte' }).click()
  // Le contexte s'édite dans le panneau Documents, à la place de l'assistant.
  const panneau = page.getByRole('complementary', { name: 'Documents' })
  await expect(panneau.getByRole('tab', { name: 'Contexte' })).toHaveAttribute('aria-selected', 'true')
  await expect(panneau.getByLabel('Contexte')).toHaveValue(/## Organisation/)
  await panneau.getByLabel('Contexte').fill('## Organisation\nClients → Projets → Tâches.')
  await panneau.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(panneau).toContainText('Enregistré.')
  await page.screenshot({ path: 'test-results/contexte.png' })
  await expect.poll(() => espace.lire('_assistant/contexte.md')).toBe('## Organisation\nClients → Projets → Tâches.\n')
  await page.getByRole('button', { name: /Assistant IA/ }).click()

  await page.getByPlaceholder(/passe les tâches en retard/).fill('bonjour')
  await page.keyboard.press('Enter')
  await expect(page.locator('.bulle-ia').last()).toContainText('ok')
  const systeme = (recues[0]!.postDataJSON() as { messages: { content: string }[] }).messages[0]!.content
  expect(systeme).toContain('Clients → Projets → Tâches.')
})

test('documents : une entrée dédiée, chercher, lire une fiche, suivre une ligne, voir les remplacés, supprimer', async ({ espace, page }) => {
  const doc = (id: string, titre: string, date: string, texte: string, plus = '') =>
    espace.ecrire(`_assistant/documents/${id}.md`, `---\ntitre: ${titre}\nsource: ${id}.pptx\ndate: ${date}\najoute: ${date}T09:00\nlignes: [projets/psite001]\n${plus}---\n\n${texte}\n`)
  await doc('2026-09-30--point-s40', 'Point hebdo S40', '2026-09-30', '## Diapositive 1\n\nLivraison prévue le 15/10.', 'remplace_par: 2026-10-07--point-s41\n')
  await doc('2026-10-07--point-s41', 'Point hebdo S41', '2026-10-07', '## Diapositive 1\n\nLa recette du lot 2 est décalée au 29/10.')
  await doc('2026-10-02--cr-comite', 'CR comité', '2026-10-02', 'Le budget est validé.')
  await espace.base('Projets')
  await activer(page)
  await allumer(page, 'Contexte IA')

  await page.locator('.barre-laterale').getByRole('button', { name: /^Documents/ }).click()
  const panneau = page.getByRole('complementary', { name: 'Documents' })
  // Les documents à jour seulement, regroupés par mois.
  await expect(panneau.getByRole('tab', { name: /Documents/ })).toContainText('2')
  await expect(panneau.getByRole('list', { name: 'Documents de octobre 2026' }).locator(':scope > li')).toHaveCount(2)
  await expect(panneau).not.toContainText('Point hebdo S40')
  await panneau.getByLabel('Montrer les documents remplacés (1)').check()
  await expect(panneau.getByRole('list', { name: 'Documents de septembre 2026' })).toContainText('remplacé')

  // Recherche sans accents, dans le texte : le passage trouvé s'affiche.
  await panneau.getByLabel('Chercher dans les documents').fill('decalee')
  await expect(panneau.locator('.liste-inbox li')).toHaveCount(1)
  await expect(panneau.locator('.apercu-element')).toContainText('décalée au 29/10')
  await page.screenshot({ path: 'test-results/documents.png' })

  await panneau.getByRole('button', { name: 'Point hebdo S41', exact: true }).click()
  await expect(panneau.locator('.texte-document')).toContainText('La recette du lot 2 est décalée au 29/10.')
  await expect(panneau.locator('.infos-document')).toContainText('Point hebdo S40')
  await page.screenshot({ path: 'test-results/document-fiche.png' })
  // Le document remplacé s'ouvre depuis la fiche ; la ligne concernée s'ouvre dans sa base.
  await panneau.getByRole('button', { name: 'Point hebdo S40' }).click()
  await expect(panneau.locator('.texte-document')).toContainText('Livraison prévue le 15/10.')
  await panneau.getByRole('button', { name: 'Site vitrine' }).click()
  await expect(page.locator('aside.page')).toContainText("Refaire le site vitrine d'Acme")

  await panneau.getByRole('button', { name: 'Supprimer le document « Point hebdo S40 »' }).click()
  await panneau.getByRole('button', { name: 'Supprimer', exact: true }).click()
  await expect(panneau.getByRole('button', { name: 'Tous les documents' })).toHaveCount(0)
  expect(await espace.lister('_assistant/documents')).not.toContain('2026-09-30--point-s40.md')
})

