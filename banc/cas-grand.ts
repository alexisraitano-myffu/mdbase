import type { Proposition } from '../src/core/ia/assistant'
import type { Cas } from './cas'
import { AUJOURDHUI, espaceGrand, type Action, type Ticket } from './espace-grand'

// Cas du jeu « grand » (240 tickets Jira, 120 actions) : ce qui manquait au
// banc de départ. Des recherches dont la réponse est longue et doit être
// complète, des comptes, des sujets écrits seulement dans les descriptions, et
// des modifications en lot ou en plusieurs étapes. Les réponses attendues sont
// calculées sur les données générées, jamais écrites à la main.

const { tickets, actions, suivi } = espaceGrand()
const CLE_TICKET = /\b(?:PRVE|OPS|DATA)-\d+\b/g

/** Texte lisible d'une proposition : la réponse, ou le message qui accompagne un plan. */
function texteDe(p: Proposition): string {
  return p.type === 'reponse' ? p.texte : p.message
}

/**
 * Réponse qui cite exactement ces tickets : tous (rien d'oublié) et aucun
 * autre (rien d'inventé). Aucun plan : c'est une question.
 */
function citeTickets(attendus: readonly Ticket[]) {
  const voulus = new Set(attendus.map((t) => t.cle))
  return (p: Proposition): string | null => {
    if (p.type === 'plan') return `question : aucun plan attendu (${p.plan.operations.length} opérations)`
    const cites = new Set(texteDe(p).match(CLE_TICKET) ?? [])
    const oublies = [...voulus].filter((c) => !cites.has(c))
    const enTrop = [...cites].filter((c) => !voulus.has(c))
    if (oublies.length === 0 && enTrop.length === 0) return null
    return `${voulus.size} attendus : ${oublies.length} oubliés${oublies.length ? ` (${oublies.slice(0, 6).join(', ')}${oublies.length > 6 ? '…' : ''})` : ''}, ${enTrop.length} en trop${enTrop.length ? ` (${enTrop.slice(0, 6).join(', ')})` : ''}`
  }
}

/** Réponse qui donne ce nombre (en chiffres), sans plan. */
function donneNombre(n: number) {
  return (p: Proposition): string | null => {
    if (p.type === 'plan') return 'question : aucun plan attendu'
    return new RegExp(`(^|[^\\d])${n}([^\\d]|$)`).test(texteDe(p)) ? null : `${n} attendu, reçu : ${texteDe(p).slice(0, 160)}`
  }
}

/** Réponse qui contient ce texte (sans casse), sans plan. */
function contient(motif: RegExp) {
  return (p: Proposition): string | null => {
    if (p.type === 'plan') return 'question : aucun plan attendu'
    return motif.test(texteDe(p)) ? null : `${motif} attendu, reçu : ${texteDe(p).slice(0, 160)}`
  }
}

/** Modification des actions : exactement ces lignes, chacune avec ces valeurs. */
function modifieActions(visees: readonly Action[], valeurs: Record<string, unknown>) {
  // Une ligne qui a déjà ces valeurs n'est pas dans le plan : rien n'y change.
  const voulus = new Set(visees.filter((a) => Object.entries(valeurs).some(([cle, v]) => (a as Record<string, unknown>)[cle] !== v)).map((a) => a.id))
  return (p: Proposition): string | null => {
    if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
    const ops = p.plan.operations.filter((o) => o.type === 'modifier' && o.base === 'actions')
    if (ops.length !== p.plan.operations.length) return `opérations en trop : ${p.plan.operations.map((o) => `${o.type} ${o.base}`).join(', ')}`
    const lignes = ops.flatMap((o) => o.lignes)
    const ids = new Set(lignes.map((l) => l.id!))
    const oublies = [...voulus].filter((id) => !ids.has(id))
    const enTrop = [...ids].filter((id) => !voulus.has(id))
    if (oublies.length || enTrop.length) return `${voulus.size} lignes attendues : ${oublies.length} oubliées, ${enTrop.length} en trop`
    for (const l of lignes) {
      for (const [cle, v] of Object.entries(valeurs)) {
        if (JSON.stringify(l.valeurs[cle] ?? null) !== JSON.stringify(v)) return `${l.id}.${cle} = ${JSON.stringify(l.valeurs[cle])} au lieu de ${JSON.stringify(v)}`
      }
    }
    return null
  }
}

/** Création d'actions : une par ticket attendu, la clé du ticket dans `ticket`, avec ces valeurs. */
function creeActionsPour(attendus: readonly Ticket[], valeurs: Record<string, unknown>) {
  return (p: Proposition): string | null => {
    if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
    const lignes = p.plan.operations.filter((o) => o.type === 'creer' && o.base === 'actions').flatMap((o) => o.lignes)
    const autres = p.plan.operations.filter((o) => !(o.type === 'creer' && o.base === 'actions'))
    if (autres.length) return `opérations en trop : ${autres.map((o) => `${o.type} ${o.base}`).join(', ')}`
    const recus = lignes.map((l) => String(l.valeurs.ticket ?? l.valeurs.titre ?? ''))
    const oublies = attendus.filter((t) => !recus.some((r) => r.includes(t.cle)))
    if (lignes.length !== attendus.length || oublies.length) return `${attendus.length} actions attendues, ${lignes.length} créées, ${oublies.length} tickets oubliés`
    for (const l of lignes) {
      for (const [cle, v] of Object.entries(valeurs)) {
        if (JSON.stringify(l.valeurs[cle] ?? null) !== JSON.stringify(v)) return `${cle} = ${JSON.stringify(l.valeurs[cle])} au lieu de ${JSON.stringify(v)}`
      }
    }
    return null
  }
}

const lundi = '2026-09-21'
const vendrediProchain = '2026-10-02'
const ouverts = (t: Ticket) => t.statut !== 'Terminé'
const compter = <T>(l: readonly T[], f: (x: T) => boolean) => l.filter(f).length
const parPersonne = (statut: string) => {
  const n = new Map<string, number>()
  for (const t of tickets) if (t.statut === statut && t.assigne) n.set(t.assigne, (n.get(t.assigne) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])
}
const premierEnCours = parPersonne('En cours')
const ticketSalesforce = tickets.filter((t) => t.sujet === 'salesforce')
const ticketDecrit = tickets.find((t) => t.sujet === 'latence')!

export const CAS_GRAND: Cas[] = [
  // ── Recherches : tout, et rien d'autre ──
  { demande: 'Quels tickets sont bloqués ?', base: 'tickets', verifier: citeTickets(tickets.filter((t) => t.statut === 'Bloqué')) },
  {
    demande: 'Liste les tickets Prévoyance en revue assignés à Karim',
    verifier: citeTickets(tickets.filter((t) => t.projet === 'Prévoyance' && t.statut === 'En revue' && t.assigne === 'Karim Benali')),
  },
  { demande: 'Quels bugs de priorité haute ne sont pas terminés ?', verifier: citeTickets(tickets.filter((t) => t.type === 'Bug' && t.priorite === 'Haute' && ouverts(t))) },
  { demande: 'Quels tickets du Sprint 42 n’ont personne d’assigné ?', verifier: citeTickets(tickets.filter((t) => t.sprint.includes('Sprint 42') && !t.assigne)) },
  { demande: 'Quels tickets ont le label facturation et sont en cours ?', verifier: citeTickets(tickets.filter((t) => t.labels.includes('facturation') && t.statut === 'En cours')) },
  {
    demande: 'Quels tickets Opérations ont une échéance dépassée sans être terminés ?',
    verifier: citeTickets(tickets.filter((t) => t.projet === 'Opérations' && t.echeance && t.echeance < AUJOURDHUI && ouverts(t))),
  },
  { demande: 'Quels tickets Data ont bougé depuis lundi ?', verifier: citeTickets(tickets.filter((t) => t.projet === 'Data' && t.bouge >= lundi)) },
  // ── Dans les descriptions seulement ──
  { demande: 'Quels tickets parlent de SAML ?', verifier: citeTickets(tickets.filter((t) => t.sujet === 'saml')) },
  { demande: 'Dans quels tickets est-il question du connecteur Salesforce ?', verifier: citeTickets(ticketSalesforce) },
  { demande: 'Quels tickets ont un point RGPD dans leur description ?', verifier: citeTickets(tickets.filter((t) => t.labels.includes('rgpd'))) },
  { demande: `Que dit la description de ${ticketDecrit.cle} ?`, verifier: contient(/4 secondes/i) },
  // ── Comptes ──
  { demande: 'Combien de tickets Data sont terminés ?', verifier: donneNombre(compter(tickets, (t) => t.projet === 'Data' && t.statut === 'Terminé')) },
  {
    demande: 'Combien de tickets non terminés sont assignés à Léa, tous projets confondus ?',
    verifier: donneNombre(compter(tickets, (t) => t.assigne === 'Léa Martin' && ouverts(t))),
  },
  { demande: 'Qui a le plus de tickets en cours ?', verifier: contient(new RegExp(premierEnCours[0]![0].split(' ')[0]!, 'i')) },
  { demande: 'Combien y a-t-il de tickets au total dans la base Jira ?', verifier: donneNombre(tickets.length) },
  // ── Écritures en lot (base Actions) ──
  {
    demande: 'Toutes les actions de Sophie en retard et pas faites passent à Thomas',
    verifier: modifieActions(
      actions.filter((a) => a.responsable === 'Sophie Durand' && a.echeance < AUJOURDHUI && a.statut !== 'Fait'),
      { responsable: 'Thomas Petit' },
    ),
  },
  { demande: 'Marque comme faites toutes les actions du projet Site vitrine', verifier: modifieActions(actions.filter((a) => a.projet === 'psite001'), { statut: 'Fait' }) },
  {
    demande: 'Passe en cours toutes les actions à faire dont l’échéance tombe cette semaine',
    verifier: modifieActions(
      actions.filter((a) => a.statut === 'À faire' && a.echeance >= lundi && a.echeance <= '2026-09-27'),
      { statut: 'En cours' },
    ),
  },
  // ── Plusieurs étapes : lire, puis créer une ligne par résultat ──
  {
    demande: 'Pour chaque ticket bloqué de Prévoyance, crée une action « Débloquer » avec la clé du ticket dans la colonne Ticket, responsable Inès, échéance vendredi prochain',
    verifier: creeActionsPour(
      tickets.filter((t) => t.projet === 'Prévoyance' && t.statut === 'Bloqué'),
      { responsable: 'Inès Moreau', echeance: vendrediProchain },
    ),
  },
  // ── Créations en plusieurs étapes ──
  {
    demande: 'Relie chaque ligne de Suivi au ticket Jira dont la clé est dans son titre, puis crée une ligne de suivi pour chaque ticket Data bloqué qui n’en a pas encore',
    verifier: (p) => {
      if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
      const idDe = new Map(tickets.map((t) => [t.cle, t.id]))
      const modifs = p.plan.operations.filter((o) => o.type === 'modifier' && o.base === 'suivi').flatMap((o) => o.lignes)
      const reliees = new Map(modifs.map((l) => [l.id!, JSON.stringify(l.valeurs.ticket)]))
      const malReliees = suivi.filter((x) => reliees.get(x.id) !== JSON.stringify([idDe.get(x.cle)]))
      const manquants = tickets.filter((t) => t.projet === 'Data' && t.statut === 'Bloqué' && !suivi.some((x) => x.cle === t.cle))
      const creees = p.plan.operations.filter((o) => o.type === 'creer' && o.base === 'suivi').flatMap((o) => o.lignes)
      const creesPour = new Set(creees.map((l) => JSON.stringify(l.valeurs.ticket)))
      const oublies = manquants.filter((t) => !creesPour.has(JSON.stringify([t.id])))
      const autres = p.plan.operations.filter((o) => o.base !== 'suivi')
      if (malReliees.length || oublies.length || creees.length !== manquants.length || autres.length) {
        return `${suivi.length} à relier : ${malReliees.length} manquées ; ${manquants.length} à créer : ${creees.length} créées, ${oublies.length} oubliées${autres.length ? ` ; opérations hors Suivi : ${autres.map((o) => o.base).join(', ')}` : ''}`
      }
      return null
    },
  },
  {
    demande: 'Pour chaque projet, crée une action « Point d’avancement » liée au projet, responsable Léa, échéance lundi prochain',
    verifier: (p) => {
      if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
      const lignes = p.plan.operations.filter((o) => o.type === 'creer' && o.base === 'actions').flatMap((o) => o.lignes)
      const projets = lignes.map((l) => JSON.stringify(l.valeurs.projet)).sort()
      if (JSON.stringify(projets) !== JSON.stringify(['["paudi004"]', '["pbout003"]', '["pmobi002"]', '["psite001"]'])) return `projets liés : ${projets.join(', ')}`
      for (const l of lignes) if (l.valeurs.responsable !== 'Léa Martin' || l.valeurs.echeance !== '2026-09-28') return `valeurs : ${JSON.stringify(l.valeurs)}`
      return null
    },
  },
  {
    demande:
      'Crée une base Versions avec une colonne Sortie (date), ajoute les versions 2026.10 sortie le 15 octobre et 2026.11 sortie le 19 novembre, ajoute dans Actions une relation Version vers Versions, et rattache toutes les actions en cours à la 2026.10',
    verifier: (p) => {
      if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
      const s = p.plan.structure ?? []
      const base = s.find((a) => a.type === 'creer_base')
      if (!base || base.type !== 'creer_base') return 'creer_base attendu'
      const relation = s.find((a) => a.type === 'ajouter_colonne' && a.base === 'actions' && a.colonne.type === 'relation')
      if (!relation || relation.type !== 'ajouter_colonne') return 'relation Version dans Actions attendue'
      const versions = p.plan.operations.filter((o) => o.type === 'creer' && o.base === base.id).flatMap((o) => o.lignes)
      if (versions.length !== 2) return `${versions.length} versions créées`
      const enCours = actions.filter((a) => a.statut === 'En cours')
      const rattachees = p.plan.operations.filter((o) => o.type === 'modifier' && o.base === 'actions').flatMap((o) => o.lignes).filter((l) => l.valeurs[relation.cle] !== undefined)
      return rattachees.length === enCours.length ? null : `${enCours.length} actions en cours, ${rattachees.length} rattachées`
    },
  },
  // ── Base Jira : lecture seule ──
  { demande: `Passe ${tickets[0]!.cle} en terminé`, verifier: (p) => (p.type === 'plan' && p.plan.operations.length > 0 ? 'base Jira en lecture seule : rien à proposer' : null) },
  // ── Structure, puis données ──
  {
    demande:
      'Crée une base Risques avec une colonne Gravité (Faible, Moyenne, Haute), une colonne Probabilité en nombre et une relation vers les projets, puis ajoute le risque « Retard de livraison Acme », gravité Haute, probabilité 3, lié au Site vitrine',
    verifier: (p) => {
      if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
      const s = p.plan.structure ?? []
      const base = s.find((a) => a.type === 'creer_base')
      if (!base || base.type !== 'creer_base') return 'creer_base attendu'
      const colonnes = s.filter((a) => a.type === 'ajouter_colonne' && a.base === base.id)
      const types = colonnes.map((a) => (a.type === 'ajouter_colonne' ? a.colonne.type : '')).sort()
      if (JSON.stringify(types) !== JSON.stringify(['number', 'relation', 'select'])) return `colonnes : ${types.join(', ')}`
      const lignes = p.plan.operations.filter((o) => o.type === 'creer' && o.base === base.id).flatMap((o) => o.lignes)
      if (lignes.length !== 1) return `${lignes.length} lignes créées dans ${base.id}`
      const v = Object.values(lignes[0]!.valeurs).map((x) => JSON.stringify(x))
      for (const attendu of ['"Haute"', '3', '["psite001"]']) if (!v.includes(attendu)) return `valeur ${attendu} manquante : ${v.join(', ')}`
      return null
    },
  },
  {
    demande: 'Ajoute une vue kanban des actions groupée par statut',
    verifier: (p) => {
      if (p.type !== 'plan') return `plan attendu, reçu : ${texteDe(p).slice(0, 160)}`
      const vue = (p.plan.structure ?? []).find((a) => a.type === 'creer_vue')
      if (!vue || vue.type !== 'creer_vue' || vue.base !== 'actions' || vue.genre !== 'kanban') return 'vue kanban sur actions attendue'
      return vue.reglages.groupe === 'statut' ? null : `groupée par ${String(vue.reglages.groupe)}`
    },
  },
  // ── Conversation ──
  {
    avant: ['Quels tickets Data sont bloqués ?'],
    demande: 'Crée une action « Débloquer » pour chacun, avec la clé du ticket dans la colonne Ticket, responsable Karim',
    verifier: creeActionsPour(
      tickets.filter((t) => t.projet === 'Data' && t.statut === 'Bloqué'),
      { responsable: 'Karim Benali' },
    ),
  },
]
