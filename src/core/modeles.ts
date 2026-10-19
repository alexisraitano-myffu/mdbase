import { isMap, isScalar, parseDocument, visit } from 'yaml'
import { estObjet } from './schema'
import { OPTIONS_SORTIE_CONFIG } from './schema-ecriture'
import type { IdModule } from './modules'

// Modèles (spec §19 « Magasin ») : un ensemble prêt à l'emploi de bases, vues
// et dashboards déjà reliés, livré avec l'app (`modeles/<id>/`). On le lit ici
// et on prépare ses fichiers pour un espace : identifiants pris dédoublonnés,
// références qui suivent, dates d'exemple ramenées autour d'aujourd'hui. Le
// dépôt écrit ensuite des fichiers neufs, jamais dans l'existant.

export const FICHIER_MODELE = 'modele.yaml'

export type Modele = {
  id: string
  nom: string
  description: string
  /** Modules ajoutés en même temps (spec §19). */
  modules: IdModule[]
  /** Bases du modèle, dans l'ordre du groupe créé. */
  bases: string[]
  /** Fichiers du modèle, chemins relatifs à son dossier, sans `modele.yaml`. */
  fichiers: Record<string, string>
}

export class ErreurModele extends Error {}

const MODULES: readonly IdModule[] = ['kanban', 'collection', 'calendrier', 'timeline', 'charge', 'taches', 'dashboards', 'assistant', 'inbox', 'contexte', 'jira', 'mcp']

/** Lit un modèle depuis ses fichiers (chemins relatifs à son dossier). */
export function lireModele(id: string, fichiers: Record<string, string>): Modele {
  const texte = fichiers[FICHIER_MODELE]
  if (texte === undefined) throw new ErreurModele(`Modèle ${id} : ${FICHIER_MODELE} manquant`)
  const brut: unknown = parseDocument(texte).toJS()
  if (!estObjet(brut) || typeof brut.nom !== 'string') throw new ErreurModele(`Modèle ${id} : nom manquant`)
  const presentes = Object.keys(fichiers).flatMap((c) => (/^[^/]+\/_schema\.yaml$/.test(c) ? [c.split('/')[0]!] : []))
  const citees = Array.isArray(brut.bases) ? brut.bases.filter((b): b is string => typeof b === 'string' && presentes.includes(b)) : []
  const modules = Array.isArray(brut.modules) ? brut.modules.filter((m): m is IdModule => MODULES.includes(m as IdModule)) : []
  const { [FICHIER_MODELE]: _, ...reste } = fichiers
  return {
    id,
    nom: brut.nom,
    description: typeof brut.description === 'string' ? brut.description.trim() : '',
    modules,
    bases: [...citees, ...presentes.filter((b) => !citees.includes(b)).sort()],
    fichiers: reste,
  }
}

/** Lundi de la semaine d'une date `AAAA-MM-JJ`. */
function lundi(jour: string): Date {
  const d = new Date(`${jour}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d
}

/**
 * `{{jour:N}}` dans un fichier de modèle : le lundi de la semaine en cours,
 * plus N jours (négatif possible), pour que l'exemple tombe autour d'aujourd'hui.
 */
export function remplacerDates(texte: string, aujourdhui: string): string {
  const base = lundi(aujourdhui)
  return texte.replace(/\{\{jour:(-?\d+)\}\}/g, (_, n: string) => {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + Number(n))
    return d.toISOString().slice(0, 10)
  })
}

/**
 * Réécrit les références aux bases d'un fichier YAML (clés `base` et `cible`,
 * à toute profondeur) selon `ids` ; le texte est rendu tel quel sans référence à changer.
 */
export function suivreReferences(texte: string, ids: ReadonlyMap<string, string>): string {
  const doc = parseDocument(texte)
  let change = false
  visit(doc, {
    Pair(_, paire) {
      if (!isScalar(paire.key) || (paire.key.value !== 'base' && paire.key.value !== 'cible') || !isScalar(paire.value)) return
      const nouveau = typeof paire.value.value === 'string' ? ids.get(paire.value.value) : undefined
      if (nouveau !== undefined && nouveau !== paire.value.value) {
        paire.value.value = nouveau
        change = true
      }
    },
  })
  return change ? doc.toString(OPTIONS_SORTIE_CONFIG) : texte
}

/**
 * Fichiers à écrire dans l'espace : chaque base sous son nouvel identifiant,
 * chaque dashboard sous le sien, références suivies, dates remplacées.
 */
export function preparerModele(m: Modele, ids: ReadonlyMap<string, string>, dashboards: ReadonlyMap<string, string>, aujourdhui: string): Record<string, string> {
  const sortie: Record<string, string> = {}
  for (const [chemin, brut] of Object.entries(m.fichiers)) {
    const [tete, ...suite] = chemin.split('/')
    let texte = remplacerDates(brut, aujourdhui)
    if (chemin.endsWith('.yaml')) texte = suivreReferences(texte, ids)
    if (tete === '_dashboards') {
      const id = suite.join('/').replace(/\.yaml$/, '')
      const nouveau = dashboards.get(id)
      if (!nouveau) throw new ErreurModele(`Modèle ${m.id} : dashboard ${id} inattendu`)
      sortie[`_dashboards/${nouveau}.yaml`] = changerId(texte, nouveau)
    } else {
      const base = ids.get(tete!)
      if (!base || suite.length === 0) throw new ErreurModele(`Modèle ${m.id} : fichier hors d'une base (${chemin})`)
      sortie[[base, ...suite].join('/')] = chemin === `${tete}/_schema.yaml` ? changerId(texte, base) : texte
    }
  }
  return sortie
}

/** Dashboards d'un modèle (identifiants tirés des noms de fichiers). */
export const dashboardsDe = (m: Modele) => Object.keys(m.fichiers).flatMap((c) => (/^_dashboards\/[^/]+\.yaml$/.test(c) ? [c.slice('_dashboards/'.length, -'.yaml'.length)] : []))

/** Réécrit l'`id` en tête d'un schéma ou d'un dashboard. */
function changerId(texte: string, id: string): string {
  const doc = parseDocument(texte)
  if (!isMap(doc.contents) || doc.get('id') === undefined || doc.get('id') === id) return texte
  doc.set('id', id)
  return doc.toString(OPTIONS_SORTIE_CONFIG)
}
