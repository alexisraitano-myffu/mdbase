import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import type { LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import { colonne as colonneDe } from '../core/schema'
import type { Vue } from '../core/vue'
import { useLancer } from './actions'
import { Carte } from './Carte'
import { Plus } from 'lucide-react'
import { Icone } from './icones'

type Props = {
  espace: DepotEspace
  base: string
  depot: DepotBase
  vue: Vue
  lignesVue: LigneVue[]
  valeursCreation: () => Modifications
  retenir: (id: string) => void
  ouvrir: (ligne: LigneChargee) => void
}

/** Collection (spec §7) : une carte par ligne, avec les champs choisis et, en option, le début du corps. */
export function Collection({ espace, base, depot, vue, lignesVue, valeursCreation, retenir, ouvrir }: Props) {
  const lancer = useLancer()
  const champs = (vue.champsCarte ?? []).flatMap((c) => colonneDe(depot.schema, c) ?? [])
  const creer = async () => {
    const ligne = await lancer(espace.creerLigne(base, valeursCreation()))
    if (!ligne) return
    retenir(ligne.id)
    ouvrir(ligne)
  }
  return (
    <div className="collection">
      {lignesVue.map((lv) => (
        <Carte
          key={lv.ligne.chemin}
          base={base}
          schema={depot.schema}
          ligne={lv.ligne}
          champs={champs}
          apercuCorps={vue.apercuCorps === true}
          sortira={lv.sortira}
          ouvrir={() => ouvrir(lv.ligne)}
        />
      ))}
      <button className="carte carte-ajout discret" onClick={() => void creer()}>
        <Icone de={Plus} /> Nouvelle
      </button>
    </div>
  )
}
