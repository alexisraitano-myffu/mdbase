import { webcrypto } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { DepotEspace } from '../../core/depot-espace'
import { AdaptateurNode } from '../commun/fichiers-node'
import { executer, INSTRUCTIONS, outilsMcp } from './serveur'

// Serveur MCP de mdbase, lancé par le client (Claude Desktop) sur stdio :
//   node mdbase-mcp.mjs "<dossier de l'espace>"
// stdout appartient au protocole : les messages vont sur stderr.

declare const __VERSION__: string

const deux = (n: number) => String(n).padStart(2, '0')
const jour = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`

async function principal(): Promise<void> {
  const dossier = process.argv[2]
  if (!dossier) throw new Error('Dossier de l’espace manquant : node mdbase-mcp.mjs "<dossier>"')
  const racine = resolve(dossier)
  if (!(await stat(racine).catch(() => null))?.isDirectory()) throw new Error(`Dossier introuvable : ${racine}`)

  const espace = await DepotEspace.ouvrir(new AdaptateurNode(racine), {
    aleatoire: (n) => webcrypto.getRandomValues(new Uint8Array(n)),
    planifier: (action, ms) => {
      const t = setTimeout(action, ms)
      return () => clearTimeout(t)
    },
    aujourdhui: () => jour(new Date()),
    maintenant: () => {
      const d = new Date()
      return `${jour(d)}T${deux(d.getHours())}:${deux(d.getMinutes())}`
    },
  })

  const serveur = new Server({ name: 'mdbase', version: __VERSION__ }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS })
  serveur.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: outilsMcp() }))
  // Un appel à la fois : chaque écriture voit l'espace laissé par la précédente.
  let file: Promise<unknown> = Promise.resolve()
  serveur.setRequestHandler(CallToolRequestSchema, (requete) => {
    const suite = file.then(async () => {
      const r = await executer(espace, requete.params.name, requete.params.arguments, jour(new Date()))
      return { content: [{ type: 'text' as const, text: r.texte }], isError: r.erreur ?? false }
    })
    file = suite.catch(() => {})
    return suite
  })
  await serveur.connect(new StdioServerTransport())
  console.error(`mdbase : espace ${racine}`)
}

principal().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
