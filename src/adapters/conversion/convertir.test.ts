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
    'ppt/presentation.xml': strToU8(`<p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId4"/></p:sldIdLst></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId2" Type="${RELS}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${RELS}/slide" Target="slides/slide2.xml"/><Relationship Id="rId4" Type="${RELS}/slide" Target="slides/slide3.xml"/></Relationships>`,
    ),
    'ppt/slides/slide2.xml': strToU8(diapo(sp(['Navi &amp; Cie'], 'title') + sp(['Recette décalée', 'Risque &lt;moyen&gt;']) + sp(['3'], 'sldNum') + '<p:pic></p:pic>')),
    'ppt/slides/_rels/slide2.xml.rels': strToU8(`<Relationships><Relationship Id="rId1" Type="${RELS}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`),
    'ppt/notesSlides/notesSlide1.xml': strToU8(diapo(sp(['Dire que le client est prévenu.'], 'body'))),
    'ppt/slides/slide1.xml': strToU8(diapo(sp(['Planning'], 'title') + tableau)),
    // Diapositive 3 : un graphique et un SmartArt, dont les données sont dans des fichiers à part.
    'ppt/slides/slide3.xml': strToU8(
      diapo(
        sp(['Avancement'], 'title') +
          '<p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="c" r:id="rId1"/></a:graphicData></a:graphic></p:graphicFrame>' +
          '<p:graphicFrame><a:graphic><a:graphicData><dgm:relIds xmlns:dgm="d" r:dm="rId2" r:lo="rId3"/></a:graphicData></a:graphic></p:graphicFrame>',
      ),
    ),
    'ppt/slides/_rels/slide3.xml.rels': strToU8(
      `<Relationships><Relationship Id="rId1" Type="${RELS}/chart" Target="../charts/chart1.xml"/><Relationship Id="rId2" Type="${RELS}/diagramData" Target="../diagrams/data1.xml"/></Relationships>`,
    ),
    'ppt/charts/chart1.xml': strToU8(
      `<c:chartSpace><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Tickets</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart>${[
        ['S40', ['30', '15']],
        ['S41', ['34', '12']],
      ]
        .map(
          ([nom, v]) =>
            `<c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>${nom as string}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Faits</c:v></c:pt><c:pt idx="1"><c:v>En cours</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>${v![0]}</c:v></c:pt><c:pt idx="1"><c:v>${v![1]}</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>`,
        )
        .join('')}</c:barChart></c:plotArea></c:chart></c:chartSpace>`,
    ),
    'ppt/diagrams/data1.xml': strToU8(
      '<dgm:dataModel><dgm:ptLst><dgm:pt modelId="0" type="doc"><dgm:t><a:p/></dgm:t></dgm:pt><dgm:pt modelId="1" type="parTrans"/><dgm:pt modelId="2"><dgm:t><a:p><a:r><a:t>Cadrage</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="3"><dgm:t><a:p><a:r><a:t>Recette</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>',
    ),
  })
}

describe('conversion en Markdown', () => {
  it('PowerPoint : diapositives dans l’ordre de la présentation, titres, puces, tableaux, graphiques, SmartArt, notes ; images comptées', async () => {
    const r = await convertirFichier('Point hebdo S41.pptx', pptx())
    expect(r.titre).toBe('Point hebdo S41')
    expect(r.texte).toBe(
      [
        '## Diapositive 1 : Navi & Cie',
        '- Recette décalée\n- Risque <moyen>',
        'Notes : Dire que le client est prévenu.',
        '## Diapositive 2 : Planning',
        '| Lot | Fin |\n| --- | --- |\n| Lot 2 | 29/10 |',
        '## Diapositive 3 : Avancement',
        'Graphique : Tickets\n|  | S40 | S41 |\n| --- | --- | --- |\n| Faits | 30 | 34 |\n| En cours | 15 | 12 |',
        '- Cadrage\n- Recette',
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
