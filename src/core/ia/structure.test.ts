import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { proposer, type Proposition } from './assistant'
import type { AppelOutil, ModeleIA, ReponseIA } from './modele'
import { appliquerPlan, resumerPlan, type Plan } from './plan'

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
