# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 83 files · ~37,436 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 547 nodes · 1286 edges · 38 communities (35 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `93ef4143`
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

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 54 edges
2. `DepotBase` - 27 edges
3. `colonne` - 21 edges
4. `AdaptateurMemoire` - 20 edges
5. `joindre()` - 19 edges
6. `Schema` - 19 edges
7. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
8. `lireLigne()` - 15 edges
9. `natureDe()` - 15 edges
10. `estObjet()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts
- `decoder()` --calls--> `ok()`  [INFERRED]
  src/core/valeurs.ts → src/core/filtres.test.ts
- `comparer()` --calls--> `natureDe()`  [EXTRACTED]
  src/core/filtres.ts → src/core/schema.ts
- `cles()` --calls--> `lireSchema()`  [EXTRACTED]
  src/core/schema-ecriture.test.ts → src/core/schema.ts

## Import Cycles
- None detected.

## Communities (38 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (27): dependencies, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml, devDependencies, @types/node (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (12): AdaptateurMemoire, cheminVue(), listerBases(), AdaptateurFichiers, Entree, FichierIntrouvable, joindre(), nomDe() (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (30): aleatoire(), aujourdhui(), planifier(), EtatEspace, choisirDossier(), demanderPermission(), DossierMemorise, navigateurCompatible() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.14
Nodes (13): compilerOptions, isolatedModules, module, moduleResolution, noEmit, noFallthroughCasesInSwitch, noUncheckedIndexedAccess, noUnusedLocals (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (32): BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), estConfiguration(), ligne() (+24 more)

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
Cohesion: 0.10
Nodes (4): OptionsDepot, DepotEspace, relationVers(), Vue

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (9): Planifier, ouvrir(), ouvrir(), ouvrir(), schemaDe(), AdaptateurCompteur, aleatoire(), horlogeCroissante() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (24): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+16 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (33): filtreDePastille(), operateurParDefaut(), operateursPour(), ColonneChoix, FiltreRapide, Operateur, Tri, EditeurTris() (+25 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (13): LigneChargee, contientCle(), DepotBase, Entree, superposer(), Aleatoire, cleColonne(), dedoublonner() (+5 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (37): Calculs, COULEURS, EtatBase, OptionsEspace, TypeCreable, TYPES_CREABLES, assurerListe(), assurerMap() (+29 more)

### Community 26 - "Community 26"
Cohesion: 0.08
Nodes (44): agreger(), BaseACalculer, calculer(), calculerInverse(), erreur(), preparerRollup(), RollupPret, ctx (+36 more)

## Knowledge Gaps
- **143 isolated node(s):** `PreToolUse`, `name`, `version`, `dev`, `build` (+138 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 15`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 3`, `Community 9`, `Community 15`, `Community 19`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `joindre()` connect `Community 2` to `Community 24`, `Community 9`, `Community 20`, `Community 5`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `PreToolUse`, `name`, `version` to the rest of the system?**
  _143 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1371794871794872 - nodes in this community are weakly interconnected._