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
- Calendrier et timeline : champs affichés au choix (« Options »). Glisser fluide : la ligne suit le pointeur et s'accroche au jour le plus proche au relâcher (jours d'arrivée éclairés au calendrier, cadre pointillé dans la timeline).
- Timeline groupée (« Grouper par » dans Options) : groupes repliables, barre d'en-tête calculée sur les lignes du groupe, « + » pour créer dans un groupe. Date exacte affichée pendant un glisser (calendrier et timeline).
- Démo : colonnes Début et Revue client sur les projets, vue Planning (timeline) des projets ; colonne Début, vue Calendrier et vue Planning groupée par projet sur les tâches.
- Jalon 10 (formules) : colonne Formule (« + » des en-têtes, puis « Modifier la formule… » dans son menu), interpréteur maison sans exécution de code, fonctions des niveaux 1 et 2 de la spec, type du résultat déduit (nombre, texte, date, case) qui décide des filtres, tris, calculs de pied et rollups. Formule d'une formule, rollup d'une formule, boucles refusées à l'enregistrement.
- Éditeur de formules : on écrit avec les noms des colonnes (le fichier garde les clés), autocomplétion des colonnes et des fonctions, aide de la fonction en cours, erreur en français avec la partie fautive surlignée, aperçu du résultat sur une ligne de la base (‹ › pour changer de ligne), ⌘ Entrée pour enregistrer.
- Recalcul des colonnes calculées au changement de jour (formules avec `aujourdhui()`).
- Démo : formules Jours restants et Budget par heure (projets), Durée et En retard (tâches).
- Jalon 11 (dashboards) : section Dashboards en haut de la barre latérale (créer, renommer, supprimer), fichiers `_dashboards/<id>.yaml`. Un dashboard empile des rangées d'un ou deux blocs ; chaque bloc montre une vue d'une base, soit une vue existante de la base (partagée), soit une vue propre écrite dans le dashboard. Filtres rapides, options et ouverture des pages depuis chaque bloc, rangées déplaçables.
- Jalon 11 (recherche globale) : Ctrl+K ou ⌘K (ou « Rechercher » dans la barre latérale) cherche dans les titres, les champs texte et le corps des pages de toutes les bases, sans tenir compte des accents ni de la casse, avec les débuts de mots et les petites fautes. Résultats groupés par base avec un extrait surligné ; Entrée ou un clic ouvre la page dans sa base. Index en mémoire tenu à jour à chaque modification.
- Démo : dashboard « Pilotage ».
- Jalon 12 (robustesse synchro) : le dossier est relu au retour sur l'onglet, et à la demande depuis la barre latérale (« Relire le dossier »). Lignes modifiées, ajoutées ou supprimées ailleurs, schémas, vues, mises en page, dashboards, barre latérale et nouvelles bases apparaissent sans recharger la page ; une modification pas encore écrite reste affichée et s'écrit par-dessus la nouvelle version. Le corps d'une page ouverte suit un changement externe.
- Ids en double (copie de fichier, conflit OneDrive) : lignes marquées dans le tableau, bandeau « Comparer et choisir » qui montre les versions côte à côte (fichier, date, colonnes et contenu qui diffèrent). Garder une version (les autres fichiers sont supprimés) ou faire d'une copie une ligne à part, avec un nouvel id.
- Copies de conflit OneDrive des fichiers de réglages (`tableau-DESKTOP-AB12.yaml`) : jamais chargées, signalées dans la barre latérale, les deux textes côte à côte pour garder l'original ou la copie.
- Supprimer une ligne (menu ⋯ de la page), avec la proposition de retirer aussi les liens qui pointaient vers elle ; sinon ils restent, affichés comme liens cassés.
- « Retirer les liens cassés » dans le menu d'une colonne relation.
- Tests de bout en bout (Playwright, `npm run test:e2e`) : l'app dans Chrome sans fenêtre sur une copie neuve de la démo ; premiers tests sur la robustesse synchro (relecture, ids en double, copies de conflit, suppression et liens cassés).
- « Essayer avec la démo » sur l'accueil : la démo copiée dans le stockage du navigateur, sans rien installer ni choisir de dossier ; « Repartir d'une démo neuve » pour tout effacer.
- Publication open source (licence MIT, README) et version en ligne sur GitHub Pages, déployée après typage, tests et tests de bout en bout sur le build.

- Export d'une vue (menu « Exporter ») : ses lignes, filtres et tris appliqués, en tableau Markdown (copié ou téléchargé) ou en CSV (relisible par un tableur, BOM pour Excel, formules neutralisées), et la vue entière en image PNG, au-delà de la partie visible (timeline, tableau, kanban, calendrier, collection).
- Import CSV : nouvelle base (séparateur deviné, types devinés et modifiables avant l'import : nombre, date, case, lien, sélection) ou lignes ajoutées à une base existante (colonnes retrouvées par nom).
- Tests de bout en bout pour toutes les fonctionnalités des jalons 1 à 11 : écriture depuis le tableau (renommage, champs préservés, nombres, sélections, cases), relations et rollups, schéma (bases, groupes, colonnes), filtres et tris, formules, pages, kanban, timeline, calendrier, dashboards, recherche globale.
- Assistant IA, désactivé par défaut (spec §12, « Module IA ») : bouton « Assistant IA » ou Ctrl+J / ⌘J. L'activation affiche d'abord ce qui est envoyé et à qui ; l'utilisateur fournit l'adresse d'un service compatible OpenAI (distant ou local), sa clé et le modèle, gardés dans le navigateur. Une demande en français devient des modifications ou des créations de lignes, validées comme une saisie (colonnes, options, dates, lignes existantes), montrées en aperçu avant → après et appliquées seulement sur « Appliquer ». Un appel refusé est renvoyé une fois au modèle pour correction ; le temps de réponse est affiché.
- Assistant IA en conversation : on répond à ses questions, il relit les dix derniers échanges ; fil gardé par dossier dans le navigateur, « Nouvelle conversation » pour repartir de zéro. Services préréglés (OVH, Mistral, Ollama, LM Studio) et liste des modèles proposée par le service.
- Mémoire et skills de l'assistant, dans `_assistant/` du dossier (synchronisés avec les données, jamais affichés comme une base). Il retient une préférence quand on le lui dit (« Retenu : … », annulable) ; un skill est une procédure nommée créée à la demande, montrée en aperçu et écrite seulement sur « Appliquer ». Les deux sont listés dans les réglages de l'assistant, d'où on peut les retirer.
- Tableau, plusieurs lignes à la fois : sélection (case au survol, Maj+clic, tout sélectionner) et barre d'actions pour copier, dupliquer et supprimer (avec les liens vers elles en option) ; dans une sélection, une cellule modifiée l'est sur toutes. Échap vide la sélection, Suppr propose la suppression.
- Copier-coller dans un tableau : les lignes sélectionnées se copient en tableau Markdown et HTML ; un tableau Markdown, CSV ou copié d'un tableur se colle avec un aperçu, en-têtes reconnus ou valeurs rangées dans l'ordre des colonnes affichées.
- Plage de cellules tracée à la souris (ou Maj+clic), surlignée : la copier donne ses cases, Suppr les vide, coller un tableau dessus (ou dans une case en édition) remplace les valeurs après une confirmation qui dit ce qui sera écrasé.
- Annuler / rétablir (Ctrl+Z, Ctrl+Maj+Z) sur les données : cellules, lignes créées ou supprimées, actions en lot, collages, plans de l'assistant.
- Assistant IA : outils de structure (créer une base, ajouter, renommer ou supprimer des colonnes, créer, régler ou supprimer des vues avec filtres et tris, créer ou supprimer des dashboards), suppression de lignes et écriture du contenu des pages. Une colonne créée peut être remplie dans la même proposition ; les suppressions sont en rouge dans l'aperçu.
- Recopie d'une cellule : sa poignée, tirée vers le haut ou le bas, donne sa valeur aux lignes survolées.
- Logo « db » en mauve pastel (glyphes Geist Mono) : la flèche de Markdown prolonge la hampe du d. Icône d’onglet, icône iPhone et image de partage des liens.
- Supprimer une base (bouton ⋯ ou clic droit dans la barre latérale, et outil de l'assistant) : confirmation qui montre ce qui est touché ; les relations vers elle deviennent du texte avec les titres liés, les blocs de dashboard qui l'affichaient sont retirés.
- Tableau : pointillé qui défile autour de ce qui vient d'être copié, dès la copie (jusqu'à Échap), et reflet bref sur les cases touchées par un collage, une recopie, une action en lot, un Ctrl+Z ou l'assistant.
- Timeline en arbre : dans « Options », « Déplier par » coche les relations dont les lignes liées s'affichent sous chaque ligne, niveau par niveau (un projet, ses versions, leurs jalons). Chaque niveau a ses dates et ses filtres ; sans fin, des losanges ; une ligne sans dates prend une barre qui couvre ses descendants. Vue « Feuille de route » dans la démo.
- Dashboards : filtres et filtres rapides globaux, sur la base de son choix. Les blocs de cette base sont filtrés, ceux des autres bases suivent leurs relations (les tâches du projet choisi) ; une pastille « Projets » permet de cocher des projets.
- Mode consultation : une icône en haut à droite (ou Ctrl+E) passe l'espace en lecture seule, épuré : ne restent que la navigation, les onglets de vues, les filtres rapides et les pages en lecture. Le mode est gardé par le navigateur.

### Changed
- Nouveau design « Îlots » : le contenu flotte dans un panneau arrondi sur un fond teinté, la barre latérale se fond dans ce fond, onglets et filtres en pilules, pastilles arrondies, accent vert. Les couleurs passent par des variables CSS (`:root` de `app.css`).
- Icônes Lucide (embarquées dans le build) à la place des caractères Unicode : types de colonnes, vues, menus, fermer, chevrons, coches, cases à cocher.
- Contenu des pages dans la police de l'interface (l'éditeur imposait Noto Serif / Noto Sans).
- Glisser un en-tête de colonne réordonne la vue, plus le schéma (l'ordre du schéma sert aux nouvelles vues et aux pages).
- Couleur d'accent : le vert laisse place au noir et aux gris déjà utilisés (boutons principaux, sélection, cases cochées, barres de timeline).

### Fixed
- Accueil : « Essayer avec la démo » devient l'action principale ; avec un dossier mémorisé, l'écran « Rouvrir » garde la démo et « Ouvrir un autre dossier », et explique un refus d'autorisation du navigateur (auparavant le clic ne faisait rien).
- La démo est mémorisée par une marque et non par son dossier OPFS : relire ce dossier depuis IndexedDB faisait planter Chromium en navigation privée au rechargement.
- Une ligne créée par « + Nouvelle ligne » n'ouvrait pas toujours son titre en édition (la ligne s'affichait avant la demande d'édition).
- Les menus flottants restent dans la fenêtre (les panneaux Filtrer / Trier débordaient à droite).
- Les menus flottants (select, en-têtes) sont rendus hors du tableau : ils pouvaient apparaître décalés ou coupés dans les lignes.
