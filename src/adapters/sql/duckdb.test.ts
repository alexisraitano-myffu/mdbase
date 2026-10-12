import { createRequire } from 'node:module'
import { beforeAll, describe, expect, it } from 'vitest'
import { chargerTables, executerAnalyse, executerRequete } from '../../core/bi/calcul'
import type { MoteurSql } from '../../core/bi/sql'
import { sourceDe, tablesSql } from '../../core/bi/tables'
import { DepotEspace } from '../../core/depot-espace'
import { FICHIERS_RELATIONS } from '../../core/fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../../core/fixtures/outils'
import { moteurNode } from './duckdb-node'

// L'analyse sur le vrai moteur (DuckDB-WASM, version Node) : tables tirées
// d'un espace, requêtes, lecture seule.

let moteur: MoteurSql
let espace: DepotEspace

beforeAll(async () => {
  moteur = await moteurNode(createRequire(import.meta.url).resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'))
  espace = await DepotEspace.ouvrir(new AdaptateurCompteur({ ...FICHIERS_RELATIONS }), { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-10-12' })
  await chargerTables(moteur, tablesSql(sourceDe(espace.etat())))
}, 30_000)

const lignes = async (sql: string) => {
  const r = await executerRequete(moteur, sql, [], '2026-10-12')
  if (!r.ok) throw new Error(r.erreur)
  return r.resultat.lignes
}

describe('tables', () => {
  it('une table par base, colonnes calculées comprises, typées', async () => {
    const r = await executerRequete(moteur, 'select * from taches order by id', [], '2026-10-12')
    expect(r.ok && r.resultat.colonnes).toEqual([
      { nom: 'id', nature: 'texte' },
      { nom: 'titre', nature: 'texte' },
      { nom: 'projet', nature: 'liste' },
      { nom: 'statut', nature: 'texte' },
      { nom: 'heures', nature: 'nombre' },
      { nom: 'fait', nature: 'case' },
      { nom: 'echeance', nature: 'date' },
      { nom: '_cree', nature: 'date' },
      { nom: '_modifie', nature: 'date' },
    ])
    expect(r.ok && r.resultat.lignes[0]).toEqual({ id: 't0000001', titre: 'A', projet: ['p0000001'], statut: 'À faire', heures: 3, fait: true, echeance: '2026-10-01', _cree: null, _modifie: null })
    // Une case absente du fichier est décochée : `false`, pas `NULL`.
    expect(await lignes('select count(*) as n from taches where not fait')).toEqual([{ n: 2 }])
    expect(await lignes('select titre, heures from projets order by titre')).toEqual([
      { titre: 'Navi', heures: 8 },
      { titre: 'Seul', heures: null },
      { titre: 'sinam', heures: 2 },
    ])
  })

  it('relations dépliées par unnest, jointures, agrégats', async () => {
    const r = await lignes(`
      select c.nom as nom_client, sum(t.heures) as heures, count(*) as n
      from taches t, unnest(t.projet) as p(id)
      join projets pr on pr.id = p.id
      join clients c on list_contains(pr.client, c.id)
      group by nom_client order by heures desc`)
    expect(r).toEqual([{ nom_client: 'Acme', heures: 10, n: 3 }])
  })

  it('les filtres du dashboard réduisent les tables, et les bases liées suivent', async () => {
    await chargerTables(moteur, tablesSql(sourceDe(espace.etat()), new Map([['projets', new Set(['p0000002'])]])))
    expect(await lignes('select id from projets')).toEqual([{ id: 'p0000002' }])
    expect(await lignes('select id from taches')).toEqual([{ id: 't0000003' }])
    expect(await lignes('select nom from clients')).toEqual([{ nom: 'Acme' }])
    await chargerTables(moteur, tablesSql(sourceDe(espace.etat())))
  })
})

describe('lecture seule et erreurs', () => {
  it('ni écriture, ni fichier, ni plusieurs instructions', async () => {
    for (const sql of ['drop table taches', 'insert into taches (id) values (1)', "select * from read_csv('/etc/passwd')", 'select 1; drop table taches']) {
      const r = await executerRequete(moteur, sql, [], '2026-10-12')
      expect(r.ok, sql).toBe(false)
    }
    expect(await lignes('select count(*) as n from taches')).toEqual([{ n: 3 }])
  })

  it('une requête en erreur ne bloque pas les autres ; un résultat se coupe', async () => {
    const r = await executerAnalyse(
      moteur,
      {
        requetes: { bon: 'select count(*) as n from taches where statut = {{statut}}', casse: 'select inconnue from taches' },
        parametres: [{ nom: 'statut', type: 'choix', valeur: 'Terminé' }],
        blocs: [
          { place: '0.0', bloc: { type: 'valeur', donnees: 'bon', valeur: 'n' } },
          { place: '0.1', bloc: { type: 'tableau', sql: 'select * from range(10)' } },
          { place: '0.2', bloc: { type: 'tableau', donnees: 'absente' } },
        ],
      },
      '2026-10-12',
    )
    expect(r.requetes.get('bon')).toEqual({ ok: true, resultat: { colonnes: [{ nom: 'n', nature: 'nombre' }], lignes: [{ n: 1 }], coupe: false } })
    expect(r.requetes.get('casse')).toMatchObject({ ok: false, erreur: expect.stringContaining('inconnue') })
    expect(r.blocs.get('0.1')).toMatchObject({ ok: true })
    expect(r.blocs.get('0.2')).toEqual({ ok: false, erreur: 'requête « absente » introuvable dans le dashboard' })
    const coupee = await executerRequete(moteur, 'select * from range(10)', [], '2026-10-12', 4)
    expect(coupee.ok && [coupee.resultat.lignes.length, coupee.resultat.coupe]).toEqual([4, true])
  })
})
