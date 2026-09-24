import type { LigneChargee } from './base'
import type { Schema } from './schema'

// Conflits de synchronisation (spec §4). Deux formes :
// - un id porté par plusieurs fichiers (copie de fichier, conflit OneDrive
//   sur une ligne) : les lignes restent affichées, marquées, et l'utilisateur choisit ;
// - une copie de conflit d'un fichier de configuration (`tableau-DESKTOP-AB12.yaml`
//   à côté de `tableau.yaml`) : signalée, jamais chargée comme une vraie vue.

/**
 * Nom du fichier d'origine si `nom` est une copie de conflit : même nom suivi
 * d'un suffixe `-<MACHINE>`, l'original présent dans le même dossier. OneDrive
 * ajoute le nom de l'ordinateur, qui contient des majuscules ; les noms que
 * l'app fabrique (slugs, `tableau-2`) n'en ont jamais.
 */
export function copieDeConflit(nom: string, noms: ReadonlySet<string>): string | null {
  const point = nom.lastIndexOf('.')
  if (point <= 0) return null
  const [radical, extension] = [nom.slice(0, point), nom.slice(point)]
  // Chaque « - » peut ouvrir le suffixe (le nom de machine en contient souvent : DESKTOP-AB12).
  for (let i = radical.indexOf('-'); i > 0; i = radical.indexOf('-', i + 1)) {
    const suffixe = radical.slice(i + 1)
    const original = `${radical.slice(0, i)}${extension}`
    if (/[A-Z]/.test(suffixe) && noms.has(original)) return original
  }
  return null
}

/** Identifiants portés par plusieurs fichiers d'une base, avec ces fichiers dans l'ordre de lecture. */
export function doublons(lignes: readonly LigneChargee[]): Map<string, LigneChargee[]> {
  const parId = new Map<string, LigneChargee[]>()
  for (const l of lignes) parId.set(l.id, [...(parId.get(l.id) ?? []), l])
  return new Map([...parId].filter(([, ls]) => ls.length > 1))
}

/** Le nom du fichier n'est pas `<slug>--<id>.md` : probablement la copie (synchro ou copie à la main). */
export function nomInattendu(l: LigneChargee): boolean {
  return !l.chemin.endsWith(`--${l.id}.md`)
}

/** Colonnes (et corps) dont la valeur diffère entre les versions d'un même id. */
export function differences(versions: readonly LigneChargee[], schema: Schema): { colonnes: string[]; corps: boolean } {
  const texte = (l: LigneChargee, cle: string) => JSON.stringify(l.cellules[cle] ?? null)
  const colonnes = schema.colonnes.filter((c) => new Set(versions.map((l) => texte(l, c.cle))).size > 1).map((c) => c.cle)
  return { colonnes, corps: new Set(versions.map((l) => l.corps)).size > 1 }
}
