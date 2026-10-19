import { expect, test, choisir } from './espace'

// Tâches (spec §9) : les cases à cocher du corps, dans l'onglet Tâches d'une
// page (avec celles des lignes liées) et dans « Toutes les tâches ».

const SITE = 'projets/site-vitrine--psite001.md'
const INTEGRATION = 'taches/integration--tinte002.md'

test.beforeEach(async ({ espace }) => {
  await espace.remplacer(SITE, /\n---\n[\s\S]*$/, '\n---\n## Reste à faire\n\n- [ ] Relancer **Acme**\n- [x] Brief validé\n')
  await espace.remplacer(INTEGRATION, /\n---\n[\s\S]*$/, '\n---\nGabarits posés.\n\n- [ ] Formulaire de contact\n')
  await espace.retourSurOnglet()
})

test('onglet Tâches : cases du corps, ajout, tâches des lignes liées, chacune écrite dans son fichier', async ({ espace, page }) => {
  await espace.ouvrirPage('Projets', 'Site vitrine')
  await page.locator('.entete-page button', { hasText: 'Par défaut' }).click()
  await page.getByRole('switch', { name: 'Onglet Tâches' }).click()
  await expect.poll(() => espace.lire('projets/_pages/defaut.yaml')).toContain('  - type: taches\n')
  await page.getByRole('switch', { name: 'Ajouter les tâches des lignes liées' }).click()
  const section = page.locator('.section-reglages', { hasText: 'Onglet Tâches' })
  await choisir(section.getByRole('button', { name: 'Lignes liées par' }), 'Tâches')
  await expect.poll(() => espace.lire('projets/_pages/defaut.yaml')).toContain('  - type: taches\n    liees:\n      relation: taches\n')
  await page.mouse.click(5, 5) // ferme les réglages

  const onglet = page.locator('.onglets-page .onglet', { hasText: 'Tâches' }).last()
  await expect(onglet).toContainText('2') // Relancer Acme, Formulaire de contact
  await onglet.click()
  const taches = page.locator('.onglet-taches')
  await expect(taches.locator('.section-taches')).toHaveText('Reste à faire')
  await expect(taches.getByRole('checkbox', { name: 'Relancer Acme' })).not.toBeChecked()
  await expect(taches.getByRole('checkbox', { name: 'Brief validé' })).toBeChecked()
  // Seule Intégration a des cases parmi les tâches du projet.
  await expect(taches.locator('.taches-liees .titre-contenu')).toHaveText(['Intégration'])

  await taches.getByRole('checkbox', { name: 'Formulaire de contact' }).check()
  await expect.poll(() => espace.lire(INTEGRATION)).toContain('Gabarits posés.\n\n- [x] Formulaire de contact\n')
  await expect(onglet).toContainText('1')

  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).fill('Envoyer le devis')
  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).press('Enter')
  await expect.poll(() => espace.lire(SITE)).toContain('- [x] Brief validé\n- [ ] Envoyer le devis\n')
  await expect(taches.getByRole('checkbox', { name: 'Envoyer le devis' })).toBeVisible()
})

test('toutes les tâches : par base et par ligne, filtre À faire, recherche, cocher écrit dans le fichier', async ({ espace, page }) => {
  await page.getByRole('button', { name: 'Toutes les tâches' }).click()
  const liste = page.locator('.toutes-taches')
  await expect(liste.locator('h2')).toHaveText(['Projets', 'Tâches'])
  await expect(liste.getByRole('checkbox', { name: 'Brief validé' })).toHaveCount(0) // faite : masquée par « À faire »
  await liste.getByRole('button', { name: /Toutes/ }).click()
  await expect(liste.getByRole('checkbox', { name: 'Brief validé' })).toBeChecked()
  await liste.getByRole('button', { name: /À faire/ }).click()

  await liste.getByRole('checkbox', { name: 'Relancer Acme' }).check()
  await expect.poll(() => espace.lire(SITE)).toContain('- [x] Relancer **Acme**\n')
  await expect(liste.getByRole('checkbox', { name: 'Relancer Acme' })).toBeChecked() // reste sous le clic

  await liste.getByRole('textbox', { name: 'Chercher une tâche' }).fill('formul')
  await expect(liste.getByRole('checkbox')).toHaveCount(1)
  await expect(liste.locator('.titre-contenu')).toHaveText(['Intégration'])

  await page.getByRole('button', { name: 'Passer en consultation (Ctrl+E)' }).click()
  await expect(liste.getByRole('checkbox', { name: 'Formulaire de contact' })).toBeDisabled()
  await page.getByRole('button', { name: 'Passer en édition (Ctrl+E)' }).click()

  await liste.locator('.titre-contenu', { hasText: 'Intégration' }).click()
  await expect(page.locator('.titre-page')).toBeVisible()
})

// Base des tâches (spec §9) : une base dont chaque ligne est une tâche.

test('base des tâches : désignée dans Options, ses lignes en tête, cocher écrit « fait », ajouter crée une ligne', async ({ espace, page }) => {
  await page.getByRole('button', { name: 'Toutes les tâches' }).click()
  const liste = page.locator('.toutes-taches')
  await liste.getByRole('button', { name: 'Options' }).click()
  await choisir(page.getByRole('button', { name: 'Base des tâches' }), 'Tâches')
  await expect.poll(() => espace.lire('_espace.yaml')).toContain('taches:\n  base: taches\n  fait: fait\n  echeance: echeance\n')
  await page.mouse.click(5, 5) // ferme les options

  await expect(liste.locator('h2')).toHaveText(['Tâches', 'Projets'])
  const base = liste.locator('.base-des-taches')
  // À faire, par échéance ; les faites (Maquettes, Entretiens, Rapport) sont masquées.
  await expect(base.locator('.titre-tache')).toHaveText(['Catalogue produits', 'Paiement', 'Recette', 'Cadrage', 'Intégration', 'Mise en ligne'])
  await expect(base.locator('.tache-ligne', { hasText: 'Catalogue produits' }).locator('.echeance-tache')).toHaveClass(/en-retard/)
  // Les cases du corps d'une ligne sont ses sous-tâches.
  await expect(base.locator('.tache-ligne', { hasText: 'Intégration' }).getByRole('checkbox', { name: 'Formulaire de contact' })).toBeVisible()

  await base.getByRole('checkbox', { name: 'Fait : Intégration' }).check()
  await expect.poll(() => espace.lire(INTEGRATION)).toContain('fait: true')
  await expect(base.getByRole('checkbox', { name: 'Fait : Intégration' })).toBeChecked() // reste sous le clic

  await base.getByRole('textbox', { name: 'Ajouter une tâche' }).fill('Préparer la démo')
  await base.getByRole('textbox', { name: 'Ajouter une tâche' }).press('Enter')
  await expect(base.getByRole('checkbox', { name: 'Fait : Préparer la démo' })).not.toBeChecked()
  await expect.poll(async () => (await espace.lister('taches')).some((n) => n.startsWith('preparer-la-demo--'))).toBe(true)

  await liste.getByRole('textbox', { name: 'Chercher une tâche' }).fill('formul')
  await expect(base.locator('.titre-tache')).toHaveText(['Intégration'])
})

test('base des tâches : l’onglet Tâches d’un projet montre ses tâches liées, puis les cases du texte', async ({ espace, page }) => {
  await espace.remplacer('_espace.yaml', 'hors_groupe: []\n', 'hors_groupe: []\ntaches:\n  base: taches\n  fait: fait\n  echeance: echeance\n')
  const relation = '    colonnes: [ titre, priorite, echeance, heures, fait ]\n'
  await espace.remplacer('projets/_pages/defaut.yaml', relation, `${relation}  - type: taches\n    liees:\n      relation: taches\n`)
  await espace.ouvrirPage('Projets', 'Site vitrine')
  const onglet = page.locator('.onglets-page .onglet', { hasText: 'Tâches' }).last()
  // Intégration et Mise en ligne, plus Relancer Acme et Formulaire de contact (sous-tâche d'Intégration).
  // Le beforeEach vient de faire relire le dossier : on relance jusqu'à ce que la base des tâches soit prise en compte.
  await expect(async () => {
    await espace.retourSurOnglet()
    await expect(onglet).toContainText('4', { timeout: 1000 })
  }).toPass()
  await onglet.click()
  const taches = page.locator('.onglet-taches')
  await expect(taches.locator('.titre-tache')).toHaveText(['Maquettes', 'Intégration', 'Mise en ligne'])
  await expect(taches.locator('.titre-contenus')).toHaveText(['Tâches', 'Dans le texte']) // les tâches liées ne reviennent pas en double
  await expect(taches.getByRole('checkbox', { name: 'Relancer Acme' })).not.toBeChecked()

  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).first().fill('Nom de domaine')
  await taches.getByRole('textbox', { name: 'Ajouter une tâche' }).first().press('Enter')
  await expect(taches.getByRole('checkbox', { name: 'Fait : Nom de domaine' })).toBeVisible()
  await expect(onglet).toContainText('5')
  const nom = (await espace.lister('taches')).find((n) => n.startsWith('nom-de-domaine--'))
  expect(nom).toBeDefined()
  await expect.poll(() => espace.lire(`taches/${nom}`)).toContain('psite001')
})

test('base des tâches : sous-tâche, « @ » qui lie (relation créée et masquée), « Lier » sur une tâche', async ({ espace, page }) => {
  await espace.remplacer('_espace.yaml', 'hors_groupe: []\n', 'hors_groupe: []\ntaches:\n  base: taches\n  fait: fait\n  echeance: echeance\n')
  await page.getByRole('button', { name: 'Toutes les tâches' }).click()
  const base = page.locator('.base-des-taches')
  // Le beforeEach vient de faire relire le dossier : on relance jusqu'à ce que la base des tâches soit prise en compte.
  await expect(async () => {
    await espace.retourSurOnglet()
    await expect(base.locator('.titre-tache').first()).toBeVisible({ timeout: 1000 })
  }).toPass()

  // Sous-tâche : l'auto-relation est créée au premier ajout.
  await base.locator('.tache-ligne', { hasText: 'Intégration' }).first().locator('.entete-tache').hover()
  await base.getByRole('button', { name: 'Ajouter une sous-tâche à Intégration' }).click()
  await base.getByRole('textbox', { name: 'Ajouter une sous-tâche' }).fill('Tester sur mobile')
  await base.getByRole('textbox', { name: 'Ajouter une sous-tâche' }).press('Enter')
  await expect(base.locator('.tache-ligne', { hasText: 'Intégration' }).first().locator('.detail-taches .titre-tache')).toHaveText(['Tester sur mobile'])
  await expect.poll(() => espace.lire('_espace.yaml')).toContain('  sous_taches: sous_taches\n')
  const sous = (await espace.lister('taches')).find((n) => n.startsWith('tester-sur-mobile--'))!
  await expect.poll(() => espace.lire(`taches/${sous}`)).toContain('tache_parente: tinte002')
  await expect(base.getByRole('status')).toContainText('Relation Sous-tâches ajoutée')

  // « @ » : la base Clients n'est pas reliée aux tâches ; la relation est créée, masquée dans ses vues.
  const saisie = base.getByRole('textbox', { name: 'Ajouter une tâche' })
  await saisie.fill('Relancer pour la facture @acm')
  await page.getByRole('option', { name: 'Acme' }).click()
  await expect(saisie).toHaveValue('Relancer pour la facture ')
  await expect(base.locator('.liens-saisis')).toHaveText('Acme')
  await saisie.press('Enter')
  await expect(base.getByRole('checkbox', { name: 'Fait : Relancer pour la facture' })).toBeVisible()
  await expect(base.getByRole('status').first()).toContainText('Relation Clients ajoutée (masquée dans les vues existantes)')
  await expect.poll(() => espace.lire('taches/_schema.yaml')).toContain('cle: clients\n    nom: Clients\n    type: relation\n    cible: clients\n    proprietaire: true\n    inverse: taches\n')
  await expect.poll(() => espace.lire('clients/_vues/tableau.yaml')).toMatch(/colonnes_masquees: \[.*taches.*\]/)
  const facture = (await espace.lister('taches')).find((n) => n.startsWith('relancer-pour-la-facture--'))!
  await expect.poll(() => espace.lire(`taches/${facture}`)).toContain('clients: cacme001')
  await expect(base.locator('.tache-ligne', { hasText: 'Relancer pour la facture' }).locator('.liens-tache')).toContainText('Acme')

  // « Lier » : la relation existe désormais, le lien s'ajoute.
  await base.locator('.tache-ligne', { hasText: 'Cadrage' }).locator('.entete-tache').hover()
  await base.getByRole('button', { name: 'Lier Cadrage' }).click()
  await page.getByPlaceholder('Chercher une ligne à lier').fill('glob')
  await page.getByPlaceholder('Chercher une ligne à lier').press('Enter')
  await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).toContain('clients: cglob002')
  await expect(base.locator('.tache-ligne', { hasText: 'Cadrage' }).locator('.liens-tache')).toContainText('Globex')
})

test('auto-relation : « Relier à la base » propose la base elle-même, et une ligne ne se propose pas à elle-même', async ({ espace, page }) => {
  await espace.base('Tâches')
  await page.locator('.cellule-entete.ajout').click()
  await page.getByPlaceholder('Nom de la colonne').fill('Tâche parente')
  await page.locator('.flottant .option', { hasText: 'Relation' }).click()
  await page.locator('.flottant .option', { hasText: 'Tâches (cette base)' }).click()
  await expect.poll(() => espace.lire('taches/_schema.yaml')).toContain('cle: tache_parente\n    nom: Tâche parente\n    type: relation\n    cible: taches\n    proprietaire: true\n    inverse: tache_parente_inverse\n')
  const entetes = page.locator('.cellule-entete:not(.ajout)')
  await expect(entetes.filter({ hasText: 'Tâche parente (inverse)' })).toHaveCount(1)
  const index = await entetes.evaluateAll((els) => els.findIndex((e) => e.textContent?.trim() === 'Tâche parente'))
  await page.locator('.rangee', { hasText: 'Cadrage' }).locator('.case').nth(index).click()
  await expect(page.locator('.flottant .option', { hasText: 'Paiement' })).toHaveCount(1)
  await expect(page.locator('.flottant .option', { hasText: 'Cadrage' })).toHaveCount(0)
})

test('base des tâches : l’onglet Tâches d’une tâche montre ses sous-tâches, et en crée une', async ({ espace, page }) => {
  const schema = await espace.lire('taches/_schema.yaml')
  await espace.ecrire('taches/_schema.yaml', schema.replace('vues: [', '  - { cle: parente, nom: Tâche parente, type: relation, cible: taches, proprietaire: true, inverse: sous_taches }\n  - { cle: sous_taches, nom: Sous-tâches, type: relation, cible: taches, proprietaire: false, inverse: parente }\nvues: ['))
  await espace.remplacer('taches/maquettes--tmaqu001.md', 'titre: Maquettes\n', 'titre: Maquettes\nparente: tinte002\n')
  await espace.ecrire('taches/_pages/defaut.yaml', 'id: defaut\nnom: Par défaut\ndefaut: true\nonglets:\n  - type: proprietes\n  - type: taches\n')
  await espace.remplacer('_espace.yaml', 'hors_groupe: []\n', 'hors_groupe: []\ntaches:\n  base: taches\n  fait: fait\n  sous_taches: sous_taches\n')
  await espace.ouvrirPage('Tâches', 'Intégration')
  const onglet = page.locator('.onglets-page .onglet', { hasText: 'Tâches' })
  await expect(async () => {
    await espace.retourSurOnglet()
    await onglet.click({ timeout: 1000 })
    await expect(page.locator('.onglet-taches .titre-contenus').first()).toHaveText('Sous-tâches', { timeout: 1000 })
  }).toPass()
  const taches = page.locator('.onglet-taches')
  await expect(taches.locator('.titre-tache')).toHaveText(['Maquettes'])
  await taches.getByRole('textbox', { name: 'Ajouter une sous-tâche' }).fill('Valider les couleurs')
  await taches.getByRole('textbox', { name: 'Ajouter une sous-tâche' }).press('Enter')
  await expect(taches.locator('.titre-tache')).toHaveText(['Maquettes', 'Valider les couleurs'])
  const nom = (await espace.lister('taches')).find((n) => n.startsWith('valider-les-couleurs--'))!
  await expect.poll(() => espace.lire(`taches/${nom}`)).toContain('parente: tinte002')
})
