import { expect as expectBase, test as testBase, type Locator, type Page } from '@playwright/test'
import { expect, test, choisir } from './espace'

// Jalons 1, 7, 8, 9 et 11 : ouverture, pages, kanban, vues temporelles,
// dashboards et recherche globale.

/** Glisser à la souris, en plusieurs pas (dnd-kit et les vues temporelles attendent un vrai déplacement). */
async function glisser(page: Page, element: Locator, dx: number, dy = 0) {
  const b = (await element.boundingBox())!
  const x = b.x + Math.min(20, b.width / 2)
  const y = b.y + b.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 })
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  await page.mouse.up()
}

testBase('socle : un navigateur sans accès aux dossiers affiche un message clair', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })
  await page.goto('./')
  await expectBase(page.getByText("Ce navigateur ne permet pas d'ouvrir un dossier local.")).toBeVisible()
})

test('socle : les bases du dossier sont listées dans la barre latérale', async ({ espace, page }) => {
  expect(espace).toBeTruthy() // la fixture ouvre la démo
  await expect(page.locator('.entree-base')).toContainText(['Pilotage', 'Clients', 'Projets', 'Tâches'])
})

test.describe('pages', () => {
  test('propriété modifiée depuis la page, contenu Markdown écrit dans le corps du fichier', async ({ espace, page }) => {
    await espace.ouvrirPage('Projets', 'Site vitrine')
    const budget = page.locator('.propriete', { hasText: 'Budget' }).first().locator('.valeur-propriete')
    await budget.click()
    await budget.locator('input').fill('9000')
    await budget.locator('input').press('Enter')
    await expect.poll(() => espace.lire('projets/site-vitrine--psite001.md')).toContain('budget: 9000\n')

    const corps = page.locator('.editeur-corps .ProseMirror')
    await corps.locator('p', { hasText: 'Refaire le site vitrine' }).click()
    // curseur en fin de paragraphe (la touche Fin n'y va pas sous macOS)
    await corps.locator('p', { hasText: 'Refaire le site vitrine' }).evaluate((p) => {
      const r = document.createRange()
      r.selectNodeContents(p)
      r.collapse(false)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(r)
    })
    await page.keyboard.type(' Relance prévue lundi.')
    await expect.poll(() => espace.lire('projets/site-vitrine--psite001.md')).toContain("salon d'octobre. Relance prévue lundi.")
    expect(await espace.lire('projets/site-vitrine--psite001.md')).toContain('id: psite001\n')
  })

  test('ouvrir une page ne réécrit pas le fichier', async ({ espace, page }) => {
    const avant = await espace.lire('projets/site-vitrine--psite001.md')
    await espace.ouvrirPage('Projets', 'Site vitrine')
    await expect(page.locator('.editeur-corps .ProseMirror')).toContainText('Refaire le site vitrine')
    await page.waitForTimeout(600)
    expect(await espace.lire('projets/site-vitrine--psite001.md')).toBe(avant)
  })

  test('↓ passe à la ligne suivante de la vue, Échap ferme', async ({ espace, page }) => {
    await espace.ouvrirPage('Projets', 'Audit sécurité')
    await page.locator('.entete-page').click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('.titre-page')).toHaveValue('Boutique en ligne')
    await page.keyboard.press('Escape')
    await expect(page.locator('.titre-page')).toHaveCount(0)
  })
})

test.describe('kanban', () => {
  test('glisser une carte dans une autre colonne change sa valeur', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Par statut' }).click()
    const carte = page.locator('.carte', { hasText: 'Application mobile' })
    const termine = page.locator('.kanban-colonne').nth(2)
    const cible = (await termine.boundingBox())!
    const depart = (await carte.boundingBox())!
    await glisser(page, carte, cible.x + 40 - depart.x, cible.y + cible.height - 30 - depart.y)
    await expect(termine.locator('.carte', { hasText: 'Application mobile' })).toBeVisible()
    await expect.poll(() => espace.lire('projets/application-mobile--pmobi002.md')).toContain('statut: Terminé\n')
  })
})

test.describe('vues temporelles', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-25T10:00:00'))
  })

  test('timeline : glisser une barre d’une semaine décale début et échéance', async ({ espace, page }) => {
    await espace.base('Tâches')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    const semaines = page.locator('.tl-bas .tl-graduation')
    const [a, b] = await Promise.all([semaines.nth(1).boundingBox(), semaines.nth(2).boundingBox()])
    const barre = page.locator('.tl-barre', { hasText: 'Cadrage' }).or(page.locator('.tl-ligne', { hasText: 'Cadrage' }).locator('.tl-barre')).first()
    await glisser(page, barre, b!.x - a!.x)
    await expect.poll(() => espace.lire('taches/cadrage--tcadr004.md')).toContain('debut: 2026-10-05\n')
    expect(await espace.lire('taches/cadrage--tcadr004.md')).toContain('echeance: 2026-10-08\n')
  })

  test('calendrier : le « + » d’un jour crée une ligne à cette date (colonne de placement : l’échéance)', async ({ espace, page }) => {
    await espace.base('Tâches')
    await page.locator('.onglet', { hasText: 'Calendrier' }).click()
    const jour = page.locator('.cal-jour', { has: page.locator('.num-jour', { hasText: /^30$/ }) }).first()
    await jour.hover()
    await jour.getByTitle('Nouvelle ligne à cette date').click()
    await expect.poll(async () => {
      const fichiers = await espace.lister('taches')
      const textes = await Promise.all(fichiers.filter((n) => n.endsWith('.md')).map((n) => espace.lire(`taches/${n}`)))
      return textes.filter((t) => t.includes('echeance: 2026-09-30')).length
    }).toBe(1)
  })
})

test.describe('timeline en arbre', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-25T10:00:00'))
  })
  const rangee = (page: Page, titre: string) => page.locator('.tl-ligne', { has: page.locator('.tl-titre', { hasText: titre }) })

  test('les tâches se déplient sous leur projet, se replient, et se glissent comme une barre', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await expect(page.locator('.tl-enfant', { hasText: 'Intégration' })).toBeVisible()
    await expect(page.locator('.tl-enfant', { hasText: 'Maquettes' })).toBeVisible()

    await page.getByRole('button', { name: 'Replier Site vitrine' }).click()
    await expect(page.locator('.tl-enfant', { hasText: 'Intégration' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Déplier Site vitrine' }).click()

    const semaines = page.locator('.tl-bas .tl-graduation')
    const [a, b] = await Promise.all([semaines.nth(1).boundingBox(), semaines.nth(2).boundingBox()])
    const avant = await espace.lire('taches/integration--tinte002.md')
    await glisser(page, rangee(page, 'Intégration').locator('.tl-barre'), b!.x - a!.x)
    await expect.poll(() => espace.lire('taches/integration--tinte002.md')).not.toBe(avant)
  })

  test('couleurs : les barres prennent la couleur de l’option (projets selon leur statut, tâches selon leur priorité), réglable en Options', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    // Maquettes : priorité Haute, rouge dans la démo.
    await expect(rangee(page, 'Maquettes').locator('.tl-barre')).toHaveClass(/coloree/)
    await expect(rangee(page, 'Maquettes').locator('.tl-barre')).toHaveCSS('background-color', 'rgb(255, 226, 221)')

    await page.getByRole('button', { name: 'Options' }).click()
    await choisir(page.locator('.flottant').getByRole('button', { name: 'Couleur' }).first(), 'Violet')
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('couleur: violet\n')
    expect(await espace.lire('projets/_vues/feuille-de-route.yaml')).not.toContain('couleur_par: statut')
    await choisir(page.locator('.reglages-niveau').first().getByRole('button', { name: 'Couleur' }), 'neutre')
    await expect(rangee(page, 'Maquettes').locator('.tl-barre')).not.toHaveClass(/coloree/)
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).not.toContain('couleur_par: priorite')
  })

  test('une ligne d’un seul jour : un losange, qui s’étire par sa droite en barre', async ({ espace, page }) => {
    await espace.remplacer('taches/recette--trece007.md', 'echeance: 2026-09-29', 'echeance: 2026-09-24')
    await espace.retourSurOnglet()
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Semaine', exact: true }).click()
    const recette = rangee(page, 'Recette')
    await expect(recette.locator('.tl-point')).toBeVisible()
    await expect(recette.locator('.tl-barre')).toHaveCount(0)

    // Deux jours de plus (36 px par jour à l'échelle semaine).
    await glisser(page, recette.locator('.tl-poignee-point'), 72)
    await expect.poll(() => espace.lire('taches/recette--trece007.md')).toContain('echeance: 2026-09-26')
    await expect(recette.locator('.tl-barre')).toBeVisible()
    await expect(recette.locator('.tl-point')).toHaveCount(0)
  })

  test('dates de début et de fin de part et d’autre de la barre, nom des jalons en option', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Afficher Début' }).check()
    await page.getByRole('checkbox', { name: 'Afficher Échéance' }).check()
    await page.getByRole('switch', { name: 'Afficher le nom des jalons' }).check()
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('noms_jalons: true')

    const site = rangee(page, 'Site vitrine')
    const barre = (await site.locator('.tl-barre').boundingBox())!
    const avant = (await site.locator('.champs-bord.avant').boundingBox())!
    const apres = (await site.locator('.champs-bord.apres').boundingBox())!
    expect(avant.x + avant.width).toBeLessThanOrEqual(barre.x)
    expect(apres.x).toBeGreaterThanOrEqual(barre.x + barre.width)
    await expect(site.locator('.champs-bord.avant')).toHaveText('01/09/2026')
    await expect(site.locator('.champs-bord.apres')).toHaveText('15/10/2026')
    await expect(site.locator('.tl-nom-jalon')).toHaveText('Revue client')
  })

  test('un niveau sur la ligne du parent : les tâches s’enchaînent sur la rangée de leur projet et se glissent toujours', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.locator('.reglages-niveau').first().getByRole('switch', { name: 'Sur la ligne du parent' }).check()
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('    sur_la_ligne: true')

    await expect(page.locator('.tl-enfant')).toHaveCount(0)
    const site = rangee(page, 'Site vitrine')
    await expect(site.locator('.tl-sous-ligne', { hasText: 'Intégration' })).toBeVisible()
    await expect(site.locator('.tl-sous-ligne', { hasText: 'Maquettes' })).toBeVisible()
    // La barre du projet laisse la place à ses tâches.
    await expect(site.locator('.tl-piste > .tl-barre')).toHaveCount(0)

    const semaines = page.locator('.tl-bas .tl-graduation')
    const [a, b] = await Promise.all([semaines.nth(1).boundingBox(), semaines.nth(2).boundingBox()])
    const avant = await espace.lire('taches/integration--tinte002.md')
    await glisser(page, site.locator('.tl-sous-ligne', { hasText: 'Intégration' }).locator('.tl-barre'), b!.x - a!.x)
    await expect.poll(() => espace.lire('taches/integration--tinte002.md')).not.toBe(avant)
  })

  test('la grille remplit toute la largeur de l’écran, même en trimestre et en plein écran', async ({ espace, page }) => {
    await page.setViewportSize({ width: 2400, height: 900 })
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    await page.getByRole('button', { name: 'Trimestre', exact: true }).click()
    const remplit = async () => {
      const zone = (await page.locator('.timeline').boundingBox())!
      const grille = (await page.locator('.tl-graduations').boundingBox())!
      return grille.x + grille.width >= zone.x + zone.width - 1
    }
    await expect.poll(remplit).toBe(true)
    await page.getByRole('button', { name: 'Plein écran' }).click()
    await expect.poll(remplit).toBe(true)
  })

  test('zoom libre : Ctrl + molette sous le pointeur, + et - au clavier, 0 ou un bouton d’échelle pour revenir', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    const barre = rangee(page, 'Site vitrine').locator('.tl-barre')
    const largeur = async () => (await barre.boundingBox())!.width
    const depart = await largeur()

    await page.keyboard.press('+')
    await expect.poll(largeur).toBeCloseTo(depart * 1.25, 0)
    await expect(page.getByText('Zoom libre')).toBeVisible()
    await page.keyboard.press('-')
    await expect.poll(largeur).toBeCloseTo(depart, 0)

    // Le début de la barre reste sous le pointeur pendant le zoom.
    const avant = (await barre.boundingBox())!
    await page.mouse.move(avant.x + 2, avant.y + avant.height / 2)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -200)
    await page.keyboard.up('Control')
    await expect.poll(largeur).toBeGreaterThan(depart * 1.3)
    expect(Math.abs((await barre.boundingBox())!.x - avant.x)).toBeLessThan(6)

    await page.keyboard.press('0')
    await expect.poll(largeur).toBeCloseTo(depart, 0)
    await expect(page.getByText('Zoom libre')).toHaveCount(0)

    // Un bouton d'échelle efface aussi le zoom libre ; le fichier de la vue n'a jamais changé pour le zoom.
    await page.keyboard.press('+')
    await page.getByRole('button', { name: 'Mois', exact: true }).click()
    await expect.poll(largeur).toBeCloseTo(depart, 0)
    expect(await espace.lire('projets/_vues/planning.yaml')).toContain('echelle: mois')
  })

  test('légende : les options de chaque colonne qui colore des barres, sans rien à régler', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    const legende = page.getByLabel('Légende des couleurs')
    await expect(legende.locator('.groupe-legende')).toHaveCount(2)
    await expect(legende.locator('.groupe-legende').first()).toContainText('Statut')
    await expect(legende.locator('.groupe-legende').first()).toContainText('En cours')
    await expect(legende.locator('.groupe-legende').nth(1)).toContainText('Priorité · Tâches')
    await expect(legende.locator('.groupe-legende').nth(1)).toContainText('Haute')
    // Juste sous la dernière ligne, pas en bas de la page.
    const grille = (await page.locator('.timeline').boundingBox())!
    expect((await legende.boundingBox())!.y - (grille.y + grille.height)).toBeLessThan(20)
    expect(page.viewportSize()!.height - (grille.y + grille.height)).toBeGreaterThan(100)

    // Sans couleur selon une colonne, pas de légende.
    await page.getByRole('button', { name: 'Options' }).click()
    await choisir(page.locator('.flottant').getByRole('button', { name: 'Couleur' }).first(), 'neutre')
    await choisir(page.locator('.reglages-niveau').first().getByRole('button', { name: 'Couleur' }), 'neutre')
    await expect(legende).toHaveCount(0)
  })

  test('bandes : les lignes d’une autre base traversent la timeline, leur titre dans l’en-tête ouvre la ligne', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await choisir(page.getByRole('button', { name: 'Ajouter des bandes' }), 'Tâches')
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/_vues/planning.yaml')).toContain('bandes:\n  - base: taches\n    champ_debut: debut\n    champ_fin: echeance\n    couleur_par: priorite\n')

    await expect(page.locator('.tl-bande').first()).toBeVisible()
    await page.locator('.tl-titre-bande', { hasText: 'Recette' }).click()
    await expect(page.locator('.titre-page')).toHaveValue('Recette')
  })

  test('bandes : titres en bas, jamais coupés ni superposés ; couleur d’une option changée depuis le réglage', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Planning' }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await choisir(page.getByRole('button', { name: 'Ajouter des bandes' }), 'Tâches')
    await choisir(page.getByRole('button', { name: 'Place des titres des bandes' }), 'en bas')
    await expect.poll(() => espace.lire('projets/_vues/planning.yaml')).toContain('    couleur_par: priorite\n    titres: bas\n')

    // Couleurs des options de la colonne qui colore : écrites dans le schéma de sa base.
    await page.locator('.couleurs-options summary').click()
    await choisir(page.getByRole('button', { name: 'Couleur de « Normale »' }), 'Violet')
    await expect.poll(() => espace.lire('taches/_schema.yaml')).toContain('{ label: Normale, couleur: violet }')
    await page.keyboard.press('Escape')

    await expect(page.locator('.tl-entete .tl-titre-bande')).toHaveCount(0)
    const titres = page.locator('.tl-pied-bandes .tl-titre-bande')
    await expect(titres.filter({ hasText: 'Recette' })).toBeVisible()
    // Aucun titre n'est coupé, et deux titres d'un même étage ne se touchent pas, débordement compris.
    const boites = await titres.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { haut: Math.round(r.top), gauche: r.left, droite: r.left + Math.max(el.clientWidth, el.scrollWidth), coupe: getComputedStyle(el).overflow !== 'visible' }
      }),
    )
    expect(boites.some((b) => b.coupe)).toBe(false)
    for (const a of boites) for (const b of boites) if (a !== b && a.haut === b.haut && a.gauche < b.gauche) expect(a.droite).toBeLessThanOrEqual(b.gauche)
  })

  test('champs affichés d’un niveau : pris dans sa base, dates de part et d’autre, puis aux bouts de la barre sur la ligne du parent', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    const niveau = page.locator('.reglages-niveau').first()
    await niveau.getByText('Champs affichés').click()
    await niveau.getByRole('checkbox', { name: 'Afficher Début' }).check()
    await niveau.getByRole('checkbox', { name: 'Afficher Priorité' }).check()
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('    champs_carte: [ priorite, debut ]\n')

    const tache = page.locator('.tl-enfant', { hasText: 'Intégration' })
    await expect(tache.locator('.champs-bord.avant')).toHaveText(/\d{2}\/\d{2}\/\d{4}/)
    await expect(tache.locator('.titre-evt .champ-carte')).toHaveText('Normale')

    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.locator('.reglages-niveau').first().getByRole('switch', { name: 'Sur la ligne du parent' }).check()
    await page.keyboard.press('Escape')
    const sous = rangee(page, 'Site vitrine').locator('.tl-sous-ligne', { hasText: 'Intégration' })
    // Dans la barre aussi, le début se lit en premier ; la priorité suit le titre.
    await expect(sous.locator('.champs-bord.debut-dedans')).toHaveText(/\d{2}\/\d{2}\/\d{4}/)
    await expect(sous.locator('.titre-evt .champ-carte')).toHaveText('Normale')
  })

  test('titre des barres retiré, pour la vue puis pour un niveau : il reste dans l’infobulle', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    const site = rangee(page, 'Site vitrine')
    await expect(site.locator('.tl-barre').first()).toContainText('Site vitrine')

    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await page.locator('.section-reglages', { hasText: 'Champs sur la barre' }).getByRole('checkbox', { name: 'Masquer Titre' }).uncheck()
    const niveau = page.locator('.reglages-niveau').first()
    await niveau.getByText('Champs affichés').click()
    await niveau.getByRole('checkbox', { name: 'Masquer Titre' }).uncheck()
    await page.keyboard.press('Escape')
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toMatch(/^sans_titre: true$/m)
    expect(await espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('    sans_titre: true\n')

    await expect(site.locator('.tl-barre').first()).not.toContainText('Site vitrine')
    await expect(site.locator('.tl-barre').first()).toHaveAttribute('title', /^Site vitrine · /)
    const tache = page.locator('.tl-enfant', { hasText: 'Intégration' })
    await expect(tache.locator('.tl-barre')).not.toContainText('Intégration')
    // La colonne des titres, à gauche, garde les noms.
    await expect(tache).toContainText('Intégration')
  })

  test('réglages d’un niveau : sans fin, des losanges ; ses filtres ne touchent que lui', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.locator('.onglet', { hasText: 'Feuille de route' }).click()
    await page.getByRole('button', { name: 'Options' }).click()
    const reglages = page.locator('.reglages-niveau').first()
    await choisir(reglages.getByRole('button', { name: 'Fin' }), 'pas de fin (losanges)')
    await expect(page.locator('.tl-enfant .tl-point').first()).toBeVisible()
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).not.toContain('    champ_fin')

    await reglages.getByText('Filtrer les lignes de Tâches').click()
    await reglages.getByRole('button', { name: 'Ajouter un filtre' }).click()
    const ligne = reglages.locator('.ligne-filtre').first()
    await choisir(ligne.getByRole('button', { name: 'Opérateur' }), 'contient')
    await ligne.locator('input').fill('mise')
    await ligne.locator('input').press('Enter')
    await page.keyboard.press('Escape')
    await expect(page.locator('.tl-enfant .tl-titre')).toHaveText(['Mise en ligne'])
    // Les projets, eux, restent tous là.
    await expect(page.locator('.tl-ligne:not(.tl-enfant) .tl-titre:not(.ajout-ligne)')).toHaveCount(4)
    await expect.poll(() => espace.lire('projets/_vues/feuille-de-route.yaml')).toContain('      - { colonne: titre, operateur: contient, valeur: mise }')
  })
})

test.describe('dashboards et recherche', () => {
  test('nouveau dashboard : fichier créé, bloc ajouté depuis une vue de base', async ({ espace, page }) => {
    await page.getByRole('button', { name: 'Nouveau dashboard' }).click()
    await page.keyboard.type('Suivi')
    await page.keyboard.press('Enter')
    await expect(page.locator('h1', { hasText: 'Suivi' })).toBeVisible()
    await expect.poll(async () => (await espace.lister('_dashboards')).includes('suivi.yaml')).toBe(true)
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click()
    await page.locator('.flottant .option', { hasText: 'Projets' }).first().click()
    await page.locator('.flottant .option', { hasText: 'Tableau' }).first().click()
    await expect(page.locator('.bloc-dashboard .rangee', { hasText: 'Site vitrine' })).toBeVisible()
    await expect.poll(() => espace.lire('_dashboards/suivi.yaml')).toContain('projets')
  })

  test('filtre rapide global : un projet choisi filtre ses blocs et ceux qui lui sont liés', async ({ espace, page }) => {
    await page.locator('.entree-base', { hasText: 'Pilotage' }).click()
    const blocs = page.locator('.bloc-dashboard')
    await expect(blocs.nth(0)).toContainText('Boutique en ligne')
    await expect(blocs.nth(2)).toContainText('Globex')

    await page.getByRole('button', { name: 'Filtre rapide' }).first().click()
    await page.locator('.flottant .option', { hasText: 'Projets' }).click()
    await page.locator('.flottant .option', { hasText: 'Choisir des lignes de Projets' }).click()
    await page.locator('.filtres-dashboard .pilule', { hasText: 'Projets' }).click()
    await page.locator('.flottant .case-reglage', { hasText: 'Site vitrine' }).locator('input').check()
    await page.keyboard.press('Escape')

    await expect(page.locator('.filtres-dashboard .pilule.active')).toHaveText(/Projets : Site vitrine/)
    await expect(blocs.nth(0)).toContainText('Site vitrine')
    await expect(blocs.nth(0)).not.toContainText('Boutique en ligne')
    // Les clients suivent leur relation vers les projets : seul Acme, client du site vitrine.
    await expect(blocs.nth(2)).toContainText('Acme')
    await expect(blocs.nth(2)).not.toContainText('Globex')
    await expect.poll(() => espace.lire('_dashboards/pilotage.yaml')).toContain('filtres_rapides:\n  - { base: projets, valeur: [ psite001 ] }\n')
  })

  test('consultation : lecture seule, seuls les onglets et les filtres rapides restent ; Ctrl+E revient en édition', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Passer en consultation (Ctrl+E)' }).click()
    expect(await page.evaluate(() => localStorage.getItem('mdbase.mode'))).toBe('consultation')

    // Plus d'outils : ni Filtrer, ni nouvelle ligne, ni vue, ni colonne, ni assistant.
    for (const nom of ['Filtrer', 'Options', 'Nouvelle ligne', 'Nouvelle vue', 'Filtre rapide', 'Assistant IA', 'Nouvelle base']) {
      await expect(page.getByRole('button', { name: nom })).toHaveCount(0)
    }
    await expect(page.locator('.gouttiere, .cellule-entete.ajout, .poignee-recopie')).toHaveCount(0)
    // Une cellule ne s'ouvre plus au clic.
    await page.locator('.rangee', { hasText: 'Site vitrine' }).locator('.cellule', { hasText: 'En cours' }).click()
    await expect(page.locator('.flottant')).toHaveCount(0)

    // Les filtres rapides restent utilisables.
    await page.locator('.pilule', { hasText: 'Statut' }).click()
    await page.locator('.choix-parmi label', { hasText: 'En cours' }).locator('input').check()
    await expect(page.getByRole('button', { name: 'Retirer la pastille' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.rangee')).toHaveCount(2)
    // Les onglets servent encore à changer de vue.
    await page.locator('.onglet', { hasText: 'Par statut' }).click()
    await expect(page.locator('.ajout-carte')).toHaveCount(0)

    // Une page s'ouvre en lecture : titre en texte, sans menu.
    await page.locator('.carte', { hasText: 'Site vitrine' }).click()
    await expect(page.locator('h2.titre-page')).toHaveText('Site vitrine')
    await expect(page.getByRole('button', { name: 'Actions de la ligne' })).toHaveCount(0)

    // Le dashboard aussi : plus d'ajout de bloc.
    await page.locator('.entree-base', { hasText: 'Pilotage' }).click()
    await expect(page.locator('.bloc-dashboard').first()).toBeVisible()
    await expect(page.locator('.ajout-bloc, .deplacer-rangee, .poignee-hauteur')).toHaveCount(0)

    await page.locator('body').press('Control+e')
    await expect(page.getByRole('button', { name: 'Passer en consultation (Ctrl+E)' })).toBeVisible()
    await expect(page.locator('.ajout-bloc').first()).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('mdbase.mode'))).toBe('edition')
  })

  test('dupliquer un dashboard, puis le remonter par glisser-déposer', async ({ espace, page }) => {
    await page.locator('.entree-base', { hasText: 'Pilotage' }).click({ button: 'right' })
    await page.getByRole('button', { name: 'Dupliquer' }).click()
    await expect(page.locator('h1')).toHaveText('Pilotage (copie)')
    await expect.poll(() => espace.lire('_espace.yaml')).toContain('dashboards: [ pilotage, pilotage-copie ]')
    expect(await espace.lire('_dashboards/pilotage-copie.yaml')).toContain('nom: Pilotage (copie)')
    const entrees = page.locator('.dashboards .entree-base')
    await entrees.nth(1).dragTo(entrees.nth(0))
    await expect(entrees.nth(0)).toHaveText('Pilotage (copie)')
    await expect.poll(() => espace.lire('_espace.yaml')).toContain('dashboards: [ pilotage-copie, pilotage ]')
  })

  test('hauteur d’une rangée : tirer son bord bas l’agrandit et l’écrit, double-clic revient au défaut', async ({ espace, page }) => {
    await page.locator('.entree-base', { hasText: 'Pilotage' }).click()
    const contenu = page.locator('.rangee-dashboard').first().locator('.contenu-bloc')
    await expect(contenu).toBeVisible()
    const avant = (await contenu.boundingBox())!.height
    const poignee = page.locator('.rangee-dashboard').first().locator('.poignee-hauteur')
    const b = (await poignee.boundingBox())!
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + 220, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await contenu.boundingBox())!.height)).toBe(Math.round(avant + 220 - b.height / 2))
    await expect.poll(() => espace.lire('_dashboards/pilotage.yaml')).toMatch(/kanban|par-statut \}\n    hauteur: \d+\n/)
    await poignee.dblclick()
    await expect.poll(() => espace.lire('_dashboards/pilotage.yaml')).not.toContain('hauteur')
    await expect.poll(async () => Math.round((await contenu.boundingBox())!.height)).toBe(Math.round(avant))
  })

  test('raccourcis clavier : le bouton et « ? » ouvrent la liste, Échap la ferme, jamais pendant une saisie', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Raccourcis clavier' }).click()
    const aide = page.getByRole('dialog', { name: 'Raccourcis clavier' })
    await expect(aide).toBeVisible()
    await expect(aide.getByText('Rechercher dans tout l’espace')).toBeVisible()
    await expect(aide.getByText('Zoomer, dézoomer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(aide).toBeHidden()

    await page.keyboard.press('?')
    await expect(aide).toBeVisible()
    await page.keyboard.press('Escape')

    // Dans un champ de saisie, « ? » s'écrit.
    await page.keyboard.press('Control+K')
    await page.keyboard.type('?')
    await expect(page.locator('.champ-recherche')).toHaveValue('?')
    await expect(aide).toBeHidden()
  })

  test('plein écran : la vue seule, sans barre latérale ni titre, puis retour', async ({ espace, page }) => {
    await espace.base('Projets')
    await page.getByRole('button', { name: 'Plein écran' }).click()
    await expect(page.locator('.barre-laterale')).toBeHidden()
    await expect(page.locator('h1', { hasText: 'Projets' })).toBeHidden()
    await expect(page.locator('.onglet', { hasText: 'Feuille de route' })).toBeVisible()
    await page.getByRole('button', { name: 'Quitter le plein écran' }).click()
    await expect(page.locator('.barre-laterale')).toBeVisible()
    await expect(page.locator('h1', { hasText: 'Projets' })).toBeVisible()
  })

  test('Ctrl+K : chercher dans le contenu des pages, Entrée ouvre la ligne', async ({ espace, page }) => {
    await page.keyboard.press('Control+k')
    await page.locator('.champ-recherche').fill('salon')
    await expect(page.locator('.resultat').first()).toContainText('Site vitrine')
    await page.keyboard.press('Enter')
    await expect(page.locator('.titre-page')).toHaveValue('Site vitrine')
    expect(espace).toBeTruthy()
  })
})
