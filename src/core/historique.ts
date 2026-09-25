import type { Modifications } from './ligne'
import type { Valeur } from './valeurs'

// Annuler / rétablir (Ctrl+Z) sur les données : cellules, corps des pages,
// lignes créées, lignes supprimées. Le schéma, les vues et les dashboards n'y sont pas.

/** Un changement élémentaire, noté par `DepotBase` au moment où il a lieu. */
export type Changement =
  | { type: 'cellule'; base: string; id: string; cle: string; avant: Valeur | undefined; apres: Valeur | undefined }
  | { type: 'corps'; base: string; id: string; avant: string; apres: string }
  | { type: 'creee'; base: string; id: string }
  /** `source` : le fichier tel qu'écrit ; `enAttente` : les modifications pas encore écrites. */
  | { type: 'supprimee'; base: string; id: string; chemin: string; source: string; enAttente: Modifications }

/** Une étape d'annulation : ce qu'un geste de l'utilisateur a changé. */
type Etape = { changements: Changement[]; ouverte: boolean }

const ETAPES_MAX = 100

/**
 * Pile des étapes. Les changements notés pendant `groupe` forment une seule
 * étape ; hors groupe, les frappes successives dans une même cellule se
 * fondent en une étape tant que `fermer` n'a pas été appelé.
 */
export class Historique {
  private passe: Etape[] = []
  private futur: Etape[] = []
  private enCours: Etape | null = null
  /** Rejeu d'une annulation : ses changements vont dans l'autre pile, sans vider le futur. */
  private rejeu: 'passe' | 'futur' | null = null

  noter(c: Changement): void {
    if (this.enCours) {
      this.enCours.changements.push(c)
      return
    }
    const derniere = this.passe.at(-1)
    const d = derniere?.ouverte && derniere.changements.length === 1 ? derniere.changements[0] : undefined
    if (c.type === 'cellule' && d?.type === 'cellule' && d.base === c.base && d.id === c.id && d.cle === c.cle) {
      d.apres = c.apres
      return
    }
    if (c.type === 'corps' && d?.type === 'corps' && d.base === c.base && d.id === c.id) {
      d.apres = c.apres
      return
    }
    this.empiler({ changements: [c], ouverte: c.type === 'cellule' || c.type === 'corps' })
  }

  /** Termine l'étape en cours de frappe : la prochaine modification en ouvrira une autre. */
  fermer(): void {
    const derniere = this.passe.at(-1)
    if (derniere) derniere.ouverte = false
  }

  /** Exécute `action` ; tout ce qu'elle change s'annule d'un seul Ctrl+Z. */
  groupe<T>(action: () => T): T {
    if (this.enCours) return action()
    const etape: Etape = { changements: [], ouverte: false }
    this.enCours = etape
    const clore = () => {
      if (this.enCours === etape) this.enCours = null
      if (etape.changements.length > 0) this.empiler(etape)
    }
    let r: T
    try {
      r = action()
    } catch (x) {
      clore()
      throw x
    }
    if (r instanceof Promise) return r.finally(clore) as T
    clore()
    return r
  }

  peutAnnuler = (): boolean => this.passe.length > 0
  peutRetablir = (): boolean => this.futur.length > 0

  /**
   * Retire la dernière étape et la rejoue à l'envers avec `inverser` ; les
   * changements produits forment l'étape de « rétablir ». `false` si rien à annuler.
   */
  annuler(inverser: (c: Changement) => Promise<void>): Promise<boolean> {
    return this.rejouer(this.passe, 'futur', inverser)
  }

  retablir(inverser: (c: Changement) => Promise<void>): Promise<boolean> {
    return this.rejouer(this.futur, 'passe', inverser)
  }

  private async rejouer(pile: Etape[], vers: 'passe' | 'futur', inverser: (c: Changement) => Promise<void>): Promise<boolean> {
    const etape = pile.pop()
    if (!etape) return false
    this.rejeu = vers
    try {
      await this.groupe(async () => {
        for (const c of [...etape.changements].reverse()) await inverser(c)
      })
    } finally {
      this.rejeu = null
    }
    return true
  }

  private empiler(etape: Etape) {
    this.fermer()
    if (this.rejeu === 'futur') {
      this.futur.push(etape)
      return
    }
    this.passe.push(etape)
    if (this.passe.length > ETAPES_MAX) this.passe.shift()
    if (this.rejeu === null) this.futur = []
  }
}
