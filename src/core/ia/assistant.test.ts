import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { proposer } from './assistant'
import type { AppelOutil, ModeleIA, RequeteIA, ReponseIA } from './modele'
import { decrireEspace } from './outils'
import { appliquerPlan, ErreurProposition, validerAppel, type Plan } from './plan'

const AUJOURDHUI = '2026-09-25'

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur({ ...fichiers })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => AUJOURDHUI })
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire }
}

let n = 0
const appel = (nom: string, args: unknown): AppelOutil => ({ id: `appel${++n}`, nom, arguments: JSON.stringify(args) })
const valider = (espace: DepotEspace, nom: string, args: unknown) => validerAppel(espace.etat(), appel(nom, args), { aujourdhui: AUJOURDHUI })
const operation = (espace: DepotEspace, nom: string, args: unknown) => {
  const r = valider(espace, nom, args)
  if (r.type !== 'operation') throw new Error('opération attendue')
  return r.operation
}

/** Modèle scripté : renvoie les réponses dans l'ordre et garde les requêtes reçues. */
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

describe('contexte envoyé au modèle', () => {
  it('schémas, options, relations, colonnes calculées en lecture seule, et toutes les lignes d’un petit espace', async () => {
    const { espace } = await ouvrir()
    const texte = decrireEspace(espace.etat(), { aujourdhui: AUJOURDHUI, baseOuverte: 'taches', candidats: [] })
    expect(texte).toContain('- statut « Statut » : choix parmi [À faire, Terminé]')
    expect(texte).toContain('- projet « Projet » : relation vers projets')
    expect(texte).toContain('- heures « Heures » : calculée (lecture seule)')
    expect(texte).toContain('- titre « Titre » : texte (titre de la ligne)')
    expect(texte).toContain("Aujourd'hui : 2026-09-25 (vendredi)")
    expect(texte).toContain('t0000001 | A | projet: [p0000001] ; statut: À faire ; heures: 3 ; fait: true ; echeance: 2026-10-01')
    expect(texte).toContain('c0000001 | Acme | projets: [p0000001, p0000002] ; heures: 10')
  })

  it('au-delà de 150 lignes : seulement la base ouverte et les lignes proches de la demande', async () => {
    const fichiers = { ...FICHIERS_RELATIONS }
    for (let i = 0; i < 160; i++) fichiers[`taches/t${i}--x${String(i).padStart(7, '0')}.md`] = `---\nid: x${String(i).padStart(7, '0')}\ntitre: Tâche ${i}\n---\n`
    const { espace } = await ouvrir(fichiers)
    const texte = decrireEspace(espace.etat(), { aujourdhui: AUJOURDHUI, baseOuverte: 'projets', candidats: espace.candidats('relancer Globex') })
    expect(texte).toContain('extrait, 168 lignes au total')
    expect(texte).toContain('p0000003 | Seul')
    expect(texte).toContain('c0000002 | Globex')
    expect(texte).not.toContain('Acme')
    expect(texte).not.toContain('Tâche 12')
  })
})

describe('validation des appels', () => {
  it('valeurs converties comme une saisie : option sans accent, nombre à la française, date JJ/MM/AAAA', async () => {
    const { espace } = await ouvrir()
    const op = operation(espace, 'modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'termine', heures: '4,5', echeance: '05/10/2026', fait: false } })
    expect(op.lignes).toEqual([
      {
        id: 't0000001',
        titre: 'A',
        valeurs: { statut: 'Terminé', heures: 4.5, echeance: '2026-10-05', fait: false },
        changements: [
          { colonne: 'Statut', avant: 'À faire', apres: 'Terminé' },
          { colonne: 'Heures', avant: '3', apres: '4,5' },
          { colonne: 'Échéance', avant: '2026-10-01', apres: '2026-10-05' },
          { colonne: 'Fait', avant: 'oui', apres: 'non' },
        ],
      },
    ])
  })

  it('colonnes et bases retrouvées aussi par leur nom, ligne par un titre unique', async () => {
    const { espace } = await ouvrir()
    const op = operation(espace, 'modifier_lignes', { base: 'Tâches', lignes: ['B'], valeurs: { Échéance: null } })
    expect(op.lignes.map((l) => [l.id, l.valeurs])).toEqual([['t0000002', { echeance: undefined }]])
  })

  it('filtres : toutes les lignes qui correspondent, colonnes calculées comprises ; les lignes déjà à jour sont écartées', async () => {
    const { espace } = await ouvrir()
    const op = operation(espace, 'modifier_lignes', {
      base: 'taches',
      filtres: [{ colonne: 'echeance', operateur: 'avant', valeur: AUJOURDHUI }],
      valeurs: { statut: 'Terminé' },
    })
    expect(op.lignes).toEqual([]) // B est la seule en retard, et déjà terminée
    const projets = operation(espace, 'modifier_lignes', { base: 'projets', filtres: [{ colonne: 'heures', operateur: 'superieur', valeur: 1 }], valeurs: { client: ['Globex'] } })
    expect(projets.lignes.map((l) => [l.titre, l.changements])).toEqual([
      ['Navi', [{ colonne: 'Client', avant: 'Acme', apres: 'Globex' }]],
      ['sinam', [{ colonne: 'Client', avant: 'Acme', apres: 'Globex' }]],
    ])
  })

  it.each([
    ['colonne inconnue', { base: 'taches', lignes: ['t0000001'], valeurs: { priorite: 'haute' } }, /colonne inconnue dans taches : « priorite » \(colonnes : titre, projet/],
    ['option inexistante', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Bloqué' } }, /statut : option parmi \[À faire, Terminé\]/],
    ['colonne calculée', { base: 'projets', lignes: ['p0000001'], valeurs: { heures: 3 } }, /heures est une colonne calculée/],
    ['ligne inconnue', { base: 'taches', lignes: ['t9999999'], valeurs: { fait: true } }, /ligne inconnue dans taches/],
    ['nombre illisible', { base: 'taches', lignes: ['t0000001'], valeurs: { heures: 'beaucoup' } }, /heures : nombre attendu/],
    ['opérateur impossible', { base: 'taches', filtres: [{ colonne: 'fait', operateur: 'contient', valeur: 'x' }], valeurs: { fait: true } }, /opérateur « contient » impossible sur fait/],
    ['aucune ligne désignée', { base: 'taches', valeurs: { fait: true } }, /désigner les lignes/],
    ['base inconnue', { base: 'factures', lignes: [], valeurs: {} }, /base inconnue : « factures »/],
  ])('refus : %s', async (_, args, message) => {
    const { espace } = await ouvrir()
    expect(() => valider(espace, 'modifier_lignes', args)).toThrow(ErreurProposition)
    expect(() => valider(espace, 'modifier_lignes', args)).toThrow(message)
  })

  it('refus : arguments illisibles, outil inconnu', async () => {
    const { espace } = await ouvrir()
    expect(() => validerAppel(espace.etat(), { id: 'x', nom: 'creer_lignes', arguments: '{base:' }, { aujourdhui: AUJOURDHUI })).toThrow(/illisibles/)
    expect(() => valider(espace, 'supprimer_tout', {})).toThrow(/outil inconnu/)
  })
})

describe('proposer', () => {
  it('une seule requête au modèle quand tout est valide ; rien n’est écrit', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const modele = modeleScripte({ texte: '', appels: [appel('modifier_lignes', { base: 'taches', lignes: ['t0000003'], valeurs: { statut: 'Terminé' } })] })
    const p = await proposer(modele, espace, 'Termine la tâche C', { aujourdhui: AUJOURDHUI, baseOuverte: 'taches' })
    expect(p.type).toBe('plan')
    expect(modele.requetes).toHaveLength(1)
    expect(modele.requetes[0]!.outils.map((o) => o.nom)).toEqual(['modifier_lignes', 'creer_lignes', 'repondre'])
    expect(modele.requetes[0]!.messages[1]).toEqual({ role: 'user', contenu: 'Termine la tâche C' })
    await ecrire()
    expect(a.ecritures).toEqual([])
  })

  it('un appel refusé est renvoyé au modèle avec l’erreur, une fois', async () => {
    const { espace } = await ouvrir()
    const faux = appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Fini' } })
    const modele = modeleScripte(
      { texte: '', appels: [faux] },
      { texte: '', appels: [appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Terminé' } })] },
    )
    const p = await proposer(modele, espace, 'A est finie', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    expect(p.type === 'plan' && p.plan.operations[0]!.lignes[0]!.valeurs).toEqual({ statut: 'Terminé' })
    const relance = modele.requetes[1]!.messages
    expect(relance[2]).toEqual({ role: 'assistant', contenu: '', appels: [faux] })
    expect(relance[3]).toMatchObject({ role: 'tool', idAppel: faux.id, contenu: expect.stringContaining('option parmi [À faire, Terminé]') })
  })

  it('deux refus de suite : erreur montrée à l’utilisateur, rien d’appliqué', async () => {
    const { espace } = await ouvrir()
    const faux = () => ({ texte: '', appels: [appel('modifier_lignes', { base: 'taches', lignes: ['zz'], valeurs: { fait: true } })] })
    await expect(proposer(modeleScripte(faux(), faux()), espace, 'x', { aujourdhui: AUJOURDHUI, baseOuverte: null })).rejects.toThrow(/Proposition refusée : ligne inconnue/)
  })

  it('texte sans appel ou outil `repondre` : une réponse, raisonnement <think> retiré', async () => {
    const { espace } = await ouvrir()
    const texte = await proposer(modeleScripte({ texte: '<think>hmm</think>\nQuelle tâche ?', appels: [] }), espace, 'x', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    expect(texte).toEqual({ type: 'reponse', texte: 'Quelle tâche ?' })
    const outil = await proposer(modeleScripte({ texte: '', appels: [appel('repondre', { texte: 'Laquelle des deux ?' })] }), espace, 'x', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    expect(outil).toEqual({ type: 'reponse', texte: 'Laquelle des deux ?' })
  })
})

describe('application d’un plan confirmé', () => {
  it('modifications, relation côté non propriétaire, titre qui renomme le fichier, création', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const plan: Plan = {
      operations: [
        operation(espace, 'modifier_lignes', { base: 'taches', lignes: ['t0000003'], valeurs: { statut: 'Terminé', titre: 'C bis' } }),
        operation(espace, 'modifier_lignes', { base: 'clients', lignes: ['c0000002'], valeurs: { projets: ['p0000003'] } }),
        operation(espace, 'creer_lignes', { base: 'taches', lignes: [{ titre: 'Relancer Globex', projet: 'Seul', echeance: '2026-10-02' }] }),
      ],
    }
    expect(await appliquerPlan(espace, plan)).toBe(3)
    await ecrire()

    const taches = (await a.lister('taches')).map((e) => e.nom)
    expect(taches).toContain('c-bis--t0000003.md')
    expect(await a.lire('taches/c-bis--t0000003.md')).toContain('statut: Terminé')
    // Relation non propriétaire : le lien s'écrit dans le projet, côté propriétaire.
    expect(await a.lire('projets/seul--p0000003.md')).toContain('client: c0000002')
    const nouvelle = taches.find((t) => t.startsWith('relancer-globex--'))!
    expect(await a.lire(`taches/${nouvelle}`)).toMatch(/titre: Relancer Globex\nprojet: p0000003\necheance: 2026-10-02/)
  })
})
