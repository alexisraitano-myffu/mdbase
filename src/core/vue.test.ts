import { describe, expect, it } from 'vitest'
import { lireVue, modifierVue, vueParDefaut, type Vue } from './vue'

const KANBAN = `id: kanban-statut
nom: Par statut
type: kanban
groupe: statut
sous_groupe: client
champs_carte: [echeance, nb_taches_ouvertes]
filtres:
  - { colonne: statut, operateur: different_de, valeur: Terminé }
tris:
  - { colonne: echeance, sens: asc }
filtres_rapides:
  - { colonne: client }
  - { colonne: echeance, operateur: avant, valeur: aujourdhui }
mise_en_page: suivi
`

describe('lireVue', () => {
  it('lit l’exemple de la spec', () => {
    const { vue, avertissements } = lireVue(KANBAN, 'kanban-statut')
    expect(avertissements).toEqual([])
    expect(vue).toEqual({
      id: 'kanban-statut',
      nom: 'Par statut',
      type: 'kanban',
      filtres: [{ colonne: 'statut', operateur: 'different_de', valeur: 'Terminé' }],
      tris: [{ colonne: 'echeance', sens: 'asc' }],
      filtresRapides: [{ colonne: 'client' }, { colonne: 'echeance', operateur: 'avant', valeur: 'aujourdhui' }],
      miseEnPage: 'suivi',
      groupe: 'statut',
      sousGroupe: 'client',
      champsCarte: ['echeance', 'nb_taches_ouvertes'],
    })
  })

  it('écarte un filtre mal formé avec un avertissement', () => {
    const { vue, avertissements } = lireVue('filtres:\n  - { colonne: a, operateur: ressemble }\n  - { operateur: vide }\n  - { colonne: b, operateur: vide }\n', 'v')
    expect(vue?.filtres).toEqual([{ colonne: 'b', operateur: 'vide' }])
    expect(avertissements).toHaveLength(2)
  })

  it('refuse un fichier illisible sans lever d’exception', () => {
    expect(lireVue('filtres: [', 'v').vue).toBeNull()
  })
})

describe('modifierVue', () => {
  it('réécrit les filtres au format de la spec, sans toucher aux clés propres au kanban', () => {
    const vue = lireVue(KANBAN, 'kanban-statut').vue!
    const apres = modifierVue(KANBAN, vue, {
      filtres: [
        { colonne: 'statut', operateur: 'parmi', valeur: ['À faire', 'En cours'] },
        { colonne: 'echeance', operateur: 'vide' },
      ],
    })
    expect(apres).toContain('groupe: statut\nsous_groupe: client\nchamps_carte: [ echeance, nb_taches_ouvertes ]\n')
    expect(apres).toContain(
      'filtres:\n  - { colonne: statut, operateur: parmi, valeur: [ À faire, En cours ] }\n  - { colonne: echeance, operateur: vide }\ntris:',
    )
    expect(lireVue(apres, 'kanban-statut').vue!.filtres[0]!.valeur).toEqual(['À faire', 'En cours'])
  })

  it('écrit une pastille par ligne, réglée ou non', () => {
    const apres = modifierVue(null, vueParDefaut(), {
      filtresRapides: [{ colonne: 'statut', operateur: 'parmi', valeur: ['En cours'] }, { colonne: 'client' }],
    })
    expect(apres).toBe(
      'id: tableau\nnom: Tableau\ntype: tableau\nfiltres_rapides:\n  - { colonne: statut, operateur: parmi, valeur: [ En cours ] }\n  - { colonne: client }\n',
    )
  })

  it('ignore une pastille sans colonne (ancien format à nom) avec un avertissement', () => {
    const { vue, avertissements } = lireVue('filtres_rapides:\n  - nom: Urgent\n    filtres: []\n  - { colonne: a }\n', 'v')
    expect(vue?.filtresRapides).toEqual([{ colonne: 'a' }])
    expect(avertissements).toHaveLength(1)
  })

  it('retire une liste vidée, renomme', () => {
    const vue = lireVue(KANBAN, 'k').vue!
    const apres = modifierVue(KANBAN, vue, { tris: [], nom: 'Statuts' })
    expect(apres).not.toContain('tris')
    expect(lireVue(apres, 'k').vue!.nom).toBe('Statuts')
  })
})

describe('réglages de la vue', () => {
  it('écrit et relit ordre, colonnes masquées, largeurs, retour à la ligne, calculs, groupe', () => {
    const vue = vueParDefaut()
    const texte = modifierVue(null, vue, {
      ordre: ['titre', 'statut'],
      masquees: ['budget'],
      largeurs: { titre: 300, statut: 120 },
      retourLigne: true,
      calculs: { budget: 'somme', titre: 'compter' },
      groupe: 'statut',
    })
    expect(texte).toBe(
      'id: tableau\nnom: Tableau\ntype: tableau\ncolonnes: [ titre, statut ]\ncolonnes_masquees: [ budget ]\nlargeurs: { titre: 300, statut: 120 }\nretour_ligne: true\ncalculs: { budget: somme, titre: compter }\ngroupe: statut\n',
    )
    expect(lireVue(texte, 'tableau').vue).toMatchObject({
      ordre: ['titre', 'statut'],
      masquees: ['budget'],
      largeurs: { titre: 300, statut: 120 },
      retourLigne: true,
      calculs: { budget: 'somme', titre: 'compter' },
      groupe: 'statut',
    })
  })

  it('timeline : noms des jalons écrits, relus, retirés quand désactivés', () => {
    const vue: Vue = { ...vueParDefaut(), id: 'frise', type: 'timeline', implicite: false }
    const texte = modifierVue(null, vue, { champsJalons: ['revue'], nomsJalons: true })
    expect(texte).toContain('noms_jalons: true\n')
    expect(lireVue(texte, 'frise').vue?.nomsJalons).toBe(true)
    expect(modifierVue(texte, vue, { nomsJalons: false })).not.toContain('noms_jalons')
    expect(lireVue('type: timeline\nnoms_jalons: oui\n', 'frise').vue?.nomsJalons).toBeUndefined()
  })

  it('retire une clé vidée ou désactivée', () => {
    const avec = modifierVue(null, vueParDefaut(), { retourLigne: true, groupe: 'statut', masquees: ['a'] })
    const sans = modifierVue(avec, vueParDefaut(), { retourLigne: false, groupe: undefined, masquees: [] })
    expect(sans).toBe('id: tableau\nnom: Tableau\ntype: tableau\n')
  })

  it('écrit et relit les réglages temporels ; une échelle inconnue est ignorée', () => {
    const vue: Vue = { ...vueParDefaut(), id: 'planning', nom: 'Planning', type: 'timeline' }
    const texte = modifierVue(null, vue, { champDebut: 'debut', champFin: 'echeance', champsJalons: ['revue'], echelle: 'trimestre' })
    expect(texte).toBe(
      'id: planning\nnom: Planning\ntype: timeline\nchamp_debut: debut\nchamp_fin: echeance\nchamps_jalons: [ revue ]\nechelle: trimestre\n',
    )
    expect(lireVue(texte, 'planning').vue).toMatchObject({ champDebut: 'debut', champFin: 'echeance', champsJalons: ['revue'], echelle: 'trimestre' })
    expect(lireVue('type: calendrier\nechelle: annee\n', 'c').vue?.echelle).toBeUndefined()
  })

  it('couleur des barres : fixe ou selon une colonne, retirée quand on revient au neutre', () => {
    const vue = lireVue('type: timeline\n', 'planning').vue!
    const texte = modifierVue('type: timeline\n', vue, { couleurPar: 'statut' })
    expect(texte).toBe('type: timeline\ncouleur_par: statut\n')
    expect(lireVue(texte, 'planning').vue).toMatchObject({ couleurPar: 'statut' })
    expect(modifierVue(texte, vue, { couleur: undefined, couleurPar: undefined })).toBe('type: timeline\n')
    expect(lireVue('couleur: bleu\n', 'v').vue?.couleur).toBe('bleu')
  })

  it('ignore un réglage mal formé', () => {
    const { vue } = lireVue('largeurs: { titre: large, statut: 90 }\ncolonnes: oui\nretour_ligne: peut-être\n', 'v')
    expect(vue?.largeurs).toEqual({ statut: 90 })
    expect(vue?.ordre).toBeUndefined()
    expect(vue?.retourLigne).toBeUndefined()
  })
})

describe('niveaux dépliés de la timeline', () => {
  const NIVEAUX = [
    {
      relation: 'versions',
      champDebut: 'debut',
      champFin: 'fin',
      filtres: [{ colonne: 'fait', operateur: 'egal' as const, valeur: false }],
      deplier: [{ relation: 'jalons', champDebut: 'date', champsJalons: ['revue'], couleur: 'orange', filtres: [], deplier: [] }],
    },
  ]

  it('s’écrivent un niveau par bloc et se relisent à l’identique', () => {
    const vue = lireVue('nom: Feuille de route\ntype: timeline\nchamp_debut: debut\n', 'feuille').vue!
    const texte = modifierVue('nom: Feuille de route\ntype: timeline\nchamp_debut: debut\n', vue, { deplier: NIVEAUX })
    expect(texte).toContain(
      [
        'deplier:',
        '  - relation: versions',
        '    champ_debut: debut',
        '    champ_fin: fin',
        '    filtres:',
        '      - { colonne: fait, operateur: egal, valeur: false }',
        '    deplier:',
        '      - relation: jalons',
        '        champ_debut: date',
        '        champs_jalons: [ revue ]',
        '        couleur: orange',
      ].join('\n'),
    )
    expect(lireVue(texte, 'feuille').vue!.deplier).toEqual(NIVEAUX)
    expect(modifierVue(texte, vue, { deplier: [] })).not.toContain('deplier')
  })

  it('un niveau sans relation est écarté avec un avertissement', () => {
    const lu = lireVue('type: timeline\ndeplier:\n  - { champ_debut: debut }\n  - { relation: versions }\n', 'v')
    expect(lu.vue!.deplier).toEqual([{ relation: 'versions', filtres: [], deplier: [] }])
    expect(lu.avertissements).toEqual(['Vue v : niveau déplié ignoré (relation manquante)'])
  })

  it('un niveau « sur la ligne » garde son réglage à l’aller-retour', () => {
    const vue = lireVue('type: timeline\nchamp_debut: debut\n', 'v').vue!
    const niveaux = [{ relation: 'phases', champDebut: 'debut', champFin: 'fin', couleurPar: 'type', filtres: [], deplier: [], surLaLigne: true }]
    const texte = modifierVue('type: timeline\nchamp_debut: debut\n', vue, { deplier: niveaux })
    expect(texte).toContain('    couleur_par: type\n    sur_la_ligne: true')
    expect(lireVue(texte, 'v').vue!.deplier).toEqual(niveaux)
  })

  it('champs affichés d’un niveau : `champs_carte` sur le niveau, à l’aller-retour', () => {
    const vue = lireVue('type: timeline\nchamp_debut: debut\n', 'v').vue!
    const niveaux = [{ relation: 'phases', champDebut: 'debut', champFin: 'fin', filtres: [], deplier: [], champsCarte: ['debut', 'fin'] }]
    const texte = modifierVue('type: timeline\nchamp_debut: debut\n', vue, { deplier: niveaux })
    expect(texte).toContain('    champs_carte: [ debut, fin ]\n')
    expect(lireVue(texte, 'v').vue!.deplier).toEqual(niveaux)
  })

  it('titre retiré des barres : `sans_titre` sur la vue et sur un niveau, retiré quand on le remet', () => {
    const vue = lireVue('type: timeline\nchamp_debut: debut\n', 'v').vue!
    const niveaux = [{ relation: 'phases', champDebut: 'debut', champFin: 'fin', filtres: [], deplier: [], sansTitre: true }]
    const texte = modifierVue('type: timeline\nchamp_debut: debut\n', vue, { sansTitre: true, deplier: niveaux })
    expect(texte).toContain('sans_titre: true\n')
    expect(texte).toContain('    sans_titre: true\n')
    const relue = lireVue(texte, 'v').vue!
    expect(relue.sansTitre).toBe(true)
    expect(relue.deplier).toEqual(niveaux)
    expect(modifierVue(texte, relue, { sansTitre: false, deplier: [{ ...niveaux[0]!, sansTitre: undefined }] })).not.toContain('sans_titre')
    expect(lireVue('type: timeline\nsans_titre: oui\n', 'v').vue?.sansTitre).toBeUndefined()
  })
})

describe('bandes de la timeline', () => {
  it('s’écrivent une source par bloc et se relisent à l’identique', () => {
    const vue = lireVue('type: timeline\nchamp_debut: debut\n', 'v').vue!
    const bandes = [{ base: 'periodes', champDebut: 'debut', champFin: 'fin', couleurPar: 'type' }, { base: 'sprints', champDebut: 'debut', couleur: 'gris' }]
    const texte = modifierVue('type: timeline\nchamp_debut: debut\n', vue, { bandes })
    expect(texte).toContain(['bandes:', '  - base: periodes', '    champ_debut: debut', '    champ_fin: fin', '    couleur_par: type', '  - base: sprints'].join('\n'))
    expect(lireVue(texte, 'v').vue!.bandes).toEqual(bandes)
    expect(modifierVue(texte, vue, { bandes: [] })).not.toContain('bandes')
    // Titres en bas : `titres: bas` ; toute autre valeur garde le défaut (en haut).
    const enBas = modifierVue(texte, vue, { bandes: [{ ...bandes[0]!, titres: 'bas' }] })
    expect(enBas).toContain('    couleur_par: type\n    titres: bas\n')
    expect(lireVue(enBas, 'v').vue!.bandes![0]!.titres).toBe('bas')
    expect(lireVue('type: timeline\nbandes:\n  - { base: p, titres: milieu }\n', 'v').vue!.bandes).toEqual([{ base: 'p' }])
  })

  it('une bande sans base est écartée avec un avertissement', () => {
    const lu = lireVue('type: timeline\nbandes:\n  - { champ_debut: debut }\n  - { base: periodes }\n', 'v')
    expect(lu.vue!.bandes).toEqual([{ base: 'periodes' }])
    expect(lu.avertissements).toEqual(['Vue v : bande ignorée (base manquante)'])
  })
})
