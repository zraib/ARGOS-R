# ARGOS — Poste de commandement (`apps/web`)

Application web de commandement (vue nationale) pour la gestion des
catastrophes par les Forces Armées Royales.

**Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS ·
Zustand · MapLibre GL.** Port **3004**.

Recréation haute-fidélité de la référence de design `design_handoff_argos/`,
à lire comme une **spécification** (son runtime de prototype `support.js`
n'est pas réutilisé).

> Documentation détaillée — écrans, store, i18n, carte, conventions :
> [docs/05-frontend.md](../../docs/05-frontend.md).

---

## Démarrage

Depuis la racine du dépôt, `npm run dev` lance le web et l'API ensemble.
Pour le web seul :

```bash
npm install
npm run dev          # http://localhost:3004
npm run build
npm run typecheck    # tsc --noEmit (strict)
```

Variable d'environnement : `NEXT_PUBLIC_API_URL`
(défaut `http://127.0.0.1:3005`).

## État

Frontend **entièrement câblé sur l'API ARGOS**, en contract-first.
L'authentification, l'IAM, les feature flags, l'audit **et toutes les données
du domaine** (incidents, unités, hôpitaux, fil d'événements, dispatching,
catalogue des modules, sismologie, météo) sont servis par l'API NestJS et
chargés dans le store via le client généré.

`src/lib/data/` ne conserve que des types et des données de
référence/présentation : géographie, routes d'animation de la carte,
générateurs de rosters de détail.

## Règles

1. **Contrat d'abord** — consommer uniquement le client généré
   (`src/lib/api-client/`). **Aucun `fetch` écrit à la main** vers l'API.
   Ces fichiers sont générés : ne pas les éditer.
2. **i18n obligatoire** — toute chaîne affichée passe par `lib/i18n/`,
   déclarée dans les **trois** langues. Jamais de texte en dur.
3. **Tokens de design uniquement** — palettes `rdia` / `or` / `danger`
   (`tailwind.config.ts`), classes `.carte`, `.btn-primaire`, `.btn-secondaire`,
   `.input-champ` (`globals.css`). **Ne pas inventer de couleurs.**
4. **Le masquage n'est pas de la sécurité** — le frontend cache ce que l'API
   refuse déjà. Voir [docs/04-securite.md](../../docs/04-securite.md).
5. **Souveraineté** — ressources auto-hébergées uniquement (polices dans
   `public/fonts`). Aucun CDN, aucune analytics, aucune nouvelle dépendance
   runtime sans ADR.
6. `strict: true`, pas de `any` ni de `any` implicite, énumérations traitées
   exhaustivement.

## Structure

```
src/
├── app/            24 routes (App Router)
├── components/
│   ├── shell/      cadre applicatif, sidebar, header, écrans de connexion
│   ├── ui/         système de composants (Badge, Modal, Table, StatTile…)
│   ├── charts/     graphiques
│   ├── map/        MapCanvas — carte opérationnelle + couches météo
│   ├── flux/       fil d'événements, alerte sismique, pop-up météo
│   ├── incidents/  wizard de déclaration, aperçu de localisation
│   ├── dashboard/  situation nationale (silhouette SVG)
│   ├── health/     symboles hospitaliers
│   └── org/        modales d'ajout (unité, hôpital)
└── lib/
    ├── store.ts    store Zustand — source de vérité côté client
    ├── api-client/ types générés depuis l'OpenAPI (NE PAS ÉDITER)
    ├── i18n/       translations · modules · flux
    ├── data/       types + référence (seed, dispatch, grades, users)
    ├── map/        style, markers, cities, morocco, overlay, routing
    ├── ai/         assistant IA (LLM local)
    └── types.ts    types du domaine
```

## Écrans

24 routes : tableau de bord, incidents, carte opérationnelle, sismologie,
répartiteur, triage, inventaire, unités, personnel, bons de travail, hôpitaux,
ICS, dommages, abris, ORSEC, plans, communication, rapports, analytique,
assistant IA, utilisateurs, paramètres, profil.

Tableau détaillé : [docs/05-frontend.md § 3](../../docs/05-frontend.md#3-écrans).

Transverse : thème clair/sombre persisté, i18n **FR / AR / EN** avec **RTL**
complet en arabe (police Amiri auto-hébergée), simulation temps réel (fil
d'événements et convois), toasts, changement de rôle en session pour les
comptes multi-rôles.

## Ajouter un écran

1. `src/app/<route>/page.tsx`
2. Déclarer la route dans `lib/nav.ts` (`HREF` + `NAV`)
3. Ajouter les chaînes dans les trois langues (`lib/i18n/`)
4. Si l'écran est pilotable par rôle : ajouter la fonctionnalité à
   `MODULE_FEATURES` côté API et à la matrice rôle→fonctionnalités
5. Consommer les données via le store, jamais par un `fetch` direct
6. **Vérifier dans le navigateur** — le typecheck ne suffit pas
