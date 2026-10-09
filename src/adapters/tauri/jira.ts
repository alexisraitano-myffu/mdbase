import { invoke } from '@tauri-apps/api/core'
import { clientJira, type ReponseJira } from '../../core/jira/client'
import type { ClientJira } from '../../core/jira/synchro'

// Synchro Jira de l'app de bureau (spec §16) : les requêtes partent du code
// natif (src-tauri/src/jira.rs), qui ajoute l'e-mail et le token gardés dans le
// gestionnaire d'identifiants du système. L'interface ne voit jamais le token
// une fois saisi.

/** Erreur du natif quand aucune connexion n'est gardée pour le site. */
const SANS_CONNEXION = 'sans-connexion'

/** Que faire d'un token refusé, dans le message d'erreur. */
export const RESSAISIR = 'ressaisis-le dans « Connexion »'

export class SansConnexionJira extends Error {
  constructor(site: string) {
    super(`pas de connexion Jira pour ${site} : saisis ton e-mail et ton token dans le bandeau de la base`)
  }
}

export function clientBureau(site: string): ClientJira {
  return clientJira(
    async (methode, chemin, corps) => {
      try {
        return await invoke<ReponseJira>('jira_appeler', { site, methode, chemin, corps: corps ?? null })
      } catch (e) {
        if (e === SANS_CONNEXION) throw new SansConnexionJira(site)
        throw new Error(String(e))
      }
    },
    (s) => new Promise((ok) => setTimeout(ok, s * 1000)),
    RESSAISIR,
  )
}

/** E-mail connecté pour ce site, `null` sans connexion. */
export const connexionJira = (site: string): Promise<string | null> => invoke('jira_connexion', { site })

/** Vérifie e-mail et token auprès de Jira ; gardés seulement si Jira les accepte. */
export const connecterJira = (site: string, email: string, token: string): Promise<ReponseJira> => invoke('jira_connecter', { site, email, token })

export const oublierJira = (site: string): Promise<void> => invoke('jira_oublier', { site })

/** Le script de synchro est-il aussi lancé à l'ouverture de session Windows ? */
export const scriptAuDemarrage = (): Promise<boolean> => invoke('jira_script_au_demarrage')

export const retirerScriptAuDemarrage = (): Promise<void> => invoke('jira_retirer_script_au_demarrage')
