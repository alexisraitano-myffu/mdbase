import { strFromU8, unzipSync, type Unzipped } from 'fflate'

// Conversion des fichiers déposés dans l'inbox en Markdown (spec §18), une fois,
// dans l'app : PDF (pdf.js), Word (mammoth), PowerPoint (XML du .pptx). Les
// bibliothèques lourdes ne sont chargées qu'à la première conversion.

export type Conversion = { titre: string; texte: string; avertissements: string[] }

export class FormatNonPrisEnCharge extends Error {}

/** Extensions acceptées par la zone de dépôt. */
export const EXTENSIONS = ['.pdf', '.docx', '.pptx', '.md', '.txt', '.csv'] as const

const extension = (nom: string) => /\.[^.]+$/.exec(nom.toLowerCase())?.[0] ?? ''
const sansExtension = (nom: string) => nom.replace(/\.[^.]+$/, '')

export async function convertirFichier(nom: string, octets: Uint8Array): Promise<Conversion> {
  const titre = sansExtension(nom.split(/[\\/]/).pop() ?? nom)
  switch (extension(nom)) {
    case '.md':
    case '.txt':
    case '.csv':
      return { titre, texte: new TextDecoder().decode(octets).trim(), avertissements: [] }
    case '.pptx':
      return { titre, ...convertirPptx(octets) }
    case '.docx':
      return { titre, ...(await convertirDocx(octets)) }
    case '.pdf':
      return { titre, ...(await convertirPdf(octets)) }
    default:
      throw new FormatNonPrisEnCharge(`format non pris en charge : ${nom} (acceptés : ${EXTENSIONS.join(', ')})`)
  }
}

// --- PowerPoint ---

const ENTITES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decoder = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITES[e] ?? m),
  )

/** Paragraphes d'un fragment DrawingML : texte des `<a:t>`, sauts de ligne `<a:br/>`. */
function paragraphes(xml: string): string[] {
  return [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map((m) => {
      const p = m[1] ?? m[2] ?? ''
      return [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:t\s[^>]*>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)]
        .map((t) => (t[0].startsWith('<a:br') ? '\n' : decoder(t[1] ?? t[2] ?? '')))
        .join('')
        .trim()
    })
    .filter((t) => t !== '')
}

const cellule = (s: string) => s.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ')

function tableau(xml: string): string {
  const lignes = [...xml.matchAll(/<a:tr[\s>][\s\S]*?<\/a:tr>/g)].map((tr) => [...tr[0].matchAll(/<a:tc[\s>][\s\S]*?<\/a:tc>/g)].map((tc) => cellule(paragraphes(tc[0]).join(' '))))
  if (lignes.length === 0) return ''
  const largeur = Math.max(...lignes.map((l) => l.length))
  const ligne = (l: string[]) => `| ${[...l, ...Array<string>(largeur - l.length).fill('')].join(' | ')} |`
  return [ligne(lignes[0]!), `|${' --- |'.repeat(largeur)}`, ...lignes.slice(1).map(ligne)].join('\n')
}

/** Points d'une série en cache (`c:cat`, `c:val`, `c:tx`), rangés par indice. */
function points(xml: string): string[] {
  const r: string[] = []
  for (const m of xml.matchAll(/<c:pt\s[^>]*idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g)) r[Number(m[1])] = decoder(m[2]!)
  return Array.from(r, (v) => v ?? '')
}

/** Graphique : les valeurs en cache, en tableau (une ligne par catégorie, une colonne par série). */
function graphique(xml: string): string {
  const series = [...xml.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g)].map((m) => ({
    nom: points(/<c:tx>[\s\S]*?<\/c:tx>/.exec(m[0])?.[0] ?? '')[0] ?? '',
    categories: points(/<c:(?:cat|xVal)>[\s\S]*?<\/c:(?:cat|xVal)>/.exec(m[0])?.[0] ?? ''),
    valeurs: points(/<c:(?:val|yVal)>[\s\S]*?<\/c:(?:val|yVal)>/.exec(m[0])?.[0] ?? ''),
  }))
  if (series.length === 0) return ''
  const titreGraphique = paragraphes(/<c:title>[\s\S]*?<\/c:title>/.exec(xml)?.[0] ?? '').join(' ')
  const categories = series[0]!.categories.length > 0 ? series[0]!.categories : series[0]!.valeurs.map((_, i) => String(i + 1))
  const lignes = [['', ...series.map((s, i) => s.nom || `Série ${i + 1}`)], ...categories.map((c, i) => [c, ...series.map((s) => s.valeurs[i] ?? '')])]
  const ligne = (l: string[]) => `| ${l.map(cellule).join(' | ')} |`
  return [`Graphique${titreGraphique ? ` : ${titreGraphique}` : ''}`, ligne(lignes[0]!), `|${' --- |'.repeat(lignes[0]!.length)}`, ...lignes.slice(1).map(ligne)].join('\n')
}

/** SmartArt : le texte de ses nœuds, dans l'ordre du modèle de données. */
function smartArt(xml: string): string {
  return [...xml.matchAll(/<dgm:pt\b[^>]*[^/]>[\s\S]*?<\/dgm:pt>/g)]
    .map((m) => paragraphes(m[0]).join(' '))
    .filter((t) => t !== '')
    .map((t) => `- ${t}`)
    .join('\n')
}

/** Cible d'une relation, résolue depuis le dossier du fichier qui la porte. */
function resoudre(dossier: string, cible: string): string {
  const parties = cible.startsWith('/') ? [] : dossier.split('/').filter(Boolean)
  for (const p of cible.replace(/^\//, '').split('/')) {
    if (p === '..') parties.pop()
    else if (p !== '.') parties.push(p)
  }
  return parties.join('/')
}

function relations(fichiers: Unzipped, chemin: string): Map<string, { type: string; cible: string }> {
  const dossier = chemin.slice(0, chemin.lastIndexOf('/'))
  const rels = fichiers[`${dossier}/_rels/${chemin.slice(dossier.length + 1)}.rels`]
  const r = new Map<string, { type: string; cible: string }>()
  if (!rels) return r
  for (const m of strFromU8(rels).matchAll(/<Relationship\s[^>]*>/g)) {
    const attr = (n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(m[0])?.[1] ?? ''
    r.set(attr('Id'), { type: attr('Type'), cible: resoudre(dossier, attr('Target')) })
  }
  return r
}

export function convertirPptx(octets: Uint8Array): { texte: string; avertissements: string[] } {
  const fichiers = unzipSync(octets)
  const lire = (chemin: string) => (fichiers[chemin] ? strFromU8(fichiers[chemin]) : '')
  // Ordre des diapositives : celui de la présentation, pas celui des noms de fichiers.
  const relsPresentation = relations(fichiers, 'ppt/presentation.xml')
  let diapos = [...lire('ppt/presentation.xml').matchAll(/<p:sldId\s[^>]*r:id="([^"]+)"/g)].flatMap((m) => relsPresentation.get(m[1]!)?.cible ?? [])
  if (diapos.length === 0) diapos = Object.keys(fichiers).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))
  let images = 0
  const sections = diapos.map((chemin, i) => {
    const xml = lire(chemin)
    const rels = relations(fichiers, chemin)
    let titre = ''
    const blocs: string[] = []
    // Formes, tableaux et images dans l'ordre du document.
    for (const m of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>|<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>|<p:pic>[\s\S]*?<\/p:pic>/g)) {
      const forme = m[0]
      if (forme.startsWith('<p:pic>')) {
        images++
        continue
      }
      if (forme.startsWith('<p:graphicFrame>')) {
        if (forme.includes('<a:tbl>')) blocs.push(tableau(forme))
        else {
          // Graphique (`c:chart r:id`) ou SmartArt (`dgm:relIds r:dm`) : leurs données sont dans un fichier à part.
          const lien = /<c:chart\b[^>]*\br:id="([^"]+)"/.exec(forme) ?? /<dgm:relIds\b[^>]*\br:dm="([^"]+)"/.exec(forme)
          const cible = lien && rels.get(lien[1]!)?.cible
          const bloc = cible ? (lien[0].startsWith('<c:chart') ? graphique(lire(cible)) : smartArt(lire(cible))) : ''
          if (bloc) blocs.push(bloc)
          else if (lien) images++
        }
        continue
      }
      const type = /<p:ph\b[^>]*\btype="([^"]+)"/.exec(forme)?.[1]
      if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue
      const texte = paragraphes(forme)
      if (texte.length === 0) continue
      if (!titre && (type === 'title' || type === 'ctrTitle')) titre = texte.join(' ')
      else blocs.push(texte.map((t) => (texte.length > 1 ? `- ${t.replace(/\n/g, ' ')}` : t)).join('\n'))
    }
    const notes = [...rels.values()].find((r) => r.type.endsWith('/notesSlide'))
    if (notes) {
      const corps = [...lire(notes.cible).matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].filter((s) => /<p:ph\b[^>]*\btype="body"/.test(s[0])).flatMap((s) => paragraphes(s[0]))
      if (corps.length > 0) blocs.push(`Notes : ${corps.join(' ')}`)
    }
    return [`## Diapositive ${i + 1}${titre ? ` : ${titre}` : ''}`, ...blocs].join('\n\n')
  })
  return { texte: sections.join('\n\n'), avertissements: images > 0 ? [`${images} image${images > 1 ? 's' : ''} non lue${images > 1 ? 's' : ''} (graphiques, captures)`] : [] }
}

// --- Word ---

type Mammoth = {
  convertToMarkdown: (entree: { arrayBuffer: ArrayBuffer; buffer: Uint8Array }, options: object) => Promise<{ value: string; messages: { type: string; message: string }[] }>
  images: { imgElement: (f: () => Promise<{ src: string }>) => unknown }
}

async function convertirDocx(octets: Uint8Array): Promise<{ texte: string; avertissements: string[] }> {
  const mammoth = (await import('mammoth')).default as unknown as Mammoth
  // Les images ne sont pas embarquées (elles grossiraient le texte sans que l'assistant les lise) : comptées, puis retirées.
  // `arrayBuffer` pour la version navigateur de mammoth, `buffer` pour celle de Node (tests).
  const r = await mammoth.convertToMarkdown({ arrayBuffer: octets.slice().buffer, buffer: octets }, { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) })
  let images = 0
  const texte = r.value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, () => {
      images++
      return ''
    })
    .replace(/\\([.()\-!#])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { texte, avertissements: images > 0 ? [`${images} image${images > 1 ? 's' : ''} non lue${images > 1 ? 's' : ''}`] : [] }
}

// --- PDF ---

async function convertirPdf(octets: Uint8Array): Promise<{ texte: string; avertissements: string[] }> {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const chargement = pdfjs.getDocument({ data: octets.slice() })
  const doc = await chargement.promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const contenu = await (await doc.getPage(i)).getTextContent()
    const texte = contenu.items
      .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : ''))
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    pages.push(`## Page ${i}\n\n${texte}`)
  }
  const vides = pages.filter((p) => /^## Page \d+\n\n$/.test(p)).length
  await chargement.destroy()
  return {
    texte: pages.join('\n\n'),
    avertissements: vides > 0 ? [`${vides} page${vides > 1 ? 's' : ''} sans texte (PDF scanné ?) : non lue${vides > 1 ? 's' : ''}`] : [],
  }
}
