import type { ClientJira } from './synchro'
import type { TicketJira } from './ticket'

// Client Jira Cloud (REST v3), lecture seule : recherche JQL et liste des champs.
// Le transport (requête HTTP et authentification) est injecté : `fetch` dans le
// script, le code natif dans l'app de bureau. Le cœur ne fait pas de réseau.

const PAR_PAGE = 100

/** Une requête vers `https://<site>` + chemin ; le transport ajoute l'authentification. */
export type TransportJira = (methode: 'GET' | 'POST', chemin: string, corps?: string) => Promise<ReponseJira>

/** `attente` : secondes demandées par Jira (en-tête Retry-After) quand il répond 429. */
export type ReponseJira = { statut: number; texte: string; attente?: number }

/** Domaine seul : « https://exemple.atlassian.net/jira/… » donne « exemple.atlassian.net ». */
export const domaineJira = (site: string): string => site.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')

/** `ressaisir` : que faire d'un token refusé (401), dit dans le message d'erreur. */
export function clientJira(transport: TransportJira, attendre: (secondes: number) => Promise<void>, ressaisir?: string): ClientJira {
  async function appeler(methode: 'GET' | 'POST', chemin: string, corps?: unknown, essai = 0): Promise<unknown> {
    const r = await transport(methode, chemin, corps === undefined ? undefined : JSON.stringify(corps))
    // Trop de requêtes : on attend ce que Jira demande, trois fois au plus.
    if (r.statut === 429 && essai < 3) {
      await attendre(Math.min(60, r.attente || 5))
      return appeler(methode, chemin, corps, essai + 1)
    }
    if (r.statut < 200 || r.statut >= 300) throw new Error(messageErreurJira(r.statut, r.texte, ressaisir))
    return JSON.parse(r.texte)
  }

  return {
    async chercher(jql, champs, suivant) {
      const corps = { jql, fields: champs, maxResults: PAR_PAGE, ...(suivant && { nextPageToken: suivant }) }
      const r = (await appeler('POST', '/rest/api/3/search/jql', corps)) as { issues?: TicketJira[]; nextPageToken?: string; isLast?: boolean }
      const tickets = Array.isArray(r.issues) ? r.issues : []
      return { tickets, ...(r.nextPageToken && r.isLast !== true && { suivant: r.nextPageToken }) }
    },
    async champSprint() {
      const champs = (await appeler('GET', '/rest/api/3/field')) as { id?: string; name?: string; schema?: { custom?: string } }[]
      const sprint = champs.find((c) => c.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint') ?? champs.find((c) => c.name === 'Sprint')
      return sprint?.id
    },
  }
}

/** Message lisible d'une réponse en erreur ; commence toujours par « Jira : <statut> ». */
export function messageErreurJira(statut: number, texte: string, ressaisir = 'relance avec --oublier pour le ressaisir'): string {
  let detail = ''
  try {
    const j = JSON.parse(texte) as { errorMessages?: string[]; errors?: Record<string, string> }
    detail = [...(j.errorMessages ?? []), ...Object.values(j.errors ?? {})].join(' ; ')
  } catch {
    detail = texte.slice(0, 200)
  }
  const pourquoi =
    statut === 401
      ? `e-mail ou token refusé (token expiré ou révoqué ? ${ressaisir})`
      : statut === 403
        ? 'accès refusé (droits sur le projet, ou tokens d’API désactivés par l’administrateur Atlassian)'
        : statut === 404
          ? 'adresse introuvable (vérifie le site dans les réglages de la base Jira)'
          : statut === 400
            ? 'requête refusée (un projet inconnu, ou le filtre JQL des réglages est invalide)'
            : 'erreur de Jira'
  return `Jira : ${statut}, ${pourquoi}${detail ? `. ${detail}` : ''}`
}
