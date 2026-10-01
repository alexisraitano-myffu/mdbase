import type { ClientJira } from '../../core/jira/synchro'
import type { TicketJira } from '../../core/jira/ticket'

// Client Jira Cloud (REST v3) du script : lecture seule, GET et recherche JQL.
// Authentification e-mail + token d'API (Basic), jamais écrite nulle part ici.

const PAR_PAGE = 100

export function clientHttp(site: string, email: string, token: string): ClientJira {
  const racine = `https://${site.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

  async function appeler(chemin: string, init: RequestInit = {}, essai = 0): Promise<unknown> {
    let r: Response
    try {
      r = await fetch(racine + chemin, { ...init, headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' } })
    } catch (e) {
      throw new Error(`Jira injoignable (${racine}) : ${(e as Error).message}. Vérifie la connexion ou le proxy de l'entreprise.`)
    }
    // Trop de requêtes : on attend ce que Jira demande, trois fois au plus.
    if (r.status === 429 && essai < 3) {
      const attente = Math.min(60, Number(r.headers.get('Retry-After')) || 5)
      await new Promise((ok) => setTimeout(ok, attente * 1000))
      return appeler(chemin, init, essai + 1)
    }
    if (!r.ok) throw new Error(messageErreur(r.status, await r.text().catch(() => '')))
    return r.json()
  }

  return {
    async chercher(jql: string, champs: string[], suivant?: string) {
      const corps = { jql, fields: champs, maxResults: PAR_PAGE, ...(suivant && { nextPageToken: suivant }) }
      const r = (await appeler('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify(corps) })) as { issues?: TicketJira[]; nextPageToken?: string; isLast?: boolean }
      const tickets = Array.isArray(r.issues) ? r.issues : []
      return { tickets, ...(r.nextPageToken && r.isLast !== true && { suivant: r.nextPageToken }) }
    },
    async champSprint() {
      const champs = (await appeler('/rest/api/3/field')) as { id?: string; name?: string; schema?: { custom?: string } }[]
      const sprint = champs.find((c) => c.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint') ?? champs.find((c) => c.name === 'Sprint')
      return sprint?.id
    },
  }
}

function messageErreur(statut: number, texte: string): string {
  let detail = ''
  try {
    const j = JSON.parse(texte) as { errorMessages?: string[]; errors?: Record<string, string> }
    detail = [...(j.errorMessages ?? []), ...Object.values(j.errors ?? {})].join(' ; ')
  } catch {
    detail = texte.slice(0, 200)
  }
  const pourquoi =
    statut === 401
      ? 'e-mail ou token refusé (token expiré ou révoqué ? relance avec --oublier pour le ressaisir)'
      : statut === 403
        ? 'accès refusé (droits sur le projet, ou tokens d’API désactivés par l’administrateur Atlassian)'
        : statut === 404
          ? 'adresse introuvable (vérifie le site dans les réglages de la base Jira)'
          : statut === 400
            ? 'requête refusée (un projet inconnu, ou le filtre JQL des réglages est invalide)'
            : 'erreur de Jira'
  return `Jira : ${statut}, ${pourquoi}${detail ? `. ${detail}` : ''}`
}
