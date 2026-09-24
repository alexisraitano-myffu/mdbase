import { useMemo, useState } from 'react'
import type { ChargementBase } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace, EtatBase } from '../core/depot-espace'
import { appliquerVue, filtreDePastille, valeursHeritees } from '../core/filtres'
import type { Filtre } from '../core/vue'
import { BarreVue } from './BarreVue'
import { Tableau } from './Tableau'
import { useAujourdhui } from './useAujourdhui'
import { useErreurDepot, useLignes } from './useDepot'

type Props = { espace: DepotEspace; etat: EtatBase; depot: DepotBase; chargement: Extract<ChargementBase, { ok: true }> }

/** Une base ouverte : sa vue courante, filtrée et triée. */
export function VueBase({ espace, etat, depot, chargement }: Props) {
  const erreur = useErreurDepot(depot)
  const lignes = useLignes(depot)
  const aujourdhui = useAujourdhui()
  const [idVue, setIdVue] = useState(etat.vues[0]!.id)
  const vue = etat.vues.find((v) => v.id === idVue) ?? etat.vues[0]!

  // Lignes créées ou modifiées ici : visibles jusqu'au prochain changement de vue ou de filtres (spec §8).
  const cleVue = JSON.stringify([vue.id, vue.filtres, vue.tris, vue.filtresRapides])
  const [persistantes, setPersistantes] = useState<{ cle: string; ids: ReadonlySet<string> }>({ cle: cleVue, ids: new Set() })
  const ids = useMemo(
    () => (persistantes.cle === cleVue ? persistantes.ids : new Set<string>()),
    [persistantes, cleVue],
  )
  const retenir = (id: string) => {
    if (!ids.has(id)) setPersistantes({ cle: cleVue, ids: new Set([...ids, id]) })
  }

  // Filtres de la vue + pastilles réglées, combinés en ET.
  const filtres = useMemo(
    () => [
      ...vue.filtres,
      ...vue.filtresRapides.map((p) => filtreDePastille(depot.schema, p)).filter((f): f is Filtre => f !== null),
    ],
    [vue, depot.schema],
  )
  const lignesVue = useMemo(
    () => appliquerVue(lignes, depot.schema, filtres, vue.tris, { aujourdhui }, ids),
    [lignes, depot.schema, filtres, vue.tris, aujourdhui, ids],
  )

  const { nonReconnus, avertissements } = chargement.base
  const signalements = [...avertissements, ...nonReconnus.map((f) => `${f.chemin} : ${f.raison}`)]

  return (
    <>
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
      <BarreVue
        espace={espace}
        base={etat.id}
        schema={depot.schema}
        vues={etat.vues}
        vue={vue}
        choisirVue={setIdVue}
      />
      <Tableau
        espace={espace}
        base={etat.id}
        depot={depot}
        lignesVue={lignesVue}
        tris={vue.tris}
        valeursCreation={() => valeursHeritees(depot.schema, filtres)}
        retenir={retenir}
      />
    </>
  )
}
