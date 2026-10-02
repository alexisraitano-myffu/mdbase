import { describe, expect, it } from 'vitest'
import type { EtatEspace } from './depot-espace'
import { ecrireLien, lireLiens, resoudreLien } from './liens-internes'

const etat = {
  titres: new Map([
    ['projets', new Map([['psite001', 'Site vitrine']])],
    ['archives', new Map([['pancien9', 'Ancien']])],
  ]),
} as unknown as EtatEspace

describe('liens internes (références à une ligne dans le corps)', () => {
  it('lit les liens wiki, avec ou sans alias, et leur position', () => {
    const texte = 'Voir [[projets/site-vitrine--psite001|Site vitrine]] et [[archives/x--pancien9]].'
    expect(lireLiens(texte)).toEqual([
      { from: 5, to: 52, cible: 'projets/site-vitrine--psite001', alias: 'Site vitrine' },
      { from: 56, to: 80, cible: 'archives/x--pancien9', alias: null },
    ])
    expect(lireLiens('[[ouvert sans fin', 10)).toEqual([])
    expect(lireLiens('[[a]]', 10)[0]).toMatchObject({ from: 10, to: 15 })
  })

  it('écrit le chemin sans .md et un alias qui ne ferme pas le lien', () => {
    expect(ecrireLien('projets/site-vitrine--psite001.md', 'Site vitrine')).toBe('[[projets/site-vitrine--psite001|Site vitrine]]')
    expect(ecrireLien('projets/x--p1.md', 'A | B [v2]')).toBe('[[projets/x--p1|A B v2]]')
  })

  it('résout par l’id : fichier renommé, base renommée ; null pour un lien cassé', () => {
    expect(resoudreLien(etat, 'projets/site-vitrine--psite001')).toEqual({ base: 'projets', id: 'psite001' })
    expect(resoudreLien(etat, 'projets/nouveau-nom--psite001')).toEqual({ base: 'projets', id: 'psite001' })
    expect(resoudreLien(etat, 'anciens-projets/x--pancien9')).toEqual({ base: 'archives', id: 'pancien9' })
    expect(resoudreLien(etat, 'projets/disparu--zzzz0000')).toBeNull()
  })
})
