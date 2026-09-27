import { DemandeArretee, type MessageIA, type ModeleIA, type RequeteIA, type ReponseIA } from '../../core/ia/modele'

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

/**
 * Silence au bout duquel une demande est abandonnée. Long exprès : certains
 * modèles réfléchissent plusieurs minutes sans rien envoyer, et l'utilisateur
 * a le bouton Arrêter. Un long plan n'est jamais coupé tant que le service envoie quelque chose.
 */
const INACTIVITE_MS = 30 * 60_000

const duree = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${ms / 1000} s`)

export function adresseComplete(adresse: string): string {
  const a = adresse.trim().replace(/\/+$/, '')
  return a.endsWith('/chat/completions') ? a : `${a}/chat/completions`
}

function versOpenAI(m: MessageIA): Record<string, unknown> {
  switch (m.role) {
    case 'assistant':
      // Une réponse passée sans appel d'outil : pas de `tool_calls` vide, que certains services refusent.
      if (m.appels.length === 0) return { role: 'assistant', content: m.contenu }
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

type AppelOpenAI = { index?: number; id?: string; function?: { name?: string; arguments?: unknown } }
type ReponseOpenAI = { choices?: { message?: { content?: string | null; tool_calls?: AppelOpenAI[] } }[] }
type MorceauOpenAI = { choices?: { delta?: { content?: string | null; tool_calls?: AppelOpenAI[] } }[]; error?: { message?: string } | string }

/** Certains serveurs renvoient les arguments déjà décodés. */
const argumentsBruts = (a: unknown) => (typeof a === 'string' ? a : JSON.stringify(a ?? {}))

/** Réponse d'un service qui ignore `stream` et renvoie tout d'un bloc. */
function lireMessage(json: ReponseOpenAI): ReponseIA {
  const message = json.choices?.[0]?.message
  if (!message) throw new Error('Réponse du service illisible : aucun message.')
  return {
    texte: message.content ?? '',
    appels: (message.tool_calls ?? []).map((t, i) => ({ id: t.id || `appel${i}`, nom: t.function?.name ?? '', arguments: argumentsBruts(t.function?.arguments) })),
  }
}

/**
 * Réponse au fil de l'eau (évènements `data:` du format OpenAI) : le texte et
 * les appels d'outils arrivent par morceaux, recollés ici. `recu` est appelé à
 * chaque morceau, même vide (un modèle qui raisonne envoie sans rien écrire).
 */
async function lireFlux(corps: ReadableStream<Uint8Array>, recu: () => void, progression: RequeteIA['progression']): Promise<ReponseIA> {
  const lecteur = corps.getReader()
  const decodeur = new TextDecoder()
  let reste = ''
  let texte = ''
  const appels: { id?: string; nom: string; arguments: string }[] = []
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    recu()
    reste += decodeur.decode(value, { stream: true })
    const lignes = reste.split(/\r?\n/)
    reste = lignes.pop() ?? ''
    let nouveau = false
    for (const ligne of lignes) {
      if (!ligne.startsWith('data:')) continue
      const donnee = ligne.slice(5).trim()
      if (donnee === '' || donnee === '[DONE]') continue
      let morceau: MorceauOpenAI
      try {
        morceau = JSON.parse(donnee) as MorceauOpenAI
      } catch {
        continue // ligne coupée ou commentaire du service : ignorée
      }
      if (morceau.error) throw new Error(`Le service a répondu : ${typeof morceau.error === 'string' ? morceau.error : (morceau.error.message ?? 'erreur')}`)
      const delta = morceau.choices?.[0]?.delta
      if (!delta) continue
      if (delta.content) {
        texte += delta.content
        nouveau = true
      }
      for (const t of delta.tool_calls ?? []) {
        const a = (appels[typeof t.index === 'number' ? t.index : appels.length] ??= { nom: '', arguments: '' })
        if (t.id) a.id = t.id
        if (t.function?.name) a.nom ||= t.function.name
        const args = t.function?.arguments
        if (typeof args === 'string') a.arguments += args
        else if (args !== undefined) a.arguments = argumentsBruts(args)
        nouveau = true
      }
    }
    if (nouveau) progression?.({ texte, outils: appels.flatMap((a) => (a?.nom ? [a.nom] : [])) })
  }
  return {
    texte,
    appels: appels.flatMap((a, i) => (a ? [{ id: a.id || `appel${i}`, nom: a.nom, arguments: a.arguments || '{}' }] : [])),
  }
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

/** `envoyer` et `inactivite` sont réglables pour les tests ; par défaut, le `fetch` du navigateur et 30 minutes. */
export function modeleCompatibleOpenAI(c: Connexion, envoyer: typeof fetch = (...a) => fetch(...a), inactivite = INACTIVITE_MS): ModeleIA {
  return async ({ messages, outils, signal, progression }) => {
    if (signal?.aborted) throw new DemandeArretee()
    const arret = new AbortController()
    let silence = false
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const recu = () => {
      clearTimeout(minuteur)
      minuteur = setTimeout(() => {
        silence = true
        arret.abort()
      }, inactivite)
    }
    const arreter = () => arret.abort()
    signal?.addEventListener('abort', arreter)
    /** Une coupure voulue (arrêt, silence) l'emporte sur l'erreur réseau qu'elle provoque. */
    const coupure = () =>
      signal?.aborted ? new DemandeArretee() : silence ? new Error(`Plus rien reçu du service depuis ${duree(inactivite)} : demande abandonnée.`) : null
    recu()
    try {
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
            stream: true,
          }),
          signal: arret.signal,
        })
      } catch (e) {
        throw coupure() ?? new Error(`Service injoignable : adresse, réseau, ou appel refusé par le navigateur (CORS). ${e instanceof Error ? e.message : ''}`.trim())
      }
      try {
        if (!r.ok) throw new Error(await messageErreur(r))
        const flux = (r.headers.get('Content-Type') ?? '').includes('text/event-stream')
        return flux && r.body ? await lireFlux(r.body, recu, progression) : lireMessage((await r.json()) as ReponseOpenAI)
      } catch (e) {
        throw coupure() ?? e
      }
    } finally {
      clearTimeout(minuteur)
      signal?.removeEventListener('abort', arreter)
    }
  }
}
