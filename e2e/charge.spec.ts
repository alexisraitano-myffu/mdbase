import { choisir, expect, test } from './espace'

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

test('besoins : chaque besoin couvert ou ce qui manque', async ({ page }) => {
  await page.getByRole('tab', { name: 'Besoins' }).click()
  const mobile = page.locator('.projet-couverture', { hasText: 'Application mobile' })
  await expect(mobile.locator('li', { hasText: 'Développement' })).toContainText('il manque 80 j')
  await page.screenshot({ path: 'test-results/plan-de-charge-projets.png' })
})

test('à la journée : une colonne par jour ouvré, glisser crée une affectation au total', async ({ espace, page }) => {
  await page.getByRole('radio', { name: 'Jour' }).click()
  await expect.poll(() => espace.lire('ressources/_vues/charge.yaml')).toContain('maille: jour')
  const sami = page.locator('.grille-charge .ressource-charge', { hasText: 'Sami' })
  await expect(sami.locator('.case-charge')).toHaveCount(20)
  // Bandeau : le mois et l'année au-dessus des jours (20 jours ouvrés couvrent un ou deux mois).
  const mois = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date())
  await expect(page.locator('.bandeau-charge')).toContainText(mois.replace(/^./, (c) => c.toUpperCase()), { ignoreCase: true })
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

test('à la journée : ramener une ressource à 0,5 j un seul jour l’écrit dans le détail de son affectation, sans nouveau fichier', async ({ espace, page }) => {
  await page.getByRole('radio', { name: 'Jour' }).click()
  const camille = page.locator('.grille-charge .ressource-charge', { hasText: 'Camille' })
  await expect(camille.locator('.case-charge').nth(0)).toHaveText('1')
  const avant = (await espace.lister('affectations')).length
  await camille.locator('.case-charge').nth(0).click()
  await expect(page.getByRole('radio', { name: 'Ce jour' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('spinbutton', { name: 'Jours ce jour' }).fill('0.5')
  await page.keyboard.press('Enter')
  await expect(camille.locator('.case-charge').nth(0)).toHaveText('0,5')
  await expect(camille.locator('.case-charge').nth(0)).toHaveClass(/ajustee/)
  await expect(camille.locator('.case-charge').nth(1)).toHaveText('1')
  const fichier = (await espace.lister('affectations')).find((f) => f.startsWith('camille-portail'))!
  await expect.poll(() => espace.lire(`affectations/${fichier}`)).toMatch(/detail: \|-\n {2}\d{4}-\d{2}-\d{2}: 0\.5\n/)
  expect((await espace.lister('affectations')).length).toBe(avant)
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/plan-de-charge-ajuster.png' })
  // « Revenir à l'affectation » retire la ligne du détail.
  await page.getByRole('button', { name: 'Revenir à l’affectation' }).click()
  await expect(camille.locator('.case-charge').nth(0)).toHaveText('1')
  await expect.poll(async () => (await espace.lire(`affectations/${fichier}`)).match(/\d{4}-\d{2}-\d{2}: 0\.5/g)?.length ?? 0).toBe(1) // reste celle du modèle
})

test('scénario : l’essai du modèle se voit en pointillé, puis s’abandonne', async ({ espace, page }) => {
  await page.getByRole('radio', { name: 'Mois' }).click()
  const sami = page.locator('.grille-charge .ressource-charge', { hasText: 'Sami' })
  await expect(sami.locator('.case-charge.provisoire')).toHaveCount(0)
  await choisir(page.getByRole('button', { name: 'Scénario' }), 'Plan réel + Option A')
  await expect(sami.locator('.case-charge.provisoire').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/plan-de-charge-scenario.png' })
  const avant = (await espace.lister('affectations')).length
  await page.getByRole('button', { name: 'Abandonner' }).click()
  await page.locator('.confirmation').getByRole('button', { name: 'Abandonner' }).click()
  await expect.poll(async () => (await espace.lister('affectations')).length).toBe(avant - 2)
  await expect.poll(() => espace.lire('affectations/_schema.yaml')).not.toContain('Option A')
  await expect(page.getByRole('button', { name: 'Scénario' })).toHaveCount(0)
})

test('remplir : une ligne par rôle, l’aperçu dans la grille, puis les affectations créées dans un nouveau scénario', async ({ espace, page }) => {
  await page.getByRole('button', { name: 'Remplir' }).click()
  const panneau = page.getByRole('region', { name: 'Remplir' })
  await choisir(panneau.getByRole('button', { name: 'Remplir : projet' }), 'Intranet RH')
  await expect(panneau.getByRole('radio', { name: 'Au plus tôt' })).toHaveAttribute('aria-checked', 'true')
  // Sans besoins : une ligne à remplir, puis une deuxième, pour un autre rôle.
  await choisir(panneau.getByRole('button', { name: 'Ligne 1 : rôle' }), 'Design')
  await panneau.getByRole('spinbutton', { name: 'Ligne 1 : jours' }).fill('4')
  await panneau.getByRole('button', { name: 'Ajouter un rôle' }).click()
  await choisir(panneau.getByRole('button', { name: 'Ligne 2 : rôle' }), 'Pilotage')
  await panneau.getByRole('spinbutton', { name: 'Ligne 2 : jours' }).fill('2')
  const lignes = panneau.getByRole('listitem')
  await expect(lignes.nth(0)).toContainText('4 j placés')
  await expect(lignes.nth(1)).toContainText('2 j placés')
  await choisir(panneau.getByRole('button', { name: 'Remplir : scénario' }), 'Nouveau scénario')
  await expect(panneau.getByRole('textbox', { name: 'Nom du scénario' })).toHaveValue('Option B')
  await expect(panneau.locator('.resultat-remplir')).toContainText('6 j placés en tout')
  await expect(page.locator('.grille-charge .case-charge.provisoire').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/plan-de-charge-remplir.png' })
  const avant = (await espace.lister('affectations')).length
  await panneau.getByRole('button', { name: 'Créer dans Option B' }).click()
  await expect.poll(async () => (await espace.lister('affectations')).length).toBeGreaterThan(avant)
  await expect.poll(() => espace.lire('affectations/_schema.yaml')).toContain('Option B')
  await expect(page.getByRole('button', { name: 'Scénario' })).toContainText('Plan réel + Option B')
})

test('remplir d’après les besoins : ce qui manque, rôle par rôle, dans la fenêtre de chaque besoin', async ({ page }) => {
  await page.getByRole('button', { name: 'Remplir' }).click()
  const panneau = page.getByRole('region', { name: 'Remplir' })
  await choisir(panneau.getByRole('button', { name: 'Remplir : projet' }), 'Application mobile')
  const lignes = panneau.getByRole('listitem')
  await expect(lignes).toHaveCount(2)
  await expect(panneau.getByRole('button', { name: 'Ligne 1 : rôle' })).toContainText('Design')
  await expect(panneau.getByRole('button', { name: 'Ligne 2 : rôle' })).toContainText('Développement')
  await expect(panneau.getByRole('spinbutton', { name: 'Ligne 2 : jours' })).toHaveValue('80')
  await page.screenshot({ path: 'test-results/plan-de-charge-remplir-besoins.png' })
})

test('moratoires : une bande au-dessus des semaines, hachurée quand c’est fermé', async ({ page }) => {
  await expect(page.locator('.moratoires-charge th.moratoire-gel').first()).toBeVisible()
  await expect(page.locator('.moratoires-charge th.moratoire-ferme').first()).toBeVisible()
})

test('grouper par projet puis par version : chaque ressource sous ce sur quoi elle travaille', async ({ espace, page }) => {
  await choisir(page.getByRole('button', { name: 'Grouper par' }), 'Par projet')
  await expect.poll(() => espace.lire('ressources/_vues/charge.yaml')).toContain('regrouper: projet')
  const grille = page.locator('.grille-charge')
  await expect(grille.locator('.groupe-charge', { hasText: 'Portail client' })).toBeVisible()
  await page.screenshot({ path: 'test-results/plan-de-charge-par-projet.png' })
  await choisir(page.getByRole('button', { name: 'Grouper par' }), 'Par version')
  await expect(grille.locator('.groupe-charge', { hasText: 'Portail client · Portail v1' })).toBeVisible()
})
