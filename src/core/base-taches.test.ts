import { describe, expect, it } from 'vitest'
import { echeanceDe, estFaite, lignesTaches, resoudreBaseTaches, tachesLiees, trierTaches, valeurFait, type BaseTaches } from './base-taches'
import { DepotEspace } from './depot-espace'
import { FICHIERS_RELATIONS } from './fixtures/espace-relations'
import { AdaptateurCompteur, aleatoire, minuteur } from './fixtures/outils'

async function ouvrir(fichiers: Record<string, string> = FICHIERS_RELATIONS) {
  const a = new AdaptateurCompteur(fichiers)
  const espace = await DepotEspace.ouvrir(a, { aleatoire, planifier: minuteur().planifier, aujourdhui: () => '2026-09-24' })
  return { a, espace }
}

async function resolue(config: Parameters<typeof resoudreBaseTaches>[1]): Promise<{ espace: DepotEspace; t: BaseTaches }> {
  const { espace } = await ouvrir()
  const r = resoudreBaseTaches(espace.etat(), config)
  if (!r?.ok) throw new Error(r ? r.erreur : 'aucune')
  return { espace, t: r.taches }
}

const titres = (lignes: { cellules: Record<string, unknown> }[]) => lignes.map((l) => (l.cellules.titre as { valeur: string }).valeur)

describe('base des tâches : résolution', () => {
  it('sans clé, pas de base des tâches', async () => {
    const { espace } = await ouvrir()
    expect(resoudreBaseTaches(espace.etat(), undefined)).toBeNull()
  })

  it('dit ce qui ne colle pas : base absente, colonne fait ou échéance du mauvais type', async () => {
    const { espace } = await ouvrir()
    const erreur = (c: Parameters<typeof resoudreBaseTaches>[1]) => {
      const r = resoudreBaseTaches(espace.etat(), c)
      return r && !r.ok ? r.erreur : null
    }
    expect(erreur({ base: 'absente', fait: 'fait' })).toContain('introuvable')
    expect(erreur({ base: 'taches', fait: 'heures' })).toContain('case à cocher ou un choix')
    expect(erreur({ base: 'taches', fait: 'fait', echeance: 'titre' })).toContain('date')
  })

  it('un choix sans options terminées valides prend sa dernière option', async () => {
    const { t } = await resolue({ base: 'taches', fait: 'statut', terminees: ['Inconnue'] })
    expect(t.terminees).toEqual(['Terminé'])
  })
})

describe('base des tâches : faite, cocher, échéance, tri', () => {
  it('case à cocher : vraie = faite ; cocher écrit true, décocher retire la valeur', async () => {
    const { espace, t } = await resolue({ base: 'taches', fait: 'fait' })
    expect(lignesTaches(espace.etat(), t).map((l) => estFaite(t, l))).toEqual([true, false, false])
    expect(valeurFait(t, true)).toBe(true)
    expect(valeurFait(t, false)).toBeUndefined()
  })

  it('choix : les options terminées comptent comme faites ; décocher écrit la première autre option', async () => {
    const { espace, t } = await resolue({ base: 'taches', fait: 'statut', terminees: ['Terminé'] })
    expect(lignesTaches(espace.etat(), t).map((l) => estFaite(t, l))).toEqual([false, true, false])
    expect(valeurFait(t, true)).toBe('Terminé')
    expect(valeurFait(t, false)).toBe('À faire')
  })

  it('trie par échéance, puis sans échéance dans l’ordre reçu', async () => {
    const { espace, t } = await resolue({ base: 'taches', fait: 'fait', echeance: 'echeance' })
    const lignes = lignesTaches(espace.etat(), t)
    expect(lignes.map((l) => echeanceDe(t, l))).toEqual(['2026-10-01', '2026-09-01', null])
    expect(titres(trierTaches(t, lignes))).toEqual(['B', 'A', 'C'])
  })
})

describe('base des tâches : tâches liées à une page', () => {
  it('les lignes liées par la relation vers la base de la page, triées', async () => {
    const { espace, t } = await resolue({ base: 'taches', fait: 'fait', echeance: 'echeance' })
    const liees = tachesLiees(espace.etat(), t, 'projets', 'p0000001')
    expect(liees?.relation.cle).toBe('projet')
    expect(titres(liees!.lignes)).toEqual(['B', 'A'])
    expect(titres(tachesLiees(espace.etat(), t, 'projets', 'p0000002')!.lignes)).toEqual(['C'])
  })

  it('sans relation vers la base de la page, rien', async () => {
    const { espace, t } = await resolue({ base: 'taches', fait: 'fait' })
    expect(tachesLiees(espace.etat(), t, 'clients', 'c0000001')).toBeNull()
    expect(tachesLiees(espace.etat(), t, 'taches', 't0000001')).toBeNull()
  })

  it('une relation non propriétaire se lit par ses valeurs calculées', async () => {
    const schema = FICHIERS_RELATIONS['projets/_schema.yaml']! + '  - { cle: fini, nom: Fini, type: checkbox }\n'
    const { espace } = await ouvrir({ ...FICHIERS_RELATIONS, 'projets/_schema.yaml': schema })
    const r = resoudreBaseTaches(espace.etat(), { base: 'projets', fait: 'fini' })
    if (!r?.ok) throw new Error('non résolue')
    expect(titres(tachesLiees(espace.etat(), r.taches, 'taches', 't0000001')!.lignes)).toEqual(['Navi'])
  })
})

describe('base des tâches : dépôt', () => {
  it('règle et retire la base des tâches dans _espace.yaml, visible dans l’état', async () => {
    const { a, espace } = await ouvrir()
    await espace.reglerTaches({ base: 'taches', fait: 'statut', terminees: ['Terminé'] })
    expect(espace.etat().taches).toEqual({ base: 'taches', fait: 'statut', terminees: ['Terminé'] })
    expect(await a.lire('_espace.yaml')).toContain('fait: statut')
    await espace.reglerTaches(null)
    expect(espace.etat().taches).toBeUndefined()
  })

  it('« Créer une base Tâches » : colonnes prêtes, base désignée, identifiant dédoublonné', async () => {
    const { espace } = await ouvrir()
    const base = await espace.creerBaseTaches()
    expect(base).not.toBe('taches')
    const schema = espace.etat().bases.get(base)!.depot!.schema
    expect(schema.colonnes.map((c) => `${c.cle}:${c.type}`)).toEqual(['titre:text', 'fait:checkbox', 'echeance:date', 'priorite:select'])
    expect(espace.etat().taches).toEqual({ base, fait: 'fait', echeance: 'echeance' })
    const r = resoudreBaseTaches(espace.etat(), espace.etat().taches)
    expect(r?.ok).toBe(true)
  })

  it('supprimer la base des tâches retire la clé', async () => {
    const { espace } = await ouvrir()
    await espace.reglerTaches({ base: 'taches', fait: 'fait' })
    await espace.supprimerBase('taches')
    expect(espace.etat().taches).toBeUndefined()
  })
})
