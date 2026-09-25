import { useMemo, useState } from 'react'
import type { LigneChargee } from '../core/base'
import type { DepotBase } from '../core/depot-base'
import type { DepotEspace } from '../core/depot-espace'
import { appliquerVue, filtreDePastille, valeursHeritees, type LigneVue } from '../core/filtres'
import type { Modifications } from '../core/ligne'
import type { Filtre, ModificationVue, Vue } from '../core/vue'
import { Calendrier } from './Calendrier'
import { Collection } from './Collection'
import { useEspace } from './contexte-espace'
import { Kanban } from './Kanban'
import { Tableau } from './Tableau'
import { Timeline } from './Timeline'
import { useAujourdhui } from './useAujourdhui'
import { useLignes } from './useDepot'

export type VueAppliquee = {
  lignesVue: LigneVue[]
  valeursCreation: () => Modifications
  retenir: (id: string) => void
}

/**
 * Lignes d'une base passées par une vue : colonnes calculées ajoutées, filtres
 * de la vue et pastilles réglées combinés en ET, tris. Les lignes créées ou
 * modifiées ici restent visibles jusqu'au prochain changement de vue ou de
 * filtres (spec §8).
 */
export function useVueAppliquee(base: string, depot: DepotBase, vue: Vue): VueAppliquee {
  const lignesStockees = useLignes(depot)
  const { etat } = useEspace()
  const calculs = etat.calculs.get(base)
  const lignes = useMemo(
    () =>
      lignesStockees.map((l) => {
        const c = calculs?.get(l.id)
        return c ? { ...l, cellules: { ...l.cellules, ...c } } : l
      }),
    [lignesStockees, calculs],
  )
  const aujourdhui = useAujourdhui()

  const cleVue = JSON.stringify([vue.id, vue.filtres, vue.tris, vue.filtresRapides])
  const [persistantes, setPersistantes] = useState<{ cle: string; ids: ReadonlySet<string> }>({ cle: cleVue, ids: new Set() })
  const ids = useMemo(() => (persistantes.cle === cleVue ? persistantes.ids : new Set<string>()), [persistantes, cleVue])
  const retenir = (id: string) => {
    if (!ids.has(id)) setPersistantes({ cle: cleVue, ids: new Set([...ids, id]) })
  }

  const filtres = useMemo(
    () => [...vue.filtres, ...vue.filtresRapides.map((p) => filtreDePastille(depot.schema, p)).filter((f): f is Filtre => f !== null)],
    [vue, depot.schema],
  )
  const lignesVue = useMemo(
    () => appliquerVue(lignes, depot.schema, filtres, vue.tris, { aujourdhui }, ids),
    [lignes, depot.schema, filtres, vue.tris, aujourdhui, ids],
  )
  return { lignesVue, valeursCreation: () => valeursHeritees(depot.schema, filtres), retenir }
}

type Props = {
  espace: DepotEspace
  base: string
  depot: DepotBase
  vue: Vue
  modifierVue: (m: ModificationVue) => void
  appliquee: VueAppliquee
  /** Ouvre la page d'une ligne : de cette base, ou d'une autre (niveaux dépliés de la timeline). */
  ouvrir: (base: string, id: string) => void
}

/** Le contenu d'une vue selon son type : tableau, kanban, collection, calendrier ou timeline (spec §7). */
export function ContenuVue({ espace, base, depot, vue, modifierVue, appliquee, ouvrir }: Props) {
  const communs = { espace, base, depot, lignesVue: appliquee.lignesVue, valeursCreation: appliquee.valeursCreation, retenir: appliquee.retenir, ouvrir: (l: LigneChargee) => ouvrir(base, l.id) }
  switch (vue.type) {
    case 'tableau':
      return <Tableau key={vue.id} {...communs} reglages={{ vue, modifier: modifierVue }} tris={vue.tris} />
    case 'kanban':
      return <Kanban key={vue.id} {...communs} vue={vue} />
    case 'collection':
      return <Collection key={vue.id} {...communs} vue={vue} />
    case 'calendrier':
      return <Calendrier key={vue.id} {...communs} vue={vue} modifierVue={modifierVue} />
    case 'timeline':
      return <Timeline key={vue.id} {...communs} vue={vue} modifierVue={modifierVue} ouvrirPage={ouvrir} />
  }
}
