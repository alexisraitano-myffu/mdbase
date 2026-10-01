import type { Page } from '@playwright/test'
import { expect, test, choisir } from './espace'

// Jalons 4, 5 et 10 : bases, groupes et colonnes depuis l'interface ; filtres,
// tris et filtres rapides ; formules.

const entetes = (page: Page) => page.locator('.entete .cellule-entete:not(.ajout)')
const titres = (page: Page) => page.locator('.rangee .cellule.titre')

async function menuColonne(page: Page, nom: string) {
  await page.locator('.libelle-entete', { hasText: nom }).first().click()
}

test.describe('bases, groupes et colonnes', () => {
  test('nouvelle base : dossier et schéma créés, base ouverte', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Nouvelle base', exact: true }).click()
    await page.keyboard.type('Fournisseurs')
    await page.keyboard.press('Enter')
    await expect(page.locator('h1', { hasText: 'Fournisseurs' })).toBeVisible()
    await expect.poll(() => espace.lire('fournisseurs/_schema.yaml')).toContain('nom: Fournisseurs')
  })

  test('nouveau groupe : écrit dans _espace.yaml, affiché dans la barre latérale', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Nouveau groupe' }).click()
    await page.keyboard.type('Archives')
    await page.keyboard.press('Enter')
    await expect(page.locator('.titre-groupe', { hasText: 'Archives' })).toBeVisible()
    await expect.poll(() => espace.lire('_espace.yaml')).toContain('Archives')
  })

  test('ajouter une colonne, la renommer : la clé ne change pas, les lignes ne sont pas réécrites', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.cellule-entete.ajout').click()
    await page.getByPlaceholder('Nom de la colonne').fill('Contact')
    await page.locator('.flottant .option', { hasText: 'Texte' }).click()
    await expect(entetes(page).filter({ hasText: 'Contact' })).toHaveCount(1)
    await expect.poll(() => espace.lire('projets/_schema.yaml')).toMatch(/cle: contact,? *\n?\s*nom: Contact|\{ cle: contact, nom: Contact, type: text \}/)

    const avant = await espace.lire('projets/site-vitrine--psite001.md')
    await menuColonne(page, 'Statut')
    await page.locator('.flottant input').fill('État')
    await page.keyboard.press('Enter')
    await expect(entetes(page).filter({ hasText: 'État' })).toHaveCount(1)
    await expect.poll(() => espace.lire('projets/_schema.yaml')).toMatch(/cle: statut\s+nom: État/)
    expect(await espace.lire('projets/site-vitrine--psite001.md')).toBe(avant)
  })

  test('supprimer une colonne : confirmation chiffrée, valeur retirée des fichiers', async ({ espace, page }) => {
    await espace.base('Projets')
    await menuColonne(page, 'Budget')
    await page.getByRole('button', { name: 'Supprimer la colonne' }).click()
    await expect(page.locator('.confirmation')).toContainText('Le contenu de 4 lignes sera effacé.')
    await page.locator('.confirmation').getByRole('button', { name: 'Supprimer' }).click()
    await expect(entetes(page).filter({ hasText: 'Budget' })).toHaveCount(1) // reste « Budget par heure », en erreur
    await expect.poll(() => espace.lire('projets/site-vitrine--psite001.md')).not.toContain('budget:')
    expect(await espace.lire('projets/_schema.yaml')).not.toContain('cle: budget,')
  })
})

test('supprimer une base : portée montrée, relations converties en texte, dossier effacé', async ({ espace, page }) => {
  await espace.base('Clients')
  // Le bouton ⋯ (au survol) ouvre le même menu que le clic droit.
  await page.locator('.entree-base', { hasText: 'Clients' }).hover()
  await page.getByRole('button', { name: 'Options de la base Clients' }).click()
  await page.getByRole('button', { name: 'Supprimer la base…' }).click()
  const confirmation = page.locator('.confirmation')
  await expect(confirmation).toContainText('ses 3 lignes')
  await expect(confirmation).toContainText('Projets › Client')
  await expect(confirmation).toContainText('Un bloc de dashboard')
  await confirmation.getByRole('button', { name: 'Supprimer la base' }).click()

  await expect(page.locator('.entree-base', { hasText: 'Clients' })).toHaveCount(0)
  await expect(page.locator('h1')).not.toHaveText('Clients')
  await expect.poll(() => espace.lister('')).not.toContain('clients')
  expect(await espace.lire('projets/site-vitrine--psite001.md')).toContain('client: Acme\n')
  expect(await espace.lire('_dashboards/pilotage.yaml')).not.toContain('base: clients')
})

test('dupliquer une base : copie placée après l’original, lignes et relations reprises', async ({ espace, page }) => {
  await espace.base('Clients')
  await page.locator('.entree-base', { hasText: 'Clients' }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Dupliquer' }).click()
  await expect(page.locator('h1')).toHaveText('Clients (copie)')
  await expect(page.locator('.entree-base').nth(2)).toHaveText('Clients (copie)')
  await expect.poll(() => espace.lire('_espace.yaml')).toContain('bases: [ clients, clients-copie, projets, taches ]')
  expect(await espace.lire('clients-copie/_schema.yaml')).toContain('nom: Clients (copie)')
  expect(await espace.lire('projets/_schema.yaml')).toContain('cle: clients_copie')
  // Les rollups de la copie suivent les liens repris : mêmes valeurs que l'original.
  await expect(page.locator('.carte', { hasText: 'Acme' })).toContainText('24')
})

test.describe('filtres et tris', () => {
  test('filtre rapide « parmi » : lignes filtrées, pastille active, valeur enregistrée dans la vue', async ({ espace, page }) => {
    await espace.base('Projets')
    await expect(titres(page)).toHaveCount(4)
    await page.locator('.pilule', { hasText: 'Statut' }).click()
    await page.locator('.choix-parmi label', { hasText: 'En cours' }).locator('input').check()
    await page.keyboard.press('Escape')
    await expect(titres(page)).toHaveText(['Boutique en ligne', 'Site vitrine'])
    await expect(page.locator('.pilule.active')).toContainText('Statut')
    await expect.poll(() => espace.lire('projets/_vues/tableau.yaml')).toContain('En cours')
  })

  test('filtre « Titre contient » depuis Filtrer', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Filtrer' }).click()
    await page.getByRole('button', { name: 'Ajouter un filtre' }).click()
    const ligne = page.locator('.flottant .ligne-filtre').first()
    await expect(ligne.getByRole('button', { name: 'Colonne du filtre' })).toHaveText('Titre')
    await choisir(ligne.getByRole('button', { name: 'Opérateur' }), 'contient')
    await ligne.locator('input').fill('site')
    await ligne.locator('input').press('Enter')
    await page.keyboard.press('Escape')
    await expect(titres(page)).toHaveText(['Site vitrine'])
    await expect(page.getByRole('button', { name: 'Filtrer (1)' })).toBeVisible()
  })

  test('liste de choix : flèches et Entrée, recherche au-delà de huit entrées, Échap ne ferme que la liste', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Filtrer' }).click()
    await page.getByRole('button', { name: 'Ajouter un filtre' }).click()
    const ligne = page.locator('.flottant .ligne-filtre').first()

    // Opérateur au clavier : la liste s'ouvre sur la valeur choisie, ↓ puis Entrée prend la suivante.
    const operateur = ligne.getByRole('button', { name: 'Opérateur' })
    await operateur.click()
    await expect(page.getByRole('option', { name: 'est', exact: true })).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(operateur).toHaveText("n'est pas")
    await expect(page.getByRole('listbox')).toHaveCount(0)

    // Plus de huit colonnes : une recherche filtre la liste.
    await ligne.getByRole('button', { name: 'Colonne du filtre' }).click()
    await page.getByRole('textbox', { name: 'Rechercher' }).fill('éch')
    await expect(page.getByRole('option')).toHaveText(['Échéance'])
    await page.keyboard.press('Enter')
    await expect(ligne.getByRole('button', { name: 'Colonne du filtre' })).toHaveText('Échéance')

    // Échap ferme la liste ouverte, puis le panneau.
    await ligne.getByRole('button', { name: 'Opérateur' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(ligne).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.flottant')).toHaveCount(0)
    await expect.poll(() => espace.lire('projets/_vues/tableau.yaml')).toContain('colonne: echeance')
  })

  test('tri décroissant sur l’échéance', async ({ espace, page }) => {
    await espace.base('Projets')
    await expect(titres(page)).toHaveText(['Audit sécurité', 'Boutique en ligne', 'Site vitrine', 'Application mobile'])
    await page.getByRole('button', { name: 'Trier (1)' }).click()
    await choisir(page.locator('.flottant .ligne-filtre').getByRole('button', { name: 'Sens du tri' }), 'décroissant')
    await page.keyboard.press('Escape')
    await expect(titres(page)).toHaveText(['Application mobile', 'Site vitrine', 'Boutique en ligne', 'Audit sécurité'])
    await expect.poll(() => espace.lire('projets/_vues/tableau.yaml')).toContain('desc')
  })
})

test.describe('formules', () => {
  test('nouvelle colonne formule : valeur calculée, expression stockée avec les clés', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.cellule-entete.ajout').click()
    await page.getByPlaceholder('Nom de la colonne').fill('Budget k€')
    await page.locator('.flottant .option', { hasText: 'Formule' }).click()
    await page.locator('.zone-formule').fill('prop("Budget") / 1000')
    await page.getByRole('button', { name: 'Enregistrer' }).click()
    await expect(entetes(page).filter({ hasText: 'Budget k€' })).toHaveCount(1)
    const index = await entetes(page).evaluateAll((els) => els.findIndex((e) => e.textContent?.trim() === 'Budget k€'))
    await expect(page.locator('.rangee', { hasText: 'Site vitrine' }).locator('.case').nth(index)).toHaveText('8')
    await expect.poll(() => espace.lire('projets/_schema.yaml')).toContain('prop("budget") / 1000')
  })

  test('une formule invalide est refusée avec une erreur en français', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.cellule-entete.ajout').click()
    await page.locator('.flottant .option', { hasText: 'Formule' }).click()
    await page.locator('.zone-formule').fill('prop("Inconnue") + 1')
    await expect(page.locator('.erreur-formule')).toContainText('Inconnue')
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
  })
})
