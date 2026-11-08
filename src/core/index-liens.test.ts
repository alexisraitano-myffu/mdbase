import { describe, expect, it } from 'vitest'
import type { EtatEspace } from './depot-espace'
import { IndexLiens } from './index-liens'

// Index des liens (spec §22) : en mémoire, tenu à jour corps par corps.

const etat = {
  titres: new Map([
    ['projets', new Map([['psite001', 'Site vitrine']])],
    ['taches', new Map([['t1', 'Maquette'], ['t2', 'Recette']])],
  ]),
  wiki: { pages: [{ id: 'wproc001' }, { id: 'wdepl002' }] },
} as unknown as EtatEspace

const site = { base: 'projets', id: 'psite001' }

describe('IndexLiens', () => {
  it('ajout, retrait, puis disparition de la source', () => {
    const index = new IndexLiens()
    const corps = [
      { base: 'taches', id: 't1', corps: 'Pour [[projets/site-vitrine--psite001|Site vitrine]].' },
      { base: '_wiki', id: 'wproc001', corps: 'Voir [[projets/site-vitrine--psite001]] et [[_wiki/deploiement--wdepl002|Déploiement]].' },
      { base: 'taches', id: 't2', corps: 'Rien.' },
    ]
    index.synchroniser(corps)
    expect(index.citant(etat, site)).toEqual([{ base: 'taches', id: 't1' }, { base: '_wiki', id: 'wproc001' }])
    expect(index.citant(etat, { base: '_wiki', id: 'wdepl002' })).toEqual([{ base: '_wiki', id: 'wproc001' }])

    // La citation retirée du corps : la tâche ne cite plus.
    corps[0] = { ...corps[0]!, corps: 'Pour plus tard.' }
    index.synchroniser(corps)
    expect(index.citant(etat, site)).toEqual([{ base: '_wiki', id: 'wproc001' }])

    // La page supprimée : plus rien ne cite.
    index.synchroniser(corps.filter((c) => c.base !== '_wiki'))
    expect(index.citant(etat, site)).toEqual([])
    expect(index.taille).toBe(2)
  })

  it('résout comme l’affichage : fichier renommé ou déplacé compte, un homonyme d’une autre base non', () => {
    const index = new IndexLiens()
    index.synchroniser([
      { base: '_wiki', id: 'w1', corps: '[[projets/ancien-nom--psite001]]' },
      { base: '_wiki', id: 'w2', corps: '[[archives/x--psite001]]' }, // dossier renommé : retrouvé dans projets
      { base: '_wiki', id: 'w3', corps: '[[_wiki/x--psite001]]' }, // vise une page, pas la ligne
      { base: 'projets', id: 'psite001', corps: '[[projets/site-vitrine--psite001]]' }, // se cite elle-même
    ])
    expect(index.citant(etat, site).map((s) => s.id)).toEqual(['w1', 'w2'])
  })

  it('un corps inchangé n’est pas relu', () => {
    const index = new IndexLiens()
    const corps = { base: 'taches', id: 't1', corps: '[[projets/site-vitrine--psite001]]' }
    index.synchroniser([corps])
    const lecture = Object.getOwnPropertyDescriptor(String.prototype, 'includes')!
    let relus = 0
    String.prototype.includes = function (this: string, ...a: Parameters<string['includes']>) {
      relus++
      return lecture.value.apply(this, a)
    }
    try {
      index.synchroniser([corps])
    } finally {
      Object.defineProperty(String.prototype, 'includes', lecture)
    }
    expect(relus).toBe(0)
    expect(index.citant(etat, site)).toHaveLength(1)
  })
})
