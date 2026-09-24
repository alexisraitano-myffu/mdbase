import {
  FichierIntrouvable,
  joindre,
  nomDe,
  parent,
  segments,
  type AdaptateurFichiers,
  type Entree,
} from '../../core/fichiers'

/** Adaptateur sur l'API File System Access (Chrome, Edge). */
export class AdaptateurFsa implements AdaptateurFichiers {
  private readonly racine: FileSystemDirectoryHandle

  constructor(racine: FileSystemDirectoryHandle) {
    this.racine = racine
  }

  async lister(dossier: string): Promise<Entree[]> {
    const d = await this.dossier(dossier, false)
    const entrees: Entree[] = []
    for await (const [nom, h] of d.entries()) {
      entrees.push({ nom, type: h.kind === 'directory' ? 'dossier' : 'fichier' })
    }
    return entrees.sort((a, b) => a.nom.localeCompare(b.nom))
  }

  async lire(chemin: string): Promise<string> {
    return (await (await this.fichier(chemin, false)).getFile()).text()
  }

  async ecrire(chemin: string, contenu: string): Promise<void> {
    const flux = await (await this.fichier(chemin, true)).createWritable()
    await flux.write(contenu)
    await flux.close()
  }

  async renommer(ancien: string, nouveau: string): Promise<void> {
    const h = await this.fichier(ancien, false)
    const deplacer = (h as { move?: (d: FileSystemDirectoryHandle, n: string) => Promise<void> }).move
    if (deplacer) {
      await deplacer.call(h, await this.dossier(parent(nouveau), true), nomDe(nouveau))
      return
    }
    // Repli pour les navigateurs sans move() : copie puis suppression.
    await this.ecrire(nouveau, await this.lire(ancien))
    await this.supprimer(ancien)
  }

  async supprimer(chemin: string): Promise<void> {
    const d = await this.dossier(parent(chemin), false)
    await traduire(joindre(chemin), () => d.removeEntry(nomDe(chemin)))
  }

  async dateModification(chemin: string): Promise<number> {
    return (await (await this.fichier(chemin, false)).getFile()).lastModified
  }

  private async dossier(chemin: string, creer: boolean): Promise<FileSystemDirectoryHandle> {
    let d = this.racine
    for (const s of segments(chemin)) {
      const courant = d
      d = await traduire(joindre(chemin), () => courant.getDirectoryHandle(s, { create: creer }))
    }
    return d
  }

  private async fichier(chemin: string, creer: boolean): Promise<FileSystemFileHandle> {
    const d = await this.dossier(parent(chemin), creer)
    return traduire(joindre(chemin), () => d.getFileHandle(nomDe(chemin), { create: creer }))
  }
}

/** Convertit les erreurs « introuvable » du navigateur en erreur du cœur. */
async function traduire<T>(chemin: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError')) {
      throw new FichierIntrouvable(chemin)
    }
    throw e
  }
}
