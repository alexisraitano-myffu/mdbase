# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 100 files · ~54,264 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 698 nodes · 1746 edges · 41 communities (37 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c11450e8`
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
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `col()` --calls--> `schemaProjets()`  [EXTRACTED]
  src/core/valeurs.test.ts → src/core/fixtures/schema-projets.ts
- `ok()` --calls--> `correspond()`  [EXTRACTED]
  src/core/filtres.test.ts → src/core/filtres.ts
- `decoder()` --calls--> `ok()`  [INFERRED]
  src/core/valeurs.ts → src/core/filtres.test.ts

## Import Cycles
- None detected.

## Communities (41 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (45): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (29): dependencies, @dnd-kit/core, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (13): AdaptateurMemoire, cheminVue(), estConfiguration(), listerBases(), AdaptateurFichiers, Entree, FichierIntrouvable, joindre() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (38): agreger(), BaseACalculer, calculer(), calculerInverse(), Calculs, calculsPour(), erreur(), preparerRollup() (+30 more)

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
Cohesion: 0.08
Nodes (8): LigneChargee, OptionsDepot, DepotEspace, relationVers(), MiseEnPage, ModificationMiseEnPage, Calcul, Vue

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.44
Nodes (7): Aleatoire, cleColonne(), dedoublonner(), genererId(), idBase(), nomFichierLigne(), slug()

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (10): Planifier, ouvrir(), ouvrir(), ouvrir(), FICHIERS_RELATIONS, schemas(), AdaptateurCompteur, aleatoire() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (46): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+38 more)

### Community 20 - "Community 20"
Cohesion: 0.06
Nodes (32): LigneVue, colonnesDeLaVue(), groupables(), Groupe, groupeOption(), grouper(), lv(), schema (+24 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (32): aleatoire(), aujourdhui(), planifier(), ChargementBase, EtatBase, EtatEspace, Tri, choisirDossier() (+24 more)

### Community 26 - "Community 26"
Cohesion: 0.07
Nodes (46): cheminPage(), COULEURS, OptionsEspace, assurerListe(), assurerMap(), barreLaterale(), chaines(), ConfigEspace (+38 more)

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (39): BaseChargee, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), ctx, espace(), afficher() (+31 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (22): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), miseEnPageParDefaut() (+14 more)

### Community 40 - "Community 40"
Cohesion: 0.10
Nodes (43): ajouterMois(), apresGeste(), debutMois(), decaler(), decalerValeur(), ecartJours(), Echelle, enUTC() (+35 more)

## Knowledge Gaps
- **169 isolated node(s):** `Added`, `Changed`, `Fixed`, `Commandes`, `Architecture et conventions (refacti)` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 40`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 38` to `Community 3`, `Community 39`, `Community 40`, `Community 9`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 38` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 9`, `Community 17`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13170731707317074 - nodes in this community are weakly interconnected._