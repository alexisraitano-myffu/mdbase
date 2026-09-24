import { describe, expect, it } from 'vitest'
import { AdaptateurMemoire } from './adaptateur-memoire'
import { FichierIntrouvable } from './fichiers'

describe('AdaptateurMemoire', () => {
  it('lit ce qui a été écrit', async () => {
    const a = new AdaptateurMemoire()
    await a.ecrire('projets/navi--k2x9m4pq.md', '---\nid: k2x9m4pq\n---\n')
    expect(await a.lire('projets/navi--k2x9m4pq.md')).toBe('---\nid: k2x9m4pq\n---\n')
  })

  it("crée les dossiers parents à l'écriture", async () => {
    const a = new AdaptateurMemoire()
    await a.ecrire('projets/_vues/tableau.yaml', 'id: tableau\n')
    expect(await a.lister('')).toEqual([{ nom: 'projets', type: 'dossier' }])
    expect(await a.lister('projets')).toEqual([{ nom: '_vues', type: 'dossier' }])
  })

  it('liste les entrées directes seulement, triées', async () => {
    const a = new AdaptateurMemoire({
      '_espace.yaml': 'version: 1\n',
      'taches/b.md': '',
      'taches/a.md': '',
      'taches/_vues/v.yaml': '',
    })
    expect(await a.lister('taches')).toEqual([
      { nom: '_vues', type: 'dossier' },
      { nom: 'a.md', type: 'fichier' },
      { nom: 'b.md', type: 'fichier' },
    ])
  })

  it('renomme un fichier sans toucher à son contenu', async () => {
    const a = new AdaptateurMemoire({ 'p/ancien--x.md': 'contenu' })
    await a.renommer('p/ancien--x.md', 'p/nouveau--x.md')
    expect(await a.lire('p/nouveau--x.md')).toBe('contenu')
    await expect(a.lire('p/ancien--x.md')).rejects.toBeInstanceOf(FichierIntrouvable)
  })

  it('supprime un fichier', async () => {
    const a = new AdaptateurMemoire({ 'p/x.md': '' })
    await a.supprimer('p/x.md')
    expect(await a.lister('p')).toEqual([])
  })

  it("date chaque écriture avec l'horloge injectée", async () => {
    let t = 1000
    const a = new AdaptateurMemoire({}, () => t)
    await a.ecrire('x.md', 'v1')
    expect(await a.dateModification('x.md')).toBe(1000)
    t = 2000
    await a.ecrire('x.md', 'v2')
    expect(await a.dateModification('x.md')).toBe(2000)
  })

  it('signale un chemin introuvable par une erreur typée', async () => {
    const a = new AdaptateurMemoire()
    await expect(a.lire('absent.md')).rejects.toBeInstanceOf(FichierIntrouvable)
    await expect(a.lister('absent')).rejects.toBeInstanceOf(FichierIntrouvable)
    await expect(a.dateModification('absent.md')).rejects.toBeInstanceOf(FichierIntrouvable)
  })
})
