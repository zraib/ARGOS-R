# Application web — poste de commandement

`apps/web` — Next.js 15 (App Router) · React 19 · TypeScript strict ·
Tailwind CSS · Zustand · MapLibre GL. Port **3004**.

Recréation haute-fidélité de la référence de design `design_handoff_argos/`
(à lire comme une **spécification** ; son runtime de prototype `support.js`
n'est pas réutilisé).

---

## 1. Règles structurantes

1. **Contrat d'abord.** Le frontend ne consomme que le client généré depuis
   l'OpenAPI (`src/lib/api-client/`). **Aucun `fetch` écrit à la main** vers
   l'API.
2. **Les données du domaine viennent de l'API.** `src/lib/data/` ne conserve
   que des types et des données de référence/présentation (géographie, routes
   d'animation de la carte, générateurs de rosters de détail).
3. **Toutes les chaînes affichées passent par l'i18n.** Jamais de texte en dur.
4. **Les tokens de design viennent de l'export Amin Design.** Palettes `rdia` /
   `or` / `danger` dans `tailwind.config.ts` ; classes `.carte`, `.btn-primaire`,
   `.btn-secondaire`, `.input-champ` dans `globals.css`. **Ne pas inventer de
   nouvelles couleurs.**
5. **Le masquage n'est pas de la sécurité.** Le frontend cache ce que l'API
   refuse déjà — voir [04-securite.md](04-securite.md).

## 2. Structure

```
apps/web/src/
├── app/                      31 routes (App Router) ; les écrans composés
│   │                         gardent leurs sous-composants dans _parts/
│   ├── incidents/            page + _parts/ (filtres, détail, sous-incidents)
│   ├── map/                  page + _parts/ (panneau des couches, arbre)
│   └── utilisateurs/         page + _parts/ (onglets, formulaire, rôles)
├── components/
│   ├── shell/                AppFrame, Sidebar, Header, NotificationBell,
│   │                         Copilot (FAB) + CopilotBody (chargé au 1er ⌘K) ;
│   │                         copilot/ = en-tête, réglages, message, composeur,
│   │                         blocks/ (un bloc structuré par fichier)
│   ├── ui/                   système de composants : Badge, Modal, Table,
│   │                         StatTile, ProgressBar, Pill, Avatar, Icon
│   ├── charts/               ChartCard, DonutChart, LineAreaChart, ListCard
│   ├── map/MapCanvas.tsx     carte opérationnelle (MapLibre) : carte, contrôles,
│   │                         événements, effets ; map/layers/ = une couche par
│   │                         fichier (marqueurs, aérien, séismes, boucles,
│   │                         mesure, panache, météo, fond) ; calculs purs
│   │                         dans lib/map/canvas/
│   ├── flux/                 FluxUI, QuakeAlert, WeatherPopup
│   ├── incidents/            IncidentWizard (coquille) + wizard/ (une étape par
│   │                         fichier, hooks de formulaire/IA/localisation),
│   │                         IncidentDraftAssist (hook + boutons)
│   ├── dashboard/            tableau de bord + situational/ (conscience situationnelle)
│   ├── health/               Hospinet : HospinetIAPanel + parts/, affecteur IA
│   ├── opsnet/               OPSnet (unités et abris), pendant d'Hospinet
│   ├── whatif/               WhatIfPageShell + parts/ (simulation « et si ? »)
│   ├── map/layers/spread.ts  socle des simulations sur la carte (canevas,
│   │                         lecture) ; fire.ts, floods.ts = feu, inondation
│   ├── missions/ · org/ · responsibility/ · substances/
└── lib/
    ├── store.ts              le magasin Zustand : réunion des tranches
    ├── store/shared.ts       types de session/UI, clés de persistance, garde IA
    ├── store/slices/         session · ui · domain · seismic · map · missions
    │                         · nrbc · realtime · ai · aviation · chat
    │                         · tracking · drawings · fire · flood
    ├── api.ts · config.ts    accès API (jeton, base) et configuration
    ├── api-client/           types générés depuis l'OpenAPI — NE PAS ÉDITER
    ├── i18n/                 translations.{fr,en,ar} (cœur), modules.{fr,en,ar},
    │                         loader.ts (chargement paresseux EN/AR)
    ├── ai/                   assistant/ (Couche 1 : interprétation et intents)
    │                         · copilot/ (orchestration LLM) · draft/ (brouillon
    │                         d'incident) · risk/ · situational/ · whatif/
    │                         · provider.ts · config.ts
    ├── map/                  style, marqueurs, villes, Maroc, routage, vent ;
    │                         canvas/ = aides pures du rendu (MNT, météo,
    │                         séismes, panache)
    ├── fire/ · flood/ · sim/ simulateurs de feu (Rothermel) et d'inondation
    │                         (onde inertielle, SCS, Froehlich) et leur socle
    │                         commun — voir docs/11-simulateurs-feu-et-inondation.md
    ├── realtime/stream.ts    lecture du flux SSE (fetch + en-tête, reconnexion)
    ├── incidents/wizard.ts   ce que l'assistant de déclaration décide (testé)
    ├── tracking/ · nrbc/ · hazard/   logique métier des lots N-2, N-3, N-5
    ├── data/                 types + référence : seed, dispatch, grades
    ├── derive.ts · helpers.ts · icons.ts · nav.ts · roles.ts · types.ts
    └── __tests__/            tests unitaires (vitest), aussi dans ai/ et map/
```

Deux règles de rangement, vérifiées par le typecheck et les tests :

- **la logique pure vit dans `lib/`, jamais dans un composant** — un fichier de
  `lib/` n'importe jamais `components/` (le moteur de brouillon a été sorti du
  composant pour cette raison) ;
- **un composant par fichier** au-delà de l'écran principal ; ce qu'ils
  partagent (constantes, aides) est dans un `shared.ts` à côté.

## 3. Écrans

| Route | Écran |
| --- | --- |
| `/dashboard` | tableau de bord (dispositions A/B), situation nationale, évolution |
| `/incidents` | liste, recherche, arborescence des sous-incidents, édition, archivage |
| `/map` | carte opérationnelle MapLibre : couches, 2D/3D, satellite/plan, convois animés, séismes, météo planétaire, panneau de sélection |
| `/seismologie` | activité sismique CSEM/EMSC en direct |
| `/repartition` | répartiteur : cockpit de dispatching, moteur de recommandation explicable, mode simulation « et si ? » |
| `/triage` | triage de masse : compteurs START/SALT, flux victimes, zones |
| `/inventaire` | catalogue d'équipements, mouvements, alertes de stock |
| `/equipes` | unités : cartes + détail (personnel, équipements, véhicules) |
| `/personnel` | roster, filtres de disponibilité |
| `/bons-de-travail` | bons de travail : tableau kanban de workflow |
| `/hospinet` | hôpitaux : cartes + détail (personnel, lits, véhicules, hôpitaux de campagne) |
| `/ics` | formulaires ICS 201–214 |
| `/dommages` | évaluation des dommages : histogramme par grade, table EMS-98 |
| `/abris` | abris : occupation, démographie, besoins |
| `/orsec` | tableau ORSEC : bilan, moyens, décisions, permanence |
| `/plans` | dépôt de plans et activation |
| `/communication` | centre de communication (catégories, canaux, messages) |
| `/rapports` | rapports SITREP |
| `/analytique` | 4 KPI + 6 graphiques |
| `/assistant` | assistant IA : requêtes en langage naturel, LLM local, lecture seule et journalisé |
| `/utilisateurs` | gestion des utilisateurs + onglet « Rôles & fonctionnalités » |
| `/parametres` | configuration LLM, matrice de feature flags, alertes sismiques, journal d'audit |
| `/profil` | profil de l'utilisateur connecté |

## 4. Store

Un seul magasin **Zustand** (`useArgos`), mais assemblé à partir de **quinze
tranches** typées (`lib/store/slices/*.ts`), chacune exportant son interface et
son `StateCreator` ; `ArgosState` est leur réunion. Une tranche voit tout l'état
par `set`/`get` mais **n'importe jamais une autre tranche** — elles ne
partagent que `lib/store/shared.ts` et le type `ArgosState`.

| Tranche | Porte |
| --- | --- |
| `session` | jeton, rôle actif, profil, drapeaux, matrice rôle→fonctionnalités |
| `ui` | langue et dictionnaires, thème, navigation, toasts, assistant de déclaration, Copilot |
| `domain` | incidents, unités, hôpitaux, fil, catalogue, statistiques — chargés depuis l'API |
| `seismic` | flux EMSC, alerte globale, focus séisme |
| `map` | couches, 3D/satellite, sélection, grille météo |
| `missions` | boucle fermée (ADR 0007), niveau d'alerte, comptes rendus |
| `nrbc` | substances, panache et sa lecture dans le temps (ADR 0005) |
| `realtime` | liaison SSE, présence, non-lus (lot COMMS) |
| `ai` | journal du Copilot, réglages, priorité opérateur, prédictions de risque, conscience situationnelle |
| `aviation` | aéronefs inscrits et positions |
| `chat` | conversations flottantes (têtes et fenêtres) |
| `tracking` | traceurs GPS et positions partagées |
| `drawings` | croquis de la carte (points, cercles, polygones — ADR 0024), outil en cours, sélection |
| `fire` | simulateur de feu de forêt : point d'allumage, réglages, météo du point, course et lecture (ADR 0011, 0025) |
| `flood` | prévisions de crue (jauges GloFAS / Flood Hub) et simulateur d'inondation : point, scénario, course et lecture (ADR 0010, 0025) |

Les données du domaine sont chargées depuis l'API au montage, via le client
généré. En développement, `window.__argos` expose le magasin pour inspection.

## 5. Internationalisation

- **FR** (défaut), **AR** avec **RTL complet** (police Amiri auto-hébergée), **EN**.
- `lib/i18n/translations.ts` — chaînes du cœur applicatif.
- `lib/i18n/modules.ts` — chaînes des modules métier.
- `lib/i18n/flux.ts` — chaînes du fil d'événements.

Ajouter une chaîne : la déclarer dans les **trois** langues, puis la consommer
via `useDict()` / `useModules()`. Jamais de littéral affiché dans un composant.

Trois règles tenues par les tests et le typecheck :

- **le cœur** (`translations.{fr,en,ar}.ts`, `useDict()`) porte la coquille et
  les écrans historiques ; **les modules** (`modules.{fr,en,ar}.ts`,
  `useModules()`) portent les écrans opérationnels par section — `copilot`,
  `wizard`, `situational`, `whatif`, `hospinet`, … ;
- **une donnée ne porte jamais un libellé, elle porte une clé** (`labelKey`,
  `unitKey`, `NIV_KEY`, `occLabelKey`) résolue à l'affichage : une table de
  configuration reste valable dans les trois langues ;
- **une phrase chiffrée est un gabarit** : `tpl(m.situational.fb_beds, { n })`
  (`lib/i18n/format.ts`), jamais une chaîne de gabarit JavaScript en français.

`i18n.test.ts` refuse une clé absente d'une langue ou une valeur vide.

## 6. Carte opérationnelle

`components/map/MapCanvas.tsx` — le composant le plus dense du frontend.

- **Fond** : styles MapLibre (plan / satellite), bascule 2D/3D.
- **Marqueurs** : unités, hôpitaux (symboles différenciés par nature
  d'établissement), incidents, hôpitaux de campagne, convois animés.
- **Séismes** : couche CSEM/EMSC avec alerte distincte pour les événements
  nationaux (couleur, animation, son).
- **Météo planétaire** : température et précipitations en rasters sur canvas,
  **vent en particules dans l'espace écran** (densité constante quel que soit
  le zoom), températures affichées au-dessus des villes avec niveau de détail
  par zoom.
- **Interactions** : `Maj + clic droit` ouvre le point météo (titré par la ville
  la plus proche) et permet de déclarer un incident à cet endroit.
- **Simulateurs** : feu de forêt (Rothermel 1972 sur les modèles d'Anderson,
  temps minimal de parcours) et inondation (onde inertielle de Bates 2010,
  hydrogramme du SCS, rupture de barrage selon Froehlich 2008 sur le
  référentiel des grands barrages) — calculés dans le navigateur sur les tuiles
  d'altitude, lus en animation sur un canevas, points atteints listés. Réservés
  aux rôles de conduite (modules `simFire` / `simFlood`). Tout est dans
  [11-simulateurs-feu-et-inondation.md](11-simulateurs-feu-et-inondation.md).
- **Dessin** : points, cercles et polygones nommés, dessinés à la souris,
  partagés en temps réel, modifiables par leur auteur ou le Super
  Administrateur (ADR 0024).

Pièges MapLibre documentés dans le code : la bibliothèque **mute l'objet de
style** (d'où `structuredClone`), `isStyleLoaded()` peut rester faux sous
throttling CDN, et `map.on("contextmenu")` ne reçoit pas les événements
synthétiques (d'où `onContextMenu` React + `map.unproject`).

## 7. Assistant IA

`lib/ai/` — orchestrateur en **lecture seule**, journalisé, activable par
feature flag. Priorité aux **runtimes locaux** (Ollama, vLLM) au titre de la
souveraineté : aucune donnée opérationnelle ne sort de l'infrastructure. Le
fournisseur, l'URL et le modèle se configurent dans `/parametres`
(Super Administrateur).

| Dossier | Rôle |
| --- | --- |
| `ai/assistant/` | **Couche 1** : interprétation déterministe de la question sur les données ARGOS (`interpret`), un fichier par famille d'intentions (`intents/`), construction du message envoyé au modèle (`prompt.ts`, quotas de lignes) |
| `ai/copilot/` | orchestration du tour de parole : budget d'historique (`history.ts`), blocs structurés et raccourcis Couche 1 (`blocks.ts`), flux cadencé, garde-fou de fuite d'invite et verdict (`turn.ts`) |
| `ai/draft/` | moteur de brouillon d'incident : lexique, groupes sémantiques, réserves de formulations, choix reproductible par `salt` — **n'invente aucun fait** |
| `ai/risk/` · `ai/situational/` · `ai/whatif/` | prédiction de risques, conscience situationnelle, simulation |
| `ai/provider.ts` | dialogue avec le runtime (flux, `think:false` pour les modèles raisonneurs, `keep_alive`, mesures réelles) |

Le composant `CopilotBody` ne garde que les gardes de sécurité (injection,
salutations), l'appel à la Couche 1 et les écritures dans le journal.

## 8. Commandes

```bash
npm run dev        # http://localhost:3004
npm run build
npm run typecheck  # tsc --noEmit (strict)
```

Variable d'environnement : `NEXT_PUBLIC_API_URL` (défaut
`http://127.0.0.1:3005`).

## 9. Ajouter un écran

1. Créer `src/app/<route>/page.tsx`.
2. Déclarer la route dans `lib/nav.ts` (`HREF` + `NAV`).
3. Ajouter les chaînes dans les trois langues (`lib/i18n/`).
4. Si l'écran est pilotable par rôle, ajouter la fonctionnalité à
   `MODULE_FEATURES` côté API et à la matrice rôle→fonctionnalités.
5. Consommer les données via le store, jamais par un `fetch` direct.
6. Vérifier dans le navigateur — le typecheck ne suffit pas.

## 10. Tests

`npm run test:web` (vitest, environnement Node, alias `@`) — **223 tests** dans
`src/lib/**/__tests__/` et `components/map/layers/__tests__/`. Ils fixent ce
qui casse en silence : parité des clés i18n FR/EN/AR, résolution des routes de
navigation, matrice des rôles et droits par mode, affecteurs Hospinet/OPSnet,
découpage SSE, décodage des traceurs, aides pures de la carte, moteur de
brouillon (reproductibilité, aucun chiffre inventé), orchestration du Copilot
(budget d'historique, blocs, délais), simulateurs (`fire.test` : tableau
d'Anderson, vent, pente, humidité, extinction ; `hydro.test` : Froehlich 2008,
conservation du volume, SCS, référentiel des barrages), croquis, cascade
région → province → commune, style souverain et repli des tuiles. Un test se
place à côté de la logique qu'il protège ; il n'y a pas de test de rendu.

