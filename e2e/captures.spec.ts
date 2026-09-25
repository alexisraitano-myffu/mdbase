import { test } from '@playwright/test'

// Captures d'écran du README, prises sur la démo. Hors de la suite normale :
//   CAPTURES=1 npx playwright test captures
// Réécrit docs/captures/*.png.

test.skip(!process.env.CAPTURES, 'seulement avec CAPTURES=1')

test('captures du README', async ({ page }) => {
  const dossier = new URL('../docs/captures/', import.meta.url)
  const capture = (nom: string) => page.screenshot({ path: new URL(`${nom}.png`, dossier).pathname.replace(/%20/g, ' ') })
  await page.setViewportSize({ width: 1440, height: 860 })
  await page.goto('./')
  await page.getByRole('button', { name: /Essayer avec la démo|Reprendre la démo/ }).click()

  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await page.locator('.rangee', { hasText: 'Site vitrine' }).waitFor()
  await capture('tableau')

  await page.locator('.entree-base', { hasText: 'Tâches' }).click()
  await page.getByText('Planning').first().click()
  await page.locator('.tl-barre').first().waitFor()
  await capture('timeline')

  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  const rangee = page.locator('.rangee', { hasText: 'Site vitrine' })
  await rangee.hover()
  await rangee.locator('.bouton-ouvrir').click()
  await page.locator('.editeur-corps .ProseMirror').waitFor()
  await capture('page')
})
