import type { DepotEspace } from '../depot-espace'
import { estLecture, lire, OUTILS_LECTURE } from './lecture'
import type { DefinitionOutil } from './modele'
import { decrireEspace, OUTILS } from './outils'
import { appliquerPlan, ErreurProposition, resumerPlan, validerAppel, type Plan } from './plan'

// Serveur MCP de mdbase : les outils de l'assistant (spec §12) exposés à un
// client MCP (Claude Desktop…). Mêmes contrôles que dans l'app ; chaque appel
// d'écriture s'applique aussitôt, le client demandant l'accord avant l'appel.

/** Propres à la conversation dans l'app : le client MCP a sa propre réponse et sa propre mémoire. */
const PROPRES_A_L_APP = new Set(['repondre', 'retenir', 'oublier', 'creer_skill'])

export const INSTRUCTIONS = `mdbase : bases de données de l'utilisateur, stockées dans un dossier de fichiers Markdown + YAML.
- Commence par \`decrire_espace\` : bases, colonnes (clés, types, options), vues, et les lignes (ou un extrait s'il y en a beaucoup).
- Lis avant d'agir : \`chercher_lignes\` (filtres, valeurs complètes), \`chercher_texte\` (un mot dans les valeurs et les pages), \`lire_page\`.
- Utilise exactement les ids de bases, les clés de colonnes et les ids de lignes lus. N'invente jamais un id ni une colonne.
- Colonne à choix : le libellé exact d'une option existante ; pour une valeur nouvelle, ajoute d'abord l'option avec \`ajouter_options\` (avec sa couleur si tu veux, qui sert aussi à recolorer une option). Relation : ids des lignes liées, ou leurs titres. Dates AAAA-MM-JJ. null vide un champ. Les colonnes calculées sont en lecture seule.
- Pour modifier toutes les lignes qui répondent à un critère, utilise \`filtres\` plutôt qu'une liste d'ids.
- Chaque appel d'écriture est appliqué aussitôt dans les fichiers.
- Une base synchronisée depuis Jira est en lecture seule.
- Suppressions (lignes, colonnes, vues, dashboards, bases) : seulement sur demande explicite de l'utilisateur.`

const DECRIRE: DefinitionOutil = {
  nom: 'decrire_espace',
  description: "Décrit l'espace : bases et leurs colonnes (clés, types, options), vues, dashboards, calendrier de la semaine, et les lignes (un extrait au-delà de 150).",
  parametres: { type: 'object', properties: {} },
}

const DESTRUCTEURS = new Set(['supprimer_lignes', 'supprimer_colonne', 'retirer_option', 'supprimer_vue', 'supprimer_dashboard', 'supprimer_base'])

export type OutilMcp = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean }
}

/** Les descriptions de l'app parlent des lignes listées « plus bas », dans son message : ici, c'est `decrire_espace`. */
const pourMcp = (d: string) => d.replace(/les lignes listées plus bas/g, 'les lignes de `decrire_espace`')

export function outilsMcp(): OutilMcp[] {
  const lecture = [DECRIRE, ...OUTILS_LECTURE].map((o) => ({ name: o.nom, description: pourMcp(o.description), inputSchema: o.parametres, annotations: { readOnlyHint: true } }))
  const ecriture = OUTILS.filter((o) => !PROPRES_A_L_APP.has(o.nom)).map((o) => ({
    name: o.nom,
    description: o.description,
    inputSchema: o.parametres,
    annotations: { readOnlyHint: false, destructiveHint: DESTRUCTEURS.has(o.nom) },
  }))
  return [...lecture, ...ecriture]
}

export type Resultat = { texte: string; erreur?: true }

/**
 * Exécute un appel d'outil. L'espace est relu d'abord : l'app ou un autre
 * outil a pu changer les fichiers depuis l'appel précédent.
 */
export async function executer(espace: DepotEspace, nom: string, args: unknown, aujourdhui: string): Promise<Resultat> {
  const ctx = { aujourdhui }
  await espace.rafraichir()
  if (nom === DECRIRE.nom) return { texte: decrireEspace(espace.etat(), { aujourdhui, baseOuverte: null, candidats: [] }) }
  const appel = { id: nom, nom, arguments: JSON.stringify(args ?? {}) }
  if (estLecture(appel)) return { texte: lire(espace.etat(), appel, ctx) }
  if (PROPRES_A_L_APP.has(nom) || !OUTILS.some((o) => o.nom === nom)) return { texte: `Outil inconnu : ${nom}`, erreur: true }

  let plan: Plan
  try {
    const r = validerAppel(espace.etat(), appel, ctx)
    if (r.type === 'operation') {
      if (r.operation.lignes.length === 0) return { texte: 'Rien à changer : les valeurs sont déjà celles demandées.' }
      plan = { operations: [r.operation] }
    } else if (r.type === 'structure') plan = { structure: r.actions, operations: [] }
    else if (r.type === 'suite') plan = { operations: [], suite: [r.action] }
    else return { texte: `Outil inconnu : ${nom}`, erreur: true }
  } catch (e) {
    if (e instanceof ErreurProposition) return { texte: `Refusé, rien n'a été écrit : ${e.message}`, erreur: true }
    throw e
  }

  const avant = idsDesLignes(espace)
  await appliquerPlan(espace, plan)
  // Les écritures de lignes sont regroupées par fichier : tout est sur le disque avant de répondre.
  await espace.vider()
  const creees = [...idsDesLignes(espace)].filter(([cle]) => !avant.has(cle)).map(([, l]) => `${l.base} | ${l.id} | ${l.titre}`)
  return { texte: [`Fait : ${resumerPlan(plan)}`, ...(creees.length > 0 ? ['Lignes créées (base | id | titre) :', ...creees] : [])].join('\n') }
}

function idsDesLignes(espace: DepotEspace): Map<string, { base: string; id: string; titre: string }> {
  const etat = espace.etat()
  const ids = new Map<string, { base: string; id: string; titre: string }>()
  for (const b of etat.bases.values()) {
    for (const l of b.depot?.lignes() ?? []) ids.set(`${b.id}/${l.id}`, { base: b.id, id: l.id, titre: etat.titres.get(b.id)?.get(l.id) ?? l.id })
  }
  return ids
}

// ── Protocole (JSON-RPC) pour l'app de bureau ─────────────────────────
// Le serveur Node passe par le SDK MCP ; l'app de bureau reçoit les messages
// bruts relayés par `mdbase --mcp` et y répond ici, sans dépendance.

const VERSIONS_PROTOCOLE = ['2025-06-18', '2025-03-26', '2024-11-05']

type Requete = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/**
 * Répond aux messages d'un client MCP sur l'espace ouvert. Renvoie le texte de la réponse,
 * ou `null` pour une notification (rien à renvoyer). Les appels d'outils passent un par un.
 */
export function serveurMcp(espace: DepotEspace, o: { version: string; aujourdhui: () => string }): (message: string) => Promise<string | null> {
  let file: Promise<unknown> = Promise.resolve()
  const enFile = <T>(f: () => Promise<T>): Promise<T> => {
    const suite = file.then(f)
    file = suite.catch(() => {})
    return suite
  }
  return async (message) => {
    let r: Requete
    try {
      r = JSON.parse(message) as Requete
    } catch {
      return JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible' } })
    }
    if (r.id === undefined || r.id === null) return null // notification
    const repondre = (result: unknown) => JSON.stringify({ jsonrpc: '2.0', id: r.id, result })
    const echec = (code: number, texte: string) => JSON.stringify({ jsonrpc: '2.0', id: r.id, error: { code, message: texte } })
    switch (r.method) {
      case 'initialize': {
        const demandee = typeof r.params?.protocolVersion === 'string' ? r.params.protocolVersion : ''
        return repondre({
          protocolVersion: VERSIONS_PROTOCOLE.includes(demandee) ? demandee : VERSIONS_PROTOCOLE[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'mdbase', version: o.version },
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return repondre({})
      case 'tools/list':
        return repondre({ tools: outilsMcp() })
      case 'tools/call': {
        const nom = typeof r.params?.name === 'string' ? r.params.name : ''
        try {
          const res = await enFile(() => executer(espace, nom, r.params?.arguments, o.aujourdhui()))
          return repondre({ content: [{ type: 'text', text: res.texte }], isError: res.erreur ?? false })
        } catch (e) {
          return repondre({ content: [{ type: 'text', text: `Erreur : ${e instanceof Error ? e.message : String(e)}` }], isError: true })
        }
      }
      default:
        return echec(-32601, `Méthode inconnue : ${String(r.method)}`)
    }
  }
}
