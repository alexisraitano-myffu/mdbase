import { choisir, expect, test } from './espace'

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
    // Premier calcul : le moteur SQL démarre, plus lent quand plusieurs tests le chargent en même temps.
    await expect(page.locator('.bloc-analyse .chiffre').first()).toBeVisible({ timeout: 20_000 })
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
    await choisir(page.getByRole('button', { name: 'Statut', exact: true }), 'En cours')
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
    const reglages = page.locator('.reglages-analyse')
    await choisir(reglages.getByRole('button', { name: 'Données' }), 'Requête « total »')
    // Les colonnes proposées sont celles du résultat, une fois la requête recalculée.
    const valeur = reglages.getByLabel('Valeur', { exact: true })
    await expect(valeur).toHaveJSProperty('tagName', 'BUTTON')
    await choisir(valeur, 'budget')
    await choisir(reglages.getByRole('button', { name: 'Format', exact: true }), 'Euros')
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

// Fiches (spec §10 « Fiches ») : une ligne choisie par des boutons, retenue
// sur la machine et jamais dans le fichier ; états, compte à rebours, liste.
const FICHE = `id: fiche
nom: Fiche
etats:
  sante:
    - { si: "statut = 'Terminé'", couleur: vert, libelle: Livré }
    - { couleur: orange, libelle: En cours }
parametres:
  - { nom: projet, libelle: Projet, type: choix, options: projets, affichage: boutons, pastille: sante }
requetes:
  projets: select titre, statut from projets order by titre
  fiche: select titre, statut, echeance from projets where titre = {{projet}}
rangees:
  - blocs:
      - { type: entete, donnees: fiche, titre: titre, sous_titre: statut, etat: sante }
  - blocs:
      - { type: compte_a_rebours, titre: Échéance, donnees: fiche, date: echeance, libelle: titre }
      - type: liste
        titre: Projets ouverts
        sql: select titre, statut from projets
        libelle: titre
        pastille: statut
        couleurs: { En cours: bleu }
        garder: statut <> 'Terminé'
        tri: titre
        max: 2
`

test.describe('fiches', () => {
  test.beforeEach(async ({ espace, page }) => {
    await page.clock.setFixedTime(new Date('2026-09-15T10:00:00'))
    await espace.ecrire('_dashboards/fiche.yaml', FICHE)
    await espace.retourSurOnglet()
    await page.locator('.entree-base', { hasText: 'Fiche' }).click()
    await expect(page.locator('.entete-fiche h2')).not.toBeEmpty({ timeout: 20_000 })
  })

  test('le sélecteur choisit la ligne, retenue sur la machine ; état, compte à rebours, liste et ses écartées', async ({ espace, page }) => {
    const selecteur = page.getByRole('radiogroup', { name: 'Projet' })
    await expect(selecteur.getByRole('radio')).toHaveCount(4)
    // Sans choix retenu : la première option ; chaque bouton porte la pastille de son état.
    await expect(selecteur.getByRole('radio', { name: 'Application mobile' })).toHaveAttribute('aria-checked', 'true')
    await expect(selecteur.locator('.point-fiche')).toHaveCount(4)
    await expect(page.locator('.entete-fiche h2')).toHaveText('Application mobile')
    await expect(page.locator('.entete-fiche .etat-fiche')).toHaveText('En cours')
    await expect(page.locator('.compte-a-rebours .jours')).toHaveText('J-77')

    // Liste : trois gardées, deux montrées, le reste replié sans être caché en silence.
    const liste = page.locator('.liste-fiche')
    await expect(liste.locator('.ligne-liste')).toHaveCount(2)
    await liste.getByRole('button', { name: '2 autres' }).click()
    await expect(liste.locator('.ligne-liste')).toHaveCount(4)
    await expect(liste.locator('.ligne-liste.ecartee')).toHaveCount(2)

    await selecteur.getByRole('radio', { name: 'Audit sécurité' }).click()
    await expect(page.locator('.entete-fiche h2')).toHaveText('Audit sécurité')
    await expect(page.locator('.entete-fiche .etat-fiche')).toHaveText('Livré')
    await expect(page.locator('.compte-a-rebours')).toContainText('Aucune date à venir saisie')
    expect(await page.evaluate(() => localStorage.getItem('mdbase:selecteur:fiche'))).toContain('Audit sécurité')
    expect(await espace.lire('_dashboards/fiche.yaml')).not.toContain('Audit')
  })

  test('les réglages d’une liste s’écrivent dans le fichier', async ({ espace, page }) => {
    const liste = page.locator('.bloc-analyse', { hasText: 'Projets ouverts' })
    await expect(liste.locator('.ligne-liste')).toHaveCount(2)
    await liste.hover()
    await liste.getByRole('button', { name: 'Réglages du bloc' }).click()
    const reglages = page.locator('.reglages-analyse')
    await reglages.getByLabel('Lignes au plus').fill('3')
    await reglages.getByLabel('Lignes au plus').blur()
    await expect.poll(() => espace.lire('_dashboards/fiche.yaml')).toContain('max: 3')
    await page.keyboard.press('Escape')
    await expect(liste.locator('.ligne-liste')).toHaveCount(3)
  })
})
