# mdbase (nom provisoire)

Bases de données relationnelles avec l'ergonomie des bases Notion, dont le seul stockage est un dossier de fichiers Markdown + YAML. App web 100 % statique (Chrome / Edge, File System Access API), local-first, aucun appel réseau hors module IA (désactivé par défaut, spec §12).

**La spec fait foi : `docs/SPEC.md`. La lire en entier avant toute implémentation.** Les points `[DÉCIDÉ]` ne se rediscutent pas sans validation d'Alexis ; les points `[PLUS TARD]` ne s'implémentent pas mais ne doivent pas être rendus impossibles.

## Commandes

```bash
npm run dev         # serveur Vite (ouvrir dans Chrome ou Edge)
npm test            # Vitest, une passe (tests du cœur, dans Node)
npm run test:watch
npm run test:e2e    # Playwright : l'interface dans Chrome sans fenêtre (e2e/), réutilise le `npm run dev` lancé
npm run typecheck   # tsc -b sur les trois projets (core, app, test)
npm run build       # typecheck + build statique dans dist/ (BASE=/mdbase/ pour le sous-chemin de GitHub Pages)
CAPTURES=1 npx playwright test captures   # refait les captures du README (docs/captures/)
```

Pour tester à la main : `npm run dev`, puis « Essayer avec la démo » (copie dans le stockage du navigateur, OPFS) ou ouvrir **une copie** de la démo (`cp -r exemples/espace-demo ~/mdbase-essai`). `exemples/espace-demo/` est une référence (Clients → Projets → Tâches, rollups de rollups) vérifiée par `src/exemples.test.ts` : ne pas y laisser de données d'essai.

## Architecture et conventions (refacti)

```
src/
  core/          TypeScript pur, zéro dépendance UI : parsing, schéma, index,
                 graphe de dépendances, rollups, formules, filtres, écriture
    filtre-global.ts       filtres globaux d'un dashboard : lignes retenues par base, blocs qui suivent leurs relations
    fichiers.ts            interface AdaptateurFichiers (lister, lire, ecrire,
                           renommer, supprimer, dateModification) + helpers de chemins
    adaptateur-memoire.ts  implémentation en mémoire, double des tests
    schema.ts / valeurs.ts lecture tolérante de `_schema.yaml`, décodage/encodage par type
    ligne.ts               lecture d'une ligne, réécriture par l'API Document de `yaml`
    base.ts                chargement d'une base, écriture sûre (date de modification)
    depot-base.ts          état vivant d'une base ouverte : affichage immédiat,
                           écritures regroupées (300 ms) et sérialisées par fichier
    depot-espace.ts        espace ouvert : bases, barre latérale, opérations de schéma
                           (orchestre schéma + lignes, ex. suppression de colonne)
    schema-ecriture.ts     réécriture de `_schema.yaml` (API Document)
    espace-config.ts       lecture/réécriture de `_espace.yaml`, barre latérale effective
    vue.ts                 lecture/réécriture des `_vues/*.yaml`
    filtres.ts             évaluation des filtres, tris, héritage à la création, application d'une vue
    graphe.ts              graphe de dépendances des colonnes calculées, ordre topologique, boucles
    calcul.ts              valeurs des colonnes calculées (relations non propriétaires, rollups)
    mise-en-page.ts        lecture/réécriture des `_pages/*.yaml`, règles d'affichage d'une page
    groupes.ts             colonnes d'une vue, groupement, nouvelle valeur d'une carte déplacée
    formules/              syntaxe.ts (jetons, arbre), fonctions.ts (liste fermée typée),
                           formule.ts (typage, évaluation, noms ↔ clés pour l'éditeur) ;
                           jamais d'eval (invariant 8, testé sur les sources)
    arbre-temps.ts         timeline en arbre : lignes liées par les relations cochées, niveau par niveau (filtres, boucles)
    temps.ts               jours ISO en UTC pur, grille du calendrier, placement des plages,
                           gestes (déplacer, étirer), étendue et graduations de la timeline
    dashboard.ts           lecture/réécriture des `_dashboards/*.yaml`, même opération en mémoire
    recherche.ts           index plein texte (MiniSearch) de toutes les bases, extraits surlignés
    echange.ts             import/export : grille d'une vue, CSV (écriture, lecture), Markdown (écriture, lecture),
                           HTML, tableau collé, types devinés d'un CSV
    conflits.ts            ids en double, copies de conflit de synchro (suffixe de machine OneDrive)
    historique.ts          annuler / rétablir : changements notés par DepotBase (journal), étapes groupées par DepotEspace.enUneEtape
    ia/                    assistant IA (spec §12, « Module IA ») : modele.ts (interface ModeleIA,
                           indépendante du fournisseur), outils.ts (outils, consigne, description de
                           l'espace envoyée), plan.ts (validation des appels comme une saisie, application
                           après confirmation), structure.ts (outils de structure et de suppression :
                           Brouillon où les appels se valident dans l'ordre, Correspondances des ids prévus
                           vers les ids réels), references.ts (retrouver base, colonne, ligne, filtres), assistant.ts (un appel, une relance si refus, historique de
                           conversation), memoire.ts (`_assistant/` : mémoire écrite aussitôt, skills
                           écrits après confirmation)
    fixtures/              données de test partagées
  adapters/
    fsa/         implémentation File System Access + dossier mémorisé (IndexedDB)
                 + démo sans installation (demo.ts : la démo copiée dans l'OPFS)
    ia/          connecteur compatible OpenAI (seul appel réseau de l'app) et réglages (localStorage)
    navigateur.ts  services injectés dans le cœur (aléatoire, minuteur)
  ui/            React
  main.tsx       point d'entrée mince : monte l'UI, aucune logique
```

- **Le cœur n'importe ni React, ni le DOM, ni Node** (spec §12). Deux protections, à ne jamais contourner :
  - `tsconfig.core.json` compile `src/core` sans lib DOM ni types : `window`, `document`, `process` n'y existent pas ;
  - `src/core/architecture.test.ts` refuse tout import hors du cœur, sauf la liste fermée `LIBRAIRIES_AUTORISEES` (à étendre explicitement quand une librairie sans DOM est ajoutée, ex. `yaml`, `minisearch`).
- **Seuls les adaptateurs touchent au système de fichiers.** Le cœur reçoit un `AdaptateurFichiers` en paramètre, il ne le fabrique jamais.
- Le cœur n'a ni minuteur, ni `crypto`, ni horloge : `Planifier`, `Aleatoire` et la date du jour (`Contexte.aujourdhui`) lui sont injectés.
- Corps des pages : éditeur Milkdown (Crepe, sans IA, images ni LaTeX), chargé à la demande. Il normalise le Markdown qu'il réécrit : il ne remonte un changement qu'après une action de l'utilisateur, donc ouvrir une page ne réécrit jamais le fichier.
- Colonnes calculées : jamais stockées, recalculées dans `DepotEspace` à chaque modification de lignes, sur tout l'espace (écart assumé au « recalcul incrémental » du §12 : simple et assez rapide pour quelques milliers de lignes ; à revoir si ça rame). L'UI lit des lignes « enrichies » (cellules stockées + calculées).
- Filtres, tris et affichage s'appuient sur la **nature** d'une colonne (`natureDe` : texte, nombre, date, case, choix, liste), pas sur son type : un rollup se comporte comme son résultat.
- Écart assumé à la spec §8 : une ligne **modifiée** dans la vue reste visible (« sortira de la vue ») comme une ligne créée, sinon elle disparaîtrait en pleine édition.
- TanStack Table est en **v9** (`useTable`, fonctionnalités déclarées via `tableFeatures`) : les exemples v8 (`useReactTable`, `getCoreRowModel`) ne marchent pas. Guides à jour dans `node_modules/@tanstack/*/skills/`.
- Fichiers de configuration (`_schema.yaml`, `_espace.yaml`…) : toujours relus sur le disque juste avant d'être modifiés, jamais réécrits depuis un état en mémoire.
- Chemins : relatifs à la racine de l'espace, séparés par `/`, racine = `""`.
- Icônes : Lucide uniquement, via `src/ui/icones.tsx` (`Icone`, `ICONES` par type de colonne, `ICONES_VUES`) ; plus de caractères Unicode comme icônes. Couleurs : variables CSS du `:root` de `app.css`, jamais de couleur en dur ailleurs.
- Skills de design (emilkowalski/skill) installés **dans ce projet seulement** (`.claude/skills/`, ignoré par git) : en essai avant de les rendre globaux.
- Mode consultation (`src/ui/mode.tsx`, `useConsultation()`) : lecture seule dans tout l'espace. Tout nouveau contrôle qui modifie quelque chose (bouton, menu, glisser, double-clic, raccourci) se masque ou se désactive quand il est vrai ; seuls les filtres rapides restent réglables.
- Assistant IA : le modèle ne touche jamais aux fichiers. Il propose des appels d'outils que `ia/plan.ts` valide contre l'état de l'espace, et rien n'est écrit avant « Appliquer ». Toute nouvelle capacité passe par un outil validé de la même façon, jamais par du texte interprété.
- Annulation : toute action qui touche plusieurs fichiers de données passe par `DepotEspace.enUneEtape` (un seul Ctrl+Z). Une nouvelle écriture de données doit passer par `DepotBase.modifier/creer/supprimer`, sinon elle échappe au journal.
- Nommage en français, comme la spec et le format de fichiers (`lister`, `colonnes`, `champ_titre`).
- Découper quand un module grandit vraiment, jamais par avance ; les sous-dossiers de `core/` apparaîtront avec les jalons (relations, formules…).
- Le nettoyage structurel est un commit à part, jamais mélangé à une fonctionnalité.

Trois projets TypeScript (`tsconfig.core.json`, `tsconfig.app.json`, `tsconfig.test.json`), tous en `strict` + `noUncheckedIndexedAccess`.

## Tests

- Vitest, fichiers `*.test.ts` à côté du code, environnement Node.
- Les tests du cœur tournent sur `AdaptateurMemoire` (horloge injectable pour les dates) : ni navigateur, ni disque.
- **Règle stricte : aucune fonctionnalité sans test.** Unitaire par défaut ; les 9 invariants de la spec (§13) deviennent des tests dès qu'ils sont atteignables, et ne se retirent jamais.
- Chemins critiques (perte de données : écriture, réécriture préservant les champs inconnus, suppressions, renommages) : `npm test` avant tout commit qui les touche.
- Bout en bout : Playwright dans `e2e/` (`*.spec.ts`, hors Vitest). La fixture `e2e/espace.ts` ouvre une copie neuve de la démo par test : `showDirectoryPicker` y est remplacé par un dossier OPFS (même API de fichiers, sans sélecteur à cliquer), et `espace.ecrire/lire/supprimer` simulent les changements faits ailleurs. Toute erreur de console fait échouer le test. `@playwright/test` est figé sur la version dont le navigateur est déjà en cache (pas de téléchargement) ; le monter implique `npx playwright install chromium-headless-shell`.
- `E2E_URL` vise une autre adresse que le serveur de dev : la CI joue les e2e sur le build publié (`vite preview` sous `/mdbase/`). Les tests naviguent en relatif (`page.goto('./')`) pour supporter ce sous-chemin.
- Fichiers e2e par domaine : `tableau` (édition, relations, sélection et actions en lot, recopie, copier-coller), `schema` (colonnes, filtres, formules), `vues` (pages, kanban, temps, dashboards, recherche, socle), `echange` (import/export), `synchro`, `accueil`, `assistant` (service IA simulé par `page.route`). Vues temporelles : `page.clock.setFixedTime` avant d'ouvrir la base (la démo est datée de l'automne 2026).
- Une fonctionnalité d'interface livrée reçoit son test de bout en bout ; la validation d'Alexis dans Chrome reste le dernier mot sur le ressenti.

## Jalons

Suivre l'ordre de la spec §14, un jalon livré et testé avant le suivant. État :
- [x] 1. Socle
- [x] 2. Lecture/écriture
- [x] 3. Tableau minimal (validé dans Chrome ; finitions du ressenti à reprendre plus tard)
- [x] 4. Gestion du schéma (validé dans Chrome)
- [x] 5. Filtres, tris, filtres rapides (validé dans Chrome)
- [x] 6. Relations et rollups (validé dans Chrome)
- [x] 7. Pages (validé dans Chrome)
- [x] 8. Vues : groupement, kanban, collection (validé dans Chrome)
- [x] 9. Vues temporelles : calendrier, timeline (validé dans Chrome ; retours d’usage à venir)
- [x] 10. Formules (validé dans Chrome)
- [x] 11. Dashboards et recherche globale (validé dans Chrome)
- [x] 12. Robustesse synchro (validé de bout en bout : Chrome piloté, dossier de test en OPFS)

V1 complète (spec §14).

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Changelog

**Cadence : en fin de session, pas à chaque commit.** Mettre à jour à la fin d'une session de travail, ou dès qu'un gros lot de changements s'est accumulé ; Claude le propose quand il voit que beaucoup a changé depuis la dernière mise à jour. L'entrée décrit ce qui est désormais sur `main`.

Changelog = `CHANGELOG.md` (Keep a Changelog), entrées sous `[Unreleased]`. Pas de projet Linear pour l'instant : relancer `/init-repo` une fois créé pour basculer.

## Publication

Dépôt public `alexisraitano-myffu/mdbase` (licence MIT). `.github/workflows/pages.yml` : à chaque push sur `main`, typage, tests, build sous `/mdbase/`, e2e sur ce build, puis publication sur GitHub Pages (https://alexisraitano-myffu.github.io/mdbase/). Dépôt public : aucun identifiant de ticket Linear ni donnée personnelle dans le code, les fichiers ou les messages de commit. `graphify-out/` reste local (ignoré par git).

## Environnement

Aucune variable d’environnement. Aucune télémétrie. Seul appel réseau : le module IA, désactivé par défaut, vers l’adresse que l’utilisateur a saisie (spec §12, « Module IA »).
