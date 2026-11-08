import type { LigneChargee } from './base'
import { estConfiguration } from './espace'
import { FichierIntrouvable, joindre, type AdaptateurFichiers, type Entree } from './fichiers'
import { lireLigne } from './ligne'
import type { Schema } from './schema'

// Wiki de l'espace (spec §22) : des pages à plat dans `_wiki/`, l'arbre vient
// de la clé `parent`. Une page se lit et s'écrit comme une ligne d'un schéma
// interne fixe (titre, parent, ordre) : mêmes garanties d'écriture (écriture
// sûre, regroupement, annulation) sans second moteur. Ce schéma n'est jamais
// un fichier : une page n'a pas de colonnes.

export const DOSSIER_WIKI = '_wiki'

export const SCHEMA_WIKI: Schema = {
  version: 1,
  id: DOSSIER_WIKI,
  nom: 'Wiki',
  champTitre: 'titre',
  colonnes: [
    { cle: 'titre', nom: 'Titre', type: 'text' },
    { cle: 'parent', nom: 'Parent', type: 'text' },
    { cle: 'ordre', nom: 'Ordre', type: 'number' },
  ],
  ordreVues: [],
}

/** Une page vue par l'app : ce que le frontmatter dit d'elle, sans rien d'autre. */
export type PageWiki = {
  id: string
  chemin: string
  titre: string
  /** Id de la page parente, `null` à la racine. */
  parent: string | null
  ordre: number | null
  corps: string
}

export function pageDe(l: LigneChargee): PageWiki {
  const valeur = (cle: string) => {
    const c = l.cellules[cle]
    return c?.etat === 'ok' ? c.valeur : undefined
  }
  const titre = valeur('titre')
  const parent = valeur('parent')
  const ordre = valeur('ordre')
  return {
    id: l.id,
    chemin: l.chemin,
    titre: typeof titre === 'string' ? titre : '',
    parent: typeof parent === 'string' && parent !== '' ? parent : null,
    ordre: typeof ordre === 'number' ? ordre : null,
    corps: l.corps,
  }
}

/**
 * Pages du wiki lues sur le disque ; un dossier `_wiki/` absent est un wiki
 * vide. Les fichiers illisibles sont rendus à part, jamais effacés.
 */
export async function chargerWiki(adaptateur: AdaptateurFichiers): Promise<{ pages: LigneChargee[]; nonReconnus: { chemin: string; raison: string }[] }> {
  const pages: LigneChargee[] = []
  const nonReconnus: { chemin: string; raison: string }[] = []
  for (const entree of await listerWiki(adaptateur)) {
    if (entree.type !== 'fichier' || estConfiguration(entree.nom) || !entree.nom.endsWith('.md')) continue
    const chemin = joindre(DOSSIER_WIKI, entree.nom)
    const date = await adaptateur.dateModification(chemin)
    const lecture = lireLigne(chemin, await adaptateur.lire(chemin), SCHEMA_WIKI)
    if (lecture.ok) pages.push({ ...lecture.ligne, date })
    else nonReconnus.push({ chemin, raison: lecture.raison })
  }
  return { pages, nonReconnus }
}

async function listerWiki(adaptateur: AdaptateurFichiers): Promise<Entree[]> {
  try {
    return await adaptateur.lister(DOSSIER_WIKI)
  } catch (e) {
    if (e instanceof FichierIntrouvable) return []
    throw e
  }
}

/**
 * L'adaptateur vu par le dépôt du wiki : `_wiki/` absent se liste comme un
 * dossier vide (le wiki n'existe qu'à sa première page). Le reste passe tel quel.
 */
export function adaptateurWiki(adaptateur: AdaptateurFichiers): AdaptateurFichiers {
  return {
    lister: (dossier) => (dossier === DOSSIER_WIKI ? listerWiki(adaptateur) : adaptateur.lister(dossier)),
    lire: (c) => adaptateur.lire(c),
    ecrire: (c, t) => adaptateur.ecrire(c, t),
    renommer: (a, n) => adaptateur.renommer(a, n),
    supprimer: (c) => adaptateur.supprimer(c),
    dateModification: (c) => adaptateur.dateModification(c),
  }
}

// ── Arbre ──────────────────────────────────────────────────────────

export type NoeudWiki = {
  page: PageWiki
  enfants: NoeudWiki[]
  /** Pourquoi la page est à la racine alors qu'elle a un parent (rien n'est réécrit). */
  signale?: 'parent introuvable' | 'boucle'
}

/** Tri des pages sœurs : `ordre` croissant, sans ordre à la fin, puis titre. */
export function comparerPages(a: PageWiki, b: PageWiki): number {
  if (a.ordre !== b.ordre) {
    if (a.ordre === null) return 1
    if (b.ordre === null) return -1
    return a.ordre - b.ordre
  }
  return a.titre.localeCompare(b.titre, 'fr', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
}

/**
 * L'arbre des pages (spec §22). Une page dont le parent est introuvable, ou
 * prise dans une boucle de parents, s'affiche à la racine, signalée.
 */
export function arbreWiki(pages: readonly PageWiki[]): NoeudWiki[] {
  const parId = new Map(pages.map((p) => [p.id, p]))
  const signale = new Map<string, NoeudWiki['signale']>()
  const parentEffectif = (p: PageWiki): string | null => {
    if (p.parent === null) return null
    if (!parId.has(p.parent)) {
      signale.set(p.id, 'parent introuvable')
      return null
    }
    // Remonter les parents : revenir sur soi-même est une boucle.
    const vus = new Set([p.id])
    for (let x = parId.get(p.parent); x; x = x.parent === null ? undefined : parId.get(x.parent)) {
      if (vus.has(x.id)) {
        signale.set(p.id, 'boucle')
        return null
      }
      vus.add(x.id)
    }
    return p.parent
  }
  const enfants = new Map<string | null, PageWiki[]>()
  for (const p of pages) {
    const cle = parentEffectif(p)
    enfants.set(cle, [...(enfants.get(cle) ?? []), p])
  }
  const construire = (parent: string | null): NoeudWiki[] =>
    (enfants.get(parent) ?? []).sort(comparerPages).map((page) => {
      const s = signale.get(page.id)
      return { page, enfants: construire(page.id), ...(s && { signale: s }) }
    })
  return construire(null)
}

/** Ids de toutes les pages sous `id`, à toute profondeur (pas `id` lui-même). */
export function descendants(pages: readonly PageWiki[], id: string): string[] {
  const resultat: string[] = []
  const vus = new Set([id])
  const parcourir = (parent: string) => {
    for (const p of pages)
      if (p.parent === parent && !vus.has(p.id)) {
        vus.add(p.id)
        resultat.push(p.id)
        parcourir(p.id)
      }
  }
  parcourir(id)
  return resultat
}

/** Une page peut-elle aller sous `parent` ? Jamais sous elle-même ni sous sa descendance. */
export function peutDeplacer(pages: readonly PageWiki[], id: string, parent: string | null): boolean {
  return parent === null || (parent !== id && !descendants(pages, id).includes(parent))
}

/**
 * Rang d'une page placée entre deux sœurs (spec §22) : la moyenne de leurs
 * rangs, pour n'écrire qu'un fichier. En tête ou en fin : un pas de 1.
 */
export function ordreEntre(avant: number | null | undefined, apres: number | null | undefined): number {
  const a = avant ?? undefined
  const b = apres ?? undefined
  if (a === undefined && b === undefined) return 1
  if (a === undefined) return b! - 1
  if (b === undefined) return a + 1
  return (a + b) / 2
}

/** Rang d'une nouvelle page en dernier sous `parent`. */
export function ordreEnFin(pages: readonly PageWiki[], parent: string | null): number {
  const rangs = pages.filter((p) => p.parent === parent && p.ordre !== null).map((p) => p.ordre!)
  return ordreEntre(rangs.length > 0 ? Math.max(...rangs) : undefined, undefined)
}

/** Où une page lâchée sur une autre doit aller : juste avant, juste après, ou dedans (en dernier). */
export type PositionDepot = 'avant' | 'apres' | 'dans'

/**
 * Parent et rang d'une page `id` déposée par rapport à `cible` (glisser-déposer
 * de la barre latérale). `null` si le dépôt est refusé : sur elle-même, ou dans
 * sa propre descendance.
 */
export function placementWiki(pages: readonly PageWiki[], id: string, cible: string, position: PositionDepot): { parent: string | null; ordre: number } | null {
  if (id === cible) return null
  const c = pages.find((p) => p.id === cible)
  if (!c) return null
  const parent = position === 'dans' ? c.id : c.parent
  if (!peutDeplacer(pages, id, parent)) return null
  const autres = pages.filter((p) => p.id !== id)
  if (position === 'dans') return { parent, ordre: ordreEnFin(autres, parent) }
  const soeurs = autres.filter((p) => p.parent === parent).sort(comparerPages)
  const i = soeurs.findIndex((p) => p.id === cible)
  const [avant, apres] = position === 'avant' ? [soeurs[i - 1], soeurs[i]] : [soeurs[i], soeurs[i + 1]]
  return { parent, ordre: ordreEntre(avant?.ordre, apres?.ordre) }
}

/** Un texte cite-t-il la page `id` (`[[_wiki/<slug>--<id>|…]]`, spec §22) ? */
export function citePage(texte: string, id: string): boolean {
  if (!texte.includes('[[_wiki/')) return false
  const echappe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\[\\[_wiki/[^\\]|]*--${echappe}(?:\\.md)?(?:\\||\\]\\])`).test(texte)
}
