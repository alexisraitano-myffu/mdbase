import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FichierIntrouvable } from '../../core/fichiers'
import { clientHttp } from './client-http'
import { texteCmd } from './demarrage'
import { AdaptateurNode } from '../commun/fichiers-node'

afterEach(() => vi.unstubAllGlobals())

function reponse(statut: number, corps: unknown, entetes: Record<string, string> = {}) {
  return new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut, headers: entetes })
}

describe('client HTTP Jira', () => {
  it('recherche JQL en POST, authentification Basic, pagination par jeton', async () => {
    const appels: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      appels.push({ url, init })
      return reponse(200, { issues: [{ id: '1', key: 'A-1', fields: {} }], nextPageToken: 'p2', isLast: false })
    })
    const page = await clientHttp('https://exemple.atlassian.net/jira/software/c/projects/A', 'moi@exemple.org', 'secret').chercher('project = A', ['summary'])
    expect(page).toEqual({ tickets: [{ id: '1', key: 'A-1', fields: {} }], suivant: 'p2' })
    expect(appels[0]!.url).toBe('https://exemple.atlassian.net/rest/api/3/search/jql')
    expect(JSON.parse(String(appels[0]!.init.body))).toEqual({ jql: 'project = A', fields: ['summary'], maxResults: 100 })
    expect((appels[0]!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('moi@exemple.org:secret').toString('base64')}`)
  })

  it('dernière page : pas de jeton suivant ; champ Sprint trouvé par son type', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/field')
        ? reponse(200, [{ id: 'customfield_1', name: 'Autre' }, { id: 'customfield_10020', name: 'Sprint (fr)', schema: { custom: 'com.pyxis.greenhopper.jira:gh-sprint' } }])
        : reponse(200, { issues: [], nextPageToken: 'x', isLast: true }),
    )
    const c = clientHttp('exemple.atlassian.net', 'e', 't')
    expect(await c.chercher('x', [])).toEqual({ tickets: [] })
    expect(await c.champSprint()).toBe('customfield_10020')
  })

  it('erreurs expliquées : 401, 400 avec le message de Jira', async () => {
    vi.stubGlobal('fetch', async () => reponse(401, ''))
    await expect(clientHttp('s', 'e', 't').champSprint()).rejects.toThrow('Jira : 401, e-mail ou token refusé')
    vi.stubGlobal('fetch', async () => reponse(400, { errorMessages: ["Le projet 'ZZZ' n'existe pas."] }))
    await expect(clientHttp('s', 'e', 't').chercher('x', [])).rejects.toThrow("filtre JQL des réglages est invalide). Le projet 'ZZZ' n'existe pas.")
  })
})

describe('adaptateur disque', () => {
  let racine = ''
  afterEach(async () => racine && rm(racine, { recursive: true, force: true }))

  it('écrit en créant les dossiers, liste, renomme, supprime ; refuse de sortir de l’espace', async () => {
    racine = await mkdtemp(join(tmpdir(), 'mdbase-'))
    const a = new AdaptateurNode(racine)
    await a.ecrire('jira/a.md', 'A')
    expect(await readFile(join(racine, 'jira', 'a.md'), 'utf8')).toBe('A')
    expect(await a.lister('jira')).toEqual([{ nom: 'a.md', type: 'fichier' }])
    await a.renommer('jira/a.md', 'jira/b.md')
    expect(await a.lire('jira/b.md')).toBe('A')
    await expect(a.lire('jira/a.md')).rejects.toBeInstanceOf(FichierIntrouvable)
    await a.supprimer('jira/b.md')
    await a.supprimer('jira')
    expect(await a.lister('')).toEqual([])
    await expect(a.ecrire('../dehors.md', 'x')).rejects.toThrow('Chemin refusé')
  })
})

describe('lancement au démarrage (Windows)', () => {
  it('écrit un .cmd qui lance la synchro réduite, chemins entre guillemets, % doublé, UTF-8 pour les accents', () => {
    const t = texteCmd('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\a\\AppData\\Local\\mdbase\\mdbase-jira.mjs', 'C:\\Users\\a\\OneDrive - Société\\100%\\espace', 5)
    expect(t.split('\r\n')).toEqual([
      '@echo off',
      'chcp 65001 >nul',
      'rem Synchro Jira de mdbase, installee par "mdbase-jira.mjs --demarrage".',
      'rem Supprimer ce fichier arrete le lancement automatique.',
      'start "mdbase Jira" /min "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\a\\AppData\\Local\\mdbase\\mdbase-jira.mjs" "C:\\Users\\a\\OneDrive - Société\\100%%\\espace" --suivre',
      '',
    ])
    expect(texteCmd('node', 's', 'e', 10)).toContain('--suivre --intervalle 10')
  })
})
