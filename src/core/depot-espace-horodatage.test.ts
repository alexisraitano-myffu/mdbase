import { describe, expect, it } from 'vitest'
import { dateLocale } from './calcul'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { creerLigne, lireLigne, reecrireLigne } from './ligne'
import { lireSchema } from './schema'

// Dates de création et de modification (spec §3) : `_cree` et `_modifie`
// écrits par l'app, colonnes « Créé le » et « Modifié le » qui les lisent.

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS })
  const m = minuteur()
  let heure = '2026-10-09T14:32'
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => heure.slice(0, 10), maintenant: () => heure })
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire, changerHeure: (h: string) => void (heure = h) }
}

const calcul = (e: DepotEspace, base: string, id: string, cle: string) => e.etat().calculs.get(base)?.get(id)?.[cle]

describe('fichier d’une ligne', () => {
  const schema = lireSchema('colonnes:\n  - { cle: titre, nom: Titre, type: text }\n  - { cle: note, nom: Note, type: number }\n', 'b').schema!

  it('`_cree` et `_modifie` vont en fin de frontmatter, une colonne ajoutée ensuite se range avant', () => {
    let texte = creerLigne(schema, 'x1', { titre: 'A' }, '', '2026-10-09T14:32')
    expect(texte).toBe('---\nid: x1\ntitre: A\n_cree: 2026-10-09T14:32\n---\n')
    texte = reecrireLigne(texte, schema, { note: 3 }, undefined, '2026-10-10T08:00')
    expect(texte).toBe('---\nid: x1\ntitre: A\nnote: 3\n_cree: 2026-10-09T14:32\n_modifie: 2026-10-10T08:00\n---\n')
    const lue = lireLigne('b/a--x1.md', texte, schema)
    expect(lue.ok && [lue.ligne.cree, lue.ligne.modifie, lue.ligne.inconnus]).toEqual(['2026-10-09T14:32', '2026-10-10T08:00', []])
  })

  it('sans horodatage, rien n’est ajouté', () => {
    expect(creerLigne(schema, 'x1', { titre: 'A' })).toBe('---\nid: x1\ntitre: A\n---\n')
  })
})

describe('dans l’espace', () => {
  it('une ligne créée reçoit `_cree`, puis `_modifie` à chaque écriture', async () => {
    const { a, espace, ecrire, changerHeure } = await ouvrir()
    const ligne = await espace.creerLigne('taches', { titre: 'Nouvelle' })
    expect(await a.lire(ligne.chemin)).toContain('_cree: 2026-10-09T14:32\n')
    changerHeure('2026-10-11T09:15')
    espace.etat().bases.get('taches')!.depot!.modifier(ligne.chemin, 'heures', 4)
    await ecrire()
    expect(await a.lire(ligne.chemin)).toMatch(/heures: 4\n_cree: 2026-10-09T14:32\n_modifie: 2026-10-11T09:15\n/)
  })

  it('retirer une option ne marque pas les lignes comme modifiées', async () => {
    const { a, espace } = await ouvrir()
    await espace.retirerOption('taches', 'statut', 'Terminé', 'À faire')
    const texte = await a.lire('taches/b--t0000002.md')
    expect(texte).toContain('statut: À faire\n')
    expect(texte).not.toContain('_modifie')
  })

  it('colonnes « Créé le » et « Modifié le » : les clés, sinon la date du fichier', async () => {
    const { a, espace, ecrire, changerHeure } = await ouvrir()
    await espace.ajouterHorodatage('taches', 'Créé le', 'created')
    await espace.ajouterHorodatage('taches', 'Modifié le', 'modified')
    expect(await a.lire('taches/_schema.yaml')).toMatch(/cle: cree_le[\s\S]*type: created[\s\S]*cle: modifie_le[\s\S]*type: modified/)
    const fichier = dateLocale(await a.dateModification('taches/a--t0000001.md'))
    expect(calcul(espace, 'taches', 't0000001', 'cree_le')).toEqual({ etat: 'ok', valeur: fichier })
    const ligne = await espace.creerLigne('taches', { titre: 'Nouvelle' })
    expect(calcul(espace, 'taches', ligne.id, 'modifie_le')).toEqual({ etat: 'ok', valeur: '2026-10-09T14:32' })
    changerHeure('2026-10-12T10:00')
    espace.etat().bases.get('taches')!.depot!.modifier(ligne.chemin, 'heures', 1)
    await ecrire()
    expect(calcul(espace, 'taches', ligne.id, 'cree_le')).toEqual({ etat: 'ok', valeur: '2026-10-09T14:32' })
    expect(calcul(espace, 'taches', ligne.id, 'modifie_le')).toEqual({ etat: 'ok', valeur: '2026-10-12T10:00' })
  })
})
