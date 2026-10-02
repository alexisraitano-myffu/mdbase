import { expect, test, choisir } from './espace'

// Tâches (spec §9) : les cases à cocher du corps, dans l'onglet Tâches d'une
// page (avec celles des lignes liées) et dans « Toutes les tâches ».

const SITE = 'projets/site-vitrine--psite001.md'
const INTEGRATION = 'taches/integration--tinte002.md'

test.beforeEach(async ({ espace }) => {
  await espace.remplacer(SITE, /\n---\n[\s\S]*$/, '\n---\n## Reste à faire\n\n- [ ] Relancer **Acme**\n- [x] Brief validé\n')
  await espace.remplacer(INTEGRATION, /\n---\n[\s\S]*$/, '\n---\nGabarits posés.\n\n- [ ] Formulaire de contact\n')
  await espace.retourSurOnglet()
})

test('onglet Tâches : cases du corps, ajout, tâches des lignes liées, chacune écrite dans son fichier', async ({ espace, page }) => {
  await espace.ouvrirPage('Projets', 'Site vitrine')
  await page.locator('.entete-page button', { hasText: 'Par défaut' }).click()
  await page.getByRole('switch', { name: 'Onglet Tâches' }).click()
  await expect.poll(() => espace.lire('projets/_pages/defaut.yaml')).toContain('  - type: taches\n')
  await page.getByRole('switch', { name: 'Ajouter les tâches des lignes liées' }).click()
  const section = page.locator('.section-reglages', { hasText: 'Onglet Tâches' })
  await choisir(section.getByRole('button', { name: 'Lignes liées par' }), 'Tâches')
  await expect.poll(() => espace.lire('projets/_pages/defaut.yaml')).toContain('  - type: taches\n    liees:\n      relation: taches\n')
  await page.mouse.click(5, 5) // ferme les réglages

  const onglet = page.locator('.onglets-page .onglet', { hasText: 'Tâches' }).last()
  await expect(onglet).toContainText('2') // Relancer Acme, Formulaire de contact
  await onglet.click()
  const taches = page.locator('.onglet-taches')
  await expect(taches.locator('.section-taches')).toHaveText('Reste à faire')
  await expect(taches.getByRole('checkbox', { name: 'Relancer Acme' })).not.toBeChecked()
  await expect(taches.getByRole('checkbox', { name: 'Brief validé' })).toBeChecked()
  // Seule Intégration a des cases parmi les tâches du projet.
  await expect(taches.locator('.taches-liees .titre-contenu')).toHaveText(['Intégration'])

  await taches.getByRole('checkbox', { name: 'Formulaire de contact' }).check()
  await expect.poll(() => espace.lire(INTEGRATION)).toContain('Gabarits posés.\n\n- [x] Formulaire de contact\n')
  await expect(onglet).toContainText('1')

  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).fill('Envoyer le devis')
  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).press('Enter')
  await expect.poll(() => espace.lire(SITE)).toContain('- [x] Brief validé\n- [ ] Envoyer le devis\n')
  await expect(taches.getByRole('checkbox', { name: 'Envoyer le devis' })).toBeVisible()
})

test('toutes les tâches : par base et par ligne, filtre À faire, recherche, cocher écrit dans le fichier', async ({ espace, page }) => {
  await page.getByRole('button', { name: 'Toutes les tâches' }).click()
  const liste = page.locator('.toutes-taches')
  await expect(liste.locator('h2')).toHaveText(['Projets', 'Tâches'])
  await expect(liste.getByRole('checkbox', { name: 'Brief validé' })).toHaveCount(0) // faite : masquée par « À faire »
  await liste.getByRole('button', { name: /Toutes/ }).click()
  await expect(liste.getByRole('checkbox', { name: 'Brief validé' })).toBeChecked()
  await liste.getByRole('button', { name: /À faire/ }).click()

  await liste.getByRole('checkbox', { name: 'Relancer Acme' }).check()
  await expect.poll(() => espace.lire(SITE)).toContain('- [x] Relancer **Acme**\n')
  await expect(liste.getByRole('checkbox', { name: 'Relancer Acme' })).toBeChecked() // reste sous le clic

  await liste.getByRole('textbox', { name: 'Chercher une tâche' }).fill('formul')
  await expect(liste.getByRole('checkbox')).toHaveCount(1)
  await expect(liste.locator('.titre-contenu')).toHaveText(['Intégration'])

  await page.getByRole('button', { name: 'Passer en consultation (Ctrl+E)' }).click()
  await expect(liste.getByRole('checkbox', { name: 'Formulaire de contact' })).toBeDisabled()
  await page.getByRole('button', { name: 'Passer en édition (Ctrl+E)' }).click()

  await liste.locator('.titre-contenu', { hasText: 'Intégration' }).click()
  await expect(page.locator('.titre-page')).toBeVisible()
})
