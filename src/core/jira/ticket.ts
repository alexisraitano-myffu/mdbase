import { nouveauSchema, modifierSchema } from '../schema-ecriture'
import type { Colonne, Source } from '../schema'
import type { Valeur } from '../valeurs'
import { adfEnMarkdown } from './adf'

// Correspondance ticket Jira → ligne d'une base Jira (§16). Fonctions pures :
// le script de synchro les utilise aujourd'hui, une app desktop demain.

/** Un ticket tel que le renvoie la recherche Jira (REST v3). */
export type TicketJira = { id: string; key: string; fields: Record<string, unknown> }

/** Colonnes d'une base Jira, dans l'ordre du schéma. */
export const COLONNES_JIRA: readonly Colonne[] = [
  { cle: 'titre', nom: 'Ticket', type: 'text' },
  { cle: 'cle', nom: 'Clé', type: 'text' },
  { cle: 'projet', nom: 'Projet', type: 'select', options: [] },
  { cle: 'resume', nom: 'Résumé', type: 'text' },
  { cle: 'statut', nom: 'Statut', type: 'select', options: [] },
  {
    cle: 'etat',
    nom: 'État',
    type: 'select',
    options: [
      { label: 'À faire', couleur: 'gris' },
      { label: 'En cours', couleur: 'bleu' },
      { label: 'Terminé', couleur: 'vert' },
    ],
  },
  { cle: 'type', nom: 'Type', type: 'select', options: [] },
  { cle: 'priorite', nom: 'Priorité', type: 'select', options: [] },
  { cle: 'assigne', nom: 'Assigné', type: 'text' },
  { cle: 'sprint', nom: 'Sprint', type: 'multiselect', options: [] },
  { cle: 'versions', nom: 'Versions corrigées', type: 'multiselect', options: [] },
  { cle: 'echeance', nom: 'Échéance', type: 'date' },
  { cle: 'parent', nom: 'Epic parent', type: 'text' },
  { cle: 'labels', nom: 'Labels', type: 'multiselect', options: [] },
  { cle: 'cree', nom: 'Créé le', type: 'date' },
  { cle: 'maj', nom: 'Mis à jour le', type: 'date' },
  { cle: 'bouge', nom: 'Bougé le', type: 'date' },
  { cle: 'changement', nom: 'Dernier changement', type: 'text' },
  { cle: 'lien', nom: 'Lien', type: 'url' },
  { cle: 'suivi', nom: 'Suivi', type: 'checkbox' },
  { cle: 'jira_id', nom: 'Id Jira', type: 'text' },
]

/** Avec `source.historique` (spec §16 « Historique, résolution et temps ») ; « Créé le » gagne alors l'heure. */
export const COLONNES_HISTORIQUE: readonly Colonne[] = [
  { cle: 'resolu', nom: 'Résolu le', type: 'date', heure: true },
  { cle: 'termine', nom: 'Terminé le', type: 'date', heure: true },
  { cle: 'historique', nom: 'Historique', type: 'text' },
]

/** Avec `source.temps` : les temps du ticket lui-même, en heures, sans ses sous-tâches. */
export const COLONNES_TEMPS: readonly Colonne[] = [
  { cle: 'estimation', nom: 'Estimation initiale (h)', type: 'number' },
  { cle: 'temps_passe', nom: 'Temps passé (h)', type: 'number' },
  { cle: 'reste', nom: 'Reste à faire (h)', type: 'number' },
]

/** Colonnes qu'une base Jira doit avoir, selon les réglages de sa source. */
export function colonnesJira(source: Source): Colonne[] {
  return [...COLONNES_JIRA, ...(source.historique ? COLONNES_HISTORIQUE : []), ...(source.temps ? COLONNES_TEMPS : [])]
}

/** Champs dont un changement compte comme « le ticket a bougé », avec leur libellé. */
export const CHAMPS_SUIVIS: readonly (readonly [string, string])[] = [
  ['projet', 'Projet'],
  ['statut', 'Statut'],
  ['assigne', 'Assigné'],
  ['priorite', 'Priorité'],
  ['type', 'Type'],
  ['sprint', 'Sprint'],
  ['versions', 'Versions'],
  ['echeance', 'Échéance'],
  ['parent', 'Epic'],
  ['resume', 'Résumé'],
  ['labels', 'Labels'],
]

/** Couleur d'un statut : celle de sa catégorie Jira. */
const COULEUR_ETAT: Record<string, string> = { 'À faire': 'gris', 'En cours': 'bleu', Terminé: 'vert' }

/** Champs Jira à demander à la recherche ; `sprint` est un champ personnalisé, propre à chaque site. */
export function champsDemandes(champSprint?: string, source?: Pick<Source, 'historique' | 'temps'>): string[] {
  return [
    'summary', 'project', 'status', 'issuetype', 'priority', 'assignee', 'fixVersions', 'duedate', 'parent', 'labels', 'created', 'updated', 'description',
    ...(champSprint ? [champSprint] : []),
    ...(source?.historique ? ['resolutiondate'] : []),
    ...(source?.temps ? ['timeoriginalestimate', 'timespent', 'timeestimate'] : []),
  ]
}

/** Texte du schéma d'une nouvelle base Jira. */
export function schemaJira(id: string, nom: string, source: Source): string {
  let texte = modifierSchema(nouveauSchema(id, nom), { type: 'source', source })
  texte = modifierSchema(texte, { type: 'supprimer_colonne', cle: 'titre' })
  for (const colonne of colonnesJira(source)) {
    const c = colonne.cle === 'cree' && source.historique ? { ...colonne, heure: true } : colonne
    texte = modifierSchema(texte, { type: 'ajouter_colonne', colonne: c })
  }
  return texte
}

/**
 * Vue tableau d'une base Jira neuve : les tickets qui ont bougé en tête, sans
 * les colonnes qui redisent le titre ou servent à la correspondance (toutes
 * restent dans les pages, et se réaffichent dans les options de la vue).
 */
export const VUE_JIRA = `id: tableau
nom: Tableau
type: tableau
colonnes: [ titre, projet, statut, changement, bouge, assigne, priorite, type, sprint ]
colonnes_masquees: [ cle, resume, etat, versions, echeance, parent, labels, cree, maj, lien, suivi, jira_id ]
tris:
  - { colonne: bouge, sens: desc }
`

/** Valeurs d'une ligne pour un ticket, et son corps (la description). */
export function valeursTicket(t: TicketJira, site: string, champSprint?: string): { valeurs: Record<string, Valeur | undefined>; corps: string; couleurs: Map<string, string> } {
  const f = t.fields
  const resume = texte(f.summary) ?? ''
  const statut = objet(f.status)
  const etat = ETATS[texte(objet(statut?.statusCategory)?.key) ?? ''] ?? undefined
  const parent = objet(f.parent)
  const parentResume = texte(objet(parent?.fields)?.summary)
  const couleurs = new Map<string, string>()
  const nomStatut = texte(statut?.name)
  if (nomStatut && etat) couleurs.set(nomStatut, COULEUR_ETAT[etat]!)
  return {
    valeurs: {
      titre: `${t.key} ${resume}`.trim(),
      cle: t.key,
      projet: texte(objet(f.project)?.name),
      resume: resume || undefined,
      statut: nomStatut,
      etat,
      type: texte(objet(f.issuetype)?.name),
      priorite: texte(objet(f.priority)?.name),
      assigne: texte(objet(f.assignee)?.displayName),
      sprint: liste(champSprint ? f[champSprint] : undefined, nomSprint),
      versions: liste(f.fixVersions, (v) => texte(objet(v)?.name)),
      echeance: date(f.duedate),
      parent: parent ? [texte(parent.key), parentResume].filter(Boolean).join(' ') || undefined : undefined,
      labels: liste(f.labels, texte),
      cree: dateHeure(f.created),
      maj: dateHeure(f.updated),
      resolu: dateHeure(f.resolutiondate),
      estimation: heures(f.timeoriginalestimate),
      temps_passe: heures(f.timespent),
      reste: heures(f.timeestimate),
      lien: site ? `https://${site}/browse/${t.key}` : undefined,
      suivi: true,
      jira_id: String(t.id),
    },
    corps: f.description ? adfEnMarkdown(f.description) : '',
    couleurs,
  }
}

const ETATS: Record<string, string> = { new: 'À faire', indeterminate: 'En cours', done: 'Terminé' }

/** Clé de la catégorie Jira du statut actuel d'un ticket : `new`, `indeterminate` ou `done`. */
export function categorieTicket(t: TicketJira): string | undefined {
  return texte(objet(objet(t.fields.status)?.statusCategory)?.key)
}

/** Secondes de Jira → heures, deux décimales. */
function heures(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) ? Math.round((x / 3600) * 100) / 100 : undefined
}

// ── Historique des statuts ─────────────────────────────────────────

/** Un passage de statut : quand (« AAAA-MM-JJTHH:mm »), de quel statut vers lequel (nom et id). */
export type Transition = { quand: string; de?: string; vers?: string; deId?: string; versId?: string }

/** Catégorie (`new`, `indeterminate`, `done`) de chaque statut du site, par id et par nom. */
export type CategoriesStatuts = Map<string, string>

/** « Historique » : un passage par ligne, du plus ancien au plus récent ; vide sans passage. */
export function texteHistorique(transitions: readonly Transition[]): string | undefined {
  if (transitions.length === 0) return undefined
  return transitions.map((t) => `${t.quand} · ${t.de ?? '?'} → ${t.vers ?? '?'}`).join('\n')
}

/**
 * « Terminé le » : le dernier passage dans la catégorie Terminé, vide si le
 * ticket n'y est pas aujourd'hui (rouvert). La catégorie, pas le libellé :
 * juste quels que soient le workflow et les statuts renommés. Sans passage
 * trouvé (ticket créé terminé, historique incomplet), la date de résolution.
 */
export function termineLe(t: TicketJira, transitions: readonly Transition[], categories: CategoriesStatuts, resolu?: string): string | undefined {
  if (categorieTicket(t) !== 'done') return undefined
  const cat = (id?: string, nom?: string) => (id && categories.get(id)) ?? (nom && categories.get(nom)) ?? undefined
  for (let i = transitions.length - 1; i >= 0; i--) {
    const x = transitions[i]!
    if (cat(x.versId, x.vers) === 'done' && cat(x.deId, x.de) !== 'done') return x.quand
  }
  return resolu
}

/** Date d'un changement lu dans Jira : texte ISO avec fuseau (heure de Jira gardée), ou nombre (secondes ou millisecondes, mis à l'heure du poste). */
export function quandChangement(x: unknown): string | undefined {
  if (typeof x === 'string') return dateHeure(x)
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined
  const d = new Date(x < 1e11 ? x * 1000 : x)
  const deux = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`
}

/**
 * Ce qui a changé dans les champs suivis, pour « Dernier changement » :
 * « Statut : En revue (était En cours) ; Assigné : Léa (était vide) ».
 * Rien de suivi n'a changé : null.
 */
export function changement(avant: Record<string, Valeur | undefined>, apres: Record<string, Valeur | undefined>): string | null {
  const parties = CHAMPS_SUIVIS.flatMap(([cle, libelle]) => {
    const a = affiche(avant[cle])
    const b = affiche(apres[cle])
    return a === b ? [] : [`${libelle} : ${b || 'vide'} (était ${a || 'vide'})`]
  })
  return parties.length > 0 ? parties.join(' ; ') : null
}

export function memeValeur(a: Valeur | undefined, b: Valeur | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function affiche(v: Valeur | undefined): string {
  if (v === undefined || v === null) return ''
  return Array.isArray(v) ? v.join(', ') : String(v)
}

function objet(x: unknown): Record<string, unknown> | undefined {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined
}

function texte(x: unknown): string | undefined {
  return typeof x === 'string' && x.trim() !== '' ? x.trim() : undefined
}

function liste(x: unknown, nom: (v: unknown) => string | undefined): string[] | undefined {
  if (!Array.isArray(x)) return undefined
  const noms = [...new Set(x.map(nom).filter((n): n is string => n !== undefined))]
  return noms.length > 0 ? noms : undefined
}

/** Un sprint : objet `{ name }`, ou l'ancien format texte `…[…,name=Sprint 12,…]`. */
function nomSprint(s: unknown): string | undefined {
  const o = objet(s)
  if (o) return texte(o.name)
  if (typeof s === 'string') return texte(/name=([^,\]]+)/.exec(s)?.[1]) ?? texte(s)
  return undefined
}

function date(x: unknown): string | undefined {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : undefined
}

/** « 2026-09-30T14:03:22.123+0200 » → « 2026-09-30T14:03 » : l'heure telle que Jira la donne. */
function dateHeure(x: unknown): string | undefined {
  return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x) ? x.slice(0, 16) : undefined
}

export { COULEUR_ETAT }
