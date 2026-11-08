import { describe, expect, it } from 'vitest'
import { arbreWiki, descendants, ordreEntre, ordreEnFin, peutDeplacer, type NoeudWiki, type PageWiki } from './wiki'

// Wiki (spec §22) : l'arbre vient de la clé `parent` de pages à plat.

const page = (id: string, parent: string | null = null, ordre: number | null = null, titre = id): PageWiki => ({ id, chemin: `_wiki/${id}--${id}.md`, titre, parent, ordre, corps: '' })
const plan = (n: NoeudWiki[]): unknown[] => n.map((x) => (x.enfants.length > 0 ? { [x.page.id]: plan(x.enfants) } : x.page.id))

describe('arbre du wiki', () => {
  it('range les pages sous leur parent, sœurs triées par ordre puis par titre', () => {
    const pages = [page('b', null, 2), page('a', null, 1), page('c', 'a', null, 'zèbre'), page('d', 'a', null, 'Âne'), page('e', 'a', 0.5)]
    expect(plan(arbreWiki(pages))).toEqual([{ a: ['e', 'd', 'c'] }, 'b'])
  })

  it('une page au parent introuvable va à la racine, signalée', () => {
    const [n] = arbreWiki([page('a', 'disparue')])
    expect(n!.page.id).toBe('a')
    expect(n!.signale).toBe('parent introuvable')
  })

  it('une boucle de parents ne fait rien disparaître : les pages prises dedans vont à la racine', () => {
    const arbre = arbreWiki([page('a', 'b'), page('b', 'a'), page('c')])
    expect(arbre.map((n) => n.page.id).sort()).toEqual(['a', 'b', 'c'])
    expect(arbre.filter((n) => n.signale === 'boucle')).toHaveLength(2)
  })

  it('descendance, et refus de glisser une page sous elle-même ou sous ses sous-pages', () => {
    const pages = [page('a'), page('b', 'a'), page('c', 'b'), page('d')]
    expect(descendants(pages, 'a')).toEqual(['b', 'c'])
    expect(peutDeplacer(pages, 'a', 'c')).toBe(false)
    expect(peutDeplacer(pages, 'a', 'a')).toBe(false)
    expect(peutDeplacer(pages, 'c', 'd')).toBe(true)
    expect(peutDeplacer(pages, 'b', null)).toBe(true)
  })

  it('rang entre deux sœurs : la moyenne, pour n’écrire qu’un fichier', () => {
    expect(ordreEntre(1, 2)).toBe(1.5)
    expect(ordreEntre(undefined, 1)).toBe(0)
    expect(ordreEntre(3, undefined)).toBe(4)
    expect(ordreEntre(null, null)).toBe(1)
    expect(ordreEnFin([page('a', null, 1), page('b', null, 7), page('c', 'a', 40)], null)).toBe(8)
    expect(ordreEnFin([], 'a')).toBe(1)
  })
})
