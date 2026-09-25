import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

// Accueil : essayer l'app sans rien installer, avec la démo copiée dans le
// stockage du navigateur (voir src/adapters/fsa/demo.ts).

test('« Essayer avec la démo » ouvre la démo ; « Repartir d’une démo neuve » efface les changements', async ({ page }) => {
  const erreurs: string[] = []
  page.on('pageerror', (e) => erreurs.push(String(e)))
  await page.goto('./') // relatif à baseURL, qui peut porter un sous-chemin
  await page.getByRole('button', { name: 'Essayer avec la démo' }).click()
  await expect(page.locator('.nom-espace')).toHaveText('Espace de démo')
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Site vitrine' })).toBeVisible()

  // Un changement dans la démo, puis retour à l'accueil : la démo est reprise telle quelle.
  await page.getByRole('button', { name: /Nouvelle ligne/ }).click()
  await expect(page.locator('.rangee input:focus')).toBeVisible() // titre de la ligne créée en édition
  await page.keyboard.type('Ligne d’essai')
  await page.keyboard.press('Enter')
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toBeVisible()
  await page.evaluate(() => indexedDB.deleteDatabase('mdbase')) // oublie le dossier mémorisé : retour à l'accueil
  await page.reload()
  await page.getByRole('button', { name: 'Reprendre la démo' }).click()
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toBeVisible()

  await page.evaluate(() => indexedDB.deleteDatabase('mdbase'))
  await page.reload()
  await page.getByRole('button', { name: 'Repartir d’une démo neuve' }).click()
  await page.locator('.entree-base', { hasText: 'Projets' }).click()
  await expect(page.locator('.rangee', { hasText: 'Site vitrine' })).toBeVisible()
  await expect(page.locator('.rangee', { hasText: 'Ligne d’essai' })).toHaveCount(0)
  expect(erreurs).toEqual([])
})

test('la démo se rouvre au rechargement (mémorisée par une marque, pas par son dossier OPFS)', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Essayer avec la démo' }).click()
  await expect(page.locator('.nom-espace')).toHaveText('Espace de démo')
  // Relire un handle OPFS depuis IndexedDB fait planter Chromium en navigation privée : ce rechargement le vérifie.
  await page.goto('./')
  await expect(page.locator('.nom-espace')).toHaveText('Espace de démo')
})

test('dossier mémorisé sans autorisation : l’accueil reste complet, un refus du navigateur est expliqué', async ({}, info) => {
  // Profil persistant : un vrai dossier mémorisé se relit depuis IndexedDB, ce qui plante en navigation privée.
  const profil = await mkdtemp(join(tmpdir(), 'mdbase-profil-'))
  const context = await chromium.launchPersistentContext(profil, { baseURL: info.project.use.baseURL })
  // Dossier choisi = un dossier OPFS ; autorisation simulée, lue dans localStorage : à redemander, puis refusée (demande bloquée) ou accordée.
  await context.addInitScript(() => {
    window.showDirectoryPicker = (async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('mon-dossier', { create: true })) as typeof window.showDirectoryPicker
    const proto = FileSystemHandle.prototype as unknown as Record<string, (...a: unknown[]) => Promise<string>>
    const query = proto.queryPermission!
    const request = proto.requestPermission!
    proto.queryPermission = function (...a) {
      return localStorage.getItem('simuler') ? Promise.resolve('prompt') : query.apply(this, a)
    }
    proto.requestPermission = function (...a) {
      const s = localStorage.getItem('simuler')
      return s ? Promise.resolve(s === 'accepter' ? 'granted' : 'denied') : request.apply(this, a)
    }
  })
  try {
    const erreurs: string[] = []
    const page = context.pages()[0] ?? (await context.newPage())
    page.on('pageerror', (e) => erreurs.push(String(e)))
    await page.goto('./')
    await page.getByRole('button', { name: 'Ouvrir un dossier' }).click()
    await expect(page.locator('.nom-espace')).toHaveText('mon-dossier')
    await page.evaluate(() => localStorage.setItem('simuler', 'refuser'))

    await page.goto('./') // nouvelle visite
    await expect(page.getByRole('button', { name: 'Essayer avec la démo' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ouvrir un autre dossier' })).toBeVisible()
    await page.getByRole('button', { name: 'Rouvrir « mon-dossier »' }).click()
    await expect(page.locator('.erreur')).toContainText("Le navigateur n'a pas donné l'accès à « mon-dossier »")

    await page.evaluate(() => localStorage.setItem('simuler', 'accepter'))
    await page.getByRole('button', { name: 'Rouvrir « mon-dossier »' }).click()
    await expect(page.locator('.nom-espace')).toHaveText('mon-dossier')
    expect(erreurs).toEqual([])
  } finally {
    await context.close()
    await rm(profil, { recursive: true, force: true })
  }
})
