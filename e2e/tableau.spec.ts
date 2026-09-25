import type { Page } from '@playwright/test'
import { expect, test } from './espace'

// Jalons 2, 3 et 6 : lecture/écriture des fichiers depuis le tableau,
// édition des cellules par type, relations et rollups.

const SITE = 'projets/site-vitrine--psite001.md'

/** La case d'une ligne sous l'en-tête de colonne `colonne`. */
async function cellule(page: Page, titre: string, colonne: string) {
  const index = await page
    .locator('.entete .cellule-entete')
    .evaluateAll((els, c) => els.findIndex((e) => e.textContent?.trim() === c), colonne)
  expect(index, `colonne « ${colonne} »`).toBeGreaterThanOrEqual(0)
  return page.locator('.rangee', { hasText: titre }).first().locator('.case').nth(index)
}

test.describe('écriture depuis le tableau', () => {
  test('renommer le titre renomme le fichier ; id, corps et champs inconnus sont préservés', async ({ espace, page }) => {
    await espace.remplacer(SITE, 'budget: 8000\n', 'budget: 8000\nnote_perso: à garder # commentaire\n')
    await espace.base('Projets')
    await (await cellule(page, 'Site vitrine', 'Titre')).click()
    await page.locator('.rangee input.editeur').fill('Site vitrine v2')
    await page.keyboard.press('Enter')

    await expect.poll(() => espace.lister('projets')).toContain('site-vitrine-v2--psite001.md')
    expect(await espace.lister('projets')).not.toContain('site-vitrine--psite001.md')
    const texte = await espace.lire('projets/site-vitrine-v2--psite001.md')
    expect(texte).toContain('id: psite001\ntitre: Site vitrine v2\n')
    expect(texte).toContain('note_perso: à garder # commentaire')
    expect(texte).toContain("## Objectif\n\nRefaire le site vitrine d'Acme")
  })

  test('nouvelle ligne : fichier créé tout de suite, renommé d’après le titre saisi', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Nouvelle ligne' }).click()
    await expect(page.locator('.rangee input:focus')).toBeVisible()
    await page.keyboard.type('Refonte intranet')
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await espace.lister('projets')).some((n) => n.startsWith('refonte-intranet--'))).toBe(true)
  })

  test('nombre saisi à la française ; une saisie illisible est refusée sans rien écrire', async ({ espace, page }) => {
    await espace.base('Projets')
    await (await cellule(page, 'Site vitrine', 'Budget')).click()
    const champ = page.locator('.rangee input.editeur')
    await champ.fill('12 500,5')
    await page.keyboard.press('Enter')
    await expect(await cellule(page, 'Site vitrine', 'Budget')).toHaveText('12 500,5')
    await expect.poll(() => espace.lire(SITE)).toContain('budget: 12500.5\n')

    await (await cellule(page, 'Site vitrine', 'Budget')).click()
    await champ.fill('beaucoup')
    await expect(champ).toHaveClass(/refuse/)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    expect(await espace.lire(SITE)).toContain('budget: 12500.5\n')
  })

  test('sélection : choisir une option, en créer une nouvelle (ajoutée au schéma)', async ({ espace, page }) => {
    await espace.base('Projets')
    await (await cellule(page, 'Site vitrine', 'Statut')).click()
    await page.locator('.flottant .option', { hasText: 'Terminé' }).click()
    await expect.poll(() => espace.lire(SITE)).toContain('statut: Terminé\n')
    await page.keyboard.press('Escape')

    await (await cellule(page, 'Audit sécurité', 'Statut')).click()
    await page.getByPlaceholder('Chercher ou créer une option').fill('Bloqué')
    await page.keyboard.press('Enter')
    await expect.poll(() => espace.lire('projets/_schema.yaml')).toContain('Bloqué')
    await expect.poll(() => espace.lire('projets/audit-securite--paudi004.md')).toContain('statut: Bloqué\n')
  })

  test('case à cocher : cochée écrit true, décochée retire le champ', async ({ espace, page }) => {
    await espace.base('Tâches')
    const caseFait = (await cellule(page, 'Cadrage', 'Fait')).locator('input[type=checkbox]')
    await caseFait.check()
    await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).toContain('fait: true\n')
    // la ligne reste affichée (« sortira » de la vue filtrée) : on peut la décocher aussitôt
    await caseFait.uncheck()
    await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).not.toContain('fait:')
  })
})

test.describe('relations et rollups', () => {
  test('lier un second client écrit son id à côté du premier ; la relation inverse suit', async ({ espace, page }) => {
    await espace.base('Projets')
    await (await cellule(page, 'Application mobile', 'Client')).click()
    await page.getByPlaceholder('Chercher une ligne à lier').fill('Glob')
    await page.locator('.flottant .option', { hasText: 'Globex' }).click()
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/application-mobile--pmobi002.md')).toContain('client: [cacme001, cglob002]\n')

    await espace.base('Clients')
    await page.locator('.onglet', { hasText: 'Tableau' }).click()
    await expect(await cellule(page, 'Globex', 'Projets')).toContainText('Application mobile')
  })

  test('modifier les heures d’une tâche met à jour la somme de son projet', async ({ espace, page }) => {
    await espace.base('Projets')
    await expect(await cellule(page, 'Application mobile', 'Heures')).toHaveText('4')
    await espace.base('Tâches')
    await (await cellule(page, 'Cadrage', 'Heures')).click()
    await page.locator('.rangee input.editeur').fill('10')
    await page.keyboard.press('Enter')
    await espace.base('Projets')
    await expect(await cellule(page, 'Application mobile', 'Heures')).toHaveText('10')
  })
})
