import { expect, test } from './espace'

// Magasin de modules (spec §19) : le socle est toujours là, le reste s'ajoute ;
// un module dont l'espace se sert reste actif, sans réglage.

test('un module utilisé par l’espace reste actif ; retiré, il quitte les menus sans toucher aux fichiers', async ({ espace, page }) => {
  await page.getByRole('button', { name: 'Magasin' }).click()
  const magasin = page.getByRole('dialog', { name: 'Magasin' })
  const kanban = magasin.getByRole('article', { name: 'Kanban' })
  await expect(kanban).toContainText('Utilisé par 2 vues')
  await expect(kanban.getByRole('button', { name: 'Retirer' })).toBeDisabled()
  await page.waitForTimeout(300) // fin de l'apparition de la fenêtre
  await page.screenshot({ path: 'test-results/magasin.png' })
  await magasin.locator('.corps-fenetre').evaluate((e) => e.scrollTo(0, e.scrollHeight))
  await page.screenshot({ path: 'test-results/magasin-bas.png' })
  await page.keyboard.press('Escape')

  // Sans vue Collection, le module n'est plus utilisé : on le retire, puis on le rajoute depuis le menu.
  await espace.supprimer('clients/_vues/cartes.yaml')
  await espace.retourSurOnglet()
  await espace.base('Clients')
  await page.getByRole('button', { name: 'Magasin' }).click()
  const collection = magasin.getByRole('article', { name: 'Collection' })
  await expect(collection.getByRole('button', { name: 'Ajouter' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByTitle('Nouvelle vue').click()
  await expect(page.getByRole('button', { name: 'Collection', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/magasin-menu.png' })
  await page.getByRole('button', { name: 'Plus de vues' }).click()
  await collection.getByRole('button', { name: 'Ajouter' }).click()
  await expect(collection).toContainText('Ajouté')
  await page.keyboard.press('Escape')
  await page.getByTitle('Nouvelle vue').click()
  await expect(page.getByRole('button', { name: 'Collection', exact: true })).toBeVisible()
})
