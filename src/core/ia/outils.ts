import type { LigneChargee } from '../base'
import type { EtatEspace } from '../depot-espace'
import { estSaisie, nomSource, type Colonne, type Schema } from '../schema'
import { decaler, jourSemaine, lundiDe } from '../temps'
import type { Cellule } from '../valeurs'
import { OPERATEURS, type Niveau, type Vue } from '../vue'
import type { Skill } from './memoire'
import type { DefinitionOutil } from './modele'
import { TYPES_COLONNE, TYPES_OPERATION, TYPES_VUE } from './structure'
import { estAnalyse, estPropre, type Bloc } from '../dashboard'
import { CALCULS } from '../schema'
import { COULEURS } from '../couleurs'
import { detailAnalyse, FORMATS, TYPES_PARAMETRE, TYPES_VISUEL } from '../bi/analyse'

// Ce que voit le modèle (spec §12, « Module IA ») : la consigne, les outils,
// et une description compacte de l'espace ouvert. Rien d'autre ne quitte la machine.

export const FILTRE = {
  type: 'object',
  properties: {
    colonne: { type: 'string', description: 'clé de la colonne' },
    operateur: { type: 'string', enum: [...OPERATEURS] },
    valeur: { description: 'valeur comparée ; parmi / pas_parmi : une liste (libellés d’options, ou ids des lignes liées), la ligne a l’une de ces valeurs / n’en a aucune ; jours_passes / jours_a_venir : un nombre de jours (depuis aujourd’hui), ou [N, M] pour de N à M jours, bornes comprises' },
  },
  required: ['colonne', 'operateur'],
}

const VALEURS = {
  type: 'object',
  description: 'clé de colonne → valeur ; null vide le champ',
  additionalProperties: true,
}

const OPTION = {
  anyOf: [
    { type: 'string' },
    { type: 'object', properties: { label: { type: 'string' }, couleur: { type: 'string', enum: [...COULEURS] } }, required: ['label'] },
  ],
  description: 'libellé, ou { label, couleur } pour choisir sa couleur',
}

const COLONNE = {
  type: 'object',
  properties: {
    nom: { type: 'string' },
    type: { type: 'string', enum: [...TYPES_COLONNE] },
    options: { type: 'array', items: OPTION, description: 'select / multiselect : les options' },
    cible: { type: 'string', description: 'relation : id de la base liée' },
    relation: { type: 'string', description: 'rollup : clé de la colonne relation de cette base' },
    champ: { type: 'string', description: 'rollup : clé de la colonne remontée depuis la base liée' },
    calcul: { type: 'string', enum: [...CALCULS], description: 'rollup' },
    expression: { type: 'string', description: 'formula : expression, colonnes en prop("cle")' },
  },
  required: ['nom', 'type'],
}

const COULEUR = {
  couleur: { type: ['string', 'null'], enum: [...COULEURS, null], description: 'calendrier, timeline : couleur fixe des barres ; null la retire' },
  couleur_par: {
    type: ['string', 'null'],
    description: 'calendrier, timeline : colonne à choix dont la couleur d’option colore chaque barre (l’emporte sur couleur) ; null la retire',
  },
}

const NIVEAU = {
  type: 'object',
  properties: {
    relation: { type: 'string', description: 'clé de la colonne relation, dans la base du niveau au-dessus' },
    champ_debut: { type: 'string', description: 'colonne date de la base liée (par défaut : sa première date)' },
    champ_fin: { type: 'string', description: 'colonne date de fin de la base liée ; sans fin, les lignes sont des losanges' },
    champs_jalons: { type: 'array', items: { type: 'string' } },
    ...COULEUR,
    filtres: { type: 'array', items: FILTRE, description: 'filtres sur les lignes de la base liée' },
    deplier: { type: 'array', items: { type: 'object' }, description: 'niveaux suivants, même forme, depuis la base liée' },
    sur_la_ligne: {
      type: 'boolean',
      description:
        'true : les lignes de ce niveau se dessinent sur la rangée de leur parent, à la suite (un lot et ses phases sur une ligne, comme un Gantt) ; le niveau ne se déplie pas plus bas',
    },
    sans_titre: { type: 'boolean', description: 'barres de ce niveau sans leur titre' },
    champs_carte: { type: 'array', items: { type: 'string' }, description: 'colonnes de la base liée affichées sur les barres du niveau' },
  },
  required: ['relation'],
}

const REGLAGES_VUE = {
  groupe: { type: ['string', 'null'], description: 'clé de la colonne de groupement (tableau, kanban) ; null le retire' },
  filtres: { type: 'array', items: FILTRE, description: 'remplacent les filtres de la vue' },
  tris: {
    type: 'array',
    items: { type: 'object', properties: { colonne: { type: 'string' }, sens: { type: 'string', enum: ['asc', 'desc'] } }, required: ['colonne'] },
  },
  filtres_ou: {
    type: ['array', 'null'],
    items: { type: 'array', items: FILTRE },
    description: 'groupes « OU » : en plus de filtres, une ligne doit satisfaire au moins un groupe (dans un groupe, tous les filtres) ; null ou [] les retire',
  },
  filtres_rapides: {
    type: ['array', 'null'],
    items: { type: 'object', properties: { colonne: { type: 'string' }, operateur: FILTRE.properties.operateur, valeur: FILTRE.properties.valeur }, required: ['colonne'] },
    description: 'pastilles au-dessus de la vue, que l’utilisateur règle d’un clic ; sans valeur, une pastille ne filtre rien. Remplacent les existantes ; [] les retire',
  },
  colonnes: { type: ['array', 'null'], items: { type: 'string' }, description: 'ordre des colonnes affichées (clés ou noms) ; celles non citées suivent, dans l’ordre de la base ; null ou [] le retire' },
  colonnes_masquees: { type: ['array', 'null'], items: { type: 'string' } },
  champs_carte: { type: ['array', 'null'], items: { type: 'string' }, description: 'kanban, collection, calendrier, timeline : colonnes affichées sous le titre' },
  sans_titre: { type: 'boolean', description: 'timeline : barres sans leur titre (la légende et l’infobulle le donnent)' },
  sous_groupe: { type: ['string', 'null'], description: 'kanban : colonne des couloirs horizontaux ; null la retire' },
  retour_ligne: { type: 'boolean', description: 'tableau : le texte long passe à la ligne au lieu d’être coupé' },
  largeurs: { type: ['object', 'null'], additionalProperties: { type: 'number' }, description: 'tableau : largeur des colonnes en pixels, { colonne: px } ; null les retire' },
  calculs: { type: ['object', 'null'], additionalProperties: { type: 'string', enum: [...CALCULS] }, description: 'tableau : calcul en pied de colonne, { colonne: calcul } ; null les retire' },
  champ_debut: { type: 'string', description: 'calendrier, timeline : colonne date' },
  champ_fin: { type: ['string', 'null'], description: 'calendrier, timeline : colonne date de fin (facultative) ; null la retire' },
  ...COULEUR,
  champs_jalons: { type: 'array', items: { type: 'string' }, description: 'timeline : colonnes date affichées en losanges sur la barre' },
  noms_jalons: { type: 'boolean', description: 'timeline : afficher le nom de la colonne à côté de chaque losange' },
  echelle: { type: 'string', enum: ['semaine', 'mois', 'trimestre'], description: 'calendrier : mois ou semaine ; timeline : semaine, mois ou trimestre' },
  deplier: {
    type: ['array', 'null'],
    items: NIVEAU,
    description:
      'timeline en arbre : sous chaque ligne, les lignes liées par une relation, niveau par niveau (un projet, ses versions, leurs jalons). Remplace les niveaux existants ; null ou [] les retire.',
  },
  bandes: {
    type: ['array', 'null'],
    items: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id ou nom de la base dont les lignes deviennent des bandes' },
        champ_debut: { type: 'string', description: 'colonne date de cette base (par défaut : sa première date)' },
        champ_fin: { type: 'string', description: 'colonne date de fin (facultative)' },
        ...COULEUR,
      },
      required: ['base'],
    },
    description:
      "timeline : les lignes d'autres bases (moratoires, congés, sprints…) en bandes verticales qui traversent toute la timeline. Remplace les sources existantes ; null ou [] les retire.",
  },
}

/** Réglages d'une vue propre dans une opération : `largeurs` y désigne celle des blocs. */
const { largeurs: _largeurs, ...REGLAGES_VUE_BLOC } = REGLAGES_VUE

const TEINTE = `${COULEURS.join(', ')}, #rrggbb, vide (gris) ou aucune (contour)`

const SOURCE_FRISE = (quoi: string) => ({
  type: 'object',
  properties: { donnees: { type: 'string' }, sql: { type: 'string' }, date: { type: 'string' }, debut: { type: 'string' }, fin: { type: 'string' }, libelle: { type: 'string' }, ligne: { type: 'string' }, couleur: { type: 'string' } },
  description: `frise : ${quoi}`,
})

/** Réglages des blocs de fiche (spec §10 « Fiches ») : colonnes du résultat, sauf mention. */
const REGLAGES_FICHE = {
  sous_titre: { type: 'string', description: 'entete : colonne du sous-titre' },
  etat: { type: 'string', description: 'entete : nom d’un état du dashboard (pastille et raison)' },
  date: { type: 'string', description: 'compte_a_rebours : colonne date (la plus proche à venir) ; etapes : date de chaque case' },
  libelle: { type: 'string', description: 'compte_a_rebours, frise : colonne du libellé' },
  seuils: { type: 'array', items: { type: 'number' }, description: 'compte_a_rebours : [rouge sous N jours, orange sous M], défaut [8, 31]' },
  vide: { type: 'string', description: 'compte_a_rebours, liste, frise : texte quand il n’y a rien' },
  element: { type: 'string', description: 'etapes : colonne de l’élément (une ligne par élément et par étape)' },
  etape: { type: 'string', description: 'etapes : colonne du nom de l’étape' },
  statut: { type: 'string', description: 'etapes : colonne du statut, coloré par `couleurs`' },
  groupe: { type: 'string', description: 'etapes : colonne qui regroupe les éléments' },
  detail_groupe: { type: 'string', description: 'etapes : colonne affichée à côté du groupe' },
  etapes: { type: 'array', items: { type: ['string', 'object'] }, description: 'etapes : ordre des étapes, noms ou { nom, court }' },
  couleurs: { type: ['string', 'object'], description: `etapes, liste, repartition, frise : nom d’une table de couleurs du dashboard, ou { valeur: couleur } (${TEINTE})` },
  detail: { type: 'string', description: 'liste : colonne du texte secondaire' },
  pastille: { type: 'string', description: 'liste : nom d’un état du dashboard, ou colonne colorée par `couleurs`' },
  garder: { type: 'string', description: 'liste : condition SQL des lignes montrées d’abord ; les autres sont repliées en « N autres »' },
  tri: { type: 'string', description: 'liste : ordre SQL (order by) des lignes' },
  max: { type: 'integer', description: 'liste : lignes montrées au plus, le reste replié' },
  ordre: { type: 'array', items: { type: 'string' }, description: 'repartition : ordre des valeurs dans la barre' },
  ligne: { type: 'string', description: 'frise : colonne de la ligne (une ligne par valeur)' },
  debut: { type: 'string', description: 'frise : colonne date de début des barres' },
  fin: { type: 'string', description: 'frise : colonne date de fin' },
  categorie: { type: 'string', description: 'repartition : colonne des catégories ; frise : colonne colorée par `couleurs`' },
  previsionnel: { type: 'string', description: 'frise : colonne booléenne, barre en pointillés quand vraie' },
  jalons: SOURCE_FRISE('losanges { donnees | sql, date, libelle, ligne, couleur }'),
  periodes: SOURCE_FRISE('bandes hachurées { donnees | sql, debut, fin, libelle }'),
}

const COULEURS_DASHBOARD = { type: 'object', additionalProperties: { type: 'object', additionalProperties: { type: 'string' } }, description: `tables de couleurs nommées { nom: { valeur: couleur } }, citées par le réglage couleurs des blocs (${TEINTE})` }

const ENTREES_ETAT = {
  type: 'array',
  items: { type: 'object', properties: { si: { type: 'string', description: 'condition SQL sur les colonnes du résultat ; sans si : entrée par défaut' }, couleur: { type: 'string', description: TEINTE }, libelle: { type: 'string' }, raison: { type: 'string', description: 'texte affiché, peut citer {{colonne}}' } }, required: ['couleur'] },
  description: 'la première entrée vraie gagne',
}

/** Réglages d'un bloc d'analyse (spec §10 « Analyse ») ; `colonnes` est partagé avec les réglages de vue. */
const REGLAGES_ANALYSE = {
  titre: { type: 'string' },
  donnees: { type: 'string', description: 'analyse : nom d’une requête du dashboard (ou `sql`)' },
  sql: { type: 'string', description: 'analyse : requête propre au bloc, à la place de `donnees`. Tables : une par base (son id), colonnes = clés, + id, _cree, _modifie ; relation ou choix multiple = liste (unnest). {{parametre}} cite un paramètre' },
  x: { type: 'string', description: 'graphique : colonne des catégories (secteurs : libellé ; nuage : nombre)' },
  y: { type: ['string', 'array'], items: { type: 'string' }, description: 'graphique : colonne(s) de mesure' },
  serie: { type: 'string', description: 'graphique : colonne qui découpe en séries' },
  taille: { type: 'string', description: 'nuage : colonne de la taille des points' },
  valeur: { type: 'string', description: 'chiffre clé : colonne montrée (première ligne) ; valeur_parametre : la valeur choisie' },
  comparer: { type: 'string', description: 'chiffre clé : colonne de référence (écart et flèche)' },
  empile: { type: 'boolean' },
  horizontal: { type: 'boolean', description: 'barres horizontales' },
  format: { type: ['string', 'object'], description: `analyse : ${FORMATS.join(', ')} ; ou { colonne: format } pour un tableau` },
  regles: {
    type: 'array',
    items: { type: 'object', properties: { si: { type: 'string', description: "'> 50', '= Bloqué', '< objectif' (autre colonne)" }, couleur: { type: 'string', description: TEINTE }, colonne: { type: 'string', description: 'colonne testée (par défaut la mesure)' }, ligne: { type: 'boolean', description: 'tableau : colore la ligne entière' } }, required: ['si', 'couleur'] },
    description: 'analyse : mise en forme conditionnelle, la première règle remplie gagne',
  },
  texte: { type: 'string', description: 'bloc texte : Markdown ; {{requete.colonne}} cite la première ligne d’un résultat' },
  ...REGLAGES_FICHE,
}

const PARAMETRES = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      nom: { type: 'string', description: 'minuscules, chiffres, _ ; cité {{nom}} dans le SQL (période : {{nom.debut}}, {{nom.fin}})' },
      libelle: { type: 'string' },
      type: { type: 'string', enum: [...TYPES_PARAMETRE] },
      options: { type: ['array', 'string'], items: { type: 'string' }, description: 'choix : liste, ou nom d’une requête dont la 1re colonne donne les options' },
      defaut: { description: "mois : 'courant', 'precedent' ou AAAA-MM ; période : [début, fin]" },
      affichage: { type: 'string', enum: ['boutons'], description: 'choix : boutons au-dessus du dashboard (sélecteur de ligne d’une fiche), retenus sur la machine' },
      pastille: { type: 'string', description: 'boutons : nom d’un état du dashboard, évalué sur la requête des options, qui colore chaque bouton' },
    },
    required: ['nom', 'type'],
  },
  description: 'paramètres du dashboard, réglables en haut ; un paramètre sans valeur vaut NULL dans le SQL',
}

const BLOC = {
  type: 'object',
  description: 'bloc vue : { base, vue | vue_propre } ; bloc d’analyse : { type, donnees | sql, … } sans base',
  properties: {
    base: { type: 'string' },
    type: { type: 'string', enum: [...TYPES_VISUEL], description: 'bloc d’analyse : le visuel (valeur = chiffre clé, tableau = résultat SQL, texte = Markdown)' },
    ...REGLAGES_ANALYSE,
    vue: { type: 'string', description: 'id ou nom d’une vue de la base (par défaut : sa première)' },
    vue_propre: {
      type: 'object',
      properties: { nom: { type: 'string' }, type: { type: 'string', enum: [...TYPES_VUE] }, ...REGLAGES_VUE },
      required: ['nom'],
      description: 'à la place de vue : une vue gardée dans le dashboard, pas dans la base',
    },
    largeur: { type: 'number', description: 'en % de la rangée (10 à 90) ; sans : part égale du reste' },
  },
}

const HAUTEUR = { type: ['number', 'null'], description: 'hauteur des blocs de la rangée en pixels (160 à 2400) ; null : par défaut' }

const LIGNES_VISEES = {
  lignes: { type: 'array', items: { type: 'string' }, description: 'ids des lignes' },
  filtres: { type: 'array', items: FILTRE },
}

export const OUTILS: DefinitionOutil[] = [
  {
    nom: 'modifier_lignes',
    description:
      "Modifie des lignes existantes d'une base. Désigne les lignes par leurs ids (`lignes`), ou par des filtres (`filtres`, combinés en ET) pour toutes les lignes qui y correspondent.",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base' },
        lignes: { type: 'array', items: { type: 'string' }, description: 'ids des lignes à modifier' },
        filtres: { type: 'array', items: FILTRE },
        valeurs: VALEURS,
      },
      required: ['base', 'valeurs'],
    },
  },
  {
    nom: 'creer_lignes',
    description: 'Crée des lignes dans une base.',
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string', description: 'id de la base' },
        lignes: { type: 'array', items: VALEURS, description: 'une entrée par ligne à créer' },
      },
      required: ['base', 'lignes'],
    },
  },
  {
    nom: 'supprimer_lignes',
    description: "Supprime des lignes (leurs fichiers). Désigne-les par ids ou par filtres. Seulement si l'utilisateur demande une suppression.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, ...LIGNES_VISEES }, required: ['base'] },
  },
  {
    nom: 'ecrire_contenu',
    description:
      "Écrit le contenu (corps Markdown) de la page d'une ligne : ligne existante (id), ou ligne créée plus haut dans les mêmes appels (son titre). `mode` : remplacer (défaut) ou ajouter à la suite.",
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, ligne: { type: 'string' }, contenu: { type: 'string' }, mode: { type: 'string', enum: ['remplacer', 'ajouter'] } },
      required: ['base', 'ligne', 'contenu'],
    },
  },
  {
    nom: 'ajouter_remarque',
    description:
      "Note une remarque datée (la date du jour est ajoutée) dans la page d'une ligne, à la fin d'une section (`## Section`, créée si elle manque), sans toucher au reste de la page. Pour suivre ce qui se dit sur un projet, une version, un ticket.",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string' },
        ligne: { type: 'string', description: 'id de la ligne, ou titre d’une ligne créée dans les mêmes appels' },
        section: { type: 'string', description: 'titre de la section (celui que prévoit le contexte) ; sans section : en fin de page' },
        texte: { type: 'string', description: 'la remarque, en une ou deux phrases' },
      },
      required: ['base', 'ligne', 'texte'],
    },
  },
  {
    nom: 'creer_base',
    description: 'Crée une base (sa colonne titre « Titre » est créée d’office), avec ses colonnes éventuelles.',
    parametres: { type: 'object', properties: { nom: { type: 'string' }, colonnes: { type: 'array', items: COLONNE } }, required: ['nom'] },
  },
  {
    nom: 'ajouter_colonnes',
    description:
      'Ajoute des colonnes à une base. Relation : `cible` (crée aussi la colonne miroir). Rollup : `relation`, `champ`, `calcul`. Formule : `expression`. created / modified : date de création / de dernière modification de chaque ligne, tenue par l’app (lecture seule, filtrable comme une date). Les appels suivants peuvent remplir une colonne créée : désigne-la par son nom.',
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonnes: { type: 'array', items: COLONNE } }, required: ['base', 'colonnes'] },
  },
  {
    nom: 'ajouter_options',
    description:
      "Ajoute des options à une colonne select ou multiselect existante (avant d'y écrire une valeur qui n'y est pas), ou change la couleur d'options existantes (donne-les avec leur couleur).",
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, colonne: { type: 'string', description: 'clé ou nom de la colonne' }, options: { type: 'array', items: OPTION } },
      required: ['base', 'colonne', 'options'],
    },
  },
  {
    nom: 'retirer_option',
    description:
      "Retire une option d'une colonne select ou multiselect. Les lignes qui l'ont prennent l'option `remplacer_par` (une option existante), ou perdent la valeur sans elle.",
    parametres: {
      type: 'object',
      properties: {
        base: { type: 'string' },
        colonne: { type: 'string', description: 'clé ou nom de la colonne' },
        option: { type: 'string', description: "libellé de l'option à retirer" },
        remplacer_par: { type: 'string', description: 'libellé d’une autre option de la colonne, mise à la place dans les lignes (facultatif)' },
      },
      required: ['base', 'colonne', 'option'],
    },
  },
  {
    nom: 'renommer_colonne',
    description: 'Renomme une colonne (sa clé ne change pas).',
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonne: { type: 'string' }, nom: { type: 'string' } }, required: ['base', 'colonne', 'nom'] },
  },
  {
    nom: 'supprimer_colonne',
    description: "Supprime une colonne et son contenu dans toutes les lignes. Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, colonne: { type: 'string' } }, required: ['base', 'colonne'] },
  },
  {
    nom: 'creer_vue',
    description: 'Crée une vue dans une base : type, groupement, filtres, tris, colonnes masquées ; calendrier et timeline : dates, jalons, échelle, couleurs, et pour une timeline les niveaux dépliés par relation.',
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, nom: { type: 'string' }, type: { type: 'string', enum: [...TYPES_VUE] }, ...REGLAGES_VUE },
      required: ['base', 'nom'],
    },
  },
  {
    nom: 'modifier_vue',
    description: 'Modifie une vue existante (id ou nom) : nom, groupement, filtres, tris, colonnes masquées ; calendrier et timeline : dates, jalons, échelle, couleurs, niveaux dépliés.',
    parametres: { type: 'object', properties: { base: { type: 'string' }, vue: { type: 'string' }, nom: { type: 'string' }, ...REGLAGES_VUE }, required: ['base', 'vue'] },
  },
  {
    nom: 'supprimer_vue',
    description: "Supprime une vue (les lignes restent). Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { base: { type: 'string' }, vue: { type: 'string' } }, required: ['base', 'vue'] },
  },
  {
    nom: 'creer_dashboard',
    description:
      'Crée un dashboard : des rangées de 1 à 3 blocs côte à côte. Chaque bloc affiche une vue de la base (existante ou créée plus haut), une vue propre au dashboard réglée comme creer_vue, ou un bloc d’analyse : chiffre clé, graphique, tableau ou texte calculé par une requête SQL (DuckDB) sur les bases. Une fiche (une ligne choisie par des boutons : paramètre affichage boutons) se compose des blocs entete, compte_a_rebours, etapes, liste, repartition et frise, colorés par des états et des tables de couleurs du dashboard. Explore d’abord avec executer_sql ; chaque requête est exécutée avant d’être acceptée.',
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        requetes: { type: 'object', additionalProperties: { type: 'string' }, description: 'requêtes SQL nommées { nom: "select …" }, partagées par les blocs (donnees: nom)' },
        parametres: PARAMETRES,
        couleurs: COULEURS_DASHBOARD,
        etats: { type: 'object', additionalProperties: ENTREES_ETAT, description: 'états nommés { nom: [{ si, couleur, libelle, raison }] }, cités par etat et pastille' },
        rangees: {
          type: 'array',
          items: { type: 'object', properties: { blocs: { type: 'array', items: BLOC, minItems: 1, maxItems: 3 }, hauteur: HAUTEUR }, required: ['blocs'] },
          description: 'de haut en bas',
        },
      },
      required: ['nom'],
    },
  },
  {
    nom: 'modifier_dashboard',
    description:
      "Change un dashboard (id ou nom) par une liste d'opérations, faites dans l'ordre : chacune voit la mise en page laissée par les précédentes. Rangées et blocs se comptent à partir de 1, de haut en bas et de gauche à droite (la mise en page actuelle est dans la description de l'espace). Retirer un bloc : outil retirer_bloc.",
    parametres: {
      type: 'object',
      properties: {
        dashboard: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [...TYPES_OPERATION],
                description:
                  'renommer (nom) ; ajouter_bloc (nouveau, rangee, position) ; deplacer_bloc (rangee, bloc, puis vers_rangee et position, ou nouvelle_rangee) ; remplacer_bloc (rangee, bloc, par) ; deplacer_rangee (rangee, vers) ; hauteur (rangee, hauteur) ; largeurs (rangee, largeurs) ; modifier_vue (rangee, bloc, réglages comme modifier_vue : vue propre seulement) ; filtres (filtres et/ou filtres_rapides du dashboard) ; modifier_bloc (rangee, bloc, réglages d’analyse ; nouveau_type change le visuel ; null retire un réglage) ; requete (nom, sql ; sql null la retire) ; parametres (parametres : remplace la liste) ; valeur_parametre (nom, valeur ; null : défaut) ; couleurs (nom, table ; table null la retire) ; etat (nom, entrees ; entrees null le retire)',
              },
              nom: { type: 'string' },
              rangee: { type: 'integer', description: 'numéro de rangée ; ajouter_bloc sans rangee : nouvelle rangée en bas' },
              bloc: { type: 'integer', description: 'numéro du bloc dans la rangée' },
              position: { type: 'integer', description: 'place dans la rangée d’arrivée (par défaut : à la fin)' },
              vers_rangee: { type: 'integer', description: 'deplacer_bloc : rangée d’arrivée' },
              nouvelle_rangee: { type: 'integer', description: 'deplacer_bloc : le bloc part seul dans une nouvelle rangée insérée à cette place (comptée avant le déplacement)' },
              vers: { type: 'integer', description: 'deplacer_rangee : sa place une fois déplacée' },
              nouveau: BLOC,
              par: BLOC,
              hauteur: HAUTEUR,
              largeurs: { type: 'array', items: { type: ['number', 'null'] }, description: 'une par bloc de la rangée, en % (10 à 90) ; null : part égale' },
              ...REGLAGES_VUE_BLOC,
              ...REGLAGES_ANALYSE,
              colonnes: { type: 'array', items: { type: 'string' }, description: 'modifier_vue : ordre des colonnes ; modifier_bloc : colonnes d’un tableau d’analyse' },
              nouveau_type: { type: 'string', enum: [...TYPES_VISUEL], description: 'modifier_bloc : change le visuel' },
              parametres: PARAMETRES,
              table: { type: ['object', 'null'], additionalProperties: { type: 'string' }, description: `couleurs : { valeur: couleur } (${TEINTE})` },
              entrees: { ...ENTREES_ETAT, type: ['array', 'null'] },
              largeurs_colonnes: { ...REGLAGES_VUE.largeurs, description: 'modifier_vue : largeur des colonnes du tableau, { colonne: px } ; null les retire' },
              filtres_rapides: {
                type: 'array',
                items: { type: 'object', properties: { base: { type: 'string', description: 'type filtres : base de la pastille du dashboard' }, colonne: { type: 'string' }, operateur: FILTRE.properties.operateur, valeur: FILTRE.properties.valeur } },
                description: 'type filtres : remplacent les filtres rapides du dashboard, chacun avec sa base (sans colonne : choix de lignes de la base) ; modifier_vue : ceux de la vue propre ; [] les retire',
              },
              filtres: {
                type: 'array',
                items: { ...FILTRE, properties: { base: { type: 'string', description: 'type filtres : base filtrée (les autres blocs suivent leurs relations vers elle)' }, ...FILTRE.properties } },
                description: 'type filtres : remplacent les filtres du dashboard, chacun avec sa base ([] les retire) ; modifier_vue : remplacent ceux de la vue propre',
              },
            },
            required: ['type'],
          },
        },
      },
      required: ['dashboard', 'operations'],
    },
  },
  {
    nom: 'retirer_bloc',
    description: "Retire un bloc d'un dashboard (rangée et bloc comptés à partir de 1) ; une rangée vidée disparaît, la vue reste dans sa base. Seulement si l'utilisateur le demande.",
    parametres: {
      type: 'object',
      properties: { dashboard: { type: 'string' }, rangee: { type: 'integer' }, bloc: { type: 'integer' } },
      required: ['dashboard', 'rangee', 'bloc'],
    },
  },
  {
    nom: 'placer_base',
    description: 'Range une base dans un groupe de la barre latérale (créé s’il n’existe pas), ou hors groupe avec groupe: null. Ne déplace aucun fichier.',
    parametres: {
      type: 'object',
      properties: { base: { type: 'string' }, groupe: { type: ['string', 'null'], description: 'nom du groupe ; null : hors groupe' } },
      required: ['base', 'groupe'],
    },
  },
  {
    nom: 'supprimer_dashboard',
    description: "Supprime un dashboard (id ou nom). Seulement si l'utilisateur le demande.",
    parametres: { type: 'object', properties: { dashboard: { type: 'string' } }, required: ['dashboard'] },
  },
  {
    nom: 'supprimer_base',
    description:
      "Supprime une base entière (id ou nom) : son dossier, ses lignes, ses vues. Les relations d'autres bases vers elle deviennent du texte avec les titres liés. Seulement si l'utilisateur le demande explicitement.",
    parametres: { type: 'object', properties: { base: { type: 'string' } }, required: ['base'] },
  },
  {
    nom: 'retenir',
    description: "Retient un fait durable pour les prochaines conversations (préférence, vocabulaire, habitude). Jamais une valeur de ligne : elle est déjà dans les données.",
    parametres: { type: 'object', properties: { fait: { type: 'string', description: 'une phrase courte' } }, required: ['fait'] },
  },
  {
    nom: 'oublier',
    description: 'Retire un fait de la mémoire, cité exactement comme dans la section Mémoire.',
    parametres: { type: 'object', properties: { fait: { type: 'string' } }, required: ['fait'] },
  },
  {
    nom: 'creer_skill',
    description: "Crée ou remplace un skill : une procédure nommée que l'utilisateur pourra redemander. Seulement quand l'utilisateur demande explicitement de créer ou modifier un skill.",
    parametres: {
      type: 'object',
      properties: {
        nom: { type: 'string' },
        description: { type: 'string', description: 'une ligne : quand s’en servir' },
        instructions: { type: 'string', description: 'les étapes, en Markdown, avec les noms de bases et de colonnes' },
      },
      required: ['nom', 'description', 'instructions'],
    },
  },
  {
    nom: 'repondre',
    description: 'Répond sans rien modifier : demande ambiguë (poser une question courte), impossible, ou simple question.',
    parametres: { type: 'object', properties: { texte: { type: 'string' } }, required: ['texte'] },
  },
]

export const CONSIGNE = `Tu es l'assistant de mdbase : tu modifies les bases de données de l'utilisateur en appelant des outils.
Règles :
- Réponds uniquement par des appels d'outils.
- Lire avant d'agir ou de répondre : les lignes listées plus bas peuvent n'être qu'un extrait, avec des valeurs coupées, et le contenu des pages n'y est pas. Dès qu'il te manque une donnée (question sur les lignes, lignes à retrouver, contenu d'une page), appelle \`chercher_lignes\` (avec des filtres) ou \`lire_page\`, autant de fois que nécessaire : tu verras le résultat, puis tu continues. Ne réponds jamais d'après un extrait incomplet.
- Une fois tes lectures finies, envoie en une seule réponse TOUTES les modifications de la demande, jusqu'au bout, sans t'arrêter à la première étape.
- Utilise exactement les ids de bases, les clés de colonnes et les ids de lignes donnés plus bas. N'invente jamais un id, une colonne ou une option.
- Colonne à choix : le libellé exact d'une option existante (une liste pour un choix multiple).
- Relation : la liste des ids des lignes liées, dans la base cible.
- Dates au format AAAA-MM-JJ. Nombres en chiffres. Case à cocher : true ou false. null vide un champ.
- Les colonnes calculées sont en lecture seule.
- Pour modifier toutes les lignes qui répondent à un critère, utilise \`filtres\` plutôt qu'une liste d'ids.
- Structure : pour créer ou modifier des bases, colonnes, vues et dashboards, utilise leurs outils. Enchaîne dans les mêmes appels tout ce que la demande contient : créer une base puis y créer des lignes (désigne la nouvelle base par son nom), créer une colonne puis la remplir (désigne-la par son nom), créer des lignes puis écrire le contenu de leurs pages ou les relier depuis d'autres lignes (dans une relation, désigne une ligne créée par son titre). Une relation accepte aussi le titre d'une ligne existante, ou son premier mot s'il ne désigne qu'elle (la clé d'un ticket Jira) : pas besoin de lire son id. Ne t'arrête jamais après la structure si la demande parle aussi de lignes.
- Chercher un mot ou un sujet (« quels tickets parlent de… ») : \`chercher_texte\`, qui lit aussi le contenu des pages ; un filtre \`contient\` sur une colonne ne voit pas les pages.
- Jours nommés (« lundi », « vendredi prochain », « cette semaine ») : prends la date dans le calendrier plus bas, ne la calcule pas. « Vendredi prochain » : le vendredi de la semaine prochaine. \`avant\` et \`apres\` excluent le jour donné : « depuis lundi » se filtre avec \`apres\` la veille (le dimanche), ou \`cette_semaine\`.
- Base marquée LECTURE SEULE (synchronisée depuis Jira) : n'y propose jamais de modification ; dis-le avec \`repondre\`.
- Suppressions (lignes, colonnes, vues, dashboards, bases) : seulement quand l'utilisateur les demande explicitement, jamais pour « faire de la place » ou réorganiser ; l'utilisateur confirme toujours avant qu'elles soient faites.
- Si la demande est ambiguë ou impossible, appelle \`repondre\` avec une question courte, sans rien modifier.
- Mémoire : quand l'utilisateur te demande de retenir quelque chose, ou exprime une préférence durable, appelle \`retenir\` (en plus des autres appels). \`oublier\` quand il le demande. Tiens compte de la section Mémoire.
- Skills : si la demande correspond à un skill (par son nom ou sa description), suis ses instructions. N'appelle \`creer_skill\` que si l'utilisateur demande de créer ou modifier un skill.`

/** Au-delà, les lignes ne sont plus toutes listées : celles de la base ouverte et les plus proches de la demande. */
const LIGNES_MAX = 150
const LIGNES_BASE_OUVERTE = 60
const LONGUEUR_VALEUR = 60
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

function typeLisible(c: Colonne): string {
  switch (c.type) {
    case 'text':
      return 'texte'
    case 'number':
      return 'nombre'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'case à cocher'
    case 'url':
      return 'lien'
    case 'select':
      return `choix parmi [${c.options.map((o) => o.label).join(', ')}]`
    case 'multiselect':
      return `choix multiple parmi [${c.options.map((o) => o.label).join(', ')}]`
    case 'relation':
      return `relation vers ${c.cible}`
    default:
      return 'calculée (lecture seule)'
  }
}

function texteCellule(c: Cellule | undefined): string | null {
  if (!c || c.etat !== 'ok') return null
  const v = c.valeur
  const t = Array.isArray(v) ? `[${v.join(', ')}]` : String(v)
  return t.length > LONGUEUR_VALEUR ? `${t.slice(0, LONGUEUR_VALEUR)}…` : t
}

function decrireLigne(schema: Schema, l: LigneChargee, calculees: Record<string, Cellule> | undefined): string {
  const titre = texteCellule(l.cellules[schema.champTitre]) ?? 'Sans titre'
  const valeurs = schema.colonnes.flatMap((c) => {
    if (c.cle === schema.champTitre) return []
    const t = texteCellule(estSaisie(c) ? l.cellules[c.cle] : calculees?.[c.cle])
    return t === null ? [] : [`${c.cle}: ${t}`]
  })
  return `${l.id} | ${titre}${valeurs.length > 0 ? ` | ${valeurs.join(' ; ')}` : ''}`
}

export type OptionsContexte = {
  aujourdhui: string
  baseOuverte: string | null
  /** Bases citées avec `@` dans la demande : leurs lignes sont envoyées comme celles de la base ouverte. */
  basesCitees?: readonly string[]
  /** Lignes proches de la demande, les plus pertinentes d'abord (recherche plein texte). */
  candidats: readonly { base: string; ligne: string }[]
  memoire?: readonly string[]
  skills?: readonly Skill[]
}

const filtreLisible = (f: { colonne: string; operateur: string; valeur?: unknown }) => `${f.colonne} ${f.operateur}${f.valeur === undefined ? '' : ` ${JSON.stringify(f.valeur)}`}`

/** Réglages communs d'une vue, en clair : `modifier_vue` remplace ses listes, le modèle doit voir celles en place. */
function detailVue(v: Vue): string {
  const r = [
    v.filtres.length > 0 && `filtres [${v.filtres.map(filtreLisible).join(' ; ')}]`,
    v.filtresOu?.length && `filtres_ou [${v.filtresOu.map((g) => g.map(filtreLisible).join(' et ')).join(' | ')}]`,
    v.filtresRapides.length > 0 && `filtres rapides [${v.filtresRapides.map((p) => (p.operateur ? filtreLisible({ ...p, operateur: p.operateur }) : p.colonne)).join(' ; ')}]`,
    v.tris.length > 0 && `tris [${v.tris.map((t) => `${t.colonne} ${t.sens}`).join(', ')}]`,
    v.groupe && `groupe ${v.groupe}`,
    v.sousGroupe && `sous-groupe ${v.sousGroupe}`,
    v.ordre?.length && `colonnes [${v.ordre.join(', ')}]`,
    v.masquees?.length && `masquées [${v.masquees.join(', ')}]`,
    v.champsCarte?.length && `champs carte [${v.champsCarte.join(', ')}]`,
    v.sansTitre && 'sans titre',
    v.retourLigne && 'retour à la ligne',
  ].filter(Boolean)
  return r.length > 0 ? ` ; ${r.join(', ')}` : ''
}

/** Réglages d'une vue temporelle, en clair : pour la modifier sans repartir de zéro (niveaux dépliés compris). */
function detailTemps(v: Vue): string {
  if (v.type !== 'calendrier' && v.type !== 'timeline') return ''
  const niveau = (n: Niveau): string =>
    [
      `relation ${n.relation}`,
      n.champDebut && `début ${n.champDebut}`,
      n.champFin && `fin ${n.champFin}`,
      n.couleurPar && `couleur selon ${n.couleurPar}`,
      n.couleur && `couleur ${n.couleur}`,
      n.surLaLigne && 'sur la ligne du parent',
      n.sansTitre && 'sans titre',
      n.champsCarte?.length && `champs ${n.champsCarte.join(', ')}`,
      n.deplier.length > 0 && `puis ${n.deplier.map(niveau).join(' ; ')}`,
    ]
      .filter(Boolean)
      .join(', ')
  const r = [
    v.champDebut && `début ${v.champDebut}`,
    v.champFin && `fin ${v.champFin}`,
    v.champsJalons?.length && `jalons ${v.champsJalons.join(', ')}`,
    v.nomsJalons && 'noms des jalons affichés',
    v.couleurPar && `couleur selon ${v.couleurPar}`,
    v.couleur && `couleur ${v.couleur}`,
    v.deplier?.length && `déplie [${v.deplier.map(niveau).join(' | ')}]`,
    v.bandes?.length &&
      `bandes [${v.bandes.map((b) => [`base ${b.base}`, b.champDebut && `début ${b.champDebut}`, b.champFin && `fin ${b.champFin}`, b.couleurPar && `couleur selon ${b.couleurPar}`, b.couleur && `couleur ${b.couleur}`].filter(Boolean).join(', ')).join(' | ')}]`,
  ].filter(Boolean)
  return r.length > 0 ? ` : ${r.join(', ')}` : ''
}

/** Description de l'espace envoyée au modèle : schémas complets, puis les lignes utiles. */
export function decrireEspace(etat: EtatEspace, o: OptionsContexte): string {
  const bases = [...etat.bases.values()].flatMap((b) => (b.depot ? [{ id: b.id, schema: b.depot.schema, lignes: b.depot.lignes() }] : []))
  const parties: string[] = ['## Bases']
  for (const { id, schema } of bases) {
    parties.push(`${id} « ${schema.nom} »${schema.source ? ` (synchronisée depuis ${nomSource(schema.source.type)} : LECTURE SEULE)` : ''}`)
    for (const c of schema.colonnes) parties.push(`- ${c.cle} « ${c.nom} » : ${typeLisible(c)}${c.cle === schema.champTitre ? ' (titre de la ligne)' : ''}`)
    const vues = etat.bases.get(id)?.vues ?? []
    parties.push(`vues : ${vues.map((v) => `${v.id} « ${v.nom} » (${v.type}${detailTemps(v)}${detailVue(v)})`).join(', ')}`)
  }
  if (etat.dashboards.length > 0) {
    parties.push('', '## Dashboards (rangées de haut en bas, blocs de gauche à droite, comptés à partir de 1)')
    for (const d of etat.dashboards) {
      parties.push(`${d.id} « ${d.dashboard?.nom ?? d.id} »${d.dashboard ? '' : ' (fichier illisible)'}`)
      if (!d.dashboard) continue
      const bloc = (b: Bloc, j: number) => {
        if (estAnalyse(b)) return `${j + 1}. ${detailAnalyse(b)}${b.largeur ? `, largeur ${b.largeur} %` : ''}`
        const vue = estPropre(b) ? `vue propre « ${b.vue.nom} » (${b.vue.type}${detailTemps(b.vue)}${detailVue(b.vue)})` : `vue ${b.vue}`
        return `${j + 1}. ${b.base}, ${vue}${b.largeur ? `, largeur ${b.largeur} %` : ''}`
      }
      d.dashboard.rangees.forEach((r, i) => parties.push(`- rangée ${i + 1}${r.hauteur ? ` (hauteur ${r.hauteur} px)` : ''} : ${r.blocs.map(bloc).join(' | ')}`))
      if (d.dashboard.filtres.length > 0) parties.push(`- filtres : ${d.dashboard.filtres.map((f) => `${f.base}.${filtreLisible(f)}`).join(', ')}`)
      if (d.dashboard.filtresRapides.length > 0) parties.push(`- filtres rapides : ${d.dashboard.filtresRapides.map((p) => `${p.base}${p.colonne ? `.${p.colonne}` : ' (choix de lignes)'}`).join(', ')}`)
      for (const [nom, sql] of Object.entries(d.dashboard.requetes)) parties.push(`- requête ${nom} : ${sql.replace(/\s+/g, ' ').trim()}`)
      for (const [nom, table] of Object.entries(d.dashboard.couleurs)) parties.push(`- couleurs ${nom} : ${Object.entries(table).map(([v, c]) => `${v} ${c}`).join(', ')}`)
      for (const [nom, entrees] of Object.entries(d.dashboard.etats)) parties.push(`- état ${nom} : ${entrees.map((e) => `${e.si ? `si ${e.si}` : 'sinon'} → ${e.couleur}${e.libelle ? ` « ${e.libelle} »` : ''}`).join(' ; ')}`)
      if (d.dashboard.parametres.length > 0) {
        parties.push(`- paramètres : ${d.dashboard.parametres.map((p) => `${p.nom} (${p.type}${p.options ? `, options ${Array.isArray(p.options) ? p.options.join('/') : `de la requête ${p.options}`}` : ''}${p.affichage ? `, ${p.affichage}${p.pastille ? ` (état ${p.pastille})` : ''}` : ''}${p.defaut !== undefined ? `, défaut ${JSON.stringify(p.defaut)}` : ''}${p.valeur !== undefined ? `, valeur ${JSON.stringify(p.valeur)}` : ''})`).join(', ')}`)
      }
    }
    parties.push(
      '',
      "Blocs d'analyse et executer_sql : SQL DuckDB en lecture ; chaque base est une table nommée par son id, une colonne par clé (colonnes calculées comprises), plus id, _cree et _modifie (horodatages) ; une relation (ids liés) ou un choix multiple est une liste VARCHAR[] (unnest, list_contains) ; nombre DOUBLE, date DATE, case BOOLEAN ; un rollup en pourcentage vaut de 0 à 100 (le format pourcent attend un ratio : diviser par 100) ; la date du jour s'écrit {{aujourdhui}} (current_date et today() ne marchent pas).",
    )
  }
  // Mémoire et skills avant ce qui change à chaque demande : le début du message reste identique d'une demande à l'autre.
  if (o.memoire?.length) parties.push('', '## Mémoire', ...o.memoire.map((f) => `- ${f}`))
  if (o.skills?.length) {
    parties.push('', '## Skills')
    for (const s of o.skills) parties.push(`### ${s.nom}`, s.description, s.instructions)
  }
  parties.push('', `Aujourd'hui : ${o.aujourdhui} (${JOURS[jourSemaine(o.aujourdhui)]})`)
  // Les jours nommés (« lundi », « vendredi prochain ») se lisent ici plutôt que de se calculer : source d'erreurs.
  const lundi = lundiDe(o.aujourdhui)
  const semaine = (debut: string) => Array.from({ length: 7 }, (_, i) => decaler(debut, i)).map((j) => `${JOURS[jourSemaine(j)]} ${j}`).join(', ')
  parties.push(`Cette semaine : ${semaine(lundi)}`, `Semaine prochaine : ${semaine(decaler(lundi, 7))}`)
  if (o.baseOuverte) parties.push(`Base ouverte : ${o.baseOuverte}`)
  if (o.basesCitees?.length) parties.push(`Bases citées par l'utilisateur : ${o.basesCitees.join(', ')}`)

  const total = bases.reduce((n, b) => n + b.lignes.length, 0)
  const retenues = new Map<string, Set<string>>()
  if (total > LIGNES_MAX) {
    const retenir = (base: string, ligne: string) => retenues.set(base, (retenues.get(base) ?? new Set()).add(ligne))
    for (const c of o.candidats) retenir(c.base, c.ligne)
    for (const id of [o.baseOuverte, ...(o.basesCitees ?? [])]) {
      const b = bases.find((x) => x.id === id)
      for (const l of b?.lignes.slice(0, LIGNES_BASE_OUVERTE) ?? []) retenir(b!.id, l.id)
    }
  }
  parties.push('', `## Lignes (id | titre | valeurs)${total > LIGNES_MAX ? ` : EXTRAIT seulement, ${total} lignes au total ; chercher_lignes lit les autres` : ''}`)
  for (const { id, schema, lignes } of bases) {
    const choix = total > LIGNES_MAX ? lignes.filter((l) => retenues.get(id)?.has(l.id)) : lignes
    if (choix.length === 0) continue
    parties.push(`### ${id}`)
    for (const l of choix) parties.push(decrireLigne(schema, l, etat.calculs.get(id)?.get(l.id)))
  }
  return parties.join('\n')
}
