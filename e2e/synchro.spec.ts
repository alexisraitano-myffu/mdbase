import { expect, test } from './espace'

// Jalon 12 (spec §4 et §12) : changements faits ailleurs, conflits de
// synchro, suppression de ligne et liens cassés.

const SITE = 'projets/site-vitrine--psite001.md'

test.describe('relecture du dossier', () => {
  test('une ligne modifiée ailleurs est relue au retour sur l’onglet', async ({ espace }) => {
    await espace.base('Projets')
    await expect(espace.tableau.getByText('Site vitrine', { exact: true })).toBeVisible()
    await espace.remplacer(SITE, 'titre: Site vitrine\n', 'titre: Site vitrine (modifié ailleurs)\n')
    await espace.retourSurOnglet()
    await expect(espace.tableau.getByText('Site vitrine (modifié ailleurs)')).toBeVisible()
  })

  test('une ligne ajoutée ou supprimée ailleurs apparaît ou disparaît avec « Relire le dossier »', async ({ espace, page }) => {
    await espace.base('Projets')
    await espace.ecrire('projets/refonte--pzzzz001.md', '---\nid: pzzzz001\ntitre: Refonte ajoutée ailleurs\n---\n')
    await espace.supprimer('projets/boutique-en-ligne--pbout003.md')
    await page.getByRole('button', { name: 'Relire le dossier' }).click()
    await expect(espace.tableau.getByText('Refonte ajoutée ailleurs')).toBeVisible()
    await expect(espace.tableau.getByText('Boutique en ligne', { exact: true })).toHaveCount(0)
    await expect(page.locator('.relire')).toHaveText(/Relu à \d\d:\d\d/)
  })

  test('une vue créée ailleurs apparaît dans les onglets', async ({ espace, page }) => {
    await espace.base('Projets')
    await espace.ecrire('projets/_vues/liste-courte.yaml', 'nom: Liste courte\ntype: tableau\n')
    await espace.retourSurOnglet()
    await expect(page.getByText('Liste courte')).toBeVisible()
  })

  test('le contenu d’une page ouverte suit un changement fait ailleurs', async ({ espace, page }) => {
    await espace.ouvrirPage('Tâches', 'Intégration')
    const editeur = page.locator('.editeur-corps')
    await expect(editeur.locator('.ProseMirror')).toBeVisible()
    await espace.remplacer('taches/integration--tinte002.md', /\n---\n[\s\S]*$/, '\n---\nTexte écrit sur une autre machine.\n')
    await espace.retourSurOnglet()
    await expect(editeur.getByText('Texte écrit sur une autre machine.')).toBeVisible()
  })
})

test.describe('id en double (copie OneDrive d’une ligne)', () => {
  const COPIE = 'projets/site-vitrine--psite001-DESKTOP-AB12.md'

  test.beforeEach(async ({ espace }) => {
    await espace.base('Projets')
    await espace.ecrire(COPIE, (await espace.lire(SITE)).replace('budget: 8000', 'budget: 9500'))
    await espace.retourSurOnglet()
  })

  // `beforeEach` a déjà ouvert l'espace (fixture partagée par le test).
  test('les deux lignes sont marquées ; la comparaison montre ce qui diffère', async ({ page }) => {
    await expect(page.getByText('en plusieurs exemplaires')).toBeVisible()
    await expect(page.locator('.rangee.conflit')).toHaveCount(2)
    await page.getByRole('button', { name: 'Comparer et choisir' }).click()
    const copie = page.locator('.groupe-doublon tr', { hasText: 'DESKTOP-AB12' })
    await expect(copie).toContainText('nom de copie')
    await expect(copie).toContainText(/9\s?500/)
    await expect(page.locator('.groupe-doublon tr', { hasText: 'psite001.md' }).filter({ hasNotText: 'DESKTOP' })).toContainText(/8\s?000/)
    await expect(page.locator('.groupe-doublon th')).toHaveText(['Fichier', 'Budget', ''])
  })

  test('« En faire une ligne à part » : nouvel id, nouveau fichier, plus de conflit', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Comparer et choisir' }).click()
    await page.locator('.groupe-doublon tr', { hasText: 'DESKTOP-AB12' }).getByRole('button', { name: 'En faire une ligne à part' }).click()
    // Le dernier conflit réglé : la fenêtre et le bandeau disparaissent.
    await expect(page.locator('.fenetre')).toHaveCount(0)
    await expect(page.locator('.bandeau-conflit')).toHaveCount(0)
    const noms = await espace.lister('projets')
    expect(noms).not.toContain('site-vitrine--psite001-DESKTOP-AB12.md')
    const nouveau = noms.find((n) => n.startsWith('site-vitrine--') && !n.includes('psite001'))
    expect(nouveau).toBeDefined()
    expect(await espace.lire(`projets/${nouveau}`)).toContain('budget: 9500')
    expect(await espace.lire(SITE)).toContain('budget: 8000')
  })

  test('« Garder celle-ci » supprime l’autre fichier, après confirmation', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Comparer et choisir' }).click()
    const originale = page.locator('.groupe-doublon tr', { hasText: 'psite001.md' }).filter({ hasNotText: 'DESKTOP' })
    await originale.getByRole('button', { name: 'Garder celle-ci' }).click()
    await expect(originale).toContainText("L'autre fichier sera supprimé.")
    expect(await espace.lister('projets')).toContain('site-vitrine--psite001-DESKTOP-AB12.md') // rien avant la confirmation
    await originale.getByRole('button', { name: 'Confirmer' }).click()
    await expect(page.locator('.fenetre')).toHaveCount(0)
    expect(await espace.lister('projets')).not.toContain('site-vitrine--psite001-DESKTOP-AB12.md')
    await expect(page.locator('.rangee.conflit')).toHaveCount(0)
  })
})

test('copie de conflit d’une vue : jamais chargée, signalée, « Garder la copie » remplace l’original', async ({ espace, page }) => {
  await espace.base('Tâches')
  const vue = await espace.lire('taches/_vues/tableau.yaml')
  await espace.ecrire('taches/_vues/tableau-DESKTOP-AB12.yaml', vue.replace('nom: Tableau', 'nom: Tableau du portable'))
  await espace.retourSurOnglet()
  const alerte = page.getByRole('button', { name: /1 copie de conflit/ })
  await expect(alerte).toBeVisible()
  await expect(page.getByText('Tableau du portable')).toHaveCount(0)

  await alerte.click()
  const fenetre = page.locator('.fenetre')
  await expect(fenetre.getByText('nom: Tableau du portable')).toBeVisible()
  await fenetre.getByRole('button', { name: 'Garder la copie' }).click()
  await expect(fenetre).toHaveCount(0)
  await expect(page.getByText('Tableau du portable')).toBeVisible()
  await expect(alerte).toHaveCount(0)
  expect(await espace.lire('taches/_vues/tableau.yaml')).toContain('nom: Tableau du portable')
  expect(await espace.lister('taches/_vues')).not.toContain('tableau-DESKTOP-AB12.yaml')
})

test.describe('suppression d’une ligne et liens cassés', () => {
  async function supprimer(espace: import('./espace').Espace, titre: string, nettoyer: boolean) {
    const page = espace.page
    await espace.ouvrirPage('Projets', titre)
    await page.getByRole('button', { name: 'Actions de la ligne' }).click()
    await page.getByRole('button', { name: 'Supprimer la ligne…' }).click()
    const confirmation = page.locator('.confirmation')
    const caseLiens = confirmation.locator('input[type=checkbox]')
    await expect(caseLiens).toBeChecked() // le nettoyage est proposé par défaut
    if (!nettoyer) await caseLiens.uncheck()
    await confirmation.getByRole('button', { name: 'Supprimer' }).click()
    await expect(page.locator('.titre-page')).toHaveCount(0)
  }

  test('sans nettoyage : le fichier part, les liens restent, puis « Retirer les 2 liens cassés »', async ({ espace, page }) => {
    await supprimer(espace, 'Audit sécurité', false)
    await expect.poll(() => espace.lister('projets')).not.toContain('audit-securite--paudi004.md')
    expect(await espace.lire('taches/entretiens--tentr008.md')).toContain('projet: paudi004')

    await espace.base('Tâches')
    await espace.tableau.locator('.libelle-entete', { hasText: 'Projet' }).first().click()
    await page.getByRole('button', { name: 'Retirer les 2 liens cassés' }).click()
    await expect.poll(() => espace.lire('taches/entretiens--tentr008.md')).not.toContain('projet:')
    await expect.poll(() => espace.lire('taches/rapport--trapp009.md')).not.toContain('projet:')
    expect(await espace.lire('taches/integration--tinte002.md')).toContain('projet: psite001') // un lien valide ne bouge pas
    await expect(page.locator('.lien-casse')).toHaveCount(0)
  })

  test('avec nettoyage : les liens vers la ligne sont retirés des fichiers qui les portent', async ({ espace }) => {
    await supprimer(espace, 'Application mobile', true)
    await expect.poll(() => espace.lister('projets')).not.toContain('application-mobile--pmobi002.md')
    await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).not.toContain('projet:')
  })
})
