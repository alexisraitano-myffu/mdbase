import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { appliquerVue } from './filtres'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { ErreurSchema } from './schema-ecriture'

async function ouvrir(jour = '2026-09-24') {
  const a = new AdaptateurCompteur(FICHIERS_RELATIONS)
  let aujourdhui = jour
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => aujourdhui })
  a.ecritures = []
  return { a, espace, changerJour: (j: string) => (aujourdhui = j) }
}

const valeur = (e: DepotEspace, base: string, id: string, cle: string) => {
  const c = e.etat().calculs.get(base)?.get(id)?.[cle]
  return c?.etat === 'ok' ? c.valeur : c
}
const schema = (e: DepotEspace, base: string) => e.etat().bases.get(base)!.depot!.schema

describe('formules dans un espace', () => {
  it('se calculent sur chaque ligne, sans jamais être écrites (invariant 1)', async () => {
    const { a, espace } = await ouvrir()
    const cle = await espace.ajouterFormule('taches', 'Restant', 'si(prop("fait"), 0, prop("heures"))')
    expect(a.ecritures).toEqual(['taches/_schema.yaml'])
    expect(await a.lire('taches/_schema.yaml')).toContain('  - cle: restant\n    nom: Restant\n    type: formula\n    expression: si(prop("fait"), 0, prop("heures"))\n')
    expect(schema(espace, 'taches').colonnes.at(-1)).toMatchObject({ type: 'formula', expression: 'si(prop("fait"), 0, prop("heures"))', resultat: 'nombre' })
    expect(cle).toBe('restant')
    expect([valeur(espace, 'taches', 't0000001', cle), valeur(espace, 'taches', 't0000002', cle)]).toEqual([0, 5])

    espace.etat().bases.get('taches')!.depot!.modifier('taches/b--t0000002.md', 'heures', 8)
    expect(valeur(espace, 'taches', 't0000002', cle)).toBe(8)
    await espace.vider()
    expect(await a.lire('taches/b--t0000002.md')).not.toContain('restant')
  })

  it('le type du résultat décide des filtres et des tris, et un rollup peut remonter une formule', async () => {
    const { espace } = await ouvrir()
    await espace.ajouterFormule('taches', 'Retard', 'ecart_jours(prop("echeance"), aujourdhui())')
    await espace.ajouterRollup('projets', 'Retard max', 'taches', 'retard', 'max')
    expect(valeur(espace, 'taches', 't0000002', 'retard')).toBe(23)
    expect(valeur(espace, 'projets', 'p0000001', 'retard_max')).toBe(23)

    const lignes = espace.etat().bases.get('taches')!.depot!.lignes().map((l) => ({ ...l, cellules: { ...l.cellules, ...espace.etat().calculs.get('taches')?.get(l.id) } }))
    const retard = appliquerVue(lignes, schema(espace, 'taches'), [{ colonne: 'retard', operateur: 'superieur', valeur: 0 }], [], { aujourdhui: '2026-09-24' }, new Set())
    expect(retard.map((l) => l.ligne.id)).toEqual(['t0000002'])
  })

  it('aujourdhui() suit le jour au recalcul', async () => {
    const { espace, changerJour } = await ouvrir()
    await espace.ajouterFormule('taches', 'Retard', 'ecart_jours(prop("echeance"), aujourdhui())')
    changerJour('2026-09-25')
    espace.recalculer()
    expect(valeur(espace, 'taches', 't0000002', 'retard')).toBe(24)
  })

  it('refuse une formule invalide ou en boucle, sans rien écrire (invariant 7)', async () => {
    const { a, espace } = await ouvrir()
    await expect(espace.ajouterFormule('taches', 'X', 'prop("heures") +')).rejects.toThrow(ErreurSchema)
    await expect(espace.ajouterFormule('taches', 'X', 'prop("projet")')).rejects.toThrow('plusieurs valeurs')
    await espace.ajouterFormule('taches', 'A', 'prop("heures") * 2')
    await espace.ajouterFormule('taches', 'B', 'prop("a") + 1')
    a.ecritures = []
    await expect(espace.modifierFormule('taches', 'a', 'prop("b") + 1')).rejects.toThrow(/Boucle de dépendances : Tâches › (A|B)/)
    await expect(espace.modifierFormule('taches', 'a', 'prop("a")')).rejects.toThrow('Boucle')
    expect(a.ecritures).toEqual([])
  })

  it('une boucle qui passe par un rollup est aussi refusée', async () => {
    const { espace } = await ouvrir()
    await espace.ajouterFormule('taches', 'Double', 'prop("heures") * 2')
    await espace.ajouterRollup('projets', 'Doubles', 'taches', 'double', 'somme')
    // Les heures d'un projet ne peuvent pas dépendre d'une formule qui dépend d'elles… ici la boucle serait projet → tâche → projet.
    await espace.ajouterRollup('taches', 'Doubles du projet', 'projet', 'doubles', 'somme')
    await expect(espace.modifierFormule('taches', 'double', 'prop("doubles_du_projet") * 2')).rejects.toThrow('Boucle')
  })

  it('supprimer une colonne lue par une formule la met en erreur, sans cascade', async () => {
    const { espace } = await ouvrir()
    await espace.ajouterFormule('taches', 'Double', 'prop("heures") * 2')
    expect(espace.dependants('taches', 'heures')).toContain('Tâches › Double')
    await espace.supprimerColonne('taches', 'heures')
    expect(schema(espace, 'taches').colonnes.some((c) => c.cle === 'double')).toBe(true)
    expect(espace.etat().calculs.get('taches')?.get('t0000001')?.double).toMatchObject({ etat: 'invalide', raison: 'Colonne « heures » introuvable' })
  })
})
