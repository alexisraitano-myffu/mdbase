import type { DepotEspace } from '../depot-espace'
import type { MessageIA, ModeleIA } from './modele'
import { CONSIGNE, decrireEspace, OUTILS } from './outils'
import { ErreurProposition, validerAppel, type ActionMemoire, type AppelValide, type Operation, type Plan, type SkillPropose } from './plan'
import { Brouillon, type ActionStructure, type ActionSuite } from './structure'

// Une demande à l'assistant (spec §12, « Module IA »), dans une conversation
// dont les derniers échanges sont relus par le modèle : un appel au modèle,
// validation de ses appels d'outils, et une seule relance si le cœur en refuse
// un (le modèle reçoit l'erreur et corrige). Le plan n'est jamais appliqué ici.

export type Proposition = (
  | { type: 'plan'; plan: Plan; /** Texte d'accompagnement éventuel (outil `repondre`). */ message: string }
  | { type: 'reponse'; texte: string }
) & {
  /** À écrire aussitôt dans la mémoire, avec une mention annulable : pas de confirmation. */
  memoire: ActionMemoire[]
}

/** Un échange passé de la conversation, tel que le modèle le relit : la demande et ce qui en est résulté. */
export type Echange = { demande: string; reponse: string }

export type OptionsDemande = {
  aujourdhui: string
  baseOuverte: string | null
  /** Échanges précédents, du plus ancien au plus récent ; seuls les derniers sont renvoyés. */
  historique?: readonly Echange[]
}

/** Échanges renvoyés au modèle : assez pour suivre une conversation, sans alourdir chaque demande. */
export const ECHANGES_MAX = 10

const RELANCES = 1

/** Certains modèles écrivent leur raisonnement entre balises `<think>` : il n'est pas montré. */
const sansReflexion = (texte: string) => texte.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()

export async function proposer(modele: ModeleIA, espace: DepotEspace, demande: string, o: OptionsDemande): Promise<Proposition> {
  const assistant = await espace.assistant.lire()
  const contexte = decrireEspace(espace.etat(), { ...o, candidats: espace.candidats(demande), memoire: assistant.memoire, skills: assistant.skills })
  const messages: MessageIA[] = [
    { role: 'system', contenu: `${CONSIGNE}\n\n${contexte}` },
    ...(o.historique ?? []).slice(-ECHANGES_MAX).flatMap((e): MessageIA[] => [
      { role: 'user', contenu: e.demande },
      { role: 'assistant', contenu: e.reponse, appels: [] },
    ]),
    { role: 'user', contenu: demande },
  ]
  for (let essai = 0; ; essai++) {
    const reponse = await modele({ messages, outils: OUTILS })
    if (reponse.appels.length === 0) {
      return { type: 'reponse', texte: sansReflexion(reponse.texte) || 'Le modèle n’a rien proposé.', memoire: [] }
    }
    // L'état est relu à chaque essai : il a pu changer pendant l'appel. Les appels
    // se valident dans l'ordre sur un brouillon : une colonne créée peut être remplie ensuite.
    const brouillon = new Brouillon(espace.etat())
    const resultats = reponse.appels.map((appel): AppelValide | ErreurProposition => {
      try {
        return validerAppel(brouillon, appel, { aujourdhui: o.aujourdhui }, assistant)
      } catch (e) {
        if (e instanceof ErreurProposition) return e
        throw e
      }
    })
    const erreurs = resultats.filter((r): r is ErreurProposition => r instanceof ErreurProposition)
    if (erreurs.length === 0) {
      const valides = resultats as AppelValide[]
      const operations = valides.flatMap((r): Operation[] => (r.type === 'operation' && r.operation.lignes.length > 0 ? [r.operation] : []))
      const skills = valides.flatMap((r): SkillPropose[] => (r.type === 'skill' ? [r.skill] : []))
      const structure = valides.flatMap((r): ActionStructure[] => (r.type === 'structure' ? r.actions : []))
      const suite = valides.flatMap((r): ActionSuite[] => (r.type === 'suite' ? [r.action] : []))
      const memoire = valides.flatMap((r): ActionMemoire[] => (r.type === 'memoire' ? [r.action] : []))
      const message = valides.flatMap((r) => (r.type === 'reponse' && r.texte ? [r.texte] : [])).join('\n')
      if (operations.length > 0 || skills.length > 0 || structure.length > 0 || suite.length > 0) {
        return { type: 'plan', plan: { structure, operations, suite, skills }, message, memoire }
      }
      const aucunChangement = valides.some((r) => r.type === 'operation')
      const vide = memoire.length > 0 ? '' : aucunChangement ? 'Rien à changer : les valeurs sont déjà celles demandées.' : 'Le modèle n’a rien proposé.'
      return { type: 'reponse', texte: message || vide, memoire }
    }
    if (essai >= RELANCES) throw new ErreurProposition(`Proposition refusée : ${erreurs.map((e) => e.message).join(' ; ')}`)
    messages.push({ role: 'assistant', contenu: reponse.texte, appels: reponse.appels })
    reponse.appels.forEach((appel, i) => {
      const r = resultats[i]!
      messages.push({ role: 'tool', idAppel: appel.id, contenu: r instanceof ErreurProposition ? `Erreur : ${r.message}.` : 'Valide.' })
    })
    messages.push({ role: 'user', contenu: 'Rien n’a été appliqué. Corrige et renvoie tous les appels, y compris ceux qui étaient valides.' })
  }
}
