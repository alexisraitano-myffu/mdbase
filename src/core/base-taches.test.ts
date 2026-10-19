import { describe, expect, it } from 'vitest'
import { arbreComplet, echeanceDe, estFaite, filtrerArbre, idsArbre, lignesTaches, racinesParmi, resoudreBaseTaches, tachesLiees, trierTaches, valeurFait, type BaseTaches, type NoeudTache } from './base-taches'
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

const schema = (e: DepotEspace, base: string) => e.etat().bases.get(base)!.depot!.schema
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

/** Arbre en texte : « titre(enfants) ». */
const dessin = (noeuds: NoeudTache[]): string => noeuds.map((n) => `${(n.ligne.cellules.titre as { valeur: string }).valeur}${n.enfants.length ? `(${dessin(n.enfants)})` : ''}`).join(' ')

/** Espace dont la base des tâches a des sous-tâches : A > B > C, et D ↔ E en boucle. */
async function avecSousTaches() {
  const schema = FICHIERS_RELATIONS['taches/_schema.yaml']! + '  - { cle: parente, nom: Tâche parente, type: relation, cible: taches, proprietaire: true, inverse: sous_taches }\n  - { cle: sous_taches, nom: Sous-tâches, type: relation, cible: taches, proprietaire: false, inverse: parente }\n'
  const fichiers = {
    ...FICHIERS_RELATIONS,
    'taches/_schema.yaml': schema,
    'taches/b--t0000002.md': '---\nid: t0000002\ntitre: B\nprojet: p0000001\nstatut: Terminé\nparente: t0000001\n---\n',
    'taches/c--t0000003.md': '---\nid: t0000003\ntitre: C\nparente: t0000002\n---\n',
    'taches/d--t0000004.md': '---\nid: t0000004\ntitre: D\nparente: t0000005\n---\n',
    'taches/e--t0000005.md': '---\nid: t0000005\ntitre: E\nparente: t0000004\n---\n',
  }
  const { a, espace } = await ouvrir(fichiers)
  const r = resoudreBaseTaches(espace.etat(), { base: 'taches', fait: 'statut', terminees: ['Terminé'], sous_taches: 'sous_taches' })
  if (!r?.ok) throw new Error(r ? r.erreur : 'aucune')
  return { a, espace, t: r.taches }
}

describe('base des tâches : sous-tâches', () => {
  it('la clé sous_taches doit être une relation de la base vers elle-même', async () => {
    const { espace } = await ouvrir()
    const r = resoudreBaseTaches(espace.etat(), { base: 'taches', fait: 'fait', sous_taches: 'projet' })
    expect(r && !r.ok && r.erreur).toContain('vers elle-même')
  })

  it('arbre complet : sous-tâches à toute profondeur, une boucle sans entrée ne disparaît pas et ne tourne pas', async () => {
    const { espace, t } = await avecSousTaches()
    const arbre = arbreComplet(t, lignesTaches(espace.etat(), t))
    expect(dessin(arbre)).toBe('A(B(C)) D(E)')
    expect(idsArbre(arbre)).toHaveLength(5)
  })

  it('racines parmi des tâches liées : une sous-tâche liée elle aussi ne remonte pas en tête', async () => {
    const { espace, t } = await avecSousTaches()
    const lignes = lignesTaches(espace.etat(), t)
    expect(titres(racinesParmi(t, lignes.filter((l) => ['t0000001', 't0000002'].includes(l.id))))).toEqual(['A'])
  })

  it('filtre : une tâche faite reste pour sa sous-tâche à faire ; la recherche garde les parents', async () => {
    const { espace, t } = await avecSousTaches()
    const arbre = arbreComplet(t, lignesTaches(espace.etat(), t))
    const aFaire = (l: Parameters<typeof estFaite>[1]) => !estFaite(t, l)
    expect(dessin(filtrerArbre(arbre, aFaire, () => true))).toBe('A(B(C)) D(E)') // B est faite, C non
    const titre = (l: Parameters<typeof estFaite>[1]) => (l.cellules.titre as { valeur: string }).valeur
    expect(dessin(filtrerArbre(arbre, () => true, (l) => titre(l) === 'C'))).toBe('A(B(C))')
    expect(dessin(filtrerArbre(arbre, () => true, (l) => titre(l) === 'A'))).toBe('A(B(C))') // un parent trouvé garde ses sous-tâches
  })

  it('onglet d’une tâche : ses sous-tâches, et la relation vers la parente pour en créer', async () => {
    const { espace, t } = await avecSousTaches()
    const liees = tachesLiees(espace.etat(), t, 'taches', 't0000001')
    expect(liees?.relation.cle).toBe('parente')
    expect(titres(liees!.lignes)).toEqual(['B'])
  })
})

describe('base des tâches : créer et lier, relation à la volée', () => {
  it('créer une tâche liée à une base déjà reliée : pas de relation créée', async () => {
    const { espace } = await ouvrir()
    await espace.reglerTaches({ base: 'taches', fait: 'fait' })
    const { ligne, relationsCreees } = await espace.creerTache('Nouvelle', [{ base: 'projets', id: 'p0000002' }])
    expect(relationsCreees).toEqual([])
    expect(ligne.cellules.projet).toEqual({ etat: 'ok', valeur: ['p0000002'] })
  })

  it('lier à une base sans relation la crée (masquée), puis lie', async () => {
    const { a, espace } = await ouvrir()
    await espace.reglerTaches({ base: 'taches', fait: 'fait' })
    const { relationCreee } = await espace.lierTache('t0000001', 'clients', 'c0000002')
    expect(relationCreee).toBe('Clients')
    const relation = schema(espace, 'taches').colonnes.find((c) => c.type === 'relation' && c.cible === 'clients')!
    await espace.vider()
    expect(await a.lire('taches/a--t0000001.md')).toContain(`${relation.cle}: c0000002`)
    expect(espace.etat().bases.get('clients')!.vues.every((v) => v.masquees?.includes((relation as { inverse: string }).inverse))).toBe(true)
    // La deuxième fois, la relation existe : rien n'est créé.
    expect((await espace.lierTache('t0000002', 'clients', 'c0000001')).relationCreee).toBeNull()
  })

  it('activer les sous-tâches crée l’auto-relation une fois et l’écrit dans sous_taches', async () => {
    const { espace } = await ouvrir()
    await espace.reglerTaches({ base: 'taches', fait: 'fait' })
    const cle = await espace.activerSousTaches()
    expect(espace.etat().taches?.sous_taches).toBe(cle)
    expect(await espace.activerSousTaches()).toBe(cle)
    const r = resoudreBaseTaches(espace.etat(), espace.etat().taches)
    if (!r?.ok) throw new Error('non résolue')
    const parente = r.taches.sousTaches!.inverse
    const { ligne } = await espace.creerTache('Sous', [], { [parente]: ['t0000001'] })
    expect(titres(tachesLiees(espace.etat(), r.taches, 'taches', 't0000001')!.lignes)).toEqual(['Sous'])
    expect(ligne.id).toBeTruthy()
  })
})
