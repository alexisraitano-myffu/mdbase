import { useEffect, useSyncExternalStore } from 'react'
import type { DepotEspace } from '../core/depot-espace'
import { domaineJira } from '../core/jira/client'
import { basesJira, synchroniser } from '../core/jira/synchro'
import { aleatoire, maintenant } from '../adapters/navigateur'
import { AdaptateurBureau } from '../adapters/tauri/bureau'
import { clientBureau, connexionJira, SansConnexionJira, scriptAuDemarrage } from '../adapters/tauri/jira'

// Synchro Jira de l'app de bureau (spec §16, « Dans l'app de bureau ») : tant que
// l'app est ouverte et le module Jira activé, un passage à l'ouverture puis toutes
// les 5 minutes, complet au moins toutes les heures (comme `--suivre` du script).
// Les tickets s'écrivent par le cœur (`synchroniser`) ; l'espace est relu après,
// la surveillance du dossier ignorant les écritures de l'app elle-même.

const INTERVALLE = 5 * 60_000
const COMPLETE_TOUTES_LES = 60 * 60_000

export type EtatSynchroJira = {
  enCours: boolean
  /** Par domaine : e-mail connecté, `null` sans connexion ; absent tant que pas encore lu. */
  connexions: Readonly<Record<string, string | null>>
  /** Le lancement au démarrage du script existe aussi (deux synchros sur la même base). */
  scriptAuDemarrage: boolean
}

let etat: EtatSynchroJira = { enCours: false, connexions: {}, scriptAuDemarrage: false }
const abonnes = new Set<() => void>()
const changer = (e: Partial<EtatSynchroJira>) => {
  etat = { ...etat, ...e }
  for (const f of abonnes) f()
}
const abonner = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}
let demander: (() => void) | null = null

export const useEtatSynchroJira = (): EtatSynchroJira => useSyncExternalStore(abonner, () => etat)

/** Un passage tout de suite (bouton « Synchroniser », connexion enregistrée). */
export const synchroniserJiraMaintenant = () => demander?.()

export async function relireConnexion(site: string): Promise<void> {
  const email = await connexionJira(site).catch(() => null)
  changer({ connexions: { ...etat.connexions, [domaineJira(site)]: email } })
}

export async function verifierScriptAuDemarrage(): Promise<void> {
  changer({ scriptAuDemarrage: await scriptAuDemarrage().catch(() => false) })
}

/** Lance la synchro périodique tant que `actif` (app de bureau, module Jira activé). */
export function useSynchroJiraBureau(espace: DepotEspace, actif: boolean): void {
  useEffect(() => {
    if (!actif) return
    const a = new AdaptateurBureau()
    let derniereComplete = 0
    let arrete = false
    let encore = false
    const passe = async (): Promise<void> => {
      if (arrete) return
      // Demandé pendant un passage (connexion tout juste enregistrée) : un autre suit.
      if (etat.enCours) return void (encore = true)
      changer({ enCours: true })
      try {
        const complete = Date.now() - derniereComplete > COMPLETE_TOUTES_LES
        let ok = true
        let ecrit = false
        for (const { id, schema } of await basesJira(a)) {
          const site = domaineJira(schema.source?.site ?? '')
          if (!site) continue
          await relireConnexion(site)
          if (!etat.connexions[site]) continue
          try {
            await synchroniser(a, id, clientBureau(site), { maintenant, aleatoire, complete })
          } catch (e) {
            // L'erreur est écrite dans `_synchro.yaml` : le bandeau de la base la montre.
            ok = false
            if (e instanceof SansConnexionJira) changer({ connexions: { ...etat.connexions, [site]: null } })
          }
          ecrit = true
        }
        if (complete && ok) derniereComplete = Date.now()
        if (ecrit && !arrete) await espace.rafraichir()
      } catch {
        // Espace illisible le temps d'un passage : le suivant réessaiera.
      } finally {
        changer({ enCours: false })
      }
      if (encore) {
        encore = false
        return passe()
      }
    }
    demander = () => void passe()
    void verifierScriptAuDemarrage()
    void passe()
    const t = setInterval(() => void passe(), INTERVALLE)
    return () => {
      arrete = true
      demander = null
      clearInterval(t)
    }
  }, [espace, actif])
}
