import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir(fichiers = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-24' })
  a.ecritures = []
  return { a, m, espace }
}

const titres = (e: DepotEspace, base: string) =>
  e.etat().bases.get(base)!.depot!.lignes().map((l) => {
    const t = l.cellules.titre ?? l.cellules.nom
    return t?.etat === 'ok' ? t.valeur : '?'
  })
const valeur = (e: DepotEspace, base: string, id: string, cle: string) => {
  const l = e.etat().bases.get(base)!.depot!.lignes().find((x) => x.id === id)
  const c = l?.cellules[cle] ?? e.etat().calculs.get(base)?.get(id)?.[cle]
  return c?.etat === 'ok' ? c.valeur : c
}

describe('rafraîchir un espace depuis le disque (changements externes)', () => {
  it('ne change rien, n’écrit rien et garde les mêmes objets quand le disque n’a pas bougé', async () => {
    const { a, espace } = await ouvrir()
    const avant = espace.etat()
    expect(await espace.rafraichir()).toBe(false)
    expect(espace.etat()).toBe(avant)
    expect(a.ecritures).toEqual([])
  })

  it('relit une ligne modifiée, ajoute une ligne apparue, retire une ligne disparue ; les calculs suivent', async () => {
    const { a, espace } = await ouvrir()
    await a.ecrire('taches/b--t0000002.md', '---\nid: t0000002\ntitre: B modifiée\nprojet: p0000001\nheures: 7\n---\n')
    await a.ecrire('taches/d--t0000004.md', '---\nid: t0000004\ntitre: D\nprojet: p0000001\nheures: 1\n---\n')
    await a.supprimer('taches/a--t0000001.md')
    a.ecritures = []

    expect(await espace.rafraichir()).toBe(true)
    expect(titres(espace, 'taches')).toEqual(['B modifiée', 'C', 'D'])
    expect(valeur(espace, 'projets', 'p0000001', 'heures')).toBe(8)
    expect(espace.chercher('modifiee').map((r) => r.ligne)).toEqual(['t0000002'])
    expect(a.ecritures).toEqual([])
  })

  it('garde par-dessus la nouvelle version une modification pas encore écrite, puis la réapplique sur elle', async () => {
    const { a, m, espace } = await ouvrir()
    const depot = espace.etat().bases.get('taches')!.depot!
    depot.modifier('taches/b--t0000002.md', 'heures', 9)
    await a.ecrire('taches/b--t0000002.md', '---\nid: t0000002\ntitre: B distante\nprojet: p0000001\nheures: 5\n---\n')

    await espace.rafraichir()
    expect([valeur(espace, 'taches', 't0000002', 'titre'), valeur(espace, 'taches', 't0000002', 'heures')]).toEqual(['B distante', 9])
    m.avancer()
    await espace.vider()
    expect(await a.lire('taches/b--t0000002.md')).toBe('---\nid: t0000002\ntitre: B distante\nprojet: p0000001\nheures: 9\n---\n')
  })

  it('une ligne devenue illisible sort de la base et passe dans les fichiers non reconnus', async () => {
    const { a, espace } = await ouvrir()
    await a.ecrire('taches/c--t0000003.md', 'plus de frontmatter')
    await espace.rafraichir()
    expect(titres(espace, 'taches')).toEqual(['A', 'B'])
    const b = espace.etat().bases.get('taches')!
    expect(b.chargement.ok && b.chargement.base.nonReconnus.map((n) => n.chemin)).toEqual(['taches/c--t0000003.md'])
  })

  it('relit un schéma, une vue, la barre latérale et une nouvelle base modifiés ailleurs', async () => {
    const { a, espace } = await ouvrir()
    const schema = (await a.lire('taches/_schema.yaml')).replace('{ cle: heures, nom: Heures,', '{ cle: heures, nom: Temps passé,')
    await a.ecrire('taches/_schema.yaml', schema)
    await a.ecrire('taches/_vues/kanban.yaml', 'nom: Kanban\ntype: kanban\ngroupe: statut\n')
    await a.ecrire('_espace.yaml', 'version: 1\nbarre_laterale:\n  groupes:\n    - nom: Perso\n      bases: [lectures]\n')
    await a.ecrire('lectures/_schema.yaml', 'nom: Lectures\nchamp_titre: titre\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n')
    await a.ecrire('lectures/dune--l0000001.md', '---\nid: l0000001\ntitre: Dune\n---\n')

    expect(await espace.rafraichir()).toBe(true)
    const etat = espace.etat()
    expect(etat.bases.get('taches')!.depot!.schema.colonnes.find((c) => c.cle === 'heures')!.nom).toBe('Temps passé')
    expect(etat.bases.get('taches')!.vues.map((v) => v.id)).toEqual(['kanban'])
    expect(etat.groupes).toEqual([{ nom: 'Perso', bases: ['lectures'] }])
    expect(titres(espace, 'lectures')).toEqual(['Dune'])
  })

  it('un schéma devenu illisible garde la dernière version lisible et le signale', async () => {
    const { a, espace } = await ouvrir()
    await a.ecrire('taches/_schema.yaml', 'colonnes: [ pas fermé')
    await espace.rafraichir()
    const b = espace.etat().bases.get('taches')!
    expect(b.depot!.schema.nom).toBe('Tâches')
    expect(b.chargement.ok && b.chargement.base.avertissements[0]).toMatch(/illisible sur le disque/)
  })

  it('un dossier qui perd son _schema.yaml n’est plus une base, et le redevient quand il revient', async () => {
    const { a, espace } = await ouvrir()
    await a.supprimer('clients/_schema.yaml')
    await espace.rafraichir()
    expect(espace.etat().bases.get('clients')).toMatchObject({ chargement: { ok: false, raison: 'pas de _schema.yaml' }, depot: null })
    await a.ecrire('clients/_schema.yaml', FICHIERS_RELATIONS['clients/_schema.yaml']!)
    await espace.rafraichir()
    expect(titres(espace, 'clients')).toEqual(['Acme', 'Globex'])
  })

  it('une modification de vue faite pendant le rafraîchissement n’est pas effacée', async () => {
    const { espace } = await ouvrir()
    const rafraichi = espace.rafraichir()
    const ecrite = espace.modifierVue('taches', 'tableau', { nom: 'Tout' })
    expect(espace.etat().bases.get('taches')!.vues[0]!.nom).toBe('Tout')
    await rafraichi
    expect(espace.etat().bases.get('taches')!.vues[0]!.nom).toBe('Tout')
    await ecrite
    await espace.rafraichir()
    expect(espace.etat().bases.get('taches')!.vues[0]!.nom).toBe('Tout')
  })

  it('ne crée jamais de doublon avec un renommage ou une création de l’app faits pendant la relecture', async () => {
    const { espace } = await ouvrir()
    const depot = espace.etat().bases.get('taches')!.depot!
    depot.modifier('taches/a--t0000001.md', 'titre', 'Alpha')
    const r1 = espace.rafraichir()
    const renomme = depot.renommerSelonTitre('taches/a--t0000001.md')
    const cree = depot.creer({ titre: 'Nouvelle' })
    await Promise.all([r1, renomme, cree])
    await espace.rafraichir()
    expect(titres(espace, 'taches')).toEqual(['Alpha', 'B', 'C', 'Nouvelle'])
    expect(depot.lignes()[0]!.chemin).toBe('taches/alpha--t0000001.md')
  })
})
