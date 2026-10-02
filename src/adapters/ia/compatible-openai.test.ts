import { describe, expect, it } from 'vitest'
import { DemandeArretee } from '../../core/ia/modele'
import { adresseComplete, entetes, listerModeles, modeleCompatibleOpenAI } from './compatible-openai'

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

/** Réponse au fil de l'eau : chaque morceau est envoyé tel quel ; `puisSilence` laisse le flux ouvert sans plus rien envoyer. */
function flux(morceaux: string[], puisSilence = false) {
  const requetes: RequestInit[] = []
  const envoyer = (async (_url: string, init: RequestInit) => {
    requetes.push(init)
    const encodeur = new TextEncoder()
    const corps = new ReadableStream<Uint8Array>({
      start(c) {
        for (const m of morceaux) c.enqueue(encodeur.encode(m))
        if (!puisSilence) c.close()
        // Comme `fetch` : une requête coupée fait échouer la lecture du corps.
        init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError')))
      },
    })
    return new Response(corps, { headers: { 'Content-Type': 'text/event-stream' } })
  }) as typeof fetch
  return { envoyer, requetes }
}
const evt = (delta: unknown) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`

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
      stream: true,
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

  it('API d’Anthropic : en-tête d’accès direct depuis le navigateur, et seulement chez elle', () => {
    expect(entetes({ adresse: 'https://api.anthropic.com/v1', cle: ' sk-ant-x ' })).toEqual({ Authorization: 'Bearer sk-ant-x', 'anthropic-dangerous-direct-browser-access': 'true' })
    expect(entetes({ adresse: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', cle: 'k' })).toEqual({ Authorization: 'Bearer k' })
    expect(entetes({ adresse: 'pas une adresse', cle: '' })).toEqual({})
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

  it('réponse au fil de l’eau : texte et appels recollés, progression à chaque morceau', async () => {
    const f = flux([
      evt({ content: 'Je ' }),
      evt({ content: 'propose' }) + evt({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'modifier_lignes', arguments: '{"ba' } }] }),
      // Un évènement coupé entre deux morceaux du flux.
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"argum',
      'ents":"se\\":1}"}}]}}]}\n\n',
      evt({ tool_calls: [{ index: 1, id: 'c2', function: { name: 'repondre', arguments: '{}' } }] }),
      'data: [DONE]\n\n',
    ])
    const vus: unknown[] = []
    const r = await modeleCompatibleOpenAI(CONNEXION, f.envoyer)({ messages: [], outils: [], progression: (p) => vus.push(p) })
    expect(r).toEqual({
      texte: 'Je propose',
      appels: [
        { id: 'c1', nom: 'modifier_lignes', arguments: '{"base":1}' },
        { id: 'c2', nom: 'repondre', arguments: '{}' },
      ],
    })
    expect(vus[0]).toEqual({ texte: 'Je ', outils: [] })
    expect(vus.at(-1)).toEqual({ texte: 'Je propose', outils: ['modifier_lignes', 'repondre'] })
  })

  it('réponse coupée par le service (finish_reason length) : signalée, au fil de l’eau comme d’un bloc', async () => {
    const { envoyer } = flux([evt({ content: 'Je cré' }), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`, 'data: [DONE]\n\n'])
    expect(await modeleCompatibleOpenAI(CONNEXION, envoyer)({ messages: [], outils: [] })).toEqual({ coupee: true, texte: 'Je cré', appels: [] })
    const bloc = faux(json({ choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }))
    expect(await modeleCompatibleOpenAI(CONNEXION, bloc.envoyer)({ messages: [], outils: [] })).toMatchObject({ coupee: true })
    const complet = faux(json({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] }))
    expect(await modeleCompatibleOpenAI(CONNEXION, complet.envoyer)({ messages: [], outils: [] })).not.toHaveProperty('coupee')
  })

  it('erreur envoyée dans le flux : levée en français', async () => {
    const f = flux([evt({ content: 'a' }), `data: ${JSON.stringify({ error: { message: 'quota dépassé' } })}\n\n`])
    await expect(modeleCompatibleOpenAI(CONNEXION, f.envoyer)({ messages: [], outils: [] })).rejects.toThrow('Le service a répondu : quota dépassé')
  })

  it('silence prolongé : demande abandonnée, avec le délai dans le message', async () => {
    const f = flux([evt({ content: 'début' })], true)
    await expect(modeleCompatibleOpenAI(CONNEXION, f.envoyer, 30)({ messages: [], outils: [] })).rejects.toThrow('Plus rien reçu du service depuis 0.03 s')
  })

  it('arrêt par l’utilisateur : requête coupée, `DemandeArretee` levée', async () => {
    const f = flux([evt({ content: 'début' })], true)
    const arret = new AbortController()
    const attente = modeleCompatibleOpenAI(CONNEXION, f.envoyer, 5000)({ messages: [], outils: [], signal: arret.signal, progression: () => arret.abort() })
    await expect(attente).rejects.toBeInstanceOf(DemandeArretee)
    expect(f.requetes[0]!.signal?.aborted).toBe(true)
    // Déjà arrêtée : aucun appel réseau.
    await expect(modeleCompatibleOpenAI(CONNEXION, f.envoyer)({ messages: [], outils: [], signal: arret.signal })).rejects.toBeInstanceOf(DemandeArretee)
    expect(f.requetes).toHaveLength(1)
  })

  it('liste des modèles : seulement ceux de discussion, triés ; vide si le service ne répond pas', async () => {
    const f = faux(json({ data: [{ id: 'whisper-large-v3' }, { id: 'Qwen3.8-27B' }, { id: 'bge-m3' }, { id: 'gpt-oss-120b' }] }))
    expect(await listerModeles({ adresse: 'https://x.test/v1/chat/completions', cle: '' }, f.envoyer)).toEqual(['gpt-oss-120b', 'Qwen3.8-27B'])
    expect(f.requetes[0]!.url).toBe('https://x.test/v1/models')
    expect(await listerModeles({ adresse: 'https://x.test/v1', cle: '' }, faux(new TypeError('Failed to fetch')).envoyer)).toEqual([])
  })
})
