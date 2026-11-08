import type { Locator, Page } from '@playwright/test'
import { ajouterModule, expect, test } from './espace'

// Wiki (spec §22) : des pages à plat dans `_wiki/`, rangées en arbre dans la
// barre latérale par leur clé `parent`. On construit l'arbre à la souris et le
// dossier doit le refléter exactement.

const arbre = (page: Page) => page.getByRole('tree', { name: 'Pages du wiki' })
const entree = (page: Page, titre: string) => arbre(page).locator('.entree-wiki', { has: page.locator('.nom-entree', { hasText: new RegExp(`^${titre}$`) }) })

/** Lit le frontmatter des pages : titre → { parent (par titre), ordre }. */
async function lireWiki(espace: { lister: (d: string) => Promise<string[]>; lire: (c: string) => Promise<string> }) {
  const fichiers = (await espace.lister('_wiki')).filter((f) => f.endsWith('.md'))
  // Un fichier peut disparaître entre la liste et la lecture (renommage en cours) : il est sauté.
  const lus = await Promise.all(fichiers.map(async (f) => ({ f, t: await espace.lire(`_wiki/${f}`).catch(() => null) })))
  const brut = lus.filter((x): x is { f: string; t: string } => x.t !== null)
  const cle = (t: string, k: string) => new RegExp(`\\n${k}: (.*)\\n`).exec(t)?.[1]
  const titres = new Map(brut.map(({ t }) => [cle(t, 'id')!, cle(t, 'titre')!]))
  return Object.fromEntries(brut.map(({ f, t }) => [cle(t, 'titre')!, { fichier: f, parent: titres.get(cle(t, 'parent') ?? '') ?? null, ordre: Number(cle(t, 'ordre')) }]))
}

async function nouvellePage(page: Page, titre: string, parent?: string) {
  if (parent) {
    await entree(page, parent).hover()
    await entree(page, parent).getByRole('button', { name: `Options de la page ${parent}` }).click()
    await page.getByRole('button', { name: 'Nouvelle sous-page' }).click()
  } else {
    await page.locator('.groupe.wiki .titre-groupe').hover() // le « + » n'apparaît qu'au survol
    await page.getByRole('button', { name: 'Nouvelle page' }).click()
  }
  await page.locator('.champ-en-ligne').fill(titre)
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Titre de la page')).toHaveValue(titre)
}

/** Glisse une entrée sur le haut, le milieu ou le bas d'une autre. */
const glisserSur = (source: Locator, cible: Locator, ou: 'avant' | 'dans' | 'apres') =>
  cible.boundingBox().then((b) => source.dragTo(cible, { targetPosition: { x: 20, y: ou === 'avant' ? 2 : ou === 'apres' ? b!.height - 2 : b!.height / 2 } }))

test('construire un arbre de trois niveaux à la souris : le dossier _wiki/ le reflète', async ({ espace, page }) => {
  await ajouterModule(page, 'Wiki')
  await expect(page.getByText('Aucune page')).toBeVisible()

  await nouvellePage(page, 'Procédures')
  await nouvellePage(page, 'Déploiement', 'Procédures')
  await nouvellePage(page, 'Serveurs', 'Déploiement')
  await nouvellePage(page, 'Équipe')
  await nouvellePage(page, 'Congés')
  await expect.poll(() => lireWiki(espace)).toMatchObject({
    Procédures: { parent: null, ordre: 1 },
    Déploiement: { parent: 'Procédures', ordre: 1 },
    Serveurs: { parent: 'Déploiement', ordre: 1 },
    Équipe: { parent: null, ordre: 2 },
    Congés: { parent: null, ordre: 3 },
  })
  // Une page qui a des sous-pages sert de dossier : elle les montre.
  await entree(page, 'Procédures').click()
  await expect(page.getByRole('list', { name: 'Sous-pages' })).toHaveText('Déploiement')
  await page.screenshot({ path: 'test-results/wiki-arbre.png' })

  // Renommer : le titre et le nom du fichier suivent.
  await entree(page, 'Équipe').dblclick()
  await page.locator('.champ-en-ligne').fill('Équipe projet')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await lireWiki(espace))['Équipe projet']?.fichier).toMatch(/^equipe-projet--/)

  // Glisser : dedans (changer de parent), avant (réordonner), une seule écriture par déplacement.
  await glisserSur(entree(page, 'Congés'), entree(page, 'Équipe projet'), 'dans')
  await expect.poll(async () => (await lireWiki(espace)).Congés).toMatchObject({ parent: 'Équipe projet', ordre: 1 })
  await glisserSur(entree(page, 'Équipe projet'), entree(page, 'Procédures'), 'avant')
  await expect.poll(async () => (await lireWiki(espace))['Équipe projet']).toMatchObject({ parent: null, ordre: 0 })
  await glisserSur(entree(page, 'Serveurs'), entree(page, 'Déploiement'), 'apres')
  await expect.poll(async () => (await lireWiki(espace)).Serveurs).toMatchObject({ parent: 'Procédures', ordre: 2 })
  await expect(arbre(page).locator('.nom-entree')).toHaveText(['Équipe projet', 'Congés', 'Procédures', 'Déploiement', 'Serveurs'])

  // L'ordre tient à la réouverture : l'espace est relu depuis le disque, comme au démarrage.
  await page.getByRole('button', { name: 'Changer de dossier' }).click()
  await page.getByRole('button', { name: 'Ouvrir un dossier' }).click()
  await expect(arbre(page).locator('.nom-entree')).toHaveText(['Équipe projet', 'Congés', 'Procédures', 'Déploiement', 'Serveurs'])

  // Refusé : une page dans sa propre descendance.
  await glisserSur(entree(page, 'Procédures'), entree(page, 'Déploiement'), 'dans')
  await expect.poll(async () => (await lireWiki(espace)).Procédures).toMatchObject({ parent: null, ordre: 1 })
})

test('supprimer une page part avec ses sous-pages, prévient si elle est citée, et Ctrl+Z la remet', async ({ espace, page }) => {
  await ajouterModule(page, 'Wiki')
  await nouvellePage(page, 'Procédures')
  await nouvellePage(page, 'Déploiement', 'Procédures')
  await nouvellePage(page, 'Serveurs', 'Déploiement')
  await nouvellePage(page, 'Accueil')
  const deploiement = (await lireWiki(espace)).Déploiement!.fichier.replace(/\.md$/, '')
  const accueil = (await lireWiki(espace)).Accueil!.fichier
  await espace.remplacer(`_wiki/${accueil}`, /---\n$/, `---\nVoir [[_wiki/${deploiement}|Déploiement]].\n`)
  await espace.retourSurOnglet()

  await entree(page, 'Procédures').hover()
  await entree(page, 'Procédures').getByRole('button', { name: 'Options de la page Procédures' }).click()
  await page.getByRole('button', { name: 'Supprimer la page…' }).click()
  const confirmation = page.locator('.confirmation')
  await expect(confirmation).toContainText('ses 2 sous-pages')
  await expect(confirmation).toContainText('Une page ou une ligne y renvoie')
  await confirmation.getByRole('button', { name: 'Supprimer' }).click()
  await expect(arbre(page).locator('.nom-entree')).toHaveText(['Accueil'])
  await expect.poll(async () => Object.keys(await lireWiki(espace))).toEqual(['Accueil'])
  await expect(page.locator('.page-wiki')).toHaveCount(1) // Accueil reste ouverte

  await page.keyboard.press('ControlOrMeta+z')
  await expect(arbre(page).locator('.nom-entree')).toHaveText(['Procédures', 'Déploiement', 'Serveurs', 'Accueil'])
  await expect.poll(async () => Object.keys(await lireWiki(espace)).sort()).toEqual(['Accueil', 'Déploiement', 'Procédures', 'Serveurs'])
})

test('le magasin présente le wiki ; une page dans le dossier suffit à le garder actif', async ({ espace, page }) => {
  await espace.ecrire('_wiki/notes--n1.md', '---\nid: n1\ntitre: Notes\n---\nUn texte.\n')
  await espace.retourSurOnglet()
  await expect(entree(page, 'Notes')).toBeVisible()
  await page.getByRole('button', { name: 'Magasin' }).click()
  const fiche = page.getByRole('dialog', { name: 'Magasin' }).getByRole('article', { name: 'Wiki', exact: true })
  await expect(fiche).toContainText('Utilisé par 1 page')
  await fiche.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await fiche.screenshot({ path: 'test-results/magasin-wiki.png' })
  await page.keyboard.press('Escape')
  await entree(page, 'Notes').click()
  await expect(page.locator('.page-wiki')).toContainText('Un texte.')
})

/** Une option du menu de l'éditeur, par son libellé exact (le détail est à côté). */
const option = (page: Page, libelle: string) =>
  page.locator('.cm-tooltip-autocomplete li', { has: page.locator('.cm-completionLabel', { hasText: new RegExp(`^${libelle}$`) }) })

test('page en plein écran : écrire, citer une ligne et une page, suivre les liens, « / Page » crée une sous-page', async ({ espace, page }) => {
  await ajouterModule(page, 'Wiki')
  await nouvellePage(page, 'Procédures')
  await nouvellePage(page, 'Déploiement', 'Procédures')
  await entree(page, 'Procédures').click()
  const corps = page.locator('.page-wiki .editeur-corps .cm-content')
  await corps.click()
  await page.keyboard.type('Voir @site vi')
  await option(page, 'Site vitrine').click()
  await page.keyboard.type(' et [[dépl')
  await option(page, 'Déploiement').click()
  const procedures = () => lireWiki(espace).then((w) => `_wiki/${w.Procédures!.fichier}`)
  await expect.poll(async () => espace.lire(await procedures())).toMatch(/\nVoir \[\[projets\/site-vitrine--psite001\|Site vitrine\]\] et \[\[_wiki\/deploiement--[a-z0-9]{8}\|Déploiement\]\]$/)

  // « / Page » : une sous-page de la page en cours, liée au curseur, ouverte, titre à écrire.
  await page.keyboard.press('Enter')
  await page.keyboard.type('/page')
  await option(page, 'Page').click()
  const titre = page.getByLabel('Titre de la page')
  await expect(titre).toBeFocused()
  await page.keyboard.type('Serveurs')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await lireWiki(espace)).Serveurs).toMatchObject({ parent: 'Procédures' })
  await expect(page.locator('.ariane-wiki')).toContainText('Procédures')
  await page.locator('.ariane-wiki').getByRole('button', { name: 'Procédures' }).click()
  await expect(titre).toHaveValue('Procédures')
  await page.mouse.click(5, 5)
  await expect(corps.locator('.cm-reference')).toHaveText(['Site vitrine', 'Déploiement', 'Serveurs'])

  // Les liens restent justes après le renommage de la ligne et le déplacement de la page.
  await espace.remplacer('projets/site-vitrine--psite001.md', 'titre: Site vitrine', 'titre: Site institutionnel')
  await glisserSur(entree(page, 'Déploiement'), entree(page, 'Procédures'), 'avant')
  await expect.poll(async () => (await lireWiki(espace)).Déploiement).toMatchObject({ parent: null })
  await espace.retourSurOnglet()
  await expect(corps.locator('.cm-reference:not(.cassee)')).toHaveText(['Site institutionnel', 'Déploiement', 'Serveurs'])
  await page.screenshot({ path: 'test-results/wiki-page.png' })

  // Suivre : une pastille de page ouvre la page, une pastille de ligne ouvre la ligne.
  await corps.locator('.cm-reference', { hasText: 'Déploiement' }).click()
  await expect(titre).toHaveValue('Déploiement')
  await entree(page, 'Procédures').click()
  await corps.locator('.cm-reference', { hasText: 'Site institutionnel' }).click()
  await expect(page.locator('.titre-page')).toHaveValue('Site institutionnel')
})

test('« / Page » depuis le corps d’une ligne demande l’emplacement', async ({ espace, page }) => {
  await ajouterModule(page, 'Wiki')
  await nouvellePage(page, 'Procédures')
  await espace.ouvrirPage('Tâches', 'Intégration')
  const corps = page.locator('.editeur-corps .cm-content')
  await corps.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/page')
  await expect(option(page, 'Page dans…')).toHaveCount(0) // hors du wiki, « Page » demande toujours
  await option(page, 'Page').click()
  const fenetre = page.getByRole('dialog', { name: 'Où créer la page ?' })
  await fenetre.getByRole('button', { name: 'Procédures' }).click()
  await expect(page.getByLabel('Titre de la page')).toBeFocused()
  await page.keyboard.type('Intégration continue')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await lireWiki(espace))['Intégration continue']).toMatchObject({ parent: 'Procédures' })
  await expect.poll(() => espace.lire('taches/integration--tinte002.md')).toMatch(/\[\[_wiki\/[a-z0-9]{8}\]\]/)
})

test('liens vivants : l’aperçu d’une ligne montre ses valeurs actuelles, un lien mort est compté', async ({ espace, page }) => {
  await espace.ecrire('_wiki/procedures--wproc001.md', '---\nid: wproc001\ntitre: Procédures\n---\nLe projet [[projets/site-vitrine--psite001|Site vitrine]] et [[projets/disparu--zzzz0000|Disparu]].\n')
  await espace.retourSurOnglet()
  await entree(page, 'Procédures').click()
  const corps = page.locator('.page-wiki .editeur-corps .cm-content')
  await expect(corps.locator('.cm-reference.cassee')).toHaveText('Disparu')
  await expect(page.locator('.liens-morts-wiki')).toHaveText('1 lien mort')

  const avant = await espace.lire('_wiki/procedures--wproc001.md')
  await corps.locator('.cm-reference', { hasText: 'Site vitrine' }).hover()
  const apercu = page.getByRole('tooltip')
  await expect(apercu).toContainText('Projets')
  await expect(apercu).toContainText('En cours')
  await page.screenshot({ path: 'test-results/wiki-apercu.png' })
  await page.mouse.move(5, 5)
  await expect(apercu).toHaveCount(0)

  // Le statut change dans la base : l'aperçu suit, le fichier de la page ne bouge pas.
  await espace.remplacer('projets/site-vitrine--psite001.md', 'statut: En cours', 'statut: Terminé')
  await espace.retourSurOnglet()
  await corps.locator('.cm-reference', { hasText: 'Site vitrine' }).hover()
  await expect(apercu).toContainText('Terminé')
  expect(await espace.lire('_wiki/procedures--wproc001.md')).toBe(avant)
})

test('rétroliens : « Citée dans » sur la ligne, « Citée par » sur la page, à jour quand la citation part', async ({ espace, page }) => {
  await espace.ecrire('_wiki/deploiement--wdepl002.md', '---\nid: wdepl002\ntitre: Déploiement\n---\nÉtapes.\n')
  await espace.ecrire('_wiki/accueil--wacc0003.md', '---\nid: wacc0003\ntitre: Accueil\n---\nCommencer par [[_wiki/deploiement--wdepl002|Déploiement]].\n')
  await espace.retourSurOnglet()
  await entree(page, 'Déploiement').click()
  const citeePar = page.getByRole('region', { name: 'Citée par' })
  await expect(citeePar.getByRole('button')).toHaveText(['AccueilWiki'])

  // Citer une ligne depuis la page : elle apparaît dans « Citée dans » de la ligne.
  const corps = page.locator('.page-wiki .editeur-corps .cm-content')
  await corps.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Pour @site vi')
  await option(page, 'Site vitrine').click()
  await espace.ouvrirPage('Projets', 'Site vitrine')
  const citeeDans = page.getByRole('region', { name: 'Citée dans' })
  await expect(citeeDans.getByRole('button', { name: /Déploiement/ })).toBeVisible()
  await expect(citeeDans).not.toContainText('Étapes') // jamais le contenu du wiki
  await page.screenshot({ path: 'test-results/wiki-citee-dans.png' })
  await citeeDans.getByRole('button', { name: /Déploiement/ }).click()
  await expect(page.getByLabel('Titre de la page')).toHaveValue('Déploiement')

  // La citation retirée : la ligne ne la montre plus.
  await espace.remplacer('_wiki/deploiement--wdepl002.md', / Pour \[\[[^\]]+\]\]/, '')
  await espace.retourSurOnglet()
  await espace.ouvrirPage('Projets', 'Site vitrine')
  await expect(page.locator('.contenu-page')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Citée dans' }).getByRole('button', { name: /Déploiement/ })).toHaveCount(0)
})
