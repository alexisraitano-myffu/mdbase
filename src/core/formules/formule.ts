import { natureDe, type Colonne } from '../schema'
import { estDateValide } from '../valeurs'
import { enTexte, ErreurCalcul, FONCTIONS, NOMS_TYPES, type Environnement, type TypeFormule, type ValeurFormule } from './fonctions'
import { analyser, ErreurFormule, references, type Noeud, type OperateurBinaire, type Position } from './syntaxe'

// Compilation (analyse + typage) et évaluation d'une formule (spec §6).
// Le typage a lieu une fois, à la lecture du schéma et dans l'éditeur ;
// l'évaluation, ligne par ligne, ne fait plus que parcourir l'arbre.

export type Compilee = {
  arbre: Noeud
  type: TypeFormule
  /** Colonne de chaque référence `prop("…")`, par texte de la référence. */
  colonnes: ReadonlyMap<string, Colonne>
}

/** Trouve la colonne désignée par `prop("…")` : par clé dans le schéma, par nom (puis clé) dans l'éditeur. */
export type Resolveur = (ref: string) => Colonne | undefined

export const MESSAGE_MULTI = 'cette colonne contient plusieurs valeurs, passe par un rollup (compter, somme…)'

/** Type qu'une colonne apporte dans une formule, ou la raison pour laquelle elle est refusée. */
export function typeDeColonne(c: Colonne): TypeFormule | string {
  if (c.type === 'formula') return c.resultat ?? `la formule « ${c.nom} » est elle-même en erreur`
  switch (natureDe(c)) {
    case 'nombre':
      return 'nombre'
    case 'date':
      return 'date'
    case 'case':
      return 'case'
    case 'texte':
    case 'choix':
      return 'texte'
    case 'liste':
      return MESSAGE_MULTI
  }
}

/** Analyse et type une expression ; lève `ErreurFormule` avec la position fautive. */
export function compiler(expression: string, resoudre: Resolveur, typeDe: (c: Colonne) => TypeFormule | string = typeDeColonne): Compilee {
  const arbre = analyser(expression)
  const colonnes = new Map<string, Colonne>()
  const typer = (n: Noeud): TypeFormule => {
    switch (n.type) {
      case 'nombre':
      case 'texte':
      case 'case':
        return n.type
      case 'prop': {
        const c = resoudre(n.ref)
        if (!c) throw new ErreurFormule(`Colonne « ${n.ref} » introuvable`, n)
        const t = typeDe(c)
        if (!estType(t)) throw new ErreurFormule(`« ${c.nom} » : ${t}`, n)
        colonnes.set(n.ref, c)
        return t
      }
      case 'unaire': {
        const t = typer(n.arg)
        const attendu = n.op === '-' ? 'nombre' : 'case'
        if (t !== attendu) throw new ErreurFormule(`« ${n.op} » s’applique à ${NOMS_TYPES[attendu]}, pas à ${NOMS_TYPES[t]}`, n)
        return attendu
      }
      case 'binaire': {
        // Un texte écrit comme une date (« "2026-10-01" ») se compare à une date.
        let g = typer(n.gauche)
        let d = typer(n.droite)
        if (g === 'date' && estLitteralDate(n.droite)) d = 'date'
        if (d === 'date' && estLitteralDate(n.gauche)) g = 'date'
        return typerBinaire(n.op, g, d, n)
      }
      case 'appel':
        return typerAppel(n, typer)
    }
  }
  return { arbre, type: typer(arbre), colonnes }
}

/** Texte littéral au format d'une date : accepté partout où une date est attendue. */
const estLitteralDate = (n: Noeud) => n.type === 'texte' && estDateValide(n.valeur)

const estType = (t: TypeFormule | string): t is TypeFormule => t === 'nombre' || t === 'texte' || t === 'date' || t === 'case'

function typerBinaire(op: OperateurBinaire, g: TypeFormule, d: TypeFormule, pos: Position): TypeFormule {
  switch (op) {
    case '+':
    case '-':
    case '*':
    case '/':
    case '%': {
      if (g === 'nombre' && d === 'nombre') return 'nombre'
      const conseil =
        op === '+' && (g === 'texte' || d === 'texte')
          ? ' ; pour assembler du texte, utilise concat(…)'
          : g === 'date' || d === 'date'
            ? ' ; pour les dates, utilise ecart_jours ou ajouter_jours'
            : ''
      throw new ErreurFormule(`« ${op} » s’applique à des nombres, pas à ${NOMS_TYPES[g === 'nombre' ? d : g]}${conseil}`, pos)
    }
    case 'et':
    case 'ou':
      if (g === 'case' && d === 'case') return 'case'
      throw new ErreurFormule(`« ${op} » relie des conditions (vrai ou faux), pas ${NOMS_TYPES[g === 'case' ? d : g]}`, pos)
    default:
      if (g !== d) throw new ErreurFormule(`On ne peut pas comparer ${NOMS_TYPES[g]} et ${NOMS_TYPES[d]}`, pos)
      if (g === 'case' && op !== '==' && op !== '!=') throw new ErreurFormule('Vrai et faux se comparent seulement avec == ou !=', pos)
      return 'case'
  }
}

function typerAppel(n: Extract<Noeud, { type: 'appel' }>, typer: (n: Noeud) => TypeFormule): TypeFormule {
  const f = FONCTIONS.get(n.nom)
  if (!f) {
    const proche = [...FONCTIONS.keys()].find((k) => distance(k, n.nom.toLowerCase()) <= 2)
    throw new ErreurFormule(`Fonction « ${n.nom} » inconnue${proche ? ` : voulais-tu dire ${proche} ?` : ''}`, n)
  }
  const min = f.args.length - (f.optionnels ?? 0)
  const max = f.repete ? Infinity : f.args.length
  if (n.args.length < min || n.args.length > max) {
    const nombre = f.repete ? `au moins ${min}` : min === max ? `${min}` : `${min} ou ${max}`
    throw new ErreurFormule(`${f.signature} attend ${nombre} argument${min > 1 || f.repete ? 's' : ''}, pas ${n.args.length}`, n)
  }
  const types = n.args.map((a, i) => {
    const brut = typer(a)
    const attendu = f.args[Math.min(i, f.args.length - 1)]!
    const t = attendu === 'date' && estLitteralDate(a) ? 'date' : brut
    if (attendu !== '*' && t !== attendu) throw new ErreurFormule(`${n.nom} : l’argument ${i + 1} doit être ${NOMS_TYPES[attendu]}, pas ${NOMS_TYPES[t]}`, a)
    return t
  })
  const r = typeof f.retour === 'function' ? f.retour(types) : f.retour
  if (!estType(r)) throw new ErreurFormule(r, n)
  return r
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let precedent = d[0]!
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const t = d[j]!
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, precedent + (a[i - 1] === b[j - 1] ? 0 : 1))
      precedent = t
    }
  }
  return d[b.length]!
}

// ── Évaluation ─────────────────────────────────────────────────────

/**
 * Valeur d'une formule compilée pour une ligne. `lire` donne la valeur d'une
 * colonne référencée (vide : `undefined`) ou lève `ErreurCalcul`. Une erreur
 * de calcul (division par zéro…) lève aussi `ErreurCalcul`.
 */
export function evaluer(f: Compilee, lire: (c: Colonne) => ValeurFormule, env: Environnement): ValeurFormule {
  const val = (n: Noeud): ValeurFormule => {
    switch (n.type) {
      case 'nombre':
      case 'texte':
      case 'case':
        return n.valeur
      case 'prop':
        return lire(f.colonnes.get(n.ref)!)
      case 'unaire': {
        const v = val(n.arg)
        if (n.op === 'non') return v !== true
        return v === undefined ? undefined : -(v as number)
      }
      case 'binaire':
        return binaire(n.op, n, val)
      case 'appel': {
        if (n.nom === 'si') return val(n.args[0]!) === true ? val(n.args[1]!) : val(n.args[2]!)
        const fn = FONCTIONS.get(n.nom)!
        const args = n.args.map(val)
        if (fn.videSiVide && args.some((a) => a === undefined || a === '')) return undefined
        return fn.calculer(args, env)
      }
    }
  }
  const v = val(f.arbre)
  if (typeof v === 'number' && !Number.isFinite(v)) throw new ErreurCalcul('Résultat hors limites')
  return v === '' ? undefined : v
}

function binaire(op: OperateurBinaire, n: Extract<Noeud, { type: 'binaire' }>, val: (n: Noeud) => ValeurFormule): ValeurFormule {
  if (op === 'et') return val(n.gauche) === true && val(n.droite) === true
  if (op === 'ou') return val(n.gauche) === true || val(n.droite) === true
  const g = val(n.gauche)
  const d = val(n.droite)
  if (op === '==') return g === d
  if (op === '!=') return g !== d
  if (g === undefined || d === undefined) return undefined
  switch (op) {
    case '<':
      return g < d
    case '<=':
      return g <= d
    case '>':
      return g > d
    case '>=':
      return g >= d
  }
  const a = g as number
  const b = d as number
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
    case '%':
      if (b === 0) throw new ErreurCalcul('Division par zéro')
      return op === '/' ? a / b : a % b
  }
}

// ── Schéma et éditeur ──────────────────────────────────────────────

/**
 * Types des formules d'un schéma, calculés dans l'ordre de leurs références :
 * une formule qui en lit une autre prend son type. Une formule en erreur, ou
 * prise dans une boucle, n'a pas de type.
 */
export function typerFormules(colonnes: readonly Colonne[]): Map<string, TypeFormule | string> {
  const resultats = new Map<string, TypeFormule | string>()
  const enCours = new Set<string>()
  const parCle = (cle: string) => colonnes.find((c) => c.cle === cle)
  const typeDe = (c: Colonne): TypeFormule | string => {
    if (c.type !== 'formula') return typeDeColonne(c)
    const connu = resultats.get(c.cle)
    if (connu !== undefined) return connu
    if (enCours.has(c.cle)) return 'boucle de dépendances'
    enCours.add(c.cle)
    let r: TypeFormule | string
    try {
      r = compiler(c.expression, parCle, typeDe).type
    } catch (e) {
      if (!(e instanceof ErreurFormule)) throw e
      r = e.message
    }
    enCours.delete(c.cle)
    resultats.set(c.cle, r)
    return r
  }
  for (const c of colonnes) if (c.type === 'formula') typeDe(c)
  return resultats
}

/** Résolveur de l'éditeur : l'utilisateur écrit les noms, on accepte aussi les clés. */
export function resoudreParNom(colonnes: readonly Colonne[]): Resolveur {
  return (ref) => colonnes.find((c) => c.nom === ref) ?? colonnes.find((c) => c.cle === ref)
}

const guillemets = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Remplace le texte de chaque `prop("…")` ; l'expression reste telle quelle si elle ne s'analyse pas. */
function remplacerRefs(expression: string, remplacer: (ref: string) => string | undefined): string {
  let arbre: Noeud
  try {
    arbre = analyser(expression)
  } catch {
    return expression
  }
  let sortie = expression
  for (const n of references(arbre).sort((a, b) => b.debut - a.debut)) {
    if (n.type !== 'prop') continue
    const r = remplacer(n.ref)
    if (r !== undefined) sortie = `${sortie.slice(0, n.debut)}prop(${guillemets(r)})${sortie.slice(n.fin)}`
  }
  return sortie
}

/** Expression stockée (clés) → texte de l'éditeur (noms). */
export function afficherExpression(expression: string, colonnes: readonly Colonne[]): string {
  return remplacerRefs(expression, (cle) => colonnes.find((c) => c.cle === cle)?.nom)
}

/** Texte de l'éditeur (noms) → expression stockée (clés), spec §6. */
export function stockerExpression(texte: string, colonnes: readonly Colonne[]): string {
  return remplacerRefs(texte, (ref) => resoudreParNom(colonnes)(ref)?.cle)
}

export { enTexte, ErreurCalcul, ErreurFormule, type Environnement, type TypeFormule, type ValeurFormule }
