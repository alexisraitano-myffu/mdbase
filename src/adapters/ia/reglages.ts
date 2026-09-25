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
