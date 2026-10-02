import type { EtatEspace } from './depot-espace'

// Références à une ligne dans le corps d'une page (spec §9, « Références ») :
// un lien wiki à la manière d'Obsidian, `[[projets/site-vitrine--psite001|Site vitrine]]`.
// La cible est le chemin du fichier sans `.md` ; elle se résout par l'id qui
// la termine, si bien qu'une ligne renommée (fichier renommé) reste trouvée.

export type LienInterne = { from: number; to: number; cible: string; alias: string | null }

const LIEN = /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]/g

/** Les liens wiki d'un texte, dans l'ordre. */
export function lireLiens(texte: string, decalage = 0): LienInterne[] {
  return [...texte.matchAll(LIEN)].map((m) => ({ from: decalage + m.index, to: decalage + m.index + m[0].length, cible: m[1]!.trim(), alias: m[2]?.trim() || null }))
}

/** Lien vers une ligne : chemin sans `.md`, titre en alias (sans les caractères qui fermeraient le lien). */
export function ecrireLien(chemin: string, titre: string): string {
  const alias = titre.replace(/[[\]|\n]/g, ' ').replace(/\s+/g, ' ').trim()
  return `[[${chemin.replace(/\.md$/, '')}${alias ? `|${alias}` : ''}]]`
}

/**
 * Ligne visée par un lien : l'id après le dernier `--` du nom de fichier, cherché
 * d'abord dans la base du dossier, puis dans toutes les bases (base renommée).
 * `null` pour un lien cassé.
 */
export function resoudreLien(etat: EtatEspace, cible: string): { base: string; id: string } | null {
  const segments = cible.replace(/\.md$/, '').split('/')
  const nom = segments.at(-1) ?? ''
  const id = nom.includes('--') ? nom.slice(nom.lastIndexOf('--') + 2) : nom
  if (!id) return null
  const dossier = segments.length > 1 ? segments.slice(0, -1).join('/') : null
  if (dossier && etat.titres.get(dossier)?.has(id)) return { base: dossier, id }
  for (const [base, titres] of etat.titres) if (titres.has(id)) return { base, id }
  return null
}
