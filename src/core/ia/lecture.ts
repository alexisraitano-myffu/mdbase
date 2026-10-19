import type { EtatEspace } from '../depot-espace'
import { appliquerVue, type Contexte } from '../filtres'
import { estObjet } from '../schema'
import type { Cellule } from '../valeurs'
import type { Tri } from '../vue'
import type { AppelOutil, DefinitionOutil } from './modele'
import { executerSqlOutil, type ContexteSql } from './analyse'
import { calculerChargeOutil } from './charge'
import { FILTRE } from './outils'
import { erreur, ErreurProposition, lireFiltres, normaliser, trouverBase, trouverColonne, trouverLigne } from './references'

// Outils de lecture de l'assistant (spec §12, « Module IA ») : le modèle lit
// les lignes et les pages dont il a besoin, voit le résultat, puis continue.
// Rien n'est modifié ici ; le résultat repart au modèle, jamais ailleurs.

/** Lignes renvoyées par une recherche ; au-delà, le modèle affine ses filtres. */
export const LIGNES_LUES_MAX = 200
const LONGUEUR_VALEUR_LUE = 300
const LONGUEUR_PAGE = 12_000

export const OUTILS_LECTURE: DefinitionOutil[] = [
  {
    nom: 'chercher_lignes',
    description:
      "Lit des lignes d'une base, avec leurs valeurs complètes (colonnes calculées comprises) : toutes, ou celles qui répondent aux filtres (combinés en ET). À utiliser dès que les lignes listées plus bas ne suffisent pas (extrait, valeurs coupées, question sur des données).",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base' },
        filtres: { type: 'array', items: FILTRE },
        tris: {
          type: 'array',
          items: { type: 'object', properties: { colonne: { type: 'string' }, sens: { type: 'string', enum: ['asc', 'desc'] } }, required: ['colonne'] },
        },
        colonnes: { type: 'array', items: { type: 'string' }, description: 'clés des colonnes à renvoyer (par défaut : toutes)' },
      },
      required: ['base'],
    },
  },
  {
    nom: 'chercher_texte',
    description:
      "Cherche un mot ou une expression partout : valeurs des lignes ET contenu des pages (descriptions), sans casse ni accents. Renvoie toutes les lignes qui le contiennent, avec un extrait. À utiliser pour « quels tickets parlent de… », « où est-il question de… ».",
    parametres: {
      type: 'object',
      properties: {
        texte: { type: 'string', description: 'mot ou expression cherchée, telle quelle' },
        base: { type: 'string', description: 'id de la base (par défaut : toutes)' },
      },
      required: ['texte'],
    },
  },
  {
    nom: 'executer_sql',
    description:
      "Exécute une requête SQL de lecture (DuckDB) sur les bases de l'espace et renvoie au plus 200 lignes : pour explorer, compter, agréger, croiser des bases, et préparer les requêtes d'un dashboard. Chaque base est une table du nom de son id, une colonne par clé de colonne (colonnes calculées comprises), plus id, _cree et _modifie ; une relation ou un choix multiple est une liste (unnest, list_contains). Avec `dashboard`, ses filtres s'appliquent et ses paramètres se citent {{nom}}.",
    parametres: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'une seule requête select (ou with … select)' },
        dashboard: { type: 'string', description: 'id ou nom d’un dashboard : ses filtres et ses paramètres valent pour la requête' },
      },
      required: ['sql'],
    },
  },
  {
    nom: 'calculer_charge',
    description:
      "Calcule le plan de charge d'une vue Plan de charge : pour chaque ressource et chaque semaine, la charge (jours affectés) sur la capacité nette (absences et jours fériés retirés), les surcharges, et la couverture des besoins des projets. Pour « qui est disponible en mars ? », « qui est surchargé ? », « le projet X est-il couvert ? ». Les affectations se créent ensuite avec creer_lignes dans leur base.",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base des ressources (par défaut : la première qui a une vue Plan de charge)' },
        vue: { type: 'string', description: 'id ou nom de la vue Plan de charge, si la base en a plusieurs' },
        debut: { type: 'string', description: 'AAAA-MM-JJ, semaine de départ (par défaut : cette semaine)' },
        semaines: { type: 'number', description: 'nombre de semaines, 8 par défaut, 26 au plus' },
      },
    },
  },
  {
    nom: 'lire_page',
    description: "Lit le contenu (corps Markdown) de la page d'une ligne.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, ligne: { type: 'string', description: 'id de la ligne' } }, required: ['base', 'ligne'] },
  },
]

const NOMS = new Set(OUTILS_LECTURE.map((o) => o.nom))
export const estLecture = (appel: AppelOutil) => NOMS.has(appel.nom)

/** Toute lecture, `executer_sql` compris (qui passe par le moteur SQL, donc attend). */
export async function lireTout(etat: EtatEspace, appel: AppelOutil, ctx: Contexte & ContexteSql): Promise<string> {
  if (appel.nom !== 'executer_sql') return lire(etat, appel, ctx)
  try {
    const args: unknown = JSON.parse(appel.arguments || '{}')
    if (!estObjet(args)) return erreur("objet d'arguments attendu")
    return await executerSqlOutil(etat, args, ctx)
  } catch (e) {
    if (e instanceof ErreurProposition || e instanceof SyntaxError) return `Erreur : ${e.message}`
    throw e
  }
}

function texte(c: Cellule | undefined): string | null {
  if (!c || c.etat !== 'ok') return null
  const v = c.valeur
  const t = Array.isArray(v) ? `[${v.join(', ')}]` : String(v)
  if (t === '') return null
  return t.length > LONGUEUR_VALEUR_LUE ? `${t.slice(0, LONGUEUR_VALEUR_LUE)}…` : t
}

/** Extrait autour de la position trouvée, sur une ligne. */
function extrait(texte: string, pos: number, longueur: number): string {
  const debut = Math.max(0, pos - 60)
  const fin = Math.min(texte.length, pos + longueur + 60)
  return `${debut > 0 ? '…' : ''}${texte.slice(debut, fin).replace(/\s+/g, ' ').trim()}${fin < texte.length ? '…' : ''}`
}

/**
 * Recherche exhaustive d'un texte dans les valeurs et le corps de toutes les
 * lignes (ou d'une base) : contrairement à l'extrait envoyé avec la demande,
 * rien n'est laissé de côté.
 */
/** Sans casse ni accents, même longueur que l'original (contrairement à `normaliser`, qui coupe les espaces). */
const plier = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function chercherTexte(etat: EtatEspace, args: Record<string, unknown>): string {
  const cherche = typeof args.texte === 'string' ? normaliser(args.texte) : ''
  if (cherche === '') return erreur('`texte` manquant')
  const bases = args.base === undefined ? [...etat.bases.values()].flatMap((b) => (b.depot ? [trouverBase(etat, b.id)] : [])) : [trouverBase(etat, args.base)]
  const trouves: string[] = []
  let total = 0
  for (const base of bases) {
    for (const l of base.lignes) {
      const titre = texte(l.cellules[base.schema.champTitre]) ?? 'Sans titre'
      let ou: string | null = null
      for (const c of base.schema.colonnes) {
        const v = texte(l.cellules[c.cle])
        const i = v === null ? -1 : plier(v).indexOf(cherche)
        if (i >= 0) {
          ou = `${c.cle}: ${extrait(v!, i, cherche.length)}`
          break
        }
      }
      if (ou === null) {
        const i = plier(l.corps).indexOf(cherche)
        if (i >= 0) ou = `page: ${extrait(l.corps, i, cherche.length)}`
      }
      if (ou === null) continue
      total++
      if (trouves.length < LIGNES_LUES_MAX) trouves.push(`${base.id} | ${l.id} | ${titre} | ${ou}`)
    }
  }
  if (total === 0) return `Aucune ligne ne contient « ${args.texte} »${args.base === undefined ? '' : ` dans ${bases[0]!.id}`} (valeurs et pages comprises).`
  const entete = `${total} ligne${total > 1 ? 's contiennent' : ' contient'} « ${args.texte} »${total > LIGNES_LUES_MAX ? ` (les ${LIGNES_LUES_MAX} premières)` : ''} (base | id | titre | où) :`
  return [entete, ...trouves].join('\n')
}

/** Exécute un appel de lecture ; le texte renvoyé (ou l'erreur) repart au modèle. */
export function lire(etat: EtatEspace, appel: AppelOutil, ctx: Contexte): string {
  try {
    let args: unknown
    try {
      args = JSON.parse(appel.arguments || '{}')
    } catch {
      return erreur('arguments illisibles (JSON attendu)')
    }
    if (!estObjet(args)) return erreur("objet d'arguments attendu")
    if (appel.nom === 'chercher_texte') return chercherTexte(etat, args)
    if (appel.nom === 'calculer_charge') return calculerChargeOutil(etat, args, ctx.aujourdhui)
    const base = trouverBase(etat, args.base)
    if (appel.nom === 'lire_page') {
      const id = trouverLigne(etat, base.id, args.ligne)
      const corps = base.lignes.find((l) => l.id === id)?.corps.trim() ?? ''
      if (corps === '') return 'Page vide.'
      return corps.length > LONGUEUR_PAGE ? `${corps.slice(0, LONGUEUR_PAGE)}\n… (page coupée : ${corps.length} caractères)` : corps
    }
    const filtres = args.filtres === undefined ? [] : lireFiltres(base, args.filtres)
    const tris: Tri[] = (Array.isArray(args.tris) ? args.tris : []).map((t) =>
      estObjet(t) ? { colonne: trouverColonne(base.schema, t.colonne).cle, sens: t.sens === 'desc' ? 'desc' : 'asc' } : erreur('tri : { colonne, sens } attendu'),
    )
    const colonnes = Array.isArray(args.colonnes) && args.colonnes.length > 0 ? args.colonnes.map((c) => trouverColonne(base.schema, c)) : base.schema.colonnes
    const trouvees = appliquerVue(base.lignes, base.schema, filtres, tris, ctx).map((v) => v.ligne)
    if (trouvees.length === 0) return `Aucune ligne dans ${base.id}${filtres.length > 0 ? ' pour ces filtres' : ''}.`
    const lignes = trouvees.slice(0, LIGNES_LUES_MAX).map((l) => {
      const titre = texte(l.cellules[base.schema.champTitre]) ?? 'Sans titre'
      const valeurs = colonnes.flatMap((c) => {
        if (c.cle === base.schema.champTitre) return []
        const t = texte(l.cellules[c.cle])
        return t === null ? [] : [`${c.cle}: ${t}`]
      })
      return `${l.id} | ${titre}${valeurs.length > 0 ? ` | ${valeurs.join(' ; ')}` : ''}${l.corps.trim() ? ' | (page non vide)' : ''}`
    })
    const entete = `${trouvees.length} ligne${trouvees.length > 1 ? 's' : ''} dans ${base.id}${trouvees.length > LIGNES_LUES_MAX ? ` (les ${LIGNES_LUES_MAX} premières : affine les filtres pour voir les autres)` : ''} :`
    return [entete, ...lignes].join('\n')
  } catch (e) {
    if (e instanceof ErreurProposition) return `Erreur : ${e.message}.`
    throw e
  }
}
