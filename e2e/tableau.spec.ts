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

/** Coche une ligne : sa case n'apparaît qu'au survol, comme dans Notion. */
async function cocher(page: Page, titre: string, etendre = false) {
  const rangee = page.locator('.rangee', { hasText: titre }).first()
  await rangee.hover()
  await rangee.locator('.gouttiere input').click(etendre ? { modifiers: ['Shift'] } : {})
}

test.describe('plusieurs lignes à la fois', () => {
  // Lignes de « Boutique en ligne », visibles avec le filtre rapide « Fait : non coché » de la démo.
  const CATALOGUE = 'taches/catalogue--tcata005.md'
  const PAIEMENT = 'taches/paiement--tpaie006.md'
  const RECETTE = 'taches/recette--trece007.md'

  test('sélection au clic puis Maj+clic ; une cellule modifiée l’est sur toute la sélection ; suppression', async ({ espace, page }) => {
    await espace.base('Tâches')
    await cocher(page, 'Paiement')
    await cocher(page, 'Recette', true)
    await expect(page.locator('.barre-selection')).toContainText('2 lignes sélectionnées')

    await (await cellule(page, 'Paiement', 'Priorité')).click()
    await page.locator('.flottant .option', { hasText: 'Normale' }).click()
    await expect.poll(() => espace.lire(PAIEMENT)).toContain('priorite: Normale\n')
    await expect.poll(() => espace.lire(RECETTE)).toContain('priorite: Normale\n')
    expect(await espace.lire(CATALOGUE)).toContain('priorite: Haute\n')

    await page.locator('.barre-selection').getByRole('button', { name: 'Supprimer' }).click()
    await page.locator('.flottant').getByRole('button', { name: 'Supprimer' }).click()
    await expect.poll(() => espace.lister('taches')).not.toContain('paiement--tpaie006.md')
    expect(await espace.lister('taches')).not.toContain('recette--trece007.md')
    expect(await espace.lister('taches')).toContain('catalogue--tcata005.md')
    await expect(page.locator('.barre-selection')).toHaveCount(0)
  })

  test('Suppr sur une sélection demande confirmation ; Échap la vide', async ({ espace, page }) => {
    await espace.base('Tâches')
    await cocher(page, 'Catalogue produits')
    await page.keyboard.press('Delete')
    await expect(page.locator('.flottant .confirmation')).toContainText('Supprimer cette ligne ?')
    await page.locator('.flottant').getByRole('button', { name: 'Annuler' }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('.barre-selection')).toHaveCount(0)
    expect(await espace.lister('taches')).toContain('catalogue--tcata005.md')
  })

  test('dupliquer crée un nouveau fichier avec les mêmes valeurs', async ({ espace, page }) => {
    await espace.base('Tâches')
    await cocher(page, 'Catalogue produits')
    await page.locator('.barre-selection').getByRole('button', { name: 'Dupliquer' }).click()
    await expect.poll(async () => (await espace.lister('taches')).filter((n) => n.startsWith('catalogue-produits--')).length).toBe(1)
    const copie = (await espace.lister('taches')).find((n) => n.startsWith('catalogue-produits--'))!
    const texte = await espace.lire(`taches/${copie}`)
    for (const attendu of ['titre: Catalogue produits\n', 'projet: pbout003\n', 'priorite: Haute\n', 'heures: 10\n']) expect(texte).toContain(attendu)
  })

  test('tirer la poignée d’une cellule vers le bas recopie sa valeur sur les lignes survolées', async ({ espace, page }) => {
    await espace.base('Tâches')
    const depart = await cellule(page, 'Catalogue produits', 'Heures')
    await depart.hover()
    const b = (await depart.locator('.poignee-recopie').boundingBox())!
    const arrivee = (await (await cellule(page, 'Recette', 'Heures')).boundingBox())!
    await page.mouse.move(b.x + 3, b.y + 3)
    await page.mouse.down()
    await page.mouse.move(arrivee.x + 20, arrivee.y + 10, { steps: 6 })
    await expect(page.locator('.case.recopie')).toHaveCount(3)
    await page.mouse.up()
    await expect.poll(() => espace.lire(PAIEMENT)).toContain('heures: 10\n')
    await expect.poll(() => espace.lire(RECETTE)).toContain('heures: 10\n')
    expect(await espace.lire('taches/cadrage--tcadr004.md')).toContain('heures: 4\n')
  })
})

test.describe('copier-coller', () => {
  /** Déclenche un collage (ou une copie) comme le clavier, avec un presse-papiers simulé. */
  async function pressePapiers(page: Page, type: 'copy' | 'paste', texte = '') {
    return page.evaluate(
      ([type, texte]) => {
        const dt = new DataTransfer()
        if (texte) dt.setData('text/plain', texte)
        document.body.dispatchEvent(new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }))
        return { texte: dt.getData('text/plain'), html: dt.getData('text/html') }
      },
      [type, texte] as const,
    )
  }

  test('copier une sélection donne un tableau Markdown et un tableau HTML', async ({ espace, page }) => {
    await espace.base('Tâches')
    await cocher(page, 'Catalogue produits')
    const { texte, html } = await pressePapiers(page, 'copy')
    expect(texte).toContain('| Titre | Projet |')
    expect(texte).toMatch(/\| Catalogue produits \| Boutique en ligne \|/)
    expect(html).toContain('<td>Catalogue produits</td>')
  })

  test('coller un tableau Markdown avec en-têtes : aperçu, puis une ligne par enregistrement', async ({ espace, page }) => {
    await espace.base('Tâches')
    await pressePapiers(page, 'paste', '| Titre | Heures |\n| --- | --- |\n| Audit | 4 |\n| Revue | 1,5 |\n')
    await expect(page.getByRole('dialog', { name: 'Coller des lignes dans Tâches' })).toBeVisible()
    await page.getByRole('button', { name: 'Coller 2 lignes' }).click()
    await expect.poll(async () => (await espace.lister('taches')).filter((n) => /^(audit|revue)--/.test(n)).length).toBe(2)
    const revue = (await espace.lister('taches')).find((n) => n.startsWith('revue--'))!
    expect(await espace.lire(`taches/${revue}`)).toContain('heures: 1.5\n')
  })

  test('coller une liste sans en-têtes (copiée d’un tableur) : chaque valeur va dans la colonne affichée à sa place', async ({ espace, page }) => {
    await espace.base('Tâches')
    await pressePapiers(page, 'paste', 'Audit\r\nRevue\r\n')
    await page.getByRole('button', { name: 'Coller 2 lignes' }).click()
    await expect.poll(async () => (await espace.lister('taches')).filter((n) => /^(audit|revue)--/.test(n)).length).toBe(2)
  })

  test('coller dans un champ en cours d’édition ne crée aucune ligne', async ({ espace, page }) => {
    await espace.base('Tâches')
    await (await cellule(page, 'Cadrage', 'Titre')).click()
    await page.locator('.rangee input.editeur').focus()
    await page.locator('.rangee input.editeur').evaluate((el) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', 'a\nb\n')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
