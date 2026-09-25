import { parseDocument, stringify } from 'yaml'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from '../fichiers'
import { slug } from '../identifiants'
import { estObjet } from '../schema'

// Mémoire et skills de l'assistant (spec §3 et §12) : `_assistant/memoire.md`,
// un fait par ligne de liste, et `_assistant/skills/<slug>.md`. Comme toute
// configuration, relus sur le disque juste avant d'être modifiés.

export const DOSSIER_ASSISTANT = '_assistant'
const FICHIER_MEMOIRE = joindre(DOSSIER_ASSISTANT, 'memoire.md')
const DOSSIER_SKILLS = joindre(DOSSIER_ASSISTANT, 'skills')
const ENTETE_MEMOIRE = '# Mémoire de l’assistant\n\nCe que l’assistant IA de mdbase retient d’une conversation à l’autre, un fait par ligne.\n\n'

export type Skill = { nom: string; description: string; instructions: string }
export type Assistant = { memoire: string[]; skills: Skill[] }

const FAIT = /^\s*[-*]\s+(.+?)\s*$/
const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

function lireFaits(texte: string): string[] {
  return texte.split(/\r?\n/).flatMap((l) => {
    const m = FAIT.exec(l)
    return m ? [m[1]!] : []
  })
}

/** Lit un skill ; `null` si le fichier n'en est pas un (frontmatter sans `nom`). */
export function lireSkill(texte: string): Skill | null {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(texte)
  if (!m) return null
  let entete: unknown
  try {
    entete = parseDocument(m[1]!).toJS()
  } catch {
    return null
  }
  if (!estObjet(entete) || typeof entete.nom !== 'string' || entete.nom.trim() === '') return null
  return { nom: entete.nom.trim(), description: typeof entete.description === 'string' ? entete.description.trim() : '', instructions: m[2]!.trim() }
}

export function ecrireSkill(s: Skill): string {
  return `---\n${stringify({ nom: s.nom, description: s.description }).trimEnd()}\n---\n\n${s.instructions.trim()}\n`
}

export class MemoireAssistant {
  private readonly adaptateur: AdaptateurFichiers
  /** Sérialise les écritures : deux faits retenus coup sur coup ne s'écrasent pas. */
  private file: Promise<unknown> = Promise.resolve()

  constructor(adaptateur: AdaptateurFichiers) {
    this.adaptateur = adaptateur
  }

  async lire(): Promise<Assistant> {
    const memoire = lireFaits((await this.lireOuNull(FICHIER_MEMOIRE)) ?? '')
    const skills: Skill[] = []
    for (const nom of await this.skillsSurDisque()) {
      const s = lireSkill((await this.lireOuNull(joindre(DOSSIER_SKILLS, nom))) ?? '')
      if (s) skills.push(s)
    }
    return { memoire, skills: skills.sort((a, b) => a.nom.localeCompare(b.nom)) }
  }

  /** Ajoute un fait (sauf s'il y est déjà) ; renvoie le fait tel qu'écrit. */
  retenir(fait: string): Promise<string> {
    const propre = fait.replace(/\s+/g, ' ').trim()
    return this.enFile(async () => {
      const texte = (await this.lireOuNull(FICHIER_MEMOIRE)) ?? ENTETE_MEMOIRE
      if (lireFaits(texte).some((f) => normaliser(f) === normaliser(propre))) return propre
      const fin = texte === '' || texte.endsWith('\n') ? texte : `${texte}\n`
      await this.adaptateur.ecrire(FICHIER_MEMOIRE, `${fin}- ${propre}\n`)
      return propre
    })
  }

  /** Retire un fait (casse, accents et espaces ignorés) ; le reste du fichier est préservé. */
  oublier(fait: string): Promise<void> {
    return this.enFile(async () => {
      const texte = await this.lireOuNull(FICHIER_MEMOIRE)
      if (texte === null) return
      const lignes = texte.split('\n')
      const i = lignes.findIndex((l) => {
        const m = FAIT.exec(l)
        return m !== null && normaliser(m[1]!) === normaliser(fait)
      })
      if (i < 0) return
      lignes.splice(i, 1)
      await this.adaptateur.ecrire(FICHIER_MEMOIRE, lignes.join('\n'))
    })
  }

  /** Crée ou remplace le skill de même nom (casse et accents ignorés). */
  enregistrerSkill(s: Skill): Promise<void> {
    return this.enFile(async () => {
      const existant = await this.fichierDuSkill(s.nom)
      await this.adaptateur.ecrire(existant ?? joindre(DOSSIER_SKILLS, `${slug(s.nom) || 'skill'}.md`), ecrireSkill(s))
    })
  }

  supprimerSkill(nom: string): Promise<void> {
    return this.enFile(async () => {
      const chemin = await this.fichierDuSkill(nom)
      if (chemin) await this.adaptateur.supprimer(chemin)
    })
  }

  private async fichierDuSkill(nom: string): Promise<string | null> {
    for (const f of await this.skillsSurDisque()) {
      const chemin = joindre(DOSSIER_SKILLS, f)
      const s = lireSkill((await this.lireOuNull(chemin)) ?? '')
      if (s && normaliser(s.nom) === normaliser(nom)) return chemin
    }
    return null
  }

  private async skillsSurDisque(): Promise<string[]> {
    try {
      return (await this.adaptateur.lister(DOSSIER_SKILLS)).filter((e) => e.type === 'fichier' && e.nom.endsWith('.md')).map((e) => e.nom)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return []
      throw e
    }
  }

  private async lireOuNull(chemin: string): Promise<string | null> {
    try {
      return await this.adaptateur.lire(chemin)
    } catch (e) {
      if (e instanceof FichierIntrouvable) return null
      throw e
    }
  }

  private enFile<T>(action: () => Promise<T>): Promise<T> {
    const suite = this.file.then(action)
    this.file = suite.catch(() => undefined)
    return suite
  }
}
