import type { EtatEspace } from '../depot-espace'
import { appliquerVue, type Contexte } from '../filtres'
import { estObjet } from '../schema'
import type { Cellule } from '../valeurs'
import type { Tri } from '../vue'
import type { AppelOutil, DefinitionOutil } from './modele'
import { FILTRE } from './outils'
import { erreur, ErreurProposition, lireFiltres, trouverBase, trouverColonne, trouverLigne } from './references'

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
    nom: 'lire_page',
    description: "Lit le contenu (corps Markdown) de la page d'une ligne.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, ligne: { type: 'string', description: 'id de la ligne' } }, required: ['base', 'ligne'] },
  },
]

const NOMS = new Set(OUTILS_LECTURE.map((o) => o.nom))
export const estLecture = (appel: AppelOutil) => NOMS.has(appel.nom)

function texte(c: Cellule | undefined): string | null {
  if (!c || c.etat !== 'ok') return null
  const v = c.valeur
  const t = Array.isArray(v) ? `[${v.join(', ')}]` : String(v)
  if (t === '') return null
  return t.length > LONGUEUR_VALEUR_LUE ? `${t.slice(0, LONGUEUR_VALEUR_LUE)}…` : t
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
