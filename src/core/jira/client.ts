import type { ClientJira } from './synchro'
import { quandChangement, type CategoriesStatuts, type TicketJira, type Transition } from './ticket'

// Client Jira Cloud (REST v3), lecture seule : recherche JQL et liste des champs.
// Le transport (requête HTTP et authentification) est injecté : `fetch` dans le
// script, le code natif dans l'app de bureau. Le cœur ne fait pas de réseau.

const PAR_PAGE = 100
/** Tickets par appel de la lecture groupée de l'historique (limite de Jira : 1000). */
const HISTORIQUES_PAR_APPEL = 1000

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
    async historiques(ids) {
      const parTicket = new Map<string, Transition[]>()
      for (let i = 0; i < ids.length; i += HISTORIQUES_PAR_APPEL) {
        const lot = ids.slice(i, i + HISTORIQUES_PAR_APPEL)
        let suivant: string | undefined
        do {
          const corps = { issueIdsOrKeys: lot, fieldIds: ['status'], maxResults: 10000, ...(suivant && { nextPageToken: suivant }) }
          const r = (await appeler('POST', '/rest/api/3/changelog/bulkfetch', corps)) as ReponseHistoriques
          for (const journal of r.issueChangeLogs ?? []) {
            const id = String(journal.issueId ?? '')
            const liste = parTicket.get(id) ?? []
            for (const h of journal.changeHistories ?? []) {
              const quand = quandChangement(h.created)
              if (!quand) continue
              for (const x of h.items ?? []) {
                if ((x.fieldId ?? x.field) !== 'status') continue
                liste.push({ quand, ...champ('de', x.fromString), ...champ('vers', x.toString), ...champ('deId', x.from), ...champ('versId', x.to) })
              }
            }
            parTicket.set(id, liste)
          }
          suivant = r.nextPageToken || undefined
        } while (suivant)
      }
      for (const liste of parTicket.values()) liste.sort((a, b) => (a.quand < b.quand ? -1 : a.quand > b.quand ? 1 : 0))
      return parTicket
    },
    async categoriesStatuts() {
      const statuts = (await appeler('GET', '/rest/api/3/status')) as { id?: string; name?: string; statusCategory?: { key?: string } }[]
      const categories: CategoriesStatuts = new Map()
      for (const s of Array.isArray(statuts) ? statuts : []) {
        const cle = s.statusCategory?.key
        if (!cle) continue
        if (s.id) categories.set(String(s.id), cle)
        if (s.name && !categories.has(s.name)) categories.set(s.name, cle)
      }
      return categories
    },
    async champSprint() {
      const champs = (await appeler('GET', '/rest/api/3/field')) as { id?: string; name?: string; schema?: { custom?: string } }[]
      const sprint = champs.find((c) => c.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint') ?? champs.find((c) => c.name === 'Sprint')
      return sprint?.id
    },
  }
}

type ReponseHistoriques = {
  issueChangeLogs?: { issueId?: string | number; changeHistories?: { created?: unknown; items?: { field?: string; fieldId?: string; from?: unknown; fromString?: unknown; to?: unknown; toString?: unknown }[] }[] }[]
  nextPageToken?: string
}

/** Une propriété seulement si la valeur est un texte non vide. */
const champ = <K extends string>(cle: K, v: unknown): Partial<Record<K, string>> =>
  (typeof v === 'string' && v !== '') || typeof v === 'number' ? ({ [cle]: String(v) } as Record<K, string>) : {}

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
