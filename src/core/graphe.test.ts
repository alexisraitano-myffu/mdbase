import { describe, expect, it } from 'vitest'
import { boucle, dependancesDirectes, ordonner, referencesFormule } from './graphe'
import { schemas } from './fixtures/espace-relations'
import type { Schema } from './schema'

const ajouter = (s: Map<string, Schema>, base: string, colonne: Schema['colonnes'][number]) => {
  const b = s.get(base)!
  s.set(base, { ...b, colonnes: [...b.colonnes, colonne] })
  return s
}

describe('graphe de dépendances', () => {
  it('un rollup dépend de sa relation calculée et du champ calculé remonté', () => {
    const s = schemas()
    const heures = s.get('clients')!.colonnes.find((c) => c.cle === 'heures')!
    expect(dependancesDirectes(s, 'clients', heures)).toEqual(['clients.projets', 'projets.heures'])
  })

  it('ordonne les rollups de rollups après ce dont ils dépendent', () => {
    const { ordre, enBoucle } = ordonner(schemas())
    const rang = (n: string) => ordre.findIndex((o) => `${o.base}.${o.colonne.cle}` === n)
    expect(enBoucle.size).toBe(0)
    expect(rang('projets.heures')).toBeLessThan(rang('clients.heures'))
    expect(rang('clients.projets')).toBeLessThan(rang('clients.heures'))
    expect(rang('projets.taches')).toBeLessThan(rang('projets.heures'))
  })

  it('invariant 7 : détecte une boucle et la décrit avec les noms des colonnes', () => {
    expect(boucle(schemas())).toBeNull()
    // Projets › Boucle remonte Clients › Retour, qui remonte Projets › Boucle.
    const s = ajouter(schemas(), 'projets', { cle: 'boucle', nom: 'Boucle', type: 'rollup', relation: 'client', champ: 'retour', calcul: 'afficher' })
    ajouter(s, 'clients', { cle: 'retour', nom: 'Retour', type: 'rollup', relation: 'projets', champ: 'boucle', calcul: 'afficher' })
    const message = boucle(s)!
    expect(message).toMatch(/^Boucle de dépendances : /)
    expect(message).toContain('Projets › Boucle')
    expect(message).toContain('Clients › Retour')
    // Les autres colonnes restent calculables.
    const { ordre, enBoucle } = ordonner(s)
    expect([...enBoucle.keys()].sort()).toEqual(['clients.retour', 'projets.boucle'])
    expect(ordre.map((o) => o.colonne.cle)).toContain('heures')
  })

  it('lit les références d’une formule', () => {
    expect(referencesFormule('ecart_jours(aujourdhui(), prop("echeance")) + prop( "budget" )')).toEqual(['echeance', 'budget'])
  })
})
