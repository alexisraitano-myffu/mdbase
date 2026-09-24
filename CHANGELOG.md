# Changelog

Toutes les modifications notables de ce projet sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]
### Added
- Jalon 1 (socle) : projet Vite + React + TypeScript strict, cœur isolé du navigateur (tsconfig sans DOM + test d'architecture sur les imports).
- Interface `AdaptateurFichiers` avec une implémentation en mémoire (tests) et une implémentation File System Access (Chrome, Edge).
- Ouverture d'un dossier d'espace, mémorisation du dossier dans IndexedDB (seule la permission est redemandée), message clair sur les navigateurs non compatibles, liste des bases du dossier.
- Espace de démonstration dans `exemples/espace-demo/`.
- Jalon 2 (lecture/écriture) : lecture tolérante du schéma et des lignes (valeurs invalides gardées et signalées, champs inconnus conservés, fichiers non reconnus listés, BOM et fins de ligne Windows acceptés).
- Réécriture d'une ligne qui ne touche qu'aux clés modifiées (commentaires, champs inconnus, corps et fins de ligne préservés), nouveaux champs insérés dans l'ordre du schéma, champs vides omis, colonnes calculées jamais écrites.
- Écriture sûre : si le fichier a changé sur le disque depuis la lecture, seule la modification demandée est réappliquée sur la version du disque.
- Génération d'identifiants et noms de fichiers `<slug>--<id>.md`.
- Résumé de chaque base à l'ouverture d'un dossier (lignes, fichiers non reconnus, valeurs invalides).
- Jalon 3 (tableau minimal) : barre latérale des bases, vue tableau virtualisée avec colonnes redimensionnables, édition dans les cellules pour text, number (saisie à la française), date, checkbox, select, multiselect et url, valeurs invalides affichées avec ⚠.
- Bouton « + Nouvelle ligne » : fichier écrit immédiatement, titre en édition ; le fichier est renommé selon le titre à la sortie du champ.
- Sauvegarde instantanée : affichage immédiat, écritures regroupées par fichier (300 ms) et sérialisées, tout est écrit quand l'onglet passe en arrière-plan.
- Jalon 4 (gestion du schéma) : créer une base (dossier + schéma avec une colonne titre), la renommer (double-clic) ; groupes plats dans la barre latérale (créer, renommer, supprimer sans perdre les bases) et glisser-déposer des bases entre groupes.
- Colonnes : ajouter (nom + type), renommer, réordonner par glisser-déposer, utiliser comme titre (fichiers renommés), supprimer avec confirmation (nombre de lignes effacées, colonnes calculées dépendantes).
- Options de select créées à la volée depuis le menu de la cellule (« Chercher ou créer une option »).
### Changed
### Fixed
- Les menus flottants (select, en-têtes) sont rendus hors du tableau : ils pouvaient apparaître décalés ou coupés dans les lignes.
