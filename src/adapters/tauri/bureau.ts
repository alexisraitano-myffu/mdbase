import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { FichierIntrouvable, type AdaptateurFichiers, type Entree } from '../../core/fichiers'

// App de bureau (spec §17) : les fichiers de l'espace passent par les commandes
// natives de src-tauri, sous la racine choisie, au lieu de File System Access.

/** Vrai dans la fenêtre de l'app de bureau, faux dans un navigateur. */
export const estBureau = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/** Message d'erreur d'un fichier absent (src-tauri/src/fichiers.rs). */
const INTROUVABLE = 'introuvable'

async function appeler<T>(commande: string, chemin: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(commande, args)
  } catch (e) {
    if (e === INTROUVABLE) throw new FichierIntrouvable(chemin)
    throw new Error(String(e))
  }
}

export class AdaptateurBureau implements AdaptateurFichiers {
  async lister(dossier: string): Promise<Entree[]> {
    const entrees = await appeler<Entree[]>('lister', dossier, { dossier })
    return entrees.sort((a, b) => a.nom.localeCompare(b.nom))
  }
  lire(chemin: string): Promise<string> {
    return appeler('lire', chemin, { chemin })
  }
  ecrire(chemin: string, contenu: string): Promise<void> {
    return appeler('ecrire', chemin, { chemin, contenu })
  }
  renommer(ancien: string, nouveau: string): Promise<void> {
    return appeler('renommer', ancien, { ancien, nouveau })
  }
  supprimer(chemin: string): Promise<void> {
    return appeler('supprimer', chemin, { chemin })
  }
  dateModification(chemin: string): Promise<number> {
    return appeler('date_modification', chemin, { chemin })
  }
}

/** Le dernier espace ouvert (chemin complet), déjà ouvert côté natif ; `null` s'il n'y en a pas. */
export const dossierMemorise = (): Promise<string | null> => invoke('dossier_memorise')

/** Fenêtre du système pour choisir le dossier ; `null` si elle est fermée. */
export const choisirDossierBureau = (): Promise<string | null> => invoke('choisir_dossier')

/** Nom affiché d'un dossier : son dernier segment, sous Windows comme ailleurs. */
export const nomDossier = (chemin: string): string => chemin.split(/[\\/]/).filter(Boolean).pop() ?? chemin

/** Prévient quand un fichier de l'espace change sur le disque ; renvoie de quoi arrêter. */
export function surveillerEspace(rappel: () => void): () => void {
  const arret = listen('espace-modifie', rappel)
  return () => void arret.then((f) => f())
}

/** Ouvre une adresse web dans le navigateur du système (l'app de bureau n'ouvre pas d'onglet), ou dans un nouvel onglet. */
export function ouvrirAdresse(adresse: string): void {
  if (estBureau()) void import('@tauri-apps/plugin-opener').then((o) => o.openUrl(adresse))
  else window.open(adresse, '_blank', 'noopener')
}
