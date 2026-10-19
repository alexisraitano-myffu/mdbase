import { axe, mesures, type BlocAnalyse } from '../core/bi/analyse'
import { couleurRegle, formatDe, formater, formaterCompact } from '../core/bi/regles'
import type { ResultatSql, ValeurSql } from '../core/bi/sql'
import type { Schema } from '../core/schema'

// Options ECharts d'un bloc d'analyse (spec §10 « Analyse ») : séries tirées
// du résultat, couleurs des options de la base ou palette de l'espace,
// mise en forme conditionnelle, formats français.

/** Couleurs vives des graphiques, par nom de couleur de l'espace (les pastels des options sont trop pâles pour une barre). */
export const VIVES: Record<string, string> = {
  bleu: '#3e7cb1',
  orange: '#e07a2f',
  vert: '#4f9d69',
  violet: '#8a63b8',
  rose: '#c4568a',
  jaune: '#d9a400',
  marron: '#a27763',
  rouge: '#d94848',
  gris: '#9b9a97',
}
const ORDRE = Object.values(VIVES)

export type Theme = { texte: string; discret: string; trait: string; fond: string; police: string }

/** Couleur d'option d'une valeur, quand la colonne du résultat porte le nom d'une colonne à choix d'une base. */
export function couleursOptions(schemas: readonly Schema[], colonne: string | undefined): Map<string, string> {
  const m = new Map<string, string>()
  if (!colonne) return m
  for (const s of schemas) {
    for (const c of s.colonnes) {
      if (c.cle !== colonne || (c.type !== 'select' && c.type !== 'multiselect')) continue
      for (const o of c.options) if (o.couleur && VIVES[o.couleur] && !m.has(o.label)) m.set(o.label, VIVES[o.couleur]!)
    }
  }
  return m
}

const cle = (v: ValeurSql | undefined) => (v === null || v === undefined ? '(vide)' : Array.isArray(v) ? v.join(', ') : String(v))
const nombre = (v: ValeurSql | undefined) => (typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : null)

export function optionGraphique(b: BlocAnalyse, r: ResultatSql, schemas: readonly Schema[], theme: Theme): Record<string, unknown> {
  const x = axe(b, r)
  const ys = mesures(b, r)
  const fmt = (colonne: string) => (v: unknown) => formater(v as ValeurSql, formatDe(b.format, colonne))
  const fmtY = fmt(ys[0] ?? '')
  const base = {
    animation: false,
    // La vraie police : ECharts mesure les textes avec, « inherit » faisait se chevaucher les légendes.
    textStyle: { fontFamily: theme.police, color: theme.texte },
    tooltip: { trigger: b.type === 'secteurs' || b.type === 'nuage' ? 'item' : 'axis', valueFormatter: fmtY, confine: true },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
  }
  const axeValeurs = { type: 'value', axisLabel: { color: theme.discret, formatter: (v: number) => formaterCompact(v, formatDe(b.format, ys[0] ?? '')) }, splitLine: { lineStyle: { color: theme.trait } } }
  const regle = (ligne: Record<string, ValeurSql>, mesure: string) => {
    const c = couleurRegle(b.regles, ligne, (rg) => rg.colonne ?? mesure)
    return c ? (VIVES[c] ?? (c.startsWith('#') ? c : undefined)) : undefined
  }

  if (b.type === 'secteurs') {
    const couleurs = couleursOptions(schemas, x)
    const y = ys[0]
    // Les étiquettes nomment chaque part : pas de légende, qui se chevauchait dans un petit bloc.
    return {
      ...base,
      series: [
        {
          type: 'pie',
          radius: ['34%', '56%'],
          avoidLabelOverlap: true,
          // Un nom long passe à la ligne au lieu d'être coupé en « … ».
          label: { color: theme.texte, overflow: 'break', formatter: (p: { name: string; percent: number }) => `${p.name}\n${formater(p.percent / 100, 'pourcent')}` },
          labelLine: { length: 8, length2: 8 },
          data: r.lignes.map((l, i) => {
            const nom = cle(x === undefined ? undefined : l[x])
            const couleur = (y && regle(l, y)) ?? couleurs.get(nom) ?? ORDRE[i % ORDRE.length]
            return { name: nom, value: y ? nombre(l[y]) : null, itemStyle: { color: couleur } }
          }),
        },
      ],
    }
  }

  if (b.type === 'nuage') {
    const y = ys[0]
    const groupes = new Map<string, Record<string, ValeurSql>[]>()
    for (const l of r.lignes) {
      const g = b.serie ? cle(l[b.serie]) : ''
      groupes.set(g, [...(groupes.get(g) ?? []), l])
    }
    const couleurs = couleursOptions(schemas, b.serie)
    const tailles = b.taille ? r.lignes.map((l) => nombre(l[b.taille!]) ?? 0) : []
    const max = Math.max(1, ...tailles)
    return {
      ...base,
      ...(b.serie && { legend: { type: 'scroll', itemGap: 16, top: 0, textStyle: { color: theme.discret } } }),
      xAxis: { ...axeValeurs, axisLabel: { color: theme.discret, formatter: (v: number) => formaterCompact(v, x ? formatDe(b.format, x) : undefined) }, scale: true },
      yAxis: { ...axeValeurs, scale: true },
      series: [...groupes].map(([nom, lignes], i) => ({
        type: 'scatter',
        name: nom,
        itemStyle: { color: couleurs.get(nom) ?? ORDRE[i % ORDRE.length] },
        data: lignes.map((l) => ({
          value: [x ? nombre(l[x]) : null, y ? nombre(l[y]) : null],
          ...(b.taille && { symbolSize: 6 + 30 * Math.sqrt((nombre(l[b.taille]) ?? 0) / max) }),
          ...(y && regle(l, y) && { itemStyle: { color: regle(l, y) } }),
        })),
      })),
    }
  }

  // Barres, courbe, aire : catégories en x, une série par mesure, ou par valeur de `serie`.
  const categories: string[] = []
  for (const l of r.lignes) {
    const c = cle(x === undefined ? undefined : l[x])
    if (!categories.includes(c)) categories.push(c)
  }
  type Serie = { nom: string; valeurs: Map<string, { v: number | null; ligne: Record<string, ValeurSql>; mesure: string }> }
  const series: Serie[] = []
  const serieDe = (nom: string) => {
    let s = series.find((x) => x.nom === nom)
    if (!s) series.push((s = { nom, valeurs: new Map() }))
    return s
  }
  for (const l of r.lignes) {
    const c = cle(x === undefined ? undefined : l[x])
    if (b.serie) {
      const y = ys[0]
      if (y) serieDe(cle(l[b.serie])).valeurs.set(c, { v: nombre(l[y]), ligne: l, mesure: y })
    } else for (const y of ys) serieDe(y).valeurs.set(c, { v: nombre(l[y]), ligne: l, mesure: y })
  }
  const couleursSerie = couleursOptions(schemas, b.serie)
  const couleursX = couleursOptions(schemas, x)
  const type = b.type === 'barres' ? 'bar' : 'line'
  const horizontal = b.type === 'barres' && b.horizontal
  const axeCategories = { type: 'category', data: categories, axisLabel: { color: theme.discret, formatter: x ? (v: string) => formater(v, formatDe(b.format, x)) || v : undefined }, axisLine: { lineStyle: { color: theme.trait } }, axisTick: { show: false } }
  const uneSeule = series.length === 1
  return {
    ...base,
    ...(!uneSeule && { legend: { type: 'scroll', itemGap: 16, top: 0, textStyle: { color: theme.discret } } }),
    xAxis: horizontal ? axeValeurs : axeCategories,
    yAxis: horizontal ? { ...axeCategories, inverse: true } : axeValeurs,
    series: series.map((s, i) => {
      const couleur = couleursSerie.get(s.nom) ?? ORDRE[i % ORDRE.length]
      return {
        type,
        name: s.nom,
        ...(b.empile && { stack: 'total' }),
        ...(b.type === 'aire' && { areaStyle: { opacity: 0.25 } }),
        ...(type === 'line' && { symbolSize: 6 }),
        itemStyle: { color: couleur, ...(type === 'bar' && { borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] }) },
        data: categories.map((c) => {
          const p = s.valeurs.get(c)
          if (!p) return null
          // Une seule série en barres : la couleur de l'option de chaque catégorie (statut…), sauf règle.
          const couleurPoint = regle(p.ligne, p.mesure) ?? (uneSeule && type === 'bar' ? couleursX.get(c) : undefined)
          return couleurPoint ? { value: p.v, itemStyle: { color: couleurPoint } } : p.v
        }),
      }
    }),
  }
}
