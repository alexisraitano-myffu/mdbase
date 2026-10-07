import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { FichierIntrouvable, segments, type AdaptateurFichiers, type Entree } from '../../core/fichiers'

/**
 * Adaptateur de fichiers sur le disque, pour le script (Node). Les chemins du
 * cœur (« / », relatifs à l'espace) sont traduits en chemins du système, sous
 * la racine de l'espace : rien ne s'écrit ailleurs.
 */
export class AdaptateurNode implements AdaptateurFichiers {
  constructor(private readonly racine: string) {}

  private chemin(c: string): string {
    const parties = segments(c)
    if (parties.some((p) => p === '..' || p === '.')) throw new Error(`Chemin refusé : ${c}`)
    return join(this.racine, ...parties)
  }

  private async ouIntrouvable<T>(c: string, f: () => Promise<T>): Promise<T> {
    try {
      return await f()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new FichierIntrouvable(c)
      throw e
    }
  }

  lister(dossier: string): Promise<Entree[]> {
    return this.ouIntrouvable(dossier, async () =>
      (await readdir(this.chemin(dossier), { withFileTypes: true })).flatMap((e): Entree[] =>
        e.isDirectory() ? [{ nom: e.name, type: 'dossier' }] : e.isFile() ? [{ nom: e.name, type: 'fichier' }] : [],
      ),
    )
  }

  lire(c: string): Promise<string> {
    return this.ouIntrouvable(c, () => readFile(this.chemin(c), 'utf8'))
  }

  async ecrire(c: string, contenu: string): Promise<void> {
    const cible = this.chemin(c)
    await mkdir(dirname(cible), { recursive: true })
    await writeFile(cible, contenu, 'utf8')
  }

  renommer(ancien: string, nouveau: string): Promise<void> {
    return this.ouIntrouvable(ancien, () => rename(this.chemin(ancien), this.chemin(nouveau)))
  }

  supprimer(c: string): Promise<void> {
    return this.ouIntrouvable(c, async () => {
      const cible = this.chemin(c)
      if ((await stat(cible)).isDirectory()) await rmdir(cible)
      else await rm(cible)
    })
  }

  dateModification(c: string): Promise<number> {
    return this.ouIntrouvable(c, async () => (await stat(this.chemin(c))).mtimeMs)
  }
}
