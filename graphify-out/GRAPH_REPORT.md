# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 88 files · ~42,530 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 593 nodes · 1423 edges · 38 communities (34 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4bd1f66a`
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
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 62 edges
2. `DepotBase` - 30 edges
3. `colonne` - 23 edges
4. `Schema` - 21 edges
5. `AdaptateurMemoire` - 20 edges
6. `joindre()` - 19 edges
7. `LigneChargee` - 16 edges
8. `estObjet()` - 16 edges
9. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
10. `lireLigne()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `cheminVue()` --calls--> `joindre()`  [EXTRACTED]
  src/core/depot-espace.ts → src/core/fichiers.ts
- `lireFiltre()` --calls--> `estObjet()`  [EXTRACTED]
  src/core/vue.ts → src/core/schema.ts
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `decoder()` --calls--> `ok()`  [INFERRED]
  src/core/valeurs.ts → src/core/filtres.test.ts

## Import Cycles
- None detected.

## Communities (38 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (28): dependencies, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml, devDependencies (+20 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (27): AdaptateurMemoire, BaseChargee, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), Entree, Planifier (+19 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (36): aleatoire(), aujourdhui(), planifier(), ChargementBase, EtatEspace, LigneVue, Aleatoire, cleColonne() (+28 more)

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
Nodes (30): espace(), OptionsDepot, cheminPage(), cheminVue(), COULEURS, DepotEspace, OptionsEspace, assurerListe() (+22 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (8): colonnes(), ErreurSchema, indexColonne(), modifierSchema(), nouveauSchema(), cles(), trouverColonne(), Option

### Community 17 - "Community 17"
Cohesion: 0.08
Nodes (34): ligne(), appliquer(), assembler(), creerLigne(), Decoupage, decouper(), LectureLigne, Ligne (+26 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (51): EtatBase, appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte (+43 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (7): LigneChargee, afficher(), contientCle(), DepotBase, superposer(), Modifications, Schema

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (46): agreger(), BaseACalculer, calculer(), calculerInverse(), Calculs, erreur(), preparerRollup(), RollupPret (+38 more)

### Community 39 - "Community 39"
Cohesion: 0.13
Nodes (22): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), MiseEnPage (+14 more)

## Knowledge Gaps
- **149 isolated node(s):** `Added`, `Changed`, `Fixed`, `Commandes`, `Architecture et conventions (refacti)` (+144 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 39`, `Community 19`, `Community 20`, `Community 26`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 3`, `Community 39`, `Community 9`, `Community 17`, `Community 19`, `Community 26`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `joindre()` connect `Community 2` to `Community 9`, `Community 20`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _149 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07115677321156773 - nodes in this community are weakly interconnected._