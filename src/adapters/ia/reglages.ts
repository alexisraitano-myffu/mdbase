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
  type: 'reponse' | 'plan' | 'erreur'
  /** Réponse, résumé du plan ou message d'erreur. */
  texte: string
  statut?: 'applique' | 'annule'
}

/** Tours gardés par dossier : assez pour reprendre une conversation, peu de place. */
const TOURS_GARDES = 30
const cleConversation = (dossier: string) => `mdbase.ia.conversation.${dossier}`

export function lireConversation(dossier: string): TourGarde[] {
  try {
    const brut = JSON.parse(localStorage.getItem(cleConversation(dossier)) ?? '[]') as unknown
    if (!Array.isArray(brut)) return []
    return brut.filter(
      (t): t is TourGarde =>
        typeof t === 'object' && t !== null && typeof t.demande === 'string' && typeof t.texte === 'string' && ['reponse', 'plan', 'erreur'].includes(t.type),
    )
  } catch {
    return []
  }
}

export function enregistrerConversation(dossier: string, tours: readonly TourGarde[]): void {
  try {
    if (tours.length === 0) localStorage.removeItem(cleConversation(dossier))
    else localStorage.setItem(cleConversation(dossier), JSON.stringify(tours.slice(-TOURS_GARDES)))
  } catch {
    // stockage indisponible : la conversation vit le temps de la session
  }
}
