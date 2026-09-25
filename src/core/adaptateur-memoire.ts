import {
  FichierIntrouvable,
  joindre,
  nomDe,
  parent,
  segments,
  type AdaptateurFichiers,
  type Entree,
} from './fichiers'

/**
 * Implémentation en mémoire de l'adaptateur. Sert de double pour les tests du
 * cœur, qui tournent ainsi dans Node sans navigateur ni disque.
 */
export class AdaptateurMemoire implements AdaptateurFichiers {
  private readonly fichiers = new Map<string, { contenu: string; date: number }>()
  private readonly dossiers = new Set<string>([''])
  private readonly horloge: () => number

  constructor(initial: Record<string, string> = {}, horloge: () => number = Date.now) {
    this.horloge = horloge
    for (const [chemin, contenu] of Object.entries(initial)) this.poser(chemin, contenu)
  }

  async lister(dossier: string): Promise<Entree[]> {
    const d = joindre(dossier)
    if (!this.dossiers.has(d)) throw new FichierIntrouvable(d)
    const entrees: Entree[] = []
    for (const sous of this.dossiers) {
      if (sous !== '' && parent(sous) === d) entrees.push({ nom: nomDe(sous), type: 'dossier' })
    }
    for (const chemin of this.fichiers.keys()) {
      if (parent(chemin) === d) entrees.push({ nom: nomDe(chemin), type: 'fichier' })
    }
    return entrees.sort((a, b) => a.nom.localeCompare(b.nom))
  }

  async lire(chemin: string): Promise<string> {
    return this.trouver(chemin).contenu
  }

  async ecrire(chemin: string, contenu: string): Promise<void> {
    this.poser(chemin, contenu)
  }

  async renommer(ancien: string, nouveau: string): Promise<void> {
    const fichier = this.trouver(ancien)
    this.fichiers.delete(joindre(ancien))
    this.creerDossiers(parent(nouveau))
    this.fichiers.set(joindre(nouveau), fichier)
  }

  /** Un fichier, ou un dossier vide (comme `removeEntry` du navigateur). */
  async supprimer(chemin: string): Promise<void> {
    const d = joindre(chemin)
    if (d !== '' && this.dossiers.has(d)) {
      if ([...this.dossiers, ...this.fichiers.keys()].some((x) => x !== d && parent(x) === d)) throw new Error(`Dossier non vide : ${d}`)
      this.dossiers.delete(d)
      return
    }
    this.trouver(chemin)
    this.fichiers.delete(joindre(chemin))
  }

  async dateModification(chemin: string): Promise<number> {
    return this.trouver(chemin).date
  }

  private trouver(chemin: string) {
    const fichier = this.fichiers.get(joindre(chemin))
    if (!fichier) throw new FichierIntrouvable(joindre(chemin))
    return fichier
  }

  private poser(chemin: string, contenu: string) {
    const c = joindre(chemin)
    this.creerDossiers(parent(c))
    this.fichiers.set(c, { contenu, date: this.horloge() })
  }

  private creerDossiers(dossier: string) {
    const parts = segments(dossier)
    for (let i = 1; i <= parts.length; i++) this.dossiers.add(parts.slice(0, i).join('/'))
  }
}
