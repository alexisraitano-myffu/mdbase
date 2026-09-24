# Graph Report - mdbase  (2026-09-24)

## Corpus Check
- 106 files · ~63,538 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 776 nodes · 1944 edges · 45 communities (41 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ee9f5133`
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
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]

## God Nodes (most connected - your core abstractions)
1. `DepotEspace` - 75 edges
2. `colonne` - 37 edges
3. `DepotBase` - 34 edges
4. `LigneChargee` - 25 edges
5. `Schema` - 23 edges
6. `AdaptateurMemoire` - 20 edges
7. `natureDe()` - 19 edges
8. `joindre()` - 19 edges
9. `useLancer()` - 19 edges
10. `useEspace()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `AjoutColonne()` --calls--> `schemaDe()`  [INFERRED]
  src/ui/EnteteColonne.tsx → src/core/depot-espace.test.ts
- `ChoixLigne()` --calls--> `useEspace()`  [EXTRACTED]
  src/ui/EditeurFiltres.tsx → src/ui/contexte-espace.tsx
- `agreger()` --calls--> `ok()`  [INFERRED]
  src/core/calcul.ts → src/core/filtres.test.ts
- `cles()` --calls--> `lireSchema()`  [EXTRACTED]
  src/core/schema-ecriture.test.ts → src/core/schema.ts
- `lireFiltre()` --calls--> `estObjet()`  [EXTRACTED]
  src/core/vue.ts → src/core/schema.ts

## Import Cycles
- None detected.

## Communities (45 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (46): 10. Dashboards, 11. Recherche globale, 12. Architecture, 13. Invariants (à tester), 14. Ordre de construction suggéré, 15. Questions ouvertes, 1. Vision, 2. Périmètre V1 (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (29): dependencies, @dnd-kit/core, @milkdown/crepe, react, react-dom, @tanstack/react-table, @tanstack/react-virtual, yaml (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (43): AdaptateurMemoire, BaseChargee, ChargementBase, chargerBase(), enregistrerLigne(), FichierNonReconnu, charger(), espace() (+35 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (9): Carte(), debutDuCorps(), Props, Collection(), Props, Kanban(), Position, Props (+1 more)

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
Nodes (7): LigneChargee, cheminPage(), DepotEspace, relationVers(), ModificationMiseEnPage, Calcul, Schema

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (6): compilerOptions, lib, tsBuildInfoFile, types, extends, include

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (5): Added, Changed, Changelog, Fixed, [Unreleased]

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (11): Cellule(), CelluleCalculee(), CelluleRelation(), champRemonte(), formaterDate(), normaliser(), Pastille(), Props (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (52): agreger(), BaseACalculer, calculer(), calculerInverse(), Calculs, erreur(), preparerRollup(), RollupPret (+44 more)

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (53): appliquerVue(), collateur, comparer(), comparerDate(), comparerNombre(), comparerTexte(), Contexte, correspond() (+45 more)

### Community 20 - "Community 20"
Cohesion: 0.14
Nodes (11): afficher(), contientCle(), DepotBase, superposer(), Aleatoire, cleColonne(), dedoublonner(), genererId() (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (13): aleatoire(), aujourdhui(), maintenant(), planifier(), choisirDossier(), demanderPermission(), DossierMemorise, navigateurCompatible() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.09
Nodes (20): Planifier, ouvrir(), ouvrir(), schemaDe(), colonnes(), ErreurSchema, indexColonne(), modifierSchema() (+12 more)

### Community 38 - "Community 38"
Cohesion: 0.07
Nodes (46): ctx, ok(), boucle(), decrireBoucle(), dependancesDirectes(), estCalculee(), Noeud, ordonner() (+38 more)

### Community 39 - "Community 39"
Cohesion: 0.12
Nodes (22): Affichage, AFFICHAGES, ChampPage, champsOrdonnes(), choisirMiseEnPage(), corpsEnOnglet(), lireMiseEnPage(), MiseEnPage (+14 more)

### Community 40 - "Community 40"
Cohesion: 0.07
Nodes (58): LigneVue, colonnesDeLaVue(), groupables(), Groupe, groupeOption(), grouper(), lv(), schema (+50 more)

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (15): calculsPour(), TypeCreable, TYPES_CREABLES, CALCULS, ColonneRelation, ColonneRollup, useLancer(), BarreVue() (+7 more)

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (11): EtatBase, ModificationVue, Element, fonctionnalites, Props, Tableau(), useAujourdhui(), useErreurDepot() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.40
Nodes (5): LIBELLES_CALCULS, CaseCalcul(), formater(), PiedTableau(), Props

### Community 44 - "Community 44"
Cohesion: 0.17
Nodes (7): EtatEspace, Contexte, FournisseurActions(), Lancer, BarreLaterale(), Props, Flottant()

## Knowledge Gaps
- **181 isolated node(s):** `Added`, `Changed`, `Fixed`, `Commandes`, `Architecture et conventions (refacti)` (+176 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DepotEspace` connect `Community 9` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 41`, `Community 42`, `Community 44`, `Community 17`, `Community 19`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `colonne` connect `Community 38` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 9`, `Community 41`, `Community 43`, `Community 42`, `Community 15`, `Community 17`, `Community 19`, `Community 20`, `Community 26`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `DepotBase` connect `Community 20` to `Community 2`, `Community 3`, `Community 39`, `Community 40`, `Community 9`, `Community 41`, `Community 42`, `Community 15`, `Community 24`, `Community 26`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `Added`, `Changed`, `Fixed` to the rest of the system?**
  _181 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06073871409028728 - nodes in this community are weakly interconnected._