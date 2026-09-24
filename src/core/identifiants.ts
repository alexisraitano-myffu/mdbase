// Identifiants de lignes et noms de fichiers (spec §3).

const LETTRES = 'abcdefghijklmnopqrstuvwxyz'
const ALPHABET = LETTRES + '0123456789'

/** Source d'octets aléatoires, injectée : le cœur n'accède pas à `crypto`. */
export type Aleatoire = (n: number) => Uint8Array

/**
 * 8 caractères [a-z0-9]. Le premier est toujours une lettre, pour qu'un id ne
 * soit jamais lu comme un nombre par YAML (ex. « 12e45678 »).
 */
export function genererId(aleatoire: Aleatoire, existants: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const octets = aleatoire(8)
    let id = LETTRES[octets[0]! % LETTRES.length]!
    for (let i = 1; i < 8; i++) id += ALPHABET[octets[i]! % ALPHABET.length]
    if (!existants.has(id)) return id
  }
}

const LONGUEUR_SLUG = 60

export function slug(titre: string): string {
  return titre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, LONGUEUR_SLUG)
    .replace(/^-+|-+$/g, '')
}

/** `<slug-du-titre>--<id>.md`, ou `<id>.md` si le titre est vide. */
export function nomFichierLigne(titre: string, id: string): string {
  const s = slug(titre)
  return s === '' ? `${id}.md` : `${s}--${id}.md`
}
