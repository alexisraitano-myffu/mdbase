import { clientJira, domaineJira } from '../../core/jira/client'
import type { ClientJira } from '../../core/jira/synchro'

// Transport du script : `fetch` de Node, authentification e-mail + token d'API
// (Basic), jamais écrite nulle part ici.

export function clientHttp(site: string, email: string, token: string): ClientJira {
  const racine = `https://${domaineJira(site)}`
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`
  return clientJira(
    async (methode, chemin, corps) => {
      let r: Response
      try {
        r = await fetch(racine + chemin, { method: methode, body: corps, headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' } })
      } catch (e) {
        throw new Error(`Jira injoignable (${racine}) : ${(e as Error).message}. Vérifie la connexion ou le proxy de l'entreprise.`)
      }
      return { statut: r.status, texte: await r.text().catch(() => ''), attente: Number(r.headers.get('Retry-After')) || undefined }
    },
    (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
  )
}
