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
├── app/                      24 routes (App Router)
├── components/
│   ├── shell/                AppFrame, Sidebar, Header, LoginScreen,
│   │                         RoleChooserScreen, ChangePasswordScreen, Toast…
│   ├── ui/                   système de composants : Badge, Modal, Table,
│   │                         StatTile, ProgressBar, Pill, Avatar, Icon
│   ├── charts/               ChartCard, DonutChart, LineAreaChart, ListCard
│   ├── map/MapCanvas.tsx     carte opérationnelle (MapLibre + couches météo)
│   ├── flux/                 FluxUI, QuakeAlert, WeatherPopup
│   ├── incidents/            IncidentWizard, LocationPreviewMap
│   ├── dashboard/            MoroccoSituation (silhouette SVG)
│   ├── health/               HealthGlyph (symboles hospitaliers)
│   └── org/                  AddEntityModals (unité, hôpital)
└── lib/
    ├── store.ts              store Zustand (source de vérité côté client)
    ├── api.ts · config.ts    accès API et configuration
    ├── api-client/           types générés depuis l'OpenAPI — NE PAS ÉDITER
    ├── i18n/                 translations.ts (cœur), modules.ts, flux.ts
    ├── data/                 types + référence : seed, dispatch, grades, users
    ├── map/                  style, markers, cities, morocco, overlay, routing
    ├── ai/                   assistant, provider, config (LLM local)
    ├── derive.ts             dérivations pour l'affichage
    ├── helpers.ts · icons.ts · nav.ts · roles.ts · reco.ts · sound.ts
    └── types.ts              types du domaine
```

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

Store **Zustand** unique (`src/lib/store.ts`), organisé en tranches :
session et rôle · utilisateurs · incidents et sous-incidents · unités ·
hôpitaux · fil d'événements · dispatching · communications · catalogue des
modules · sismologie et configuration d'alerte · météo (grilles nationale et
mondiale) · couches de carte et sélection · feature flags · i18n et thème ·
toasts.

Les données du domaine sont chargées depuis l'API au montage, via le client
généré. En développement, `window.__argos` expose le store pour inspection.

## 5. Internationalisation

- **FR** (défaut), **AR** avec **RTL complet** (police Amiri auto-hébergée), **EN**.
- `lib/i18n/translations.ts` — chaînes du cœur applicatif.
- `lib/i18n/modules.ts` — chaînes des modules métier.
- `lib/i18n/flux.ts` — chaînes du fil d'événements.

Ajouter une chaîne : la déclarer dans les **trois** langues, puis la consommer
via `useDict()` / `useModules()`. Jamais de littéral affiché dans un composant.

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
