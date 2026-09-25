import { describe, expect, it } from 'vitest'
import { avecCalculs, descendants, enfantsDe, type Noeud, type SourceArbre } from './arbre-temps'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'
import type { Niveau } from './vue'

// Timeline en arbre : descendre les relations d'une ligne, niveau par niveau.

const ctx = { aujourdhui: '2026-09-25' }

async function source(): Promise<SourceArbre> {
  const espace = await DepotEspace.ouvrir(new AdaptateurCompteur({ ...FICHIERS_RELATIONS }), { aleatoire, planifier: minuteur().planifier, aujourdhui: () => ctx.aujourdhui })
  const etat = espace.etat()
  const bases = [...etat.bases.values()].filter((b) => b.depot)
  return {
    schemas: new Map(bases.map((b) => [b.id, b.depot!.schema])),
    lignes: new Map(bases.map((b) => [b.id, b.depot!.lignes()])),
    calculs: etat.calculs,
  }
}

const niveau = (relation: string, reglages: Partial<Niveau> = {}): Niveau => ({ relation, filtres: [], deplier: [], ...reglages })
/** Arbre en texte : une ligne par nœud, indentée selon la profondeur. */
const texte = (noeuds: Noeud[]) => descendants(noeuds).map((n) => `${'  '.repeat(n.profondeur - 1)}${n.base}:${n.ligne.id}`)

async function depuis(base: string, id: string, niveaux: Niveau[]) {
  const src = await source()
  const ligne = avecCalculs(src, base, src.lignes.get(base)!.find((l) => l.id === id)!)
  return enfantsDe(src, base, ligne, niveaux, ctx, `${base}:${id}`)
}

describe('timeline en arbre', () => {
  it('descend deux niveaux côté miroir (client → projets → tâches), enfants triés par date de début', async () => {
    const arbre = await depuis('clients', 'c0000001', [niveau('projets', { deplier: [niveau('taches', { champDebut: 'echeance' })] })])
    expect(texte(arbre)).toEqual(['projets:p0000001', '  taches:t0000002', '  taches:t0000001', 'projets:p0000002', '  taches:t0000003'])
  })

  it('côté propriétaire aussi (tâche → projet → client), et un lien cassé ne donne rien', async () => {
    expect(texte(await depuis('taches', 't0000003', [niveau('projet', { deplier: [niveau('client')] })]))).toEqual(['projets:p0000002', '  clients:c0000001'])
  })

  it('les filtres d’un niveau ne touchent que ce niveau', async () => {
    const taches = niveau('taches', { filtres: [{ colonne: 'fait', operateur: 'egal', valeur: true }] })
    expect(texte(await depuis('clients', 'c0000001', [niveau('projets', { deplier: [taches] })]))).toEqual(['projets:p0000001', '  taches:t0000001', 'projets:p0000002'])
  })

  it('un filtre de niveau pas encore rempli ne masque rien', async () => {
    const taches = niveau('taches', { filtres: [{ colonne: 'titre', operateur: 'egal' }] })
    expect(texte(await depuis('projets', 'p0000001', [taches]))).toEqual(['taches:t0000001', 'taches:t0000002'])
  })

  it('plusieurs relations cochées au même niveau : leurs enfants se suivent, dans l’ordre des niveaux', async () => {
    const arbre = await depuis('projets', 'p0000001', [niveau('client'), niveau('taches')])
    expect(texte(arbre)).toEqual(['clients:c0000001', 'taches:t0000001', 'taches:t0000002'])
  })

  it('une boucle de relations s’arrête : une ligne déjà sur le chemin n’est pas redescendue', async () => {
    const arbre = await depuis('taches', 't0000001', [niveau('projet', { deplier: [niveau('taches')] })])
    expect(texte(arbre)).toEqual(['projets:p0000001', '  taches:t0000002'])
  })

  it('une relation inconnue ou supprimée depuis est ignorée', async () => {
    expect(await depuis('clients', 'c0000001', [niveau('disparue')])).toEqual([])
  })
})
