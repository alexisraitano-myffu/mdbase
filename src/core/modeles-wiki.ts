import { parseDocument } from 'yaml'
import { FichierIntrouvable, joindre, type AdaptateurFichiers } from './fichiers'
import { DOSSIER_WIKI } from './wiki'

// Modèles de page du wiki (spec §22) : une trame de départ pour une nouvelle
// page. Des modèles livrés avec l'app, et ceux de l'espace, rangés dans
// `_wiki/_modeles/` : un fichier Markdown par modèle, frontmatter `nom`
// (sinon le nom du fichier), corps = la trame.

export const DOSSIER_MODELES_WIKI = joindre(DOSSIER_WIKI, '_modeles')

export type ModeleWiki = {
  /** `livre:<nom>` pour un modèle de l'app, le chemin du fichier pour un modèle de l'espace. */
  id: string
  nom: string
  corps: string
}

export const MODELES_WIKI_LIVRES: readonly ModeleWiki[] = [
  {
    id: 'livre:procedure',
    nom: 'Procédure',
    corps: `## Objectif

## Quand l'utiliser

## Prérequis

- 

## Étapes

1. 

## Vérifier que c'est fait

- [ ] 

## En cas de problème
`,
  },
  {
    id: 'livre:application',
    nom: 'Fiche d’application',
    corps: `## À quoi elle sert

## Qui l'utilise

## Accès

- Adresse : 
- Comptes et droits : 

## Fonctionnement

## Contacts

- Responsable : 
- Support : 

## Liens utiles
`,
  },
  {
    id: 'livre:decision',
    nom: 'Décision',
    corps: `**Date :** 
**Statut :** proposée

## Contexte

## Options envisagées

1. 
2. 

## Décision

## Conséquences
`,
  },
  {
    id: 'livre:glossaire',
    nom: 'Glossaire',
    corps: `Un terme par titre, du plus courant au plus rare.

### Terme

Définition en une ou deux phrases.

**Voir aussi :** 
`,
  },
  {
    id: 'livre:compte-rendu',
    nom: 'Compte rendu',
    corps: `**Date :** 
**Participants :** 

## Ordre du jour

1. 

## Points abordés

## Décisions

- 

## Actions

- [ ] Qui, quoi, pour quand
`,
  },
]

/** Un fichier de `_wiki/_modeles/` : son `nom` (ou le nom du fichier) et sa trame. */
export function lireModeleWiki(chemin: string, texte: string): ModeleWiki {
  const fichier = chemin.split('/').at(-1)!.replace(/\.md$/, '')
  const m = /^﻿?---\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(texte)
  let nom = fichier
  if (m) {
    const doc = parseDocument(m[1] ?? '')
    const brut = doc.errors.length === 0 ? (doc.toJS() as Record<string, unknown> | null)?.nom : undefined
    if (typeof brut === 'string' && brut.trim() !== '') nom = brut.trim()
  }
  return { id: chemin, nom, corps: m ? texte.slice(m[0].length) : texte.replace(/^﻿/, '') }
}

/** Modèles de l'espace, triés par nom ; aucun si `_wiki/_modeles/` n'existe pas. */
export async function chargerModelesWiki(adaptateur: AdaptateurFichiers): Promise<ModeleWiki[]> {
  let entrees
  try {
    entrees = await adaptateur.lister(DOSSIER_MODELES_WIKI)
  } catch (e) {
    if (e instanceof FichierIntrouvable) return []
    throw e
  }
  const modeles: ModeleWiki[] = []
  for (const e of entrees) {
    if (e.type !== 'fichier' || !e.nom.endsWith('.md') || e.nom.startsWith('_')) continue
    const chemin = joindre(DOSSIER_MODELES_WIKI, e.nom)
    modeles.push(lireModeleWiki(chemin, await adaptateur.lire(chemin)))
  }
  return modeles.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}
