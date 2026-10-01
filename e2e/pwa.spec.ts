import { expect, test } from '@playwright/test'

// PWA : installable (manifeste) et ouverte hors ligne (service worker).
// Le service worker n'existe que dans le build : ces tests tournent sur
// `vite preview` (E2E_URL, comme en CI), pas sur le serveur de dev.

test.skip(!process.env.E2E_URL, 'service worker absent en dev : lancer sur le build (E2E_URL)')

test('manifeste installable : nom, affichage en fenêtre, icônes 192 et 512 servies', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  const url = new URL(href!, page.url())
  const manifeste = await (await request.get(url.href)).json()
  expect(manifeste).toMatchObject({ name: 'mdbase', display: 'standalone', start_url: '.' })
  for (const icone of manifeste.icons) expect((await request.get(new URL(icone.src, url).href)).ok()).toBe(true)
  expect(manifeste.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']))
})

test('hors ligne : l’app et la démo s’ouvrent depuis le cache', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Tout le build est gardé à l'installation, y compris les morceaux chargés à la demande.
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('button', { name: 'Essayer avec la démo' }).click()
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Site vitrine' })).toBeVisible()
})
