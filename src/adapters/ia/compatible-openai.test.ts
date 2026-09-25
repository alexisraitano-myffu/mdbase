import { describe, expect, it } from 'vitest'
import { adresseComplete, listerModeles, modeleCompatibleOpenAI } from './compatible-openai'

const CONNEXION = { adresse: 'https://exemple.test/v1/', cle: ' secret ', modele: 'qwen' }

function faux(reponse: Response | Error) {
  const requetes: { url: string; init: RequestInit }[] = []
  const envoyer = (async (url: string, init: RequestInit) => {
    requetes.push({ url, init })
    if (reponse instanceof Error) throw reponse
    return reponse
  }) as typeof fetch
  return { envoyer, requetes }
}

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } })

describe('connecteur compatible OpenAI', () => {
  it('adresse de base ou complète', () => {
    expect(adresseComplete('https://x.test/v1')).toBe('https://x.test/v1/chat/completions')
    expect(adresseComplete(' https://x.test/v1/chat/completions/ ')).toBe('https://x.test/v1/chat/completions')
  })

  it('requête au format OpenAI : outils, messages d’outil, clé en Bearer, température 0', async () => {
    const f = faux(json({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'repondre', arguments: '{"texte":"ok"}' } }] } }] }))
    const modele = modeleCompatibleOpenAI(CONNEXION, f.envoyer)
    const r = await modele({
      messages: [
        { role: 'system', contenu: 'consigne' },
        { role: 'assistant', contenu: '', appels: [{ id: 'a', nom: 'repondre', arguments: '{}' }] },
        { role: 'tool', idAppel: 'a', contenu: 'Erreur' },
      ],
      outils: [{ nom: 'repondre', description: 'd', parametres: { type: 'object' } }],
    })
    expect(r).toEqual({ texte: '', appels: [{ id: 'c1', nom: 'repondre', arguments: '{"texte":"ok"}' }] })
    const { url, init } = f.requetes[0]!
    expect(url).toBe('https://exemple.test/v1/chat/completions')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret' })
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'qwen',
      messages: [
        { role: 'system', content: 'consigne' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'repondre', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'a', content: 'Erreur' },
      ],
      tools: [{ type: 'function', function: { name: 'repondre', description: 'd', parameters: { type: 'object' } } }],
      tool_choice: 'auto',
      temperature: 0,
    })
  })

  it('réponse passée sans appel d’outil : pas de `tool_calls` vide', async () => {
    const f = faux(json({ choices: [{ message: { content: 'ok' } }] }))
    await modeleCompatibleOpenAI(CONNEXION, f.envoyer)({ messages: [{ role: 'assistant', contenu: 'Quel projet ?', appels: [] }], outils: [] })
    expect(JSON.parse(f.requetes[0]!.init.body as string).messages).toEqual([{ role: 'assistant', content: 'Quel projet ?' }])
  })

  it('sans clé : pas d’en-tête Authorization (serveur local)', async () => {
    const f = faux(json({ choices: [{ message: { content: 'bonjour' } }] }))
    expect(await modeleCompatibleOpenAI({ ...CONNEXION, cle: '' }, f.envoyer)({ messages: [], outils: [] })).toEqual({ texte: 'bonjour', appels: [] })
    expect(f.requetes[0]!.init.headers).not.toHaveProperty('Authorization')
  })

  it('arguments déjà décodés par le serveur : réencodés', async () => {
    const f = faux(json({ choices: [{ message: { tool_calls: [{ function: { name: 'repondre', arguments: { texte: 'x' } } }] } }] }))
    const r = await modeleCompatibleOpenAI(CONNEXION, f.envoyer)({ messages: [], outils: [] })
    expect(r.appels).toEqual([{ id: 'appel0', nom: 'repondre', arguments: '{"texte":"x"}' }])
  })

  it('erreurs en français : clé refusée, service injoignable', async () => {
    const refus = faux(json({ error: { message: 'invalid token' } }, 401))
    await expect(modeleCompatibleOpenAI(CONNEXION, refus.envoyer)({ messages: [], outils: [] })).rejects.toThrow('Le service a répondu : clé refusée (invalid token)')
    const injoignable = faux(new TypeError('Failed to fetch'))
    await expect(modeleCompatibleOpenAI(CONNEXION, injoignable.envoyer)({ messages: [], outils: [] })).rejects.toThrow(/Service injoignable.*CORS/)
  })

  it('liste des modèles : seulement ceux de discussion, triés ; vide si le service ne répond pas', async () => {
    const f = faux(json({ data: [{ id: 'whisper-large-v3' }, { id: 'Qwen3.8-27B' }, { id: 'bge-m3' }, { id: 'gpt-oss-120b' }] }))
    expect(await listerModeles({ adresse: 'https://x.test/v1/chat/completions', cle: '' }, f.envoyer)).toEqual(['gpt-oss-120b', 'Qwen3.8-27B'])
    expect(f.requetes[0]!.url).toBe('https://x.test/v1/models')
    expect(await listerModeles({ adresse: 'https://x.test/v1', cle: '' }, faux(new TypeError('Failed to fetch')).envoyer)).toEqual([])
  })
})
