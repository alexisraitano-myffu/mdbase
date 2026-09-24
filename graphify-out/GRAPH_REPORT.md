# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 22 files · ~7,229 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 184 nodes · 246 edges · 17 communities (13 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `08901fe4`
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

## God Nodes (most connected - your core abstractions)
1. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
2. `AdaptateurMemoire` - 14 edges
3. `compilerOptions` - 13 edges
4. `AdaptateurFsa` - 12 edges
5. `joindre()` - 11 edges
6. `parent()` - 10 edges
7. `mdbase (nom provisoire)` - 8 edges
8. `scripts` - 7 edges
9. `segments()` - 7 edges
10. `9. Pages` - 7 edges

## Surprising Connections (you probably didn't know these)
- `AdaptateurFsa` --implements--> `AdaptateurFichiers`  [EXTRACTED]
  src/adapters/fsa/adaptateur-fsa.ts → src/core/fichiers.ts
- `AdaptateurMemoire` --implements--> `AdaptateurFichiers`  [EXTRACTED]
  src/core/adaptateur-memoire.ts → src/core/fichiers.ts

## Import Cycles
- None detected.

## Communities (17 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (37): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+29 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (24): dependencies, react, react-dom, devDependencies, @types/node, @types/react, @types/react-dom, @types/wicg-file-system-access (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.24
Nodes (8): AdaptateurMemoire, AdaptateurFichiers, Entree, FichierIntrouvable, joindre(), nomDe(), parent(), segments()

### Community 3 - "Community 3"
Cohesion: 0.21
Nodes (9): listerBases(), choisirDossier(), demanderPermission(), DossierMemorise, navigateurCompatible(), retrouverDossier(), transaction(), App() (+1 more)

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
Cohesion: 0.29
Nodes (7): 9. Pages, Contenu d'une mise en page, Corps de la page, Exemple `_pages/suivi.yaml`, Mises en page [DÉCIDÉ], Onglets relation, Ouverture

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

## Knowledge Gaps
- **103 isolated node(s):** `PreToolUse`, `name`, `version`, `dev`, `build` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SPEC — Base de données Markdown + YAML (nom provisoire)` connect `Community 0` to `Community 9`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `9. Pages` connect `Community 9` to `Community 0`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `AdaptateurFsa` connect `Community 5` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `name`, `version` to the rest of the system?**
  _103 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._