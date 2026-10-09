import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DepotEspace } from '../../core/depot-espace'
import { AdaptateurNode } from '../commun/fichiers-node'
import { executer, outilsMcp } from '../../core/ia/mcp'

const AUJOURDHUI = '2026-10-07'
let racine: string
let espace: DepotEspace

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), 'mdbase-mcp-'))
  await cp('exemples/espace-demo', racine, { recursive: true })
  espace = await DepotEspace.ouvrir(new AdaptateurNode(racine), {
    aleatoire: (n) => crypto.getRandomValues(new Uint8Array(n)),
    planifier: (action, ms) => {
      const t = setTimeout(action, ms)
      return () => clearTimeout(t)
    },
    aujourdhui: () => AUJOURDHUI,
  })
})
afterEach(() => rm(racine, { recursive: true, force: true }))

const appeler = (nom: string, args: unknown = {}) => executer(espace, nom, args, AUJOURDHUI)

describe('outils du serveur MCP', () => {
  it('ceux de l’assistant, sans ceux propres à la conversation dans l’app', () => {
    const outils = outilsMcp()
    const noms = outils.map((o) => o.name)
    expect(noms).toEqual(expect.arrayContaining(['decrire_espace', 'chercher_lignes', 'chercher_texte', 'lire_page', 'creer_lignes', 'modifier_lignes', 'creer_base', 'supprimer_base']))
    for (const absent of ['repondre', 'retenir', 'oublier', 'creer_skill']) expect(noms).not.toContain(absent)
    const par = (n: string) => outils.find((o) => o.name === n)!
    expect(par('chercher_lignes').annotations).toEqual({ readOnlyHint: true })
    expect(par('chercher_lignes').description).not.toContain('plus bas')
    expect(par('creer_lignes').annotations).toEqual({ readOnlyHint: false, destructiveHint: false })
    expect(par('supprimer_lignes').annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
    for (const o of outils) expect(o.inputSchema.type).toBe('object')
  })
})

describe('exécution', () => {
  it('décrit l’espace et lit les lignes', async () => {
    const d = await appeler('decrire_espace')
    expect(d.texte).toContain('projets « Projets »')
    expect(d.texte).toContain('statut « Statut » : choix parmi [À faire, En cours, Terminé]')
    const l = await appeler('chercher_lignes', { base: 'projets', filtres: [{ colonne: 'statut', operateur: 'egal', valeur: 'En cours' }] })
    expect(l.erreur).toBeUndefined()
    expect(l.texte).toMatch(/projets/)
  })

  it('crée des lignes : écrites sur le disque avant la réponse, avec leurs ids', async () => {
    const r = await appeler('creer_lignes', { base: 'projets', lignes: [{ titre: 'Refonte intranet', statut: 'en cours', budget: 1200 }] })
    expect(r.erreur).toBeUndefined()
    const fichier = (await readdir(join(racine, 'projets'))).find((f) => f.startsWith('refonte-intranet--'))!
    expect(fichier).toBeDefined()
    const texte = await readFile(join(racine, 'projets', fichier), 'utf8')
    expect(texte).toContain('statut: En cours')
    expect(texte).toContain('budget: 1200')
    expect(r.texte).toContain(`projets | ${fichier.replace(/^refonte-intranet--|\.md$/g, '')} | Refonte intranet`)
  })

  it('refuse une valeur invalide sans rien écrire', async () => {
    const avant = await readdir(join(racine, 'projets'))
    const r = await appeler('creer_lignes', { base: 'projets', lignes: [{ titre: 'X', statut: 'Bloqué' }] })
    expect(r.erreur).toBe(true)
    expect(r.texte).toMatch(/^Refusé, rien n'a été écrit : .*option parmi \[À faire, En cours, Terminé\]/)
    expect(await readdir(join(racine, 'projets'))).toEqual(avant)
  })

  it('relit le disque à chaque appel : voit une modification faite ailleurs', async () => {
    const chemin = join(racine, 'projets', 'site-vitrine--psite001.md')
    await writeFile(chemin, (await readFile(chemin, 'utf8')).replace(/^titre: .*$/m, 'titre: Site vitrine v2'))
    const r = await appeler('chercher_texte', { texte: 'vitrine v2' })
    expect(r.texte).toContain('psite001')
  })

  it('modifie par filtres et dit quand il n’y a rien à changer', async () => {
    const args = { base: 'projets', filtres: [{ colonne: 'statut', operateur: 'egal', valeur: 'Terminé' }], valeurs: { budget: 10 } }
    expect((await appeler('modifier_lignes', args)).texte).toMatch(/^Fait : Modifier/)
    expect((await appeler('modifier_lignes', args)).texte).toBe('Rien à changer : les valeurs sont déjà celles demandées.')
  })

  it('crée une base puis y écrit, dans deux appels', async () => {
    expect((await appeler('creer_base', { nom: 'Lectures', colonnes: [{ nom: 'Auteur', type: 'text' }] })).erreur).toBeUndefined()
    const r = await appeler('creer_lignes', { base: 'lectures', lignes: [{ titre: 'Dune', auteur: 'Herbert' }] })
    expect(r.erreur).toBeUndefined()
    expect((await readdir(join(racine, 'lectures'))).some((f) => f.startsWith('dune--'))).toBe(true)
  })

  it('outil inconnu ou propre à l’app : erreur', async () => {
    expect(await appeler('repondre', { texte: 'x' })).toEqual({ texte: 'Outil inconnu : repondre', erreur: true })
    expect((await appeler('nimporte')).erreur).toBe(true)
  })
})
