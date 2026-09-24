// L'espace de démonstration reste lisible et cohérent : aucun avertissement,
// valeurs calculées attendues (y compris le rollup de rollup des clients).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
import { AdaptateurMemoire } from './core/adaptateur-memoire'
import { DepotEspace } from './core/depot-espace'

const RACINE = 'exemples/espace-demo'

function lireDossier(dossier: string, fichiers: Record<string, string> = {}) {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) lireDossier(chemin, fichiers)
    else fichiers[relative(RACINE, chemin)] = readFileSync(chemin, 'utf8')
  }
  return fichiers
}

it('la démo se charge sans avertissement et calcule ses rollups', async () => {
  const espace = await DepotEspace.ouvrir(new AdaptateurMemoire(lireDossier(RACINE)), {
    aleatoire: (n) => new Uint8Array(n),
    planifier: () => () => {},
    aujourdhui: () => '2026-09-24',
  })
  const etat = espace.etat()
  expect(etat.groupes).toEqual([{ nom: 'Travail', bases: ['clients', 'projets', 'taches'] }])
  expect([...etat.bases.values()].map((b) => b.vues.map((v) => v.id))).toEqual([
    ['cartes', 'tableau'],
    ['tableau', 'par-statut', 'planning'],
    ['tableau', 'par-priorite', 'calendrier', 'planning'],
  ])
  expect(etat.bases.get('projets')!.vues[2]).toMatchObject({ type: 'timeline', champDebut: 'debut', champFin: 'echeance', champsJalons: ['revue'] })
  for (const b of etat.bases.values()) {
    expect(b.chargement.ok && b.chargement.base).toMatchObject({ avertissements: [], nonReconnus: [] })
  }
  const v = (base: string, id: string, cle: string) => {
    const c = etat.calculs.get(base)?.get(id)?.[cle]
    return c?.etat === 'ok' ? c.valeur : c
  }
  expect([v('projets', 'psite001', 'heures'), v('projets', 'psite001', 'avancement'), v('projets', 'psite001', 'restantes')]).toEqual([20, 33.33, 2])
  expect([v('projets', 'paudi004', 'heures'), v('projets', 'paudi004', 'avancement'), v('projets', 'paudi004', 'restantes')]).toEqual([9, 100, 0])
  // Rollups de rollups.
  expect([v('clients', 'cacme001', 'nb_projets'), v('clients', 'cacme001', 'heures')]).toEqual([2, 24])
  expect(v('clients', 'cacme001', 'avancement')).toBeCloseTo(16.665)
  expect(v('clients', 'cinit003', 'avancement')).toBe(100)
})
