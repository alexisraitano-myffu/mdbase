import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { proposer, type Proposition } from './assistant'
import type { AppelOutil, ModeleIA, ReponseIA } from './modele'
import type { EtatEspace } from '../depot-espace'
import { appliquerPlan, resumerPlan, type Plan } from './plan'
import { trouverLigne } from './references'

// Outils de structure de l'assistant : validés dans l'ordre sur un brouillon,
// rien d'écrit avant l'application ; une colonne créée peut être remplie aussitôt.

const AUJOURDHUI = '2026-09-25'

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => AUJOURDHUI })
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire }
}

let n = 0
const appel = (nom: string, args: unknown): AppelOutil => ({ id: `s${++n}`, nom, arguments: JSON.stringify(args) })
/** Modèle qui répond une fois ces appels ; une deuxième requête (relance) échoue. */
const modele = (...appels: AppelOutil[]): ModeleIA => {
  const reponses: ReponseIA[] = [{ texte: '', appels }]
  return async () => reponses.shift() ?? { texte: '', appels: [] }
}
/** Modèle qui s'obstine : la relance renvoie les mêmes appels, le refus remonte. */
const obstine = (...appels: AppelOutil[]): ModeleIA => async () => ({ texte: '', appels })

async function plan(espace: DepotEspace, ...appels: AppelOutil[]): Promise<Plan> {
  const p: Proposition = await proposer(modele(...appels), espace, 'demande', { aujourdhui: AUJOURDHUI, baseOuverte: 'taches' })
  if (p.type !== 'plan') throw new Error(`plan attendu, reçu : ${p.type === 'reponse' ? p.texte : ''}`)
  return p.plan
}

describe('assistant : structure', () => {
  it('créer une colonne à options puis la remplir dans les mêmes appels ; rien n’est écrit avant l’application', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'Priorité', type: 'select', options: ['Haute', 'Basse'] }] }),
      appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { Priorité: 'Haute' } }),
    )
    expect(resumerPlan(p)).toContain('Ajouter la colonne « Priorité » (choix [Haute, Basse]) à Tâches')
    expect(await a.lire('taches/_schema.yaml')).not.toContain('Priorité')
    await appliquerPlan(espace, p)
    await ecrire()
    expect(await a.lire('taches/_schema.yaml')).toMatch(/cle: priorite[\s\S]*label: Haute[\s\S]*label: Basse/)
    expect(await a.lire('taches/a--t0000001.md')).toContain('priorite: Haute\n')
  })

  it('nouvelle base avec colonnes, lignes créées dedans, contenu de leur page', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('creer_base', { nom: 'Fournisseurs', colonnes: [{ nom: 'Montant', type: 'number' }, { nom: 'Projet', type: 'relation', cible: 'projets' }] }),
      appel('creer_lignes', { base: 'Fournisseurs', lignes: [{ titre: 'Imprimerie', Montant: 1200, Projet: ['Navi'] }] }),
      appel('ecrire_contenu', { base: 'fournisseurs', ligne: 'Imprimerie', contenu: '## Contact\n\nJean, 06…' }),
    )
    await appliquerPlan(espace, p)
    await ecrire()
    const fichier = (await a.lister('fournisseurs')).find((e) => e.nom.startsWith('imprimerie--'))!
    const texte = await a.lire(`fournisseurs/${fichier.nom}`)
    expect(texte).toContain('montant: 1200\n')
    expect(texte).toContain('projet: p0000001\n')
    expect(texte).toContain('## Contact\n\nJean, 06…')
    expect(await a.lire('projets/_schema.yaml')).toContain('cible: fournisseurs')
  })

  it('relier des lignes à une ligne créée par le même plan : désignée par son titre, son id réel à l’application', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('creer_base', { nom: 'Versions', colonnes: [{ nom: 'Sortie', type: 'date' }] }),
      appel('creer_lignes', { base: 'Versions', lignes: [{ titre: '2026.10', Sortie: '2026-10-15' }, { titre: '2026.11' }] }),
      appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'Version', type: 'relation', cible: 'Versions' }] }),
      appel('modifier_lignes', { base: 'taches', lignes: ['t0000001', 't0000002'], valeurs: { Version: ['2026.11'] } }),
    )
    expect(resumerPlan(p)).toContain('2026.11')
    await appliquerPlan(espace, p)
    await ecrire()
    const fichier = (await a.lister('versions')).find((e) => e.nom.startsWith('2026-11--'))!
    const id = fichier.nom.slice('2026-11--'.length, -'.md'.length)
    expect(await a.lire('taches/a--t0000001.md')).toContain(`version: ${id}\n`)
    expect(await a.lire('taches/b--t0000002.md')).toContain(`version: ${id}\n`)
  })

  it('une proposition de structure seule laisse un tour au modèle pour envoyer les lignes', async () => {
    const { espace } = await ouvrir()
    const reponses: ReponseIA[] = [
      { texte: 'Je crée la base, puis la ligne.', appels: [appel('creer_base', { nom: 'Risques', colonnes: [{ nom: 'Gravité', type: 'select', options: ['Haute'] }] })] },
      { texte: '', appels: [appel('creer_lignes', { base: 'Risques', lignes: [{ titre: 'Retard', Gravité: 'Haute' }] })] },
    ]
    const p = await proposer(async () => reponses.shift() ?? { texte: '', appels: [] }, espace, 'demande', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    if (p.type !== 'plan') throw new Error('plan attendu')
    expect((p.plan.structure ?? []).map((s) => s.type)).toContain('creer_base')
    expect(p.plan.operations.flatMap((o) => o.lignes.map((l) => l.titre))).toEqual(['Retard'])
    // Le modèle n'a rien d'autre à faire : la structure seule est proposée.
    const seule = await plan(espace, appel('creer_base', { nom: 'Notes' }))
    expect((seule.structure ?? []).map((s) => s.type)).toEqual(['creer_base'])
  })

  it('une ligne se désigne par le premier mot de son titre s’il ne désigne qu’elle (clé Jira)', () => {
    const etat = { titres: new Map([['tickets', new Map([['10066', 'DATA-515 Afficher les droits'], ['10067', 'DATA-5150 Autre'], ['10068', 'OPS-1 Un'], ['10069', 'OPS-1 Deux']])]]) } as unknown as EtatEspace
    expect(trouverLigne(etat, 'tickets', 'DATA-515')).toBe('10066')
    expect(trouverLigne(etat, 'tickets', 'data-515')).toBe('10066')
    expect(() => trouverLigne(etat, 'tickets', 'OPS-1')).toThrow(/ligne inconnue/)
  })

  it('relation puis rollup, et formule écrite avec les noms de colonnes', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('ajouter_colonnes', {
        base: 'clients',
        colonnes: [
          { nom: 'Tâches suivies', type: 'relation', cible: 'taches' },
          { nom: 'Heures suivies', type: 'rollup', relation: 'taches_suivies', champ: 'heures', calcul: 'somme' },
        ],
      }),
      appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'Double', type: 'formula', expression: 'prop("Heures") * 2' }] }),
    )
    await appliquerPlan(espace, p)
    await ecrire()
    expect(await a.lire('clients/_schema.yaml')).toMatch(/cle: heures_suivies[\s\S]*relation: taches_suivies/)
    expect(await a.lire('taches/_schema.yaml')).toContain('prop("heures") * 2')
  })

  it('vue kanban groupée et filtrée, puis un dashboard qui l’affiche', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('creer_vue', { base: 'taches', nom: 'Par statut', type: 'kanban', groupe: 'statut', filtres: [{ colonne: 'fait', operateur: 'egal', valeur: false }] }),
      appel('creer_dashboard', { nom: 'Suivi', blocs: [{ base: 'taches', vue: 'Par statut' }] }),
    )
    await appliquerPlan(espace, p)
    await ecrire()
    const fichier = (await a.lister('taches/_vues')).find((e) => e.nom.startsWith('par'))!
    const vue = await a.lire(`taches/_vues/${fichier.nom}`)
    expect(vue).toContain('type: kanban')
    expect(vue).toContain('groupe: statut')
    expect(await a.lire('_dashboards/suivi.yaml')).toContain(`vue: ${fichier.nom.replace('.yaml', '')}`)
  })

  it('timeline en arbre : dates, couleur selon une colonne, tâches dépliées sous leur projet avec leurs filtres', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('ajouter_colonnes', {
        base: 'projets',
        colonnes: [
          { nom: 'Début', type: 'date' },
          { nom: 'Fin', type: 'date' },
          { nom: 'Phase', type: 'select', options: ['Cadrage', 'Production'] },
        ],
      }),
      appel('creer_vue', {
        base: 'projets',
        nom: 'Feuille de route',
        type: 'timeline',
        champ_debut: 'Début',
        champ_fin: 'Fin',
        couleur_par: 'Phase',
        echelle: 'trimestre',
        deplier: [{ relation: 'Tâches', champ_debut: 'echeance', couleur: 'orange', filtres: [{ colonne: 'fait', operateur: 'egal', valeur: false }], sur_la_ligne: true }],
        bandes: [{ base: 'taches', champ_debut: 'echeance' }],
      }),
    )
    // Proposée mais pas appliquée : la vue n'existe pas encore dans l'espace.
    expect(espace.etat().bases.get('projets')!.vues.map((v) => v.nom)).not.toContain('Feuille de route')
    await appliquerPlan(espace, p)
    await ecrire()
    expect((await a.lister('projets/_vues')).map((e) => e.nom)).toEqual(['feuille-de-route.yaml'])
    const fichier = (await a.lister('projets/_vues')).find((e) => e.nom.startsWith('feuille'))!
    const vue = await a.lire(`projets/_vues/${fichier.nom}`)
    const idVue = fichier.nom.replace('.yaml', '')
    expect(vue).toContain('champ_debut: debut\nchamp_fin: fin\ncouleur_par: phase\nechelle: trimestre\n')
    expect(vue).toContain(
      [
        'deplier:',
        '  - relation: taches',
        '    champ_debut: echeance',
        '    couleur: orange',
        '    filtres:',
        '      - { colonne: fait, operateur: egal, valeur: false }',
        '    sur_la_ligne: true',
        'bandes:',
        '  - base: taches',
        '    champ_debut: echeance',
      ].join('\n'),
    )
    // La base notée à la validation d'un niveau ne s'écrit pas dans le fichier (seule une bande en porte une).
    expect(vue).not.toMatch(/^ +base:/m)

    const refus = async (...appels: AppelOutil[]) =>
      proposer(obstine(...appels), espace, 'x', { aujourdhui: AUJOURDHUI, baseOuverte: null }).then(
        () => '',
        (e: Error) => e.message,
      )
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, couleur: 'fuchsia' }))).toContain('couleur inconnue')
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, couleur_par: 'titre' }))).toContain('pas une colonne à choix')
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, deplier: [{ relation: 'heures' }] }))).toContain('pas une relation')
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, deplier: [{ relation: 'taches', champ_fin: 'statut' }] }))).toContain('pas une colonne date')
    expect(await refus(appel('creer_vue', { base: 'projets', nom: 'K', type: 'kanban', groupe: 'Phase', deplier: [{ relation: 'taches' }] }))).toContain('seulement pour une vue timeline')
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, bandes: [{ base: 'taches', champ_debut: 'titre' }] }))).toContain('pas une colonne date')
    expect(await refus(appel('modifier_vue', { base: 'projets', vue: idVue, bandes: [{ base: 'inconnue' }] }))).not.toBe('')
    expect(await refus(appel('creer_vue', { base: 'projets', nom: 'K', type: 'kanban', groupe: 'Phase', bandes: [{ base: 'taches' }] }))).toContain('seulement pour une vue timeline')
  })

  it('supprimer des lignes par filtre retire aussi les liens vers elles, et s’annule d’un Ctrl+Z', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(espace, appel('supprimer_lignes', { base: 'projets', filtres: [{ colonne: 'titre', operateur: 'egal', valeur: 'Navi' }] }))
    expect(resumerPlan(p)).toBe('Supprimer 1 ligne de Projets : Navi ; 2 liens vers elles retirés')
    await espace.enUneEtape(() => appliquerPlan(espace, p))
    await ecrire()
    expect((await a.lister('projets')).map((e) => e.nom)).not.toContain('navi--p0000001.md')
    expect(await a.lire('taches/a--t0000001.md')).not.toContain('projet:')
    await espace.annuler()
    await ecrire()
    expect((await a.lister('projets')).map((e) => e.nom)).toContain('navi--p0000001.md')
    expect(await a.lire('taches/a--t0000001.md')).toContain('projet: p0000001\n')
  })

  it('ajouter des options à un select existant (avec ou sans couleur), puis y écrire la nouvelle valeur dans le même plan', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(
      espace,
      appel('ajouter_options', { base: 'taches', colonne: 'Statut', options: [{ label: 'En cours', couleur: 'bleu' }, 'Bloqué', { label: 'terminé', couleur: 'vert' }] }),
      appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'En cours' } }),
    )
    expect(resumerPlan(p)).toContain('Options de « Statut » (Tâches) : ajouter « En cours » (bleu), « Bloqué » ; colorer « Terminé » en vert')
    await appliquerPlan(espace, p)
    await ecrire()
    const options = espace.etat().bases.get('taches')!.depot!.schema.colonnes.find((c) => c.cle === 'statut')
    expect(options).toMatchObject({ options: [{ label: 'À faire' }, { label: 'Terminé', couleur: 'vert' }, { label: 'En cours', couleur: 'bleu' }, { label: 'Bloqué' }] })
    expect(await a.lire('taches/a--t0000001.md')).toContain('statut: En cours\n')
  })

  it('une valeur hors des options est refusée, avec l’outil qui l’ajoute ; une couleur inconnue aussi', async () => {
    const { espace } = await ouvrir()
    const contexte = { aujourdhui: AUJOURDHUI, baseOuverte: 'taches' }
    await expect(proposer(obstine(appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Bloqué' } })), espace, 'x', contexte)).rejects.toThrow(/ajouter_options d'abord/)
    await expect(proposer(obstine(appel('ajouter_options', { base: 'taches', colonne: 'statut', options: [{ label: 'X', couleur: 'fuchsia' }] })), espace, 'x', contexte)).rejects.toThrow(/couleur inconnue pour « X »/)
  })

  it('une colonne créée avec des options colorées garde leurs couleurs', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(espace, appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'Risque', type: 'select', options: [{ label: 'Haut', couleur: 'rouge' }, 'Bas'] }] }))
    await appliquerPlan(espace, p)
    await ecrire()
    expect(await a.lire('taches/_schema.yaml')).toMatch(/Haut[\s\S]*couleur: rouge/)
  })

  it('renommer puis supprimer une colonne ; la suppression est signalée comme définitive', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(espace, appel('renommer_colonne', { base: 'taches', colonne: 'heures', nom: 'Temps' }), appel('supprimer_colonne', { base: 'taches', colonne: 'echeance' }))
    expect(resumerPlan(p)).toContain('Supprimer la colonne « Échéance » de Tâches, et sa valeur dans 2 lignes (définitif)')
    await appliquerPlan(espace, p)
    await ecrire()
    const schema = await a.lire('taches/_schema.yaml')
    expect(schema).toContain('nom: Temps')
    expect(schema).not.toContain('echeance')
    expect(await a.lire('taches/a--t0000001.md')).not.toContain('echeance')
  })

  it('supprimer une base : aperçu avec les relations converties, puis elle n’existe plus pour les appels suivants', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const p = await plan(espace, appel('supprimer_base', { base: 'Projets' }))
    expect(resumerPlan(p)).toBe('Supprimer la base « Projets » et 3 lignes (définitif) ; relations devenues texte : Clients › Projets, Tâches › Projet')
    await appliquerPlan(espace, p)
    await ecrire()
    expect(await a.lire('taches/a--t0000001.md')).toContain('projet: Navi\n')
    const refus = await proposer(obstine(appel('supprimer_base', { base: 'projets' }), appel('creer_lignes', { base: 'projets', lignes: [{ titre: 'X' }] })), espace, 'x', {
      aujourdhui: AUJOURDHUI,
      baseOuverte: null,
    }).then(
      () => '',
      (e: Error) => e.message,
    )
    expect(refus).toContain('base inconnue')
  })

  it('refus explicites renvoyés au modèle', async () => {
    const { espace } = await ouvrir()
    const refus = async (...appels: AppelOutil[]) =>
      proposer(obstine(...appels), espace, 'x', { aujourdhui: AUJOURDHUI, baseOuverte: null }).then(
        () => '',
        (e: Error) => e.message,
      )
    expect(await refus(appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'X', type: 'couleur' }] }))).toContain('type de colonne inconnu')
    expect(await refus(appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'Statut', type: 'text' }] }))).toContain('existe déjà')
    expect(await refus(appel('supprimer_colonne', { base: 'taches', colonne: 'titre' }))).toContain('colonne titre')
    expect(await refus(appel('creer_vue', { base: 'clients', nom: 'Agenda', type: 'calendrier' }))).toContain('colonne date')
    expect(await refus(appel('supprimer_vue', { base: 'taches', vue: 'tableau' }))).toContain('au moins une vue')
    expect(await refus(appel('ajouter_colonnes', { base: 'taches', colonnes: [{ nom: 'F', type: 'formula', expression: 'prop("inconnue") +' }] }))).toContain('formule refusée')
  })
})
