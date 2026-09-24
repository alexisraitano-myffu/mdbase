import { lireSchema, type Schema } from '../schema'

/** Schéma d'exemple de la spec §3, étendu à tous les types saisis. */
export const TEXTE_SCHEMA_PROJETS = `version: 1
id: projets
nom: Projets
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - cle: statut
    nom: Statut
    type: select
    options:
      - { label: À faire, couleur: gris }
      - { label: En cours, couleur: bleu }
      - { label: Terminé, couleur: vert }
  - { cle: echeance, nom: Échéance, type: date }
  - { cle: budget, nom: Budget, type: number }
  - { cle: urgent, nom: Urgent, type: checkbox }
  - cle: tags
    nom: Tags
    type: multiselect
    options: [perso, pro, client]
  - { cle: site, nom: Site, type: url }
  - { cle: client, nom: Client, type: relation, cible: clients, proprietaire: true, inverse: projets }
  - { cle: taches, nom: Tâches, type: relation, cible: taches, proprietaire: false, inverse: projet }
  - { cle: nb_taches, nom: Nb tâches, type: rollup, relation: taches, champ: statut, calcul: compter }
  - { cle: jours_restants, nom: Jours restants, type: formula, expression: 'ecart_jours(aujourdhui(), prop("echeance"))' }
`

export function schemaProjets(): Schema {
  const { schema } = lireSchema(TEXTE_SCHEMA_PROJETS, 'projets')
  if (!schema) throw new Error('fixture invalide')
  return schema
}
