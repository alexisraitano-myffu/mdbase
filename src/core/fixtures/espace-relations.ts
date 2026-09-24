import { lireSchema, type Schema } from '../schema'

// Trois bases reliées : clients ←→ projets ←→ tâches.
// Le côté propriétaire est celui qui stocke les ids : projets.client, taches.projet.

export const SCHEMA_CLIENTS = `nom: Clients
champ_titre: nom
colonnes:
  - { cle: nom, nom: Nom, type: text }
  - { cle: projets, nom: Projets, type: relation, cible: projets, proprietaire: false, inverse: client }
  - { cle: heures, nom: Heures totales, type: rollup, relation: projets, champ: heures, calcul: somme }
`

export const SCHEMA_PROJETS = `nom: Projets
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: client, nom: Client, type: relation, cible: clients, proprietaire: true, inverse: projets }
  - { cle: taches, nom: Tâches, type: relation, cible: taches, proprietaire: false, inverse: projet }
  - { cle: heures, nom: Heures, type: rollup, relation: taches, champ: heures, calcul: somme }
  - cle: ouvertes
    nom: Tâches ouvertes
    type: rollup
    relation: taches
    champ: statut
    calcul: compter
    filtre: { operateur: different_de, valeur: Terminé }
`

export const SCHEMA_TACHES = `nom: Tâches
champ_titre: titre
colonnes:
  - { cle: titre, nom: Titre, type: text }
  - { cle: projet, nom: Projet, type: relation, cible: projets, proprietaire: true, inverse: taches }
  - { cle: statut, nom: Statut, type: select, options: [À faire, Terminé] }
  - { cle: heures, nom: Heures, type: number }
  - { cle: fait, nom: Fait, type: checkbox }
  - { cle: echeance, nom: Échéance, type: date }
`

export function schemas(): Map<string, Schema> {
  return new Map(
    (
      [
        ['clients', SCHEMA_CLIENTS],
        ['projets', SCHEMA_PROJETS],
        ['taches', SCHEMA_TACHES],
      ] as const
    ).map(([id, texte]) => [id, lireSchema(texte, id).schema!]),
  )
}

/** Fichiers d'un espace de test complet, pour l'adaptateur en mémoire. */
export const FICHIERS_RELATIONS: Record<string, string> = {
  'clients/_schema.yaml': SCHEMA_CLIENTS,
  'clients/acme--c0000001.md': '---\nid: c0000001\nnom: Acme\n---\n',
  'clients/globex--c0000002.md': '---\nid: c0000002\nnom: Globex\n---\n',
  'projets/_schema.yaml': SCHEMA_PROJETS,
  'projets/navi--p0000001.md': '---\nid: p0000001\ntitre: Navi\nclient: c0000001\n---\n',
  'projets/sinam--p0000002.md': '---\nid: p0000002\ntitre: sinam\nclient: c0000001\n---\n',
  'projets/seul--p0000003.md': '---\nid: p0000003\ntitre: Seul\n---\n',
  'taches/_schema.yaml': SCHEMA_TACHES,
  'taches/a--t0000001.md': '---\nid: t0000001\ntitre: A\nprojet: p0000001\nstatut: À faire\nheures: 3\nfait: true\necheance: 2026-10-01\n---\n',
  'taches/b--t0000002.md': '---\nid: t0000002\ntitre: B\nprojet: p0000001\nstatut: Terminé\nheures: 5\necheance: 2026-09-01\n---\n',
  'taches/c--t0000003.md': '---\nid: t0000003\ntitre: C\nprojet: [p0000002, zzzzzzzz]\nheures: 2\n---\n',
}
