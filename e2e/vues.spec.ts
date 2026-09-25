import { expect as expectBase, test as testBase, type Locator, type Page } from '@playwright/test'
import { expect, test } from './espace'

// Jalons 1, 7, 8, 9 et 11 : ouverture, pages, kanban, vues temporelles,
// dashboards et recherche globale.

/** Glisser à la souris, en plusieurs pas (dnd-kit et les vues temporelles attendent un vrai déplacement). */
async function glisser(page: Page, element: Locator, dx: number, dy = 0) {
  const b = (await element.boundingBox())!
  const x = b.x + Math.min(20, b.width / 2)
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 })
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

testBase('socle : un navigateur sans accès aux dossiers affiche un message clair', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })
  await page.goto('./')
  await expectBase(page.getByText("Ce navigateur ne permet pas d'ouvrir un dossier local.")).toBeVisible()
})

test('socle : les bases du dossier sont listées dans la barre latérale', async ({ espace, page }) => {
  expect(espace).toBeTruthy() // la fixture ouvre la démo
  await expect(page.locator('.entree-base')).toContainText(['Pilotage', 'Clients', 'Projets', 'Tâches'])
})

test.describe('pages', () => {
  test('propriété modifiée depuis la page, contenu Markdown écrit dans le corps du fichier', async ({ espace, page }) => {
    await espace.ouvrirPage('Projets', 'Site vitrine')
    const budget = page.locator('.propriete', { hasText: 'Budget' }).first().locator('.valeur-propriete')
    await budget.click()
    await budget.locator('input').fill('9000')
    await budget.locator('input').press('Enter')
    await expect.poll(() => espace.lire('projets/site-vitrine--psite001.md')).toContain('budget: 9000\n')

    const corps = page.locator('.editeur-corps .ProseMirror')
    await corps.locator('p', { hasText: 'Refaire le site vitrine' }).click()
    // curseur en fin de paragraphe (la touche Fin n'y va pas sous macOS)
    await corps.locator('p', { hasText: 'Refaire le site vitrine' }).evaluate((p) => {
      const r = document.createRange()
      r.selectNodeContents(p)
      r.collapse(false)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(r)
    })
    await page.keyboard.type(' Relance prévue lundi.')
    await expect.poll(() => espace.lire('projets/site-vitrine--psite001.md')).toContain("salon d'octobre. Relance prévue lundi.")
    expect(await espace.lire('projets/site-vitrine--psite001.md')).toContain('id: psite001\n')
  })

  test('ouvrir une page ne réécrit pas le fichier', async ({ espace, page }) => {
    const avant = await espace.lire('projets/site-vitrine--psite001.md')
    await espace.ouvrirPage('Projets', 'Site vitrine')
    await expect(page.locator('.editeur-corps .ProseMirror')).toContainText('Refaire le site vitrine')
    await page.waitForTimeout(600)
    expect(await espace.lire('projets/site-vitrine--psite001.md')).toBe(avant)
  })

  test('↓ passe à la ligne suivante de la vue, Échap ferme', async ({ espace, page }) => {
    await espace.ouvrirPage('Projets', 'Audit sécurité')
    await page.locator('.entete-page').click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.titre-page')).toHaveValue('Boutique en ligne')
    await page.keyboard.press('Escape')
    await expect(page.locator('.titre-page')).toHaveCount(0)
  })
})

test.describe('kanban', () => {
  test('glisser une carte dans une autre colonne change sa valeur', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Par statut' }).click()
    const carte = page.locator('.carte', { hasText: 'Application mobile' })
    const termine = page.locator('.kanban-colonne').nth(2)
    const cible = (await termine.boundingBox())!
    const depart = (await carte.boundingBox())!
    await glisser(page, carte, cible.x + 40 - depart.x, cible.y + cible.height - 30 - depart.y)
    await expect(termine.locator('.carte', { hasText: 'Application mobile' })).toBeVisible()
    await expect.poll(() => espace.lire('projets/application-mobile--pmobi002.md')).toContain('statut: Terminé\n')
  })
})

test.describe('vues temporelles', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-25T10:00:00'))
  })

  test('timeline : glisser une barre d’une semaine décale début et échéance', async ({ espace, page }) => {
    await espace.base('Tâches')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    const semaines = page.locator('.tl-bas .tl-graduation')
    const [a, b] = await Promise.all([semaines.nth(1).boundingBox(), semaines.nth(2).boundingBox()])
    const barre = page.locator('.tl-barre', { hasText: 'Cadrage' }).or(page.locator('.tl-ligne', { hasText: 'Cadrage' }).locator('.tl-barre')).first()
    await glisser(page, barre, b!.x - a!.x)
    await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).toContain('debut: 2026-10-05\n')
    expect(await espace.lire('taches/cadrage--tcadr004.md')).toContain('echeance: 2026-10-08\n')
  })

  test('calendrier : le « + » d’un jour crée une ligne à cette date (colonne de placement : l’échéance)', async ({ espace, page }) => {
    await espace.base('Tâches')
    await page.locator('.onglet', { hasText: 'Calendrier' }).click()
    const jour = page.locator('.cal-jour', { has: page.locator('.num-jour', { hasText: /^30$/ }) }).first()
    await jour.hover()
    await jour.getByTitle('Nouvelle ligne à cette date').click()
    await expect.poll(async () => {
      const fichiers = await espace.lister('taches')
      const textes = await Promise.all(fichiers.filter((n) => n.endsWith('.md')).map((n) => espace.lire(`taches/${n}`)))
      return textes.filter((t) => t.includes('echeance: 2026-09-30')).length
    }).toBe(1)
  })
})

test.describe('timeline en arbre', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-25T10:00:00'))
  })
  const rangee = (page: Page, titre: string) => page.locator('.tl-ligne', { has: page.locator('.tl-titre', { hasText: titre }) })

  test('les tâches se déplient sous leur projet, se replient, et se glissent comme une barre', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await expect(page.locator('.tl-enfant', { hasText: 'Intégration' })).toBeVisible()
    await expect(page.locator('.tl-enfant', { hasText: 'Maquettes' })).toBeVisible()

    await page.getByRole('button', { name: 'Replier Site vitrine' }).click()
    await expect(page.locator('.tl-enfant', { hasText: 'Intégration' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Déplier Site vitrine' }).click()

    const semaines = page.locator('.tl-bas .tl-graduation')
    const [a, b] = await Promise.all([semaines.nth(1).boundingBox(), semaines.nth(2).boundingBox()])
    const avant = await espace.lire('taches/integration--tinte002.md')
    await glisser(page, rangee(page, 'Intégration').locator('.tl-barre'), b!.x - a!.x)
    await expect.poll(() => espace.lire('taches/integration--tinte002.md')).not.toBe(avant)
  })

  test('réglages d’un niveau : sans fin, des losanges ; ses filtres ne touchent que lui', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Options' }).click()
    const reglages = page.locator('.reglages-niveau').first()
    await reglages.getByRole('combobox').nth(1).selectOption('')
    await expect(page.locator('.tl-enfant .tl-point').first()).toBeVisible()
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).not.toContain('    champ_fin')

    await reglages.getByText('Filtrer les lignes de Tâches').click()
    await reglages.getByRole('button', { name: 'Ajouter un filtre' }).click()
    const ligne = reglages.locator('.ligne-filtre').first()
    await ligne.locator('select').nth(1).selectOption('contient')
    await ligne.locator('input').fill('mise')
    await ligne.locator('input').press('Enter')
    await page.keyboard.press('Escape')
    await expect(page.locator('.tl-enfant .tl-titre')).toHaveText(['Mise en ligne'])
    // Les projets, eux, restent tous là.
    await expect(page.locator('.tl-ligne:not(.tl-enfant) .tl-titre:not(.ajout-ligne)')).toHaveCount(4)
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('      - { colonne: titre, operateur: contient, valeur: mise }')
  })
})

test.describe('dashboards et recherche', () => {
  test('nouveau dashboard : fichier créé, bloc ajouté depuis une vue de base', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Nouveau dashboard' }).click()
    await page.keyboard.type('Suivi')
    await page.keyboard.press('Enter')
    await expect(page.locator('h1', { hasText: 'Suivi' })).toBeVisible()
    await expect.poll(async () => (await espace.lister('_dashboards')).includes('suivi.yaml')).toBe(true)
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click()
    await page.locator('.flottant .option', { hasText: 'Projets' }).first().click()
    await page.locator('.flottant .option', { hasText: 'Tableau' }).first().click()
    await expect(page.locator('.bloc-dashboard .rangee', { hasText: 'Site vitrine' })).toBeVisible()
    await expect.poll(() => espace.lire('_dashboards/suivi.yaml')).toContain('projets')
  })

  test('filtre rapide global : un projet choisi filtre ses blocs et ceux qui lui sont liés', async ({ espace, page }) => {
    await page.locator('.entree-base', { hasText: 'Pilotage' }).click()
    const blocs = page.locator('.bloc-dashboard')
    await expect(blocs.nth(0)).toContainText('Boutique en ligne')
    await expect(blocs.nth(2)).toContainText('Globex')

    await page.getByRole('button', { name: 'Filtre rapide' }).first().click()
    await page.locator('.flottant .option', { hasText: 'Projets' }).click()
    await page.locator('.flottant .option', { hasText: 'Choisir des lignes de Projets' }).click()
    await page.locator('.filtres-dashboard .pilule', { hasText: 'Projets' }).click()
    await page.locator('.flottant .case-reglage', { hasText: 'Site vitrine' }).locator('input').check()
    await page.keyboard.press('Escape')

    await expect(page.locator('.filtres-dashboard .pilule.active')).toHaveText(/Projets : Site vitrine/)
    await expect(blocs.nth(0)).toContainText('Site vitrine')
    await expect(blocs.nth(0)).not.toContainText('Boutique en ligne')
    // Les clients suivent leur relation vers les projets : seul Acme, client du site vitrine.
    await expect(blocs.nth(2)).toContainText('Acme')
    await expect(blocs.nth(2)).not.toContainText('Globex')
    await expect.poll(() => espace.lire('_dashboards/pilotage.yaml')).toContain('filtres_rapides:\n  - { base: projets, valeur: [ psite001 ] }\n')
  })

  test('Ctrl+K : chercher dans le contenu des pages, Entrée ouvre la ligne', async ({ espace, page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.champ-recherche').fill('salon')
    await expect(page.locator('.resultat').first()).toContainText('Site vitrine')
    await page.keyboard.press('Enter')
    await expect(page.locator('.titre-page')).toHaveValue('Site vitrine')
    expect(espace).toBeTruthy()
  })
})
