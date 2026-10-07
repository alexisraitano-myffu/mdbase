import type { DepotEspace } from '../depot-espace'
import type { AppelOutil, MessageIA, ModeleIA, RequeteIA } from './modele'
import { CONSIGNE_INBOX, decrireInbox, DOCUMENTS_LISTES, estLectureDocument, lireDocuments, OUTILS_DOCUMENTS, OUTILS_INBOX, type ActionConnaissance, type Connaissance, type Incoherence } from './connaissance'
import { estLecture, lire, OUTILS_LECTURE } from './lecture'
import { CONSIGNE, decrireEspace, OUTILS } from './outils'
import { ErreurProposition, validerAppel, type ActionMemoire, type AppelValide, type Operation, type Plan, type SkillPropose } from './plan'
import { Brouillon, type ActionStructure, type ActionSuite } from './structure'

// Une demande à l'assistant (spec §12, « Module IA »), dans une conversation
// dont les derniers échanges sont relus par le modèle. Le modèle peut d'abord
// lire (lignes, pages) sur plusieurs tours, en voyant chaque résultat ; puis
// ses appels de modification sont validés, avec deux relances si le cœur en
// refuse ou si la réponse est coupée. Le plan n'est jamais appliqué ici.

export type Proposition = (
  | { type: 'plan'; plan: Plan; /** Texte d'accompagnement éventuel (outil `repondre`). */ message: string }
  | { type: 'reponse'; texte: string }
) & {
  /** À écrire aussitôt dans la mémoire, avec une mention annulable : pas de confirmation. */
  memoire: ActionMemoire[]
  /**
   * Ce que le modèle a fait pendant la demande, après elle : ses lectures et leurs
   * résultats, puis sa réponse finale (appels compris). Rejoué aux demandes
   * suivantes : il retrouve ce qu'il a lu et les lignes exactes qu'il a visées.
   */
  deroule?: MessageIA[]
}

/** Un échange passé de la conversation, tel que le modèle le relit : la demande et ce qui en est résulté. */
/**
 * Un échange passé. `deroule` (s'il est connu) le rejoue tel quel ; `suite` dit
 * ce que l'utilisateur a fait des appels de la réponse finale (appliqué, annulé).
 */
export type Echange = { demande: string; reponse: string; deroule?: readonly MessageIA[]; suite?: string }

export type OptionsDemande = {
  aujourdhui: string
  baseOuverte: string | null
  /** Bases citées avec `@` : leurs lignes accompagnent la demande. */
  basesCitees?: readonly string[]
  /** Skill choisi avec `/` : le modèle est prié de l'appliquer. */
  skill?: string
  /** Échanges précédents, du plus ancien au plus récent ; seuls les derniers sont renvoyés. */
  historique?: readonly Echange[]
  /** Transmis au modèle : arrêt par l'utilisateur, et réponse suivie au fil de l'eau. */
  signal?: RequeteIA['signal']
  progression?: RequeteIA['progression']
  /** Traiter l'inbox (spec §18) : ses éléments accompagnent la demande. */
  inbox?: boolean
}

/** Échanges renvoyés au modèle : assez pour suivre une conversation, sans alourdir chaque demande. */
export const ECHANGES_MAX = 10
/** Échanges récents rejoués en entier (lectures comprises) ; les plus anciens, en texte seulement. */
export const ECHANGES_DETAILLES = 4
/** Un résultat de lecture rejoué est coupé au-delà : relire coûte moins que tout renvoyer. */
const LECTURE_REJOUEE_MAX = 6000

/** Messages d'un échange passé, tel que le modèle le relit. */
function rejouer(e: Echange, detaille: boolean): MessageIA[] {
  if (!detaille || !e.deroule?.length) return [{ role: 'user', contenu: e.demande }, { role: 'assistant', contenu: e.reponse, appels: [] }]
  const messages: MessageIA[] = [
    { role: 'user', contenu: e.demande },
    ...e.deroule.map((m): MessageIA => (m.role === 'tool' && m.contenu.length > LECTURE_REJOUEE_MAX ? { ...m, contenu: `${m.contenu.slice(0, LECTURE_REJOUEE_MAX)}\n[… coupé]` } : m)),
  ]
  // Les appels de la réponse finale attendent leur résultat : ce que l'utilisateur en a fait.
  const derniere = e.deroule.at(-1)
  if (derniere?.role === 'assistant') for (const a of derniere.appels) messages.push({ role: 'tool', idAppel: a.id, contenu: e.suite ?? 'Proposé.' })
  return messages
}

/** Relances après un refus ou une réponse coupée ; au-delà, ce qui est valide est gardé. */
const RELANCES = 2
/** Tours où le modèle lit des lignes ou des pages avant de proposer. */
export const LECTURES_MAX = 8


/** Certains modèles écrivent leur raisonnement entre balises `<think>` : il n'est pas montré. */
export const sansReflexion = (texte: string) => texte.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim()

/** Demande telle que le modèle la lit, skill choisi compris : aussi ce que relit l'historique. */
export const avecSkill = (demande: string, skill?: string) => (skill ? `Applique le skill « ${skill} ».${demande ? `\n${demande}` : ''}` : demande)

/**
 * Le contexte de l'utilisateur et la liste des documents (spec §18), en tête du
 * message système : ils changent rarement, le début du message reste le même.
 */
function decrireConnaissance(c: Connaissance): string {
  const parties: string[] = []
  if (c.contexte) parties.push("## Contexte (écrit par l'utilisateur : son organisation, ses règles ; il prime sur tes suppositions)", c.contexte)
  const actifs = c.documents.filter((d) => !d.remplacePar)
  if (actifs.length > 0) {
    parties.push(
      '## Documents',
      `${actifs.length} document${actifs.length > 1 ? 's' : ''} à jour (id | date | titre)${actifs.length > DOCUMENTS_LISTES ? `, les ${DOCUMENTS_LISTES} plus récents` : ''}. Cherches-y avec \`chercher_documents\` dès que la demande touche à ce qu'ils racontent ; cite le document et sa date.`,
      ...actifs.slice(0, DOCUMENTS_LISTES).map((d) => `${d.id} | ${d.date} | ${d.titre}`),
    )
  }
  return parties.join('\n')
}

export async function proposer(modele: ModeleIA, espace: DepotEspace, demande: string, o: OptionsDemande): Promise<Proposition> {
  const assistant = await espace.assistant.lire()
  const connaissance = assistant.connaissance ?? { contexte: '', documents: [], inbox: [] }
  const contexte = decrireEspace(espace.etat(), { ...o, candidats: espace.candidats(demande), memoire: assistant.memoire, skills: assistant.skills })
  const savoir = decrireConnaissance(connaissance)
  const inbox = o.inbox ? connaissance.inbox : []
  const outils = [...OUTILS_LECTURE, ...(connaissance.documents.length > 0 ? OUTILS_DOCUMENTS : []), ...OUTILS, ...(inbox.length > 0 ? OUTILS_INBOX : [])]
  const messages: MessageIA[] = [
    { role: 'system', contenu: [CONSIGNE, savoir, contexte].filter(Boolean).join('\n\n') },
    ...(o.historique ?? []).slice(-ECHANGES_MAX).flatMap((e, i, liste) => rejouer(e, i >= liste.length - ECHANGES_DETAILLES)),
    { role: 'user', contenu: inbox.length > 0 ? `${avecSkill(demande, o.skill)}\n\n${CONSIGNE_INBOX}\n\n## Inbox\n${decrireInbox(inbox)}` : avecSkill(demande, o.skill) },
  ]
  const debut = messages.length
  /** Le déroulé de cette demande : ses lectures et leurs résultats, sans les relances (consignes et réponses coupées). */
  const deroule = (fin: MessageIA) => [...messages.slice(debut).filter((m) => m.role === 'tool' || (m.role === 'assistant' && m.appels.length > 0)), fin]
  let relances = 0
  let lectures = 0
  // Appels d'une proposition de structure seule, gardés pendant le tour donné au modèle pour enchaîner les lignes.
  let acquis: AppelOutil[] = []
  for (;;) {
    const reponse = await modele({ messages, outils, signal: o.signal, progression: o.progression })
    // Réponse coupée par le service : ses derniers appels sont incomplets, on la redemande plus courte.
    if (reponse.coupee && relances < RELANCES) {
      relances++
      messages.push({ role: 'assistant', contenu: reponse.texte, appels: [] })
      messages.push({ role: 'user', contenu: 'Ta réponse a été coupée : trop longue. Rien n’a été appliqué. Renvoie-la en plus court : moins de texte, des appels groupés (plusieurs lignes par appel, des filtres plutôt que des listes d’ids).' })
      continue
    }
    const estLu = (a: AppelOutil) => estLecture(a) || estLectureDocument(a)
    const aLire = reponse.appels.filter(estLu)
    if (aLire.length > 0 && lectures < LECTURES_MAX) {
      lectures++
      // L'état est relu à chaque tour : les lectures voient l'espace tel qu'il est.
      const etat = espace.etat()
      messages.push({ role: 'assistant', contenu: reponse.texte, appels: reponse.appels })
      for (const appel of reponse.appels) {
        messages.push({
          role: 'tool',
          idAppel: appel.id,
          contenu: estLecture(appel)
            ? lire(etat, appel, { aujourdhui: o.aujourdhui })
            : estLectureDocument(appel)
              ? lireDocuments(connaissance.documents, appel)
              : 'Pas retenu : propose les modifications dans une réponse sans lecture, une fois tes lectures finies.',
        })
      }
      continue
    }
    const nouveaux = reponse.appels.filter((a) => !estLu(a))
    const appels = [...acquis, ...nouveaux]
    if (appels.length === 0) {
      const texte = sansReflexion(reponse.texte)
      const fin = reponse.coupee ? 'Réponse coupée par le service, même après relance : redemande en plus petit.' : aLire.length > 0 ? 'Limite de lectures atteinte avant une réponse : précise la demande.' : 'Le modèle n’a rien proposé.'
      return { type: 'reponse', texte: texte || fin, memoire: [], deroule: deroule({ role: 'assistant', contenu: texte || fin, appels: [] }) }
    }
    // L'état est relu à chaque essai : il a pu changer pendant l'appel. Les appels
    // se valident dans l'ordre sur un brouillon : une colonne créée peut être remplie ensuite.
    const brouillon = new Brouillon(espace.etat())
    const resultats = appels.map((appel): AppelValide | ErreurProposition => {
      try {
        return validerAppel(brouillon, appel, { aujourdhui: o.aujourdhui }, assistant)
      } catch (e) {
        if (e instanceof ErreurProposition) return e
        throw e
      }
    })
    const erreurs = resultats.filter((r): r is ErreurProposition => r instanceof ErreurProposition)
    if (erreurs.length > 0 && relances < RELANCES) {
      relances++
      messages.push({ role: 'assistant', contenu: reponse.texte, appels: nouveaux })
      nouveaux.forEach((appel, i) => {
        const r = resultats[acquis.length + i]!
        messages.push({ role: 'tool', idAppel: appel.id, contenu: r instanceof ErreurProposition ? `Erreur : ${r.message}.` : 'Valide.' })
      })
      const ceux = acquis.length > 0 ? 'tous les appels de ta dernière réponse (la structure notée avant reste)' : 'tous les appels'
      messages.push({ role: 'user', contenu: `Rien n’a été appliqué. Corrige et renvoie ${ceux}, y compris ceux qui étaient valides.` })
      continue
    }
    const valides = resultats.filter((r): r is AppelValide => !(r instanceof ErreurProposition))
    if (valides.length === 0) throw new ErreurProposition(`Proposition refusée : ${erreurs.map((e) => e.message).join(' ; ')}`)
    // Après les relances, ce qui reste refusé est signalé ; le reste est proposé quand même.
    const refus = erreurs.length > 0 ? `Non retenu (refusé après ${RELANCES} relances) : ${erreurs.map((e) => e.message).join(' ; ')}.` : ''
    const coupe = reponse.coupee ? 'Réponse coupée par le service : la fin de la demande manque peut-être.' : ''
    const operations = valides.flatMap((r): Operation[] => (r.type === 'operation' && r.operation.lignes.length > 0 ? [r.operation] : []))
    const skills = valides.flatMap((r): SkillPropose[] => (r.type === 'skill' ? [r.skill] : []))
    const structure = valides.flatMap((r): ActionStructure[] => (r.type === 'structure' ? r.actions : []))
    const suite = valides.flatMap((r): ActionSuite[] => (r.type === 'suite' ? [r.action] : []))
    const memoire = valides.flatMap((r): ActionMemoire[] => (r.type === 'memoire' ? [r.action] : []))
    const rangement = valides.flatMap((r): ActionConnaissance[] => (r.type === 'connaissance' ? [r.action] : []))
    const incoherences = valides.flatMap((r): Incoherence[] => (r.type === 'incoherence' ? [r.incoherence] : []))
    // Le texte écrit à côté des appels a été montré au fil de l'eau : il reste, à défaut d'une réponse explicite.
    const texte = valides.flatMap((r) => (r.type === 'reponse' && r.texte ? [r.texte] : [])).join('\n') || sansReflexion(reponse.texte)
    const message = [texte, refus, coupe].filter(Boolean).join('\n\n')
    // Structure seule : le modèle s'arrête souvent là en croyant voir le résultat, avant les lignes
    // à créer ou modifier. Un tour de plus pour les envoyer ; la structure notée est gardée.
    if (acquis.length === 0 && erreurs.length === 0 && structure.length > 0 && operations.length === 0 && suite.length === 0) {
      acquis = appels
      messages.push({ role: 'assistant', contenu: reponse.texte, appels: nouveaux })
      for (const appel of nouveaux) messages.push({ role: 'tool', idAppel: appel.id, contenu: 'Noté (rien n’est encore appliqué).' })
      messages.push({
        role: 'user',
        contenu: 'Structure notée. Si la demande comporte aussi des lignes à créer, modifier ou relier, envoie maintenant ces appels seulement (désigne une base nouvelle par son nom, une ligne nouvelle par son titre). Sinon, réponds sans appel.',
      })
      continue
    }
    if (operations.length > 0 || skills.length > 0 || structure.length > 0 || suite.length > 0 || rangement.length > 0 || incoherences.length > 0) {
      // Seuls les appels retenus sont rejoués : ce sont eux que l'utilisateur a vus.
      const retenus = nouveaux.filter((_, i) => !(resultats[acquis.length + i] instanceof ErreurProposition))
      const plan: Plan = { structure, operations, suite, skills, ...(rangement.length > 0 ? { connaissance: rangement } : {}), ...(incoherences.length > 0 ? { incoherences } : {}) }
      return { type: 'plan', plan, message, memoire, deroule: deroule({ role: 'assistant', contenu: reponse.texte, appels: retenus }) }
    }
    const aucunChangement = valides.some((r) => r.type === 'operation')
    const vide = memoire.length > 0 ? '' : aucunChangement ? 'Rien à changer : les valeurs sont déjà celles demandées.' : 'Le modèle n’a rien proposé.'
    return { type: 'reponse', texte: message || vide, memoire, deroule: deroule({ role: 'assistant', contenu: message || vide, appels: [] }) }
  }
}
