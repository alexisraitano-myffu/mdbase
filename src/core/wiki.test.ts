import { describe, expect, it } from 'vitest'
import { arbreWiki, citePage, descendants, ordreEntre, ordreEnFin, peutDeplacer, placementWiki, type NoeudWiki, type PageWiki } from './wiki'

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

describe('placementWiki et citePage', () => {
  const p = (id: string, parent: string | null, ordre: number | null): PageWiki => ({ id, chemin: `_wiki/${id}--${id}.md`, titre: id, parent, ordre, corps: '' })
  const pages = [p('a', null, 1), p('b', null, 2), p('c', null, 3), p('a1', 'a', 1), p('a2', 'a', 2)]

  it('avant, après, dedans : un seul rang calculé entre les voisines', () => {
    expect(placementWiki(pages, 'c', 'b', 'avant')).toEqual({ parent: null, ordre: 1.5 })
    expect(placementWiki(pages, 'a', 'c', 'apres')).toEqual({ parent: null, ordre: 4 })
    expect(placementWiki(pages, 'a', 'b', 'apres')).toEqual({ parent: null, ordre: 2.5 })
    expect(placementWiki(pages, 'c', 'a1', 'avant')).toEqual({ parent: 'a', ordre: 0 })
    expect(placementWiki(pages, 'c', 'a', 'dans')).toEqual({ parent: 'a', ordre: 3 })
    expect(placementWiki(pages, 'b', 'c', 'dans')).toEqual({ parent: 'c', ordre: 1 })
  })

  it('refuse sur elle-même et dans sa descendance', () => {
    expect(placementWiki(pages, 'a', 'a', 'dans')).toBeNull()
    expect(placementWiki(pages, 'a', 'a1', 'dans')).toBeNull()
    expect(placementWiki(pages, 'a', 'a2', 'apres')).toBeNull()
  })

  it('citePage reconnaît le lien par id, avec ou sans titre affiché', () => {
    expect(citePage('voir [[_wiki/deploiement--p4m1z8rt|Déploiement]]', 'p4m1z8rt')).toBe(true)
    expect(citePage('voir [[_wiki/ancien-nom--p4m1z8rt]]', 'p4m1z8rt')).toBe(true)
    expect(citePage('voir [[_wiki/deploiement--p4m1z8rtx]]', 'p4m1z8rt')).toBe(false)
    expect(citePage('p4m1z8rt', 'p4m1z8rt')).toBe(false)
  })
})
