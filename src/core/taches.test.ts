import { describe, expect, it } from 'vitest'
import { ajouterTache, cocherTache, lireTaches, texteSimple } from './taches'

const CORPS = `Intro.

## Reste à faire

- [ ] Formulaire de **contact**
  - [x] Adresse d'envoi
- [X] Gabarits
* [ ] Autre puce

\`\`\`
- [ ] pas une tâche
\`\`\`

## Notes

- liste simple
- [ ]
`

describe('tâches du corps', () => {
  it('lit les cases, leur état, leur retrait et leur section, hors blocs de code', () => {
    expect(lireTaches(CORPS)).toEqual([
      { ligne: 4, texte: 'Formulaire de **contact**', faite: false, niveau: 0, section: 'Reste à faire' },
      { ligne: 5, texte: "Adresse d'envoi", faite: true, niveau: 1, section: 'Reste à faire' },
      { ligne: 6, texte: 'Gabarits', faite: true, niveau: 0, section: 'Reste à faire' },
      { ligne: 7, texte: 'Autre puce', faite: false, niveau: 0, section: 'Reste à faire' },
      { ligne: 16, texte: '', faite: false, niveau: 0, section: 'Notes' },
    ])
  })

  it('sans titre au-dessus, pas de section ; fins de ligne Windows comprises', () => {
    expect(lireTaches('- [ ] Une\r\n- [x] Deux\r\n')).toEqual([
      { ligne: 0, texte: 'Une', faite: false, niveau: 0 },
      { ligne: 1, texte: 'Deux', faite: true, niveau: 0 },
    ])
  })

  it('cocher réécrit seulement la case de la ligne', () => {
    const [t] = lireTaches(CORPS)
    const coche = cocherTache(CORPS, t!, true)!
    expect(coche).toBe(CORPS.replace('- [ ] Formulaire', '- [x] Formulaire'))
    expect(cocherTache(coche, { ligne: 6, texte: 'Gabarits' }, false)).toBe(coche.replace('- [X] Gabarits', '- [ ] Gabarits'))
    expect(cocherTache('- [x] Une\r\n', { ligne: 0, texte: 'Une' }, false)).toBe('- [ ] Une\r\n')
  })

  it("ne réécrit rien si la ligne n'est plus la même tâche (corps changé entre-temps)", () => {
    expect(cocherTache(CORPS, { ligne: 4, texte: 'Autre chose' }, true)).toBeNull()
    expect(cocherTache(CORPS, { ligne: 0, texte: 'Intro.' }, true)).toBeNull()
    expect(cocherTache(CORPS, { ligne: 99, texte: 'x' }, true)).toBeNull()
  })

  it('ajoute sous la dernière tâche, ou à la fin du corps', () => {
    expect(ajouterTache('- [ ] Une\n  - [ ] Sous\n\nSuite.\n', 'Deux')).toBe('- [ ] Une\n  - [ ] Sous\n- [ ] Deux\n\nSuite.\n')
    expect(ajouterTache('Texte.\n\n', ' Première ')).toBe('Texte.\n\n- [ ] Première\n')
    expect(ajouterTache('', 'Seule')).toBe('- [ ] Seule\n')
  })
})

describe('texte simple d’une tâche', () => {
  it('retire la syntaxe en ligne, garde le texte', () => {
    expect(texteSimple('Écrire à **Acme**, voir [le brief](https://x.fr) et `npm`')).toBe('Écrire à Acme, voir le brief et npm')
    expect(texteSimple('*vite* ~~plus tard~~ [[projets/site--p1|Site vitrine]] [[Note]]')).toBe('vite plus tard Site vitrine Note')
    expect(texteSimple('3 * 4 = 12')).toBe('3 * 4 = 12')
  })
})
