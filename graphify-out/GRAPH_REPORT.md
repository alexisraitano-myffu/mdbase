# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 50 files · ~20,213 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 381 nodes · 703 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eff05581`
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

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 28 edges
2. `DepotBase` - 22 edges
3. `AdaptateurMemoire` - 17 edges
4. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
5. `joindre()` - 14 edges
6. `compilerOptions` - 13 edges
7. `AdaptateurFsa` - 12 edges
8. `lireLigne()` - 11 edges
9. `parent()` - 11 edges
10. `lireSchema()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `superposer()` --calls--> `encoder()`  [EXTRACTED]
  src/core/depot-base.ts → src/core/valeurs.ts
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-espace.test.ts → src/core/fixtures/outils.ts
- `col()` --calls--> `schemaProjets()`  [EXTRACTED]
  src/core/valeurs.test.ts → src/core/fixtures/schema-projets.ts
- `charger()` --calls--> `chargerBase()`  [EXTRACTED]
  src/core/base.test.ts → src/core/base.ts
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-base.test.ts → src/core/fixtures/outils.ts

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

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
Cohesion: 0.13
Nodes (18): aleatoire(), planifier(), LigneChargee, choisirDossier(), demanderPermission(), DossierMemorise, navigateurCompatible(), retrouverDossier() (+10 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (45): BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), appliquer(), assembler() (+37 more)

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
Nodes (21): OptionsDepot, COULEURS, DepotEspace, EtatBase, EtatEspace, relationVers(), TypeCreable, TYPES_CREABLES (+13 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.33
Nodes (7): colonnes(), ErreurSchema, indexColonne(), modifierSchema(), nouveauSchema(), OPTIONS_SORTIE_CONFIG, trouverColonne()

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (8): lireNombre(), Cellule(), EditeurNombre(), formaterDate(), Pastille(), Props, couleurOption(), PALETTE

### Community 20 - "Community 20"
Cohesion: 0.15
Nodes (11): contientCle(), DepotBase, Entree, superposer(), Aleatoire, cleColonne(), dedoublonner(), genererId() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.23
Nodes (7): Planifier, ouvrir(), ouvrir(), AdaptateurCompteur, aleatoire(), horlogeCroissante(), minuteur()

## Knowledge Gaps
- **130 isolated node(s):** `Entree`, `TYPES_CREABLES`, `TypeCreable`, `COULEURS`, `EtatBase` (+125 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 21`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 19`, `Community 9`, `Community 3`, `Community 21`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `joindre()` connect `Community 2` to `Community 9`, `Community 20`, `Community 5`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **What connects `Entree`, `TYPES_CREABLES`, `TypeCreable` to the rest of the system?**
  _130 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.14793741109530584 - nodes in this community are weakly interconnected._