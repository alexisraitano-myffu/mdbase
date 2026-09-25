import type { MessageIA, ModeleIA } from '../../core/ia/modele'

// Connecteur générique (spec §12, « Module IA ») : tout service qui parle le
// format `/chat/completions` d'OpenAI avec appels d'outils, distant (OVH,
// Mistral, OpenRouter…) ou local (Ollama, LM Studio, vLLM). Seul endroit de
// l'app qui fait un appel réseau.

export type Connexion = {
  /** Adresse de base (`…/v1`) ou complète (`…/v1/chat/completions`). */
  adresse: string
  /** Vide pour un serveur local sans clé. */
  cle: string
  modele: string
}

const DELAI_MS = 60_000

export function adresseComplete(adresse: string): string {
  const a = adresse.trim().replace(/\/+$/, '')
  return a.endsWith('/chat/completions') ? a : `${a}/chat/completions`
}

function versOpenAI(m: MessageIA): Record<string, unknown> {
  switch (m.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: m.contenu || null,
        tool_calls: m.appels.map((a) => ({ id: a.id, type: 'function', function: { name: a.nom, arguments: a.arguments } })),
      }
    case 'tool':
      return { role: 'tool', tool_call_id: m.idAppel, content: m.contenu }
    default:
      return { role: m.role, content: m.contenu }
  }
}

type ReponseOpenAI = {
  choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[]
}

async function messageErreur(r: Response): Promise<string> {
  const texte = await r.text().catch(() => '')
  let detail = texte.slice(0, 300)
  try {
    const json = JSON.parse(texte) as { error?: { message?: string } | string; message?: string }
    detail = (typeof json.error === 'string' ? json.error : json.error?.message) ?? json.message ?? detail
  } catch {
    // réponse qui n'est pas du JSON : le début du texte suffit
  }
  const cause = r.status === 401 || r.status === 403 ? 'clé refusée' : r.status === 404 ? 'adresse ou modèle introuvable' : r.status === 429 ? 'trop de requêtes' : `erreur ${r.status}`
  return `Le service a répondu : ${cause}${detail ? ` (${detail})` : ''}`
}

/** Modèles de discussion proposés par le service (`GET …/models`) ; vide si le service ne les liste pas. */
export async function listerModeles(c: Pick<Connexion, 'adresse' | 'cle'>, envoyer: typeof fetch = (...a) => fetch(...a)): Promise<string[]> {
  const base = adresseComplete(c.adresse).replace(/\/chat\/completions$/, '')
  try {
    const r = await envoyer(`${base}/models`, { headers: c.cle.trim() ? { Authorization: `Bearer ${c.cle.trim()}` } : {} })
    if (!r.ok) return []
    const json = (await r.json()) as { data?: { id?: unknown }[] }
    return (json.data ?? [])
      .flatMap((m) => (typeof m.id === 'string' ? [m.id] : []))
      .filter((id) => !PAS_DE_DISCUSSION.test(id))
      .sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

/** Modèles listés par les services mais inutilisables ici : voix, images, vecteurs, modération. */
const PAS_DE_DISCUSSION = /whisper|tts|diffusion|embed|bge|guard|rerank|moderation|ocr|dall-e|transcribe/i

/** `envoyer` est injectable pour les tests ; par défaut, le `fetch` du navigateur. */
export function modeleCompatibleOpenAI(c: Connexion, envoyer: typeof fetch = (...a) => fetch(...a)): ModeleIA {
  return async ({ messages, outils }) => {
    const arret = new AbortController()
    const minuteur = setTimeout(() => arret.abort(), DELAI_MS)
    let r: Response
    try {
      r = await envoyer(adresseComplete(c.adresse), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.cle.trim() ? { Authorization: `Bearer ${c.cle.trim()}` } : {}) },
        body: JSON.stringify({
          model: c.modele.trim(),
          messages: messages.map(versOpenAI),
          tools: outils.map((o) => ({ type: 'function', function: { name: o.nom, description: o.description, parameters: o.parametres } })),
          tool_choice: 'auto',
          temperature: 0,
        }),
        signal: arret.signal,
      })
    } catch (e) {
      if (arret.signal.aborted) throw new Error(`Pas de réponse du service après ${DELAI_MS / 1000} s.`)
      throw new Error(`Service injoignable : adresse, réseau, ou appel refusé par le navigateur (CORS). ${e instanceof Error ? e.message : ''}`.trim())
    } finally {
      clearTimeout(minuteur)
    }
    if (!r.ok) throw new Error(await messageErreur(r))
    const json = (await r.json()) as ReponseOpenAI
    const message = json.choices?.[0]?.message
    if (!message) throw new Error('Réponse du service illisible : aucun message.')
    return {
      texte: message.content ?? '',
      appels: (message.tool_calls ?? []).map((t, i) => ({
        id: t.id || `appel${i}`,
        nom: t.function?.name ?? '',
        // Certains serveurs renvoient les arguments déjà décodés.
        arguments: typeof t.function?.arguments === 'string' ? t.function.arguments : JSON.stringify(t.function?.arguments ?? {}),
      })),
    }
  }
}
