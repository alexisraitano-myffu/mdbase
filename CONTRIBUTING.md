# Contribuer à mdbase

Merci de t'intéresser à mdbase. Ce guide dit où mettre la main et quelles règles tenir.

La structure du produit est désormais stable : bases, vues, pages, dashboards, format des fichiers. Les contributions les plus attendues sont les **intégrations d'outils tiers** (un autre hôte pour le dossier, un fournisseur d'IA, un format d'échange, un service externe). La plus grande partie de ce guide leur est consacrée.

## Avant de commencer

- **La spec fait foi** : [`docs/SPEC.md`](docs/SPEC.md). Lis au moins la vision (§1), le format des fichiers (§3), l'architecture (§12) et les invariants (§13).
- Les points marqués **[DÉCIDÉ]** ne se changent pas dans une pull request. Si tu penses qu'il le faut, ouvre d'abord une issue pour en discuter.
- Les points **[PLUS TARD]** sont bienvenus, mais en discuter d'abord évite de refaire le travail.
- Pour un bug, une pull request directe suffit. Pour une nouvelle fonctionnalité ou une intégration, **ouvre une issue avant d'écrire du code** : dis ce que tu veux brancher, ce qui quitte la machine, et le point d'extension que tu comptes utiliser (voir plus bas).

## Mise en route

```bash
npm install
npm run dev         # serveur Vite, à ouvrir dans Chrome ou Edge
npm test            # tests du cœur (Vitest, dans Node)
npm run test:e2e    # interface dans Chrome sans fenêtre (Playwright), réutilise le `npm run dev` lancé
npm run typecheck
npm run build
```

L'app a besoin de l'API File System Access : Chrome ou Edge. Pour essayer sans rien risquer, « Essayer avec la démo » ouvre une copie de `exemples/espace-demo/` dans le stockage du navigateur. Pour tester sur un vrai dossier, prends **une copie** de la démo, jamais l'original.

## L'architecture en une minute

```
src/
  core/       TypeScript pur : format des fichiers, schéma, calculs, filtres, écriture
  adapters/   le seul code qui touche au monde extérieur (fichiers, réseau, navigateur)
  ui/         React
```

- **Le cœur n'importe ni React, ni le DOM, ni Node.** Deux garde-fous le vérifient à chaque passage de la CI :
  - `tsconfig.core.json` compile `src/core` sans les types du navigateur ;
  - `src/core/architecture.test.ts` refuse toute librairie hors d'une liste fermée.
- **Le cœur reçoit tout ce qu'il utilise** : l'accès aux fichiers (`AdaptateurFichiers`), le modèle d'IA (`ModeleIA`), l'aléatoire, le minuteur, la date du jour. Il ne fabrique rien de tout ça lui-même.
- **Les fichiers sont la seule source de vérité.** Relations inverses, rollups et formules sont recalculés, jamais écrits.

## Intégrer un outil tiers

### Les règles qui ne se négocient pas

1. **Local-first.** Par défaut, aucune donnée ne quitte la machine. Toute intégration qui fait un appel réseau est :
   - **désactivée par défaut** ;
   - précédée d'un **avertissement** qui dit quelles données partent et vers quelle adresse ;
   - sans aucun envoi avant son activation.

   Le module IA est le modèle à suivre (spec §12, « Module IA »).
2. **Aucun secret dans l'espace.** Clés, jetons et mots de passe restent dans le navigateur de l'utilisateur, jamais dans le dossier (il est souvent synchronisé). Aucune clé embarquée dans le code.
3. **Aucune télémétrie**, aucun service imposé. Quand c'est possible, on préfère un connecteur générique (une norme, une adresse saisie par l'utilisateur) à un fournisseur nommé.
4. **Rien ne s'exécute depuis les données.** Pas d'`eval`, pas de code chargé depuis un fichier de l'espace ou une réponse de service.
5. **Le format des fichiers ne bouge pas en douce.** Une nouvelle clé dans un fichier YAML se propose d'abord dans la spec (§3). La lecture reste tolérante : une clé inconnue se conserve, une valeur mal formée est ignorée et signalée.
6. **Les invariants (§13) tiennent toujours**, en particulier :
   - un champ inconnu survit à toute réécriture ;
   - un changement touche le moins de fichiers possible, pour limiter les conflits de synchronisation.

### Choisir le bon point d'extension

| Tu veux… | Point d'extension | Où |
| --- | --- | --- |
| Ouvrir l'espace ailleurs que dans un dossier local (Tauri, plugin Obsidian, WebDAV, stockage distant) | `AdaptateurFichiers` : `lister`, `lire`, `ecrire`, `renommer`, `supprimer`, `dateModification` | `src/core/fichiers.ts`, implémentation dans `src/adapters/<hote>/` |
| Brancher un autre fournisseur de modèle de langage | `ModeleIA` : une requête (messages et outils) donne une réponse (texte et appels d'outils) | `src/core/ia/modele.ts`, connecteur dans `src/adapters/ia/` |
| Lire ou écrire un nouveau format (JSON, ICS, XLSX…) | fonctions pures entre une `Grille` et le format | `src/core/echange.ts`, interface dans `src/ui/Echange.tsx` |
| Donner une nouvelle capacité à l'assistant | un outil décrit, validé, puis appliqué après confirmation | `src/core/ia/outils.ts`, `plan.ts`, `structure.ts` |
| Synchroniser avec un service externe (agenda, gestionnaire de tickets…) | un adaptateur réseau, plus une correspondance pure entre le service et les lignes, qui écrit par les opérations de `DepotEspace` | `src/adapters/<service>/` et `src/core/<service>/` |

Quelques précisions par cas.

**Un autre hôte pour les fichiers.** Seul l'adaptateur change : le cœur et l'interface restent identiques. Respecte le contrat décrit dans `src/core/fichiers.ts` :
- chemins relatifs à la racine, séparés par `/` ;
- `FichierIntrouvable` pour ce qui n'existe pas ;
- les dossiers parents sont créés à l'écriture ;
- `dateModification` doit être fiable : c'est elle qui protège contre l'écrasement d'un changement fait ailleurs.

Reprends les cas de `src/core/adaptateur-memoire.test.ts` pour tester ton adaptateur.

**Un fournisseur d'IA.** Avant d'écrire un connecteur, vérifie s'il parle déjà le format `/chat/completions` avec appels d'outils : le connecteur générique (`src/adapters/ia/compatible-openai.ts`) le couvre alors sans nouveau code. Un connecteur spécifique ne traduit que le transport. La consigne, les outils et la validation restent dans le cœur.

**Une capacité de l'assistant.** Le modèle ne touche jamais aux fichiers. Il propose des appels d'outils :
- chaque appel est validé contre l'état de l'espace comme une saisie de l'interface ;
- tout est montré dans l'aperçu (en rouge pour une suppression) ;
- rien n'est écrit avant « Appliquer » ;
- une proposition invalide est refusée en entier.

Une nouvelle capacité est un nouvel outil qui suit ce chemin, jamais du texte interprété.

**Un service externe.** On garde deux morceaux séparés :
- l'appel réseau, dans un adaptateur ;
- la correspondance entre le service et les lignes, en fonctions pures dans le cœur, testées sans réseau.

Les écritures passent par `DepotEspace` et `DepotBase` (`creerLigne`, `modifier`, `enUneEtape`…), jamais par l'adaptateur de fichiers en direct. Sinon elles échappent au journal d'annulation et aux protections contre les conflits. Les réglages non secrets d'une intégration (quelle base, quelles colonnes) sont une question de format : à proposer dans l'issue.

### Checklist d'une pull request d'intégration

- [ ] Désactivée par défaut, avec un avertissement avant le premier envoi si elle fait un appel réseau.
- [ ] Aucun secret écrit dans l'espace ni dans le dépôt.
- [ ] Le cœur n'importe toujours ni DOM, ni Node, ni la librairie du service : `npm test` le vérifie (`architecture.test.ts`).
- [ ] Logique testée dans le cœur, sans réseau. Le service est simulé dans les tests de bout en bout (`page.route`, comme dans `e2e/assistant.spec.ts`) : la CI n'appelle jamais un vrai service.
- [ ] Spec, README et `CHANGELOG.md` mis à jour.

## Code

- **Nommage en français**, comme la spec et le format des fichiers (`lister`, `colonnes`, `champ_titre`).
- TypeScript `strict` avec `noUncheckedIndexedAccess`, sur les trois projets (`core`, `app`, `test`).
- Icônes : Lucide seulement, via `src/ui/icones.tsx`. Couleurs : variables CSS du `:root` de `src/ui/app.css`, pas de couleur en dur.
- Découpe un module quand il grandit vraiment, pas par avance. Un nettoyage structurel est un commit à part, jamais mélangé à une fonctionnalité.
- Mode consultation : tout nouveau contrôle qui modifie quelque chose se masque ou se désactive quand `useConsultation()` est vrai.

## Tests

- **Aucune fonctionnalité sans test.**
- Le cœur se teste dans Node sur `AdaptateurMemoire`, sans navigateur ni disque.
- Une fonctionnalité d'interface a son test de bout en bout dans `e2e/`, sur une copie neuve de la démo.
- Les invariants de la spec (§13) sont des tests et ne se retirent jamais.
- Touchant à l'écriture, à la réécriture, aux suppressions ou aux renommages (tout ce qui peut perdre des données) : `npm test` avant chaque commit.
- `npm run banc` rejoue des demandes contre un vrai modèle d'IA avec ta propre clé : à lancer chez toi, jamais en CI.

## Pull requests

- Un sujet par pull request, avec un message qui dit ce qui change pour l'utilisateur.
- La CI doit être verte : typage, tests, build, tests de bout en bout sur le build publié.
- Pas de données personnelles, de clés ni d'identifiants internes dans le code, les exemples ou les messages de commit.
- En contribuant, tu acceptes que ton code soit publié sous la [licence MIT](LICENSE) du projet.

## Signaler une faille de sécurité

N'ouvre pas d'issue publique pour une faille : utilise « Report a vulnerability » dans l'onglet Security du dépôt.
