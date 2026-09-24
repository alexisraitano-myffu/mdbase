# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 71 files · ~34,379 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 522 nodes · 1121 edges · 28 communities (23 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `18065e48`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
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
- [[_COMMUNITY_Community 27|Community 27]]

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 50 edges
2. `DepotBase` - 24 edges
3. `colonne` - 20 edges
4. `AdaptateurMemoire` - 18 edges
5. `Schema` - 16 edges
6. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
7. `joindre()` - 14 edges
8. `compilerOptions` - 13 edges
9. `estSaisie()` - 12 edges
10. `lireSchema()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `agreger()` --calls--> `natureDe()`  [EXTRACTED]
  src/core/calcul.ts → src/core/schema.ts
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-espace.test.ts → src/core/fixtures/outils.ts
- `DepotEspace` --references--> `ConfigEspace`  [EXTRACTED]
  src/core/depot-espace.ts → src/core/espace-config.ts
- `relationVers()` --calls--> `colonne`  [EXTRACTED]
  src/core/depot-espace.ts → src/core/schema.ts
- `ok()` --calls--> `correspond()`  [EXTRACTED]
  src/core/filtres.test.ts → src/core/filtres.ts

## Import Cycles
- None detected.

## Communities (28 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml, devDependencies, @types/node (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (12): AdaptateurMemoire, estConfiguration(), listerBases(), AdaptateurFichiers, Entree, FichierIntrouvable, joindre(), nomDe() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (38): aleatoire(), aujourdhui(), planifier(), ChargementBase, LigneChargee, EtatBase, EtatEspace, TypeCreable (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (33): BaseChargee, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), contientCle(), Entree, Aleatoire (+25 more)

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
Cohesion: 0.09
Nodes (8): OptionsDepot, DepotEspace, relationVers(), f(), ColonneRelation, OperationSchema, ModificationVue, Vue

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (8): espace(), Planifier, ouvrir(), ouvrir(), AdaptateurCompteur, aleatoire(), horlogeCroissante(), minuteur()

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (47): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+39 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (27): COULEURS, OptionsEspace, assurerListe(), assurerMap(), barreLaterale(), chaines(), ConfigEspace, ErreurEspace (+19 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (36): agreger(), BaseACalculer, calculer(), calculerInverse(), Calculs, erreur(), preparerRollup(), RollupPret (+28 more)

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (9): ColonneChoix, lireNombre(), Cellule(), EditeurNombre(), formaterDate(), Pastille(), Props, couleurOption() (+1 more)

## Knowledge Gaps
- **142 isolated node(s):** `Commandes`, `Architecture et conventions (refacti)`, `Tests`, `Jalons`, `graphify` (+137 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 3`, `Community 5`, `Community 15`, `Community 19`, `Community 24`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 3`, `Community 5`, `Community 9`, `Community 15`, `Community 24`, `Community 27`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 26` to `Community 3`, `Community 5`, `Community 9`, `Community 19`, `Community 24`, `Community 27`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `Commandes`, `Architecture et conventions (refacti)`, `Tests` to the rest of the system?**
  _142 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14793741109530584 - nodes in this community are weakly interconnected._