# SPEC — Base de données Markdown + YAML (nom provisoire)

> Document de référence pour Claude Code. Lire en entier avant toute implémentation.
> Les décisions marquées **[DÉCIDÉ]** ne se rediscutent pas sans validation d'Alex.
> Les éléments marqués **[PLUS TARD]** sont hors périmètre : ne pas les implémenter, mais ne pas fermer la porte.

---

## 1. Vision

Une application de bases de données relationnelles avec l'ergonomie de Notion, dont le **seul format de stockage** est un dossier de fichiers Markdown + YAML.

- L'utilisateur **ne voit et n'édite jamais les fichiers directement**. Tout passe par l'interface : bases, vues, pages. L'app crée et maintient les fichiers.
- Les fichiers restent lisibles, portables et synchronisables (OneDrive en priorité), sans serveur ni compte.
- Cible initiale : utilisateurs Windows frustrés par Excel et les outils existants, dossier synchronisé via OneDrive.
- **Local-first et sécurisé par simplicité** : aucune donnée ne quitte la machine (seule exception : le module IA, désactivé par défaut, voir §12), aucun code n'est exécuté depuis les données.

### Principes directeurs
1. **UX avant tout.** Le niveau d'ergonomie visé est celui des bases Notion. Le fond peut être simple, l'usage doit être fluide.
2. **Simplicité du périmètre.** On reproduit les 20 % de Notion qui font 80 % de la sensation. Tout le reste est coupé.
3. **Les fichiers sont la seule source de vérité.** Tout ce qui est calculé (relations inverses, rollups, formules) est recalculé, jamais stocké.
4. **Un changement = le moins de fichiers touchés possible**, pour limiter les conflits de synchronisation.

---

## 2. Périmètre V1

### Inclus
- Barre latérale : dashboards en haut, puis groupes de bases.
- Groupes **plats** (pas de sous-groupes) contenant des bases. Une base peut aussi être hors groupe.
- Création d'une base par un bouton.
- Types de colonnes : `text`, `number`, `date`, `checkbox`, `select`, `multiselect`, `url`, `relation`, `rollup`, `formula`.
- Relations bidirectionnelles entre bases différentes.
- Rollups sur n'importe quel champ de la base liée, rollups de rollups.
- Formules niveaux 1 et 2 (voir §6).
- Filtres, tris, groupements et calculs sur **toutes** les colonnes, calculées comprises, sans exception.
- Filtres rapides en haut de vue : des colonnes épinglées en pastilles, réglées en un clic.
- Création de ligne par un bouton `+`, avec héritage des filtres simples.
- Vues : tableau, kanban, collection, calendrier, timeline avec jalons.
- Dashboards : blocs de vues empilés verticalement, possibilité de deux blocs côte à côte.
- Page d'une ligne : ouverture en panneau à droite, option plein écran, mises en page enregistrées, onglets relation.
- Recherche globale.
- Sauvegarde instantanée de toute modification (données et configuration).

### [PLUS TARD]
Choix de cardinalité 1-n / n-n par l'utilisateur, auto-relations (relation d'une base vers elle-même), champs obligatoires, modèles de lignes, images et pièces jointes, import et export, dashboards en grille libre, formules manipulant des listes, mises en page déclenchées par règle, type de colonne `personne`, collaboration temps réel, version bureau Tauri, plugin Obsidian.

---

## 3. Format des fichiers [DÉCIDÉ]

### Arborescence

```
MonEspace/
  _espace.yaml
  _dashboards/
    pilotage.yaml
  _assistant/            (module IA, §12 ; absent tant qu'il ne sert pas)
    memoire.md
    skills/
      revue-du-lundi.md
    contexte.md          (§18)
    documents/
    inbox/
  projets/
    _schema.yaml
    _vues/
      tableau-principal.yaml
      kanban-statut.yaml
    _pages/
      defaut.yaml
      suivi.yaml
    navi--k2x9m4pq.md
    synapse--p4m1z8rt.md
  taches/
    _schema.yaml
    _vues/
    _pages/
    ...
```

Règles :
- **Toutes les bases sont à plat** à la racine de l'espace. Les groupes n'existent que dans `_espace.yaml`. Déplacer une base d'un groupe à un autre ne déplace aucun fichier.
- Tout fichier ou dossier préfixé par `_` est de la configuration.
- **Un fichier par vue, un fichier par mise en page, un fichier par dashboard**, pour que deux modifications de configuration distinctes ne touchent jamais le même fichier.
- `_assistant/` (module IA, §12) : jamais affiché comme une base.
  - `memoire.md` : ce que l'assistant retient, un fait par ligne de liste (`- …`) ; le reste du fichier est préservé.
  - `skills/<slug>.md` : une procédure nommée, frontmatter `nom` et `description`, corps en Markdown = les instructions.
  - `contexte.md`, `documents/`, `inbox/` : connaissance de l'assistant (§18).

### Identifiants
- Chaque ligne, base, vue, mise en page, dashboard et colonne possède un identifiant stable.
- Identifiant de ligne : 8 caractères `[a-z0-9]`, aléatoire, généré à la création, **jamais modifié**.
- Nom de fichier d'une ligne : `<slug-du-titre>--<id>.md`. Le slug est mis à jour quand le titre change (renommage du fichier), l'identifiant jamais.
- Le renommage du fichier se fait **à la sortie du champ titre**, jamais à chaque frappe : chaque renommage est vu par la synchro comme une suppression suivie d'une création.
- **Toute résolution passe par l'`id` du frontmatter**, jamais par le nom de fichier. Un fichier renommé à la main ou par la synchro reste valide.
- Identifiant de base : fixé à la création, égal au nom du dossier, **jamais modifié**. Renommer une base ne change que son `nom` affiché : aucun dossier renommé, aucune référence (`cible`, `_espace.yaml`, dashboards) réécrite. Même logique que les colonnes (§3, `_schema.yaml`).

### `_espace.yaml`

```yaml
version: 1
barre_laterale:
  dashboards: [pilotage]
  groupes:
    - nom: Travail
      bases: [projets, taches, clients]
    - nom: Perso
      bases: [lectures]
  hors_groupe: [inbox]
```

### `_schema.yaml`

```yaml
version: 1
id: projets
nom: Projets
champ_titre: titre
colonnes:
  - cle: titre
    nom: Titre
    type: text
  - cle: statut
    nom: Statut
    type: select
    options:
      - { label: À faire, couleur: gris }
      - { label: En cours, couleur: bleu }
      - { label: Terminé, couleur: vert }
  - cle: echeance
    nom: Échéance
    type: date
  - cle: client
    nom: Client
    type: relation
    cible: clients
    proprietaire: true          # ce côté stocke le lien
    inverse: projets            # clé de la colonne miroir dans la base cible
  - cle: taches
    nom: Tâches
    type: relation
    cible: taches
    proprietaire: false         # lien stocké côté taches, calculé ici
    inverse: projet
  - cle: nb_taches_ouvertes
    nom: Tâches ouvertes
    type: rollup
    relation: taches
    champ: statut
    calcul: compter_valeurs
    filtre: { operateur: different_de, valeur: Terminé }   # optionnel
  - cle: jours_restants
    nom: Jours restants
    type: formula
    expression: "ecart_jours(aujourdhui(), prop(\"echeance\"))"
```

Règles :
- `vues` (optionnel) : ordre des onglets de vues de la base ; les vues non citées suivent, par nom de fichier. Réordonner les onglets ne modifie que ce fichier.
- **La `cle` d'une colonne est fixée à la création et ne change jamais.** Renommer une colonne modifie seulement `nom`. Aucune réécriture de fichiers de lignes.
- La clé est un slug `snake_case` dérivé du nom à la création, dédoublonné si nécessaire.
- **La clé `id` est réservée** à l'identifiant de ligne, caché et géré automatiquement. Une colonne dont le slug donnerait `id` (ex. une colonne nommée « Id ») reçoit une clé dédoublonnée (`id_2`).
- **Colonne titre** : chaque base a toujours une colonne titre (`champ_titre`), de type `text`. L'utilisateur peut **choisir** quelle colonne `text` sert de titre, et la **déplacer** librement dans l'ordre des colonnes comme n'importe quelle autre. Changer de colonne titre renomme les fichiers de la base (nouveau slug) : action rare, explicite, faite par lot.

### Fichier d'une ligne

```markdown
---
id: k2x9m4pq
titre: Navi
statut: En cours
echeance: 2026-10-15
client: c7ab3kx1
---
Le corps de la page, en Markdown libre.
```

Règles d'écriture :
- **Ne sont écrits que les champs saisis.** Jamais de rollup, de formule ni de relation non propriétaire dans un fichier.
- Un champ vide est **omis** du frontmatter (pas de `null`, pas de chaîne vide).
- L'ordre des clés suit l'ordre du schéma.

Encodage des valeurs :

| Type | Stockage |
|---|---|
| `text` | chaîne |
| `number` | nombre |
| `date` | `YYYY-MM-DD` ou `YYYY-MM-DDTHH:mm` (ISO 8601, heure locale) |
| `checkbox` | `true` / `false` (omis si faux) |
| `select` | label en clair (`En cours`) |
| `multiselect` | liste de labels |
| `url` | chaîne |
| `relation` (propriétaire) | un id, ou une liste d'ids |

- Les options de `select` sont stockées **en clair** pour la lisibilité. Renommer une option réécrit les fichiers qui l'utilisent : action rare, explicite, faite par lot.

---

## 4. Robustesse et lecture tolérante [DÉCIDÉ]

L'app écrit strictement, mais **lit avec tolérance**, car un fichier peut avoir été modifié à la main ou abîmé par la synchro.

- Un champ inconnu du schéma est **conservé** à la réécriture, jamais supprimé.
- Une valeur invalide (texte dans un `number`, option inexistante) est affichée telle quelle avec un indicateur d'avertissement, jamais effacée.
- Un fichier `.md` sans frontmatter ou sans `id` dans un dossier de base : ignoré en V1 et signalé dans une liste de fichiers non reconnus. Pas d'import automatique.
- Un id en double (copie de fichier, conflit OneDrive) : les deux lignes sont affichées, marquées en conflit, l'utilisateur choisit.
- Un lien de relation vers un id introuvable : affiché comme lien cassé, conservé dans le fichier.
- Les fichiers de conflit OneDrive (`nom-PC.md`, etc.) sont détectés et signalés.
- **Écriture sûre face aux changements externes** : avant d'écrire un fichier, l'app compare sa date de modification à celle de la dernière lecture. Si elle a changé, l'app relit le fichier, réapplique uniquement le champ que l'utilisateur vient de modifier, puis écrit. Pas d'écran de conflit en V1.
- **La réécriture d'un fichier préserve son formatage** : utiliser l'API `Document` de la librairie `yaml` (eemeli/yaml) pour modifier le frontmatter sans toucher au reste, commentaires compris.

Précisions d'implémentation (jalon 12) :
- Id en double : les lignes restent affichées (les liens et les calculs vont vers la première lue). L'utilisateur choisit : garder une version (les autres fichiers sont supprimés, après confirmation) ou faire d'une version une ligne à part (nouvel id, nouveau nom de fichier ; la nouvelle est écrite avant que l'ancienne soit effacée).
- Copie de conflit : un fichier `<nom>-<SUFFIXE>.<ext>` à côté de `<nom>.<ext>`, où le suffixe contient une majuscule (nom de machine ajouté par OneDrive ; les noms fabriqués par l'app n'en ont jamais). Une copie d'un fichier de configuration n'est jamais chargée ; elle est signalée, et l'utilisateur garde l'original ou la copie. Une copie d'une ligne se voit comme un id en double.
- Suppression d'une ligne : le nettoyage des liens qui pointaient vers elle est proposé (case cochée par défaut dans la confirmation), jamais fait en silence. Si un autre fichier porte le même id, les liens restent.

---

## 5. Relations et rollups [DÉCIDÉ]

C'est la fonctionnalité prioritaire. Elle doit être solide et parfaitement intégrée.

### Relations
- Toujours **bidirectionnelles** : créer une relation crée automatiquement la colonne miroir dans la base cible.
- **Stockage d'un seul côté** : le côté `proprietaire: true` écrit les ids. L'autre côté est calculé à partir de l'index.
- Choix du propriétaire à la création : **en V1, le côté où la relation a été créée.**
  - [PLUS TARD] avec la cardinalité configurable : si une des deux colonnes est mono-valeur (1-n), le propriétaire sera le côté « n » (ex. la tâche porte son projet).
- En V1, **toutes les relations sont multi-valeurs** côté propriétaire (liste d'ids). La cardinalité configurable est [PLUS TARD] mais le modèle doit l'absorber sans migration.
- **Édition depuis le côté non propriétaire** : l'utilisateur ajoute ou retire un lien normalement ; l'app traduit l'action en écriture dans le fichier du propriétaire. Un lien ajouté ou retiré = **un seul fichier modifié**.
- Pas d'auto-relation en V1 : la cible d'une relation doit être une autre base.
- Supprimer une ligne : les liens qui pointaient vers elle deviennent des liens cassés (§4). Proposer un nettoyage, ne pas réécrire silencieusement.

### Suppressions de colonnes et de bases [DÉCIDÉ]
- **Supprimer une colonne saisie** supprime son contenu : la clé est retirée de tous les fichiers de la base. Exception assumée au principe « le moins de fichiers touchés », comme le renommage d'une option de `select`.
- **Supprimer une relation** supprime seulement la relation : la colonne et sa colonne miroir disparaissent, les ids sont retirés des fichiers du côté propriétaire. Les lignes des deux bases restent intactes.
- **Supprimer une base** vers laquelle pointaient des relations : dans chaque base qui pointait vers elle, la colonne relation est convertie en colonne `text` contenant les titres des lignes liées (séparés par des virgules). Aucune donnée perdue.
  - Depuis le bouton ⋯ de la base dans la barre latérale (ou le clic droit), qui propose aussi de la renommer. La confirmation dit tout ce qui est touché : nombre de lignes, relations converties, colonnes calculées qui passeront en erreur, blocs de dashboard retirés. Ne s'annule pas (hors Ctrl+Z, comme le schéma).
  - Ordre : relations converties, blocs de dashboard retirés, puis le dossier effacé en commençant par `_schema.yaml`. Une coupure laisse un dossier qui n'est plus une base, jamais une base à moitié vide.
- **Colonnes dépendantes** (rollups, formules qui utilisent ce qu'on supprime) : la liste est affichée au moment de la confirmation, et ces colonnes passent en erreur. Pas de suppression en cascade.

### Dupliquer une base [DÉCIDÉ, demandé par Alex le 01/10/2026]
- Depuis le ⋯ de la base (ou le clic droit). Nouveau dossier `<id>-copie`, nommé « <nom> (copie) », placé juste après l'original dans son groupe.
- Lignes, vues et mises en page copiées telles quelles (champs inconnus et corps compris). Les ids de ligne sont gardés : ils sont propres à une base, et les vues de la copie qui citent des lignes restent justes.
- Relations : chaque relation de la copie devient **propriétaire** et reçoit sa propre colonne miroir dans la base reliée (« Projets (copie) » dans Clients). Les liens d'un côté non propriétaire, calculés dans l'original, sont écrits dans les lignes de la copie. L'original et ses liens ne changent pas.
- Ordre : fichiers de la copie, puis son `_schema.yaml`, puis les colonnes miroirs. Une coupure avant le schéma laisse un dossier qui n'est pas encore une base.

### Rollups
- Un rollup référence une colonne `relation` de sa base et une colonne (`champ`) de la base liée.
- **N'importe quelle colonne** de la base liée peut être remontée, y compris un rollup ou une formule.
- Calculs disponibles :
  - `afficher` (valeurs brutes), `afficher_uniques` (chaque valeur une fois, dans l'ordre d'apparition) [DÉCIDÉ, demandé par Alex le 01/10/2026]
  - `compter`, `compter_valeurs`, `compter_uniques`, `compter_vides`, `compter_non_vides`
  - `pourcent_coches`, `pourcent_non_coches`
  - `somme`, `moyenne`, `mediane`, `min`, `max`, `amplitude`
  - `date_plus_tot`, `date_plus_tard`
- Filtre optionnel sur les lignes liées avant calcul (ex. ne compter que les tâches non terminées).
- **Rollups de rollups autorisés**, sans limite de profondeur.
- Le résultat d'un rollup a un type (nombre, date, liste…) et se comporte **exactement comme une colonne saisie** pour les filtres, tris, groupements et calculs.
- Un rollup qui affiche des valeurs les montre **comme sa colonne d'origine**, au bout de la chaîne des rollups de rollups : les titres des lignes d'une relation (jamais leurs ids), les pastilles colorées d'un select, les dates au format court.
- **Grouper par un rollup** qui affiche des valeurs (tableau, timeline) : une ligne apparaît dans le groupe de chacune de ses valeurs, comme pour un multiselect, avec les titres ou les couleurs de la colonne d'origine. Un rollup ne s'écrit pas : une ligne créée dans un tel groupe n'en reçoit pas la valeur, et le kanban, dont les déplacements écrivent, ne propose pas les rollups.

### Graphe de dépendances et boucles
- Toutes les colonnes calculées (relations inverses, rollups, formules) forment un graphe de dépendances.
- Le calcul se fait en **ordre topologique**.
- **Toute configuration qui créerait une boucle est refusée au moment de la configuration**, avec un message clair nommant les colonnes impliquées. Jamais d'erreur au calcul.

---

## 6. Formules

Une formule est une colonne calculée comme les autres, intégrée au même graphe de dépendances que les rollups.

### Niveau 1
- Références : `prop("cle")` (l'éditeur affiche les noms, stocke les clés).
- Arithmétique : `+ - * / %`, parenthèses.
- Comparaisons : `== != < <= > >=`, logique `et`, `ou`, `non`.
- `si(condition, alors, sinon)`
- `arrondi(x, n)`, `abs(x)`, `min(a, b)`, `max(a, b)`
- Texte : `concat(a, b, …)`, `longueur(t)`, `majuscules(t)`, `minuscules(t)`
- `vide(x)`

### Niveau 2
- `aujourdhui()`, `maintenant()`
- `ecart_jours(d1, d2)`, `ajouter_jours(d, n)`, `ajouter_mois(d, n)`
- `format_date(d, "JJ/MM/AAAA")`, `annee(d)`, `mois(d)`, `jour(d)`

### Règles
- **Sécurité : aucune exécution de code.** Interdits : `eval`, `new Function`, `with`, tout accès à l'environnement JS. Un parser + interpréteur maison (ou une librairie d'expressions sandboxée) qui ne connaît que les fonctions listées.
- **Colonnes multi-valeurs interdites en V1** : une formule ne peut pas référencer une relation, un `multiselect` ou un rollup `afficher` (ils contiennent plusieurs valeurs). L'éditeur refuse avec un message clair : « cette colonne contient plusieurs valeurs, passe par un rollup (compter, somme…) ». Les formules manipulant des listes sont [PLUS TARD].
- Gestion du vide : toute opération arithmétique avec une valeur vide renvoie vide, pas d'erreur.
- Erreur de syntaxe ou de type : affichée dans l'éditeur, la cellule affiche un indicateur d'erreur discret.
- L'éditeur de formules est un point d'UX important : autocomplétion des noms de colonnes et des fonctions, erreurs compréhensibles en français, aperçu du résultat sur la ligne courante.
- Les formules dépendant de `aujourdhui()` sont recalculées au chargement et au changement de jour.

### Précisions d'implémentation (jalon 10)
- Littéraux : nombres (`3.5`), textes entre guillemets, `vrai` / `faux`. Un texte au format date (`"2026-10-01"`) vaut une date là où une date est attendue.
- `non` porte sur toute la comparaison qui suit : `non prop("a") == 2` se lit `non (prop("a") == 2)`.
- Le vide : une case non cochée vaut `faux` ; un texte vide est vide. `==` / `!=` comparent aussi le vide ; une condition vide compte comme fausse ; `concat` ignore les vides ; `min` / `max` les écartent.
- `+` ne fait que l'addition de nombres : le texte s'assemble avec `concat`, qui écrit nombres, dates et cases à la française (`1234,5`, `24/09/2026`, `oui`).
- `si` n'évalue que la branche choisie. Division par zéro : la cellule passe en erreur.
- `min` / `max` acceptent aussi des dates ; `arrondi(x)` arrondit à l'entier ; `format_date` comprend `AAAA`, `AA`, `MM`, `JJ`, `HH`, `mm`.
- `maintenant()` : l'heure du dernier recalcul (toute modification de ligne, ouverture, changement de jour), pas une horloge qui tourne.
- Le type du résultat est déduit à la lecture du schéma (jamais écrit) : il décide des filtres, tris, calculs et de l'affichage, comme pour un rollup. Une formule en erreur s'affiche en erreur et n'est pas filtrable.

---

## 7. Vues

### Socle commun à toutes les vues
- Filtres (ET en V1 ; groupes OU facultatifs, voir héritage), tris multiples.
- Colonnes visibles et leur ordre.
- **Filtres rapides [DÉCIDÉ]** : barre de pastilles en haut de la vue. Chaque pastille est une **colonne épinglée** (ex. « Statut ») que l'on règle directement depuis la pastille (opérateur + valeur, ex. Statut parmi En cours, À faire). Une pastille non réglée ne filtre rien. Les pastilles réglées se combinent en ET avec les filtres de la vue, qui restent le cadre fixe (panneau « Filtrer »). La valeur réglée est **enregistrée dans la vue**, comme toute configuration.
- Mise en page utilisée pour ouvrir les lignes (§9).
- **Sauvegarde instantanée** de toute modification de configuration.
- **Annuler / rétablir [DÉCIDÉ]** : Ctrl+Z (⌘Z) défait la dernière modification des données, Ctrl+Maj+Z ou Ctrl+Y la rétablit : cellules, lignes créées, supprimées (fichier réécrit à l'identique, liens retirés compris), actions en lot, collage, application d'un plan de l'assistant. Une action sur plusieurs lignes s'annule d'un coup ; les frappes dans une cellule aussi, jusqu'à une pause d'une seconde. Le schéma, les vues et les dashboards n'y sont pas. Dans un champ en cours de saisie, c'est l'annulation du champ qui joue. Historique en mémoire (100 étapes), perdu au rechargement.
- **Mode consultation [DÉCIDÉ]** : une icône en haut à droite de la zone principale (comme Obsidian, elle montre le mode où elle mène), ou Ctrl+E (⌘E), passe tout l'espace en lecture seule. Restent : la navigation (barre latérale, recherche), les onglets de vues pour en changer, les filtres rapides déjà posés (réglables, pas retirables) et l'ouverture des pages, en lecture. Disparaît tout le reste : outils de vue, création de lignes, vues, colonnes, bases et blocs, menus, renommages, glisser-déposer, sélection, édition des cellules, du titre et du corps, assistant IA, annuler/rétablir. Le mode vaut pour tout l'espace et est gardé par le navigateur (jamais écrit dans l'espace).
- **Plein écran** : une icône à côté de celle du mode consultation affiche la vue ou le dashboard seul, sans barre latérale ni titre, sur tout l'écran quand le navigateur l'accepte. Échap (qui quitte le plein écran du navigateur) ou la même icône en sortent. Réglage de la visite, jamais mémorisé.

### Par type
- **Tableau** : groupement optionnel (repliable), largeur des colonnes, retour à la ligne, calculs en pied de colonne (et par groupe).
- **Sous-groupement** (tableau et timeline) [DÉCIDÉ, demandé par Alex le 01/10/2026] : une vue groupée peut grouper encore chaque groupe par une seconde colonne (« Puis par » dans « Options », par exemple par projet puis par version). Chaque sous-groupe se replie, a son « + » (la ligne créée prend les deux valeurs) et, dans le tableau, son pied de calculs ; le pied du groupe totalise ses sous-groupes. Dans la timeline, l'en-tête d'un sous-groupe porte aussi la barre qui couvre ses lignes. Fichier : `sous_groupe`, la clé des couloirs du kanban.
- **Tableau, plusieurs lignes à la fois [DÉCIDÉ]** :
  - **Sélection** : case dans la gouttière de chaque ligne (visible au survol), Maj+clic pour une plage, case d'en-tête pour toutes les lignes de la vue. Une barre d'actions apparaît : copier, dupliquer, supprimer. Échap vide la sélection, Suppr propose la suppression.
  - **Modification en lot** : dans une sélection de plusieurs lignes, une cellule modifiée l'est sur toutes (comme Notion), sauf le titre, propre à chaque ligne.
  - **Supprimer** : confirmation, avec la case « retirer aussi les liens vers elles » quand d'autres lignes pointent vers la sélection (§5).
  - **Dupliquer** : nouveau fichier, nouvel id, mêmes valeurs saisies et même corps. Les liens portés par l'autre base ne sont pas recopiés (ce serait écrire dans ses fichiers).
  - **Plage de cellules** : glisser à la souris d'une case à l'autre (ou Maj+clic) trace une plage, surlignée ; un simple clic reste l'édition de la case. Échap ou un clic ailleurs l'efface.
  - **Copier** : une plage donne ses cases (tabulations, et tableau HTML sans en-têtes) ; sinon les lignes sélectionnées, colonnes affichées, en tableau Markdown (texte) et HTML (pour un tableur ou un traitement de texte).
  - **Coller en remplaçant** : sur une plage, ou dans une case en édition quand le presse-papiers contient plusieurs cases, le tableau collé remplace les valeurs à partir de la case en haut à gauche, après une confirmation qui dit combien de valeurs sont écrasées. Une valeur seule collée sur une plage la remplit toute. Au-delà de la dernière ligne, des lignes nouvelles. Les en-têtes d'un tableau Markdown sont retirés ; les relations se lisent par titres ; une option inconnue est créée ; une colonne calculée ou un texte illisible est ignoré (et compté). La confirmation propose aussi de coller en lignes nouvelles.
  - **Coller en lignes nouvelles** : sans plage ni case en édition, un tableau (Markdown, CSV, ou cases copiées d'un tableur) passe par l'aperçu de l'import. Une première ligne qui nomme des colonnes sert d'en-têtes ; sinon chaque valeur va dans la colonne affichée à la même place. Une seule valeur collée ne crée rien.
  - **Suppr sur une plage** vide ses cases (Ctrl+Z les remet).
  - **Repères visuels** : ce qui vient d'être copié (plage ou lignes) garde un pointillé qui défile, comme dans un tableur, jusqu'à Échap ou la prochaine action. Après un collage, une recopie, une action en lot, un Ctrl+Z ou un plan de l'assistant, les cases touchées brillent un instant. Rien ne bouge si le système demande moins d'animations.
  - **Recopie** : la poignée au coin d'une cellule, tirée vers le haut ou le bas, donne sa valeur aux lignes survolées (le tableau défile au bord). Pas sur le titre ni sur une colonne calculée.
- **Kanban** : champ de groupe (`select`, `checkbox`, `relation`), sous-groupe optionnel (couloirs horizontaux), champs affichés sur la carte, glisser-déposer entre colonnes qui modifie la valeur. **Ordre des colonnes** [DÉCIDÉ, demandé par Alex le 02/10/2026] : celui des options (non coché puis coché, sinon alphabétique, le groupe vide en dernier) ; glisser l'en-tête d'une colonne sur un autre l'y place, et l'ordre complet est écrit dans la vue (`ordre_groupes`, les valeurs des groupes : libellé d'option, id de ligne liée, `∅` pour le groupe vide). La section « Ordre des colonnes » des Options du kanban fait la même chose dans une liste (toutes les valeurs possibles, même sans carte), avec « Revenir à l'ordre des options » ; changer la colonne du kanban retire l'ordre réglé. Une valeur absente de la liste suit, dans l'ordre habituel ; une valeur de la liste qui n'existe plus est ignorée. Marche aussi sur une base en lecture seule (Jira), dont les vues se règlent. Sur une relation, le déplacement **remplace** le lien (pas d'ajout). Grouper sur une relation multi-valeurs n'est pas une bonne pratique : ce cas trouvera sa vraie place avec les relations 1-n [PLUS TARD].
- **Collection** : cartes affichant les champs choisis et, en option, les premières lignes du corps.
- **Calendrier** : champ date utilisé, champ de fin optionnel pour les plages, vue mois / semaine, champs affichés sous le titre, glisser-déposer pour changer la date (la ligne suit le pointeur et s'accroche au jour le plus proche au relâcher).
- **Timeline** : champ de début, champ de fin, **champs jalons** (zéro ou plusieurs colonnes date affichées comme des points sur la ligne), zoom semaine / mois / trimestre, champs affichés sur la barre, groupement optionnel (repliable ; l'en-tête d'un groupe porte une barre calculée qui couvre ses lignes, non déplaçable), date exacte affichée pendant un glisser, redimensionnement et déplacement des barres à la souris (au pixel, accroché au jour au relâcher).
- **Timeline en arbre** [DÉCIDÉ, validé par Alex le 25/09/2026] : sous chaque ligne, les lignes liées par les relations cochées dans « Options » (« Déplier par »), niveau par niveau (un projet, ses versions, leurs jalons). Plusieurs relations peuvent être cochées au même niveau.
- **Couleur des barres** (calendrier et timeline) [DÉCIDÉ] : réglage « Couleur » dans « Options » : neutre, une couleur fixe (les couleurs nommées des options), ou « selon » une colonne select ou multiselect, la barre prenant la couleur de l'option de la ligne (la première pour un multiselect, gris pour une option sans couleur, neutre pour une cellule vide). Chaque niveau déplié a le sien. Fichier : `couleur: bleu` ou `couleur_par: statut` (la colonne l'emporte si les deux sont là). Quand la couleur suit une colonne, le réglage montre ses options, et leur couleur se change sur place [DÉCIDÉ, demandé par Alex le 27/09/2026] : c'est la couleur de l'option dans `_schema.yaml`, qui vaut partout dans l'espace (pastilles, kanban, légende).
  - Chaque niveau a ses propres champs de début, de fin et de jalons (ceux de la base liée), et ses propres filtres. Les filtres de la vue ne portent que sur les lignes de premier niveau.
  - Un niveau sans champ de fin s'affiche en losanges ◆ (un jalon est une date, pas une plage), qui se glissent comme une barre.
  - Une ligne sans dates à elle porte une barre calculée qui couvre ses descendants (non déplaçable). Les lignes des niveaux inférieurs sont de vraies lignes de leur base : glisser et étirer écrivent dans leur fichier, un clic ouvre leur page.
  - Une ligne liée à deux parents apparaît sous chacun. Une ligne déjà présente sur le chemin n'est pas redescendue (boucle de relations), et la profondeur est bornée à 5 niveaux.
  - Tout est déplié par défaut ; ▸ / ▾ replie une ligne, et ce choix est gardé dans le navigateur (pas dans le dossier).
  - **Sur la ligne du parent** [DÉCIDÉ, validé par Alex le 27/09/2026] : un niveau réglé « sur la ligne » ne prend pas de rangées à lui. Ses lignes se dessinent sur la rangée de leur parent, à leurs dates (un lot et ses phases successives sur une seule ligne, comme un Gantt). Celles qui se chevauchent s'empilent dans la rangée, qui s'agrandit. La barre du parent laisse la place (ses jalons restent) ; les barres gardent leur titre à l'intérieur, coupé si elles sont trop courtes, et se glissent comme les autres. Un tel niveau ne se déplie pas plus bas. Fichier : `sur_la_ligne: true` sur le niveau.
  - **Champs affichés par niveau** [DÉCIDÉ, demandé par Alex le 27/09/2026] : chaque niveau choisit ses champs affichés parmi les colonnes de sa base, avec les règles de la vue : le début se lit avant la barre, la fin après, les autres après le titre. Sur la ligne du parent, où les barres se touchent, les dates restent dans la barre : le début à son bord gauche, la fin à son bord droit ; une barre trop courte lâche d'abord la fin, puis le début, pour garder le titre (la plage reste dans l'infobulle). Fichier : `champs_carte` sur le niveau.
  - **Titre masquable** [DÉCIDÉ, demandé par Alex le 27/09/2026] : dans « Champs sur la barre » de la vue et « Champs affichés » de chaque niveau, le titre est une case comme les autres, cochée par défaut. Décochée, les barres (ou losanges) de la vue ou du niveau n'écrivent plus leur titre : la légende des couleurs et l'infobulle le donnent, et les autres champs affichés restent. La colonne des titres à gauche ne change pas. Fichier : `sans_titre: true`, sur la vue ou sur le niveau.
- **Bandes de périodes** (timeline) [DÉCIDÉ, validé par Alex le 27/09/2026] : les lignes d'une autre base (moratoires, congés, sprints…) se dessinent en bandes verticales qui traversent toute la timeline, derrière les barres, à leur couleur, avec leur titre dans l'en-tête. Un clic sur le titre ouvre la ligne. Les bandes n'élargissent pas l'étendue de la timeline. Réglage « Bandes » dans « Options » : la base, ses champs de début et de fin, sa couleur, et la place des titres. Fichier : `bandes`, une liste de sources. Titres [DÉCIDÉ, demandé par Alex le 27/09/2026] : en haut (dans l'en-tête, par défaut) ou en bas (sous la dernière rangée), `titres: bas` ; un titre plus long que sa bande n'est pas coupé, il déborde à droite, et deux titres qui se toucheraient passent sur deux rangées.
- **Raccourcis clavier** [DÉCIDÉ, validé par Alex le 27/09/2026] : un bouton en haut à droite, à côté du plein écran, ou la touche ? (hors saisie, menu et fenêtre) ouvre la liste de tous les raccourcis, rangés par endroit. Tout nouveau raccourci s'y ajoute (`src/ui/Raccourcis.tsx`).
- **Légende des couleurs** (timeline) [DÉCIDÉ, validé par Alex le 27/09/2026] : sous la grille, les options de chaque colonne qui colore des barres (la vue, ses niveaux dépliés, ses bandes), avec leur couleur, pour lire une barre trop courte pour son titre. Rien à régler : elle apparaît dès qu'une couleur suit une colonne, et disparaît sinon.
- **Zoom libre** (timeline) [DÉCIDÉ, validé par Alex le 27/09/2026] : Ctrl (ou Cmd) + molette, ou le pincement du trackpad, zoome l'axe du temps sous le pointeur (la date survolée ne bouge pas) ; + et - font de même au centre, 0 revient à l'échelle choisie, comme un clic sur Semaine, Mois ou Trimestre. Les graduations suivent le zoom (jours, semaines ou mois). Le zoom est gardé dans le navigateur, par vue, et n'écrit rien dans le dossier. Jamais pendant une saisie, un menu ou une fenêtre, ni avec Ctrl (+ et - restent le zoom du navigateur).
- Timeline : une ligne dont la plage tient en un jour s'affiche en losange (comme un niveau sans fin) ; elle se glisse, et s'étire par la droite du losange quand la vue a un champ de fin.
- Calendrier et timeline : une ligne sans date n'apparaît pas au calendrier (compteur « sans date ») ; dans la timeline elle garde sa rangée, et un clic sur la rangée la place à cette date. Une fin absente ou antérieure au début donne une plage d'un jour. Déplacer ou étirer garde l'heure d'une date qui en a une. Les colonnes calculées (rollup de date) s'affichent mais ne se glissent pas.

### Exemple `_vues/planning.yaml`

```yaml
id: planning
nom: Planning
type: timeline          # ou calendrier
champ_debut: debut      # calendrier : le champ date utilisé
champ_fin: echeance     # optionnel
champs_jalons: [revue]  # timeline seulement
noms_jalons: true       # timeline : le nom de la colonne à côté de chaque losange
sans_titre: true        # timeline : barres sans leur titre (légende et infobulle le donnent)
champs_carte: [client]  # champs affichés, comme pour le kanban ; dans la timeline, le début se lit avant la barre et la fin après
echelle: mois           # calendrier : mois | semaine ; timeline : semaine | mois | trimestre
deplier:                # timeline seulement : relations dépliées sous chaque ligne
  - relation: versions  # colonne relation de cette base
    champ_debut: debut  # colonnes de la base liée
    champ_fin: fin
    filtres:
      - { colonne: statut, operateur: different_de, valeur: Abandonnée }
    deplier:
      - relation: jalons
        champ_debut: date # sans champ_fin : des losanges
      - relation: phases
        champ_debut: debut
        champ_fin: fin
        sur_la_ligne: true  # les phases sur la rangée de leur version, pas en dessous
        champs_carte: [debut, fin]  # champs affichés, pris dans la base du niveau
        sans_titre: true            # barres du niveau sans leur titre
bandes:                 # timeline seulement : bandes verticales tirées d'une autre base
  - base: periodes
    champ_debut: debut
    champ_fin: fin      # optionnel : sans fin, une bande d'un jour
    couleur_par: type   # ou couleur: rouge, comme pour les barres
    titres: bas         # optionnel : titres sous la dernière rangée (en haut par défaut)
```

### Exemple `_vues/kanban-statut.yaml`

```yaml
id: kanban-statut
nom: Par statut
type: kanban
groupe: statut
sous_groupe: client
ordre_groupes: [À faire, En cours, Terminé]   # optionnel : ordre des colonnes
champs_carte: [echeance, nb_taches_ouvertes]
filtres:
  - { colonne: statut, operateur: different_de, valeur: Terminé }
tris:
  - { colonne: echeance, sens: asc }
filtres_rapides:
  - { colonne: client }                                          # épinglée, non réglée
  - { colonne: jours_restants, operateur: inferieur, valeur: 0 } # réglée
mise_en_page: suivi
```

### Opérateurs de filtre
- Commun : `vide`, `non_vide`
- Texte / URL : `egal`, `different_de`, `contient`, `ne_contient_pas`, `commence_par`, `finit_par`
- Nombre : `egal`, `different_de`, `superieur`, `inferieur`, `superieur_egal`, `inferieur_egal`
- Date : `egal`, `avant`, `apres`, `entre`, relatif (`aujourdhui`, `cette_semaine`, `ce_mois`, `jours_passes: n`, `jours_a_venir: n`)
- Checkbox : `egal`
- Select : `egal`, `different_de`, `parmi`
- Multiselect / relation : `contient`, `ne_contient_pas`
- Rollup et formule : opérateurs du type de leur résultat.

---

## 8. Création de ligne et héritage des filtres [DÉCIDÉ]

- Bouton `+` en bas de tableau, en haut de chaque colonne kanban, dans chaque groupe, dans chaque onglet relation.
- La ligne est créée **immédiatement** (fichier écrit), titre en édition.
- **Héritage des filtres actifs** (filtres de vue + pastilles de filtres rapides réglées + groupe/colonne kanban où l'on a cliqué) :
  - `egal` sur `select`, `checkbox`, `text`, `number`, `date` → la valeur est remplie ;
  - `contient` sur `relation` → l'id est ajouté (c'est ce qui fait fonctionner les onglets relation) ;
  - `parmi` sur `select` avec une seule valeur → remplie ;
  - tout le reste (contient sur du texte, dates relatives, comparaisons, filtres sur rollup ou formule, groupes OU) → **ignoré, champ laissé vide**.
- **Ligne persistante** : une ligne créée pendant la session reste visible dans la vue même si elle ne satisfait pas les filtres, avec un fond coloré et un indicateur « sortira de la vue ». Elle disparaît au prochain rafraîchissement de la vue ou changement de vue (comportement inspiré de Coda).

---

## 9. Pages

### Ouverture
- Clic sur une ligne → **panneau à droite**.
- Bouton pour passer en **plein écran**.
- Navigation clavier : `Échap` ferme, flèches haut/bas passent à la ligne précédente/suivante de la vue.

### Mises en page [DÉCIDÉ]
- Une base peut avoir **plusieurs mises en page enregistrées** (`_pages/*.yaml`), dont une par défaut.
- Choix de la mise en page à l'ouverture :
  1. celle définie par la vue d'où l'on ouvre la ligne ;
  2. sinon, celle par défaut de la base ;
  3. sélecteur en haut de la page pour basculer manuellement.
- Une mise en page ne modifie jamais les fichiers de lignes.

### Contenu d'une mise en page
- Pour chaque champ : `visible`, `masque_si_vide`, `masque`, et l'ordre d'affichage.
- Pour chaque relation : affichage **en champ** (pastilles) ou **en onglet** (table).
- Position du corps : sous les propriétés, ou dans son propre onglet.

### Onglets relation
- Un onglet relation est **une vue tableau de la base liée, filtrée sur « lié à cette page »**, avec ses propres colonnes visibles.
- Le `+` de l'onglet crée une ligne déjà liée grâce à l'héritage des filtres (§8). Aucun code spécifique.

### Contenus liés [DÉCIDÉ, demandé par Alex le 01/10/2026]
- Sous le corps de la page (là où il est : sous les propriétés ou dans son onglet), les lignes d'une relation, chacune avec son titre, quelques champs choisis, et un chevron qui déplie son corps. Un projet montre ainsi son texte, puis celui de ses tâches.
- **Affichage seulement** : chaque texte reste dans le fichier de sa ligne. Le corps déplié s'édite sur place (même éditeur que la page) et s'écrit dans le fichier de la ligne liée ; en consultation, il se lit.
- Un corps n'est chargé qu'au dépliage. Une ligne sans corps est marquée « vide ». Le titre ouvre la page de la ligne.
- **Niveaux** : chaque niveau peut déplier à son tour les lignes d'une relation de sa base (client, puis projets, puis tâches), jusqu'à 5 niveaux. Une ligne déjà affichée au-dessus n'est jamais répétée (pas de boucle).
- **Filtres et tris** par niveau, au format des vues (§7) : les tâches non faites, par échéance. Sans tri, l'ordre de la relation. Le compte dit ce que le filtre masque (« 2 sur 3 »).
- Activé par la mise en page (réglage « Contenus liés »), donc par base et au choix : clé `contenus`, absente par défaut.
- Auto-relation (sous-tâches dans la base des tâches) : [PLUS TARD], avec l'auto-relation elle-même (§5). Le dépliage récursif s'en servira tel quel.

### Tâches [DÉCIDÉ, demandé par Alex le 02/10/2026]
- Une tâche est une case à cocher Markdown du corps d'une page : `- [ ] texte` ou `- [x] texte`, à n'importe quel retrait (sous-tâches). Une case dans un bloc de code n'en est pas une. Rien d'autre n'est lu (ni échéance ni priorité, [PLUS TARD]).
- **Les tâches ne vivent que dans le texte** : aucune clé YAML, aucun fichier à part. Cocher une tâche ailleurs que dans l'éditeur réécrit seulement le caractère de sa case dans le corps de sa ligne, après avoir vérifié que la ligne est toujours cette tâche (sinon rien n'est écrit) ; Ctrl+Z l'annule comme une frappe.
- **Onglet Tâches** d'une page, activé par la mise en page (onglet `type: taches`) : les tâches de la page sous le titre de leur section, une saisie « Ajouter une tâche » (écrite sous la dernière tâche du corps, ou à la fin), puis, au choix, les tâches des **lignes liées** (`liees`), au même format que les contenus liés (relation, champs, filtres, tris, `puis` sur 5 niveaux). Une ligne liée sans tâche, ni plus bas, n'apparaît pas. L'onglet affiche le nombre de tâches restantes, lignes liées comprises.
- **Toutes les tâches** : une entrée de la barre latérale, sous la recherche et l'assistant, ouvre la liste des tâches de toutes les pages de l'espace, par base puis par ligne (le titre ouvre la page). Filtre « À faire » (par défaut) ou « Toutes », et une recherche sur le texte des tâches et le titre des pages. Une tâche cochée là reste affichée jusqu'au départ de la page, pour ne pas disparaître sous le clic.
- Base synchronisée (§16) ou consultation : les cases se lisent, rien ne se coche.

### Exemple `_pages/suivi.yaml`

```yaml
id: suivi
nom: Suivi
defaut: false
champs:
  - { cle: statut, affichage: visible }
  - { cle: echeance, affichage: visible }
  - { cle: client, affichage: visible }
  - { cle: jours_restants, affichage: masque_si_vide }
onglets:
  - type: proprietes
  - type: relation
    relation: taches
    colonnes: [titre, statut, echeance]
  - type: taches                           # cases à cocher du corps
    liees:                                 # optionnel : celles des lignes liées
      relation: taches
      filtres:
        - { colonne: fait, operateur: egal, valeur: false }
  - type: corps
contenus:                                  # optionnel : contenus liés sous le corps
  relation: taches
  champs: [statut, echeance]               # à côté du titre de chaque tâche
  filtres:                                 # optionnels, comme dans une vue
    - { colonne: fait, operateur: egal, valeur: false }
  tris:
    - { colonne: echeance, sens: asc }
  puis:                                    # niveau suivant, dans la base des tâches
    relation: livrables
```

### Corps de la page
- Éditeur Markdown riche qui **produit du Markdown propre** : CodeMirror 6 en aperçu en direct, à la manière d'Obsidian [DÉCIDÉ, demandé par Alex le 02/10/2026, remplace Milkdown].
  - Le texte s'affiche mis en forme ; la syntaxe (`#` d'un titre, `**` du gras, crochets d'un lien) réapparaît sur la ligne ou le passage où se trouve le curseur, et s'y modifie comme du texte.
  - Le fichier n'est jamais normalisé : seul ce que l'utilisateur tape le change, ouvrir une page ne le réécrit pas.
  - Les titres se replient (chevron dans la marge) jusqu'au titre suivant de même niveau ou plus haut ; le repli n'est pas mémorisé.
  - Une case `- [ ]` se coche d'un clic, qui écrit `- [x]` dans le texte. Un lien s'ouvre au clic, dans un nouvel onglet.
  - « / » ouvre le menu des blocs (titres, tâche, listes, citation, bloc de code, séparateur) ; Ctrl+B et Ctrl+I mettent en gras et en italique.
  - **Liens, collage, surlignage, menu du clic droit** [DÉCIDÉ, demandé par Alex le 09/10/2026] :
    - Ctrl+K sur une sélection en fait un lien `[texte](adresse)` (champ où coller l'adresse) ; sur un lien, change, ouvre ou retire l'adresse. Sans sélection, Ctrl+K reste la recherche globale. Dans l'app de bureau, un lien s'ouvre dans le navigateur du système.
    - Un collage mis en forme (page web, réponse d'IA, Word) est converti en Markdown (titres, gras, listes, liens, tableaux) ; un texte brut qui est déjà du Markdown se colle tel quel.
    - Surlignage : `==texte==` en jaune (la syntaxe d'Obsidian), `=={rouge}texte==` pour une autre couleur nommée de l'espace (gris, marron, orange, jaune, vert, bleu, violet, rose, rouge). Ailleurs qu'ici, le jaune s'affiche dans Obsidian, les autres couleurs y gardent `{rouge}` visible. Ctrl+Maj+H surligne en jaune, ou retire le surlignage.
    - Clic droit sur un mot (il est sélectionné) ou une sélection : menu de mise en forme (gras, italique, barré, code, lien, surlignage par couleur, retirer), couper, copier, coller. Maj+clic droit garde le menu du système (suggestions d'orthographe).
- **Références à une ligne** [DÉCIDÉ, demandé par Alex le 02/10/2026] : « @ » dans le corps ouvre la liste des lignes de tout l'espace (titre, et nom de la base), filtrée par la suite de la saisie ; choisir une ligne écrit un lien wiki à la manière d'Obsidian, `[[projets/site-vitrine--psite001|Site vitrine]]` : le chemin du fichier sans `.md`, le titre en alias. Aucune clé YAML.
  - Le lien se résout par l'**id** qui termine le nom du fichier : cherché dans la base du dossier, puis dans toutes les bases. Une ligne renommée (fichier renommé) ou une base renommée reste donc trouvée ; le texte du lien n'est jamais réécrit.
  - Dans l'éditeur, le lien s'affiche comme une pastille au **titre actuel** de la ligne (l'alias sert seulement si la ligne est introuvable, la pastille est alors barrée) ; un clic ouvre la page, la syntaxe revient quand le curseur la touche. Un lien dans un bloc de code reste du texte.
  - [PLUS TARD] Liste des pages qui citent une ligne (rétroliens).
- Pas d'images en V1.

---

## 10. Dashboards

- Listés en haut de la barre latérale, dans l'ordre de `barre_laterale.dashboards` (`_espace.yaml`), puis ceux qu'il ne cite pas. **Réordonnables par glisser-déposer** [DÉCIDÉ, demandé par Alex le 01/10/2026] : un dépôt réécrit la liste complète.
- **Dupliquer** [DÉCIDÉ, demandé par Alex le 01/10/2026] : depuis le ⋯ (ou le clic droit), le fichier est copié tel quel sous un nouvel id, nommé « <nom> (copie) », placé juste après l'original.
- Un dashboard = une suite de **blocs empilés verticalement**, chaque bloc pouvant être seul ou à deux côte à côte sur une rangée.
- **Hauteur d'une rangée** [DÉCIDÉ, demandé par Alex le 01/10/2026] : tirer le bord bas d'une rangée règle la hauteur de ses blocs (une timeline longue, un tableau de beaucoup de lignes) ; un double-clic revient à la hauteur par défaut (380 px). Bornée entre 160 et 2400 px. Fichier : `hauteur` sur la rangée, en pixels.
- Un bloc = une vue d'une base : soit une **référence** à une vue existante de la base, soit une **vue propre au dashboard**, écrite directement dans le fichier du dashboard, au même format qu'un fichier `_vues/*.yaml`. Une vue propre n'apparaît pas dans la liste des vues de la base.

```yaml
id: pilotage
nom: Pilotage
rangees:
  - blocs:
      - { base: projets, vue: kanban-statut }        # référence
    hauteur: 600                                     # optionnel : hauteur des blocs de la rangée, en pixels
  - blocs:
      - base: taches                                 # vue propre au dashboard
        vue:
          id: taches-en-retard
          nom: En retard
          type: tableau
          filtres:
            - { colonne: echeance, operateur: avant, valeur: aujourdhui }
      - { base: clients, vue: tableau-principal }
filtres:                                             # filtres globaux (optionnels)
  - { base: projets, colonne: statut, operateur: egal, valeur: En cours }
filtres_rapides:                                     # pastilles globales
  - { base: projets, valeur: [psite001] }            # sans colonne : des lignes choisies
  - { base: taches, colonne: priorite, operateur: parmi }
```

- **Filtres globaux** [DÉCIDÉ, validé par Alex le 25/09/2026] : un dashboard peut porter des filtres et des filtres rapides qui valent pour tous ses blocs. Chacun porte sur une base (« Projets › Statut = En cours »), qu'elle ait un bloc ou non.
  - Un bloc de cette base est filtré directement. Un bloc d'une autre base suit ses relations vers elle : il garde les lignes liées à au moins une ligne retenue (les tâches des projets en cours). Un bloc sans relation vers la base filtrée n'est pas filtré, et son en-tête le dit.
  - Plusieurs bases filtrées se combinent en ET. Ces filtres s'ajoutent à ceux de la vue du bloc, sans les modifier.
  - Pastille globale sans colonne : le choix de lignes de la base (« Projets : Site vitrine, Boutique »), par cases à cocher. Comme toute pastille, non réglée elle ne filtre rien.

---

## 11. Recherche globale

- Raccourci `Ctrl+K`.
- Recherche plein texte sur titres, champs texte et corps de toutes les bases.
- Résultats groupés par base, ouverture de la page en un clic.
- Index en mémoire (MiniSearch ou équivalent), mis à jour à chaque écriture.

Précisions d'implémentation :
- MiniSearch. Poids : titre ×3, champs texte (text, url) ×1,5, corps ×1. Tous les mots doivent être présents ; débuts de mots et petites fautes acceptés ; accents et casse ignorés.
- L'index suit l'état affiché (pas seulement l'écrit) : une modification est trouvable avant d'être écrite. Seules les lignes dont le texte a changé sont réindexées.
- Un résultat donne un extrait (champs texte, sinon corps) avec les mots trouvés surlignés. Les groupes suivent l'ordre du meilleur résultat de chaque base.

---

## 12. Architecture

```
┌─────────────────────────────────────────┐
│ UI (React)                              │
├─────────────────────────────────────────┤
│ Store applicatif (état UI, vues)        │
├─────────────────────────────────────────┤
│ CŒUR (TypeScript pur, zéro dépendance   │
│ UI) : parsing, schéma, index, graphe    │
│ de dépendances, rollups, formules,      │
│ filtres, tris, recherche, écriture      │
├─────────────────────────────────────────┤
│ Adaptateur fichiers (interface)         │
│  └ impl. File System Access API (V1)    │
│  └ impl. Tauri / Obsidian (PLUS TARD)   │
└─────────────────────────────────────────┘
```

### Règles d'architecture
- **Le cœur n'importe ni React, ni le DOM, ni l'API navigateur.** Il doit tourner tel quel dans Node pour les tests, et demain dans un plugin Obsidian ou derrière Tauri.
- **L'adaptateur fichiers** expose une interface minimale : `lister`, `lire`, `ecrire`, `renommer`, `supprimer`, `dateModification`. Aucune autre partie du code ne touche au système de fichiers.
- **Index en mémoire** : au chargement, tous les fichiers sont lus et parsés ; chaque colonne (stockée ou calculée) a une valeur concrète pour chaque ligne. Filtres, tris et groupements opèrent sur cet index.
- **Recalcul incrémental** : une modification ne recalcule que les colonnes qui en dépendent (via le graphe).
- **Écriture** : debounce par fichier (~300 ms), écriture complète du fichier via l'API d'écriture du navigateur.

### Stack
- TypeScript strict, Vite.
- React ; TanStack Table + TanStack Virtual (tableaux virtualisés) ; dnd-kit (glisser-déposer).
- Calendrier et timeline : implémentation maison (les librairies gèrent mal les jalons ; les meilleures timelines sont payantes).
- `yaml` (eemeli/yaml) pour le frontmatter avec préservation du formatage.
- Éditeur de corps : CodeMirror 6 (aperçu en direct).
- MiniSearch pour la recherche.
- Vitest pour les tests du cœur.

### Environnement navigateur
- API File System Access : fonctionne sur **Chrome et Edge** (cible Windows), pas sur Firefox ni Safari. Afficher un message clair sur les navigateurs non compatibles.
- Le handle du dossier est conservé dans IndexedDB pour ne pas redemander le dossier à chaque ouverture (seule la permission est redemandée).
- **Changements externes** (synchro OneDrive depuis une autre machine) : le navigateur ne peut pas surveiller le dossier. À chaque retour sur l'onglet (`visibilitychange` / `focus`), rescanner les dates de modification et recharger les fichiers modifiés. Bouton de rafraîchissement manuel en complément. (Jalon 12 : relecture de tout l'espace, dates des lignes comparées, fichiers de configuration relus ; une relecture croisée par une écriture de l'app est jetée et refaite au coup suivant.)
- Application **100 % statique** : aucun appel réseau, aucune télémétrie.
- **Application installable (PWA)** [DÉCIDÉ, demandé par Alex le 01/10/2026] : Chrome et Edge proposent « Installer mdbase » (icône dans la barre d'adresse) : fenêtre à part, icône dans le menu Démarrer et la barre des tâches, sans signature ni installeur. Un service worker (`pwa/sw.js`, liste des fichiers injectée au build) garde le build pour ouvrir l'app hors ligne : la page passe par le réseau d'abord, les fichiers du build (noms hachés) par le cache d'abord, un cache par version. Il n'intercepte que l'app elle-même : ni les fichiers de l'espace (lus par l'API de fichiers), ni les appels de l'assistant IA. Une installation reste dans le cadre du navigateur : elle ne lève aucune restriction réseau (CORS).

### Module IA [DÉCIDÉ]
Exception à « aucun appel réseau » (validée par Alex le 25/09/2026, après la V1). La seule autre : la synchro Jira de l'app de bureau (§16), activée par le module Jira et une connexion saisie par l'utilisateur.
- **Désactivé par défaut.** L'activer affiche d'abord un avertissement qui dit quelles données partent et vers quelle adresse ; rien n'est envoyé avant l'activation.
- **Connecteur générique** : tout service compatible OpenAI (`/chat/completions` avec appels d'outils), distant ou local. L'utilisateur fournit l'adresse, sa clé et le nom du modèle ; la clé reste dans son navigateur. Aucun fournisseur imposé, aucune clé embarquée. Les principaux services sont préremplis [DÉCIDÉ, demandé par Alex le 02/10/2026] : un clic sur Anthropic, Google Gemini, OpenAI, Mistral, OVH, Ollama ou LM Studio remplit l'adresse et un modèle par défaut, avec un lien vers la page où créer sa clé ; il ne reste qu'à coller la clé. Le modèle se change parmi ceux que le service liste.
- **Périmètre** : le modèle ne voit et ne modifie que l'espace ouvert. Il ne touche jamais aux fichiers : il propose des opérations typées (outils), que le cœur valide comme une saisie de l'interface (colonnes, types, options, lignes existantes).
- **Aperçu obligatoire** : toute écriture proposée est montrée (lignes, colonnes, avant → après) et n'est appliquée qu'après confirmation. Une proposition invalide est refusée en entier, jamais appliquée à moitié.
- Le cœur définit l'interface du modèle et les outils ; l'appel réseau vit dans un adaptateur.
- **Conversation** : les derniers échanges sont renvoyés au modèle ; le fil est gardé dans le navigateur (brouillon, pas dans le dossier).
- **Panneau** [DÉCIDÉ, validé par Alex le 27/09/2026] : l'assistant vit dans un panneau à droite du contenu, redimensionnable, ouvert et fermé par `Ctrl+J` / `⌘J` ; la base reste visible pendant la conversation. La conversation n'appartient pas au panneau : le fermer, changer de base ou passer en consultation n'arrête pas une demande en cours, et le bouton de la barre latérale signale une demande qui tourne ou une proposition à relire.
- **Réponse au fil de l'eau** [DÉCIDÉ, validé par Alex le 27/09/2026] : la requête est envoyée en `stream` ; le texte s'affiche à mesure qu'il arrive. Pas de délai total : une demande n'est abandonnée qu'après 30 min sans rien recevoir (certains modèles réfléchissent longtemps sans rien envoyer) ; avant, c'est l'utilisateur qui décide d'arrêter. « Arrêter » coupe réellement la requête ; un tour arrêté est gardé dans le fil avec le texte déjà reçu. Un service qui ignore `stream` et répond d'un bloc reste accepté.
- **Lire avant d'agir** [DÉCIDÉ, demandé par Alex le 02/10/2026] : au-delà de 150 lignes, le contexte n'en donne qu'un extrait. Deux outils de lecture, sans effet sur les fichiers : `chercher_lignes` (une base, des filtres et des tris comme une vue ; toutes les lignes qui répondent, 200 au plus, valeurs complètes, calculées comprises) et `lire_page` (le contenu d'une page). Le modèle lit sur plusieurs tours (8 au plus) en voyant chaque résultat, puis envoie ses modifications en une réponse ; une modification envoyée avec une lecture n'est pas retenue à ce tour. Deux relances au plus, après un refus ou une réponse coupée par le service (`finish_reason: length`) ; ensuite, les appels valides sont proposés et ce qui reste refusé est signalé dans le message, plutôt que de tout perdre.
- **Dans le panneau** [DÉCIDÉ, validé par Alex le 27/09/2026] : réponses rendues en Markdown (titres, listes, gras, code, tableaux, liens web seulement), sans jamais injecter de HTML ; « Copier » sur chaque réponse ; la dernière demande se relance ou se reprend pour modification, sauf si son plan a été appliqué. `@` cite une base (ses lignes accompagnent la demande comme celles de la base ouverte), `/` en tête de demande choisit un skill que le modèle est prié d'appliquer. Le modèle se change depuis le pied du panneau (liste demandée au service). Historique : 20 conversations par dossier, gardées dans le navigateur ; une conversation reprise relit ses échanges mais ses plans ne sont plus applicables.
- **Mémoire** (`_assistant/memoire.md`, §3) : le modèle retient un fait quand l'utilisateur le demande ou exprime une préférence durable ; écrit aussitôt, avec une mention « Retenu : … » annulable. Jamais une valeur de ligne.
- **Skills** (`_assistant/skills/`, §3) : procédures nommées créées à la demande de l'utilisateur, avec confirmation comme une modification de données. Les skills et la mémoire sont envoyés au modèle avec la structure de l'espace, et l'avertissement d'activation le dit.
- **Structure** : le modèle peut aussi créer une base, ajouter, renommer ou supprimer des colonnes (tous les types, relations avec leur miroir, rollups, formules), créer, régler ou supprimer des vues (filtres, tris, groupement, colonnes affichées), créer ou supprimer des dashboards, supprimer des lignes et écrire le contenu d'une page. Les appels d'une même réponse sont validés dans l'ordre sur un brouillon de l'espace : une colonne ou une base créée peut être remplie aussitôt. Application dans l'ordre structure, puis données, puis suppressions de lignes et contenu.
- **Connaissance** (contexte, documents, inbox, budget) : §18.
- **Suppressions** : toujours dans l'aperçu, en rouge, avec leur portée (lignes touchées, liens retirés). Supprimer une base est possible, seulement à la demande explicite de l'utilisateur. Les données s'annulent d'un Ctrl+Z comme une action de l'utilisateur ; une base, une colonne, une vue ou un dashboard supprimé ne revient pas, et l'aperçu le dit (« définitif »).

---

## 13. Invariants (à tester)

1. Aucune valeur calculée n'est jamais écrite dans un fichier de ligne.
2. Ajouter ou retirer un lien de relation modifie exactement un fichier.
3. Renommer une colonne ne modifie aucun fichier de ligne.
4. Déplacer une base entre groupes ne modifie que `_espace.yaml`.
5. Un champ inconnu du schéma survit à toute réécriture du fichier.
6. Relire un fichier que l'app vient d'écrire redonne exactement les mêmes valeurs (aller-retour stable).
7. Aucune configuration acceptée ne contient de boucle de dépendances.
8. Aucune formule ne peut exécuter de code arbitraire.
9. Une ligne créée depuis une vue filtrée sur `egal` / relation satisfait ces filtres.

---

## 14. Ordre de construction suggéré

Avancer jalon par jalon, chaque jalon livrable et testé avant le suivant.

1. **Socle** — projet Vite + TS, cœur isolé, adaptateur File System Access, ouverture d'un dossier, persistance du handle.
2. **Lecture/écriture** — parsing des lignes et du schéma, lecture tolérante, écriture préservant le formatage, tests d'aller-retour.
3. **Tableau minimal** — une base, types simples (`text`, `number`, `date`, `checkbox`, `select`, `multiselect`, `url`), édition inline, `+` pour créer une ligne, sauvegarde instantanée.
4. **Gestion du schéma** — créer une base, ajouter / renommer / réordonner / supprimer des colonnes depuis l'interface. Barre latérale et groupes.
5. **Filtres, tris, filtres rapides** — y compris héritage à la création et ligne persistante colorée.
6. **Relations et rollups** — index, graphe de dépendances, stockage propriétaire, édition des deux côtés, rollups de rollups, détection de boucles.
7. **Pages** — panneau latéral, plein écran, éditeur de corps, mises en page, onglets relation.
8. **Vues** — groupement dans le tableau, kanban, collection.
9. **Vues temporelles** — calendrier, timeline avec jalons.
10. **Formules** — interpréteur sandboxé, niveaux 1 et 2, éditeur avec autocomplétion.
11. **Dashboards et recherche globale.**
12. **Robustesse synchro** — rechargement sur focus, détection des conflits OneDrive, ids en double, liens cassés.

---

## 16. Intégration Jira [PROPOSÉ, demandé par Alex le 01/10/2026]

But : relier des lignes à des tickets Jira Cloud et en faire des rollups (statut des tickets d'un projet, tickets non terminés, prochaine échéance). **Lecture seule** : rien n'est jamais écrit dans Jira.

### Principe
- Jira Cloud refuse les appels venant d'une page web (CORS) : la page ne parle jamais à Jira. Un **script de synchro** (`mdbase-jira.mjs`, un seul fichier, Node seul requis, téléchargeable depuis le site) lit Jira et écrit les tickets dans l'espace, en fichiers ordinaires.
- Une **base Jira** : une base comme les autres (§3), marquée par une clé `source` dans son schéma. Un fichier par ticket. L'app l'affiche, la filtre, la relie et en fait des rollups comme toute base, mais la garde **en lecture seule**.
- La correspondance ticket → ligne est une fonction pure du cœur (`src/core/jira/`), séparée de l'accès réseau : le script et l'app de bureau l'utilisent tous les deux.

### Schéma d'une base Jira

```yaml
version: 1
id: jira
nom: Jira
champ_titre: titre
source:
  type: jira
  site: exemple.atlassian.net
  projets: [PRVE, ABC]          # choisis dans l'app (réglages de la base)
  jql: "status != Abandonné"    # optionnel : filtre ajouté à la sélection par projets
colonnes:
  - { cle: titre, nom: Ticket, type: text }                 # « PRVE-123 Résumé »
  - { cle: cle, nom: Clé, type: text }                      # PRVE-123
  - { cle: resume, nom: Résumé, type: text }
  - { cle: statut, nom: Statut, type: select, options: [...] }
  - { cle: etat, nom: État, type: select, options: [À faire, En cours, Terminé] }
  - { cle: type, nom: Type, type: select, options: [...] }
  - { cle: priorite, nom: Priorité, type: select, options: [...] }
  - { cle: assigne, nom: Assigné, type: text }
  - { cle: sprint, nom: Sprint, type: multiselect, options: [...] }
  - { cle: versions, nom: Versions corrigées, type: multiselect, options: [...] }
  - { cle: echeance, nom: Échéance, type: date }
  - { cle: parent, nom: Epic parent, type: text }           # « PRVE-10 Refonte du portail »
  - { cle: labels, nom: Labels, type: multiselect, options: [...] }
  - { cle: cree, nom: Créé le, type: date }
  - { cle: maj, nom: Mis à jour le, type: date }                # date et heure, côté Jira (un commentaire compte)
  - { cle: bouge, nom: Bougé le, type: date }                   # date et heure de la synchro qui a vu changer un champ suivi
  - { cle: changement, nom: Dernier changement, type: text }    # « Statut : En revue (était En cours) »
  - { cle: lien, nom: Lien, type: url }
  - { cle: suivi, nom: Suivi, type: checkbox }
  - { cle: jira_id, nom: Id Jira, type: text }              # id interne Jira : sert à retrouver le ticket
```

- `source` : la seule nouvelle clé. Sa présence rend la base **en lecture seule** dans l'app (cellules, corps, création et suppression de lignes, colonnes) ; vues, filtres, tris, mises en page et relations **vers** elle restent libres.
- Le script crée la base si elle manque, et complète les options des select au fil des tickets. `etat` est la catégorie de statut de Jira (À faire, En cours, Terminé), stable quel que soit le workflow : c'est elle qui sert aux rollups « non terminés ». Couleurs : gris, bleu, vert. Les options du statut sont rangées par catégorie (à faire, en cours, terminé) à chaque synchro, dans l'ordre d'arrivée au sein d'une catégorie [DÉCIDÉ, demandé par Alex le 02/10/2026] : un kanban par statut a ses colonnes dans l'ordre du travail.
- **Voir ce qui a bougé** [demandé par Alex le 01/10/2026] : quand une synchro trouve un champ suivi modifié (statut, assigné, sprint, échéance…), elle note `bouge` (date et heure de la synchro) et `changement` (les champs modifiés, nouvelle valeur puis l'ancienne entre parenthèses, séparés par « ; »). Trier par « Bougé le », ou filtrer « Bougé le = aujourd'hui », donne les tickets qui ont bougé. Un ticket nouveau dans la sélection : `changement: Nouveau`. `maj` reste la date de Jira, qui avance aussi pour un simple commentaire.
- Colonnes propres à l'utilisateur : refusées dans une base Jira (lecture seule). Une colonne retirée du schéma n'est plus écrite par le script.

### Fichier d'un ticket
```markdown
---
id: k3f9a2xq                 # id de ligne mdbase, aléatoire, stable (§3)
jira_id: "10423"             # id interne Jira, stable même si le ticket change de projet
titre: PRVE-123 Export des factures en PDF
cle: PRVE-123
statut: En revue
etat: En cours
...
suivi: true
---
Description du ticket, convertie en Markdown.
```
- Le script retrouve un ticket par `jira_id`, jamais par nom de fichier : l'id de ligne ne change pas, les relations tiennent.
- Corps : la description Jira (format ADF) convertie en Markdown (titres, listes, gras, italique, code, liens, tableaux simples). Le reste devient du texte.
- Un ticket qui sort de la sélection (projet retiré, filtre, ticket supprimé dans Jira) **n'est jamais effacé** : il garde ses valeurs et passe à `suivi: false`. Les relations vers lui restent. Le supprimer reste un geste de l'utilisateur.

### Dans l'app
- Créer : « Nouvelle base Jira » (site, projets, filtre JQL facultatif). Une vue tableau est écrite avec la base : les tickets qui ont bougé en tête (« Bougé le » décroissant), titre, statut, dernier changement, assigné, priorité, type et sprint ; les autres colonnes restent dans les pages. Réglages de la base (bandeau en haut de la base) : site, projets suivis, filtre JQL.
- Relier : une colonne relation vers la base Jira. La recherche de la relation trouve un ticket par son numéro (`123` ou `PRVE-123`), puisque la clé est dans le titre.
- Ce que l'app affiche d'une base Jira : un bandeau avec la dernière synchro, lue dans `jira/_synchro.yaml` (écrit par le script : date, nombre de tickets, dernière erreur), l'erreur du dernier passage s'il a échoué, et un doute si la synchro date de plus de 30 minutes. Tant que la base n'a jamais été synchronisée, il explique comment lancer le script et propose de le télécharger (publié à côté de l'app).

### Le script
- `node mdbase-jira.mjs <dossier de l'espace>` : une synchro. `--suivre` : reste ouvert, resynchronise toutes les 5 minutes et relit les réglages de la base à chaque passage.
- Synchro incrémentale : seuls les tickets mis à jour depuis la dernière synchro sont relus (avec une marge de 24 heures : le fuseau horaire de Jira peut différer de celui du poste) ; une synchro complète au premier passage, après un changement de projets ou de filtre, et toutes les heures avec `--suivre` (pour voir les tickets sortis de la sélection). Un fichier n'est réécrit que si une valeur a changé.
- API : Jira Cloud REST v3, recherche JQL paginée, authentification e-mail + token d'API (token classique : un token à portées ne s'utilise que par la passerelle `api.atlassian.com`, et l'adresse du site le refuse en 401). Un 401 peut aussi venir d'un administrateur qui a coupé les tokens d'API des comptes de l'entreprise (Atlassian Guard).
- **Le token ne va jamais dans l'espace ni dans le dépôt.** Demandé au premier lancement avec l'e-mail, puis gardé hors de l'espace : chiffré par Windows pour la session (DPAPI) sous `%APPDATA%\mdbase\`, dans le trousseau sur macOS. `--oublier` l'efface.
- Une colonne ajoutée au script après la création d'une base (ex. Projet) est posée dans son schéma au passage suivant, qui relit alors tous les tickets ; la remplir ne compte pas comme un mouvement (« Bougé le » inchangé).
- `--demarrage` (Windows) : après un passage réussi, copie le script dans `%LOCALAPPDATA%\mdbase\` (hors des Téléchargements) et pose `mdbase-jira.cmd` dans le dossier Démarrage de l'utilisateur, qui relance `--suivre` à chaque ouverture de session, fenêtre réduite, sans droits administrateur. `--sans-demarrage` le retire. Le bandeau de la base (bouton « Script ») donne le téléchargement et les deux commandes à copier : l'app ne connaît pas le chemin du dossier de l'espace, le script si.
- [PLUS TARD] plusieurs scripts sur un même espace partagé (verrou).

### Dans l'app de bureau [DÉCIDÉ, demandé par Alex le 09/10/2026]

L'app de bureau n'a pas la restriction CORS : elle synchronise elle-même, sans script. Le script reste pour la PWA (navigateur).

- **Même synchro** : la fonction du cœur (`synchroniser`), avec un client Jira dont les requêtes partent du code natif (Rust). Seules adresses appelées : `https://<site de la base>/rest/api/3/…`, en lecture.
- **Connexion** : e-mail Atlassian et token d'API, saisis dans le bandeau de la base Jira (« Connexion »), une fois par site. Vérifiés auprès de Jira avant d'être gardés ; gardés dans le gestionnaire d'identifiants du système (Windows, trousseau sur Mac), jamais dans l'espace, le dépôt ni le stockage du navigateur. Le token n'est jamais renvoyé à l'interface : le code natif ajoute l'authentification à chaque requête. « Oublier » l'efface. Un token refusé (401) redemande la connexion.
- **Quand** : seulement app ouverte, et module Jira activé (§19). Un passage à l'ouverture de l'espace, puis toutes les 5 minutes, synchro complète au moins toutes les heures (comme `--suivre`). Bouton « Synchroniser » dans le bandeau pour un passage tout de suite. L'espace est relu après chaque passage.
- **Bandeau** : plus de bouton « Script » ni d'explication du script ; « Connexion » (qui montre l'e-mail connecté) et « Synchroniser ». Sans connexion, le bandeau propose de la saisir, avec le lien vers la page Atlassian où créer un token.
- **Script déjà installé** : si le lancement au démarrage du script (`mdbase-jira.cmd` dans le dossier Démarrage) existe, le bandeau le signale (deux synchros écriraient la même base) et propose « Retirer le lancement au démarrage ». Rien n'est retiré sans ce clic.

---

## 17. Serveur MCP et app de bureau [DÉCIDÉ, demandé par Alex le 07/10/2026]

But : piloter l'espace depuis un client MCP (Claude Desktop), puis une app de bureau Tauri (Windows d'abord, puis Mac) qui installe nativement des plugins comme Jira.

### Serveur MCP (premier livrable)
- Paquet **`mdbase.mcpb`**, publié avec le site : un double-clic l'installe dans Claude Desktop (Mac, Windows), qui fournit lui-même Node ; ni droits administrateur ni installation de Node. À l'installation, on choisit le dossier de l'espace.
- Il ne dépend pas de l'app : il lit et écrit les fichiers de l'espace par le cœur (`DepotEspace`), l'app peut être ouverte ou non. Source : `src/outils/mcp/`, assemblé par `npm run mcp`.
- **Mêmes outils que l'assistant (§12)**, avec les mêmes contrôles : `decrire_espace` en plus, sans `repondre`, `retenir`, `oublier` ni `creer_skill` (le client a sa propre réponse et sa propre mémoire). Une base synchronisée (§16) reste en lecture seule.
- **Chaque appel d'écriture s'applique aussitôt**, sans aperçu : c'est le client qui demande l'accord avant chaque appel. Les outils de suppression sont marqués destructeurs. L'annulation de l'app (Ctrl+Z) ne couvre pas ces écritures.
- L'espace est relu sur le disque avant chaque appel (changements faits par l'app ou la synchro), et les écritures sont sur le disque avant la réponse. Les appels passent un par un.
- Aucun appel réseau : le serveur parle au client sur l'entrée et la sortie standard. Ce que le client lit de l'espace part chez le fournisseur de son modèle, comme avec l'assistant.

### App de bureau [DÉCIDÉ, livrée le 07/10/2026 pour Windows]
- Tauri 2, Windows en priorité. La même app web, dans une fenêtre native ; `src-tauri/` pour le code natif.
- **Fichiers** : `AdaptateurBureau` (`src/adapters/tauri/`) appelle des commandes natives (`lister`, `lire`, `ecrire`, `renommer`, `supprimer`, `date_modification`) qui n'acceptent que des chemins sous la racine de l'espace, à la place de File System Access (absent de WebKit sur Mac). Le dossier se choisit par la fenêtre du système ; il est retenu dans les réglages de l'app et rouvert au lancement, sans permission à redonner.
- **Surveillance** : chaque changement dans le dossier (MCP, synchro Jira, autre machine) relit l'espace aussitôt, sans passer par l'indicateur « Relu à » ; la relecture au retour sur la fenêtre reste.
- Pas de service worker. Installeur Windows NSIS par utilisateur (sans droits administrateur), fabriqué par `.github/workflows/bureau.yml`.
- Windows : installeur non signé au début (SmartScreen demande « Exécuter quand même »), Microsoft Store plus tard si besoin. Mac : signature et notarisation avec un compte Apple Developer.
- Plugins installés depuis l'app : Jira d'abord (appel direct, sans CORS ni script au démarrage, §16 « Dans l'app de bureau »), puis le serveur MCP (« Connecter à Claude »).

### Serveur MCP dans l'app de bureau [DÉCIDÉ, demandé par Alex le 09/10/2026]
- Sur le bureau, **c'est l'app qui sert le MCP**, sans Node ni paquet à extraire. Module « Claude (MCP) » (§19), propre à cette machine, désactivé par défaut.
- Le client lance `mdbase.exe --mcp` : ce mode n'ouvre pas de fenêtre, il relaie l'entrée et la sortie standard vers l'app ouverte. **App fermée, il l'ouvre** et attend qu'elle soit prête (45 s au plus) ; sinon, chaque appel répond une erreur qui dit quoi faire (ouvrir l'app, un espace, activer le module).
- Liaison : l'app écoute sur `127.0.0.1` (port au hasard) et n'accepte que les requêtes qui portent un jeton tiré à chaque lancement. Port et jeton sont dans `mcp.json`, dans le dossier des réglages de l'utilisateur (lisible par lui seul hors Windows). Tant que le module n'est pas activé dans un espace ouvert, l'app répond « pas prête » sans rien exécuter.
- Les appels s'exécutent dans la page, sur l'espace ouvert, par le même code que le serveur Node (`core/ia/mcp.ts`) : mêmes outils, mêmes contrôles, écritures aussitôt sur le disque et visibles dans l'app.
- **Connexion depuis Modules** : « Connecter à Claude Desktop » ajoute `mdbase` aux `mcpServers` de sa configuration (installation classique et Microsoft Store), en gardant le reste du fichier et une copie de l'ancien (`claude_desktop_config.avant-mdbase.json`) ; Claude Desktop est à redémarrer. Claude Code : la commande `claude mcp add` à copier, chemin de l'app compris.
- Le paquet `mdbase.mcpb` reste pour qui n'a pas l'app de bureau (Mac aujourd'hui).

---

## 18. Connaissance de l'assistant [DÉCIDÉ, validé par Alex le 07/10/2026 ; budget et rédaction guidée encore à faire]

But : un assistant pertinent sans réexpliquer à chaque demande l'organisation, les workflows et le vocabulaire ; nourri des documents qui arrivent chaque semaine (présentations surtout) ; qui signale ce qui ne colle plus. Tout se gère depuis l'interface (panneau de l'assistant, page Inbox, fenêtre Modules §19) : rien n'apparaît dans les bases, et l'utilisateur n'a jamais à ouvrir ces fichiers (ils restent lisibles, dans `_assistant/`, synchronisés avec le dossier).

### Deux couches
- **Contexte** (`_assistant/contexte.md`) : ce qui bouge peu. Markdown libre, **envoyé en entier à chaque demande**. Sections conseillées, proposées à la création :
  - *Organisation* : la hiérarchie des bases et ce que chaque niveau représente (ex. Projet → Version → Lot → Ticket, les tickets Jira attachés aux tickets) ;
  - *Propagation* : ce qui découle d'un changement (un lot qui glisse décale la livraison de sa version ; une remarque sur un ticket remonte dans le suivi de sa version…) ;
  - *Remarques* : pour chaque base, où et sous quelle forme noter une remarque dans le corps des pages (ex. section « Remarques », une entrée datée par ligne ; sur une version, « Points d'attention » et « Décisions ») ;
  - *Vocabulaire, rituels, interlocuteurs*.
  Première rédaction guidée [PROPOSÉ, pas encore faite : aujourd'hui, un modèle prérempli des sections conseillées] : l'assistant pose des questions (en s'appuyant sur les bases et relations existantes) et propose un texte, que l'utilisateur corrige. Ensuite, il ne change le contexte que par propositions, montrées dans l'aperçu (passage avant → après). Une jauge montre sa taille, avec un plafond indicatif (au-delà, un avertissement, pas un refus).
- **Documents** (`_assistant/documents/`) : ce qui bouge chaque semaine. **Jamais envoyés d'office** : l'assistant y cherche avec deux outils de lecture, `chercher_documents` (mots, du plus récent au plus ancien, passages avec leur document et sa date ; index `minisearch` comme la recherche globale) et `lire_document`. Il cite la source et sa date dans ses réponses.

La mémoire (§12) reste telle quelle : les petits faits et préférences appris en conversation. Le contexte, lui, est le texte de référence de l'utilisateur.

### Fichier d'un document
`_assistant/documents/<date>--<slug>.md` : le document converti en Markdown, avec un frontmatter (nouvelles clés) :
```yaml
---
titre: Point hebdo projet A
source: point-hebdo-A-S41.pptx   # nom du fichier d'origine (le fichier lui-même n'est pas copié)
date: 2026-10-07                 # date de l'information ; à défaut, date de l'ajout
ajoute: 2026-10-07T09:12
lignes: [projets/k2x9m4pq, versions/v3a8c2de]   # lignes concernées, trouvées par l'assistant à l'ajout
remplace_par: 2026-10-14--point-hebdo-projet-a  # absent tant qu'il est à jour
---
```
Un document remplacé reste lisible (`lire_document`) mais n'est plus cherché par défaut.

**Panneau Documents** [DÉCIDÉ, validé par Alex le 07/10/2026] : une entrée « Documents » dans la barre latérale (module Contexte IA, §19), sous « Inbox », avec le nombre de documents à jour. Elle ouvre un panneau à droite, comme l'inbox, avec deux onglets :
- **Documents** : recherche (titre, fichier et texte, sans tenir compte des accents ; l'extrait trouvé s'affiche), regroupement par mois du plus récent au plus ancien, documents remplacés cachés sauf à cocher « Montrer les documents remplacés ». Un clic ouvre la fiche : date, fichier d'origine, date de rangement, lignes concernées (un clic ouvre la ligne dans sa base), document qui le remplace ou qu'il remplace (un clic l'ouvre), puis le texte rendu en Markdown. « Supprimer » après confirmation ; ceux qu'il remplaçait redeviennent à jour.
- **Contexte** : l'édition du contexte, avec son compteur de taille. Un contexte neuf est prérempli des sections conseillées.

### Conversion
À l'ajout, une fois, dans l'app (navigateur comme bureau), sans Python ni service externe : PDF par pdf.js, Word par mammoth, PowerPoint en lisant le XML du `.pptx` (une section par diapositive, titre, texte des formes, tableaux en tableaux Markdown, graphiques en tableau de leurs valeurs, texte des SmartArt, notes de l'orateur). Bibliothèques chargées seulement à la première conversion. Limites, dites à l'ajout : un PDF scanné ne donne pas de texte ; les images et captures d'une présentation sont ignorées (signalées « image non lue »).

### Inbox
**Une page à part** [DÉCIDÉ, validé par Alex le 07/10/2026] : une entrée « Inbox » dans la barre latérale, sous « Toutes les tâches », avec le nombre d'éléments en attente. Elle ouvre un panneau à droite du contenu, comme celui de l'assistant (même place, même poignée ; un seul des deux ouvert à la fois), dédié à l'inbox. L'inbox sert aussi **sans l'assistant** : c'est d'abord un endroit où tout déposer.
- **Déposer** : un champ (remarque brute, copier-coller ; `Ctrl+Entrée`), un bouton « Fichier », et tout le panneau comme zone de dépôt (PDF, Word, PowerPoint, texte).
- **À traiter** : la liste des éléments en attente (`_assistant/inbox/`), du plus récent au plus ancien : icône (note ou fichier), titre, date de réception, début du texte (déplié au clic), question laissée par l'assistant s'il y en a une. Par ligne : « Envoyer à l'IA », « Marquer traité » (sans l'IA), « Supprimer ». En tête : « Tout envoyer à l'IA ».
- **Envoyer à l'IA** (un élément ou tous) ouvre le panneau de l'assistant sur la demande ; le plan se relit et s'applique là, comme toute proposition (§12). L'assistant :
  1. rattache chaque information aux lignes concernées, en suivant l'*Organisation* du contexte ;
  2. propose un plan dans l'aperçu habituel : remarques datées ajoutées au corps des bonnes pages (outil `ajouter_remarque` : ajoute « - JJ/MM/AAAA : … » à la fin d'une section `## …`, créée si elle manque, sans réécrire le reste de la page ; disponible aussi hors inbox), champs à mettre à jour, ce qui en découle selon la *Propagation*, correction du contexte si l'organisation a changé ;
  3. range le fichier en document (frontmatter rempli, `remplace_par` posé sur ceux qu'il remplace, avec confirmation) ;
  4. liste à part les **incohérences**, jamais appliquées : présentation contre bases (date, statut, avancement), contre le statut des tickets Jira attachés, contre la présentation précédente du même projet (une date qui bouge sans explication), contre le contexte.
  Une information qu'il ne sait pas rattacher reste à traiter, avec sa question. Une base Jira (§16) reste en lecture seule : une remarque sur un ticket Jira va sur la ligne de l'utilisateur qui l'attache.
- **Traités** : un élément traité (plan appliqué, ou « Marquer traité ») n'est plus supprimé : il passe dans `_assistant/inbox/traites/`, avec ce qui en a été fait. Section repliée par défaut (« Traités (n) »), du plus récent au plus ancien ; « Vider l'historique » supprime ces fichiers après confirmation. Nouvelles clés du frontmatter d'un élément traité :
  ```yaml
  traite: 2026-10-07T09:20          # date du traitement
  bilan:                             # ce qui a été fait, en phrases lisibles (aperçu du plan appliqué)
    - Noter dans « Navi » (Projets), section Remarques
    - Statut de « Tâche A » (Tâches) : En cours → Terminé
    - "À vérifier : la livraison passe du 15/10 au 29/10 sans explication"
  document: 2026-10-07--point-hebdo-navi-s41   # si le fichier a été rangé en document : son texte n'est pas recopié ici
  ```
  Un élément marqué traité à la main a `bilan: [Marqué traité]`.

### Budget [PROPOSÉ, pas encore fait]
- **Compteur** : chaque réponse du service donne les jetons consommés ; le panneau affiche le coût du mois (prix du modèle saisi ou prérempli). **Plafond mensuel** entièrement réglable par l'utilisateur : aucun par défaut (désactivé tant qu'il n'est pas saisi), montant et devise libres, prix par million de jetons modifiables pour tout modèle (préremplis seulement pour les services connus, jamais imposés). Une fois réglé : avertissement à 80 %, arrêt au plafond, levable pour le mois en cours. Gardé avec la clé, par machine : la vraie garantie reste la limite de dépense réglée dans la console du fournisseur, que l'écran de réglage recommande.
- **Cache de prompt** : un connecteur Anthropic natif, à côté du connecteur générique, marque contexte, outils et description de l'espace comme cachables (relus à environ 10 % du prix pendant quelques minutes). Le connecteur compatible OpenAI reste pour les autres services.
- Documents cherchés et non envoyés ; à l'ajout, seuls le nouveau document et les passages qu'il concerne partent.


## 19. Modules [DÉCIDÉ, validé par Alex le 07/10/2026]

Les fonctions qui ne servent pas à tout le monde s'activent une par une, dans une fenêtre **Modules** (bouton en bas de la barre latérale, au-dessus de « Changer de dossier »). Un interrupteur par module, avec une phrase qui dit ce qu'il fait, et son réglage quand il en a un :

| Module | Ce qu'il montre | Par défaut |
| --- | --- | --- |
| Jira | « Nouvelle base Jira », bandeau de synchro, réglages de la base Jira (§16) | activé si l'espace contient déjà une base Jira |
| Assistant IA | bouton et panneau de l'assistant, `Ctrl+J` ; réglage : la connexion (§12), avec l'avertissement d'activation | désactivé |
| Inbox | entrée et page Inbox (§18) ; sans l'assistant, pas de bouton « Envoyer à l'IA » | désactivé |
| Contexte IA | contexte et documents envoyés ou cherchés par l'assistant (§18) ; entrée et panneau Documents (documents rangés, édition du contexte). Demande l'assistant | désactivé |
| Claude (MCP) | app de bureau seulement : l'app répond aux appels MCP de Claude Desktop ou Claude Code (§17) ; réglage : « Connecter à Claude Desktop » et la commande pour Claude Code | désactivé |

- Désactiver un module **cache** ce qu'il montre ; aucun fichier n'est touché. Une base Jira existante reste une base lisible quand le module est désactivé (sans bandeau de synchro).
- Les choix sont gardés **par machine** (dans le navigateur, comme la clé de l'assistant), pas dans le dossier : aucune nouvelle clé dans `_espace.yaml`.
- Les modules suivants (intégrations tierces) s'ajoutent à la même fenêtre.


---

## 20. Rapports [PROPOSÉ, demandé par Alex le 09/10/2026]

Des pages d'analyse à la manière d'evidence.dev : du Markdown, des requêtes SQL sur les bases, des graphiques qui en citent les résultats. evidence.dev lui-même n'est pas intégré (générateur de site SvelteKit, avec compilation et serveur) : on en reprend le principe, dans l'app et en fichiers.

### Principe

- Un rapport = un fichier `_rapports/<id>.md` à la racine de l'espace. Lisible et modifiable dans n'importe quel éditeur, comme le reste.
- Moteur : **DuckDB-WASM**, le même qu'Evidence. Il tourne dans la page, **sans aucun appel réseau** (fichiers du moteur embarqués dans l'app, jamais un CDN), et ne se charge qu'à l'ouverture d'un rapport, comme la lecture des PDF.
- Chaque base est une **table** du nom de son id (`projets`, `taches`), une colonne par clé de colonne, **colonnes calculées comprises** (rollups, formules) : on lit ce que l'app affiche. Types : nombre, texte, date, booléen ; une relation ou un choix multiple est une liste (ids des lignes liées, valeurs), qu'on déplie par `unnest`.
- **Lecture seule** : les tables sont une copie recréée à chaque calcul, une requête ne peut rien écrire dans l'espace.
- Recalculé quand les bases changent (saisie, relecture du dossier).

### Fichier d'un rapport

````markdown
---
nom: Charge par client
---

# Charge par client

```sql charge
select c.nom as client, count(*) as taches
from taches t, unnest(t.projet) as p(id)
join projets pr on pr.id = p.id
join clients c on list_contains(pr.client, c.id)
group by client order by taches desc
```

```graphique
type: barres
donnees: charge
x: client
y: taches
```
````

- Un bloc ```` ```sql <nom> ```` exécute une requête et nomme son résultat ; un bloc ```` ```graphique ```` (YAML) le montre : `barres`, `courbe`, `secteurs`, `valeur` (un chiffre clé), `tableau`. Le texte autour est du Markdown ordinaire.
- Les blocs SQL s'affichent repliés en lecture, dépliables. Une requête en erreur montre son message à sa place, le reste du rapport s'affiche.
- Librairie de graphiques chargée à la demande : choix à faire à l'implémentation (ECharts comme Evidence, ou plus léger), aux couleurs de l'espace.

### Dans l'app

- Nouveau module **Rapports** (§19), désactivé par défaut : une section Rapports dans la barre latérale, sous les dashboards.
- Édition du rapport dans l'éditeur des pages (CodeMirror), aperçu des résultats sous chaque bloc.
- Fonctionne dans le navigateur comme dans l'app de bureau.
- À trancher : un rapport peut-il aussi être un bloc de dashboard (§10), ou les deux restent-ils séparés ?
- [PLUS TARD] L'assistant écrit un rapport à la demande (« combien de tâches par client ce mois-ci »), montré avant d'être enregistré comme toute proposition.

---

## 15. Questions ouvertes

- Nom du produit.
- Cible au-delà de l'usage personnel d'Alex (positionnement exact, distribution).
- Cardinalité configurable des relations : UX de conversion d'une relation existante.
- Stratégie d'import / export.
