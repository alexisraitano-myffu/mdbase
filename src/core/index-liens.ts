import type { EtatEspace } from './depot-espace'
import { lireLiens, resoudreLien } from './liens-internes'

// Index des liens de l'espace (spec §22, « Index ») : qui cite qui, entre les
// corps des lignes et les pages du wiki. En mémoire seulement, jamais écrit :
// construit en une passe à l'ouverture, puis tenu à jour corps par corps (seul
// un corps qui a changé est relu). Les rétroliens en viennent : « Citée par »
// sur une page du wiki, « Citée dans » sur la page d'une ligne.

/** Un corps qui cite : une ligne (`base` = son dossier) ou une page du wiki (`base` = `_wiki`). */
export type SourceLien = { base: string; id: string }

type Entree = { source: SourceLien; corps: string; cibles: string[] }

const cle = (s: SourceLien) => `${s.base}/${s.id}`

/** L'id visé par la cible d'un lien : ce qui suit le dernier `--` du nom de fichier. */
function idCible(cible: string): string {
  const nom = cible.replace(/\.md$/, '').split('/').at(-1) ?? ''
  return nom.includes('--') ? nom.slice(nom.lastIndexOf('--') + 2) : nom
}

export class IndexLiens {
  private parSource = new Map<string, Entree>()
  /** Id visé → sources qui ont au moins un lien finissant par cet id. */
  private parId = new Map<string, Set<string>>()

  /**
   * Met l'index à jour d'après tous les corps de l'espace. Un corps inchangé
   * (même texte) n'est pas relu ; une source disparue est retirée.
   */
  synchroniser(corps: Iterable<SourceLien & { corps: string }>): void {
    const vus = new Set<string>()
    for (const c of corps) {
      const k = cle(c)
      vus.add(k)
      const avant = this.parSource.get(k)
      if (avant?.corps === c.corps) continue
      if (avant) this.retirer(k, avant)
      const cibles = c.corps.includes('[[') ? lireLiens(c.corps).map((l) => l.cible) : []
      this.parSource.set(k, { source: { base: c.base, id: c.id }, corps: c.corps, cibles })
      for (const id of new Set(cibles.map(idCible))) {
        let s = this.parId.get(id)
        if (!s) this.parId.set(id, (s = new Set()))
        s.add(k)
      }
    }
    for (const [k, e] of this.parSource) if (!vus.has(k)) {
      this.retirer(k, e)
      this.parSource.delete(k)
    }
  }

  private retirer(k: string, e: Entree) {
    for (const id of new Set(e.cibles.map(idCible))) {
      const s = this.parId.get(id)
      s?.delete(k)
      if (s?.size === 0) this.parId.delete(id)
    }
  }

  /**
   * Ce qui cite `cible` (une ligne, ou une page si `base` vaut `_wiki`), résolu
   * comme à l'affichage : un lien au nom de fichier périmé compte, un homonyme
   * d'une autre base non. Jamais la cible elle-même.
   */
  citant(etat: EtatEspace, cible: SourceLien): SourceLien[] {
    const resultat: SourceLien[] = []
    for (const k of this.parId.get(cible.id) ?? []) {
      const e = this.parSource.get(k)!
      if (e.source.base === cible.base && e.source.id === cible.id) continue
      const vise = e.cibles.some((c) => {
        const r = idCible(c) === cible.id ? resoudreLien(etat, c) : null
        return r?.base === cible.base && r.id === cible.id
      })
      if (vise) resultat.push(e.source)
    }
    return resultat
  }

  /** Nombre de corps indexés (pour les tests et le banc). */
  get taille(): number {
    return this.parSource.size
  }
}
