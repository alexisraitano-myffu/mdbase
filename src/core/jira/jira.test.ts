import { describe, expect, it } from 'vitest'
import { chargerBase } from '../base'
import { AdaptateurCompteur, aleatoire } from '../fixtures/outils'
import { lireSchema } from '../schema'
import { adfEnMarkdown } from './adf'
import { basesJira, depuisPour, jqlSelection, lireEtatSynchro, synchroniser, type ClientJira } from './synchro'
import { changement, schemaJira, valeursTicket, type TicketJira } from './ticket'

const SOURCE = { type: 'jira', site: 'exemple.atlassian.net', projets: ['PRVE'] }

function ticket(id: string, key: string, f: Record<string, unknown> = {}): TicketJira {
  return {
    id,
    key,
    fields: {
      summary: `Résumé de ${key}`,
      status: { name: 'À faire', statusCategory: { key: 'new' } },
      issuetype: { name: 'Story' },
      priority: { name: 'Moyenne' },
      updated: '2026-09-30T14:03:22.123+0200',
      created: '2026-09-01T09:00:00.000+0200',
      ...f,
    },
  }
}

/** Faux Jira : renvoie ses tickets par pages de deux, note les requêtes. */
function faux(tickets: TicketJira[]): ClientJira & { requetes: string[]; tickets: TicketJira[] } {
  const c = {
    tickets,
    requetes: [] as string[],
    async chercher(jql: string, _champs: string[], suivant?: string) {
      c.requetes.push(jql)
      const debut = Number(suivant ?? 0)
      return { tickets: c.tickets.slice(debut, debut + 2), ...(debut + 2 < c.tickets.length && { suivant: String(debut + 2) }) }
    },
    async champSprint() {
      return 'customfield_10020'
    },
  }
  return c
}

describe('description ADF en Markdown', () => {
  it('titres, marques, liens, listes imbriquées, code, citation, tableau, pièce jointe', () => {
    const adf = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Contexte' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Voir ' },
            { type: 'text', text: 'la doc', marks: [{ type: 'link', attrs: { href: 'https://exemple.org' } }] },
            { type: 'text', text: ', ' },
            { type: 'text', text: 'urgent', marks: [{ type: 'strong' }] },
            { type: 'text', text: ' pour ' },
            { type: 'mention', attrs: { text: '@Léa' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Un' }] }] },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Deux' }] },
                { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deux A' }] }] }] },
              ],
            },
          ],
        },
        { type: 'codeBlock', attrs: { language: 'sql' }, content: [{ type: 'text', text: 'select 1' }] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cité' }] }] },
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }, { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] }, { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] }] },
          ],
        },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x' } }] },
      ],
    }
    expect(adfEnMarkdown(adf)).toBe(
      [
        '## Contexte',
        'Voir [la doc](https://exemple.org), **urgent** pour @Léa',
        '- Un\n- Deux\n  1. Deux A',
        '```sql\nselect 1\n```',
        '> Cité',
        '| A | B |\n| --- | --- |\n| 1 | 2 |',
        '*(pièce jointe dans Jira)*',
      ].join('\n\n'),
    )
  })

  it('une description vide ou en texte brut', () => {
    expect(adfEnMarkdown(null)).toBe('')
    expect(adfEnMarkdown('  texte  ')).toBe('texte')
  })
})

describe('ticket → ligne', () => {
  it('valeurs : titre clé + résumé, état par catégorie, sprint (objet ou ancien format), dates à la minute', () => {
    const t = ticket('10001', 'PRVE-12', {
      status: { name: 'En revue', statusCategory: { key: 'indeterminate' } },
      assignee: { displayName: 'Léa Martin' },
      fixVersions: [{ name: '2.4' }],
      duedate: '2026-10-15',
      parent: { key: 'PRVE-1', fields: { summary: 'Refonte' } },
      labels: ['front', 'front'],
      customfield_10020: [{ name: 'Sprint 12' }, 'com.atlassian.greenhopper[id=4,name=Sprint 13,state=ACTIVE]'],
    })
    const { valeurs, couleurs } = valeursTicket(t, 'exemple.atlassian.net', 'customfield_10020')
    expect(valeurs).toMatchObject({
      titre: 'PRVE-12 Résumé de PRVE-12',
      cle: 'PRVE-12',
      statut: 'En revue',
      etat: 'En cours',
      assigne: 'Léa Martin',
      sprint: ['Sprint 12', 'Sprint 13'],
      versions: ['2.4'],
      echeance: '2026-10-15',
      parent: 'PRVE-1 Refonte',
      labels: ['front'],
      maj: '2026-09-30T14:03',
      lien: 'https://exemple.atlassian.net/browse/PRVE-12',
      suivi: true,
      jira_id: '10001',
    })
    expect(couleurs.get('En revue')).toBe('bleu')
  })

  it('« Dernier changement » : nouvelle valeur, puis l’ancienne ; rien de suivi : null', () => {
    expect(changement({ statut: 'À faire', sprint: ['S1'] }, { statut: 'En cours', sprint: ['S1'], assigne: 'Léa' })).toBe('Statut : En cours (était À faire) ; Assigné : Léa (était vide)')
    expect(changement({ statut: 'À faire', maj: '2026-09-01T10:00' }, { statut: 'À faire', maj: '2026-09-02T10:00' })).toBeNull()
  })

  it('le schéma d’une base Jira se relit : source, titre, colonnes', () => {
    const { schema, avertissements } = lireSchema(schemaJira('jira', 'Jira', SOURCE), 'jira')
    expect(avertissements).toEqual([])
    expect(schema?.source).toEqual(SOURCE)
    expect(schema?.champTitre).toBe('titre')
    expect(schema?.colonnes.map((c) => c.cle)).toContain('jira_id')
  })
})

describe('JQL et bornes', () => {
  it('sélection par projets, filtre ajouté, incrémental', () => {
    expect(jqlSelection(['PRVE', 'ABC'], 'status != Abandonné', '2026/09/29 14:00')).toBe(
      'project in ("PRVE", "ABC") AND (status != Abandonné) AND updated >= "2026/09/29 14:00" ORDER BY updated ASC',
    )
    expect(depuisPour('2026-10-01T09:30')).toBe('2026/09/30 09:30')
    expect(depuisPour('n’importe quoi')).toBeUndefined()
  })
})

describe('synchro d’une base Jira', () => {
  async function espace(tickets: TicketJira[]) {
    const a = new AdaptateurCompteur({ 'jira/_schema.yaml': schemaJira('jira', 'Jira', SOURCE), 'projets/_schema.yaml': 'nom: Projets\ncolonnes:\n  - { cle: titre, nom: Titre, type: text }\n' })
    const client = faux(tickets)
    let heure = 0
    const o = { maintenant: () => `2026-10-01T09:${String(heure++).padStart(2, '0')}`, aleatoire }
    return { a, client, o, lignes: async () => ((await chargerBase(a, 'jira')) as Extract<Awaited<ReturnType<typeof chargerBase>>, { ok: true }>).base.lignes }
  }

  it('trouve les bases Jira de l’espace', async () => {
    const { a } = await espace([])
    expect((await basesJira(a)).map((b) => b.id)).toEqual(['jira'])
  })

  it('première synchro : toutes les pages, une ligne par ticket « Nouveau », options et couleurs ajoutées, état écrit', async () => {
    const { a, client, o, lignes } = await espace([
      ticket('1', 'PRVE-1', { description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Décrit' }] }] } }),
      ticket('2', 'PRVE-2', { status: { name: 'Fait', statusCategory: { key: 'done' } } }),
      ticket('3', 'PRVE-3'),
    ])
    const bilan = await synchroniser(a, 'jira', client, o)
    expect(bilan).toEqual({ nouveaux: 3, modifies: 0, sortis: 0, lus: 3, complete: true })
    expect(client.requetes).toEqual(['project in ("PRVE") ORDER BY updated ASC', 'project in ("PRVE") ORDER BY updated ASC'])
    const ls = await lignes()
    expect(ls).toHaveLength(3)
    const un = ls.find((l) => l.cellules.cle?.etat === 'ok' && l.cellules.cle.valeur === 'PRVE-1')!
    expect(un.chemin).toMatch(/^jira\/prve-1-resume-de-prve-1--[a-z0-9]{8}\.md$/)
    expect(un.corps.trim()).toBe('Décrit')
    expect(un.cellules.changement).toEqual({ etat: 'ok', valeur: 'Nouveau' })
    expect(un.cellules.statut).toEqual({ etat: 'ok', valeur: 'À faire' }) // option ajoutée : valeur valide
    const schema = await a.lire('jira/_schema.yaml')
    expect(schema).toContain('{ label: Fait, couleur: vert }')
    expect(lireEtatSynchro(await a.lire('jira/_synchro.yaml'))).toEqual({ derniere: '2026-10-01T09:00', signature: '["exemple.atlassian.net",["PRVE"],""]', tickets: 3 })
  })

  it('synchro suivante : incrémentale, ne réécrit que ce qui a bougé, note « Bougé le » et le changement, garde l’id', async () => {
    const { a, client, o, lignes } = await espace([ticket('1', 'PRVE-1'), ticket('2', 'PRVE-2')])
    await synchroniser(a, 'jira', client, o)
    const idAvant = (await lignes()).find((l) => l.cellules.jira_id?.etat === 'ok' && l.cellules.jira_id.valeur === '1')!.id
    client.tickets = [ticket('1', 'PRVE-1', { status: { name: 'En cours', statusCategory: { key: 'indeterminate' } } }), ticket('2', 'PRVE-2')]
    a.ecritures = []
    const bilan = await synchroniser(a, 'jira', client, o)
    expect(bilan).toMatchObject({ nouveaux: 0, modifies: 1, complete: false })
    expect(client.requetes.at(-1)).toBe('project in ("PRVE") AND updated >= "2026/09/30 09:00" ORDER BY updated ASC')
    expect(a.ecritures.filter((e) => e.endsWith('.md'))).toHaveLength(1)
    const un = (await lignes()).find((l) => l.id === idAvant)!
    expect(un.cellules.bouge).toEqual({ etat: 'ok', valeur: '2026-10-01T09:01' })
    expect(un.cellules.changement).toEqual({ etat: 'ok', valeur: 'Statut : En cours (était À faire)' })
  })

  it('résumé changé : fichier renommé, même id ; une date de mise à jour seule ne compte pas comme « bougé »', async () => {
    const { a, client, o, lignes } = await espace([ticket('1', 'PRVE-1')])
    await synchroniser(a, 'jira', client, o)
    client.tickets = [ticket('1', 'PRVE-1', { summary: 'Nouveau titre', updated: '2026-10-01T08:00:00.000+0200' })]
    await synchroniser(a, 'jira', client, o)
    const [l] = await lignes()
    expect(l!.chemin).toMatch(/^jira\/prve-1-nouveau-titre--/)
    expect(l!.cellules.changement).toEqual({ etat: 'ok', valeur: 'Résumé : Nouveau titre (était Résumé de PRVE-1)' })
    client.tickets = [ticket('1', 'PRVE-1', { summary: 'Nouveau titre', updated: '2026-10-01T08:30:00.000+0200' })]
    await synchroniser(a, 'jira', client, o)
    const [m] = await lignes()
    expect(m!.cellules.maj).toEqual({ etat: 'ok', valeur: '2026-10-01T08:30' })
    expect(m!.cellules.bouge).toEqual(l!.cellules.bouge)
  })

  it('projets changés : synchro complète ; un ticket qui n’est plus renvoyé passe à suivi non, sans être effacé, puis revient', async () => {
    const { a, client, o, lignes } = await espace([ticket('1', 'PRVE-1'), ticket('2', 'PRVE-2')])
    await synchroniser(a, 'jira', client, o)
    client.tickets = [ticket('1', 'PRVE-1')]
    const bilan = await synchroniser(a, 'jira', client, { ...o, complete: true })
    expect(bilan.sortis).toBe(1)
    const deux = (await lignes()).find((l) => l.cellules.jira_id?.etat === 'ok' && l.cellules.jira_id.valeur === '2')!
    expect(deux.cellules.suivi).toBeUndefined()
    expect(deux.cellules.changement?.etat === 'ok' && deux.cellules.changement.valeur).toMatch(/^Sorti de la sélection/)
    // Déjà sorti : rien de plus à la synchro complète suivante.
    expect((await synchroniser(a, 'jira', client, { ...o, complete: true })).sortis).toBe(0)
    client.tickets = [ticket('1', 'PRVE-1'), ticket('2', 'PRVE-2')]
    await synchroniser(a, 'jira', client, { ...o, complete: true })
    const revenu = (await lignes()).find((l) => l.id === deux.id)!
    expect(revenu.cellules.suivi).toEqual({ etat: 'ok', valeur: true })
    expect(revenu.cellules.changement).toEqual({ etat: 'ok', valeur: 'De retour dans la sélection' })
  })

  it('une erreur de Jira est notée dans l’état, et la synchro échoue', async () => {
    const { a, o } = await espace([])
    const enPanne: ClientJira = {
      chercher: async () => {
        throw new Error('Jira : 401, token refusé')
      },
      champSprint: async () => undefined,
    }
    await expect(synchroniser(a, 'jira', enPanne, o)).rejects.toThrow('401')
    expect(lireEtatSynchro(await a.lire('jira/_synchro.yaml')).erreur).toBe('Jira : 401, token refusé')
  })

  it('sans projet suivi : erreur claire', async () => {
    const a = new AdaptateurCompteur({ 'jira/_schema.yaml': schemaJira('jira', 'Jira', { ...SOURCE, projets: [] }) })
    await expect(synchroniser(a, 'jira', faux([]), { maintenant: () => '2026-10-01T09:00', aleatoire })).rejects.toThrow('Aucun projet suivi')
  })
})
