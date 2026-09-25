import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, test } from './espace'

// Import et export : les lignes d'une vue en CSV / Markdown, la vue en image,
// un CSV en nouvelle base ou en lignes ajoutées.

async function exporter(page: Page, choix: string): Promise<{ nom: string; contenu: Buffer }> {
  await page.getByRole('button', { name: 'Exporter' }).click()
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: choix }).click()])
  return { nom: telechargement.suggestedFilename(), contenu: await readFile((await telechargement.path())!) }
}

/** Largeur et hauteur d'un PNG, lues dans son en-tête. */
const taillePng = (b: Buffer) => ({ largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) })

test.describe('export d’une vue', () => {
  test('CSV : colonnes de la vue, relations en titres, BOM pour Excel', async ({ espace, page }) => {
    await espace.base('Projets')
    const { nom, contenu } = await exporter(page, 'Télécharger en CSV')
    expect(nom).toBe('Projets - Tableau.csv')
    const texte = contenu.toString('utf8')
    expect(texte.startsWith('﻿Titre,Statut,Client,')).toBe(true)
    expect(texte).toContain('Site vitrine,En cours,Acme,2026-09-01,2026-10-15')
  })

  test('Markdown : tableau copié dans le presse-papiers, filtres de la vue respectés', async ({ espace, page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await espace.base('Tâches')
    await page.getByRole('button', { name: 'Exporter' }).click()
    await page.getByRole('button', { name: 'Copier en tableau Markdown' }).click()
    await expect(page.getByRole('button', { name: 'Copié dans le presse-papiers' })).toBeVisible()
    const md = await page.evaluate(() => navigator.clipboard.readText())
    expect(md.split('\n')[0]).toMatch(/^\| Titre \| Projet \|/)
    expect(md).toContain('| Catalogue produits | Boutique en ligne |')
    expect(md).not.toContain('Maquettes') // tâche faite : masquée par le filtre « Fait : non coché » de la vue
  })

  test('image : la timeline entière, au-delà de la partie visible', async ({ espace, page }) => {
    await page.setViewportSize({ width: 900, height: 500 })
    await espace.base('Tâches')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    await expect(page.locator('.tl-barre').first()).toBeVisible()
    const visible = await page.locator('.timeline').evaluate((el) => ({ largeur: el.clientWidth, hauteur: el.clientHeight, style: el.getAttribute('style') }))
    const { nom, contenu } = await exporter(page, 'Télécharger en image (PNG)')
    expect(nom).toBe('Tâches - Planning.png')
    expect(contenu.subarray(1, 4).toString()).toBe('PNG')
    const { largeur, hauteur } = taillePng(contenu)
    expect(largeur).toBeGreaterThan(visible.largeur * 2)
    expect(hauteur).toBeGreaterThan(visible.hauteur * 2)
    // la vue est remise en place après la capture
    expect(await page.locator('.timeline').getAttribute('style')).toBe(visible.style)
  })
})

test.describe('import CSV', () => {
  const CSV = 'Fournisseur;Montant;Échéance;Catégorie\nImprimerie;1 200,50;05/10/2026;Print\nHébergeur;12;2026-10-01;Web\nAgence;;;Web\n'

  test('nouvelle base : types devinés et modifiables, base ouverte après l’import', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Importer un CSV' }).click()
    await page.locator('.import input[type=file]').setInputFiles({ name: 'dépenses.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await expect(page.getByText('dépenses.csv : 3 lignes, 4 colonnes.')).toBeVisible()
    await expect(page.getByLabel('Type de Montant')).toHaveValue('number')
    await expect(page.getByLabel('Type de Échéance')).toHaveValue('date')
    await expect(page.getByLabel('Type de Catégorie')).toHaveValue('select')
    await page.getByLabel('Type de Catégorie').selectOption('text')
    await page.getByRole('button', { name: 'Importer 3 lignes' }).click()

    await expect(page.locator('h1', { hasText: 'dépenses' })).toBeVisible()
    await expect(espace.rangee('Imprimerie')).toContainText('1 200,5')
    const schema = await espace.lire('depenses/_schema.yaml')
    expect(schema).toMatch(/nom: Catégorie\s+type: text/)
    const fichiers = (await espace.lister('depenses')).filter((n) => n.endsWith('.md'))
    expect(fichiers).toHaveLength(3)
    expect(await espace.lire(`depenses/${fichiers.find((n) => n.startsWith('hebergeur'))!}`)).toContain('echeance: 2026-10-01')
  })

  test('lignes ajoutées à une base existante : colonnes retrouvées par nom, les autres ignorées', async ({ espace, page }) => {
    await espace.base('Clients')
    await page.getByRole('button', { name: 'Exporter' }).click()
    await page.getByRole('button', { name: 'Importer des lignes (CSV)…' }).click()
    await page.locator('.import input[type=file]').setInputFiles({ name: 'clients.csv', mimeType: 'text/csv', buffer: Buffer.from('nom,Pays\nUmbrella,France\n') })
    await expect(page.getByLabel('Destination de Pays')).toHaveValue('')
    await page.getByRole('button', { name: 'Importer 1 ligne' }).click()
    await expect(page.locator('.carte', { hasText: 'Umbrella' })).toBeVisible() // vue par défaut des clients : cartes
    const fichier = (await espace.lister('clients')).find((n) => n.startsWith('umbrella'))!
    expect(await espace.lire(`clients/${fichier}`)).not.toContain('France')
  })
})
