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

  it('historique : lecture groupée des passages de statut, pages suivies, triés, dates en texte ou en nombre', async () => {
    const { t, appels } = transport([
      {
        statut: 200,
        texte: JSON.stringify({
          issueChangeLogs: [
            {
              issueId: '10',
              changeHistories: [
                { created: '2026-09-20T17:04:00.000+0200', items: [{ field: 'status', fieldId: 'status', fromString: 'En cours', toString: 'Fait', from: '3', to: '10' }] },
                { created: '2026-09-03T09:00:00.000+0200', items: [{ fieldId: 'assignee', toString: 'Léa' }, { fieldId: 'status', fromString: 'À faire', toString: 'En cours', from: '1', to: '3' }] },
              ],
            },
          ],
          nextPageToken: 'p2',
        }),
      },
      { statut: 200, texte: JSON.stringify({ issueChangeLogs: [{ issueId: 11, changeHistories: [{ created: Date.UTC(2026, 8, 5, 12, 0), items: [{ fieldId: 'status', toString: 'En cours' }] }] }] }) },
    ])
    const h = await clientJira(t, async () => undefined).historiques!(['10', '11'])
    expect(appels.map((a) => a.chemin)).toEqual(['/rest/api/3/changelog/bulkfetch', '/rest/api/3/changelog/bulkfetch'])
    expect(JSON.parse(appels[0]!.corps!)).toEqual({ issueIdsOrKeys: ['10', '11'], fieldIds: ['status'], maxResults: 10000 })
    expect(JSON.parse(appels[1]!.corps!)).toMatchObject({ nextPageToken: 'p2' })
    expect(h.get('10')).toEqual([
      { quand: '2026-09-03T09:00', de: 'À faire', vers: 'En cours', deId: '1', versId: '3' },
      { quand: '2026-09-20T17:04', de: 'En cours', vers: 'Fait', deId: '3', versId: '10' },
    ])
    expect(h.get('11')).toHaveLength(1)
    expect(h.get('11')![0]!.quand).toMatch(/^2026-09-05T\d{2}:00$/)
  })

  it('catégories des statuts, par id et par nom', async () => {
    const { t } = transport([{ statut: 200, texte: JSON.stringify([{ id: '10', name: 'Fait', statusCategory: { key: 'done' } }, { id: '3', name: 'En cours', statusCategory: { key: 'indeterminate' } }]) }])
    const c = await clientJira(t, async () => undefined).categoriesStatuts!()
    expect([c.get('10'), c.get('Fait'), c.get('3')]).toEqual(['done', 'done', 'indeterminate'])
  })

  it('domaine seul', () => {
    expect(domaineJira(' https://exemple.atlassian.net/jira/software ')).toBe('exemple.atlassian.net')
  })
})
