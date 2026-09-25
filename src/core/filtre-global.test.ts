import { describe, expect, it } from 'vitest'
import { avecCalculs, type SourceArbre } from './arbre-temps'
import type { FiltreGlobal, PastilleGlobale } from './dashboard'
import { DepotEspace } from './depot-espace'
import { filtrerBloc, retenues } from './filtre-global'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

// Filtres globaux d'un dashboard : la base filtrée directement, les autres par leurs relations.

const ctx = { aujourdhui: '2026-09-25' }

async function source(): Promise<SourceArbre> {
  const espace = await DepotEspace.ouvrir(new AdaptateurCompteur({ ...FICHIERS_RELATIONS }), { aleatoire, planifier: minuteur().planifier, aujourdhui: () => ctx.aujourdhui })
  const etat = espace.etat()
  const bases = [...etat.bases.values()].filter((b) => b.depot)
  return { schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])), lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])), calculs: etat.calculs }
}

/** Ids des lignes que garde le bloc de `base`, et les bases filtrées sans effet sur lui. */
async function bloc(base: string, filtres: FiltreGlobal[], pastilles: PastilleGlobale[] = []) {
  const src = await source()
  const lignes = src.lignes.get(base)!.map((l) => ({ ligne: avecCalculs(src, base, l), sortira: false }))
  const r = filtrerBloc(base, src.schemas.get(base)!, lignes, retenues(src, filtres, pastilles, ctx))
  return { ids: r.lignes.map((lv) => lv.ligne.id), libres: r.libres }
}

describe('filtres globaux de dashboard', () => {
  const navi: PastilleGlobale = { base: 'projets', valeur: ['p0000001'] }

  it('un projet choisi : son bloc le montre seul, les tâches et clients suivent leurs relations (des deux côtés)', async () => {
    expect((await bloc('projets', [], [navi])).ids).toEqual(['p0000001'])
    expect((await bloc('taches', [], [navi])).ids).toEqual(['t0000001', 't0000002'])
    expect((await bloc('clients', [], [navi])).ids).toEqual(['c0000001'])
  })

  it('un filtre de colonne sur une base qui n’a pas de bloc filtre quand même les autres', async () => {
    const faites: FiltreGlobal = { base: 'taches', colonne: 'fait', operateur: 'egal', valeur: true }
    expect((await bloc('projets', [faites])).ids).toEqual(['p0000001'])
  })

  it('plusieurs bases filtrées se combinent en ET', async () => {
    const sinam: FiltreGlobal = { base: 'projets', colonne: 'titre', operateur: 'contient', valeur: 'sinam' }
    const faites: FiltreGlobal = { base: 'taches', colonne: 'fait', operateur: 'egal', valeur: true }
    expect((await bloc('taches', [sinam, faites])).ids).toEqual([])
    expect((await bloc('taches', [sinam])).ids).toEqual(['t0000003'])
  })

  it('un bloc sans relation vers la base filtrée n’est pas filtré, et le dit', async () => {
    const acme: PastilleGlobale = { base: 'clients', valeur: ['c0000001'] }
    expect(await bloc('taches', [], [acme])).toEqual({ ids: ['t0000001', 't0000002', 't0000003'], libres: ['clients'] })
  })

  it('une pastille non réglée ne filtre rien', async () => {
    const r = await bloc('taches', [], [{ base: 'projets' }, { base: 'projets', colonne: 'titre', operateur: 'contient' }])
    expect(r).toEqual({ ids: ['t0000001', 't0000002', 't0000003'], libres: [] })
  })
})
