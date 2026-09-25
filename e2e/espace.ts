import { test as base, expect, type Locator, type Page } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Fixture commune : une copie neuve de la démo, ouverte dans l'app.
//
// L'API File System Access passe par un sélecteur de dossier qu'un robot ne
// sait pas cliquer : `showDirectoryPicker` est remplacé, pour le test seulement,
// par un dossier OPFS (stockage privé du navigateur, même API de fichiers).
// Chaque test a son contexte de navigateur, donc son propre dossier.
// Les « changements faits ailleurs » (synchro, autre machine) s'écrivent
// directement dans ce dossier, sans passer par l'app.

const DEMO = fileURLToPath(new URL('../exemples/espace-demo/', import.meta.url))
const DOSSIER = 'espace'

function lireDemo(): Record<string, string> {
  const fichiers: Record<string, string> = {}
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      const c = join(d, n)
      if (statSync(c).isDirectory()) parcourir(c)
      else fichiers[relative(DEMO, c)] = readFileSync(c, 'utf8')
    }
  }
  parcourir(DEMO)
  return fichiers
}

type OutilsDossier = {
  ecrire(chemin: string, texte: string): Promise<void>
  lire(chemin: string): Promise<string>
  supprimer(chemin: string): Promise<void>
  lister(dossier: string): Promise<string[]>
}
declare global {
  interface Window {
    dossierTest: OutilsDossier
  }
}

/** Injecté dans la page avant l'app : sélecteur remplacé et accès direct au dossier. */
function preparerPage(nomDossier: string) {
  const racine = () => navigator.storage.getDirectory().then((r) => r.getDirectoryHandle(nomDossier, { create: true }))
  const dossier = async (segments: string[], creer: boolean) => {
    let d = await racine()
    for (const s of segments) d = await d.getDirectoryHandle(s, { create: creer })
    return d
  }
  const decouper = (chemin: string): [string[], string] => {
    const s = chemin.split('/')
    return [s.slice(0, -1), s.at(-1)!]
  }
  window.showDirectoryPicker = racine as typeof window.showDirectoryPicker
  window.dossierTest = {
    async ecrire(chemin, texte) {
      const [ds, nom] = decouper(chemin)
      const flux = await (await (await dossier(ds, true)).getFileHandle(nom, { create: true })).createWritable()
      await flux.write(texte)
      await flux.close()
    },
    async lire(chemin) {
      const [ds, nom] = decouper(chemin)
      return (await (await (await dossier(ds, false)).getFileHandle(nom)).getFile()).text()
    },
    async supprimer(chemin) {
      const [ds, nom] = decouper(chemin)
      await (await dossier(ds, false)).removeEntry(nom)
    },
    async lister(chemin) {
      const noms: string[] = []
      for await (const nom of (await dossier(chemin ? chemin.split('/') : [], false)).keys()) noms.push(nom)
      return noms.sort()
    },
  }
}

export class Espace {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  // ── Le dossier, vu de l'extérieur de l'app ──
  ecrire = (chemin: string, texte: string) => this.page.evaluate(([c, t]) => window.dossierTest.ecrire(c, t), [chemin, texte] as const)
  lire = (chemin: string) => this.page.evaluate((c) => window.dossierTest.lire(c), chemin)
  supprimer = (chemin: string) => this.page.evaluate((c) => window.dossierTest.supprimer(c), chemin)
  lister = (dossier: string) => this.page.evaluate((c) => window.dossierTest.lister(c), dossier)
  /** Remplace un passage d'un fichier, comme une modification faite sur une autre machine. */
  async remplacer(chemin: string, avant: string | RegExp, apres: string) {
    const texte = await this.lire(chemin)
    const nouveau = texte.replace(avant, apres)
    if (nouveau === texte) throw new Error(`« ${String(avant)} » introuvable dans ${chemin}`)
    await this.ecrire(chemin, nouveau)
  }

  // ── L'app ──
  /** Retour sur l'onglet : l'app relit le dossier. */
  retourSurOnglet = () => this.page.evaluate(() => window.dispatchEvent(new Event('focus')))
  base = (nom: string) => this.page.locator('.entree-base', { hasText: nom }).first().click()
  get tableau(): Locator {
    return this.page.locator('.zone-tableau').first()
  }
  rangee = (titre: string) => this.page.locator('.rangee', { hasText: titre }).first()
  async ouvrirPage(base: string, titre: string) {
    await this.base(base)
    const r = this.rangee(titre)
    await r.hover()
    await r.locator('.bouton-ouvrir').click()
    await expect(this.page.locator('.titre-page')).toBeVisible()
  }
}

export const test = base.extend<{ espace: Espace }>({
  espace: async ({ page }, use) => {
    const erreurs: string[] = []
    page.on('console', (m) => m.type() === 'error' && erreurs.push(m.text()))
    page.on('pageerror', (e) => erreurs.push(String(e)))
    await page.addInitScript(preparerPage, DOSSIER)
    await page.goto('./') // relatif à baseURL, qui peut porter un sous-chemin
    const espace = new Espace(page)
    for (const [chemin, texte] of Object.entries(lireDemo())) await espace.ecrire(chemin, texte)
    await page.getByRole('button', { name: 'Ouvrir un dossier' }).click()
    await expect(page.locator('.entree-base', { hasText: 'Projets' })).toBeVisible()

    await use(espace)

    expect(erreurs, 'erreurs dans la console').toEqual([])
  },
})

export { expect }
