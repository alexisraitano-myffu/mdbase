import { describe, expect, it } from 'vitest'
import { clientJira, domaineJira, type ReponseJira, type TransportJira } from './client'

function transport(reponses: ReponseJira[]) {
  const appels: { methode: string; chemin: string; corps?: string }[] = []
  const t: TransportJira = async (methode, chemin, corps) => {
    appels.push({ methode, chemin, corps })
    return reponses.shift()!
  }
  return { t, appels }
}

describe('client Jira à transport injecté', () => {
  it('cherche en POST, page suivante tant que Jira n’a pas fini', async () => {
    const { t, appels } = transport([{ statut: 200, texte: JSON.stringify({ issues: [{ id: '1', key: 'A-1', fields: {} }], nextPageToken: 'p2', isLast: false }) }])
    const page = await clientJira(t, async () => undefined).chercher('project = A', ['summary'])
    expect(page).toEqual({ tickets: [{ id: '1', key: 'A-1', fields: {} }], suivant: 'p2' })
    expect(appels[0]).toMatchObject({ methode: 'POST', chemin: '/rest/api/3/search/jql' })
    expect(JSON.parse(appels[0]!.corps!)).toEqual({ jql: 'project = A', fields: ['summary'], maxResults: 100 })
  })

  it('attend ce que Jira demande sur un 429, puis réessaie', async () => {
    const attentes: number[] = []
    const { t } = transport([
      { statut: 429, texte: '', attente: 2 },
      { statut: 200, texte: JSON.stringify([{ id: 'customfield_10020', name: 'Sprint' }]) },
    ])
    expect(await clientJira(t, async (s) => void attentes.push(s)).champSprint()).toBe('customfield_10020')
    expect(attentes).toEqual([2])
  })

  it('un token refusé dit comment le ressaisir', async () => {
    const { t } = transport([{ statut: 401, texte: '' }])
    await expect(clientJira(t, async () => undefined, 'ressaisis-le dans « Connexion »').champSprint()).rejects.toThrow(
      'Jira : 401, e-mail ou token refusé (token expiré ou révoqué ? ressaisis-le dans « Connexion »)',
    )
  })

  it('domaine seul', () => {
    expect(domaineJira(' https://exemple.atlassian.net/jira/software ')).toBe('exemple.atlassian.net')
  })
})
