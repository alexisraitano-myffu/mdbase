import { estAnalyse, estPropre } from './dashboard'
import type { EtatEspace } from './depot-espace'
import { lireTaches } from './taches'
import type { TypeVue } from './vue'

// Magasin de modules (spec §19) : ce qui n'est pas dans le socle s'ajoute par
// module. Les choix sont propres à la machine (côté interface) ; ici, ce que
// l'espace utilise déjà, déduit des fichiers : un tel module est toujours
// actif, pour qu'aucune version ni aucun réglage ne cache ce qu'un espace contient.

export type IdModule = 'kanban' | 'collection' | 'calendrier' | 'timeline' | 'charge' | 'taches' | 'dashboards' | 'assistant' | 'inbox' | 'contexte' | 'jira' | 'mcp'

/** Types de vue qui sont des modules ; le tableau est dans le socle. */
export const VUES_MODULES = ['kanban', 'collection', 'calendrier', 'timeline', 'charge'] as const satisfies readonly TypeVue[]

export const estVueModule = (type: TypeVue): type is (typeof VUES_MODULES)[number] => (VUES_MODULES as readonly string[]).includes(type)

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`

const CASE = /^\s*[-*+] \[[ xX]\]/m

/**
 * Pourquoi chaque module est utilisé par l'espace (« utilisé par 3 vues ») ;
 * absent s'il ne l'est pas. Ne compte que ce qui est écrit dans les fichiers.
 */
export function usagesModules(etat: Pick<EtatEspace, 'bases' | 'dashboards' | 'taches'>): Partial<Record<IdModule, string>> {
  const usages: Partial<Record<IdModule, string>> = {}

  const vues = new Map<TypeVue, number>()
  const compter = (type: TypeVue) => vues.set(type, (vues.get(type) ?? 0) + 1)
  for (const b of etat.bases.values()) for (const v of b.vues) if (!v.implicite) compter(v.type)
  const blocs = new Map<TypeVue, number>()
  for (const d of etat.dashboards)
    for (const r of d.dashboard?.rangees ?? []) for (const bloc of r.blocs) if (!estAnalyse(bloc) && estPropre(bloc)) blocs.set(bloc.vue.type, (blocs.get(bloc.vue.type) ?? 0) + 1)
  for (const type of VUES_MODULES) {
    const n = vues.get(type) ?? 0
    const m = blocs.get(type) ?? 0
    if (n + m === 0) continue
    usages[type] = n > 0 && m > 0 ? `Utilisé par ${pluriel(n, 'vue', 'vues')} et ${pluriel(m, 'bloc de dashboard', 'blocs de dashboard')}` : n > 0 ? `Utilisé par ${pluriel(n, 'vue', 'vues')}` : `Utilisé par ${pluriel(m, 'bloc de dashboard', 'blocs de dashboard')}`
  }

  if (etat.dashboards.length > 0) usages.dashboards = `Utilisé par ${pluriel(etat.dashboards.length, 'dashboard', 'dashboards')}`

  const bases = [...etat.bases.values()]
  const onglets = bases.filter((b) => b.pages.some((p) => p.onglets.some((o) => o.type === 'taches'))).length
  if (etat.taches) usages.taches = 'L’espace a une base des tâches'
  else if (onglets > 0) usages.taches = `Utilisé par l’onglet Tâches de ${pluriel(onglets, 'base', 'bases')}`
  else if (bases.some((b) => b.depot?.lignes().some((l) => CASE.test(l.corps) && lireTaches(l.corps).length > 0))) usages.taches = 'Des pages contiennent des cases à cocher'

  const jira = bases.filter((b) => b.depot?.schema.source !== undefined).length
  if (jira > 0) usages.jira = `Utilisé par ${pluriel(jira, 'base Jira', 'bases Jira')}`

  return usages
}
