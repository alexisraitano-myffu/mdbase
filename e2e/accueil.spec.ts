import { expect, test } from '@playwright/test'

// Accueil : essayer l'app sans rien installer, avec la démo copiée dans le
// stockage du navigateur (voir src/adapters/fsa/demo.ts).

test('« Essayer avec la démo » ouvre la démo ; « Repartir d’une démo neuve » efface les changements', async ({ page }) => {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(String(e)))
  await page.goto('./') // relatif à baseURL, qui peut porter un sous-chemin
  await page.getByRole('button', { name: 'Essayer avec la démo' }).click()
  await expect(page.locator('.nom-espace')).toHaveText('Espace de démo')
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Site vitrine' })).toBeVisible()

  // Un changement dans la démo, puis retour à l'accueil : la démo est reprise telle quelle.
  await page.getByRole('button', { name: /Nouvelle ligne/ }).click()
  await expect(page.locator('.rangee input:focus')).toBeVisible() // titre de la ligne créée en édition
  await page.keyboard.type('Ligne d’essai')
  await page.keyboard.press('Enter')
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toBeVisible()
  await page.evaluate(() => indexedDB.deleteDatabase('mdbase')) // oublie le dossier mémorisé : retour à l'accueil
  await page.reload()
  await page.getByRole('button', { name: 'Reprendre la démo' }).click()
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toBeVisible()

  await page.evaluate(() => indexedDB.deleteDatabase('mdbase'))
  await page.reload()
  await page.getByRole('button', { name: 'Repartir d’une démo neuve' }).click()
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Site vitrine' })).toBeVisible()
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toHaveCount(0)
  expect(erreurs).toEqual([])
})
