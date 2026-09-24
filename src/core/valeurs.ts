import type { Colonne } from './schema'

// Encodage des valeurs saisies dans le frontmatter (spec §3, tableau
// « Encodage des valeurs »). Lecture tolérante (spec §4) : une valeur invalide
// est gardée telle quelle et signalée, jamais effacée.

/**
 * Valeur typée d'une cellule saisie :
 * text, url, date, select → string ; number → number ; checkbox → boolean ;
 * multiselect, relation → string[] (une relation est toujours une liste en interne).
 */
export type Valeur = string | number | boolean | string[]

export type Cellule =
  | { etat: 'ok'; valeur: Valeur }
  | { etat: 'invalide'; brut: unknown; raison: string }

const DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/

export function estDateValide(s: string): boolean {
  const m = DATE.exec(s)
  if (!m) return false
  const [a, mo, j, h = '0', mi = '0'] = m.slice(1).map((x) => x ?? '0')
  const d = new Date(Date.UTC(Number(a), Number(mo) - 1, Number(j)))
  return (
    d.getUTCFullYear() === Number(a) &&
    d.getUTCMonth() === Number(mo) - 1 &&
    d.getUTCDate() === Number(j) &&
    Number(h) < 24 &&
    Number(mi) < 60
  )
}

/** Décode la valeur brute lue dans le frontmatter. Appelé seulement si la clé est présente. */
export function decoder(colonne: Colonne, brut: unknown): Cellule {
  const invalide = (raison: string): Cellule => ({ etat: 'invalide', brut, raison })
  const ok = (valeur: Valeur): Cellule => ({ etat: 'ok', valeur })

  switch (colonne.type) {
    case 'text':
    case 'url':
      // Un texte saisi à la main peut être lu comme nombre ou booléen par YAML.
      if (typeof brut === 'string') return ok(brut)
      if (typeof brut === 'number' || typeof brut === 'boolean') return ok(String(brut))
      return invalide('texte attendu')
    case 'number':
      return typeof brut === 'number' && Number.isFinite(brut) ? ok(brut) : invalide('nombre attendu')
    case 'date':
      return typeof brut === 'string' && estDateValide(brut) ? ok(brut) : invalide('date attendue (AAAA-MM-JJ)')
    case 'checkbox':
      return typeof brut === 'boolean' ? ok(brut) : invalide('true ou false attendu')
    case 'select': {
      if (typeof brut !== 'string') return invalide('option attendue')
      return colonne.options.some((o) => o.label === brut) ? ok(brut) : invalide(`option « ${brut} » inexistante`)
    }
    case 'multiselect': {
      const liste = typeof brut === 'string' ? [brut] : brut
      if (!Array.isArray(liste) || !liste.every((x) => typeof x === 'string')) return invalide('liste d’options attendue')
      const inconnue = liste.find((x) => !colonne.options.some((o) => o.label === x))
      return inconnue === undefined ? ok(liste) : invalide(`option « ${inconnue} » inexistante`)
    }
    case 'relation': {
      const liste = typeof brut === 'string' ? [brut] : brut
      if (!Array.isArray(liste) || !liste.every((x) => typeof x === 'string' && x !== '')) {
        return invalide('identifiant ou liste d’identifiants attendu')
      }
      return ok(liste)
    }
    case 'rollup':
    case 'formula':
      return invalide('colonne calculée : jamais stockée')
  }
}

/**
 * Valeur à écrire dans le frontmatter, ou `undefined` si le champ doit être
 * omis (vide, case décochée : spec §3).
 */
export function encoder(colonne: Colonne, valeur: Valeur | undefined): unknown {
  if (valeur === undefined) return undefined
  switch (colonne.type) {
    case 'checkbox':
      return valeur === true ? true : undefined
    case 'number':
      return typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : undefined
    case 'multiselect':
      return Array.isArray(valeur) && valeur.length > 0 ? valeur : undefined
    case 'relation':
      // Un seul lien s'écrit comme un id, plusieurs comme une liste (spec §3).
      if (!Array.isArray(valeur) || valeur.length === 0) return undefined
      return valeur.length === 1 ? valeur[0] : valeur
    case 'rollup':
    case 'formula':
      return undefined
    default:
      return typeof valeur === 'string' && valeur !== '' ? valeur : undefined
  }
}
