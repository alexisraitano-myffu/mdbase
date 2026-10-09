import { describe, expect, it } from 'vitest'
import { convertirLeHtml, htmlEnMarkdown } from './coller'
import { adresseLien } from './liens'

describe('coller du texte mis en forme', () => {
  it('le HTML d’une page devient du Markdown : titres, gras, listes, liens, tableau', async () => {
    const html =
      '<h2>Compte rendu</h2><p>Un point <strong>important</strong> et un <a href="https://exemple.fr">lien</a>.</p><ul><li>Premier</li><li>Second</li></ul>' +
      '<table><thead><tr><th>Qui</th><th>Quoi</th></tr></thead><tbody><tr><td>Alex</td><td>Relire</td></tr></tbody></table>'
    const md = await htmlEnMarkdown(html)
    expect(md).toContain('## Compte rendu')
    expect(md).toContain('Un point **important** et un [lien](https://exemple.fr).')
    expect(md).toMatch(/^-\s+Premier$/m)
    expect(md).toContain('| Qui | Quoi |')
  })

  it('convertit seulement si le HTML a une mise en forme que le texte brut n’a pas', () => {
    expect(convertirLeHtml('<h1>Titre</h1><p>Texte</p>', 'Titre\nTexte')).toBe(true)
    expect(convertirLeHtml('<span>du texte</span>', 'du texte')).toBe(false)
    // Copié d'un éditeur de code : le texte brut est déjà du Markdown.
    expect(convertirLeHtml('<div><span>## Titre</span></div><b>x</b>', '## Titre\n- point')).toBe(false)
  })
})

describe('adresse d’un lien', () => {
  it('complète un domaine nu et encode ce qui casserait le lien', () => {
    expect(adresseLien(' exemple.fr/page ')).toBe('https://exemple.fr/page')
    expect(adresseLien('https://exemple.fr/a b(1)')).toBe('https://exemple.fr/a%20b%281%29')
    expect(adresseLien('mailto:moi@exemple.fr')).toBe('mailto:moi@exemple.fr')
    expect(adresseLien('notes de réunion')).toBe('notes%20de%20réunion')
  })
})
