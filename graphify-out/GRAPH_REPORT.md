# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 109 files · ~65,950 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 805 nodes · 2022 edges · 46 communities (42 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `913ad683`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 80 edges
2. `colonne` - 37 edges
3. `DepotBase` - 34 edges
4. `LigneChargee` - 25 edges
5. `Schema` - 23 edges
6. `AdaptateurMemoire` - 20 edges
7. `natureDe()` - 19 edges
8. `joindre()` - 19 edges
9. `useLancer()` - 19 edges
10. `useEspace()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `cheminVue()` --calls--> `joindre()`  [EXTRACTED]
  src/core/depot-espace.ts → src/core/fichiers.ts
- `lireFiltre()` --calls--> `estObjet()`  [EXTRACTED]
  src/core/vue.ts → src/core/schema.ts
- `ChoixLigne()` --calls--> `useEspace()`  [EXTRACTED]
  src/ui/EditeurFiltres.tsx → src/ui/contexte-espace.tsx
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts

## Import Cycles
- None detected.

## Communities (46 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (46): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (29): dependencies, @dnd-kit/core, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (19): AdaptateurMemoire, BaseChargee, chargerBase(), FichierNonReconnu, charger(), espace(), Entree, ouvrir() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.20
Nodes (14): agreger(), BaseACalculer, calculer(), calculerInverse(), erreur(), preparerRollup(), RollupPret, ctx (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (8): Architecture et conventions (refacti), Changelog, Commandes, Environnement, graphify, Jalons, mdbase (nom provisoire), Tests

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (8): compilerOptions, jsx, lib, tsBuildInfoFile, types, exclude, extends, include

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (7): compilerOptions, lib, tsBuildInfoFile, types, exclude, extends, include

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (20): lireDashboard(), OptionsDepot, cheminPage(), DepotEspace, assurerListe(), assurerMap(), barreLaterale(), chaines() (+12 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.31
Nodes (10): boucle(), decrireBoucle(), dependancesDirectes(), estCalculee(), Noeud, ordonner(), Ordre, referencesFormule() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (14): compiler(), estType(), Resolveur, typerAppel(), analyser(), decouper(), ErreurFormule, Jeton (+6 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (45): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+37 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (26): LigneChargee, afficher(), contientCle(), DepotBase, superposer(), relationVers(), LigneVue, colonnesDeLaVue() (+18 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (59): aleatoire(), aujourdhui(), maintenant(), planifier(), ChargementBase, calculsPour(), EtatBase, EtatEspace (+51 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (17): Planifier, ouvrir(), ouvrir(), schemaDe(), colonnes(), ErreurSchema, indexColonne(), modifierSchema() (+9 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (28): enregistrerLigne(), ligne(), appliquer(), assembler(), creerLigne(), Decoupage, decouper(), ErreurEcriture (+20 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (21): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), miseEnPageParDefaut() (+13 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (48): ajouterMois(), apresGeste(), debutMois(), decaler(), decalerValeur(), ecartJours(), Echelle, enUTC() (+40 more)

### Community 41 - "Community 41"
Cohesion: 0.06
Nodes (46): Calculs, appliquerEnMemoire(), Bloc, BlocPropre, BlocReference, Dashboard, ErreurDashboard, estPropre() (+38 more)

### Community 42 - "Community 42"
Cohesion: 0.18
Nodes (7): enTexte(), Environnement, Fonction, FONCTIONS, format, formaterDate(), NOMS_TYPES

### Community 43 - "Community 43"
Cohesion: 0.20
Nodes (10): ColonneFormule, ColonneRollup, ColonneSimple, Commun, LectureSchema, lireColonne(), lireOptions(), Nature (+2 more)

### Community 44 - "Community 44"
Cohesion: 0.24
Nodes (9): ErreurCalcul, ValeurFormule, evaluer(), resoudreParNom(), calcul(), env, erreur(), { schema } (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.22
Nodes (9): afficherExpression(), guillemets(), remplacerRefs(), stockerExpression(), typeDeColonne(), EditeurFormule(), Props, Suggestion (+1 more)

## Knowledge Gaps
- **186 isolated node(s):** `Commandes`, `Architecture et conventions (refacti)`, `Tests`, `Jalons`, `graphify` (+181 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 39`, `Community 40`, `Community 41`, `Community 45`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 3` to `Community 2`, `Community 38`, `Community 39`, `Community 40`, `Community 41`, `Community 43`, `Community 44`, `Community 45`, `Community 15`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 39`, `Community 40`, `Community 41`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `Commandes`, `Architecture et conventions (refacti)`, `Tests` to the rest of the system?**
  _186 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1033182503770739 - nodes in this community are weakly interconnected._