# Décisions d'architecture (ADR)

Un ADR par décision structurante. Règle du dépôt (`CLAUDE.md`) : **toute
déviation du `MASTER_PLAN.md` fait l'objet d'un ADR**, ainsi que toute nouvelle
dépendance runtime.

| # | Décision | Statut | Portée |
| --- | --- | --- | --- |
| [0001](0001-moteur-de-routage.md) | Moteur de routage | accepté | itinéraires, carte |
| [0002](0002-flux-externes-sismologie-meteo.md) | Flux externes : sismologie (EMSC) et météo (Open-Meteo) | accepté | `apps/api` modules `seismic`/`weather`, pages `/seismologie`, `/meteo` |
| [0003](0003-module-orders-architecture-hexagonale.md) | Module `orders` : architecture hexagonale et inversion des dépendances | accepté | `apps/api/src/modules/orders`, schéma `work_orders`, permissions `workorders:*` |
| [0004](0004-suivi-aerien-ads-b.md) | Suivi aérien : flux ADS-B filtré sur liste de suivi | accepté | `apps/api/src/modules/aviation`, carte `/map`, permissions `aviation:*` |
| [0005](0005-capacite-nrbc.md) | Capacité NRBC : déclaration outillée et panache chimique sur carte | **accepté** (phases 1-3) | wizard incident, module `nrbc`, carte, `/parametres` |
| [0006](0006-courtier-de-flux-externes.md) | Courtier de flux externes : séparer ARGOS de ses fournisseurs | **accepté** (phase 1) | `apps/broker`, adaptateurs sortants de `apps/api`, CSP et fond de carte de `apps/web`, `infra/compose` |
| [0007](0007-missions-boucle-fermee.md) | Missions : la boucle fermée des gestes opérationnels | **accepté** (lot S1) | `apps/api/src/modules/missions`, permission `missions:*` |
| [0009](0009-dotations-provisoires-a-arbitrer.md) | Dotations provisoires de la matrice : ce que l'état-major doit arbitrer | **proposé** | `permissions.ts` (bloc `LEGACY`), 14 fonctionnalités |
| [0008](0008-ecouteur-tcp-traceurs-fmc920.md) | Traceurs FMC920 : ARGOS est le serveur du boîtier (Codec 8 sur TCP) ; révision : partage de position par l'application, un compte ne verse que la sienne | **accepté** (lot N-2, révisé) | `apps/api/src/modules/tracking`, permission `tracking:*`, second port en écoute |
| [0010](0010-crues-flood-hub-et-simulateur.md) | Crues : prévisions GloFAS (Open-Meteo, sans clé) ou Google Flood Hub (sur clé) par le courtier, simulateur d'inondation hydraulique local (onde inertielle, débit et volume, animé) | **accepté** | `flood.service.ts`, `flood.openmeteo.ts`, routes `floods/*`, `lib/flood/`, panneau « Crues » de la carte, `FLOOD_API_KEY` |
| [0011](0011-feux-de-foret-simulateur.md) | Feux de forêt : simulateur de propagation local (temps minimal de parcours, vent, pente, combustible), socle commun des propagations | **accepté** | `lib/fire/`, `lib/sim/spread.ts`, `layers/{spread,fire}.ts`, panneau « Feux de forêt » de la carte |
| [0012](0012-service-morgue-chaine-de-garde.md) | Service morgue : morgues mobiles, chaîne de garde, traçabilité hôpital → site (doctrine DVI / OMS-CICR) ; identification progressive signée par mot de passe et tracée | **accepté** (révisé) | `morgue.rules.ts`, routes `morgues/*`, `hospitals/:id/deceased`, page `/morgue`, `components/morgue/`, couche `layers/morgues.ts` |
| [0013](0013-exposition-temporaire-tunnel.md) | Exposition temporaire de la station sur Internet par un tunnel tiers (tunnelto.dev) — démonstrations seulement ; client épinglé ; borne des échecs de connexion | **accepté** (démonstrations) | `deploy/scripts/tunnel.ps1`, `deploy/scripts/package.sh`, `auth.controller.ts` (`RateWindow` sur `login`) |
| [0014](0014-fond-de-carte-externe-station.md) | Fond de carte de la station : fournisseurs externes (Esri/Maxar, OpenStreetMap, relief AWS) par défaut, mode hors ligne conservé — révise l'ADR 0006 sur ce point | **accepté** (révisé : intégrité territoriale) | `lib/map/tiles.ts`, `lib/map/plan.ts` (plan vectoriel, frontières contestées non tracées), `next.config.mjs` (CSP), `deploy/docker-compose.yml` (`MAP_TILES`, profil `sovereign`), `package.sh --map`, `infra/geo/tools/tiles.py` |
| [0022](0022-deux-profils-de-roles-classique-direx.md) | Deux profils de rôles dans une même application : `classique` (l'organisation actuelle, inchangée) et `direx` (DIREX, PC FAR, PCF, PCT, PCO, chefs d'entité — 26 rôles) sur le même port et les mêmes données ; les règles testent des capacités, plus des noms de rôles ; sous-incidents en module à part ; grille de départ `docs/matrice-roles-direx.xlsx` ; branche `fusion-V2` | **proposé** | `permissions.ts`, `*.rules.ts`, `visibility.service.ts`, `lib/roles.ts`, `app/utilisateurs/*` |
| [0023](0023-version-rif-carte-complete-sans-internet.md) | Version RIF : la carte complète du Maroc sans Internet — le plan et les toponymes souverains sont les mêmes tuiles vectorielles qu'en ligne (style de la station rebasé), l'imagerie hors ligne ne laisse pas de trou (repli sur la tuile parente), couverture par zones dont chaque commune, tuiles livrées avec le paquet ; branche `fusion-RIF` | **accepté** | `lib/map/{plan,satFallback}.ts`, `infra/geo/*`, `deploy/scripts/tiles-*` |
| [0024](0024-mode-dessin-croquis-sur-la-carte.md) | Mode dessin : des croquis nommés sur la carte (points, cercles, polygones) — entité du domaine servie à qui voit la carte, dessinée par qui l'édite, retirée par l'auteur ou l'administration ; dessin fait maison sur MapLibre, poignées d'édition, étiquettes DOM déplaçables lisibles dans les deux modes de tuiles | **accepté** | `drawings.controller.ts`, `lib/map/drawings.ts`, `components/map/{DrawToolbox,layers/drawings}` |
| [0025](0025-simulateurs-aux-normes-rothermel-froehlich.md) | Les simulateurs aux normes du domaine : Rothermel (1972) sur les 13 modèles d'Anderson, humidité de Simard, vent effectif FARSITE, flammes de Byram pour le feu ; Froehlich (2008) et hydrogramme du SCS pour l'inondation, rugosité de Manning, référentiel des 33 grands barrages du Royaume (Al Wahda 3 522 hm³) et des crues marquantes des grands oueds | **accepté** | `lib/fire/rothermel.ts`, `lib/flood/{hydro,dams}.ts` |
| [0026](0026-opsnet-porte-des-moyens-tous-les-titulaires.md) | OPSnet, la porte des moyens : cliquer une unité ou un abri, c'est y entrer — fiche à l'écran (`?unit=` / `?shelter=`, la carte y mène) avec ses moyens tenus sur place (personnes, équipes, véhicules, logistique, équipements, droits dits par l'API) ; tous les titulaires d'une entité affichés et joignables (OPSnet, Hospinet, morgue, carte), rattachements propagés en temps réel (`responsables`) |
| [0021](0021-tracabilite-du-centre-de-communication.md) | Traçabilité du centre de communication : le canal d'une opération porte son titre tel quel et le suit, conversations conservées (instantané `comms`, horodatage `at`), archives en lecture seule (administration, une conversation directe jamais), export JSON `iris-comms/1` par canal ou de tout le centre, import repris en archives sans fusion et idempotent | **accepté** | `comms.service.ts`, `comms.controller.ts`, `incidents.controller.ts`, `dto.ts`, `app/communication/page.tsx`, `lib/comms/archives.ts` |
| [0020](0020-tableau-de-bord-reel-carte-de-tous-unites-par-auteur.md) | Tableau de bord compté sur les données introduites et la portée du compte (incidents datés, plus rien de simulé), l'incident sur la carte de tous, unités visibles par auteur et concernement (rattachement à l'opération à l'inscription), organe devant le nom des unités | **accepté** | `domain.analytics.ts`, `visibility.service.ts`, `dashboard.controller.ts`, `resources.controller.ts`, `app/dashboard/page.tsx`, `lib/map/markers.ts` |
| [0019](0019-visibilite-des-ressources-audience-des-messages-opsnet.md) | Ressources visibles par qui elles concernent (portée : entité, région, opération ; 404 hors portée), messages poussés à l'audience de leur canal, OPSnet modifiable avec l'organe d'origine des unités et des abris | **accepté** | `visibility.service.ts`, `resources-registry.controller.ts`, `comms.service.ts`, `app/opsnet/page.tsx`, `EditEntityModals.tsx`, `ResourcesScreen.tsx` |
| [0018](0018-mode-edition-par-role-terrain-simulations.md) | Mode édition de la carte par rôle (stratégique → OPCOM, OPCOM → dispositif tactique, TACOM et cellules → leurs équipes, équipements et véhicules sur le terrain) ; ressources posées sur le terrain ; simulations crue, feu et NRBC réservées à la conduite ; quatre capacités de la carte dans la matrice | **accepté** | `edit.rules.ts`, `permissions.ts`, `resources-registry.controller.ts`, `posts.controller.ts`, `lib/edit.ts`, `PostToolbox.tsx`, `MapCanvas.tsx`, `app/map/page.tsx` |
| [0017](0017-menu-complet-dans-la-matrice-des-modules.md) | Tout le menu dans la matrice rôle → modules (30 modules, cœur verrouillé, défauts par rôle) ; « Gestion de mon entité » effective côté API et donnée d'office au commandant d'unité, nommée par l'entité du rôle | **accepté** | `permissions.ts`, `permissions.guard.ts`, `users.service.ts`, `flags.*`, `lib/nav.ts`, `RolesTab.tsx`, `Sidebar.tsx`, `app/page.tsx` |
| [0016](0016-chaine-de-commandement-modes-ressources.md) | Chaîne de commandement pendant un incident : cinq rôles (représentants de l'OPCOM, PC du TACOM), corps des unités, affectation OPCOM → TACOM et déploiement terrain ; modes démonstration / exercice / opérationnel persistés (redémarrage de l'API) ; ressources des entités (personnes, équipes, véhicules, logistique, équipements) ; bascule de modules par compte ; alertes acquittées et rappel sonore ; météo pour tous, trajectoires des aéronefs | **accepté** | `permissions.ts`, `app-mode.ts`, `modules/mode`, `assignment/mode/resources.rules.ts`, `resources.service.ts`, `resources-registry.controller.ts`, `UnitAssignments.tsx`, `app/ressources`, `DataProfileCard.tsx`, `NotificationBell.tsx` |
| [0015](0015-profil-de-donnees-station-vide.md) | Profil de données `demo`/`empty` : la station en service démarre vide (réseau hospitalier conservé), suppressions d'entités et purge signée réservées au Super Administrateur, bascules rôle → modules et drapeaux effectives côté API, carte des abris et des positions partagées — révise l'ADR 0009 (`map`, `comms`, `tracking` ouverts aux responsables) | **accepté** | `common/data-profile.ts`, `profile.rules.ts`, `domain.service.ts`, `admin.controller.ts`, routes `DELETE`, `permissions.ts` (`MODULE_KEYS`, `FEATURE_MODULE`), `permissions.guard.ts`, `feature-gate.port.ts`, `layers/{points,shelters,trackers}.ts`, `DeleteEntityModal.tsx`, `DataProfileCard.tsx`, `deploy` (`DATA_PROFILE`) |

## Écrire un ADR

Nommage : `NNNN-titre-en-minuscules-avec-tirets.md`, numéro incrémental.

Structure attendue :

```markdown
# ADR NNNN — Titre

- **Statut :** proposé | accepté | remplacé par ADR NNNN
- **Date :** AAAA-MM-JJ
- **Portée :** fichiers et modules concernés

## Contexte
Le problème, les contraintes, ce qui a déclenché la décision.

## Décision
Ce qui est décidé, précisément.

## Conséquences
Positives ET négatives. Un ADR sans conséquence négative est incomplet.

## Alternatives écartées
Ce qui a été envisagé et pourquoi ce n'est pas retenu.
```

Un ADR n'est pas un tutoriel : il enregistre **pourquoi**. Le **comment** va
dans la documentation technique (`docs/`) ou le README du module.
