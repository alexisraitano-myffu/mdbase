import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { serveurMcp } from './mcp'

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-10-09' })
  return { a, repondre: serveurMcp(espace, { version: '9.9.9', aujourdhui: () => '2026-10-09' }) }
}

const envoyer = async (repondre: (m: string) => Promise<string | null>, method: string, params?: unknown, id: number | null = 1) =>
  JSON.parse((await repondre(JSON.stringify({ jsonrpc: '2.0', ...(id !== null && { id }), method, params }))) ?? 'null')

describe('protocole MCP de l’app de bureau', () => {
  it('initialize, liste des outils, notification sans réponse', async () => {
    const { repondre } = await ouvrir()
    const init = await envoyer(repondre, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(init.result).toMatchObject({ protocolVersion: '2025-03-26', serverInfo: { name: 'mdbase', version: '9.9.9' }, capabilities: { tools: {} } })
    expect(await repondre(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }))).toBeNull()
    const outils = await envoyer(repondre, 'tools/list', {}, 2)
    expect(outils.result.tools.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(['decrire_espace', 'modifier_lignes', 'ajouter_options']))
    expect((await envoyer(repondre, 'inconnue', {}, 3)).error.code).toBe(-32601)
  })

  it('un appel d’outil écrit dans l’espace ; un refus revient en erreur d’outil', async () => {
    const { a, repondre } = await ouvrir()
    const fait = await envoyer(repondre, 'tools/call', { name: 'modifier_lignes', arguments: { base: 'taches', lignes: ['t0000001'], valeurs: { heures: 8 } } })
    expect(fait.result).toMatchObject({ isError: false })
    expect(await a.lire('taches/a--t0000001.md')).toContain('heures: 8\n')
    const refus = await envoyer(repondre, 'tools/call', { name: 'modifier_lignes', arguments: { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Inconnu' } } }, 2)
    expect(refus.result.isError).toBe(true)
    expect(refus.result.content[0].text).toMatch(/^Refusé, rien n'a été écrit/)
  })
})
