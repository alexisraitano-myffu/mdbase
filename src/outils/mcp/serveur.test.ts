import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DepotEspace } from '../../core/depot-espace'
import { AdaptateurNode } from '../commun/fichiers-node'
import { createRequire } from 'node:module'
import { executer, outilsMcp } from '../../core/ia/mcp'
import { SessionSql } from '../../core/bi/calcul'
import { moteurNode } from '../../adapters/sql/duckdb-node'

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
    expect(noms).toEqual(expect.arrayContaining(['decrire_espace', 'chercher_lignes', 'chercher_texte', 'executer_sql', 'lire_page', 'creer_lignes', 'modifier_lignes', 'creer_base', 'supprimer_base']))
    for (const absent of ['repondre', 'retenir', 'oublier', 'creer_skill']) expect(noms).not.toContain(absent)
    const par = (n: string) => outils.find((o) => o.name === n)!
    expect(par('chercher_lignes').annotations).toEqual({ readOnlyHint: true })
    expect(par('chercher_lignes').description).not.toContain('plus bas')
    expect(par('creer_lignes').annotations).toEqual({ readOnlyHint: false, destructiveHint: false })
    expect(par('supprimer_lignes').annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
    expect(par('modifier_dashboard').annotations).toEqual({ readOnlyHint: false, destructiveHint: false })
    expect(par('retirer_bloc').annotations).toEqual({ readOnlyHint: false, destructiveHint: true })
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

// Analyse (spec §10 « Analyse ») : executer_sql et dashboards à requêtes, sur le vrai moteur.
describe('analyse par le MCP', () => {
  const sql = new SessionSql(() => moteurNode(createRequire(import.meta.url).resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm')))
  const appelerSql = (nom: string, args: unknown = {}) => executer(espace, nom, args, AUJOURDHUI, sql)

  it('executer_sql lit les bases en tables, et refuse ce qui n’est pas une lecture', async () => {
    const r = await appelerSql('executer_sql', { sql: 'select statut, count(*) as n from projets group by statut order by statut' })
    expect(r.texte).toBe('3 lignes ; colonnes : statut (texte), n (nombre)\nstatut | n\nEn cours | 2\nTerminé | 1\nÀ faire | 1')
    expect((await appelerSql('executer_sql', { sql: 'drop table projets' })).texte).toMatch(/^Erreur : SQL refusé/)
    expect((await appeler('executer_sql', { sql: 'select 1' })).texte).toBe('Erreur : moteur SQL indisponible ici')
  })

  it('creer_dashboard avec requêtes, paramètre et blocs d’analyse ; une requête fausse refuse tout', async () => {
    const refus = await appelerSql('creer_dashboard', {
      nom: 'Chiffres',
      requetes: { total: 'select count(*) as n from projetz' },
      rangees: [{ blocs: [{ type: 'valeur', donnees: 'total', valeur: 'n' }] }],
    })
    expect(refus).toMatchObject({ erreur: true, texte: expect.stringContaining('requête « total »') })
    expect(await readdir(join(racine, '_dashboards'))).not.toContain('chiffres.yaml')

    const colonne = await appelerSql('creer_dashboard', { nom: 'Chiffres', rangees: [{ blocs: [{ type: 'barres', sql: 'select statut, count(*) as n from projets group by statut', x: 'etat' }] }] })
    expect(colonne.texte).toContain('colonne etat absente du résultat (colonnes : statut, n)')

    const ok = await appelerSql('creer_dashboard', {
      nom: 'Chiffres',
      parametres: [{ nom: 'statut', type: 'choix', options: ['En cours', 'Terminé'] }],
      requetes: { total: 'select count(*) as n from projets where {{statut}} is null or statut = {{statut}}' },
      rangees: [
        { blocs: [{ type: 'valeur', titre: 'Projets', donnees: 'total', valeur: 'n', regles: [{ si: '> 3', couleur: 'rouge' }] }, { type: 'barres', sql: 'select statut, count(*) as n from projets group by statut', x: 'statut', y: 'n', largeur: 60 }] },
      ],
    })
    expect(ok.erreur).toBeUndefined()
    const texte = await readFile(join(racine, '_dashboards/chiffres.yaml'), 'utf8')
    expect(texte).toContain("requetes:\n  total: select count(*) as n from projets where {{statut}} is null or statut = {{statut}}\n")
    expect(texte).toContain('parametres:\n  - { nom: statut, type: choix, options: [ En cours, Terminé ] }\n')
    expect(texte).toContain("      - type: valeur\n        titre: Projets\n        donnees: total\n        valeur: n\n        regles:\n          - { si: \"> 3\", couleur: rouge }\n")

    const modif = await appelerSql('modifier_dashboard', {
      dashboard: 'Chiffres',
      operations: [
        { type: 'requete', nom: 'budget', sql: 'select sum(budget) as total from projets' },
        { type: 'modifier_bloc', rangee: 1, bloc: 2, nouveau_type: 'secteurs', titre: 'Répartition', y: null },
        { type: 'ajouter_bloc', nouveau: { type: 'valeur', donnees: 'budget', valeur: 'total', format: 'euros' } },
        { type: 'valeur_parametre', nom: 'statut', valeur: 'Terminé' },
      ],
    })
    expect(modif.erreur).toBeUndefined()
    const apres = await readFile(join(racine, '_dashboards/chiffres.yaml'), 'utf8')
    expect(apres).toContain('type: secteurs')
    expect(apres).toContain('titre: Répartition')
    expect(apres).toContain('{ type: valeur, donnees: budget, valeur: total, format: euros }')
    expect(apres).toContain('valeur: Terminé')

    const refusModif = await appelerSql('modifier_dashboard', { dashboard: 'Chiffres', operations: [{ type: 'requete', nom: 'total', sql: null }] })
    expect(refusModif.texte).toContain('sert encore')
    const inconnu = await appelerSql('modifier_dashboard', { dashboard: 'Chiffres', operations: [{ type: 'modifier_bloc', rangee: 1, bloc: 1, couleur_fond: 'rouge' }] })
    expect(inconnu.texte).toContain('réglage inconnu : couleur_fond')
    const decrit = await appelerSql('decrire_espace')
    expect(decrit.texte).toContain('- requête total : select count(*) as n from projets where {{statut}} is null or statut = {{statut}}')
    expect(decrit.texte).toContain("1. bloc d'analyse valeur « Projets », donnees: total, valeur: n, regles: > 3 → rouge")
  })
})
