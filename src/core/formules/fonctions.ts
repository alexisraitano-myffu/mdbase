import { ajouterMois, decaler, decalerValeur, ecartJours } from '../temps'

// Fonctions des formules (spec §6), liste fermée : l'interpréteur ne connaît
// qu'elles. Chacune se type avant d'être évaluée, ce qui permet de refuser
// une formule incohérente dans l'éditeur plutôt qu'au calcul.

/** Type d'une valeur de formule. Les dates sont des chaînes ISO (`AAAA-MM-JJ` ou `AAAA-MM-JJTHH:mm`). */
export type TypeFormule = 'nombre' | 'texte' | 'date' | 'case'
/** `undefined` : la valeur vide, qui se propage dans les calculs au lieu d'une erreur. */
export type ValeurFormule = number | string | boolean | undefined

export const NOMS_TYPES: Record<TypeFormule, string> = { nombre: 'un nombre', texte: 'du texte', date: 'une date', case: 'vrai ou faux' }

/** Erreur à l'évaluation (division par zéro…) : la cellule l'affiche en erreur. */
export class ErreurCalcul extends Error {}

export type Environnement = { aujourdhui: string; maintenant: string }

type Fonction = {
  signature: string
  description: string
  /** Types des arguments ; `'*'` : n'importe lequel. `repete` : le dernier se répète. */
  args: (TypeFormule | '*')[]
  optionnels?: number
  repete?: boolean
  /** Type du résultat, ou message d'erreur quand les arguments ne vont pas ensemble. */
  retour: TypeFormule | ((types: TypeFormule[]) => TypeFormule | string)
  /** Les arguments vides donnent un résultat vide, sans appeler `calculer`. */
  videSiVide?: boolean
  calculer: (args: ValeurFormule[], env: Environnement) => ValeurFormule
}

const nombre = (v: ValeurFormule) => v as number
const texte = (v: ValeurFormule) => v as string
const date = (v: ValeurFormule) => (v as string).slice(0, 10)

const memeType = (nom: string) => (types: TypeFormule[]) =>
  types.every((t) => t === types[0]) && (types[0] === 'nombre' || types[0] === 'date')
    ? types[0]!
    : `${nom} compare des nombres, ou des dates, tous du même type`

export const FONCTIONS: ReadonlyMap<string, Fonction> = new Map<string, Fonction>([
  [
    'si',
    {
      signature: 'si(condition, alors, sinon)',
      description: 'Renvoie « alors » si la condition est vraie, « sinon » autrement (une condition vide compte comme fausse).',
      args: ['case', '*', '*'],
      retour: ([, a, b]) => (a === b ? a! : `les deux résultats de si doivent être du même type (ici ${NOMS_TYPES[a!]} et ${NOMS_TYPES[b!]})`),
      calculer: () => undefined, // évaluée à part : seule la branche choisie est calculée
    },
  ],
  [
    'arrondi',
    {
      signature: 'arrondi(x, décimales)',
      description: 'Arrondit x, par défaut à l’entier ; arrondi(3.14159, 2) donne 3,14.',
      args: ['nombre', 'nombre'],
      optionnels: 1,
      retour: 'nombre',
      videSiVide: true,
      calculer: ([x, n]) => {
        const f = 10 ** Math.max(0, Math.min(10, Math.trunc(nombre(n ?? 0))))
        return Math.round(nombre(x) * f) / f
      },
    },
  ],
  ['abs', { signature: 'abs(x)', description: 'Valeur absolue.', args: ['nombre'], retour: 'nombre', videSiVide: true, calculer: ([x]) => Math.abs(nombre(x)) }],
  [
    'min',
    {
      signature: 'min(a, b, …)',
      description: 'La plus petite valeur (nombres ou dates) ; les valeurs vides sont ignorées.',
      args: ['*', '*'],
      repete: true,
      retour: memeType('min'),
      calculer: (args) => extreme(args, -1),
    },
  ],
  [
    'max',
    {
      signature: 'max(a, b, …)',
      description: 'La plus grande valeur (nombres ou dates) ; les valeurs vides sont ignorées.',
      args: ['*', '*'],
      repete: true,
      retour: memeType('max'),
      calculer: (args) => extreme(args, 1),
    },
  ],
  [
    'concat',
    {
      signature: 'concat(a, b, …)',
      description: 'Assemble des textes ; nombres, dates et cases sont écrits à la française, les vides ignorés.',
      args: ['*'],
      repete: true,
      retour: 'texte',
      calculer: (args) => args.map(enTexte).join(''),
    },
  ],
  ['longueur', { signature: 'longueur(texte)', description: 'Nombre de caractères.', args: ['texte'], retour: 'nombre', calculer: ([t]) => (t === undefined ? 0 : [...texte(t)].length) }],
  ['majuscules', { signature: 'majuscules(texte)', description: 'Le texte en majuscules.', args: ['texte'], retour: 'texte', videSiVide: true, calculer: ([t]) => texte(t).toLocaleUpperCase('fr') }],
  ['minuscules', { signature: 'minuscules(texte)', description: 'Le texte en minuscules.', args: ['texte'], retour: 'texte', videSiVide: true, calculer: ([t]) => texte(t).toLocaleLowerCase('fr') }],
  ['vide', { signature: 'vide(x)', description: 'Vrai si la valeur est vide.', args: ['*'], retour: 'case', calculer: ([x]) => x === undefined || x === '' }],
  ['aujourdhui', { signature: 'aujourdhui()', description: 'La date du jour.', args: [], retour: 'date', calculer: (_, env) => env.aujourdhui }],
  ['maintenant', { signature: 'maintenant()', description: 'La date et l’heure du dernier calcul.', args: [], retour: 'date', calculer: (_, env) => env.maintenant }],
  [
    'ecart_jours',
    {
      signature: 'ecart_jours(début, fin)',
      description: 'Nombre de jours de « début » à « fin » ; négatif si « fin » est avant.',
      args: ['date', 'date'],
      retour: 'nombre',
      videSiVide: true,
      calculer: ([a, b]) => ecartJours(date(a), date(b)),
    },
  ],
  [
    'ajouter_jours',
    {
      signature: 'ajouter_jours(date, n)',
      description: 'La date décalée de n jours (n négatif pour reculer).',
      args: ['date', 'nombre'],
      retour: 'date',
      videSiVide: true,
      calculer: ([d, n]) => decalerValeur(texte(d), Math.trunc(nombre(n))),
    },
  ],
  [
    'ajouter_mois',
    {
      signature: 'ajouter_mois(date, n)',
      description: 'La date décalée de n mois ; le 31 janvier plus un mois donne le 28 ou 29 février.',
      args: ['date', 'nombre'],
      retour: 'date',
      videSiVide: true,
      calculer: ([d, n]) => {
        const v = texte(d)
        const debut = ajouterMois(v.slice(0, 10), Math.trunc(nombre(n)))
        const dernier = Number(decaler(ajouterMois(debut, 1), -1).slice(8, 10))
        const jour = Math.min(Number(v.slice(8, 10)), dernier)
        return `${debut.slice(0, 8)}${String(jour).padStart(2, '0')}${v.slice(10)}`
      },
    },
  ],
  [
    'format_date',
    {
      signature: 'format_date(date, "JJ/MM/AAAA")',
      description: 'La date écrite selon le modèle : AAAA, AA, MM, JJ, HH (heures), mm (minutes).',
      args: ['date', 'texte'],
      retour: 'texte',
      videSiVide: true,
      calculer: ([d, f]) => formaterDate(texte(d), texte(f)),
    },
  ],
  ['annee', { signature: 'annee(date)', description: 'L’année de la date.', args: ['date'], retour: 'nombre', videSiVide: true, calculer: ([d]) => Number(texte(d).slice(0, 4)) }],
  ['mois', { signature: 'mois(date)', description: 'Le mois de la date, de 1 à 12.', args: ['date'], retour: 'nombre', videSiVide: true, calculer: ([d]) => Number(texte(d).slice(5, 7)) }],
  ['jour', { signature: 'jour(date)', description: 'Le jour du mois, de 1 à 31.', args: ['date'], retour: 'nombre', videSiVide: true, calculer: ([d]) => Number(texte(d).slice(8, 10)) }],
])

function extreme(args: ValeurFormule[], sens: 1 | -1): ValeurFormule {
  const presents = args.filter((a): a is number | string => a !== undefined && a !== '')
  if (presents.length === 0) return undefined
  return presents.reduce((m, v) => ((v > m ? 1 : v < m ? -1 : 0) === sens ? v : m))
}

const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 10, useGrouping: false })

/** Une valeur écrite comme dans une phrase : nombres à la française, dates JJ/MM/AAAA. */
export function enTexte(v: ValeurFormule): string {
  if (v === undefined) return ''
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  if (typeof v === 'number') return format.format(v)
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v)) return formaterDate(v, v.length > 10 ? 'JJ/MM/AAAA HH:mm' : 'JJ/MM/AAAA')
  return v
}

function formaterDate(d: string, modele: string): string {
  const parties: Record<string, string> = {
    AAAA: d.slice(0, 4),
    AA: d.slice(2, 4),
    MM: d.slice(5, 7),
    JJ: d.slice(8, 10),
    HH: d.slice(11, 13) || '00',
    mm: d.slice(14, 16) || '00',
  }
  return modele.replace(/AAAA|AA|MM|JJ|HH|mm/g, (m) => parties[m]!)
}
