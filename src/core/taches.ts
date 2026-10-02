// Tâches d'une page (spec §9, « Tâches ») : les cases à cocher Markdown du
// corps, `- [ ] texte` et `- [x] texte`. Elles ne vivent que dans le texte :
// les cocher, ou en ajouter une, réécrit seulement leur ligne du corps.

export type Tache = {
  /** Rang de la ligne dans le corps (0 = première ligne) : sert à la retrouver pour la cocher. */
  ligne: number
  texte: string
  faite: boolean
  /** Retrait, en nombre de niveaux de liste (0 = au bord). */
  niveau: number
  /** Titre de la section où se trouve la tâche, s'il y en a un au-dessus. */
  section?: string
}

const TACHE = /^(\s*)[-*+] \[([ xX])\](?:\s+(.*))?$/
const TITRE = /^#{1,6}\s+(.*?)\s*#*\s*$/
const CLOTURE = /^\s*(```|~~~)/

/** Retrait en niveaux : une tabulation ou deux espaces par niveau (les puces de liste en prennent 2 à 4). */
function niveauDe(retrait: string): number {
  const colonnes = [...retrait].reduce((n, c) => n + (c === '\t' ? 4 : 1), 0)
  return Math.floor(colonnes / 2)
}

export function lireTaches(corps: string): Tache[] {
  const taches: Tache[] = []
  let section: string | undefined
  let cloture: string | null = null
  const lignes = corps.split('\n')
  for (let i = 0; i < lignes.length; i++) {
    const texte = lignes[i]!.replace(/\r$/, '')
    // Dans un bloc de code, une case n'est que du texte.
    const c = CLOTURE.exec(texte)
    if (c) {
      if (cloture === null) cloture = c[1]!
      else if (c[1] === cloture) cloture = null
      continue
    }
    if (cloture !== null) continue
    const titre = TITRE.exec(texte)
    if (titre) {
      section = titre[1] || undefined
      continue
    }
    const m = TACHE.exec(texte)
    if (!m) continue
    taches.push({ ligne: i, texte: (m[3] ?? '').trim(), faite: m[2] !== ' ', niveau: niveauDe(m[1]!), ...(section !== undefined && { section }) })
  }
  return taches
}

/**
 * Coche ou décoche la tâche `tache` dans `corps`. Le corps a pu changer depuis
 * la lecture (autre machine, éditeur ouvert) : si la ligne n'est plus cette
 * tâche, rien n'est réécrit et la fonction rend `null`.
 */
export function cocherTache(corps: string, tache: Pick<Tache, 'ligne' | 'texte'>, faite: boolean): string | null {
  const lignes = corps.split('\n')
  const actuelle = lignes[tache.ligne]
  const m = actuelle === undefined ? null : TACHE.exec(actuelle.replace(/\r$/, ''))
  if (!m || (m[3] ?? '').trim() !== tache.texte) return null
  const at = actuelle!.indexOf('[') + 1
  lignes[tache.ligne] = actuelle!.slice(0, at) + (faite ? 'x' : ' ') + actuelle!.slice(at + 1)
  return lignes.join('\n')
}

/** Ajoute `- [ ] texte` après la dernière tâche du corps, ou à la fin s'il n'y en a pas. */
export function ajouterTache(corps: string, texte: string): string {
  const nouvelle = `- [ ] ${texte.trim()}`
  const taches = lireTaches(corps)
  const derniere = taches.at(-1)
  if (derniere) {
    // Juste sous la dernière tâche, au bord : même si celle-ci est une sous-tâche.
    const lignes = corps.split('\n')
    lignes.splice(derniere.ligne + 1, 0, nouvelle)
    return lignes.join('\n')
  }
  const base = corps.replace(/\s+$/, '')
  return base === '' ? `${nouvelle}\n` : `${base}\n\n${nouvelle}\n`
}

/** Texte d'une tâche hors de l'éditeur : sans la syntaxe Markdown en ligne (gras, italique, code, liens). */
export function texteSimple(texte: string): string {
  return texte
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}
