import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

// Claude (MCP) dans l'app de bureau (spec §17) : les messages du client,
// relayés par `mdbase --mcp` jusqu'au code natif (src-tauri/src/mcp.rs),
// arrivent ici ; la page y répond sur l'espace ouvert.

/** Écoute les messages MCP tant que l'espace est ouvert ; renvoie de quoi arrêter. */
export function ecouterMcp(repondre: (message: string) => Promise<string | null>): () => void {
  const arret = listen<{ id: number; message: string }>('mcp-requete', ({ payload }) => {
    void repondre(payload.message).then(
      (reponse) => invoke('mcp_reponse', { id: payload.id, reponse }),
      (e: unknown) =>
        invoke('mcp_reponse', {
          id: payload.id,
          reponse: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } }),
        }),
    )
  })
  void arret.then(() => invoke('mcp_pret', { pret: true }))
  return () => {
    void invoke('mcp_pret', { pret: false })
    void arret.then((f) => f())
  }
}

/** Chemin de l'exécutable de mdbase, pour la commande de Claude Code. */
export const executableMdbase = (): Promise<string> => invoke('mcp_executable')

/** Ajoute mdbase à la configuration de Claude Desktop ; renvoie les fichiers modifiés. */
export const connecterClaudeDesktop = (): Promise<string[]> => invoke('mcp_connecter_claude_desktop')
