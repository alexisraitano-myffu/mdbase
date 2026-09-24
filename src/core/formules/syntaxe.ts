// Analyse d'une expression de formule (spec §6) : découpage en jetons puis
// arbre syntaxique, par descente récursive. Aucun `eval`, aucune `Function` :
// le texte n'est jamais exécuté, seulement lu (invariant 8).

/** Position dans le texte de l'expression, pour souligner l'erreur dans l'éditeur. */
export type Position = { debut: number; fin: number }

export class ErreurFormule extends Error {
  readonly position: Position

  constructor(message: string, position: Position) {
    super(message)
    this.name = 'ErreurFormule'
    this.position = { debut: position.debut, fin: position.fin }
  }
}

export type OperateurBinaire = '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'et' | 'ou'

export type Noeud = Position &
  (
    | { type: 'nombre'; valeur: number }
    | { type: 'texte'; valeur: string }
    | { type: 'case'; valeur: boolean }
    /** `prop("…")` : `ref` est le texte entre guillemets (clé stockée, ou nom affiché dans l'éditeur). */
    | { type: 'prop'; ref: string }
    | { type: 'appel'; nom: string; args: Noeud[] }
    | { type: 'unaire'; op: '-' | 'non'; arg: Noeud }
    | { type: 'binaire'; op: OperateurBinaire; gauche: Noeud; droite: Noeud }
  )

type Jeton = Position &
  (
    | { type: 'nombre'; valeur: number }
    | { type: 'texte'; valeur: string }
    | { type: 'mot'; valeur: string }
    | { type: 'symbole'; valeur: string }
    | { type: 'fin' }
  )

const SYMBOLES = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '(', ')', ',', '<', '>', '=', '!']
const LETTRE = /[\p{L}_]/u
const LETTRE_OU_CHIFFRE = /[\p{L}\p{N}_]/u

export function decouper(texte: string): Jeton[] {
  const jetons: Jeton[] = []
  let i = 0
  while (i < texte.length) {
    const c = texte[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    const debut = i
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(texte[i + 1] ?? ''))) {
      while (/[0-9]/.test(texte[i] ?? '')) i++
      if (texte[i] === '.') {
        i++
        while (/[0-9]/.test(texte[i] ?? '')) i++
      }
      jetons.push({ type: 'nombre', valeur: Number(texte.slice(debut, i)), debut, fin: i })
      continue
    }
    if (c === '"' || c === '“' || c === '”') {
      i++
      let valeur = ''
      while (i < texte.length && !['"', '“', '”'].includes(texte[i]!)) {
        if (texte[i] === '\\' && i + 1 < texte.length) i++
        valeur += texte[i]
        i++
      }
      if (i >= texte.length) throw new ErreurFormule('Guillemet ouvert jamais fermé', { debut, fin: texte.length })
      i++
      jetons.push({ type: 'texte', valeur, debut, fin: i })
      continue
    }
    if (LETTRE.test(c)) {
      while (i < texte.length && LETTRE_OU_CHIFFRE.test(texte[i]!)) i++
      jetons.push({ type: 'mot', valeur: texte.slice(debut, i), debut, fin: i })
      continue
    }
    const symbole = SYMBOLES.find((s) => texte.startsWith(s, i))
    if (!symbole) throw new ErreurFormule(`Caractère inattendu « ${c} »`, { debut, fin: debut + 1 })
    i += symbole.length
    jetons.push({ type: 'symbole', valeur: symbole, debut, fin: i })
  }
  jetons.push({ type: 'fin', debut: texte.length, fin: texte.length })
  return jetons
}

/** Symboles d'autres langages : refusés avec l'équivalent à utiliser. */
const TRADUCTIONS: Record<string, string> = {
  '=': 'pour comparer, utilise « == »',
  '&&': 'utilise « et »',
  '||': 'utilise « ou »',
  '!': 'utilise « non »',
}

const PRIORITES: [OperateurBinaire[], number][] = [
  [['ou'], 1],
  [['et'], 2],
  [['==', '!=', '<', '<=', '>', '>='], 4],
  [['+', '-'], 5],
  [['*', '/', '%'], 6],
]
const priorite = (op: string) => PRIORITES.find(([ops]) => (ops as string[]).includes(op))?.[1]

/** Arbre syntaxique d'une expression ; lève `ErreurFormule` avec la position fautive. */
export function analyser(texte: string): Noeud {
  if (texte.trim() === '') throw new ErreurFormule('Formule vide', { debut: 0, fin: 0 })
  const jetons = decouper(texte)
  let i = 0
  const courant = () => jetons[i]!
  const est = (valeur: string) => {
    const j = courant()
    return (j.type === 'symbole' || j.type === 'mot') && j.valeur === valeur
  }
  const attendre = (valeur: string, message: string) => {
    if (!est(valeur)) throw new ErreurFormule(message, courant())
    return jetons[i++]!
  }

  const operateur = (): OperateurBinaire | null => {
    const j = courant()
    if (j.type !== 'symbole' && j.type !== 'mot') return null
    if (j.type === 'symbole' && TRADUCTIONS[j.valeur] && j.valeur !== '!') {
      throw new ErreurFormule(`« ${j.valeur} » inconnu : ${TRADUCTIONS[j.valeur]}`, j)
    }
    return priorite(j.valeur) !== undefined ? (j.valeur as OperateurBinaire) : null
  }

  const expression = (min: number): Noeud => {
    let gauche = unaire()
    for (;;) {
      const op = operateur()
      const p = op && priorite(op)
      if (!op || !p || p < min) return gauche
      i++
      const droite = expression(p + 1)
      gauche = { type: 'binaire', op, gauche, droite, debut: gauche.debut, fin: droite.fin }
    }
  }

  const unaire = (): Noeud => {
    const j = courant()
    if (est('-')) {
      i++
      const arg = unaire()
      return { type: 'unaire', op: '-', arg, debut: j.debut, fin: arg.fin }
    }
    if (est('non')) {
      i++
      // `non` porte sur une comparaison entière : non prop("a") == 2 ⇔ non (prop("a") == 2).
      const arg = expression(3)
      return { type: 'unaire', op: 'non', arg, debut: j.debut, fin: arg.fin }
    }
    if (est('!')) throw new ErreurFormule(`« ! » inconnu : ${TRADUCTIONS['!']}`, j)
    return primaire()
  }

  const primaire = (): Noeud => {
    const j = jetons[i++]!
    switch (j.type) {
      case 'nombre':
        return { type: 'nombre', valeur: j.valeur, debut: j.debut, fin: j.fin }
      case 'texte':
        return { type: 'texte', valeur: j.valeur, debut: j.debut, fin: j.fin }
      case 'fin':
        throw new ErreurFormule('La formule s’arrête trop tôt : il manque une valeur', j)
      case 'symbole': {
        if (j.valeur === '(') {
          const dedans = expression(0)
          attendre(')', 'Parenthèse « ( » jamais fermée')
          return dedans
        }
        throw new ErreurFormule(`« ${j.valeur} » inattendu ici`, j)
      }
      case 'mot': {
        if (j.valeur === 'vrai' || j.valeur === 'faux') return { type: 'case', valeur: j.valeur === 'vrai', debut: j.debut, fin: j.fin }
        if (priorite(j.valeur) !== undefined) throw new ErreurFormule(`« ${j.valeur} » attend une valeur avant lui`, j)
        if (!est('(')) {
          throw new ErreurFormule(`« ${j.valeur} » inconnu : une colonne s’écrit prop("${j.valeur}"), une fonction ${j.valeur}(…)`, j)
        }
        i++
        const args: Noeud[] = []
        if (!est(')')) {
          for (;;) {
            args.push(expression(0))
            if (est(',')) {
              i++
              continue
            }
            break
          }
        }
        const fermante = attendre(')', `Il manque « ) » pour fermer ${j.valeur}(…)`)
        const position = { debut: j.debut, fin: fermante.fin }
        if (j.valeur === 'prop') {
          const [arg] = args
          if (args.length !== 1 || arg?.type !== 'texte') throw new ErreurFormule('prop attend un nom de colonne entre guillemets : prop("Nom")', position)
          return { type: 'prop', ref: arg.valeur, ...position }
        }
        return { type: 'appel', nom: j.valeur, args, ...position }
      }
    }
  }

  const arbre = expression(0)
  const reste = courant()
  if (reste.type !== 'fin') {
    const traduction = reste.type === 'symbole' ? TRADUCTIONS[reste.valeur] : undefined
    throw new ErreurFormule(traduction ? `« ${reste.valeur} » inconnu : ${traduction}` : 'Suite inattendue : il manque peut-être un opérateur ou une virgule', reste)
  }
  return arbre
}

/** Toutes les références `prop("…")` d'un arbre. */
export function references(n: Noeud): Noeud[] {
  switch (n.type) {
    case 'prop':
      return [n]
    case 'appel':
      return n.args.flatMap(references)
    case 'unaire':
      return references(n.arg)
    case 'binaire':
      return [...references(n.gauche), ...references(n.droite)]
    default:
      return []
  }
}
