import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { convertirFichier, FormatNonPrisEnCharge } from './convertir'

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const sp = (texte: string[], type?: string) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="1" name="x"/><p:cNvSpPr/><p:nvPr>${type ? `<p:ph type="${type}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody>${texte.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join('')}</p:txBody></p:sp>`
const diapo = (formes: string) => `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${formes}</p:spTree></p:cSld></p:sld>`

/** Une présentation dont les fichiers des diapositives ne sont pas dans l'ordre d'affichage. */
function pptx(): Uint8Array {
  const tableau =
    '<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Lot</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>Fin</a:t></a:r></a:p></a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Lot 2</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>29/10</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>'
  return zipSync({
    'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId2" Type="${RELS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RELS}/slide" Target="slides/slide2.xml"/></Relationships>`,
    ),
    'ppt/slides/slide2.xml': strToU8(diapo(sp(['Navi &amp; Cie'], 'title') + sp(['Recette décalée', 'Risque &lt;moyen&gt;']) + sp(['3'], 'sldNum') + '<p:pic></p:pic>')),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Type="${RELS}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`),
    'ppt/notesSlides/notesSlide1.xml': strToU8(diapo(sp(['Dire que le client est prévenu.'], 'body'))),
    'ppt/slides/slide1.xml': strToU8(diapo(sp(['Planning'], 'title') + tableau)),
  })
}

describe('conversion en Markdown', () => {
  it('PowerPoint : diapositives dans l’ordre de la présentation, titres, puces, tableaux, notes ; images comptées', async () => {
    const r = await convertirFichier('Point hebdo S41.pptx', pptx())
    expect(r.titre).toBe('Point hebdo S41')
    expect(r.texte).toBe(
      [
        '## Diapositive 1 : Navi & Cie',
        '- Recette décalée\n- Risque <moyen>',
        'Notes : Dire que le client est prévenu.',
        '## Diapositive 2 : Planning',
        '| Lot | Fin |\n| --- | --- |\n| Lot 2 | 29/10 |',
      ].join('\n\n'),
    )
    expect(r.avertissements).toEqual(['1 image non lue (graphiques, captures)'])
  })

  it('Word : titres et listes en Markdown', async () => {
    const docx = zipSync({
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/></Relationships>`),
      'word/document.xml': strToU8(
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Compte rendu</w:t></w:r></w:p><w:p><w:r><w:t>Le lot 2 glisse.</w:t></w:r></w:p></w:body></w:document>',
      ),
    })
    const r = await convertirFichier('cr.docx', docx)
    expect(r.texte).toBe('# Compte rendu\n\nLe lot 2 glisse.')
  })

  it('texte tel quel ; format inconnu refusé', async () => {
    expect((await convertirFichier('note.md', strToU8('# Note\n'))).texte).toBe('# Note')
    await expect(convertirFichier('image.png', new Uint8Array())).rejects.toThrow(FormatNonPrisEnCharge)
  })
})
