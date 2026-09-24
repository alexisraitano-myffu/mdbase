import { AdaptateurMemoire } from '../adaptateur-memoire'
import type { Planifier } from '../depot-base'

/** Minuteur manuel : rien ne s'exécute avant `avancer()`. */
export function minuteur() {
  const taches = new Set<() => void>()
  const planifier: Planifier = (action) => {
    taches.add(action)
    return () => taches.delete(action)
  }
  const avancer = () => {
    const courantes = [...taches]
    taches.clear()
    for (const t of courantes) t()
  }
  return { planifier, avancer, enAttente: () => taches.size }
}

/** Chaque écriture a une date distincte, comme sur un vrai disque entre deux actions. */
export function horlogeCroissante() {
  let t = 0
  return () => ++t
}

let graine = 0
/** Octets pseudo-aléatoires différents à chaque appel, reproductibles d'une exécution à l'autre. */
export const aleatoire = (n: number) => {
  graine++
  return Uint8Array.from({ length: n }, (_, i) => (graine * 31 + i * 17) % 256)
}

/** Adaptateur mémoire qui journalise les écritures, renommages et suppressions. */
export class AdaptateurCompteur extends AdaptateurMemoire {
  ecritures: string[] = []
  constructor(initial: Record<string, string> = {}) {
    super(initial, horlogeCroissante())
  }
  override async ecrire(chemin: string, contenu: string) {
    this.ecritures.push(chemin)
    return super.ecrire(chemin, contenu)
  }
  override async renommer(ancien: string, nouveau: string) {
    this.ecritures.push(`${ancien} → ${nouveau}`)
    return super.renommer(ancien, nouveau)
  }
  override async supprimer(chemin: string) {
    this.ecritures.push(`✗ ${chemin}`)
    return super.supprimer(chemin)
  }
}
