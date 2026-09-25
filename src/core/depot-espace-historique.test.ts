import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

// Annuler / rétablir (Ctrl+Z) sur les données.

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-25' })
  // `avancer` écrit les fichiers en attente et termine aussi l'étape de frappe en cours.
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  const taches = () => espace.etat().bases.get('taches')!.depot!
  return { a, espace, ecrire, taches }
}

const A = 'taches/a--t0000001.md'
const B = 'taches/b--t0000002.md'

describe('annuler / rétablir', () => {
  it('une cellule modifiée revient à sa valeur, puis se rétablit', async () => {
    const { a, espace, ecrire, taches } = await ouvrir()
    expect(espace.peutAnnuler()).toBe(false)
    taches().modifier(A, 'heures', 9)
    await ecrire()
    expect(await espace.annuler()).toBe(true)
    await ecrire()
    expect(await a.lire(A)).toContain('heures: 3\n')
    expect(espace.peutRetablir()).toBe(true)
    await espace.retablir()
    await ecrire()
    expect(await a.lire(A)).toContain('heures: 9\n')
  })

  it('les frappes successives dans une cellule s’annulent d’un coup ; après une pause, en deux fois', async () => {
    const { a, espace, ecrire, taches } = await ouvrir()
    taches().modifier(A, 'titre', 'Ab')
    taches().modifier(A, 'titre', 'Abc')
    await ecrire() // la pause : l'étape se ferme
    taches().modifier(A, 'titre', 'Abcd')
    // Annuler un titre renomme aussi le fichier : on le relit par son id.
    const lireA = async () => a.lire(`taches/${(await a.lister('taches')).find((e) => e.nom.endsWith('--t0000001.md'))!.nom}`)
    await espace.annuler()
    await ecrire()
    expect(await lireA()).toContain('titre: Abc\n')
    await espace.annuler()
    await ecrire()
    expect(await lireA()).toContain('titre: A\n')
    expect(espace.peutAnnuler()).toBe(false)
  })

  it('un champ vide qu’on remplit redevient vide', async () => {
    const { a, espace, ecrire, taches } = await ouvrir()
    taches().modifier('taches/c--t0000003.md', 'statut', 'Terminé')
    await ecrire()
    await espace.annuler()
    await ecrire()
    expect(await a.lire('taches/c--t0000003.md')).not.toContain('statut:')
  })

  it('une modification en lot s’annule en une fois', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('taches', [A, B], 'heures', 1)
    await ecrire()
    await espace.annuler()
    await ecrire()
    expect(await a.lire(A)).toContain('heures: 3\n')
    expect(await a.lire(B)).toContain('heures: 5\n')
    expect(espace.peutAnnuler()).toBe(false)
  })

  it('une suppression annulée remet le fichier à l’identique, et les liens retirés', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const avant = await a.lire('projets/navi--p0000001.md')
    await espace.supprimerLigne('projets', 'projets/navi--p0000001.md', true)
    await ecrire()
    expect(await a.lire(A)).not.toContain('projet:')
    await espace.annuler()
    await ecrire()
    expect(await a.lire('projets/navi--p0000001.md')).toBe(avant)
    expect(await a.lire(A)).toContain('projet: p0000001\n')
    expect(espace.etat().titres.get('projets')!.get('p0000001')).toBe('Navi')
    // rétablir la supprime à nouveau
    await espace.retablir()
    await ecrire()
    expect((await a.lister('projets')).map((e) => e.nom)).not.toContain('navi--p0000001.md')
  })

  it('une ligne créée disparaît à l’annulation', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const l = await espace.creerLigne('taches', { titre: 'Nouvelle' })
    await ecrire()
    await espace.annuler()
    await ecrire()
    expect((await a.lister('taches')).map((e) => e.nom)).not.toContain(l.chemin.split('/')[1])
  })

  it('un titre modifié en lot revient, et le fichier reprend son nom', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('taches', [A], 'titre', 'Relance')
    await ecrire()
    await espace.annuler()
    await ecrire()
    const noms = (await a.lister('taches')).map((e) => e.nom)
    expect(noms).toContain('a--t0000001.md')
    expect(noms).not.toContain('relance--t0000001.md')
  })

  it('une nouvelle modification après une annulation vide « rétablir »', async () => {
    const { espace, ecrire, taches } = await ouvrir()
    taches().modifier(A, 'heures', 9)
    await ecrire()
    await espace.annuler()
    taches().modifier(B, 'heures', 7)
    expect(espace.peutRetablir()).toBe(false)
    await ecrire()
  })

  it('ce qui ne peut plus être défait (colonne supprimée depuis) est ignoré sans erreur', async () => {
    const { a, espace, ecrire, taches } = await ouvrir()
    taches().modifier(A, 'heures', 9)
    await ecrire()
    await espace.supprimerColonne('taches', 'heures')
    await expect(espace.annuler()).resolves.toBe(true)
    await ecrire()
    expect(await a.lire(A)).not.toContain('heures:')
  })

  it('chaque action groupée et chaque annulation disent ce qu’elles ont touché ; une frappe seule, non', async () => {
    const { espace, taches } = await ouvrir()
    const recus: string[][] = []
    espace.ecouterEtapes((cs) => recus.push(cs.map((c) => (c.type === 'cellule' ? `${c.id}.${c.cle}` : `${c.type} ${c.id}`))))
    taches().modifier(A, 'heures', 9)
    expect(recus).toEqual([])
    await espace.modifierLignes('taches', [A, B], 'statut', 'Terminé')
    await espace.annuler()
    expect(recus).toEqual([
      ['t0000001.statut', 't0000002.statut'],
      ['t0000002.statut', 't0000001.statut'],
    ])
  })
})
