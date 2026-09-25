import { useEffect, useMemo, useState } from 'react'
import type { ChargementBase } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, EtatBase } from '../core/depot-espace'
import type { ModificationVue } from '../core/vue'
import { useLancer } from './actions'
import { BandeauDoublons } from './Conflits'
import { useEspace } from './contexte-espace'
import { BarreVue } from './BarreVue'
import { ContenuVue, useVueAppliquee } from './ContenuVue'
import { Page } from './Page'
import { useErreurDepot } from './useDepot'
import { usePageOuverte } from './usePageOuverte'

type Props = {
  espace: DepotEspace
  etat: EtatBase
  depot: DepotBase
  chargement: Extract<ChargementBase, { ok: true }>
  /** Page à ouvrir, demandée de l'extérieur (recherche globale) ; `jeton` change à chaque demande. */
  pageDemandee?: { id: string; jeton: number } | null
}

/** Une base ouverte : sa vue courante, filtrée et triée. */
export function VueBase({ espace, etat, depot, chargement, pageDemandee }: Props) {
  const erreur = useErreurDepot(depot)
  const lancer = useLancer()
  const [idVue, setIdVue] = useState(etat.vues[0]!.id)
  const vue = etat.vues.find((v) => v.id === idVue) ?? etat.vues[0]!
  const appliquee = useVueAppliquee(etat.id, depot, vue)
  const { lignesVue } = appliquee

  // La page peut appartenir à une autre base quand on la suit depuis un onglet relation.
  const { page, ouvrir, pleinEcran, basculerPleinEcran, fermer } = usePageOuverte({ base: etat.id, lignesVue })
  useEffect(() => {
    if (pageDemandee) ouvrir(etat.id, pageDemandee.id)
  }, [pageDemandee?.jeton]) // le jeton seul : une demande n'ouvre qu'une fois

  const reglages = useMemo(
    () => ({ modifier: (m: ModificationVue) => void lancer(espace.modifierVue(etat.id, vue.id, m)) }),
    [vue.id, espace, etat.id, lancer],
  )

  const doublons = useEspace().etat.doublons.get(etat.id)
  const { nonReconnus, avertissements } = chargement.base
  const signalements = [...avertissements, ...nonReconnus.map((f) => `${f.chemin} : ${f.raison}`)]

  return (
    <div className={`zone-vue ${page ? 'avec-page' : ''} ${pleinEcran ? 'page-plein-ecran' : ''}`}>
      <div className="zone-tableau">
        <h1>{depot.schema.nom}</h1>
        {erreur && <p className="erreur">Écriture impossible : {erreur}</p>}
        {signalements.length > 0 && (
          <details className="avertissements">
            <summary>
              ⚠ {signalements.length} signalement{signalements.length > 1 ? 's' : ''}
            </summary>
            <ul>
              {signalements.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        )}
        {doublons && <BandeauDoublons depot={depot} doublons={doublons} />}
        <BarreVue espace={espace} base={etat.id} schema={depot.schema} vues={etat.vues} vue={vue} choisirVue={setIdVue} lignesVue={lignesVue} />
        <ContenuVue
          espace={espace}
          base={etat.id}
          depot={depot}
          vue={vue}
          modifierVue={reglages.modifier}
          appliquee={appliquee}
          ouvrir={ouvrir}
        />
      </div>
      {page && (
        <Page
          key={`${page.base}/${page.id}`}
          base={page.base}
          id={page.id}
          miseEnPageDeLaVue={page.base === etat.id ? vue.miseEnPage : undefined}
          vue={{ base: etat.id, id: vue.id, nom: vue.nom }}
          pleinEcran={pleinEcran}
          basculerPleinEcran={basculerPleinEcran}
          fermer={fermer}
          ouvrir={ouvrir}
        />
      )}
    </div>
  )
}
