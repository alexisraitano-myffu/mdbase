import { createDuckDB, NODE_RUNTIME, VoidLogger } from '@duckdb/duckdb-wasm/blocking'
import type { MoteurSql } from '../../core/bi/sql'
import { convertir, OUVERTURE } from './arrow'

// DuckDB-WASM dans Node (serveur MCP du paquet .mcpb, tests) : version
// bloquante, sans worker. `wasm` : chemin du fichier `duckdb-eh.wasm`.

export async function moteurNode(wasm: string): Promise<MoteurSql> {
  const db = await createDuckDB({ mvp: { mainModule: wasm, mainWorker: '' }, eh: { mainModule: wasm, mainWorker: '' } }, new VoidLogger(), NODE_RUNTIME)
  await db.instantiate()
  db.open(OUVERTURE)
  const connexion = db.connect()
  // Lecture seule vers l'extérieur, définitivement : ni fichier ni réseau.
  connexion.query('set enable_external_access = false')
  return { executer: async (sql) => convertir(connexion.query(sql)) }
}
