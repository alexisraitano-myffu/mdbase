import type { LigneVue } from './filtres'
import { colonne as colonneDe, type Colonne, type Schema } from './schema'
import type { Valeur } from './valeurs'
import type { Vue } from './vue'

// Colonnes d'une vue, groupement (tableau et kanban, spec §7) et changement de
// groupe par glisser-déposer.

/** Colonnes affichées par une vue, dans son ordre ; celles qu'elle ne cite pas suivent, dans l'ordre du schéma. */
export function colonnesDeLaVue(schema: Schema, vue: Pick<Vue, 'ordre' | 'masquees'>): { visibles: Colonne[]; masquees: Colonne[] } {
  const citees = (vue.ordre ?? []).flatMap((cle) => {
    const c = colonneDe(schema, cle)
    return c ? [c] : []
  })
  const vues = new Set(citees.map((c) => c.cle))
  const toutes = [...citees, ...schema.colonnes.filter((c) => !vues.has(c.cle))]
  const masquees = new Set(vue.masquees ?? [])
  // Le titre reste toujours visible : c'est lui qui ouvre la page.
  return {
    visibles: toutes.filter((c) => !masquees.has(c.cle) || c.cle === schema.champTitre),
    masquees: toutes.filter((c) => masquees.has(c.cle) && c.cle !== schema.champTitre),
  }
}

/** Colonnes par lesquelles on peut grouper. */
export function groupables(schema: Schema): Colonne[] {
  return schema.colonnes.filter((c) => ['select', 'checkbox', 'multiselect', 'relation', 'text'].includes(c.type))
}

export const CLE_VIDE = '∅'

export type Groupe = {
  /** Identifiant stable du groupe (valeur, id lié, ou `∅`). */
  cle: string
  libelle: string
  couleur?: string
  /** Valeur d'une ligne créée dans ce groupe (spec §8) ; absente pour le groupe vide. */
  valeur?: Valeur
  lignes: LigneVue[]
}

/**
 * Répartit les lignes par valeur de la colonne. Une ligne à plusieurs valeurs
 * (multiselect, relation) apparaît dans chacun de ses groupes. Avec
 * `inclureVides`, les options d'un select et les deux états d'une case sont
 * toujours présents, même sans ligne (colonnes du kanban).
 */
export function grouper(
  lignes: readonly LigneVue[],
  colonne: Colonne,
  titre: (id: string) => string | null,
  inclureVides = false,
): Groupe[] {
  const groupes = new Map<string, Groupe>()
  const ajouter = (g: Omit<Groupe, 'lignes'>, l?: LigneVue) => {
    let x = groupes.get(g.cle)
    if (!x) groupes.set(g.cle, (x = { ...g, lignes: [] }))
    if (l) x.lignes.push(l)
  }
  const vide: Omit<Groupe, 'lignes'> = { cle: CLE_VIDE, libelle: `Sans ${colonne.nom.toLowerCase()}` }

  if (inclureVides) {
    if (colonne.type === 'select' || colonne.type === 'multiselect') {
      for (const o of colonne.options) ajouter(groupeOption(colonne, o.label))
    }
    if (colonne.type === 'checkbox') {
      ajouter({ cle: 'non', libelle: 'Non coché', valeur: false })
      ajouter({ cle: 'oui', libelle: 'Coché', valeur: true })
    }
  }

  for (const l of lignes) {
    const c = l.ligne.cellules[colonne.cle]
    const v = c?.etat === 'ok' ? c.valeur : undefined
    switch (colonne.type) {
      case 'checkbox':
        ajouter(v === true ? { cle: 'oui', libelle: 'Coché', valeur: true } : { cle: 'non', libelle: 'Non coché', valeur: false }, l)
        break
      case 'select':
        ajouter(typeof v === 'string' ? groupeOption(colonne, v) : vide, l)
        break
      case 'multiselect':
        if (Array.isArray(v) && v.length > 0) for (const x of v) ajouter(groupeOption(colonne, x), l)
        else ajouter(vide, l)
        break
      case 'relation':
        if (Array.isArray(v) && v.length > 0) for (const id of v) ajouter({ cle: id, libelle: titre(id) ?? `⚠ ${id}`, valeur: [id] }, l)
        else ajouter(vide, l)
        break
      default:
        ajouter(typeof v === 'string' && v !== '' ? { cle: v, libelle: v, valeur: v } : vide, l)
    }
  }

  // Ordre : options du select, non coché puis coché, sinon alphabétique ; le groupe vide en dernier.
  const collateur = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })
  const rang = (g: Groupe) => {
    if (colonne.type === 'select' || colonne.type === 'multiselect') {
      const i = colonne.options.findIndex((o) => o.label === g.cle)
      return i < 0 ? colonne.options.length : i
    }
    if (colonne.type === 'checkbox') return g.cle === 'non' ? 0 : 1
    return 0
  }
  return [...groupes.values()].sort((a, b) => {
    if (a.cle === CLE_VIDE || b.cle === CLE_VIDE) return a.cle === b.cle ? 0 : a.cle === CLE_VIDE ? 1 : -1
    return rang(a) - rang(b) || collateur.compare(a.libelle, b.libelle)
  })
}

function groupeOption(c: Colonne, label: string): Omit<Groupe, 'lignes'> {
  const option = c.type === 'select' || c.type === 'multiselect' ? c.options.find((o) => o.label === label) : undefined
  return {
    cle: label,
    libelle: label,
    ...(option?.couleur && { couleur: option.couleur }),
    valeur: c.type === 'multiselect' ? [label] : label,
  }
}

/**
 * Valeur d'une ligne glissée d'un groupe à un autre (kanban, spec §7) :
 * le groupe de départ est remplacé par celui d'arrivée. Pour une relation,
 * le lien est remplacé (décision du 24/09) ; pour un multiselect, seule
 * l'option de départ est remplacée.
 */
export function valeurApresDeplacement(colonne: Colonne, actuelle: Valeur | undefined, depuis: string, vers: Groupe): Valeur | undefined {
  if (vers.cle === CLE_VIDE) {
    if (colonne.type === 'multiselect' && Array.isArray(actuelle)) return actuelle.filter((x) => x !== depuis)
    return colonne.type === 'checkbox' ? false : undefined
  }
  if (colonne.type === 'multiselect' && Array.isArray(actuelle)) {
    const sans = actuelle.filter((x) => x !== depuis && x !== vers.cle)
    return [...sans, vers.cle]
  }
  return vers.valeur
}
