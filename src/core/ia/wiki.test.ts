import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { proposer } from './assistant'
import { executer, outilsMcp, serveurMcp } from './mcp'
import type { AppelOutil, ModeleIA, ReponseIA, RequeteIA } from './modele'
import { appliquerPlan, resumerPlan, validerAppel } from './plan'

// Outils du wiki (spec §22) : les mêmes pour le MCP et l'assistant, offerts
// seulement quand le module est actif.

const AUJOURDHUI = '2026-11-08'
const PAGES = {
  '_wiki/procedures--w0000001.md': '---\nid: w0000001\ntitre: Procédures\nordre: 1\n---\nLes procédures de l’équipe.\n',
  '_wiki/deploiement--w0000002.md': '---\nid: w0000002\ntitre: Déploiement\nparent: w0000001\nordre: 1\n---\nOn déploie le mardi.\n',
  '_wiki/glossaire--w0000003.md': '---\nid: w0000003\ntitre: Glossaire\nordre: 2\n---\n',
}

async function ouvrir(fichiers: Record<string, string> = PAGES) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...fichiers })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => AUJOURDHUI })
  const pages = () => espace.etat().wiki.pages
  const page = (titre: string) => pages().find((p) => p.titre === titre)
  return { a, espace, pages, page }
}

let n = 0
const appel = (nom: string, args: unknown): AppelOutil => ({ id: `appel${++n}`, nom, arguments: JSON.stringify(args) })
const NOMS_WIKI = ['lister_wiki', 'lire_wiki', 'chercher_wiki', 'ecrire_wiki', 'deplacer_wiki']

function modeleScripte(...reponses: ReponseIA[]): ModeleIA & { requetes: RequeteIA[] } {
  const requetes: RequeteIA[] = []
  const m = async (r: RequeteIA) => {
    requetes.push(structuredClone(r))
    const suivante = reponses.shift()
    if (!suivante) throw new Error('plus de réponse scriptée')
    return suivante
  }
  return Object.assign(m, { requetes })
}

describe('outils du wiki : présence', () => {
  it('MCP : offerts seulement avec le module ; un appel sans le module est refusé', async () => {
    expect(outilsMcp().map((o) => o.name)).not.toEqual(expect.arrayContaining(['lister_wiki']))
    const avec = outilsMcp(true)
    expect(avec.map((o) => o.name)).toEqual(expect.arrayContaining(NOMS_WIKI))
    expect(avec.find((o) => o.name === 'lire_wiki')?.annotations.readOnlyHint).toBe(true)
    expect(avec.find((o) => o.name === 'ecrire_wiki')?.annotations).toEqual({ readOnlyHint: false, destructiveHint: false })

    const { espace, pages } = await ouvrir()
    const r = await executer(espace, 'ecrire_wiki', { titre: 'Nouvelle' }, AUJOURDHUI)
    expect(r.erreur).toBe(true)
    expect(pages()).toHaveLength(3)
  })

  it('serveur de l’app : la liste suit le module, relu à chaque demande', async () => {
    const { espace } = await ouvrir()
    let actif = false
    const repondre = serveurMcp(espace, { version: '1', aujourdhui: () => AUJOURDHUI, wiki: () => actif })
    const lister = async () => JSON.parse((await repondre(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })))!).result.tools.map((t: { name: string }) => t.name)
    expect(await lister()).not.toContain('ecrire_wiki')
    actif = true
    expect(await lister()).toEqual(expect.arrayContaining(NOMS_WIKI))
  })

  it('assistant : offerts avec `wiki`, absents sinon', async () => {
    const { espace } = await ouvrir()
    const sans = modeleScripte({ texte: 'ok', appels: [] })
    await proposer(sans, espace, 'Bonjour', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    expect(sans.requetes[0]!.outils.map((o) => o.nom)).not.toContain('lister_wiki')
    const avec = modeleScripte({ texte: 'ok', appels: [] })
    await proposer(avec, espace, 'Bonjour', { aujourdhui: AUJOURDHUI, baseOuverte: null, wiki: true })
    expect(avec.requetes[0]!.outils.map((o) => o.nom)).toEqual(expect.arrayContaining(NOMS_WIKI))
    expect(avec.requetes[0]!.messages[0]!.contenu).toContain('## Wiki\n3 pages')
  })
})

describe('outils du wiki : lecture', () => {
  it('lister, lire (par id, titre ou lien), chercher sans accents', async () => {
    const { espace } = await ouvrir()
    const lire = (nom: string, args: unknown) => executer(espace, nom, args, AUJOURDHUI, undefined, true).then((r) => r.texte)
    expect(await lire('lister_wiki', {})).toBe(
      ['3 pages :', '- Procédures (id w0000001, 27 caractères)', '  - Déploiement (id w0000002, 20 caractères)', '- Glossaire (id w0000003, vide)'].join('\n'),
    )
    const page = await lire('lire_wiki', { page: 'deploiement' })
    expect(page).toContain('# Déploiement\nid : w0000002\nparent : Procédures (id w0000001)')
    expect(page).toContain('lien pour la citer : [[_wiki/deploiement--w0000002|Déploiement]]')
    expect(page).toContain('On déploie le mardi.')
    expect(await lire('lire_wiki', { page: '[[_wiki/procedures--w0000001|Procédures]]' })).toContain('sous-pages : Déploiement (id w0000002)')
    expect(await lire('lire_wiki', { page: 'w0000003' })).toContain('(page vide)')
    expect(await lire('lire_wiki', { page: 'Inconnue' })).toMatch(/^Erreur : page du wiki introuvable/)
    expect(await lire('chercher_wiki', { texte: 'DEPLOIE' })).toBe('1 page contient « DEPLOIE » (id | titre | où) :\nw0000002 | Déploiement | titre')
    expect(await lire('chercher_wiki', { texte: 'equipe' })).toBe("1 page contient « equipe » (id | titre | où) :\nw0000001 | Procédures | Les procédures de l’équipe.")
    expect(await lire('chercher_wiki', { texte: 'absent' })).toBe('Aucune page du wiki ne contient « absent ».')
  })
})

describe('outils du wiki : écriture', () => {
  it('MCP : créer une page sous une autre, compléter, renommer, ranger ; écrit aussitôt', async () => {
    const { a, espace, page } = await ouvrir()
    const faire = (nom: string, args: unknown) => executer(espace, nom, args, AUJOURDHUI, undefined, true)
    const cree = await faire('ecrire_wiki', { titre: 'Mise en production', parent: 'Procédures', contenu: 'Étape 1' })
    expect(cree).toEqual({ texte: 'Fait : Créer la page « Mise en production » sous « Procédures » : Étape 1' })
    const mep = page('Mise en production')!
    expect(mep).toMatchObject({ parent: 'w0000001', ordre: 2, corps: 'Étape 1\n' })
    expect(await a.lire(mep.chemin)).toContain('Étape 1')

    await faire('ecrire_wiki', { page: mep.id, contenu: 'Étape 2', mode: 'ajouter', titre: 'MEP' })
    const renommee = page('MEP')!
    expect(renommee.corps).toBe('Étape 1\n\nÉtape 2\n')
    expect(renommee.chemin).toMatch(/^_wiki\/mep--/)

    // En tête de la racine, devant Procédures.
    expect((await faire('deplacer_wiki', { page: 'MEP', parent: null, rang: 1 })).texte).toBe('Fait : Ranger la page « MEP » à la racine du wiki, en position 1')
    expect(page('MEP')).toMatchObject({ parent: null, ordre: 0 })
    const refus = await faire('deplacer_wiki', { page: 'Procédures', parent: 'Déploiement' })
    expect(refus).toMatchObject({ erreur: true, texte: expect.stringContaining('ne peut pas aller sous elle-même ni sous ses sous-pages') })
    expect((await faire('ecrire_wiki', { page: 'Glossaire', parent: 'Procédures', contenu: 'x' })).erreur).toBe(true)
    expect((await faire('ecrire_wiki', { contenu: 'sans titre' })).erreur).toBe(true)
  })

  it('assistant : une page et sa sous-page dans le même plan, rien d’écrit avant « Appliquer »', async () => {
    const { a, espace, page, pages } = await ouvrir()
    const modele = modeleScripte({
      texte: '',
      appels: [
        appel('ecrire_wiki', { titre: 'Outils', contenu: '# Outils' }),
        appel('ecrire_wiki', { titre: 'Jira', parent: 'Outils', contenu: 'Le suivi.' }),
        appel('ecrire_wiki', { page: 'Outils', contenu: 'Voir les sous-pages.', mode: 'ajouter' }),
      ],
    })
    const p = await proposer(modele, espace, 'Documente nos outils', { aujourdhui: AUJOURDHUI, baseOuverte: null, wiki: true })
    if (p.type !== 'plan') throw new Error('plan attendu')
    expect(resumerPlan(p.plan).split('\n')).toEqual([
      'Créer la page « Outils » à la racine du wiki : # Outils',
      'Créer la page « Jira » sous « Outils » : Le suivi.',
      'Page « Outils » du wiki : compléter le contenu : Voir les sous-pages.',
    ])
    expect(pages()).toHaveLength(3)
    const avant = a.ecritures.length
    expect(avant).toBe(0)

    await appliquerPlan(espace, p.plan)
    await espace.vider()
    const outils = page('Outils')!
    expect(outils).toMatchObject({ parent: null, ordre: 3, corps: '# Outils\n\nVoir les sous-pages.\n' })
    expect(page('Jira')).toMatchObject({ parent: outils.id, corps: 'Le suivi.\n' })
    expect(await a.lire(outils.chemin)).toContain('Voir les sous-pages.')
  })

  it('validation : page introuvable, titre en double, ranger une page que le plan crée', async () => {
    const { espace } = await ouvrir({ ...PAGES, '_wiki/glossaire--w0000004.md': '---\nid: w0000004\ntitre: Glossaire\n---\n' })
    const valider = (nom: string, args: unknown) => () => validerAppel(espace.etat(), appel(nom, args), { aujourdhui: AUJOURDHUI })
    expect(valider('ecrire_wiki', { page: 'Inconnue', contenu: 'x' })).toThrow(/introuvable/)
    expect(valider('ecrire_wiki', { page: 'Glossaire', contenu: 'x' })).toThrow(/plusieurs pages s'appellent « Glossaire » : désigne-la par son id \(w0000003, w0000004\)/)
    expect(valider('ecrire_wiki', { page: 'w0000004', contenu: 'x' })()).toMatchObject({ type: 'suite', action: { type: 'ecrire_wiki', page: { id: 'w0000004' } } })
  })
})
