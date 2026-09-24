import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import { creerLigne, lireLigne, type Modifications } from './ligne'
import { IndexRecherche } from './recherche'
import { lireSchema } from './schema'

const schema = lireSchema(
  `nom: Notes
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: lieu, nom: Lieu, type: text }
  - { cle: note, nom: Note, type: number }
`,
  'notes',
).schema!

function ligne(id: string, valeurs: Modifications, corps = ''): LigneChargee {
  const r = lireLigne(`notes/${id}.md`, creerLigne(schema, id, valeurs) + corps, schema)
  if (!r.ok) throw new Error(r.raison)
  return { ...r.ligne, date: 0 }
}

describe('IndexRecherche', () => {
  const lignes = [
    ligne('n0000001', { titre: 'Réunion équipe', lieu: 'Lyon' }, '\nOrdre du jour : budget du salon, planning des livraisons.\n'),
    ligne('n0000002', { titre: 'Salon de Paris', lieu: 'Paris' }),
    ligne('n0000003', { titre: 'Courses', note: 3 }, '\nPain, lait, café 🌟 et œufs.\n'),
  ]
  const index = new IndexRecherche()
  index.synchroniser([{ schema, lignes }])
  const ids = (q: string) => index.chercher(q).map((r) => r.ligne)

  it('titres, champs texte et corps ; sans accents ni casse ; préfixes ; fautes légères', () => {
    expect(ids('reunion')).toEqual(['n0000001'])
    expect(ids('LYON')).toEqual(['n0000001'])
    expect(ids('livraison')).toEqual(['n0000001'])
    expect(ids('sal')).toEqual(['n0000002', 'n0000001']) // le titre compte plus que le corps
    expect(ids('planing')).toEqual(['n0000001'])
    expect(ids('cafe')).toEqual(['n0000003'])
  })

  it('tous les mots doivent être présents', () => {
    expect(ids('salon budget')).toEqual(['n0000001'])
    expect(ids('salon courses')).toEqual([])
  })

  it('donne un extrait avec les mots à surligner', () => {
    const [r] = index.chercher('budget')
    expect(r!.titre).toBe('Réunion équipe')
    const [d, f] = r!.surlignages[0]!
    expect(r!.extrait.slice(d, f)).toBe('budget')
    // Les positions restent justes après un émoji (deux unités de code).
    const [c] = index.chercher('lait')
    expect(c!.extrait.slice(...c!.surlignages[0]!)).toBe('lait')
    const [e] = index.chercher('œufs')
    expect(e!.extrait.slice(...e!.surlignages[0]!)).toBe('œufs')
  })

  it('suit les modifications et les suppressions', () => {
    const i = new IndexRecherche()
    i.synchroniser([{ schema, lignes }])
    const modifiee = ligne('n0000002', { titre: 'Salon de Marseille', lieu: 'Marseille' })
    i.synchroniser([{ schema, lignes: [lignes[0]!, modifiee] }])
    expect(i.chercher('paris')).toEqual([])
    expect(i.chercher('marseille').map((r) => r.ligne)).toEqual(['n0000002'])
    expect(i.chercher('courses')).toEqual([])
  })
})
