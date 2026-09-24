# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 100 files · ~54,886 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 701 nodes · 1752 edges · 42 communities (35 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83a06ae8`
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

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 67 edges
2. `DepotBase` - 34 edges
3. `colonne` - 33 edges
4. `LigneChargee` - 25 edges
5. `Schema` - 23 edges
6. `AdaptateurMemoire` - 20 edges
7. `joindre()` - 19 edges
8. `useLancer()` - 19 edges
9. `Modifications` - 17 edges
10. `lireLigne()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts
- `decoder()` --calls--> `ok()`  [INFERRED]
  src/core/valeurs.ts → src/core/filtres.test.ts
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `cles()` --calls--> `lireSchema()`  [EXTRACTED]
  src/core/schema-ecriture.test.ts → src/core/schema.ts
- `lireFiltre()` --calls--> `estObjet()`  [EXTRACTED]
  src/core/vue.ts → src/core/schema.ts

## Import Cycles
- None detected.

## Communities (42 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (45): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (29): dependencies, @dnd-kit/core, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (21): AdaptateurMemoire, BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), espace() (+13 more)

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

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (13): OptionsDepot, assurerListe(), assurerMap(), barreLaterale(), chaines(), ConfigEspace, ErreurEspace, introuvable() (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.12
Nodes (15): Planifier, ouvrir(), ouvrir(), colonnes(), ErreurSchema, indexColonne(), modifierSchema(), nouveauSchema() (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (57): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+49 more)

### Community 20 - "Community 20"
Cohesion: 0.07
Nodes (33): LigneChargee, afficher(), contientCle(), DepotBase, Entree, superposer(), LigneVue, colonnesDeLaVue() (+25 more)

### Community 24 - "Community 24"
Cohesion: 0.05
Nodes (50): aleatoire(), aujourdhui(), planifier(), calculsPour(), EtatBase, EtatEspace, schemaDe(), TypeCreable (+42 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (19): cheminPage(), COULEURS, OptionsEspace, Groupe, estObjet(), chaines(), CHAMPS_MODIFIABLES, EchelleVue (+11 more)

### Community 38 - "Community 38"
Cohesion: 0.06
Nodes (57): agreger(), BaseACalculer, calculer(), calculerInverse(), Calculs, erreur(), preparerRollup(), RollupPret (+49 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (22): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), miseEnPageParDefaut() (+14 more)

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (43): ajouterMois(), apresGeste(), debutMois(), decaler(), decalerValeur(), ecartJours(), Echelle, enUTC() (+35 more)

## Knowledge Gaps
- **169 isolated node(s):** `Added`, `Changed`, `Fixed`, `Principes directeurs`, `Inclus` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 41`, `Community 15`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 38` to `Community 3`, `Community 39`, `Community 40`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 17`, `Community 19`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09724238026124818 - nodes in this community are weakly interconnected._