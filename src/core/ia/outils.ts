import type { LigneChargee } from '../base'
import type { EtatEspace } from '../depot-espace'
import { estSaisie, type Colonne, type Schema } from '../schema'
import { jourSemaine } from '../temps'
import type { Cellule } from '../valeurs'
import { OPERATEURS } from '../vue'
import type { DefinitionOutil } from './modele'

// Ce que voit le modèle (spec §12, « Module IA ») : la consigne, les outils,
// et une description compacte de l'espace ouvert. Rien d'autre ne quitte la machine.

const FILTRE = {
  type: 'object',
  properties: {
    colonne: { type: 'string', description: 'clé de la colonne' },
    operateur: { type: 'string', enum: [...OPERATEURS] },
    valeur: { description: 'valeur comparée ; liste de libellés pour « parmi », nombre de jours pour jours_passes / jours_a_venir' },
  },
  required: ['colonne', 'operateur'],
}

const VALEURS = {
  type: 'object',
  description: 'clé de colonne → valeur ; null vide le champ',
  additionalProperties: true,
}

export const OUTILS: DefinitionOutil[] = [
  {
    nom: 'modifier_lignes',
    description:
      "Modifie des lignes existantes d'une base. Désigne les lignes par leurs ids (`lignes`), ou par des filtres (`filtres`, combinés en ET) pour toutes les lignes qui y correspondent.",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base' },
        lignes: { type: 'array', items: { type: 'string' }, description: 'ids des lignes à modifier' },
        filtres: { type: 'array', items: FILTRE },
        valeurs: VALEURS,
      },
      required: ['base', 'valeurs'],
    },
  },
  {
    nom: 'creer_lignes',
    description: 'Crée des lignes dans une base.',
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base' },
        lignes: { type: 'array', items: VALEURS, description: 'une entrée par ligne à créer' },
      },
      required: ['base', 'lignes'],
    },
  },
  {
    nom: 'repondre',
    description: 'Répond sans rien modifier : demande ambiguë (poser une question courte), impossible, ou simple question.',
    parametres: { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'] },
  },
]

export const CONSIGNE = `Tu es l'assistant de mdbase : tu modifies les bases de données de l'utilisateur en appelant des outils.
Règles :
- Réponds uniquement par des appels d'outils.
- Utilise exactement les ids de bases, les clés de colonnes et les ids de lignes donnés plus bas. N'invente jamais un id, une colonne ou une option.
- Colonne à choix : le libellé exact d'une option existante (une liste pour un choix multiple).
- Relation : la liste des ids des lignes liées, dans la base cible.
- Dates au format AAAA-MM-JJ. Nombres en chiffres. Case à cocher : true ou false. null vide un champ.
- Les colonnes calculées sont en lecture seule.
- Pour modifier toutes les lignes qui répondent à un critère, utilise \`filtres\` plutôt qu'une liste d'ids.
- Si la demande est ambiguë ou impossible, appelle \`repondre\` avec une question courte, sans rien modifier.`

/** Au-delà, les lignes ne sont plus toutes listées : celles de la base ouverte et les plus proches de la demande. */
const LIGNES_MAX = 150
const LIGNES_BASE_OUVERTE = 60
const LONGUEUR_VALEUR = 60
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function typeLisible(c: Colonne): string {
  switch (c.type) {
    case 'text':
      return 'texte'
    case 'number':
      return 'nombre'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'case à cocher'
    case 'url':
      return 'lien'
    case 'select':
      return `choix parmi [${c.options.map((o) => o.label).join(', ')}]`
    case 'multiselect':
      return `choix multiple parmi [${c.options.map((o) => o.label).join(', ')}]`
    case 'relation':
      return `relation vers ${c.cible}`
    default:
      return 'calculée (lecture seule)'
  }
}

function texteCellule(c: Cellule | undefined): string | null {
  if (!c || c.etat !== 'ok') return null
  const v = c.valeur
  const t = Array.isArray(v) ? `[${v.join(', ')}]` : String(v)
  return t.length > LONGUEUR_VALEUR ? `${t.slice(0, LONGUEUR_VALEUR)}…` : t
}

function decrireLigne(schema: Schema, l: LigneChargee, calculees: Record<string, Cellule> | undefined): string {
  const titre = texteCellule(l.cellules[schema.champTitre]) ?? 'Sans titre'
  const valeurs = schema.colonnes.flatMap((c) => {
    if (c.cle === schema.champTitre) return []
    const t = texteCellule(estSaisie(c) ? l.cellules[c.cle] : calculees?.[c.cle])
    return t === null ? [] : [`${c.cle}: ${t}`]
  })
  return `${l.id} | ${titre}${valeurs.length > 0 ? ` | ${valeurs.join(' ; ')}` : ''}`
}

export type OptionsContexte = {
  aujourdhui: string
  baseOuverte: string | null
  /** Lignes proches de la demande, les plus pertinentes d'abord (recherche plein texte). */
  candidats: readonly { base: string; ligne: string }[]
}

/** Description de l'espace envoyée au modèle : schémas complets, puis les lignes utiles. */
export function decrireEspace(etat: EtatEspace, o: OptionsContexte): string {
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot ? [{ id: b.id, schema: b.depot.schema, lignes: b.depot.lignes() }] : []))
  const parties: string[] = ['## Bases']
  for (const { id, schema } of bases) {
    parties.push(`${id} « ${schema.nom} »`)
    for (const c of schema.colonnes) parties.push(`- ${c.cle} « ${c.nom} » : ${typeLisible(c)}${c.cle === schema.champTitre ? ' (titre de la ligne)' : ''}`)
  }
  parties.push('', `Aujourd'hui : ${o.aujourdhui} (${JOURS[jourSemaine(o.aujourdhui)]})`)
  if (o.baseOuverte) parties.push(`Base ouverte : ${o.baseOuverte}`)

  const total = bases.reduce((n, b) => n + b.lignes.length, 0)
  const retenues = new Map<string, Set<string>>()
  if (total > LIGNES_MAX) {
    const retenir = (base: string, ligne: string) => retenues.set(base, (retenues.get(base) ?? new Set()).add(ligne))
    for (const c of o.candidats) retenir(c.base, c.ligne)
    const ouverte = bases.find((b) => b.id === o.baseOuverte)
    for (const l of ouverte?.lignes.slice(0, LIGNES_BASE_OUVERTE) ?? []) retenir(ouverte!.id, l.id)
  }
  parties.push('', `## Lignes (id | titre | valeurs)${total > LIGNES_MAX ? ` : extrait, ${total} lignes au total ; les autres se désignent par des filtres` : ''}`)
  for (const { id, schema, lignes } of bases) {
    const choix = total > LIGNES_MAX ? lignes.filter((l) => retenues.get(id)?.has(l.id)) : lignes
    if (choix.length === 0) continue
    parties.push(`### ${id}`)
    for (const l of choix) parties.push(decrireLigne(schema, l, etat.calculs.get(id)?.get(l.id)))
  }
  return parties.join('\n')
}
