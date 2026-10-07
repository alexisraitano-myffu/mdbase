import { describe, expect, it } from 'vitest'
import { DepotEspace } from '../depot-espace'
import { FICHIERS_RELATIONS } from '../fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from '../fixtures/outils'
import { proposer } from './assistant'
import { insererRemarque, lireDocuments, type DocumentConnaissance } from './connaissance'
import type { AppelOutil, ModeleIA, RequeteIA, ReponseIA } from './modele'
import { appliquerPlan } from './plan'

const AUJOURDHUI = '2026-10-07'

async function ouvrir(fichiers: Record<string, string> = {}) {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS, ...fichiers })
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

const DOC_S40 = `---
titre: Point hebdo Navi S40
source: navi-s40.pptx
date: 2026-09-30
ajoute: 2026-09-30T10:00
lignes: [projets/p0000001]
---

## Diapositive 1 : Navi
Livraison de la V2 prévue le 15 octobre.
`

describe('remarque dans une page', () => {
  it('à la fin de la section, créée si elle manque, le reste de la page intact', () => {
    const page = '# Navi\n\nIntro.\n\n## Remarques\n\n- 01/10/2026 : ancienne\n\n## Décisions\n\n- garder X\n'
    expect(insererRemarque(page, 'remarques', '07/10/2026 : nouvelle')).toBe(
      '# Navi\n\nIntro.\n\n## Remarques\n\n- 01/10/2026 : ancienne\n- 07/10/2026 : nouvelle\n\n## Décisions\n\n- garder X\n',
    )
    expect(insererRemarque('Intro.\n', 'Points d’attention', 'risque')).toBe('Intro.\n\n## Points d’attention\n\n- risque\n')
    expect(insererRemarque('', undefined, 'a')).toBe('- a\n')
    // Section vide suivie d'une autre : l'entrée se glisse entre les deux.
    expect(insererRemarque('## Remarques\n## Décisions\n- d\n', 'Remarques', 'r')).toBe('## Remarques\n\n- r\n\n## Décisions\n- d\n')
  })
})

describe('documents', () => {
  const doc = (id: string, date: string, texte: string, remplacePar?: string): DocumentConnaissance => ({ id, titre: id, date, ajoute: `${date}T09:00`, lignes: [], texte, ...(remplacePar ? { remplacePar } : {}) })

  it('chercher : passages avec leur document et sa date, sans accents ; les remplacés exclus par défaut', () => {
    const docs = [doc('s41', '2026-10-07', 'La recette du lot 2 est décalée.'), doc('s40', '2026-09-30', 'Recette du lot 2 en avance.', 's41')]
    const r = lireDocuments(docs, appel('chercher_documents', { texte: 'decalee recette' }))
    expect(r).toContain('--- s41 | 2026-10-07 | s41')
    expect(r).not.toContain('s40')
    expect(lireDocuments(docs, appel('chercher_documents', { texte: 'recette', inclure_remplaces: true }))).toContain('s40 | 2026-09-30 | s40 (remplacé)')
    expect(lireDocuments(docs, appel('lire_document', { document: 's40' }))).toContain('REMPLACÉ par s41')
    expect(lireDocuments(docs, appel('lire_document', { document: 'zz' }))).toMatch(/^Erreur : document inconnu/)
  })
})

describe('inbox', () => {
  it('déposer puis relire ; le contexte et les documents partent dans le message système', async () => {
    const { espace } = await ouvrir({ '_assistant/contexte.md': 'Projet → Tâches. Les remarques vont en section « Remarques ».\n', '_assistant/documents/2026-09-30--point-hebdo-navi-s40.md': DOC_S40 })
    await espace.assistant.connaissance.deposer({ titre: 'Remarque Navi', texte: 'La tâche A est terminée.' }, '2026-10-07T09:15:02')
    const c = await espace.assistant.connaissance.lire()
    expect(c.inbox).toEqual([{ id: '20261007-091502--remarque-navi', titre: 'Remarque Navi', recu: '2026-10-07T09:15', texte: 'La tâche A est terminée.' }])
    expect(c.documents[0]).toMatchObject({ id: '2026-09-30--point-hebdo-navi-s40', date: '2026-09-30', source: 'navi-s40.pptx', lignes: ['projets/p0000001'] })

    // Une demande ordinaire : contexte et liste des documents, outils de documents, pas ceux de l'inbox ni ses éléments.
    const modele = modeleScripte({ texte: 'ok', appels: [] })
    await proposer(modele, espace, 'où en est Navi ?', { aujourdhui: AUJOURDHUI, baseOuverte: null })
    const systeme = modele.requetes[0]!.messages[0]!.contenu
    expect(systeme).toContain('## Contexte')
    expect(systeme).toContain('Projet → Tâches.')
    expect(systeme).toContain('2026-09-30--point-hebdo-navi-s40 | 2026-09-30 | Point hebdo Navi S40')
    const noms = modele.requetes[0]!.outils.map((o) => o.nom)
    expect(noms).toContain('chercher_documents')
    expect(noms).not.toContain('classer_element')
    expect(modele.requetes[0]!.messages.at(-1)!.contenu).toBe('où en est Navi ?')
  })

  it('traiter : lit les documents, propose remarque, mise à jour, incohérence et rangement ; tout s’applique au bon endroit', async () => {
    const { a, espace, ecrire } = await ouvrir({ '_assistant/documents/2026-09-30--point-hebdo-navi-s40.md': DOC_S40 })
    await espace.assistant.connaissance.deposer({ titre: 'Point hebdo Navi S41', source: 'navi-s41.pptx', texte: '## Diapositive 1 : Navi\nLivraison V2 le 29 octobre. Tâche A terminée.' }, '2026-10-07T09:15:00')
    const el = '20261007-091500--point-hebdo-navi-s41'
    const modele = modeleScripte(
      { texte: '', appels: [appel('chercher_documents', { texte: 'Navi livraison' })] },
      {
        texte: '',
        appels: [
          appel('modifier_lignes', { base: 'taches', lignes: ['t0000001'], valeurs: { statut: 'Terminé' } }),
          appel('ajouter_remarque', { base: 'projets', ligne: 'p0000001', section: 'Remarques', texte: 'Livraison V2 repoussée au 29/10 (point S41).' }),
          appel('signaler_incoherence', { constat: 'La livraison passe du 15/10 (S40) au 29/10 (S41) sans explication.', source: el }),
          appel('classer_element', { element: el, garder: true, titre: 'Point hebdo Navi S41', date: '2026-10-07', lignes: ['projets/p0000001'], remplace: ['2026-09-30--point-hebdo-navi-s40'] }),
        ],
      },
    )
    const p = await proposer(modele, espace, 'Traite l’inbox.', { aujourdhui: AUJOURDHUI, baseOuverte: null, inbox: [el] })
    // Les éléments et la consigne accompagnent la demande ; les outils de l'inbox sont donnés.
    const demande = modele.requetes[0]!.messages.at(-1)!.contenu
    expect(demande).toContain(`### Élément ${el} : Point hebdo Navi S41 (reçu le 2026-10-07 à 09:15, fichier navi-s41.pptx)`)
    expect(demande).toContain('Livraison V2 le 29 octobre')
    expect(modele.requetes[0]!.outils.map((o) => o.nom)).toEqual(expect.arrayContaining(['classer_element', 'laisser_en_attente', 'signaler_incoherence']))
    // La lecture du document précédent est revenue au modèle.
    expect(modele.requetes[1]!.messages.at(-1)!.contenu).toContain('Livraison de la V2 prévue le 15 octobre.')

    if (p.type !== 'plan') throw new Error('plan attendu')
    expect(p.plan.incoherences).toEqual([{ constat: 'La livraison passe du 15/10 (S40) au 29/10 (S41) sans explication.', source: el }])
    expect(p.plan.connaissance).toHaveLength(1)
    await ecrire()
    expect(a.ecritures.filter((c) => !c.includes('inbox'))).toEqual([]) // rien avant « Appliquer »

    await appliquerPlan(espace, p.plan, '2026-10-07T09:20')
    await ecrire()
    const fichiers = await a.lister('_assistant/documents')
    expect(fichiers.map((f) => f.nom).sort()).toEqual(['2026-09-30--point-hebdo-navi-s40.md', '2026-10-07--point-hebdo-navi-s41.md'])
    expect(await a.lire('_assistant/documents/2026-10-07--point-hebdo-navi-s41.md')).toContain('source: navi-s41.pptx')
    expect(await a.lire('_assistant/documents/2026-09-30--point-hebdo-navi-s40.md')).toContain('remplace_par: 2026-10-07--point-hebdo-navi-s41')
    // L'élément n'attend plus : il est dans l'historique, avec ce que le plan a fait, sans recopier le texte rangé en document.
    expect((await a.lister('_assistant/inbox')).filter((e) => e.type === 'fichier')).toEqual([])
    const traite = await a.lire(`_assistant/inbox/traites/${el}.md`)
    expect(traite).toContain('traite: 2026-10-07T09:20')
    expect(traite).toContain('document: 2026-10-07--point-hebdo-navi-s41')
    expect(traite).not.toContain('Livraison V2 le 29 octobre')
    const c = await espace.assistant.connaissance.lire()
    expect(c.inbox).toEqual([])
    expect(c.traites[0]!.bilan).toEqual([
      'Modifier 1 ligne dans Tâches : A (Statut → Terminé)',
      expect.stringMatching(/^Noter dans « Navi » \(Projets\), section Remarques/),
      'À vérifier : La livraison passe du 15/10 (S40) au 29/10 (S41) sans explication.',
      'Rangé dans les documents (« Point hebdo Navi S41 », du 07/10/2026) ; remplace « Point hebdo Navi S40 »',
    ])
    expect(await a.lire('projets/navi--p0000001.md')).toContain('## Remarques\n\n- 07/10/2026 : Livraison V2 repoussée au 29/10 (point S41).')
    expect(await a.lire('taches/a--t0000001.md')).toContain('statut: Terminé')
  })

  it('refus : élément, document ou ligne inconnus ; en attente : la question est écrite dans l’élément', async () => {
    const { a, espace } = await ouvrir()
    await espace.assistant.connaissance.deposer({ titre: 'Truc', texte: 'Le machin glisse.' }, '2026-10-07T10:00:00')
    const el = '20261007-100000--truc'
    const modele = modeleScripte(
      { texte: '', appels: [appel('classer_element', { element: 'zz', garder: false }), appel('classer_element', { element: el, garder: true, lignes: ['projets/inconnu'] })] },
      { texte: '', appels: [appel('laisser_en_attente', { element: el, question: 'Quel projet est « le machin » ?' })] },
    )
    const p = await proposer(modele, espace, 'Traite l’inbox.', { aujourdhui: AUJOURDHUI, baseOuverte: null, inbox: [el] })
    const refus = modele.requetes[1]!.messages.filter((m) => m.role === 'tool').map((m) => m.contenu)
    expect(refus[0]).toMatch(/élément d'inbox inconnu : « zz »/)
    expect(refus[1]).toMatch(/ligne inconnue : "projets\/inconnu"/)
    if (p.type !== 'plan') throw new Error('plan attendu')
    await appliquerPlan(espace, p.plan, '2026-10-07T10:05')
    expect(await a.lire(`_assistant/inbox/${el}.md`)).toContain('question: Quel projet est « le machin » ?')
  })

  it('sans l’assistant : marquer traité, supprimer, vider l’historique ; un seul élément envoyé ; module Contexte désactivé', async () => {
    const { a, espace } = await ouvrir({ '_assistant/contexte.md': 'Projet → Tâches.\n', '_assistant/documents/2026-09-30--point-hebdo-navi-s40.md': DOC_S40 })
    const c = espace.assistant.connaissance
    await c.deposer({ titre: 'Un', texte: 'premier' }, '2026-10-07T10:00:00')
    await c.deposer({ titre: 'Deux', texte: 'second' }, '2026-10-07T10:01:00')
    await c.marquerTraite('20261007-100000--un', '2026-10-07T10:05')
    let lu = await c.lire()
    expect(lu.inbox.map((e) => e.id)).toEqual(['20261007-100100--deux'])
    expect(lu.traites).toEqual([{ id: '20261007-100000--un', titre: 'Un', recu: '2026-10-07T10:00', texte: 'premier', traite: '2026-10-07T10:05', bilan: ['Marqué traité'] }])

    // Un seul élément envoyé : les autres ne partent pas ; module Contexte désactivé : ni contexte ni outils de documents.
    await c.deposer({ titre: 'Trois', texte: 'troisième' }, '2026-10-07T10:02:00')
    const modele = modeleScripte({ texte: 'ok', appels: [] })
    await proposer(modele, espace, 'Traite cet élément.', { aujourdhui: AUJOURDHUI, baseOuverte: null, inbox: ['20261007-100200--trois'], contexte: false })
    const r = modele.requetes[0]!
    expect(r.messages.at(-1)!.contenu).toContain('troisième')
    expect(r.messages.at(-1)!.contenu).not.toContain('second')
    expect(r.messages[0]!.contenu).not.toContain('Projet → Tâches.')
    expect(r.outils.map((o) => o.nom)).not.toContain('chercher_documents')

    await c.retirer('20261007-100100--deux')
    await c.viderHistorique()
    lu = await c.lire()
    expect(lu.inbox.map((e) => e.id)).toEqual(['20261007-100200--trois'])
    expect(lu.traites).toEqual([])
    await expect(a.lister('_assistant/inbox/traites')).resolves.toEqual([])
  })

  it('supprimer un document : celui qu’il remplaçait redevient à jour', async () => {
    const { a, espace } = await ouvrir({
      '_assistant/documents/2026-09-30--s40.md': '---\ntitre: S40\ndate: 2026-09-30\nremplace_par: 2026-10-07--s41\n---\n\nx\n',
      '_assistant/documents/2026-10-07--s41.md': '---\ntitre: S41\ndate: 2026-10-07\n---\n\ny\n',
    })
    await espace.assistant.connaissance.supprimerDocument('2026-10-07--s41')
    expect((await a.lister('_assistant/documents')).map((f) => f.nom)).toEqual(['2026-09-30--s40.md'])
    expect(await a.lire('_assistant/documents/2026-09-30--s40.md')).not.toContain('remplace_par')
  })
})
