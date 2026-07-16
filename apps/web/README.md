# ARGOS — Command Web App (`apps/web`)

Poste de commandement (vue nationale) pour la gestion des catastrophes par les
Forces Armées Royales. Recréation haute-fidélité du prototype de design
(`design_handoff_argos/`) dans l'environnement de production cible défini par le
`MASTER_PLAN.md` : **Next.js 15 (App Router) + TypeScript strict + Tailwind CSS**.

> État : **frontend entièrement câblé sur l'API ARGOS (contract-first)**.
> L'authentification (login/mdp/rôle), l'IAM (utilisateurs, rôles,
> fonctionnalités), les feature flags, l'audit **et toutes les données du
> domaine** (incidents, unités, hôpitaux, fil, dispatching, et le catalogue des
> modules : inventaire, triage, ORSEC, plans, ICS, rapports, analytique…) sont
> servis par le backend NestJS et chargés dans le store via le client généré.
> `src/lib/data/` ne conserve que des types + des données de
> référence/présentation (géographie, animation carte, générateurs de détail).

## Démarrage

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # build de production
npm run typecheck    # tsc --noEmit (strict)
```

Variable d'environnement : `NEXT_PUBLIC_API_URL` (défaut `http://localhost:4100`)
pointe vers l'API ARGOS (`apps/api`).

**Authentification.** Si l'API est joignable, la connexion appelle
`POST /auth/dev-token` (jeton de développement HS256) puis `GET /iam/me` pour
résoudre le **rôle réel et les permissions côté serveur** ; le jeton porteur est
conservé en `sessionStorage`. Un **sélecteur de rôle** (7 rôles) permet de tester
la matrice RBAC. Si l'API est injoignable, un **repli démo** ouvre la session
localement (n'importe quel couple *matricule / mot de passe* non vide). En
production, `dev-token` est remplacé par Keycloak/OIDC (déjà supporté côté API
via `AUTH_MODE=keycloak`).

## Écrans livrés

| Route | Écran | État |
|---|---|---|
| `/` → `/dashboard` | Tableau de bord (dispositions A/B) | ✅ |
| `/incidents` | Table + recherche | ✅ |
| `/map` | Carte opérationnelle MapLibre (couches, 2D/3D, satellite/plan, convois animés, panneau de sélection) | ✅ |
| `/repartition` | Répartiteur (§6.16) : cockpit de dispatching + moteur de recommandation explicable (§6.17 L1) + mode simulation « et si ? » (poids configurables) | ✅ |
| `/equipes` | Unités : cartes + détail (Personnel / Équipements / Véhicules) | ✅ |
| `/hospinet` | Hôpitaux : cartes + détail (Personnel / Lits / Véhicules / Hôpitaux de campagne) | ✅ |
| `/communication` | Centre de communication type Discord | ✅ |
| Wizard « Signaler un incident » | Modal 3 étapes (type → détails → localisation) | ✅ |
| `/triage` | Triage de masse : compteurs START/SALT, flux victimes, zones | ✅ |
| `/inventaire` | Inventaire équipements : catalogue + mouvements, alertes stock | ✅ |
| `/personnel` | Roster personnel : filtres de disponibilité | ✅ |
| `/bons-de-travail` | Bons de travail : tableau kanban de workflow | ✅ |
| `/ics` | Formulaires ICS (201–214) | ✅ |
| `/dommages` | Évaluation des dommages : histogramme par grade + table EMS-98 | ✅ |
| `/abris` | Gestion des abris : occupation, démographie, besoins | ✅ |
| `/orsec` | Tableau ORSEC : bilan, moyens, décisions, permanence | ✅ |
| `/plans` | Dépôt de plans + activation | ✅ |
| `/rapports` | Rapports SITREP | ✅ |
| `/analytique` | Analytique : 4 KPI + 6 graphiques | ✅ |
| `/assistant` | Assistant IA (§6.17 Couche 2) : requêtes NL → Couche 1, LLM local (Ollama/vLLM) favorisé, lecture seule + journalisé, flag-gated | ✅ |
| `/utilisateurs` | Gestion des utilisateurs (Super Admin + Admin) : **création/modification en modale** avec règles de rôles (Super Admin = multi-rôles ; Admin = mono-rôle, hors Admin/Super Admin), **code temporaire** + cycle de vie (inactif → 1er login + changement de mot de passe → actif ; activation forcée par le Super Admin), indicateur de connexion (vert/rouge), **suppression avec confirmation** ; comptes **persistés localement** (localStorage) ; onglet **Rôles & fonctionnalités** (Super Admin) : autorisations de modules par rôle, appliquées à la navigation | ✅ |
| `/parametres` | Paramètres (Super Admin, §6.15) : configuration LLM (fournisseur, URL, modèle détecté, statut) + **matrice de feature flags synchronisée avec l'API** (GET au montage, PATCH au basculement, repli local) + **journal d'audit** (entrées récentes + intégrité de chaîne) ; extensible | ✅ |

Fonctionnalités transverses : thème clair/sombre persisté, i18n **FR / AR / EN**
avec **RTL** complet en arabe (police Amiri), simulation temps réel (fil
d'événements + convois), toasts.

## Structure

```
src/
├── app/                    # routes App Router (une page par écran)
│   ├── layout.tsx          # <html>, bootstrap du thème, AppFrame
│   └── <route>/page.tsx
├── components/
│   ├── ui/                 # Carte, Button, Input (globals.css), Badge, Modal, ProgressBar, Icon
│   ├── charts/             # ChartCard (bars/column3d), DonutChart, ListCard — SVG pur
│   ├── shell/              # AppFrame, Sidebar, Header, LoginScreen, ChangePasswordScreen, RoleChooserScreen, Toast, LanguageSwitch, StubScreen
│   ├── dashboard/          # MoroccoSituation (SVG)
│   ├── incidents/          # IncidentWizard (modal 3 étapes)
│   └── map/                # MapCanvas (MapLibre GL, chargé en dynamic ssr:false)
└── lib/
    ├── api.ts             # client API ARGOS (jeton sessionStorage, base NEXT_PUBLIC_API_URL)
    ├── api-client/        # copie embarquée du client typé généré (source : packages/api-client)
    ├── roles.ts           # source unique du type Role + catalogue + règles de création
    ├── store.ts            # Zustand — état global (auth+token+apiConnected+session, users, roleFeatures, thème, langue, incidents, carte, comms, flags)
    ├── data/users.ts       # comptes gérés (cycle de vie, code temp) + matrice rôle→fonctionnalités
    ├── types.ts            # types du domaine
    ├── i18n/translations.ts# dictionnaires FR/AR/EN
    ├── data/seed.ts        # données simulées (unités, hôpitaux, incidents, routes, comms)
    ├── derive.ts           # génération déterministe des rosters de détail
    ├── helpers.ts          # libellés, badges, transformations SVG⇄lng/lat
    ├── icons.ts            # chemins SVG
    ├── nav.ts              # modèle de navigation (menu + groupes)
    ├── config.ts           # niveau d'alerte, simulation
    ├── reco.ts             # moteur de recommandation Couche 1 (scoring explicable)
    ├── ai/                 # assistant Couche 2 : config (LLM local d'abord), adaptateurs, orchestrateur NL→Couche 1
    └── map/                # style MapLibre, constructeurs de marqueurs
```

## Correspondance avec le MASTER_PLAN

- **Tokens de design** importés 1:1 depuis l'export « Amin Design / Kanban RDIA »
  (palettes `rdia` / `or` / `danger`, classes `.carte` / `.btn-primaire` /
  `.btn-secondaire` / `.input-champ`) → `tailwind.config.ts` + `globals.css`.
- **Souveraineté** : polices auto-hébergées (`public/fonts`), aucune dépendance
  runtime hors les tuiles cartographiques de démonstration (Esri/OSM), à
  remplacer par des tuiles vectorielles `martin` auto-hébergées (MASTER_PLAN §5.1).
- **Refactorabilité** : le domaine restant a pour seule source `lib/data/` ;
  brancher les endpoints générés n'impacte pas les écrans. L'auth, les
  permissions et les flags passent déjà par le client généré (`lib/api.ts`).
- **Contract-first** : `packages/api-client` est généré depuis l'`openapi.json`
  de l'API (types openapi-typescript + client openapi-fetch) ; le frontend
  n'écrit jamais de `fetch` à la main.

## Limites connues (prototype)

- Domaine (unités, hôpitaux, incidents) encore en données simulées ; l'auth, les
  permissions et les flags sont servis par l'API réelle (repli démo si injoignable).
- Session conservée en `sessionStorage` (elle survit au rafraîchissement et se
  vide à la fermeture de l'onglet). Le jeton `dev-token` est un jeton de
  développement — la production utilisera des sessions Keycloak/OIDC (`AUTH_MODE=keycloak`).
- Tuiles satellite/plan servies par des CDN externes en démo ; hors-ligne /
  air-gap prévu via tuiles auto-hébergées.
- **Assistant IA :** le cœur (traduction NL → Couche 1 + exécution + réponses)
  fonctionne **sans LLM** (réponses déterministes). Le LLM local ne fait que
  reformuler, **en streaming**. Les modèles installés sont **détectés
  automatiquement** (Ollama `/api/tags`) et sélectionnables dans l'écran ; le
  fournisseur par défaut est dans `src/lib/ai/config.ts` (Ollama
  `http://localhost:11434`). En production, l'appel passe par l'API ARGOS (les
  outils s'exécutent sous les permissions de l'utilisateur), pas directement
  depuis le navigateur.
