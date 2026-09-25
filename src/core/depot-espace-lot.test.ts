import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

// Actions sur plusieurs lignes à la fois : sélection du tableau, recopie d'une cellule, collage.

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, 'taches/a--t0000001.md': FICHIERS_RELATIONS['taches/a--t0000001.md']!.concat('\n## Notes\n\nÀ garder.\n') })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-25' })
  a.ecritures = []
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire }
}

const A = 'taches/a--t0000001.md'
const B = 'taches/b--t0000002.md'
const C = 'taches/c--t0000003.md'

describe('actions sur plusieurs lignes', () => {
  it('supprimer une sélection efface chaque fichier ; le nettoyage retire les liens vers elles', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.supprimerLignes('projets', ['projets/navi--p0000001.md', 'projets/sinam--p0000002.md'], true)
    await ecrire()
    expect(a.ecritures.sort()).toEqual([A, B, C, '✗ projets/navi--p0000001.md', '✗ projets/sinam--p0000002.md'])
    expect(await a.lire(C)).toContain('projet: zzzzzzzz') // le lien déjà cassé reste : il ne visait pas une ligne supprimée
  })

  it('modifier une colonne sur plusieurs lignes : un fichier écrit par ligne, les autres champs intacts', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('taches', [A, C], 'statut', 'Terminé')
    await ecrire()
    expect(a.ecritures.sort()).toEqual([A, C])
    expect(await a.lire(C)).toContain('statut: Terminé\n')
    expect(await a.lire(A)).toContain('heures: 3\n')
  })

  it('vider une colonne sur plusieurs lignes retire le champ', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('taches', [A, B], 'heures', undefined)
    await ecrire()
    expect(await a.lire(A)).not.toContain('heures:')
    expect(await a.lire(B)).not.toContain('heures:')
  })

  it('une relation côté non propriétaire s’écrit dans les fichiers de la base liée', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('clients', ['clients/acme--c0000001.md', 'clients/globex--c0000002.md'], 'projets', ['p0000003'])
    await ecrire()
    // Un projet n'a qu'un fichier : lié aux deux clients, il porte les deux ids ; Navi et sinam quittent Acme.
    expect(await a.lire('projets/seul--p0000003.md')).toMatch(/client: \[c0000001, c0000002\]|client:\n {2}- c0000001\n {2}- c0000002/)
    expect(await a.lire('projets/navi--p0000001.md')).not.toContain('client:')
  })

  it('modifier le titre de plusieurs lignes renomme leurs fichiers', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.modifierLignes('taches', [A, B], 'titre', 'Relance')
    await ecrire()
    const noms = (await a.lister('taches')).map((e) => e.nom)
    expect(noms).toEqual(expect.arrayContaining(['relance--t0000001.md', 'relance--t0000002.md']))
  })

  it('une colonne calculée ne se modifie pas en lot', async () => {
    const { espace } = await ouvrir()
    await expect(espace.modifierLignes('projets', ['projets/navi--p0000001.md'], 'heures', 3)).rejects.toThrow('non modifiable')
  })

  it('dupliquer recopie valeurs, liens côté propriétaire et corps dans un nouveau fichier', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const [copie] = await espace.dupliquerLignes('taches', [A])
    await ecrire()
    expect(copie!.id).not.toBe('t0000001')
    const texte = await a.lire(copie!.chemin)
    for (const attendu of ['titre: A\n', 'projet: p0000001\n', 'statut: À faire\n', 'heures: 3\n', 'fait: true\n', 'echeance: 2026-10-01\n', 'À garder.']) expect(texte).toContain(attendu)
    expect(await a.lire(A)).toContain(`id: t0000001`)
  })
})

describe('coller un tableau dans une base', () => {
  it('première ligne qui nomme des colonnes : ce sont des en-têtes', async () => {
    const { espace } = await ouvrir()
    const r = espace.preparerCollage('taches', [['Titre', 'Heures', 'Inconnue'], ['X', '4', 'z']], ['titre', 'projet', 'statut'])
    expect(r).toEqual({ entetes: ['Titre', 'Heures', 'Inconnue'], cles: ['titre', 'heures', null], lignes: [['X', '4', 'z']] })
  })

  it('sans en-têtes : chaque valeur va dans la colonne affichée à la même place, sauf celles qu’on ne saisit pas', async () => {
    const { espace } = await ouvrir()
    const r = espace.preparerCollage('taches', [['X', 'p0000001', 'Terminé', '4']], ['titre', 'projet', 'statut'])
    expect(r).toEqual({ entetes: ['Titre', 'Projet', 'Statut', 'Colonne 4'], cles: ['titre', null, 'statut', null], lignes: [['X', 'p0000001', 'Terminé', '4']] })
  })
})

describe('coller sur des cellules (remplacement)', () => {
  const cible = (lignes: string[], colonnes: string[], hauteur = 1, largeur = 1) => ({ lignes, colonnes, hauteur, largeur })

  it('une grille remplace les cellules à partir de la case choisie, et s’annule d’un coup', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const r = espace.preparerRemplacement('taches', cible([A, B, C], ['statut', 'heures']), [
      ['Terminé', '1'],
      ['À faire', '2,5'],
    ])
    expect(r).toMatchObject({ lignes: 2, ignorees: 0, nouvelles: [], options: [] })
    await espace.appliquerRemplacement('taches', r)
    await ecrire()
    expect(await a.lire(A)).toContain('statut: Terminé\nheures: 1\n')
    expect(await a.lire(B)).toContain('statut: À faire\nheures: 2.5\n')
    expect(await a.lire(C)).not.toContain('statut:')
    await espace.annuler()
    await ecrire()
    expect(await a.lire(A)).toContain('statut: À faire\nheures: 3\n')
  })

  it('une valeur seule collée sur une zone la remplit toute', async () => {
    const { espace } = await ouvrir()
    const r = espace.preparerRemplacement('taches', cible([A, B, C], ['heures', 'fait'], 3, 1), [['4']])
    expect(r.modifs.map((m) => [m.chemin, m.cle, m.valeur])).toEqual([
      [A, 'heures', 4],
      [B, 'heures', 4],
      [C, 'heures', 4],
    ])
  })

  it('au-delà de la dernière ligne, des lignes nouvelles ; hors des colonnes ou illisible, ignoré', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const r = espace.preparerRemplacement('taches', cible([C], ['titre', 'heures']), [
      ['C2', 'beaucoup'],
      ['D', '1', 'en trop'],
    ])
    expect(r).toMatchObject({ lignes: 1, ignorees: 2, nouvelles: [{ titre: 'D', heures: 1 }] })
    await espace.appliquerRemplacement('taches', r)
    await ecrire()
    expect((await a.lister('taches')).map((e) => e.nom)).toEqual(expect.arrayContaining(['c2--t0000003.md']))
    expect((await a.lister('taches')).some((e) => e.nom.startsWith('d--'))).toBe(true)
  })

  it('relation lue par titres ; option inconnue créée ; colonne calculée ignorée', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const r = espace.preparerRemplacement('taches', cible([A], ['projet', 'statut']), [['sinam, NAVI', 'bloqué']])
    expect(r.modifs.map((m) => m.valeur)).toEqual([['p0000002', 'p0000001'], 'bloqué'])
    expect(r.options).toEqual([{ cle: 'statut', label: 'bloqué' }])
    await espace.appliquerRemplacement('taches', r)
    await ecrire()
    expect(await a.lire('taches/_schema.yaml')).toContain('bloqué')
    expect(espace.preparerRemplacement('projets', cible(['projets/navi--p0000001.md'], ['heures']), [['4']]).ignorees).toBe(1)
    expect(espace.preparerRemplacement('taches', cible([A], ['projet']), [['Inconnu']]).ignorees).toBe(1)
  })

  it('une case collée vide efface la valeur', async () => {
    const { a, espace, ecrire } = await ouvrir()
    await espace.appliquerRemplacement('taches', espace.preparerRemplacement('taches', cible([A], ['heures']), [['']]))
    await ecrire()
    expect(await a.lire(A)).not.toContain('heures:')
  })
})
