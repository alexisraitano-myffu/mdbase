import { expect, test } from './espace'

// Analyse dans les dashboards (spec §10 « Analyse ») : requêtes SQL sur les
// bases (DuckDB-WASM), paramètres, chiffres clés, graphiques, tableaux, texte.

const ANALYSE = `id: analyse
nom: Analyse
parametres:
  - { nom: statut, libelle: Statut, type: choix, options: statuts }
requetes:
  statuts: select distinct statut from projets where statut is not null order by statut
  total: select count(*) as n, sum(budget) as budget from projets where {{statut}} is null or statut = {{statut}}
  par_statut: |
    select statut, count(*) as n
    from projets
    group by statut
    order by statut
rangees:
  - blocs:
      - type: valeur
        titre: Projets
        donnees: total
        valeur: n
        regles: [{ si: '>= 4', couleur: rouge }]
      - { type: barres, titre: Par statut, donnees: par_statut, x: statut, y: n }
  - blocs:
      - type: tableau
        titre: Échéances
        sql: select titre, statut from projets order by titre
        regles: [{ colonne: statut, si: '= Terminé', couleur: vert }]
      - { type: texte, texte: '**{{total.n}} projets** suivis.' }
      - { type: valeur, titre: Casse, sql: select inconnue from projets }
`

test.describe('analyse', () => {
  test.beforeEach(async ({ espace, page }) => {
    await espace.ecrire('_dashboards/analyse.yaml', ANALYSE)
    await espace.retourSurOnglet()
    await page.locator('.entree-base', { hasText: 'Analyse' }).click()
  })

  test('chiffre clé, barres, tableau, texte cité, erreur SQL à sa place', async ({ page }) => {
    const blocs = page.locator('.bloc-analyse')
    await expect(blocs.nth(0).locator('.chiffre')).toHaveText('4')
    // Règle : « >= 4 » colore le chiffre en rouge.
    await expect(blocs.nth(0).locator('.chiffre')).toHaveAttribute('style', /color/)
    await expect(blocs.nth(1).locator('.graphique-analyse svg')).toBeVisible()
    await expect(blocs.nth(1).locator('.graphique-analyse')).toContainText('En cours')
    await expect(blocs.nth(2).locator('tbody tr')).toHaveCount(4)
    await expect(blocs.nth(2).locator('td', { hasText: 'Terminé' })).toHaveAttribute('style', /background/)
    await expect(blocs.nth(3)).toContainText('4 projets suivis.')
    await expect(blocs.nth(4).locator('.erreur-requete')).toContainText('inconnue')
  })

  test('un paramètre recalcule les blocs et s’écrit dans le fichier', async ({ espace, page }) => {
    const chiffre = page.locator('.bloc-analyse').first().locator('.chiffre')
    await expect(chiffre).toHaveText('4')
    await page.getByLabel('Statut', { exact: true }).selectOption('En cours')
    await expect(chiffre).toHaveText('2')
    await expect(chiffre).not.toHaveAttribute('style', /color/)
    await expect.poll(() => espace.lire('_dashboards/analyse.yaml')).toContain('{ nom: statut, libelle: Statut, type: choix, options: statuts, valeur: En cours }')
  })

  test('un bloc d’analyse s’ajoute depuis le menu, et ses réglages s’écrivent', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Ajouter un bloc' }).last().click()
    await page.locator('.flottant .option', { hasText: 'Chiffre clé' }).click()
    await expect.poll(() => espace.lire('_dashboards/analyse.yaml')).toContain('  - blocs:\n      - { type: valeur, donnees: statuts }')
    const nouveau = page.locator('.bloc-analyse').last()
    await nouveau.getByRole('button', { name: 'Réglages du bloc' }).click()
    await page.locator('.reglages-analyse').getByLabel('Données').selectOption('total')
    // Les colonnes proposées sont celles du résultat, une fois la requête recalculée.
    const valeur = page.locator('.reglages-analyse').getByLabel('Valeur', { exact: true })
    await expect(valeur).toHaveJSProperty('tagName', 'SELECT')
    await valeur.selectOption('budget')
    await page.locator('.reglages-analyse').getByLabel('Format').selectOption('euros')
    await page.keyboard.press('Escape')
    await expect(nouveau.locator('.chiffre')).toContainText('€')
    await expect.poll(() => espace.lire('_dashboards/analyse.yaml')).toMatch(/type: valeur\n\s+donnees: total\n\s+valeur: budget\n\s+format: euros/)
  })

  test('requêtes du dashboard : modifier une requête recalcule ses blocs', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Requêtes' }).click()
    const sql = page.getByLabel('SQL de total')
    await sql.fill("select count(*) as n, 0 as budget from projets where statut = 'Terminé'")
    await sql.blur()
    await page.keyboard.press('Escape')
    await expect(page.locator('.bloc-analyse').first().locator('.chiffre')).toHaveText('1')
    await expect.poll(() => espace.lire('_dashboards/analyse.yaml')).toContain("total: select count(*) as n, 0 as budget from projets where statut = 'Terminé'")
  })
})
