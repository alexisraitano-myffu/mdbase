import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import { usagesModules } from './modules'

// Wiki de l'espace (spec §22) : `_wiki/` à plat, pages écrites comme des lignes.

async function ouvrir(fichiers: Record<string, string> = {}) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...fichiers })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-11-08', maintenant: () => '2026-11-08T10:00' })
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  const pages = () => espace.etat().wiki.pages
  return { a, espace, ecrire, pages }
}

describe('wiki', () => {
  it('sans `_wiki/`, le wiki est vide et n’est jamais une base ; la première page crée le dossier', async () => {
    const { a, espace, pages } = await ouvrir()
    expect(pages()).toEqual([])
    expect(espace.etat().bases.has('_wiki')).toBe(false)
    expect(usagesModules(espace.etat()).wiki).toBeUndefined()
    const p = await espace.creerPageWiki({ titre: 'Procédures' })
    expect(p.chemin).toMatch(/^_wiki\/procedures--[a-z0-9]{8}\.md$/)
    expect(await a.lire(p.chemin)).toBe(`---\nid: ${p.id}\ntitre: Procédures\nordre: 1\n_cree: 2026-11-08T10:00\n---\n`)
    expect(usagesModules(espace.etat()).wiki).toBe('Utilisé par 1 page')
    expect(espace.etat().bases.has('_wiki')).toBe(false)
  })

  it('sous-pages, corps, renommage du fichier selon le titre', async () => {
    const { a, espace, ecrire, pages } = await ouvrir()
    const parent = await espace.creerPageWiki({ titre: 'Procédures' })
    const p = await espace.creerPageWiki({ titre: 'Deploiement', parent: parent.id, corps: 'Étape 1' })
    const q = await espace.creerPageWiki({ titre: 'Recette', parent: parent.id })
    expect([p.ordre, q.ordre]).toEqual([1, 2])
    await ecrire()
    expect(await a.lire(p.chemin)).toContain(`parent: ${parent.id}\n`)
    expect(await a.lire(p.chemin)).toMatch(/---\nÉtape 1$/)
    await espace.renommerPageWiki(p.id, 'Déploiement en production')
    await ecrire()
    const renommee = pages().find((x) => x.id === p.id)!
    expect(renommee.chemin).toBe(`_wiki/deploiement-en-production--${p.id}.md`)
    expect(renommee.titre).toBe('Déploiement en production')
  })

  it('déplacer une page avec ses sous-pages ne réécrit que son fichier', async () => {
    const { a, espace, ecrire, pages } = await ouvrir()
    const x = await espace.creerPageWiki({ titre: 'X' })
    const y = await espace.creerPageWiki({ titre: 'Y' })
    const enfant = await espace.creerPageWiki({ titre: 'Enfant', parent: x.id })
    await ecrire()
    a.ecritures.length = 0
    espace.deplacerPageWiki(x.id, y.id, 0.5)
    await ecrire()
    expect(a.ecritures).toEqual([x.chemin])
    expect(pages().find((p) => p.id === x.id)).toMatchObject({ parent: y.id, ordre: 0.5 })
    expect(pages().find((p) => p.id === enfant.id)!.parent).toBe(x.id)
    expect(() => espace.deplacerPageWiki(y.id, enfant.id, 1)).toThrow(/sous elle-même/)
    // À la racine : la clé `parent` disparaît.
    espace.deplacerPageWiki(x.id, null, 3)
    await ecrire()
    expect(await a.lire(x.chemin)).not.toContain('parent:')
  })

  it('supprimer une page emporte ses sous-pages, et Ctrl+Z les rend toutes', async () => {
    const { a, espace, ecrire, pages } = await ouvrir()
    const x = await espace.creerPageWiki({ titre: 'X', corps: 'Texte de X' })
    const enfant = await espace.creerPageWiki({ titre: 'Enfant', parent: x.id })
    await espace.creerPageWiki({ titre: 'Autre' })
    await ecrire()
    expect(espace.porteeSuppressionPageWiki(x.id)).toEqual([x.id, enfant.id])
    await espace.supprimerPageWiki(x.id)
    expect(pages().map((p) => p.titre)).toEqual(['Autre'])
    await expect(a.lire(x.chemin)).rejects.toThrow()
    await espace.annuler()
    await ecrire()
    expect(pages().map((p) => p.titre).sort()).toEqual(['Autre', 'Enfant', 'X'])
    expect(await a.lire(x.chemin)).toContain('Texte de X')
  })

  it('une page écrite ailleurs (à la main, Obsidian, synchro) est lue, et ses clés inconnues gardées', async () => {
    const { a, espace, ecrire, pages } = await ouvrir({
      '_wiki/glossaire--g0000001.md': '---\nid: g0000001\ntitre: Glossaire\ntags: [doc]\n---\n# Termes\n',
      '_wiki/pas-une-page.md': 'pas de frontmatter',
      '_wiki/_modeles/decision.md': '---\nnom: Décision\n---\n',
    })
    expect(pages().map((p) => p.titre)).toEqual(['Glossaire'])
    expect(espace.etat().wiki.nonReconnus.map((n) => n.chemin)).toEqual(['_wiki/pas-une-page.md'])
    espace.modifierCorpsPageWiki('g0000001', '# Termes\n\nCOSUI : comité de suivi.\n')
    await ecrire()
    expect(await a.lire('_wiki/glossaire--g0000001.md')).toContain('tags: [doc]\n')
    // Une page ajoutée par la synchro apparaît à la relecture.
    await a.ecrire('_wiki/arrivee--n0000001.md', '---\nid: n0000001\ntitre: Arrivée\n---\n')
    expect(await espace.rafraichir()).toBe(true)
    expect(pages().map((p) => p.titre).sort()).toEqual(['Arrivée', 'Glossaire'])
  })

  it('une copie de conflit d’une page se voit comme un id en double', async () => {
    const texte = '---\nid: g0000001\ntitre: Glossaire\n---\n'
    const { espace } = await ouvrir({ '_wiki/glossaire--g0000001.md': texte, '_wiki/glossaire--g0000001-PC-Bureau.md': texte })
    expect(espace.etat().wiki.doublons.get('g0000001')).toHaveLength(2)
  })

  it('rétroliens : une page qui cite une ligne apparaît dans ses citations, et en sort quand la citation est retirée', async () => {
    const { espace, ecrire } = await ouvrir({ 'clients/acme--c0000001.md': '---\nid: c0000001\nnom: Acme\n---\nVoir [[projets/navi--p0000001|Navi]].\n' })
    const navi = { base: 'projets', id: 'p0000001' }
    expect(espace.citant(navi)).toEqual([{ base: 'clients', id: 'c0000001' }])
    const p = await espace.creerPageWiki({ titre: 'Procédures', corps: 'Le projet [[projets/ancien--p0000001|Navi]].' })
    expect(espace.citant(navi)).toEqual([{ base: 'clients', id: 'c0000001' }, { base: '_wiki', id: p.id }])
    const q = await espace.creerPageWiki({ titre: 'Index', corps: `[[_wiki/procedures--${p.id}]]` })
    expect(espace.citant({ base: '_wiki', id: p.id })).toEqual([{ base: '_wiki', id: q.id }])
    espace.modifierCorpsPageWiki(p.id, 'Plus de lien.')
    expect(espace.citant(navi)).toEqual([{ base: 'clients', id: 'c0000001' }])
    await ecrire()
  })

  it('recherche : un mot du corps d’une page la trouve ; jamais l’id du parent, jamais pour l’assistant', async () => {
    const { espace, ecrire } = await ouvrir()
    const parent = await espace.creerPageWiki({ titre: 'Procédures' })
    const p = await espace.creerPageWiki({ titre: 'Déploiement', parent: parent.id, corps: 'Redémarrer le serveur hyperion après la mise en ligne.' })
    expect(espace.chercher('hyperion')).toMatchObject([{ base: '_wiki', ligne: p.id, titre: 'Déploiement' }])
    expect(espace.chercher('hyperion')[0]!.extrait).toContain('serveur hyperion')
    expect(espace.chercher(parent.id)).toEqual([])
    expect(espace.candidats('le serveur hyperion')).toEqual([])
    await espace.supprimerPageWiki(p.id)
    expect(espace.chercher('hyperion')).toEqual([])
    await ecrire()
  })
})
