import type { LigneChargee } from '../base'
import type { EtatEspace } from '../depot-espace'
import { estSaisie, type Colonne, type Schema } from '../schema'
import { jourSemaine } from '../temps'
import type { Cellule } from '../valeurs'
import { OPERATEURS } from '../vue'
import type { Skill } from './memoire'
import type { DefinitionOutil } from './modele'
import { TYPES_COLONNE, TYPES_VUE } from './structure'
import { CALCULS } from '../schema'

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

const COLONNE = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    type: { type: 'string', enum: [...TYPES_COLONNE] },
    options: { type: 'array', items: { type: 'string' }, description: 'select / multiselect : libellés des options' },
    cible: { type: 'string', description: 'relation : id de la base liée' },
    relation: { type: 'string', description: 'rollup : clé de la colonne relation de cette base' },
    champ: { type: 'string', description: 'rollup : clé de la colonne remontée depuis la base liée' },
    calcul: { type: 'string', enum: [...CALCULS], description: 'rollup' },
    expression: { type: 'string', description: 'formula : expression, colonnes en prop("cle")' },
  },
  required: ['nom', 'type'],
}

const REGLAGES_VUE = {
  groupe: { type: ['string', 'null'], description: 'clé de la colonne de groupement (tableau, kanban) ; null le retire' },
  filtres: { type: 'array', items: FILTRE, description: 'remplacent les filtres de la vue' },
  tris: {
    type: 'array',
    items: { type: 'object', properties: { colonne: { type: 'string' }, sens: { type: 'string', enum: ['asc', 'desc'] } }, required: ['colonne'] },
  },
  colonnes_masquees: { type: 'array', items: { type: 'string' } },
  champ_debut: { type: 'string', description: 'calendrier, timeline : colonne date' },
  champ_fin: { type: 'string', description: 'calendrier, timeline : colonne date de fin (facultative)' },
}

const LIGNES_VISEES = {
  lignes: { type: 'array', items: { type: 'string' }, description: 'ids des lignes' },
  filtres: { type: 'array', items: FILTRE },
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
    nom: 'supprimer_lignes',
    description: "Supprime des lignes (leurs fichiers). Désigne-les par ids ou par filtres. Seulement si l'utilisateur demande une suppression.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, ...LIGNES_VISEES }, required: ['base'] },
  },
  {
    nom: 'ecrire_contenu',
    description:
      "Écrit le contenu (corps Markdown) de la page d'une ligne : ligne existante (id), ou ligne créée plus haut dans les mêmes appels (son titre). `mode` : remplacer (défaut) ou ajouter à la suite.",
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, ligne: { type: 'string' }, contenu: { type: 'string' }, mode: { type: 'string', enum: ['remplacer', 'ajouter'] } },
      required: ['base', 'ligne', 'contenu'],
    },
  },
  {
    nom: 'creer_base',
    description: 'Crée une base (sa colonne titre « Titre » est créée d’office), avec ses colonnes éventuelles.',
    parametres: { type: 'object', properties: { nom: { type: 'string' }, colonnes: { type: 'array', items: COLONNE } }, required: ['nom'] },
  },
  {
    nom: 'ajouter_colonnes',
    description:
      'Ajoute des colonnes à une base. Relation : `cible` (crée aussi la colonne miroir). Rollup : `relation`, `champ`, `calcul`. Formule : `expression`. Les appels suivants peuvent remplir une colonne créée : désigne-la par son nom.',
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonnes: { type: 'array', items: COLONNE } }, required: ['base', 'colonnes'] },
  },
  {
    nom: 'renommer_colonne',
    description: 'Renomme une colonne (sa clé ne change pas).',
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonne: { type: 'string' }, nom: { type: 'string' } }, required: ['base', 'colonne', 'nom'] },
  },
  {
    nom: 'supprimer_colonne',
    description: "Supprime une colonne et son contenu dans toutes les lignes. Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonne: { type: 'string' } }, required: ['base', 'colonne'] },
  },
  {
    nom: 'creer_vue',
    description: 'Crée une vue dans une base : type, groupement, filtres, tris, colonnes masquées, colonne date (calendrier, timeline).',
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, nom: { type: 'string' }, type: { type: 'string', enum: [...TYPES_VUE] }, ...REGLAGES_VUE },
      required: ['base', 'nom'],
    },
  },
  {
    nom: 'modifier_vue',
    description: 'Modifie une vue existante (id ou nom) : nom, groupement, filtres, tris, colonnes masquées, colonnes date.',
    parametres: { type: 'object', properties: { base: { type: 'string' }, vue: { type: 'string' }, nom: { type: 'string' }, ...REGLAGES_VUE }, required: ['base', 'vue'] },
  },
  {
    nom: 'supprimer_vue',
    description: "Supprime une vue (les lignes restent). Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, vue: { type: 'string' } }, required: ['base', 'vue'] },
  },
  {
    nom: 'creer_dashboard',
    description: 'Crée un dashboard ; chaque bloc affiche une vue existante (ou créée plus haut) d’une base, un bloc par rangée.',
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        blocs: { type: 'array', items: { type: 'object', properties: { base: { type: 'string' }, vue: { type: 'string' } }, required: ['base'] } },
      },
      required: ['nom'],
    },
  },
  {
    nom: 'supprimer_dashboard',
    description: "Supprime un dashboard (id ou nom). Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { dashboard: { type: 'string' } }, required: ['dashboard'] },
  },
  {
    nom: 'retenir',
    description: "Retient un fait durable pour les prochaines conversations (préférence, vocabulaire, habitude). Jamais une valeur de ligne : elle est déjà dans les données.",
    parametres: { type: 'object', properties: { fait: { type: 'string', description: 'une phrase courte' } }, required: ['fait'] },
  },
  {
    nom: 'oublier',
    description: 'Retire un fait de la mémoire, cité exactement comme dans la section Mémoire.',
    parametres: { type: 'object', properties: { fait: { type: 'string' } }, required: ['fait'] },
  },
  {
    nom: 'creer_skill',
    description: "Crée ou remplace un skill : une procédure nommée que l'utilisateur pourra redemander. Seulement quand l'utilisateur demande explicitement de créer ou modifier un skill.",
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        description: { type: 'string', description: 'une ligne : quand s’en servir' },
        instructions: { type: 'string', description: 'les étapes, en Markdown, avec les noms de bases et de colonnes' },
      },
      required: ['nom', 'description', 'instructions'],
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
- Structure : pour créer ou modifier des bases, colonnes, vues et dashboards, utilise leurs outils. Tu peux enchaîner dans les mêmes appels : créer une colonne puis la remplir (désigne-la par son nom), créer des lignes puis écrire le contenu de leurs pages.
- Suppressions (lignes, colonnes, vues, dashboards) : seulement quand l'utilisateur les demande explicitement ; l'utilisateur confirme toujours avant qu'elles soient faites. Une base ne se supprime pas depuis l'assistant.
- Si la demande est ambiguë ou impossible, appelle \`repondre\` avec une question courte, sans rien modifier.
- Mémoire : quand l'utilisateur te demande de retenir quelque chose, ou exprime une préférence durable, appelle \`retenir\` (en plus des autres appels). \`oublier\` quand il le demande. Tiens compte de la section Mémoire.
- Skills : si la demande correspond à un skill (par son nom ou sa description), suis ses instructions. N'appelle \`creer_skill\` que si l'utilisateur demande de créer ou modifier un skill.`

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
  memoire?: readonly string[]
  skills?: readonly Skill[]
}

/** Description de l'espace envoyée au modèle : schémas complets, puis les lignes utiles. */
export function decrireEspace(etat: EtatEspace, o: OptionsContexte): string {
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot ? [{ id: b.id, schema: b.depot.schema, lignes: b.depot.lignes() }] : []))
  const parties: string[] = ['## Bases']
  for (const { id, schema } of bases) {
    parties.push(`${id} « ${schema.nom} »`)
    for (const c of schema.colonnes) parties.push(`- ${c.cle} « ${c.nom} » : ${typeLisible(c)}${c.cle === schema.champTitre ? ' (titre de la ligne)' : ''}`)
    const vues = etat.bases.get(id)?.vues ?? []
    parties.push(`vues : ${vues.map((v) => `${v.id} « ${v.nom} » (${v.type})`).join(', ')}`)
  }
  if (etat.dashboards.length > 0) {
    parties.push('', '## Dashboards', ...etat.dashboards.map((d) => `${d.id} « ${d.dashboard?.nom ?? d.id} »`))
  }
  // Mémoire et skills avant ce qui change à chaque demande : le début du message reste identique d'une demande à l'autre.
  if (o.memoire?.length) parties.push('', '## Mémoire', ...o.memoire.map((f) => `- ${f}`))
  if (o.skills?.length) {
    parties.push('', '## Skills')
    for (const s of o.skills) parties.push(`### ${s.nom}`, s.description, s.instructions)
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
