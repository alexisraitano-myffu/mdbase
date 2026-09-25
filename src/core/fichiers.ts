// Interface d'accès aux fichiers (spec §12). Seul point de contact du cœur avec
// le stockage : le cœur ne connaît que cette interface, jamais son implémentation.
//
// Les chemins sont relatifs à la racine de l'espace, séparés par « / ».
// La racine elle-même s'écrit "".

export type Entree = { nom: string; type: 'fichier' | 'dossier' }

export interface AdaptateurFichiers {
  /** Entrées directes d'un dossier. Lève FichierIntrouvable si le dossier n'existe pas. */
  lister(dossier: string): Promise<Entree[]>
  lire(chemin: string): Promise<string>
  /** Écrit le fichier en entier, crée les dossiers parents au besoin. */
  ecrire(chemin: string, contenu: string): Promise<void>
  /** Renomme ou déplace un fichier. */
  renommer(ancien: string, nouveau: string): Promise<void>
  /** Supprime un fichier, ou un dossier vide. */
  supprimer(chemin: string): Promise<void>
  /** Date de dernière modification, en millisecondes depuis l'epoch. */
  dateModification(chemin: string): Promise<number>
}

export class FichierIntrouvable extends Error {
  readonly chemin: string
  constructor(chemin: string) {
    super(`Introuvable : ${chemin === '' ? '(racine)' : chemin}`)
    this.name = 'FichierIntrouvable'
    this.chemin = chemin
  }
}

export function segments(chemin: string): string[] {
  return chemin.split('/').filter((s) => s !== '')
}

export function joindre(...parties: string[]): string {
  return parties.flatMap(segments).join('/')
}

export function parent(chemin: string): string {
  return segments(chemin).slice(0, -1).join('/')
}

export function nomDe(chemin: string): string {
  return segments(chemin).at(-1) ?? ''
}
