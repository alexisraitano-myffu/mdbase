import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import type { BlocAnalyse } from '../core/bi/analyse'
import type { ResultatSql } from '../core/bi/sql'
import type { Schema } from '../core/schema'
import { optionGraphique, type Theme } from './graphiques'

// Graphique d'un bloc d'analyse, chargé à la demande avec ECharts. Rendu en
// SVG : net à toutes les tailles, et dans les captures.

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

function theme(): Theme {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string, d: string) => s.getPropertyValue(n).trim() || d
  return { texte: v('--texte', '#1f2328'), discret: v('--discret', '#6b7480'), trait: v('--bordure', '#e8eaee'), fond: v('--fond', '#fff'), police: v('--police-dashboard', '') || getComputedStyle(document.body).fontFamily || 'sans-serif' }
}

export function GraphiqueAnalyse({ bloc, resultat, schemas }: { bloc: BlocAnalyse; resultat: ResultatSql; schemas: readonly Schema[] }) {
  const zone = useRef<HTMLDivElement>(null)
  const graphique = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = zone.current
    if (!el) return
    const g = echarts.init(el, null, { renderer: 'svg' })
    graphique.current = g
    const suivi = new ResizeObserver(() => g.resize())
    suivi.observe(el)
    return () => {
      suivi.disconnect()
      g.dispose()
      graphique.current = null
    }
  }, [])

  useEffect(() => {
    const dessiner = () => graphique.current?.setOption(optionGraphique(bloc, resultat, schemas, theme()), { notMerge: true })
    dessiner()
    // Thème clair ou sombre : les couleurs du texte et des traits suivent.
    const sombre = matchMedia('(prefers-color-scheme: dark)')
    sombre.addEventListener('change', dessiner)
    return () => sombre.removeEventListener('change', dessiner)
  }, [bloc, resultat, schemas])

  return <div ref={zone} className="graphique-analyse" />
}
