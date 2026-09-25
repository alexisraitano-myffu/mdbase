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

### Rollups
- Un rollup référence une colonne `relation` de sa base et une colonne (`champ`) de la base liée.
- **N'importe quelle colonne** de la base liée peut être remontée, y compris un rollup ou une formule.
- Calculs disponibles :
  - `afficher` (valeurs brutes)
  - `compter`, `compter_valeurs`, `compter_uniques`, `compter_vides`, `compter_non_vides`
  - `pourcent_coches`, `pourcent_non_coches`
  - `somme`, `moyenne`, `mediane`, `min`, `max`, `amplitude`
  - `date_plus_tot`, `date_plus_tard`
- Filtre optionnel sur les lignes liées avant calcul (ex. ne compter que les tâches non terminées).
- **Rollups de rollups autorisés**, sans limite de profondeur.
- Le résultat d'un rollup a un type (nombre, date, liste…) et se comporte **exactement comme une colonne saisie** pour les filtres, tris, groupements et calculs.

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

### Par type
- **Tableau** : groupement optionnel (repliable), largeur des colonnes, retour à la ligne, calculs en pied de colonne (et par groupe).
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
- **Kanban** : champ de groupe (`select`, `checkbox`, `relation`), sous-groupe optionnel (couloirs horizontaux), champs affichés sur la carte, glisser-déposer entre colonnes qui modifie la valeur. Sur une relation, le déplacement **remplace** le lien (pas d'ajout). Grouper sur une relation multi-valeurs n'est pas une bonne pratique : ce cas trouvera sa vraie place avec les relations 1-n [PLUS TARD].
- **Collection** : cartes affichant les champs choisis et, en option, les premières lignes du corps.
- **Calendrier** : champ date utilisé, champ de fin optionnel pour les plages, vue mois / semaine, champs affichés sous le titre, glisser-déposer pour changer la date (la ligne suit le pointeur et s'accroche au jour le plus proche au relâcher).
- **Timeline** : champ de début, champ de fin, **champs jalons** (zéro ou plusieurs colonnes date affichées comme des points sur la ligne), zoom semaine / mois / trimestre, champs affichés sur la barre, groupement optionnel (repliable ; l'en-tête d'un groupe porte une barre calculée qui couvre ses lignes, non déplaçable), date exacte affichée pendant un glisser, redimensionnement et déplacement des barres à la souris (au pixel, accroché au jour au relâcher).
- Calendrier et timeline : une ligne sans date n'apparaît pas au calendrier (compteur « sans date ») ; dans la timeline elle garde sa rangée, et un clic sur la rangée la place à cette date. Une fin absente ou antérieure au début donne une plage d'un jour. Déplacer ou étirer garde l'heure d'une date qui en a une. Les colonnes calculées (rollup de date) s'affichent mais ne se glissent pas.

### Exemple `_vues/planning.yaml`

```yaml
id: planning
nom: Planning
type: timeline          # ou calendrier
champ_debut: debut      # calendrier : le champ date utilisé
champ_fin: echeance     # optionnel
champs_jalons: [revue]  # timeline seulement
champs_carte: [client]  # champs affichés, comme pour le kanban
echelle: mois           # calendrier : mois | semaine ; timeline : semaine | mois | trimestre
```

### Exemple `_vues/kanban-statut.yaml`

```yaml
id: kanban-statut
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
  - type: corps
```

### Corps de la page
- Éditeur Markdown riche qui **produit du Markdown propre** (Milkdown, ou CodeMirror 6 avec aperçu en direct).
- Pas d'images en V1.

---

## 10. Dashboards

- Listés en haut de la barre latérale.
- Un dashboard = une suite de **blocs empilés verticalement**, chaque bloc pouvant être seul ou à deux côte à côte sur une rangée.
- Un bloc = une vue d'une base : soit une **référence** à une vue existante de la base, soit une **vue propre au dashboard**, écrite directement dans le fichier du dashboard, au même format qu'un fichier `_vues/*.yaml`. Une vue propre n'apparaît pas dans la liste des vues de la base.

```yaml
id: pilotage
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
```

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
- Éditeur de corps : Milkdown ou CodeMirror 6.
- MiniSearch pour la recherche.
- Vitest pour les tests du cœur.

### Environnement navigateur
- API File System Access : fonctionne sur **Chrome et Edge** (cible Windows), pas sur Firefox ni Safari. Afficher un message clair sur les navigateurs non compatibles.
- Le handle du dossier est conservé dans IndexedDB pour ne pas redemander le dossier à chaque ouverture (seule la permission est redemandée).
- **Changements externes** (synchro OneDrive depuis une autre machine) : le navigateur ne peut pas surveiller le dossier. À chaque retour sur l'onglet (`visibilitychange` / `focus`), rescanner les dates de modification et recharger les fichiers modifiés. Bouton de rafraîchissement manuel en complément. (Jalon 12 : relecture de tout l'espace, dates des lignes comparées, fichiers de configuration relus ; une relecture croisée par une écriture de l'app est jetée et refaite au coup suivant.)
- Application **100 % statique** : aucun appel réseau, aucune télémétrie.

### Module IA [DÉCIDÉ]
Seule exception à « aucun appel réseau » (validée par Alex le 25/09/2026, après la V1).
- **Désactivé par défaut.** L'activer affiche d'abord un avertissement qui dit quelles données partent et vers quelle adresse ; rien n'est envoyé avant l'activation.
- **Connecteur générique** : tout service compatible OpenAI (`/chat/completions` avec appels d'outils), distant ou local. L'utilisateur fournit l'adresse, sa clé et le nom du modèle ; la clé reste dans son navigateur. Aucun fournisseur imposé, aucune clé embarquée.
- **Périmètre** : le modèle ne voit et ne modifie que l'espace ouvert. Il ne touche jamais aux fichiers : il propose des opérations typées (outils), que le cœur valide comme une saisie de l'interface (colonnes, types, options, lignes existantes).
- **Aperçu obligatoire** : toute écriture proposée est montrée (lignes, colonnes, avant → après) et n'est appliquée qu'après confirmation. Une proposition invalide est refusée en entier, jamais appliquée à moitié.
- Le cœur définit l'interface du modèle et les outils ; l'appel réseau vit dans un adaptateur.
- **Conversation** : les derniers échanges sont renvoyés au modèle ; le fil est gardé dans le navigateur (brouillon, pas dans le dossier).
- **Mémoire** (`_assistant/memoire.md`, §3) : le modèle retient un fait quand l'utilisateur le demande ou exprime une préférence durable ; écrit aussitôt, avec une mention « Retenu : … » annulable. Jamais une valeur de ligne.
- **Skills** (`_assistant/skills/`, §3) : procédures nommées créées à la demande de l'utilisateur, avec confirmation comme une modification de données. Les skills et la mémoire sont envoyés au modèle avec la structure de l'espace, et l'avertissement d'activation le dit.
- **Structure** : le modèle peut aussi créer une base, ajouter, renommer ou supprimer des colonnes (tous les types, relations avec leur miroir, rollups, formules), créer, régler ou supprimer des vues (filtres, tris, groupement, colonnes affichées), créer ou supprimer des dashboards, supprimer des lignes et écrire le contenu d'une page. Les appels d'une même réponse sont validés dans l'ordre sur un brouillon de l'espace : une colonne ou une base créée peut être remplie aussitôt. Application dans l'ordre structure, puis données, puis suppressions de lignes et contenu.
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

## 15. Questions ouvertes

- Nom du produit.
- Cible au-delà de l'usage personnel d'Alex (positionnement exact, distribution).
- Cardinalité configurable des relations : UX de conversion d'une relation existante.
- Stratégie d'import / export.
- Moment de passer à Tauri (probablement quand la surveillance du dossier en temps réel devient nécessaire).
