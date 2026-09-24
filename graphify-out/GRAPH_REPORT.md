# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 59 files · ~26,046 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 448 nodes · 855 edges · 26 communities (22 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3446d79e`
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
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 24|Community 24]]

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 39 edges
2. `DepotBase` - 23 edges
3. `AdaptateurMemoire` - 17 edges
4. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
5. `joindre()` - 14 edges
6. `compilerOptions` - 13 edges
7. `lireLigne()` - 12 edges
8. `AdaptateurFsa` - 12 edges
9. `colonne` - 11 edges
10. `parent()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-espace.test.ts → src/core/fixtures/outils.ts
- `DepotEspace` --references--> `ConfigEspace`  [EXTRACTED]
  src/core/depot-espace.ts → src/core/espace-config.ts
- `ok()` --calls--> `correspond()`  [EXTRACTED]
  src/core/filtres.test.ts → src/core/filtres.ts
- `superposer()` --calls--> `encoder()`  [EXTRACTED]
  src/core/depot-base.ts → src/core/valeurs.ts
- `col()` --calls--> `schemaProjets()`  [EXTRACTED]
  src/core/valeurs.test.ts → src/core/fixtures/schema-projets.ts

## Import Cycles
- None detected.

## Communities (26 total, 4 thin omitted)

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
Cohesion: 0.08
Nodes (30): aleatoire(), planifier(), ChargementBase, EtatEspace, colonne, choisirDossier(), demanderPermission(), DossierMemorise (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (41): BaseChargee, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), appliquer(), assembler(), creerLigne() (+33 more)

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
Cohesion: 0.14
Nodes (4): OptionsDepot, DepotEspace, f(), Vue

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (26): COULEURS, EtatBase, relationVers(), TypeCreable, TYPES_CREABLES, assurerListe(), assurerMap(), barreLaterale() (+18 more)

### Community 19 - "Community 19"
Cohesion: 0.08
Nodes (32): LigneChargee, appliquerVue(), collateur, comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+24 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (11): contientCle(), DepotBase, Entree, superposer(), Aleatoire, cleColonne(), dedoublonner(), genererId() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.23
Nodes (7): Planifier, ouvrir(), ouvrir(), AdaptateurCompteur, aleatoire(), horlogeCroissante(), minuteur()

### Community 24 - "Community 24"
Cohesion: 0.19
Nodes (9): Cellule, lireNombre(), Cellule(), EditeurNombre(), formaterDate(), Pastille(), Props, couleurOption() (+1 more)

## Knowledge Gaps
- **139 isolated node(s):** `COULEURS`, `EtatBase`, `schema`, `ctx`, `Lue` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 3`, `Community 15`, `Community 19`, `Community 20`, `Community 21`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 24`, `Community 3`, `Community 21`, `Community 15`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 3` to `Community 5`, `Community 15`, `Community 19`, `Community 20`, `Community 24`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **What connects `COULEURS`, `EtatBase`, `schema` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14793741109530584 - nodes in this community are weakly interconnected._