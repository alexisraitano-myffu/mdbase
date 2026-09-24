import { describe, expect, it } from 'vitest'
import type { LigneChargee } from './base'
import type { LigneVue } from './filtres'
import { schemaProjets } from './fixtures/schema-projets'
import { CLE_VIDE, colonnesDeLaVue, grouper, valeurApresDeplacement } from './groupes'
import { creerLigne, lireLigne, type Modifications } from './ligne'
import { colonne } from './schema'

const schema = schemaProjets()
let n = 0
function lv(valeurs: Modifications): LigneVue {
  const id = `l${String(++n).padStart(7, '0')}`
  const r = lireLigne(`projets/${id}.md`, creerLigne(schema, id, valeurs), schema)
  if (!r.ok) throw new Error(r.raison)
  return { ligne: { ...r.ligne, date: 0 } as LigneChargee, sortira: false }
}
const col = (cle: string) => colonne(schema, cle)!
const resume = (gs: ReturnType<typeof grouper>) => gs.map((g) => `${g.libelle}:${g.lignes.length}`)
const titres = (id: string) => ({ c1: 'Acme', c2: 'Globex' })[id] ?? null

describe('colonnesDeLaVue', () => {
  it('suit l’ordre de la vue, puis celui du schéma ; le titre ne se masque pas', () => {
    const { visibles, masquees } = colonnesDeLaVue(schema, { ordre: ['budget', 'titre', 'inconnue'], masquees: ['statut', 'titre'] })
    expect(visibles.map((c) => c.cle).slice(0, 3)).toEqual(['budget', 'titre', 'echeance'])
    expect(masquees.map((c) => c.cle)).toEqual(['statut'])
  })
})

describe('grouper', () => {
  it('select : dans l’ordre des options, vide en dernier ; options sans ligne sur demande', () => {
    const lignes = [lv({ statut: 'Terminé' }), lv({}), lv({ statut: 'À faire' }), lv({ statut: 'Terminé' })]
    expect(resume(grouper(lignes, col('statut'), titres))).toEqual(['À faire:1', 'Terminé:2', 'Sans statut:1'])
    expect(resume(grouper(lignes, col('statut'), titres, true))).toEqual(['À faire:1', 'En cours:0', 'Terminé:2', 'Sans statut:1'])
    expect(grouper(lignes, col('statut'), titres)[0]).toMatchObject({ valeur: 'À faire', couleur: 'gris' })
  })

  it('checkbox : non coché puis coché, une case absente est décochée', () => {
    expect(resume(grouper([lv({ urgent: true }), lv({})], col('urgent'), titres))).toEqual(['Non coché:1', 'Coché:1'])
  })

  it('multiselect et relation : une ligne dans chacun de ses groupes, titres pour la relation', () => {
    const lignes = [lv({ tags: ['pro', 'client'], client: ['c2', 'c1'] }), lv({ tags: ['pro'] })]
    expect(resume(grouper(lignes, col('tags'), titres))).toEqual(['pro:2', 'client:1'])
    const parClient = grouper(lignes, col('client'), titres)
    expect(resume(parClient)).toEqual(['Acme:1', 'Globex:1', 'Sans client:1'])
    expect(parClient[0]!.valeur).toEqual(['c1'])
  })

  it('texte : alphabétique', () => {
    expect(resume(grouper([lv({ titre: 'b' }), lv({ titre: 'A' }), lv({ titre: 'b' })], col('titre'), titres))).toEqual(['A:1', 'b:2'])
  })
})

describe('valeurApresDeplacement', () => {
  const g = (cle: string, valeur?: unknown) => ({ cle, libelle: cle, lignes: [], ...(valeur !== undefined && { valeur }) }) as never
  it('select, checkbox, relation : la valeur du groupe d’arrivée remplace', () => {
    expect(valeurApresDeplacement(col('statut'), 'À faire', 'À faire', g('Terminé', 'Terminé'))).toBe('Terminé')
    expect(valeurApresDeplacement(col('urgent'), false, 'non', g('oui', true))).toBe(true)
    expect(valeurApresDeplacement(col('client'), ['c1', 'c2'], 'c1', g('c3', ['c3']))).toEqual(['c3'])
    expect(valeurApresDeplacement(col('statut'), 'À faire', 'À faire', g(CLE_VIDE))).toBeUndefined()
  })
  it('multiselect : seule l’option de départ est remplacée', () => {
    expect(valeurApresDeplacement(col('tags'), ['pro', 'client'], 'pro', g('perso', ['perso']))).toEqual(['client', 'perso'])
    expect(valeurApresDeplacement(col('tags'), ['pro', 'client'], 'pro', g(CLE_VIDE))).toEqual(['client'])
  })
})
