import { describe, expect, it } from 'vitest'
import { DepotEspace } from './depot-espace'
import { deduireColonnes, lireCsv } from './echange'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir() {
  const a = new AdaptateurCompteur({ ...FICHIERS_RELATIONS })
  const m = minuteur()
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: m.planifier, aujourdhui: () => '2026-09-25' })
  const ecrire = async () => {
    m.avancer()
    await espace.vider()
  }
  return { a, espace, ecrire }
}

const CSV = 'Fournisseur;Montant;Échéance;Catégorie\nImprimerie;1 200,50;05/10/2026;Print\nHébergeur;12;2026-10-01;Web\nAgence;;;Web\n'

describe('import CSV', () => {
  it('nouvelle base : titre renommé, colonnes typées, options créées, une ligne par enregistrement', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const [entetes, ...lignes] = lireCsv(CSV)
    const base = await espace.importerBase('Dépenses', deduireColonnes(entetes!, lignes), lignes)
    await ecrire()

    const schema = espace.etat().bases.get(base)!.depot!.schema
    expect(schema.colonnes.map((c) => [c.nom, c.type])).toEqual([
      ['Fournisseur', 'text'],
      ['Montant', 'number'],
      ['Échéance', 'date'],
      ['Catégorie', 'select'],
    ])
    const categorie = schema.colonnes[3]!
    expect(categorie.type === 'select' && categorie.options.map((o) => o.label)).toEqual(['Print', 'Web'])

    const fichiers = (await a.lister(base)).map((e) => e.nom).filter((n) => n.endsWith('.md'))
    expect(fichiers).toHaveLength(3)
    const imprimerie = await a.lire(`${base}/${fichiers.find((n) => n.startsWith('imprimerie'))!}`)
    expect(imprimerie).toContain('titre: Imprimerie') // la clé du titre ne change pas au renommage
    expect(imprimerie).toContain('montant: 1200.5')
    expect(imprimerie).toContain('echeance: 2026-10-05')
    expect(imprimerie).toContain('categorie: Print')
    const agence = await a.lire(`${base}/${fichiers.find((n) => n.startsWith('agence'))!}`)
    expect(agence).not.toContain('montant')
  })

  it('base existante : colonnes retrouvées par nom (casse et accents ignorés), relations et inconnues ignorées', async () => {
    const { a, espace, ecrire } = await ouvrir()
    const [entetes, ...lignes] = lireCsv('titre,ECHEANCE,Projet,Couleur,Statut,Heures\nRelire,02/10/2026,Navi,bleu,En pause,2\n')
    const cles = espace.correspondances('taches', entetes!)
    expect(cles).toEqual(['titre', 'echeance', null, null, 'statut', 'heures'])

    await espace.importerLignes('taches', cles, lignes)
    await ecrire()
    const statut = espace.etat().bases.get('taches')!.depot!.schema.colonnes.find((c) => c.cle === 'statut')!
    expect(statut.type === 'select' && statut.options.map((o) => o.label)).toEqual(['À faire', 'Terminé', 'En pause'])
    const nom = (await a.lister('taches')).map((e) => e.nom).find((n) => n.startsWith('relire'))!
    const texte = await a.lire(`taches/${nom}`)
    expect(texte).toContain('echeance: 2026-10-02')
    expect(texte).toContain('statut: En pause')
    expect(texte).toContain('heures: 2')
    expect(texte).not.toContain('projet')
  })
})
