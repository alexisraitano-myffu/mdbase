import { AsyncDuckDB, VoidLogger } from '@duckdb/duckdb-wasm'
import wasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import type { MoteurSql } from '../../core/bi/sql'
import { convertir, OUVERTURE } from './arrow'

// DuckDB-WASM dans la page, dans un worker. Les fichiers du moteur sont livrés
// avec l'app (jamais un CDN), chargés seulement au premier calcul.

export async function moteurNavigateur(): Promise<MoteurSql> {
  const db = new AsyncDuckDB(new VoidLogger(), new Worker(worker))
  await db.instantiate(wasm)
  await db.open(OUVERTURE)
  const connexion = await db.connect()
  // Lecture seule vers l'extérieur, définitivement : ni fichier ni réseau.
  await connexion.query('set enable_external_access = false')
  return { executer: async (sql) => convertir(await connexion.query(sql)) }
}
