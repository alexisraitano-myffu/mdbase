import { stringify } from 'yaml'

// Espace « grand » du banc : la démo, plus une base Jira de 240 tickets
// (lecture seule, comme une vraie base synchronisée) et une base Actions de
// 120 lignes, modifiable. Tiré au hasard mais toujours pareil (graine fixe) :
// les cas calculent leur bonne réponse sur ces mêmes données.

export const AUJOURDHUI = '2026-09-25' // vendredi

/** Générateur pseudo-aléatoire à graine (mulberry32) : même espace à chaque lancement. */
function aleatoire(graine: number) {
  let a = graine
  const suivant = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const parmi = <T>(l: readonly T[]): T => l[Math.floor(suivant() * l.length)]!
  const pondere = <T>(l: readonly (readonly [T, number])[]): T => {
    let r = suivant() * l.reduce((n, [, p]) => n + p, 0)
    for (const [v, p] of l) if ((r -= p) < 0) return v
    return l.at(-1)![0]
  }
  return { suivant, parmi, pondere }
}

const jour = (decalage: number) => {
  const d = new Date(`${AUJOURDHUI}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + decalage)
  return d.toISOString().slice(0, 10)
}

export const PROJETS = [
  { cle: 'PRVE', nom: 'Prévoyance' },
  { cle: 'OPS', nom: 'Opérations' },
  { cle: 'DATA', nom: 'Data' },
] as const
export const STATUTS = ['À faire', 'En cours', 'En revue', 'Bloqué', 'Terminé'] as const
const ETAT: Record<string, string> = { 'À faire': 'À faire', 'En cours': 'En cours', 'En revue': 'En cours', Bloqué: 'En cours', Terminé: 'Terminé' }
export const PERSONNES = ['Léa Martin', 'Karim Benali', 'Sophie Durand', 'Thomas Petit', 'Inès Moreau'] as const
const TYPES = ['Story', 'Bug', 'Tâche'] as const
const PRIORITES = ['Haute', 'Moyenne', 'Basse'] as const
const SPRINTS = ['Sprint 41', 'Sprint 42', 'Sprint 43'] as const
const LABELS = ['facturation', 'export', 'mobile', 'securite', 'performance', 'rgpd'] as const

const VERBES = ['Corriger', 'Ajouter', 'Revoir', 'Optimiser', 'Documenter', 'Tester', 'Migrer', 'Afficher']
const OBJETS = [
  'l’export CSV des contrats',
  'le calcul des cotisations',
  'la page de connexion',
  'le tableau de bord des sinistres',
  'les notifications par e-mail',
  'la recherche des adhérents',
  'le flux de paiement',
  'les droits des gestionnaires',
  'l’import des bulletins',
  'le rapport mensuel',
  'la fiche adhérent',
  'les relances automatiques',
]
/** Sujets cachés dans les descriptions seulement : la recherche doit lire les pages, pas les titres. */
export const SUJETS_CACHES = {
  saml: 'Le client attend une connexion par SAML avec son annuaire, à valider avec la DSI.',
  salesforce: 'Les données partent ensuite vers le connecteur Salesforce du service commercial.',
  latence: 'Une latence de plus de 4 secondes a été mesurée en recette sur ce parcours.',
} as const

export type Ticket = {
  cle: string
  id: string
  projet: string
  resume: string
  statut: string
  type: string
  priorite: string
  assigne?: string
  sprint: string[]
  labels: string[]
  echeance?: string
  bouge: string
  cree: string
  corps: string
  sujet?: keyof typeof SUJETS_CACHES
}

export type Action = {
  id: string
  titre: string
  responsable: string
  statut: string
  echeance: string
  projet?: string
  ticket?: string
}

/** Ligne de la base Suivi : à moi, avec la clé d'un ticket dans le titre, pas encore reliée au ticket. */
export type Suivi = { id: string; titre: string; cle: string }

function genererSuivi(tickets: readonly Ticket[]): Suivi[] {
  // Un ticket bloqué sur deux de Data, plus quelques autres : le cas « relier, et créer ce qui manque ».
  const bloquesData = tickets.filter((t) => t.projet === 'Data' && t.statut === 'Bloqué')
  const choisis = [...bloquesData.slice(0, 1), ...tickets.filter((t) => t.projet === 'Opérations').slice(0, 4)]
  return choisis.map((t, i) => ({ id: `s${String(i + 1).padStart(3, '0')}`, titre: `${t.cle} : point de suivi`, cle: t.cle }))
}

function genererTickets(): Ticket[] {
  const r = aleatoire(42)
  const numeros: Record<string, number> = { PRVE: 100, OPS: 300, DATA: 500 }
  const sujets = Object.keys(SUJETS_CACHES) as (keyof typeof SUJETS_CACHES)[]
  const tickets: Ticket[] = []
  for (let i = 0; i < 240; i++) {
    const projet = r.pondere<(typeof PROJETS)[number]>([
      [PROJETS[0], 5],
      [PROJETS[1], 3],
      [PROJETS[2], 2],
    ] as const)
    const cle = `${projet.cle}-${++numeros[projet.cle]!}`
    const statut = r.pondere([
      ['À faire', 5],
      ['En cours', 4],
      ['En revue', 2],
      ['Bloqué', 1.2],
      ['Terminé', 5],
    ] as const)
    const assigne = r.suivant() < 0.12 ? undefined : r.parmi(PERSONNES)
    const labels = r.suivant() < 0.45 ? [r.parmi(LABELS)] : []
    // Un ticket sur dix porte un sujet qui n'est écrit que dans sa description.
    const sujet = r.suivant() < 0.1 ? r.parmi(sujets) : undefined
    const resume = `${r.parmi(VERBES)} ${r.parmi(OBJETS)}`
    const corps = [
      `${resume} pour l'équipe ${projet.nom}.`,
      sujet ? SUJETS_CACHES[sujet] : 'Critères d’acceptation à préciser avec le métier.',
      labels.includes('rgpd') ? 'Point RGPD : durée de conservation à confirmer.' : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    tickets.push({
      cle,
      id: String(10000 + i),
      projet: projet.nom,
      resume,
      statut,
      type: r.pondere([
        [TYPES[0], 4],
        [TYPES[1], 3],
        [TYPES[2], 3],
      ] as const),
      priorite: r.parmi(PRIORITES),
      ...(assigne && { assigne }),
      sprint: statut === 'Terminé' && r.suivant() < 0.5 ? [] : [r.parmi(SPRINTS)],
      labels,
      ...(r.suivant() < 0.4 && { echeance: jour(Math.floor(r.suivant() * 40) - 20) }),
      bouge: jour(-Math.floor(r.suivant() * 30)),
      cree: jour(-30 - Math.floor(r.suivant() * 200)),
      corps,
      ...(sujet && { sujet }),
    })
  }
  return tickets
}

function genererActions(tickets: readonly Ticket[]): Action[] {
  const r = aleatoire(7)
  const projetsDemo = ['psite001', 'pmobi002', 'pbout003', 'paudi004']
  const actions: Action[] = []
  for (let i = 0; i < 120; i++) {
    const ticket = r.suivant() < 0.5 ? r.parmi(tickets).cle : undefined
    actions.push({
      id: `a${String(i + 1).padStart(3, '0')}`,
      titre: ticket ? `Suivre ${ticket}` : `${r.parmi(VERBES)} ${r.parmi(OBJETS)}`,
      responsable: r.parmi(PERSONNES),
      statut: r.pondere([
        ['À faire', 5],
        ['En cours', 3],
        ['Fait', 4],
      ] as const),
      echeance: jour(Math.floor(r.suivant() * 30) - 15),
      ...(r.suivant() < 0.35 && { projet: r.parmi(projetsDemo) }),
      ...(ticket && { ticket }),
    })
  }
  return actions
}

const options = (l: readonly string[]) => l.map((label) => ({ label }))

function fichierLigne(entete: Record<string, unknown>, corps = ''): string {
  return `---\n${stringify(entete)}---\n${corps}${corps && !corps.endsWith('\n') ? '\n' : ''}`
}

/** Fichiers à ajouter à la démo, et les données d'où les cas tirent leurs réponses. */
export function espaceGrand(): { fichiers: Record<string, string>; tickets: Ticket[]; actions: Action[]; suivi: Suivi[] } {
  const tickets = genererTickets()
  const actions = genererActions(tickets)
  const suivi = genererSuivi(tickets)
  const fichiers: Record<string, string> = {}
  fichiers['tickets/_schema.yaml'] = stringify({
    version: 1,
    id: 'tickets',
    nom: 'Tickets Jira',
    champ_titre: 'titre',
    source: { type: 'jira', site: 'exemple.atlassian.net', projets: PROJETS.map((p) => p.cle) },
    colonnes: [
      { cle: 'titre', nom: 'Ticket', type: 'text' },
      { cle: 'cle', nom: 'Clé', type: 'text' },
      { cle: 'projet', nom: 'Projet', type: 'select', options: options(PROJETS.map((p) => p.nom)) },
      { cle: 'resume', nom: 'Résumé', type: 'text' },
      { cle: 'statut', nom: 'Statut', type: 'select', options: options(STATUTS) },
      { cle: 'etat', nom: 'État', type: 'select', options: options(['À faire', 'En cours', 'Terminé']) },
      { cle: 'type', nom: 'Type', type: 'select', options: options(TYPES) },
      { cle: 'priorite', nom: 'Priorité', type: 'select', options: options(PRIORITES) },
      { cle: 'assigne', nom: 'Assigné', type: 'text' },
      { cle: 'sprint', nom: 'Sprint', type: 'multiselect', options: options(SPRINTS) },
      { cle: 'labels', nom: 'Labels', type: 'multiselect', options: options(LABELS) },
      { cle: 'echeance', nom: 'Échéance', type: 'date' },
      { cle: 'cree', nom: 'Créé le', type: 'date' },
      { cle: 'bouge', nom: 'Bougé le', type: 'date' },
      { cle: 'lien', nom: 'Lien', type: 'url' },
      { cle: 'suivi', nom: 'Suivi', type: 'relation', cible: 'suivi', proprietaire: false, inverse: 'ticket' },
    ],
  })
  for (const t of tickets) {
    fichiers[`tickets/${t.cle.toLowerCase()}--${t.id}.md`] = fichierLigne(
      {
        id: t.id,
        titre: `${t.cle} ${t.resume}`,
        cle: t.cle,
        projet: t.projet,
        resume: t.resume,
        statut: t.statut,
        etat: ETAT[t.statut],
        type: t.type,
        priorite: t.priorite,
        ...(t.assigne && { assigne: t.assigne }),
        ...(t.sprint.length > 0 && { sprint: t.sprint }),
        ...(t.labels.length > 0 && { labels: t.labels }),
        ...(t.echeance && { echeance: t.echeance }),
        cree: t.cree,
        bouge: t.bouge,
        lien: `https://exemple.atlassian.net/browse/${t.cle}`,
      },
      t.corps,
    )
  }
  fichiers['actions/_schema.yaml'] = stringify({
    version: 1,
    id: 'actions',
    nom: 'Actions',
    champ_titre: 'titre',
    colonnes: [
      { cle: 'titre', nom: 'Titre', type: 'text' },
      { cle: 'responsable', nom: 'Responsable', type: 'select', options: options(PERSONNES) },
      { cle: 'statut', nom: 'Statut', type: 'select', options: options(['À faire', 'En cours', 'Fait']) },
      { cle: 'echeance', nom: 'Échéance', type: 'date' },
      { cle: 'projet', nom: 'Projet', type: 'relation', cible: 'projets', proprietaire: true, inverse: 'actions' },
      { cle: 'ticket', nom: 'Ticket', type: 'text' },
    ],
  })
  for (const a of actions) {
    fichiers[`actions/${a.id}.md`] = fichierLigne({
      id: a.id,
      titre: a.titre,
      responsable: a.responsable,
      statut: a.statut,
      echeance: a.echeance,
      ...(a.projet && { projet: a.projet }),
      ...(a.ticket && { ticket: a.ticket }),
    })
  }
  fichiers['suivi/_schema.yaml'] = stringify({
    version: 1,
    id: 'suivi',
    nom: 'Suivi',
    champ_titre: 'titre',
    colonnes: [
      { cle: 'titre', nom: 'Titre', type: 'text' },
      { cle: 'ticket', nom: 'Ticket Jira', type: 'relation', cible: 'tickets', proprietaire: true, inverse: 'suivi' },
      { cle: 'note', nom: 'Note', type: 'text' },
    ],
  })
  for (const x of suivi) fichiers[`suivi/${x.id}.md`] = fichierLigne({ id: x.id, titre: x.titre })
  return { fichiers, tickets, actions, suivi }
}

/** `_espace.yaml` de la démo, avec les deux bases ajoutées dans la barre latérale. */
export function espaceAvecGrand(espace: string): string {
  return espace.replace('hors_groupe: []', 'hors_groupe: [ tickets, actions, suivi ]')
}

/** Schéma des projets de la démo, avec la colonne miroir de la relation Actions › Projet. */
export function projetsAvecActions(schema: string): string {
  const ligne = '  - { cle: taches, nom: Tâches, type: relation, cible: taches, proprietaire: false, inverse: projet }\n'
  if (!schema.includes(ligne)) throw new Error('schéma des projets de la démo inattendu')
  return schema.replace(ligne, `${ligne}  - { cle: actions, nom: Actions, type: relation, cible: actions, proprietaire: false, inverse: projet }\n`)
}
