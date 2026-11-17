import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { chargerTables, executerRequete } from '../../core/bi/calcul'
import type { Parametre } from '../../core/bi/analyse'
import type { MoteurSql } from '../../core/bi/sql'
import { sourceDe, tablesSql } from '../../core/bi/tables'
import { lireDashboard } from '../../core/dashboard'
import { DepotEspace } from '../../core/depot-espace'
import { AdaptateurCompteur, aleatoire, minuteur } from '../../core/fixtures/outils'
import { dashboardBurndown, requetesBurndown } from '../../core/jira/burndown'
import { schemaJira } from '../../core/jira/ticket'
import { modifierSchema } from '../../core/schema-ecriture'
import { moteurNode } from './duckdb-node'

// Le burndown d'une base Jira (spec §16) sur le vrai moteur : tickets restants
// jour par jour, ligne idéale, heures des estimations initiales.

const AUJOURDHUI = '2026-11-05'
const SOURCE = { type: 'jira', site: 'exemple.atlassian.net', projets: ['APP'], historique: true, temps: true }

const ligne = (id: string, cle: string, valeurs: string) => [`tickets-jira/${cle.toLowerCase()}--${id}.md`, `---\nid: ${id}\ntitre: ${cle}\ncle: ${cle}\nresume: Résumé ${cle}\nstatut: À faire\nversions: [ V1 ]\n${valeurs}\n---\n`]

let moteur: MoteurSql

beforeAll(async () => {
  moteur = await moteurNode(createRequire(import.meta.url).resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'))
  const fichiers = Object.fromEntries([
    ['tickets-jira/_schema.yaml', modifierSchema(schemaJira('tickets-jira', 'Tickets Jira', SOURCE), { type: 'ajouter_option', cle: 'versions', option: { label: 'V1' } })],
    // Créé le 2, terminé le 3 à 18 h : restant à la fin du 2 seulement.
    ligne('t0000001', 'APP-1', 'cree: 2026-11-02T09:00\ntermine: 2026-11-03T18:00\nestimation: 4'),
    // Créé le 2, jamais terminé.
    ligne('t0000002', 'APP-2', 'cree: 2026-11-02T10:00\nestimation: 6'),
    // Arrivé en cours de route, le 4.
    ligne('t0000003', 'APP-3', 'cree: 2026-11-04T08:00'),
  ])
  const espace = await DepotEspace.ouvrir(new AdaptateurCompteur(fichiers), { aleatoire, planifier: minuteur().planifier, aujourdhui: () => AUJOURDHUI })
  expect(espace.etat().bases.get('tickets-jira')?.depot?.lignes()).toHaveLength(3)
  await chargerTables(moteur, tablesSql(sourceDe(espace.etat())))
}, 30_000)

const executer = async (sql: string, parametres: Parametre[]) => {
  const r = await executerRequete(moteur, sql, parametres, AUJOURDHUI)
  if (!r.ok) throw new Error(r.erreur)
  return r.resultat.lignes
}
const requetes = requetesBurndown('tickets-jira', true)
const version: Parametre = { nom: 'version', type: 'choix', options: 'versions', valeur: 'V1' }
const sansBornes: Parametre[] = [version, { nom: 'debut', type: 'date' }, { nom: 'fin', type: 'date' }]

describe('burndown d’une base Jira', () => {
  it('versions, synthèse', async () => {
    expect(await executer(requetes.versions!, [])).toEqual([{ version: 'V1' }])
    expect(await executer(requetes.synthese!, sansBornes)).toEqual([{ restants: 2, termines: 1, heures: 6 }])
  })

  it('restants jour par jour jusqu’à la fin choisie, ligne idéale du périmètre de la version à zéro', async () => {
    const lignes = await executer(requetes.burndown!, [version, { nom: 'debut', type: 'date' }, { nom: 'fin', type: 'date', valeur: '2026-11-06' }])
    expect(lignes.map((l) => [l.jour, l.Restants, l['Idéal'], l['Heures restantes'], l['Idéal (h)']])).toEqual([
      ['2026-11-02', 2, 3, 10, 10],
      ['2026-11-03', 1, 2.3, 6, 7.5],
      ['2026-11-04', 2, 1.5, 6, 5],
      ['2026-11-05', 2, 0.8, 6, 2.5],
      // Après aujourd'hui : la ligne idéale seule.
      ['2026-11-06', null, 0, null, 0],
    ])
  })

  it('le dashboard se relit : paramètres, requêtes, courbes', () => {
    const { dashboard, avertissements } = lireDashboard(dashboardBurndown('burndown', 'Burndown', 'tickets-jira', SOURCE), 'burndown')
    expect(avertissements).toEqual([])
    expect(dashboard?.parametres?.map((p) => p.nom)).toEqual(['version', 'debut', 'fin'])
    expect(Object.keys(dashboard?.requetes ?? {})).toEqual(['versions', 'synthese', 'burndown', 'restants'])
    expect(dashboard?.rangees).toHaveLength(4)
    const sansTemps = lireDashboard(dashboardBurndown('b', 'B', 'tickets-jira', {}), 'b').dashboard
    expect(sansTemps?.rangees).toHaveLength(3)
  })
})
