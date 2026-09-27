// Markdown des réponses de l'assistant IA (spec §12) : le sous-ensemble qu'un
// modèle écrit (titres, listes, gras, italique, code, liens, citations,
// tableaux), lu en une structure que l'interface affiche sans jamais injecter
// de HTML. Ce qui n'est pas reconnu reste du texte.

export type Enligne =
  | { type: 'texte'; texte: string }
  | { type: 'gras' | 'italique' | 'barre'; enfants: Enligne[] }
  | { type: 'code'; texte: string }
  | { type: 'lien'; adresse: string; enfants: Enligne[] }

export type BlocMd =
  | { type: 'paragraphe'; enfants: Enligne[] }
  | { type: 'titre'; niveau: number; enfants: Enligne[] }
  | { type: 'liste'; ordonnee: boolean; debut: number; elements: Enligne[][] }
  | { type: 'code'; langue: string; texte: string }
  | { type: 'citation'; enfants: Enligne[] }
  | { type: 'tableau'; entetes: Enligne[][]; lignes: Enligne[][][] }
  | { type: 'separateur' }

const PUCE = /^\s*[-*+]\s+(.*)$/
const NUMERO = /^\s*(\d+)[.)]\s+(.*)$/
const TITRE = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const CLOTURE = /^\s*(```|~~~)\s*([\w+-]*)\s*$/
const SEPARATEUR = /^\s*([-*_])(\s*\1){2,}\s*$/
const LIGNE_TABLEAU = /^\s*\|.*\|\s*$/
const SOUS_ENTETE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

const cellules = (ligne: string) =>
  ligne
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => lireEnligne(c.trim()))

export function lireMarkdown(source: string): BlocMd[] {
  const lignes = source.replace(/\r\n?/g, '\n').split('\n')
  const blocs: BlocMd[] = []
  let i = 0
  const debutDeBloc = (l: string) => l.trim() === '' || TITRE.test(l) || CLOTURE.test(l) || PUCE.test(l) || NUMERO.test(l) || l.trimStart().startsWith('>') || SEPARATEUR.test(l)
  while (i < lignes.length) {
    const l = lignes[i]!
    if (l.trim() === '') {
      i++
      continue
    }
    const cloture = CLOTURE.exec(l)
    if (cloture) {
      const code: string[] = []
      i++
      while (i < lignes.length && !lignes[i]!.trim().startsWith(cloture[1]!)) code.push(lignes[i++]!)
      i++ // clôture (ou fin du texte : un bloc non fermé va jusqu'au bout)
      blocs.push({ type: 'code', langue: cloture[2] ?? '', texte: code.join('\n') })
      continue
    }
    const titre = TITRE.exec(l)
    if (titre) {
      blocs.push({ type: 'titre', niveau: titre[1]!.length, enfants: lireEnligne(titre[2]!) })
      i++
      continue
    }
    if (SEPARATEUR.test(l)) {
      blocs.push({ type: 'separateur' })
      i++
      continue
    }
    if (LIGNE_TABLEAU.test(l) && i + 1 < lignes.length && SOUS_ENTETE.test(lignes[i + 1]!)) {
      const entetes = cellules(l)
      const corps: Enligne[][][] = []
      i += 2
      while (i < lignes.length && LIGNE_TABLEAU.test(lignes[i]!)) corps.push(cellules(lignes[i++]!))
      blocs.push({ type: 'tableau', entetes, lignes: corps })
      continue
    }
    if (l.trimStart().startsWith('>')) {
      const cite: string[] = []
      while (i < lignes.length && lignes[i]!.trimStart().startsWith('>')) cite.push(lignes[i++]!.trimStart().replace(/^>\s?/, ''))
      blocs.push({ type: 'citation', enfants: lireEnligne(cite.join('\n')) })
      continue
    }
    const puce = PUCE.exec(l)
    const numero = NUMERO.exec(l)
    if (puce || numero) {
      const ordonnee = !puce
      const motif = ordonnee ? NUMERO : PUCE
      const elements: string[] = []
      while (i < lignes.length) {
        const m = motif.exec(lignes[i]!)
        if (m) elements.push(m[ordonnee ? 2 : 1]!)
        // Une ligne qui prolonge l'élément précédent (retour à la ligne dans un élément).
        else if (lignes[i]!.trim() !== '' && !debutDeBloc(lignes[i]!) && elements.length > 0) elements[elements.length - 1] += `\n${lignes[i]!.trim()}`
        else break
        i++
      }
      blocs.push({ type: 'liste', ordonnee, debut: numero ? Number(numero[1]) : 1, elements: elements.map(lireEnligne) })
      continue
    }
    const paragraphe: string[] = []
    while (i < lignes.length && (paragraphe.length === 0 || !debutDeBloc(lignes[i]!)) && !(LIGNE_TABLEAU.test(lignes[i]!) && SOUS_ENTETE.test(lignes[i + 1] ?? ''))) {
      paragraphe.push(lignes[i++]!)
    }
    blocs.push({ type: 'paragraphe', enfants: lireEnligne(paragraphe.join('\n')) })
  }
  return blocs
}

/** Seuls les liens web et courriel deviennent cliquables : jamais `javascript:` ni `data:`. */
const ADRESSE_SURE = /^(https?:\/\/|mailto:)/i

const MARQUES: { ouvre: string; type: 'gras' | 'italique' | 'barre' }[] = [
  { ouvre: '**', type: 'gras' },
  { ouvre: '__', type: 'gras' },
  { ouvre: '~~', type: 'barre' },
  { ouvre: '*', type: 'italique' },
  { ouvre: '_', type: 'italique' },
]

export function lireEnligne(source: string): Enligne[] {
  const sortie: Enligne[] = []
  let texte = ''
  const pousserTexte = () => {
    if (texte) sortie.push({ type: 'texte', texte })
    texte = ''
  }
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (c === '\\' && i + 1 < source.length && /[\\`*_~[\]()#>|-]/.test(source[i + 1]!)) {
      texte += source[i + 1]
      i += 2
      continue
    }
    if (c === '`') {
      const fin = source.indexOf('`', i + 1)
      if (fin > i + 1) {
        pousserTexte()
        sortie.push({ type: 'code', texte: source.slice(i + 1, fin) })
        i = fin + 1
        continue
      }
    }
    if (c === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(source.slice(i))
      if (m) {
        pousserTexte()
        if (ADRESSE_SURE.test(m[2]!)) sortie.push({ type: 'lien', adresse: m[2]!, enfants: lireEnligne(m[1]!) })
        else sortie.push({ type: 'texte', texte: m[1]! })
        i += m[0].length
        continue
      }
    }
    const marque = MARQUES.find((m) => source.startsWith(m.ouvre, i))
    // `_` au milieu d'un mot (nom_de_colonne) n'est pas de l'italique.
    const dansUnMot = c === '_' && /\w/.test(source[i - 1] ?? '')
    if (marque && !dansUnMot) {
      const debut = i + marque.ouvre.length
      let fin = source.indexOf(marque.ouvre, debut)
      // `***` qui ferme un gras et un italique : le gras se ferme sur les deux dernières.
      while (fin > 0 && marque.ouvre.length > 1 && source[fin + marque.ouvre.length] === marque.ouvre[0]) fin++
      const interieur = fin > debut ? source.slice(debut, fin) : ''
      if (interieur && !/^\s|\s$/.test(interieur)) {
        pousserTexte()
        sortie.push({ type: marque.type, enfants: lireEnligne(interieur) })
        i = fin + marque.ouvre.length
        continue
      }
    }
    texte += c
    i++
  }
  pousserTexte()
  return sortie
}
