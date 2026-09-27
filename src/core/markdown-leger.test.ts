import { describe, expect, it } from 'vitest'
import { lireEnligne, lireMarkdown } from './markdown-leger'

const t = (texte: string) => ({ type: 'texte', texte })

describe('Markdown des réponses de l’assistant', () => {
  it('gras, italique, barré, code, imbriqués', () => {
    expect(lireEnligne('a **gras *et italique*** `code *pas*` ~~non~~')).toEqual([
      t('a '),
      { type: 'gras', enfants: [t('gras '), { type: 'italique', enfants: [t('et italique')] }] },
      t(' '),
      { type: 'code', texte: 'code *pas*' },
      t(' '),
      { type: 'barre', enfants: [t('non')] },
    ])
  })

  it('pas d’italique dans un nom de colonne ni autour d’espaces ; échappement', () => {
    expect(lireEnligne('date_de_fin et 2 * 3 * 4 et \\*étoile\\*')).toEqual([t('date_de_fin et 2 * 3 * 4 et *étoile*')])
  })

  it('liens web cliquables ; javascript: gardé en texte', () => {
    expect(lireEnligne('[doc](https://x.test/a) [piège](javascript:alert(1))')).toEqual([
      { type: 'lien', adresse: 'https://x.test/a', enfants: [t('doc')] },
      t(' '),
      t('piège'),
      t(')'),
    ])
  })

  it('titres, listes à puces et numérotées, paragraphes', () => {
    expect(lireMarkdown('## Plan\nJe propose :\n\n1. créer la base\n2. ajouter\n   une vue\n- a\n- b\n\nFin.')).toEqual([
      { type: 'titre', niveau: 2, enfants: [t('Plan')] },
      { type: 'paragraphe', enfants: [t('Je propose :')] },
      { type: 'liste', ordonnee: true, debut: 1, elements: [[t('créer la base')], [t('ajouter\nune vue')]] },
      { type: 'liste', ordonnee: false, debut: 1, elements: [[t('a')], [t('b')]] },
      { type: 'paragraphe', enfants: [t('Fin.')] },
    ])
  })

  it('bloc de code (même non fermé), citation, séparateur', () => {
    expect(lireMarkdown('```yaml\ncle: **x**\n```\n> cité\n> suite\n\n---\n```\nouvert')).toEqual([
      { type: 'code', langue: 'yaml', texte: 'cle: **x**' },
      { type: 'citation', enfants: [t('cité\nsuite')] },
      { type: 'separateur' },
      { type: 'code', langue: '', texte: 'ouvert' },
    ])
  })

  it('tableau avec ligne d’en-tête', () => {
    expect(lireMarkdown('Avant\n| Lot | Fin |\n|---|:--:|\n| **L1** | 09/10 |')).toEqual([
      { type: 'paragraphe', enfants: [t('Avant')] },
      { type: 'tableau', entetes: [[t('Lot')], [t('Fin')]], lignes: [[[{ type: 'gras', enfants: [t('L1')] }], [t('09/10')]]] },
    ])
  })
})
