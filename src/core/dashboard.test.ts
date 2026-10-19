import { describe, expect, it } from 'vitest'
import { appliquerEnMemoire, lireDashboard, modifierDashboard, nouveauDashboard, partsRangee, type OperationDashboard } from './dashboard'
import { vueParDefaut } from './vue'

const PILOTAGE = `id: pilotage
nom: Pilotage
rangees:
  - blocs:
      - { base: projets, vue: kanban-statut }        # référence
  - blocs:
      - base: taches                                 # vue propre au dashboard
        vue:
          id: taches-en-retard
          nom: En retard
          type: tableau
          filtres:
            - { colonne: echeance, operateur: avant, valeur: aujourdhui }
      - { base: clients, vue: tableau-principal }
`

describe('lireDashboard', () => {
  it('lit l’exemple de la spec : références et vue propre', () => {
    const { dashboard, avertissements } = lireDashboard(PILOTAGE, 'pilotage')
    expect(avertissements).toEqual([])
    expect(dashboard).toEqual({
      id: 'pilotage',
      nom: 'Pilotage',
      rangees: [
        { blocs: [{ base: 'projets', vue: 'kanban-statut' }] },
        {
          blocs: [
            {
              base: 'taches',
              vue: {
                id: 'taches-en-retard',
                nom: 'En retard',
                type: 'tableau',
                filtres: [{ colonne: 'echeance', operateur: 'avant', valeur: 'aujourdhui' }],
                tris: [],
                filtresRapides: [],
              },
            },
            { base: 'clients', vue: 'tableau-principal' },
          ],
        },
      ],
      filtres: [],
      filtresRapides: [],
      requetes: {},
      parametres: [],
      couleurs: {},
      etats: {},
    })
  })

  it('tolérant : bloc sans base écarté, quatre blocs coupés en deux rangées, fichier illisible refusé', () => {
    const { dashboard, avertissements } = lireDashboard(
      'rangees:\n  - blocs:\n      - { vue: x }\n      - { base: a, vue: v }\n      - { base: b, vue: v }\n      - { base: c, vue: v }\n      - { base: d, vue: v }\n',
      'd',
    )
    expect(dashboard?.rangees.map((r) => r.blocs.map((b) => ('base' in b ? b.base : b.type)))).toEqual([['a', 'b', 'c'], ['d']])
    expect(avertissements).toHaveLength(2)
    expect(lireDashboard('rangees: [', 'd').dashboard).toBeNull()
  })
})

describe('modifierDashboard', () => {
  const appliquer = (texte: string, ...ops: OperationDashboard[]) => ops.reduce(modifierDashboard, texte)

  it('ajoute des blocs à un dashboard neuf, lisiblement', () => {
    const propre = { ...vueParDefaut(), id: 'retard', nom: 'Retard', filtres: [{ colonne: 'fait', operateur: 'egal' as const, valeur: false }] }
    delete propre.implicite
    const texte = appliquer(
      nouveauDashboard('suivi', 'Suivi'),
      { type: 'ajouter_bloc', rangee: null, bloc: { base: 'projets', vue: 'tableau' } },
      { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'taches', vue: propre } },
    )
    expect(texte).toBe(`id: suivi
nom: Suivi
rangees:
  - blocs:
      - { base: projets, vue: tableau }
      - base: taches
        vue:
          id: retard
          nom: Retard
          type: tableau
          filtres:
            - { colonne: fait, operateur: egal, valeur: false }
`)
    expect(lireDashboard(texte, 'suivi').dashboard!.rangees[0]!.blocs[1]).toMatchObject({ base: 'taches', vue: { id: 'retard', filtres: [{ colonne: 'fait' }] } })
  })

  it('modifie la vue propre en gardant les commentaires, refuse de modifier une référence', () => {
    const texte = modifierDashboard(PILOTAGE, { type: 'modifier_vue', place: { rangee: 1, bloc: 0 }, modifs: { tris: [{ colonne: 'echeance', sens: 'asc' }] } })
    expect(texte).toContain('# référence')
    expect(texte).toContain('          tris:\n            - { colonne: echeance, sens: asc }\n')
    expect(() => modifierDashboard(PILOTAGE, { type: 'modifier_vue', place: { rangee: 0, bloc: 0 }, modifs: { tris: [] } })).toThrow('propre fichier')
  })

  it('retire un bloc (la rangée vidée disparaît), déplace une rangée, refuse un troisième bloc', () => {
    const sans = modifierDashboard(PILOTAGE, { type: 'retirer_bloc', place: { rangee: 0, bloc: 0 } })
    expect(lireDashboard(sans, 'p').dashboard!.rangees).toHaveLength(1)
    const inverse = modifierDashboard(PILOTAGE, { type: 'deplacer_rangee', de: 1, vers: 0 })
    expect(lireDashboard(inverse, 'p').dashboard!.rangees[1]!.blocs[0]).toEqual({ base: 'projets', vue: 'kanban-statut' })
    const trois = modifierDashboard(PILOTAGE, { type: 'ajouter_bloc', rangee: 1, position: 0, bloc: { base: 'x', vue: 'y' } })
    expect(lireDashboard(trois, 'p').dashboard!.rangees[1]!.blocs.map((b) => ('base' in b ? b.base : b.type))).toEqual(['x', 'taches', 'clients'])
    expect(() => modifierDashboard(trois, { type: 'ajouter_bloc', rangee: 1, bloc: { base: 'z', vue: 'y' } })).toThrow('3 blocs au plus')
  })

  describe('déplacer un bloc', () => {
    const bases = (texte: string) => lireDashboard(texte, 'p').dashboard!.rangees.map((r) => r.blocs.map((b) => ('base' in b ? b.base : b.type)))
    const ops: [string, OperationDashboard, string[][]][] = [
      ['dans sa rangée', { type: 'deplacer_bloc', de: { rangee: 1, bloc: 0 }, vers: { rangee: 1, position: 2 } }, [['projets'], ['clients', 'taches']]],
      ['dans une autre rangée', { type: 'deplacer_bloc', de: { rangee: 1, bloc: 1 }, vers: { rangee: 0, position: 0 } }, [['clients', 'projets'], ['taches']]],
      ['seul dans sa rangée : elle disparaît', { type: 'deplacer_bloc', de: { rangee: 0, bloc: 0 }, vers: { rangee: 1, position: 1 } }, [['taches', 'projets', 'clients']]],
      ['entre deux rangées : une nouvelle rangée', { type: 'deplacer_bloc', de: { rangee: 1, bloc: 0 }, vers: { nouvelleRangee: 1 } }, [['projets'], ['taches'], ['clients']]],
      ['en tête, depuis une rangée vidée', { type: 'deplacer_bloc', de: { rangee: 0, bloc: 0 }, vers: { nouvelleRangee: 2 } }, [['taches', 'clients'], ['projets']]],
    ]
    it.each(ops)('%s : fichier et mémoire d’accord', (_, op, attendu) => {
      expect(bases(modifierDashboard(PILOTAGE, op))).toEqual(attendu)
      const memoire = appliquerEnMemoire(lireDashboard(PILOTAGE, 'p').dashboard!, op)
      expect(memoire.rangees.map((r) => r.blocs.map((b) => ('base' in b ? b.base : b.type)))).toEqual(attendu)
    })

    it('refuse une rangée pleine ; le bloc qui change de rangée perd sa largeur', () => {
      const pleine = modifierDashboard(PILOTAGE, { type: 'ajouter_bloc', rangee: 1, bloc: { base: 'x', vue: 'y' } })
      expect(() => modifierDashboard(pleine, { type: 'deplacer_bloc', de: { rangee: 0, bloc: 0 }, vers: { rangee: 1, position: 0 } })).toThrow('3 blocs au plus')
      const large = modifierDashboard(PILOTAGE, { type: 'largeurs_rangee', rangee: 1, largeurs: [70, null] })
      expect(large).toContain('{ base: clients, vue: tableau-principal }')
      const deplace = modifierDashboard(large, { type: 'deplacer_bloc', de: { rangee: 1, bloc: 0 }, vers: { rangee: 0, position: 1 } })
      expect(deplace).not.toContain('largeur')
    })
  })

  it('largeurs : bornées entre 10 et 90, null les retire ; parts des blocs sans largeur', () => {
    const texte = modifierDashboard(PILOTAGE, { type: 'largeurs_rangee', rangee: 1, largeurs: [95, 5] })
    const r = lireDashboard(texte, 'p').dashboard!.rangees[1]!
    expect(r.blocs.map((b) => b.largeur)).toEqual([90, 10])
    expect(texte).toContain('{ base: clients, vue: tableau-principal, largeur: 10 }')
    expect(modifierDashboard(texte, { type: 'largeurs_rangee', rangee: 1, largeurs: [null, null] })).not.toContain('largeur')
    expect(partsRangee([{ base: 'a', vue: 'v', largeur: 60 }, { base: 'b', vue: 'v' }, { base: 'c', vue: 'v' }])).toEqual([60, 20, 20])
    expect(partsRangee([{ base: 'a', vue: 'v' }, { base: 'b', vue: 'v' }])).toEqual([50, 50])
  })

  it('remplacer un bloc garde sa place et sa largeur', () => {
    const large = modifierDashboard(PILOTAGE, { type: 'largeurs_rangee', rangee: 1, largeurs: [null, 40] })
    const propre = { ...vueParDefaut(), id: 'copie', nom: 'Copie' }
    delete propre.implicite
    const texte = modifierDashboard(large, { type: 'remplacer_bloc', place: { rangee: 1, bloc: 1 }, bloc: { base: 'clients', vue: propre } })
    expect(lireDashboard(texte, 'p').dashboard!.rangees[1]!.blocs[1]).toMatchObject({ base: 'clients', vue: { id: 'copie' }, largeur: 40 })
  })

  it('hauteur d’une rangée : écrite sur la rangée, bornée, retirée pour revenir au défaut', () => {
    const haute = modifierDashboard(PILOTAGE, { type: 'hauteur_rangee', rangee: 1, hauteur: 701.4 })
    expect(haute).toContain('  - blocs:\n      - base: taches')
    expect(haute).toMatch(/\n    hauteur: 701\n/)
    expect(lireDashboard(haute, 'p').dashboard!.rangees[1]!.hauteur).toBe(701)
    expect(lireDashboard(haute, 'p').dashboard!.rangees[0]!.hauteur).toBeUndefined()
    expect(lireDashboard(modifierDashboard(PILOTAGE, { type: 'hauteur_rangee', rangee: 0, hauteur: 20 }), 'p').dashboard!.rangees[0]!.hauteur).toBe(160)
    expect(modifierDashboard(haute, { type: 'hauteur_rangee', rangee: 1, hauteur: null })).not.toContain('hauteur')
    expect(lireDashboard('rangees:\n  - { hauteur: grande, blocs: [ { base: a, vue: b } ] }\n', 'p').dashboard!.rangees[0]).toEqual({ blocs: [{ base: 'a', vue: 'b' }] })
  })

  it('la mémoire suit exactement le fichier', () => {
    const ops: OperationDashboard[] = [
      { type: 'renommer', nom: 'Pilotage 2' },
      { type: 'modifier_vue', place: { rangee: 1, bloc: 0 }, modifs: { nom: 'Retards' } },
      { type: 'ajouter_bloc', rangee: 0, bloc: { base: 'clients', vue: 'cartes' } },
      { type: 'hauteur_rangee', rangee: 0, hauteur: 640 },
      { type: 'deplacer_rangee', de: 0, vers: 1 },
      { type: 'retirer_bloc', place: { rangee: 0, bloc: 1 } },
      { type: 'hauteur_rangee', rangee: 1, hauteur: null },
    ]
    let memoire = lireDashboard(PILOTAGE, 'pilotage').dashboard!
    let texte = PILOTAGE
    for (const op of ops) {
      memoire = appliquerEnMemoire(memoire, op)
      texte = modifierDashboard(texte, op)
      expect(memoire).toEqual(lireDashboard(texte, 'pilotage').dashboard)
    }
  })
})

describe('filtres globaux', () => {
  it('s’écrivent un par ligne, se relisent, et disparaissent quand on les vide', () => {
    let texte = modifierDashboard(PILOTAGE, { type: 'filtres', filtres: [{ base: 'projets', colonne: 'statut', operateur: 'egal', valeur: 'En cours' }] })
    texte = modifierDashboard(texte, { type: 'filtres_rapides', pastilles: [{ base: 'projets', valeur: ['psite001'] }, { base: 'taches', colonne: 'priorite', operateur: 'parmi' }] })
    expect(texte).toContain('filtres:\n  - { base: projets, colonne: statut, operateur: egal, valeur: En cours }\n')
    expect(texte).toContain('filtres_rapides:\n  - { base: projets, valeur: [ psite001 ] }\n  - { base: taches, colonne: priorite, operateur: parmi }\n')
    const lu = lireDashboard(texte, 'pilotage')
    expect(lu.avertissements).toEqual([])
    expect(lu.dashboard).toMatchObject({
      filtres: [{ base: 'projets', colonne: 'statut', operateur: 'egal', valeur: 'En cours' }],
      filtresRapides: [{ base: 'projets', valeur: ['psite001'] }, { base: 'taches', colonne: 'priorite', operateur: 'parmi' }],
    })
    expect(modifierDashboard(texte, { type: 'filtres', filtres: [] })).not.toContain('\nfiltres:')
  })

  it('un filtre global sans base est écarté avec un avertissement', () => {
    const lu = lireDashboard('nom: X\nfiltres:\n  - { colonne: statut, operateur: egal }\n', 'x')
    expect(lu.dashboard!.filtres).toEqual([])
    expect(lu.avertissements).toEqual(['Dashboard x : filtre global ignoré (base, colonne ou opérateur manquant)'])
  })
})

// Analyse (spec §10 « Analyse ») : requêtes, paramètres et blocs d'analyse.
const TICKETS = `id: pilotage-tickets
nom: Pilotage tickets
parametres:
  - { nom: mois, libelle: Mois, type: mois, defaut: courant }
  - { nom: equipe, libelle: Équipe, type: choix, options: [Support, Produit], valeur: Support }
requetes:
  par_statut: |
    select statut, count(*) as n
    from tickets
    where strftime(cree_le, '%Y-%m') = {{mois}} and equipe = {{equipe}}
    group by statut order by n desc
  total: select count(*) as n, count(*) filter (where statut = 'Bloqué') as bloques from tickets
rangees:
  - blocs:
      - { type: valeur, titre: Tickets, donnees: total, valeur: n }
      - type: valeur
        titre: Bloqués
        donnees: total
        valeur: bloques
        regles: [{ si: '> 5', couleur: rouge }]
      - { type: barres, titre: Par statut, donnees: par_statut, x: statut, y: n, largeur: 50 }
  - blocs:
      - type: tableau
        sql: select titre, statut, jours_restants from projets order by jours_restants
        format: { jours_restants: entier }
        regles:
          - { colonne: jours_restants, si: '< 0', couleur: rouge }
          - { colonne: statut, si: '= Terminé', couleur: vert, ligne: true }
      - type: texte
        texte: "**{{total.n}} tickets** ce mois-ci, dont {{total.bloques}} bloqués."
`

describe('dashboard avec analyse', () => {
  it('lit l’exemple de la spec', () => {
    const { dashboard, avertissements } = lireDashboard(TICKETS, 'pilotage-tickets')
    expect(avertissements).toEqual([])
    expect(Object.keys(dashboard!.requetes)).toEqual(['par_statut', 'total'])
    expect(dashboard!.parametres).toEqual([
      { nom: 'mois', libelle: 'Mois', type: 'mois', defaut: 'courant' },
      { nom: 'equipe', libelle: 'Équipe', type: 'choix', options: ['Support', 'Produit'], valeur: 'Support' },
    ])
    expect(dashboard!.rangees[0]!.blocs).toEqual([
      { type: 'valeur', titre: 'Tickets', donnees: 'total', valeur: 'n' },
      { type: 'valeur', titre: 'Bloqués', donnees: 'total', valeur: 'bloques', regles: [{ si: '> 5', couleur: 'rouge' }] },
      { type: 'barres', titre: 'Par statut', donnees: 'par_statut', x: 'statut', y: ['n'], largeur: 50 },
    ])
    expect(dashboard!.rangees[1]!.blocs[0]).toMatchObject({ type: 'tableau', format: { jours_restants: 'entier' }, regles: [{ colonne: 'jours_restants', si: '< 0', couleur: 'rouge' }, { colonne: 'statut', si: '= Terminé', couleur: 'vert', ligne: true }] })
    expect(dashboard!.rangees[1]!.blocs[1]).toEqual({ type: 'texte', texte: '**{{total.n}} tickets** ce mois-ci, dont {{total.bloques}} bloqués.' })
  })

  it('bloc d’analyse ajouté, modifié, déplacé ; requêtes et paramètres réécrits', () => {
    const ops: OperationDashboard[] = [
      { type: 'ajouter_bloc', rangee: null, bloc: { type: 'courbe', sql: 'select mois, n\nfrom t', x: 'mois', y: ['n'] } },
      { type: 'modifier_analyse', place: { rangee: 0, bloc: 0 }, modifs: { titre: 'Évolution', y: ['n', 'm'], x: null } },
      { type: 'requete', nom: 'total', sql: 'select 1 as n' },
      { type: 'requete', nom: 'autre', sql: 'select 2 as n' },
      { type: 'requete', nom: 'total', sql: null },
      { type: 'parametres', parametres: [{ nom: 'mois', type: 'mois', defaut: 'courant' }] },
      { type: 'valeur_parametre', nom: 'mois', valeur: '2026-09' },
    ]
    let texte = nouveauDashboard('d', 'D')
    let memoire = lireDashboard(texte, 'd').dashboard!
    for (const op of ops) {
      texte = modifierDashboard(texte, op)
      memoire = appliquerEnMemoire(memoire, op)
    }
    expect(texte).toBe(`id: d
nom: D
rangees:
  - blocs:
      - type: courbe
        sql: |-
          select mois, n
          from t
        y: [ n, m ]
        titre: Évolution
requetes:
  autre: select 2 as n
parametres:
  - { nom: mois, type: mois, defaut: courant, valeur: 2026-09 }
`)
    expect(lireDashboard(texte, 'd').dashboard).toEqual(memoire)
    expect(() => modifierDashboard(texte, { type: 'valeur_parametre', nom: 'absent', valeur: 1 })).toThrow('introuvable')
    expect(() => modifierDashboard(PILOTAGE, { type: 'modifier_analyse', place: { rangee: 0, bloc: 0 }, modifs: { titre: 'x' } })).toThrow('n’est pas un bloc d’analyse')
  })
})

const FICHE = `id: fiche
nom: Fiche
couleurs:
  etape: { Fait: vert, En cours: orange, Planifié: '#2f6fc2', N/A: aucune, Bof: fuchsia }
etats:
  meteo:
    - { si: 'risque >= 6', couleur: rouge, libelle: Vigilance forte, raison: risque élevé }
    - { couleur: vert, libelle: Nominal }
parametres:
  - { nom: projet, type: choix, options: projets, affichage: boutons, pastille: meteo }
requetes:
  projets: select titre from projets
rangees:
  - blocs:
      - { type: entete, donnees: projets, titre: titre, etat: meteo }
      - { type: compte_a_rebours, titre: MEP, sql: select 1, date: d, libelle: l, seuils: [5, 20] }
  - blocs:
      - type: etapes
        donnees: projets
        element: lot
        etapes: [ Validation, { nom: Recette métier, court: Rec. métier } ]
        couleurs: etape
      - type: liste
        donnees: projets
        libelle: titre
        pastille: statut
        couleurs: { Bloqué: rouge }
        garder: "statut <> 'Fait'"
        max: 4
      - type: frise
        donnees: projets
        ligne: lot
        debut: d
        fin: f
        jalons: { sql: select 1, date: d, libelle: l }
        periodes: { titre: oubli }
`

describe('fiches', () => {
  it('lit couleurs, états, sélecteur et nouveaux blocs ; écarte ce qui est mal formé en le disant', () => {
    const { dashboard, avertissements } = lireDashboard(FICHE, 'fiche')
    expect(avertissements).toEqual([
      'Dashboard fiche, rangée 2, bloc 3, periodes ignoré : ni « donnees » ni « sql »',
      'Dashboard fiche, couleurs etape : couleur « fuchsia » de « Bof » inconnue (une couleur de l\'espace, #rrggbb, vide ou aucune)',
    ])
    const d = dashboard!
    expect(d.couleurs).toEqual({ etape: { Fait: 'vert', 'En cours': 'orange', Planifié: '#2f6fc2', 'N/A': 'aucune' } })
    expect(d.etats.meteo).toEqual([{ si: 'risque >= 6', couleur: 'rouge', libelle: 'Vigilance forte', raison: 'risque élevé' }, { couleur: 'vert', libelle: 'Nominal' }])
    expect(d.parametres[0]).toEqual({ nom: 'projet', type: 'choix', options: 'projets', affichage: 'boutons', pastille: 'meteo' })
    expect(d.rangees[0]!.blocs[1]).toMatchObject({ type: 'compte_a_rebours', seuils: [5, 20] })
    expect(d.rangees[1]!.blocs[0]).toMatchObject({ etapes: [{ nom: 'Validation' }, { nom: 'Recette métier', court: 'Rec. métier' }], couleurs: 'etape' })
    expect(d.rangees[1]!.blocs[1]).toMatchObject({ couleurs: { Bloqué: 'rouge' }, garder: "statut <> 'Fait'", max: 4 })
    expect(d.rangees[1]!.blocs[2]).toMatchObject({ jalons: { sql: 'select 1', date: 'd', libelle: 'l' } })
    expect(d.rangees[1]!.blocs[2]).not.toHaveProperty('periodes')
  })

  it('tables de couleurs et états : écrits en tête du fichier, retirés, la mémoire suit', () => {
    const ops: OperationDashboard[] = [
      { type: 'ajouter_bloc', rangee: null, bloc: { type: 'liste', sql: 'select 1', pastille: 'meteo', max: 3 } },
      { type: 'couleurs', nom: 'etape', table: { Fait: 'vert', 'N/A': 'aucune' } },
      { type: 'etat', nom: 'meteo', entrees: [{ si: 'n > 1', couleur: 'rouge', libelle: 'Haut' }, { couleur: 'vert' }] },
      { type: 'couleurs', nom: 'autre', table: { A: '#112233' } },
      { type: 'couleurs', nom: 'autre', table: null },
      { type: 'parametres', parametres: [{ nom: 'projet', type: 'choix', options: ['A'], affichage: 'boutons', pastille: 'meteo' }] },
    ]
    let texte = nouveauDashboard('d', 'D')
    let memoire = lireDashboard(texte, 'd').dashboard!
    for (const op of ops) {
      texte = modifierDashboard(texte, op)
      memoire = appliquerEnMemoire(memoire, op)
    }
    expect(texte).toBe(`id: d
nom: D
couleurs:
  etape: { Fait: vert, N/A: aucune }
etats:
  meteo:
    - { si: n > 1, couleur: rouge, libelle: Haut }
    - { couleur: vert }
rangees:
  - blocs:
      - { type: liste, sql: select 1, pastille: meteo, max: 3 }
parametres:
  - { nom: projet, type: choix, options: [ A ], affichage: boutons, pastille: meteo }
`)
    expect(lireDashboard(texte, 'd').dashboard).toEqual(memoire)
    texte = modifierDashboard(texte, { type: 'etat', nom: 'meteo', entrees: null })
    expect(texte).not.toContain('etats')
  })
})
