# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 65 files · ~29,523 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 476 nodes · 955 edges · 25 communities (21 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6e973dde`
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

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 41 edges
2. `DepotBase` - 24 edges
3. `AdaptateurMemoire` - 17 edges
4. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
5. `joindre()` - 14 edges
6. `colonne` - 13 edges
7. `compilerOptions` - 13 edges
8. `lireLigne()` - 12 edges
9. `AdaptateurFsa` - 12 edges
10. `parent()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `ok()` --calls--> `correspond()`  [EXTRACTED]
  src/core/filtres.test.ts → src/core/filtres.ts
- `EditeurTris()` --calls--> `colonnesFiltrables()`  [EXTRACTED]
  src/ui/BarreVue.tsx → src/ui/EditeurFiltres.tsx
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-espace.test.ts → src/core/fixtures/outils.ts
- `superposer()` --calls--> `encoder()`  [EXTRACTED]
  src/core/depot-base.ts → src/core/valeurs.ts
- `col()` --calls--> `schemaProjets()`  [EXTRACTED]
  src/core/valeurs.test.ts → src/core/fixtures/schema-projets.ts

## Import Cycles
- None detected.

## Communities (25 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml, devDependencies, @types/node (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (11): AdaptateurMemoire, listerBases(), AdaptateurFichiers, Entree, FichierIntrouvable, joindre(), nomDe(), parent() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (35): aleatoire(), aujourdhui(), planifier(), EtatEspace, TypeCreable, TYPES_CREABLES, LigneVue, Tri (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (53): BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, LigneChargee, charger(), estConfiguration() (+45 more)

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
Cohesion: 0.08
Nodes (18): OptionsDepot, COULEURS, DepotEspace, relationVers(), assurerListe(), assurerMap(), barreLaterale(), chaines() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (14): Planifier, ouvrir(), ouvrir(), colonnes(), ErreurSchema, indexColonne(), modifierSchema(), nouveauSchema() (+6 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (50): EtatBase, appliquerVue(), collateur, comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+42 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (11): contientCle(), DepotBase, Entree, superposer(), Aleatoire, cleColonne(), dedoublonner(), genererId() (+3 more)

## Knowledge Gaps
- **140 isolated node(s):** `Added`, `Changed`, `Fixed`, `Principes directeurs`, `Inclus` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 19`, `Community 3`, `Community 20`, `Community 15`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 3`, `Community 5`, `Community 9`, `Community 15`, `Community 19`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 19` to `Community 3`, `Community 5`, `Community 9`, `Community 15`, `Community 20`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06693877551020408 - nodes in this community are weakly interconnected._