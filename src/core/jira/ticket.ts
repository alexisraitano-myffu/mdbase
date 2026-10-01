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
export function champsDemandes(champSprint?: string): string[] {
  return ['summary', 'project', 'status', 'issuetype', 'priority', 'assignee', 'fixVersions', 'duedate', 'parent', 'labels', 'created', 'updated', 'description', ...(champSprint ? [champSprint] : [])]
}

/** Texte du schéma d'une nouvelle base Jira. */
export function schemaJira(id: string, nom: string, source: Source): string {
  let texte = modifierSchema(nouveauSchema(id, nom), { type: 'source', source })
  texte = modifierSchema(texte, { type: 'supprimer_colonne', cle: 'titre' })
  for (const colonne of COLONNES_JIRA) texte = modifierSchema(texte, { type: 'ajouter_colonne', colonne })
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
      lien: site ? `https://${site}/browse/${t.key}` : undefined,
      suivi: true,
      jira_id: String(t.id),
    },
    corps: f.description ? adfEnMarkdown(f.description) : '',
    couleurs,
  }
}

const ETATS: Record<string, string> = { new: 'À faire', indeterminate: 'En cours', done: 'Terminé' }

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
