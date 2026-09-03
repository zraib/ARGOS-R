# Qualité, gate et registre d'audit

Ce que l'on vérifie avant de livrer, ce qui a été nettoyé et refondu lors de la
passe du 2 septembre 2026, et ce qui reste au carnet. Écrit pour l'auditeur qui
arrive sur le dépôt : chaque affirmation renvoie à une commande ou à un fichier.

## 1. La gate — quatre commandes, dans cet ordre

```bash
npm run typecheck   # API puis web — tsc strict, aucune variable ni import inutilisé
npm test            # API (jest --runInBand, 340 tests) puis web (vitest, 96 tests)
npm run build       # build de production API + web
npm run contract:check   # le contrat versionné suit-il le code ? (échoue sinon)
npm run docs:api         # synchronise le contrat, puis régénère docs/03-api.md
```

Ces commandes s'exécutent **en séquence**. Résultat de la gate rejouée complète
sur `fusion` à la fin de la passe (2 septembre 2026) : typecheck 0 erreur ·
API 340/340 · web 96/96 · build de production API et web
réussi. Rejouée après l'intégration de la branche IA (3 septembre 2026) :
typecheck 0 erreur · API 340/340 · web 110/110.

Ce que chaque étape garantit :

| Étape | Garantie |
| --- | --- |
| `typecheck` | `strict: true`, `noUnusedLocals`, `noUnusedParameters` dans les deux applications : pas de `any` implicite, pas de code mort au niveau des symboles |
| `test:api` | default-deny **et couverture des gardes** (`authz-coverage.spec.ts`), cantonnement ABAC, doctrine de visibilité, gouvernance des suppressions, boucle fermée des missions, décodeur des traceurs, communications — voir [04-securite.md §10](04-securite.md) |
| `test:web` | parité i18n des trois langues, navigation, rôles, affecteurs, flux SSE, aides de la carte, moteur de brouillon, orchestration du Copilot |
| `build` | l'application compile en production (App Router, `output` Next) et l'API en `dist/` |
| `docs:api` | la référence API ne peut pas diverger du code : elle en est produite, et le script échoue si une route n'a pas de garde |

## 2. Ce qui a été nettoyé

Méthode : un inventaire outillé avant chaque suppression (graphe d'imports pour
les fichiers, `tsc` pour les symboles), et la gate après.

| Nettoyage | Comment on l'a trouvé | Résultat |
| --- | --- | --- |
| fichiers jamais importés | script de graphe d'imports (sans dépendance) | supprimés ; le graphe est rejouable |
| 37 symboles inutilisés (imports, variables, paramètres) | `tsc` avec `noUnusedLocals`/`noUnusedParameters` | supprimés, **et les deux drapeaux sont maintenant actifs** : la dette ne peut pas revenir |
| 915 imports superflus nés des découpes de fichiers | `tsc` en boucle | supprimés |
| composant nul `IncidentDraftAssist()` (rendait `null`) | lecture | supprimé |
| bannières de section du magasin devenues fausses | lecture | remplacées par des tranches nommées |
| documentation API écrite à la main et en retard | comparaison avec le contrat | remplacée par une génération depuis le code |

Ce qui a été **conservé volontairement** : les dossiers « ESRI MAXAR » du
handoff de conception (composants attribués de l'utilisateur), les données
d'exercice, et `PERF_AUDIT.md` (l'audit de performance d'origine, dont les
conclusions sont reprises dans [07-performance.md](07-performance.md)).

## 3. Ce qui a été refondu

Chaque refonte est un commit distinct, vérifié par la gate **et dans le
navigateur** avant d'être commité. Les déplacements sont faits par l'arbre
syntaxique TypeScript (pas à la main) : le code déplacé est identique, seuls
les imports changent.

| Avant | Après | Pourquoi |
| --- | --- | --- |
| `lib/ai/assistant.ts` — 2 782 lignes | `lib/ai/assistant/` : `router`, `prompt`, `enrich`, `temporal`, `labels`, `rows`, `types`, un fichier par famille d'intentions | un fichier par responsabilité ; la façade `index.ts` conserve les 17 symboles publics |
| `domain.controller.ts` — un contrôleur pour tout le domaine | six contrôleurs par sujet (`incidents`, `comms`, `resources`, `hospitals`, `dashboard`, `environment`) | lisibilité, et chaque route déclare son accès sous les yeux de qui la lit |
| `domain.service.ts` — 1 331 lignes | `domain.types.ts` (contrat, 17 types) · `domain.analytics.ts` (calculs purs sur un instantané) · `domain.service.ts` (état, 861 l.) | séparer le contrat, le calcul et l'état ; les calculs deviennent testables sans NestJS |
| `MapCanvas.tsx` — 2 019 lignes dont 320 de fonctions pures | `lib/map/canvas/{dem,weather-raster,weather-grid,weather-render,quakes,plume}.ts` + 8 tests | le rendu reste dans le composant ; les calculs (MNT, LUT météo, IDW, Mercator, interpolation du panache) sont testés |
| `IncidentDraftAssist.tsx` — 1 207 lignes, importé par `lib/` | `lib/ai/draft/` (moteur, 6 tests) ; le composant garde le hook et les boutons (133 l.) | une bibliothèque n'importe plus un composant ; « aucun fait inventé » et « reproductible par salt » sont des tests |
| `CopilotBody.ask()` — 397 lignes | `lib/ai/copilot/{history,blocks,turn}.ts` (10 tests) ; `ask()` = 159 l. | le budget de fenêtre, les blocs et le tour de parole se testent ; trois copies des huit champs structurés deviennent une |
| `lib/store.ts` — 1 857 lignes, une interface de 204 membres | `lib/store/slices/` (10 tranches typées) + `shared.ts` ; `store.ts` = 56 l. | chaque tranche a un nom vrai ; aucune n'importe une autre |
| six écrans de 900–1 300 lignes à 6–12 composants | un composant par fichier (`parts/`, `_parts/`, `situational/`) + `shared.ts` | trouver un composant par son nom de fichier |
| `docs/03-api.md` écrit à la main | `scripts/gen-api-doc.mjs` (OpenAPI × décorateurs, via l'AST) | la référence suit le code |
| `IncidentWizard.tsx` — 1 053 lignes, un seul composant, trente `useState` | `lib/incidents/wizard.ts` (validation, rattachement, charge envoyée, pré-remplissage — 15 tests) · `components/incidents/wizard/` (un hook de formulaire, deux hooks IA/localisation, une étape par fichier) · coquille de 150 l. | le formulaire critique devient testable sans navigateur ; parcours complet rejoué au navigateur (création vérifiée par l'API) |

Filet de sécurité posé **avant** de refondre : 70 tests web (il n'y en avait
aucun), un test de couverture des gardes côté API, et le script de test API
passé en séquence (`--runInBand`) parce que la suite `deployment` expirait sous
la contention CPU (80 s et 14 échecs en parallèle, 5,5 s et 0 échec en séquence
— un faux négatif que la gate ne doit plus produire).

## 4. Registre des risques et de la dette

Ce qui reste, classé par ce que ça coûterait de l'ignorer. Chaque ligne est
soit un travail planifié, soit une décision à prendre.

| # | Sujet | Nature | État / décision attendue |
| --- | --- | --- | --- |
| R-1 | **Persistance en mémoire** (instantané JSON de développement) | architecture | **état rendu explicite** (2 septembre 2026) : `GET /api/health` dit le pilote et le sort de chaque module ; trois modules ont un adaptateur PostgreSQL (`audit`, `flags`, `orders`), huit restent en mémoire ; une base injoignable arrête l'API au démarrage avec un message clair ; le contrat des dépôts se rejoue sur l'adaptateur Drizzle dès qu'`ARGOS_TEST_DATABASE_URL` désigne une base. **Reste** : écrire les adaptateurs des huit modules (schéma Drizzle à étendre : `iam`, `domain`, `missions`, `nrbc`, `tracking`, …) et qualifier sur une base réelle |
| R-2 | **Authentification de développement** (HS256, `dev-token`) | sécurité | **qualifié par test** (2 septembre 2026) : `iam/keycloak.spec.ts` joue Keycloak avec un JWKS local — signature RS256, émetteur, audience, expiration, HS256 refusé, aucun jeton fabriqué hors mode dev. Reste le déploiement réel (`infra/compose` : Keycloak + realm `argos`), hors de portée sans Docker sur ce poste |
| R-3 | **Fond de carte tiers** en développement (`NEXT_PUBLIC_MAP_TILES=external`) | souveraineté | **câblé et documenté** (2 septembre 2026) : le style souverain suit le motif de martin (`/{source}/{z}/{x}/{y}`, sources `sat`/`plan`/`lbl`/`dem`), la CSP n'admet que l'origine configurée, martin monte `infra/geo/tiles`, la vue 3D se passe de relief sans `dem`, une valeur inconnue de `NEXT_PUBLIC_MAP_TILES` ferme (5 tests). **Reste** : produire les quatre MBTiles (procédure dans `infra/geo/README.md`) — données et Docker absents de ce poste |
| R-4 | Lignes de la matrice **provisoires** : `aviation`, `tracking`, `comms_admin` (et `nrbc`, `missions`, plus neuf lignes reprises hors matrice) | gouvernance | **dossier d'arbitrage prêt** (2 septembre 2026) : [ADR 0009](adr/0009-dotations-provisoires-a-arbitrer.md) — dotation actuelle de chaque ligne, cinq questions, procédure d'application d'une décision. La décision appartient à l'état-major ; le code applique et signale |
| R-5 | Passerelles SMS / e-mail simulées | fonctionnel | **e-mail traité** (2 septembre 2026) : port `NotificationGateway`, adaptateur SMTP sans dépendance (TLS, AUTH PLAIN, protection contre l'injection d'en-têtes ; 9 tests contre un serveur factice), choisi par `SMTP_HOST` ; l'historique porte les livraisons réelles et dit « simulé » quand rien n'est parti. **Reste** : la passerelle SMS (contrat opérateur) — un adaptateur sur le même port |
| R-6 | `IncidentWizard.tsx` — un composant de 982 lignes | dette de code | **traité** (2 septembre 2026) : logique pure dans `lib/incidents/wizard.ts` + 15 tests, une étape par fichier, parcours rejoué au navigateur. Reste : un test de parcours automatisé demanderait un environnement DOM (jsdom + Testing Library, deux dépendances de développement) — à décider |
| R-7 | `MapCanvas.tsx` — 1 700 lignes de rendu MapLibre | dette de code | **traité** (2 septembre 2026) : rendu séparé par couche dans `components/map/layers/`, composant à 681 l. ; les calculs purs étaient déjà dans `lib/map/canvas/` |
| R-8 | `CopilotBody.tsx` — 1 118 lignes (panneau + réglages + fil) | dette de code | **traité** (2 septembre 2026) : `shell/copilot/` + `blocks/`, coquille de 419 l. |
| R-9 | Chaînes françaises en dur dans des modules fusionnés (What-If, conscience situationnelle) | i18n | **traité** (2 septembre 2026) : 264 clés FR/EN/AR, trois passes. **Résidu assumé** : les libellés des catégories d'hôpitaux (`HOSPITAL_KINDS.label/long`, 12 chaînes, 10 consommateurs dont le HTML des marqueurs de carte) et la synthèse IA d'Hospinet, produite en français par le modèle |
| R-10 | `openapi.json` non versionné | outillage | **traité** (2 septembre 2026) : le contrat versionné est `packages/api-client/openapi.json` (celui que le client consomme) ; `npm run contract:check` échoue s'il ne suit plus le code, `npm run contract:sync` le met à jour avec les types du client ; la référence API se génère depuis lui |
| R-11 | `MASTER_PLAN.md`, `CLAUDE.md`, `CONTEXT.md` hors de git | organisation | **choix délibéré de l'équipe**, posé à l'import initial du dépôt (`.gitignore`, 16 juillet 2026) — aucune action ; l'auditeur reçoit ces trois fichiers à part |
| R-12 | Cache `apps/web/.next` très volumineux sur le poste de développement (9 Go constatés) | poste de travail | **outillé** : `npm run clean:cache` (serveurs arrêtés) — procédure dans 06 §11 ; à exécuter par l'utilisateur, le serveur de développement tournant pendant l'audit |
| R-13 | Données CAMEO : licence | juridique | **règle outillée** (2 septembre 2026) : `nrbc/licence.spec.ts` refuse tout champ ou source `chemical_cas`, `dupont`, AEGL, ERPG, NFPA dans le module et le jeu versionné, et fixe les 31 numéros CAS existants (ni ajout ni retrait) |
| R-15 | Une bascule 3D / fond de carte demandée **pendant le chargement des tuiles** était ignorée | ergonomie | **traité** (2 septembre 2026) : les bascules dépendent du style analysé, pas des tuiles ; 5 tests. **Incident** : la seconde retouche a retiré une garde qui coupait par accident une boucle `styledata` → `setupStyle` → `setTerrain`/`easeTo` — carte à 2 images/s, déplacement et 2D/3D inopérants. Corrigé à la racine : `setupStyle` ne se rejoue plus une fois les couches posées, et la bascule 2D/3D est idempotente |
| R-16 | Branche `IA` : quatre commits postérieurs au découpage du 2 septembre, écrits sur l'ancienne arborescence (`assistant.ts` de 2 782 lignes, `SituationalAwarenessPanel.tsx` monolithique) | intégration | **traité** (3 septembre 2026) : report fonction par fonction sur l'arborescence découpée, un commit d'origine → un commit ici, l'autrice conservée. Trois défauts trouvés au passage et corrigés avec 13 tests : l'extraction de ville mangeait les lettres des noms (« casablanca » → « c s bl nc »), le routeur passait la question « hôpitaux de <ville> » aux hôpitaux proches d'un incident jamais cité, et les dates acceptaient tout ce que `new Date()` avale (« J-1 » affiché « 00:00 »). **Aucun commit de fusion** avec `origin/IA` : son historique porte les mentions de co-auteur retirées de `fusion`, un merge les réintroduirait |
| R-14 | Un échec **intermittent** de `iam/users.spec.ts` observé une fois | fiabilité des tests | **traité** (2 septembre 2026) : non reproduit (6 exécutions isolées, 3 complètes, 1 avec détection de handles ouverts, chaque suite chronométrée à 2–4 s) ; cause la plus probable : le délai par défaut de jest (5 s) face au démarrage complet de l'application sous contention — porté à 30 s explicitement |

## 5. Comment l'auditeur rejoue tout cela

```bash
npm run setup                 # dépendances
npm run typecheck && npm test # la gate (en séquence)
npm run docs:api && git diff --stat docs/03-api.md   # vide = la référence suit le code
npm run dev                   # http://localhost:3004 · API http://localhost:3005/api/docs
```

Pour la sécurité, lire dans l'ordre : [04-securite.md](04-securite.md) (la
chaîne, la matrice, les rôles), `apps/api/src/shared/permissions.ts` (la
source), `apps/api/src/modules/iam/authz-coverage.spec.ts` (la preuve qu'aucune
route n'y échappe), puis [03-api.md](03-api.md) (chaque route et son accès).
