# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 42 files · ~15,647 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 306 nodes · 520 edges · 22 communities (17 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6b7468d7`
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `DepotBase` - 17 edges
2. `AdaptateurMemoire` - 16 edges
3. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
4. `joindre()` - 13 edges
5. `compilerOptions` - 13 edges
6. `AdaptateurFsa` - 12 edges
7. `lireLigne()` - 11 edges
8. `parent()` - 11 edges
9. `mdbase (nom provisoire)` - 8 edges
10. `lireSchema()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `col()` --calls--> `schemaProjets()`  [EXTRACTED]
  src/core/valeurs.test.ts → src/core/fixtures/schema-projets.ts
- `charger()` --calls--> `chargerBase()`  [EXTRACTED]
  src/core/base.test.ts → src/core/base.ts
- `superposer()` --calls--> `encoder()`  [EXTRACTED]
  src/core/depot-base.ts → src/core/valeurs.ts
- `lireLigne()` --calls--> `decoder()`  [EXTRACTED]
  src/core/ligne.ts → src/core/valeurs.ts
- `appliquer()` --calls--> `encoder()`  [EXTRACTED]
  src/core/ligne.ts → src/core/valeurs.ts

## Import Cycles
- None detected.

## Communities (22 total, 5 thin omitted)

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
Cohesion: 0.16
Nodes (13): aleatoire(), planifier(), choisirDossier(), demanderPermission(), DossierMemorise, navigateurCompatible(), retrouverDossier(), transaction() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (48): BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), Entree, OptionsDepot (+40 more)

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
Cohesion: 0.52
Nodes (4): Aleatoire, genererId(), nomFichierLigne(), slug()

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (13): LigneChargee, lireNombre(), Cellule(), EditeurNombre(), formaterDate(), Pastille(), Props, couleurOption() (+5 more)

### Community 21 - "Community 21"
Cohesion: 0.32
Nodes (5): Planifier, AdaptateurCompteur, horlogeCroissante(), minuteur(), ouvrir()

## Knowledge Gaps
- **127 isolated node(s):** `Added`, `Changed`, `Fixed`, `Commandes`, `Architecture et conventions (refacti)` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotBase` connect `Community 20` to `Community 19`, `Community 21`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `joindre()` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14793741109530584 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._