# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 95 files · ~48,796 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 645 nodes · 1573 edges · 40 communities (36 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d75dbe65`
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

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 65 edges
2. `DepotBase` - 32 edges
3. `colonne` - 29 edges
4. `Schema` - 23 edges
5. `LigneChargee` - 21 edges
6. `AdaptateurMemoire` - 20 edges
7. `joindre()` - 19 edges
8. `useLancer()` - 17 edges
9. `SPEC — Base de données Markdown + YAML (nom provisoire)` - 16 edges
10. `estObjet()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `cles()` --calls--> `lireSchema()`  [EXTRACTED]
  src/core/schema-ecriture.test.ts → src/core/schema.ts
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts
- `charger()` --calls--> `chargerBase()`  [EXTRACTED]
  src/core/base.test.ts → src/core/base.ts
- `ouvrir()` --calls--> `minuteur()`  [EXTRACTED]
  src/core/depot-espace.test.ts → src/core/fixtures/outils.ts

## Import Cycles
- None detected.

## Communities (40 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (44): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (29): dependencies, @dnd-kit/core, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (13): AdaptateurMemoire, cheminVue(), estConfiguration(), listerBases(), AdaptateurFichiers, Entree, FichierIntrouvable, joindre() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (68): agreger(), BaseACalculer, calculer(), calculerInverse(), calculsPour(), erreur(), preparerRollup(), RollupPret (+60 more)

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
Cohesion: 0.10
Nodes (5): cheminPage(), DepotEspace, relationVers(), f(), ModificationMiseEnPage

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
Cohesion: 0.13
Nodes (12): chargerBase(), espace(), Planifier, ouvrir(), ouvrir(), ouvrir(), schemaDe(), ErreurSchema (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (36): filtreDePastille(), operateurParDefaut(), operateursPour(), SANS_VALEUR, estObjet(), chaines(), CHAMPS_MODIFIABLES, FiltreRapide (+28 more)

### Community 20 - "Community 20"
Cohesion: 0.08
Nodes (23): LigneChargee, afficher(), contientCle(), DepotBase, superposer(), LigneVue, colonnesDeLaVue(), groupables() (+15 more)

### Community 24 - "Community 24"
Cohesion: 0.08
Nodes (26): aleatoire(), aujourdhui(), planifier(), ChargementBase, EtatBase, EtatEspace, ModificationVue, choisirDossier() (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.10
Nodes (26): Calculs, OptionsDepot, COULEURS, OptionsEspace, TypeCreable, TYPES_CREABLES, assurerListe(), assurerMap() (+18 more)

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (53): BaseChargee, enregistrerLigne(), FichierNonReconnu, charger(), Entree, appliquerVue(), collateur, comparerDate() (+45 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (23): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), MiseEnPage (+15 more)

## Knowledge Gaps
- **157 isolated node(s):** `Added`, `Changed`, `Fixed`, `Principes directeurs`, `Inclus` (+152 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 39`, `Community 17`, `Community 19`, `Community 20`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 3`, `Community 38`, `Community 39`, `Community 9`, `Community 17`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 3` to `Community 38`, `Community 39`, `Community 9`, `Community 19`, `Community 20`, `Community 26`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _157 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13170731707317074 - nodes in this community are weakly interconnected._