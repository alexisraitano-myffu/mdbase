import type { Connexion } from './compatible-openai'

// Réglages de l'assistant IA, propres à ce navigateur (la clé ne quitte jamais
// la machine autrement que vers l'adresse saisie). Désactivé par défaut.

export type ReglagesIA = Connexion & { actif: boolean }

const CLE_STOCKAGE = 'mdbase.ia'
export const REGLAGES_VIDES: ReglagesIA = { actif: false, adresse: '', cle: '', modele: '' }

export function lireReglages(): ReglagesIA {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_STOCKAGE) ?? 'null') as Partial<ReglagesIA> | null
    if (!brut) return REGLAGES_VIDES
    const texte = (v: unknown) => (typeof v === 'string' ? v : '')
    return { actif: brut.actif === true, adresse: texte(brut.adresse), cle: texte(brut.cle), modele: texte(brut.modele) }
  } catch {
    return REGLAGES_VIDES
  }
}

export function enregistrerReglages(r: ReglagesIA): void {
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(r))
  } catch {
    // stockage indisponible (navigation privée stricte) : réglages gardés pour la session seulement
  }
}

/** Un tour de conversation tel qu'il est gardé : du texte seulement, un plan n'est jamais réappliqué après coup. */
export type TourGarde = {
  demande: string
  type: 'reponse' | 'plan' | 'erreur' | 'arrete'
  /** Réponse, résumé du plan, message d'erreur, ou texte reçu avant l'arrêt. */
  texte: string
  statut?: 'applique' | 'annule'
  /** Mentions « Retenu : … » / « Oublié : … » du tour. */
  memoire?: string[]
  /** Bases citées avec `@` et skill choisi avec `/`. */
  bases?: string[]
  skill?: string
}

/** Une conversation gardée ; `maj` en millisecondes depuis 1970, pour trier l'historique. */
export type ConversationGardee = { id: string; maj: number; tours: TourGarde[] }

/** Assez pour reprendre une conversation, peu de place : les plus anciennes s'effacent. */
const TOURS_GARDES = 30
const CONVERSATIONS_GARDEES = 20
const cleConversations = (dossier: string) => `mdbase.ia.conversations.${dossier}`
/** Clé d'avant l'historique : une seule conversation par dossier, reprise comme la première de la liste. */
const cleAncienne = (dossier: string) => `mdbase.ia.conversation.${dossier}`

const estTour = (t: unknown): t is TourGarde =>
  typeof t === 'object' &&
  t !== null &&
  typeof (t as TourGarde).demande === 'string' &&
  typeof (t as TourGarde).texte === 'string' &&
  ['reponse', 'plan', 'erreur', 'arrete'].includes((t as TourGarde).type)

const lireJson = (cle: string): unknown => JSON.parse(localStorage.getItem(cle) ?? 'null')

/** Conversations du dossier, la plus récente d'abord. */
export function lireConversations(dossier: string): ConversationGardee[] {
  try {
    const brut = lireJson(cleConversations(dossier))
    if (Array.isArray(brut)) {
      return brut
        .filter((c): c is ConversationGardee => typeof c === 'object' && c !== null && typeof c.id === 'string' && typeof c.maj === 'number' && Array.isArray(c.tours))
        .map((c) => ({ id: c.id, maj: c.maj, tours: c.tours.filter(estTour) }))
        .sort((a, b) => b.maj - a.maj)
    }
    const ancienne = lireJson(cleAncienne(dossier))
    return Array.isArray(ancienne) && ancienne.some(estTour) ? [{ id: 'reprise', maj: 0, tours: ancienne.filter(estTour) }] : []
  } catch {
    return []
  }
}

export function enregistrerConversations(dossier: string, conversations: readonly ConversationGardee[]): void {
  try {
    const gardees = [...conversations]
      .filter((c) => c.tours.length > 0)
      .sort((a, b) => b.maj - a.maj)
      .slice(0, CONVERSATIONS_GARDEES)
      .map((c) => ({ ...c, tours: c.tours.slice(-TOURS_GARDES) }))
    if (gardees.length === 0) localStorage.removeItem(cleConversations(dossier))
    else localStorage.setItem(cleConversations(dossier), JSON.stringify(gardees))
    localStorage.removeItem(cleAncienne(dossier))
  } catch {
    // stockage indisponible : les conversations vivent le temps de la session
  }
}
