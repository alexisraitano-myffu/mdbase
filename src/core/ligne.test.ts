import { describe, expect, it } from 'vitest'
import { schemaProjets } from './fixtures/schema-projets'
import { creerLigne, ErreurEcriture, lireLigne, reecrireLigne, type Modifications } from './ligne'
import type { Valeur } from './valeurs'

const schema = schemaProjets()

const NAVI = `---
# Projet principal
id: k2x9m4pq
titre: Navi
statut: En cours   # à revoir
echeance: 2026-10-15
client: c7ab3kx1
note_perso: garder ce champ
---
Le corps de la page, en **Markdown** libre.
`

function lire(texte: string) {
  const r = lireLigne('projets/x.md', texte, schema)
  if (!r.ok) throw new Error(r.raison)
  return r.ligne
}

function valeurs(texte: string): Record<string, Valeur> {
  const out: Record<string, Valeur> = {}
  for (const [k, c] of Object.entries(lire(texte).cellules)) if (c.etat === 'ok') out[k] = c.valeur
  return out
}

describe('lireLigne', () => {
  it('lit id, cellules, champs inconnus et corps', () => {
    const l = lire(NAVI)
    expect(l.id).toBe('k2x9m4pq')
    expect(valeurs(NAVI)).toEqual({
      titre: 'Navi',
      statut: 'En cours',
      echeance: '2026-10-15',
      client: ['c7ab3kx1'],
    })
    expect(l.inconnus).toEqual(['note_perso'])
    expect(l.corps).toBe('Le corps de la page, en **Markdown** libre.\n')
  })

  it('refuse un fichier sans frontmatter ou sans id', () => {
    expect(lireLigne('x.md', '# Juste une note\n', schema)).toMatchObject({ ok: false })
    expect(lireLigne('x.md', '---\ntitre: Sans id\n---\n', schema)).toMatchObject({ ok: false })
    expect(lireLigne('x.md', '---\n---\ncorps\n', schema)).toMatchObject({ ok: false })
    expect(lireLigne('x.md', '---\nid: [\n---\n', schema)).toMatchObject({ ok: false })
  })

  it('tolère un BOM, des fins de ligne Windows et un fichier sans corps', () => {
    expect(lire('﻿---\r\nid: a1\r\ntitre: X\r\n---\r\nCorps\r\n').corps).toBe('Corps\r\n')
    expect(lire('---\nid: a1\n---').corps).toBe('')
  })

  it('traite une valeur de colonne calculée présente dans le fichier comme un champ inconnu', () => {
    expect(lire('---\nid: a1\nnb_taches: 3\n---\n').inconnus).toEqual(['nb_taches'])
  })

  it('traite une clé sans valeur comme un champ vide', () => {
    expect(lire('---\nid: a1\nstatut:\n---\n').cellules).toEqual({})
  })
})

describe('reecrireLigne', () => {
  it('ne touche qu’à la clé modifiée : commentaires, champ inconnu et corps intacts', () => {
    const apres = reecrireLigne(NAVI, schema, { statut: 'Terminé' })
    expect(apres).toBe(NAVI.replace('statut: En cours   # à revoir', 'statut: Terminé # à revoir'))
  })

  it('insère un nouveau champ à sa place dans l’ordre du schéma', () => {
    const apres = reecrireLigne(NAVI, schema, { budget: 1200 })
    expect(apres).toContain('echeance: 2026-10-15\nbudget: 1200\nclient: c7ab3kx1\n')
  })

  it('omet un champ vidé ou une case décochée', () => {
    const coche = reecrireLigne(NAVI, schema, { urgent: true })
    expect(coche).toContain('urgent: true')
    const apres = reecrireLigne(coche, schema, { urgent: false, echeance: undefined, titre: '' })
    expect(apres).not.toMatch(/urgent|echeance|titre/)
  })

  it('remplace le corps seulement si demandé', () => {
    expect(reecrireLigne(NAVI, schema, {}, 'Nouveau\n')).toMatch(/---\nNouveau\n$/)
  })

  it('préserve les fins de ligne Windows', () => {
    const crlf = NAVI.replace(/\n/g, '\r\n')
    const apres = reecrireLigne(crlf, schema, { statut: 'Terminé' })
    expect(apres.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('refuse d’écrire une colonne calculée ou inconnue (invariant 1)', () => {
    for (const cle of ['nb_taches', 'jours_restants', 'taches', 'nimporte']) {
      expect(() => reecrireLigne(NAVI, schema, { [cle]: 1 }), cle).toThrow(ErreurEcriture)
    }
  })

  it('refuse de réécrire un frontmatter illisible', () => {
    expect(() => reecrireLigne('---\nid: [\n---\n', schema, { titre: 'x' })).toThrow(ErreurEcriture)
  })
})

describe('invariants', () => {
  it('invariant 5 : un champ inconnu survit à toute réécriture', () => {
    let texte = NAVI
    const suites: Modifications[] = [
      { statut: 'Terminé' },
      { titre: undefined, statut: undefined, echeance: undefined, client: undefined },
      { tags: ['pro'], urgent: true, budget: 3 },
    ]
    for (const m of suites) {
      texte = reecrireLigne(texte, schema, m)
      expect(texte).toContain('note_perso: garder ce champ')
    }
  })

  it('invariant 6 : relire ce qui vient d’être écrit redonne les mêmes valeurs', () => {
    // Valeurs piégeuses : textes qui ressemblent à des nombres, booléens, null,
    // dates ; caractères spéciaux YAML ; retours à la ligne.
    const cas: Modifications = {
      titre: 'true',
      statut: 'À faire',
      echeance: '2026-10-15T09:30',
      budget: -0.5,
      urgent: true,
      tags: ['client', 'pro'],
      site: 'https://exemple.fr/a?b=1#c',
      client: ['aaaaaaaa', 'bbbbbbbb'],
    }
    const titres = ['123', 'null', '~', 'yes', '2026-10-15', '# pas un commentaire', 'a: b', '- tiret', "l'apostrophe", 'ligne 1\nligne 2', '  espaces  ', '@@', '[x]', '{y}']
    for (const titre of titres) {
      const attendu = { ...cas, titre }
      const cree = creerLigne(schema, 'k2x9m4pq', attendu, 'corps')
      expect(valeurs(cree), JSON.stringify(titre)).toEqual(attendu)
      const reecrit = reecrireLigne(NAVI, schema, attendu)
      expect(valeurs(reecrit), JSON.stringify(titre)).toEqual(attendu)
    }
  })

  it('invariant 6 : une réécriture sans modification redonne le fichier à l’identique', () => {
    expect(reecrireLigne(NAVI, schema, {})).toBe(NAVI)
  })
})

describe('creerLigne', () => {
  it('écrit id puis les champs dans l’ordre du schéma, vides omis', () => {
    const texte = creerLigne(schema, 'k2x9m4pq', { client: ['c1'], titre: 'Navi', statut: 'En cours', urgent: false }, 'Corps\n')
    expect(texte).toBe('---\nid: k2x9m4pq\ntitre: Navi\nstatut: En cours\nclient: c1\n---\nCorps\n')
  })

  it('écrit les listes sur une ligne', () => {
    expect(creerLigne(schema, 'a1', { tags: ['pro', 'client'] })).toContain('tags: [pro, client]\n')
  })
})
