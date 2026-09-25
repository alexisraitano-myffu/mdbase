import { avecCalculs, type SourceArbre } from './arbre-temps'
import type { FiltreGlobal, PastilleGlobale } from './dashboard'
import { correspond, filtreDePastille, type Contexte, type LigneVue } from './filtres'
import type { Schema } from './schema'
import type { Filtre } from './vue'

// Filtres globaux d'un dashboard (spec §10) : ils portent sur une base, et
// chaque bloc d'une autre base suit ses relations vers elle.

/** Lignes retenues de chaque base filtrée (ET de ses filtres et pastilles réglées). Une base sans filtre actif n'y figure pas. */
export function retenues(src: SourceArbre, filtres: readonly FiltreGlobal[], pastilles: readonly PastilleGlobale[], ctx: Contexte): Map<string, ReadonlySet<string>> {
  const conditions = new Map<string, { filtres: Filtre[]; ids: Set<string>[] }>()
  const de = (base: string) => {
    if (!conditions.has(base)) conditions.set(base, { filtres: [], ids: [] })
    return conditions.get(base)!
  }
  for (const f of filtres) {
    const { base: b, ...filtre } = f
    de(b).filtres.push(filtre)
  }
  for (const p of pastilles) {
    const schema = src.schemas.get(p.base)
    if (!schema) continue
    if (p.colonne === undefined) {
      const ids = Array.isArray(p.valeur) ? p.valeur.filter((x): x is string => typeof x === 'string') : []
      if (ids.length > 0) de(p.base).ids.push(new Set(ids))
      continue
    }
    const f = filtreDePastille(schema, { colonne: p.colonne, ...(p.operateur && { operateur: p.operateur }), ...(p.valeur !== undefined && { valeur: p.valeur }) })
    if (f) de(p.base).filtres.push(f)
  }
  const resultat = new Map<string, ReadonlySet<string>>()
  for (const [base, c] of conditions) {
    const schema = src.schemas.get(base)
    if (!schema) continue
    const gardees = (src.lignes.get(base) ?? [])
      .filter((l) => c.ids.every((ids) => ids.has(l.id)))
      .map((l) => avecCalculs(src, base, l))
      .filter((l) => c.filtres.every((f) => correspond(l, schema, f, ctx)))
    resultat.set(base, new Set(gardees.map((l) => l.id)))
  }
  return resultat
}

/**
 * Lignes d'un bloc après les filtres globaux (lignes déjà munies de leurs
 * calculs). `libres` : les bases filtrées vers lesquelles ce bloc n'a pas de
 * relation, donc sans effet sur lui.
 */
export function filtrerBloc(
  base: string,
  schema: Schema,
  lignes: readonly LigneVue[],
  retenuesParBase: ReadonlyMap<string, ReadonlySet<string>>,
): { lignes: LigneVue[]; libres: string[] } {
  const libres: string[] = []
  const tests: ((lv: LigneVue) => boolean)[] = []
  for (const [filtree, ids] of retenuesParBase) {
    if (filtree === base) {
      tests.push((lv) => ids.has(lv.ligne.id))
      continue
    }
    const relations = schema.colonnes.filter((c) => c.type === 'relation' && c.cible === filtree)
    if (relations.length === 0) {
      libres.push(filtree)
      continue
    }
    tests.push((lv) =>
      relations.some((c) => {
        const cellule = lv.ligne.cellules[c.cle]
        return cellule?.etat === 'ok' && Array.isArray(cellule.valeur) && cellule.valeur.some((id) => ids.has(String(id)))
      }),
    )
  }
  return { lignes: tests.length === 0 ? [...lignes] : lignes.filter((lv) => tests.every((t) => t(lv))), libres }
}
