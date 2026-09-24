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
- Jalon 5 (filtres, tris, filtres rapides) : vues enregistrées dans `_vues/*.yaml` (onglets : créer, renommer, supprimer), vue tableau implicite écrite à sa première modification.
- Filtres combinés en ET avec tous les opérateurs de la spec (texte insensible à la casse et aux accents, dates relatives, « aujourd'hui » comme valeur d'avant/après), tris multiples (vides en bas, select dans l'ordre de ses options), indicateur de tri dans l'en-tête.
- Filtres rapides en pastilles : une colonne épinglée au-dessus du tableau (« + Filtre rapide »), réglée directement depuis sa pastille (opérateur + valeur), enregistrée dans la vue ; une pastille non réglée ne filtre rien.
- Création de ligne : valeurs héritées des filtres de la vue et des pastilles réglées (spec §8) ; une ligne créée ou modifiée reste visible sur fond jaune jusqu'au prochain changement de vue ou de filtres.
- Jalon 6 (relations et rollups) : colonnes Relation (vers une autre base, colonne miroir créée automatiquement) et Rollup (16 calculs, rollups de rollups) depuis le « + » des en-têtes.
- Cellule relation : titres des lignes liées en pastilles, menu de recherche pour lier ou délier, depuis l'un ou l'autre côté ; liens cassés signalés et retirables.
- Rollups affichés selon leur résultat (nombres à la française, pourcentages, dates, pastilles), filtrables et triables comme une colonne saisie.
- Boucles de dépendances refusées à la configuration avec les noms des colonnes ; colonnes dont la source a été supprimée affichées en erreur.
- Supprimer une relation (de n'importe quel côté) retire les deux colonnes et tous les liens.
- Réglages d'un rollup modifiables après création (relation, colonne remontée, calcul) depuis le menu de la colonne, avec refus des boucles.
- Espace de démonstration reconstruit : Clients → Projets → Tâches, avec rollups de rollups (heures et avancement moyen par client).
- Jalon 7 (pages) : bouton « Ouvrir » au survol du titre d'une ligne, page en panneau à droite ou en plein écran, Échap pour fermer, ↑ ↓ pour passer à la ligne précédente ou suivante de la vue.
- Page : titre éditable (fichier renommé à la sortie), propriétés éditables comme dans le tableau, propriétés masquées dépliables, corps en Markdown avec un éditeur visuel (menu « / », poignées de blocs).
- Mises en page (`_pages/*.yaml`) : affichage de chaque champ (visible, masqué si vide, masqué), ordre, relations en onglet, corps dans son onglet ; plusieurs mises en page par base, une par défaut, une retenue par vue.
- Panneau de page étirable par son bord gauche, largeur retenue par le navigateur ; sans onglet dédié, le contenu reste sous les onglets quel que soit l'onglet actif.
- Onglets relation : tableau des lignes liées, dont le « + » crée une ligne déjà liée ; on peut ouvrir une ligne liée depuis l'onglet.
- Jalon 8a (tableau complet) : colonnes affichées et ordre propres à chaque vue (glisser un en-tête, « Masquer dans cette vue », panneau Options), largeurs enregistrées dans la vue, retour à la ligne dans les cellules.
- Calculs en pied de colonne (somme, moyenne, comptes, % cochées, dates…) et par groupe.
- Groupement du tableau (select, case, multiselect, relation, texte) : groupes repliables, « + » par groupe qui reprend la valeur du groupe.
- Jalon 8b : vues Kanban (colonnes selon un select, une case, une relation ou un multiselect ; couloirs optionnels ; glisser une carte change sa valeur ; « + Nouvelle » par colonne) et Collection (grille de cartes, début du contenu en option). Champs de carte au choix, carte cliquable pour ouvrir la page. Choix du type au « + » des onglets.
- Onglets de vues réordonnables par glisser-déposer ; l'ordre est gardé dans `_schema.yaml` (clé `vues`), une nouvelle vue prend le dernier onglet.
- Jalon 9 : vue Calendrier (mois ou semaine, plages du champ de date au champ de fin, glisser une ligne change sa date, étirer son bord droit change sa fin, « + » sur un jour crée une ligne à cette date) et vue Timeline (barres du début à la fin, jalons en losanges, zoom semaine / mois / trimestre, barres déplaçables et étirables à la souris, ligne sans date placée d'un clic sur sa rangée, repère d'aujourd'hui). Réglages dans « Options » et dans les fichiers de vue (`champ_debut`, `champ_fin`, `champs_jalons`, `echelle`).
- Démo : colonnes Début et Revue client sur les projets, vue Planning (timeline) et vue Calendrier des tâches.
### Changed
- Glisser un en-tête de colonne réordonne la vue, plus le schéma (l'ordre du schéma sert aux nouvelles vues et aux pages).
### Fixed
- Les menus flottants restent dans la fenêtre (les panneaux Filtrer / Trier débordaient à droite).
- Les menus flottants (select, en-têtes) sont rendus hors du tableau : ils pouvaient apparaître décalés ou coupés dans les lignes.
