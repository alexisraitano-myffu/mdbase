// Description d'un ticket Jira (format ADF, Atlassian Document Format) en
// Markdown, pour le corps de sa ligne (§16). Couvre ce qu'on écrit dans un
// ticket : titres, paragraphes, listes, citations, code, tableaux simples,
// liens, mentions. Un nœud inconnu garde son texte ; une pièce jointe devient
// une mention, jamais un lien cassé.

type Noeud = { type?: unknown; text?: unknown; attrs?: Record<string, unknown>; marks?: { type?: unknown; attrs?: Record<string, unknown> }[]; content?: unknown }

export function adfEnMarkdown(adf: unknown): string {
  if (typeof adf === 'string') return adf.trim()
  return blocs(enfants(adf), '').join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}

function enfants(n: unknown): Noeud[] {
  const c = (n as Noeud | null)?.content
  return Array.isArray(c) ? (c.filter((x) => x && typeof x === 'object') as Noeud[]) : []
}

function blocs(noeuds: Noeud[], retrait: string): string[] {
  return noeuds.map((n) => bloc(n, retrait)).filter((b) => b !== '')
}

function bloc(n: Noeud, retrait: string): string {
  switch (n.type) {
    case 'paragraph':
      return enLigne(enfants(n))
    case 'heading': {
      const niveau = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1))
      return `${'#'.repeat(niveau)} ${enLigne(enfants(n))}`
    }
    case 'bulletList':
    case 'orderedList':
      return liste(n, retrait)
    case 'blockquote':
    case 'panel':
      return blocs(enfants(n), '')
        .join('\n\n')
        .split('\n')
        .map((l) => (l === '' ? '>' : `> ${l}`))
        .join('\n')
    case 'codeBlock': {
      const langue = typeof n.attrs?.language === 'string' ? n.attrs.language : ''
      return `\`\`\`${langue}\n${texteBrut(n)}\n\`\`\``
    }
    case 'rule':
      return '---'
    case 'table':
      return tableau(n)
    case 'mediaSingle':
    case 'mediaGroup':
    case 'media':
      return '*(pièce jointe dans Jira)*'
    default:
      // Nœud de bloc inconnu (expand, layout…) : son contenu, ou son texte.
      return enfants(n).length > 0 ? blocs(enfants(n), retrait).join('\n\n') : enLigne([n])
  }
}

function liste(n: Noeud, retrait: string): string {
  const ordonnee = n.type === 'orderedList'
  const debut = Number(n.attrs?.order) || 1
  return enfants(n)
    .map((item, i) => {
      const puce = ordonnee ? `${debut + i}. ` : '- '
      const [premier = '', ...suite] = blocs(enfants(item), retrait + '  ')
      const tete = `${retrait}${puce}${premier.trimStart()}`
      return [tete, ...suite.map((s) => (s.startsWith(retrait + '  ') ? s : s.replace(/^/gm, retrait + '  ')))].join('\n')
    })
    .join('\n')
}

function tableau(n: Noeud): string {
  const rangees = enfants(n).map((r) => enfants(r).map((cellule) => blocs(enfants(cellule), '').join(' ').replace(/\|/g, '\\|').replace(/\n/g, ' ')))
  if (rangees.length === 0) return ''
  const largeur = Math.max(...rangees.map((r) => r.length))
  const ligne = (r: string[]) => `| ${Array.from({ length: largeur }, (_, i) => r[i] ?? '').join(' | ')} |`
  return [ligne(rangees[0]!), `| ${Array.from({ length: largeur }, () => '---').join(' | ')} |`, ...rangees.slice(1).map(ligne)].join('\n')
}

function enLigne(noeuds: Noeud[]): string {
  return noeuds.map(segment).join('')
}

function segment(n: Noeud): string {
  switch (n.type) {
    case 'text':
      return marquer(String(n.text ?? ''), n.marks ?? [])
    case 'hardBreak':
      return '  \n'
    case 'mention':
    case 'emoji':
    case 'status':
      return String(n.attrs?.text ?? n.attrs?.shortName ?? '')
    case 'inlineCard':
    case 'blockCard': {
      const url = String(n.attrs?.url ?? '')
      return url ? `<${url}>` : ''
    }
    case 'date': {
      const ms = Number(n.attrs?.timestamp)
      return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : ''
    }
    default:
      return enfants(n).length > 0 ? enLigne(enfants(n)) : String(n.text ?? '')
  }
}

function marquer(texte: string, marques: NonNullable<Noeud['marks']>): string {
  if (texte === '') return ''
  let t = texte
  for (const m of marques) {
    if (m.type === 'code') t = `\`${t}\``
    else if (m.type === 'strong') t = `**${t}**`
    else if (m.type === 'em') t = `*${t}*`
    else if (m.type === 'strike') t = `~~${t}~~`
  }
  const lien = marques.find((m) => m.type === 'link')?.attrs?.href
  return typeof lien === 'string' && lien !== '' ? `[${t}](${lien})` : t
}

function texteBrut(n: Noeud): string {
  if (n.type === 'text') return String(n.text ?? '')
  return enfants(n).map(texteBrut).join('')
}
