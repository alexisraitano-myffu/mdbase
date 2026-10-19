import { expect, test } from './espace'

// Plan de charge (spec §21) : la grille ressources × semaines du modèle
// « Planification de charge », une affectation créée en glissant, la couverture des besoins.

test.beforeEach(async ({ espace: _, page }) => {
  await page.getByRole('button', { name: 'Magasin' }).click()
  await page.getByRole('article', { name: 'Planification de charge' }).getByRole('button', { name: 'Utiliser ce modèle' }).click()
  await expect(page.locator('h1', { hasText: 'Ressources' })).toBeVisible()
})

test('grille par rôle, glisser crée une affectation, une case montre ce qui la compose', async ({ espace, page }) => {
  const grille = page.locator('.grille-charge')
  await expect(grille.locator('.groupe-charge', { hasText: 'Développement' })).toBeVisible()
  const camille = grille.locator('.ressource-charge', { hasText: 'Camille' })
  await expect(camille.locator('.case-charge').nth(1)).toHaveText('5 / 5') // semaine en cours, à plein
  await expect(camille.locator('.case-charge').nth(1)).toHaveClass(/charge-pleine/)
  await page.screenshot({ path: 'test-results/plan-de-charge.png' })

  // Sami n'est affecté qu'à partir de la troisième semaine : glisser sur les deux premières.
  const sami = grille.locator('.ressource-charge', { hasText: 'Sami' })
  const avant = (await espace.lister('affectations')).length
  await sami.locator('.case-charge').nth(0).hover()
  await page.mouse.down()
  await sami.locator('.case-charge').nth(1).hover()
  await page.mouse.up()
  await page.locator('.flottant').getByRole('button', { name: 'Refonte du site' }).click()
  await expect.poll(async () => (await espace.lister('affectations')).length).toBe(avant + 1)
  await expect(sami.locator('.case-charge').nth(0)).toHaveText('5 / 5')

  await sami.locator('.case-charge').nth(0).click()
  await expect(page.locator('.detail-charge')).toContainText('Sami sur Refonte du site')
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/plan-de-charge-case.png' })
  await page.keyboard.press('Escape')

  // Déplier une ressource montre d'où vient sa charge.
  const hugo = grille.locator('.ressource-charge', { hasText: 'Hugo' })
  await hugo.getByRole('button', { name: 'Déplier par projet' }).click()
  await expect(grille.locator('.projet-charge', { hasText: 'Portail client' }).first()).toBeVisible()
})

test('par projet : chaque besoin couvert ou ce qui manque', async ({ page }) => {
  await page.getByRole('tab', { name: 'Par projet' }).click()
  const mobile = page.locator('.projet-couverture', { hasText: 'Application mobile' })
  await expect(mobile.locator('li', { hasText: 'Développement' })).toContainText('il manque 80 j')
  await page.screenshot({ path: 'test-results/plan-de-charge-projets.png' })
})

test('à la journée : une colonne par jour ouvré, glisser crée une affectation au total', async ({ espace, page }) => {
  await page.getByRole('radio', { name: 'Jour' }).click()
  await expect.poll(() => espace.lire('ressources/_vues/charge.yaml')).toContain('maille: jour')
  const sami = page.locator('.grille-charge .ressource-charge', { hasText: 'Sami' })
  await expect(sami.locator('.case-charge')).toHaveCount(20)
  const avant = await espace.lister('affectations')
  await sami.locator('.case-charge').nth(0).hover()
  await page.mouse.down()
  await sami.locator('.case-charge').nth(1).hover()
  await page.mouse.up()
  await page.locator('.flottant').getByRole('button', { name: 'Portail client' }).click()
  await expect.poll(async () => (await espace.lister('affectations')).length).toBe(avant.length + 1)
  const nouveau = (await espace.lister('affectations')).find((f) => !avant.includes(f))!
  const texte = await espace.lire(`affectations/${nouveau}`)
  expect(texte).toMatch(/\ntotal: 2\n/)
  expect(texte).not.toMatch(/\njours:/)
  await expect(sami.locator('.case-charge').nth(0)).toHaveText('1')
  await page.screenshot({ path: 'test-results/plan-de-charge-jour.png' })
})

test('graphique : barres empilées par projet, puis par version, filtrées par rôle', async ({ page }) => {
  await page.getByRole('tab', { name: 'Graphique' }).click()
  await page.getByRole('radio', { name: 'Mois' }).click()
  const legende = page.locator('.legende-graphique')
  await expect(legende).toContainText('Portail client')
  await expect(legende).toContainText('Capacité')
  await page.screenshot({ path: 'test-results/plan-de-charge-graphique.png' })
  await page.getByRole('radio', { name: 'Par version' }).click()
  await expect(legende).toContainText('Portail v1')
  await expect(legende).toContainText('Mobile bêta')
  await page.screenshot({ path: 'test-results/plan-de-charge-versions.png' })
  await page.getByRole('button', { name: 'Rôle' }).click()
  await page.getByRole('option', { name: 'Design', exact: true }).click()
  await expect(legende).not.toContainText('Portail v1')
})
