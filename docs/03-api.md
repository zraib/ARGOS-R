# Référence API

> **Document généré** par `npm run docs:api` à partir du contrat versionné
> (`packages/api-client/openapi.json`, synchronisé avec le code par
> `npm run contract:sync`) et des décorateurs des contrôleurs. Ne pas éditer à la main : modifier le
> code, puis régénérer.

Monolithe modulaire NestJS. Base : `http://localhost:3005/api` ·
documentation interactive (Swagger) : `http://localhost:3005/api/docs`.

## Règles d'accès

- Toute route exige un jeton porteur (`Authorization: Bearer <jwt>`) sauf
  celles marquées **publique**.
- La colonne **Accès** est la permission `ressource:action` exigée par la
  garde `PermissionsGuard` (défaut-refus). Sans cette permission : **403** ;
  sans jeton : **401**. « authentifié (soi-même) » (`@SelfService()`) désigne
  les routes qui n'agissent que sur la session appelante.
- Les permissions sont résolues côté serveur à partir de la matrice
  `shared/permissions.ts` (voir [Sécurité](04-securite.md)). Le test
  `authz-coverage.spec.ts` refuse toute route sans l'un de ces trois marqueurs.


## Santé — `/api/health`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/health` | **publique** | Sonde de vivacité (publique) |

## Authentification — `/api/auth`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `POST` | `/api/auth/change-password` | authentifié (soi-même) | Changer son mot de passe (1er login) — active le compte |
| `POST` | `/api/auth/dev-token` | **publique** | Jeton de développement (mode dev uniquement) |
| `POST` | `/api/auth/login` | **publique** | Connexion d'un compte géré (matricule + code/mot de passe) |
| `POST` | `/api/auth/password-reset-request` | **publique** | Mot de passe oublié : demander un code provisoire à l'administration (sans session) |
| `GET` | `/api/auth/profile` | authentifié (soi-même) | Profil du compte connecté (nom, grade, rôles, photo) |
| `PATCH` | `/api/auth/profile` | authentifié (soi-même) | Modifier son profil : nom affiché et/ou photo (audité) |
| `POST` | `/api/auth/select-role` | authentifié (soi-même) | Choisir le rôle actif (compte multi-rôles) — nouveau jeton |

## Identité et habilitations — `/api/iam`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/iam/me` | authentifié (soi-même) | Profil de l'utilisateur courant + permissions résolues |
| `GET` | `/api/iam/permissions` | `users:view` | Catalogue des permissions |
| `GET` | `/api/iam/role-features` | `users:view` | Matrice rôle → fonctionnalités |
| `PATCH` | `/api/iam/role-features/{role}` | `users:update` | Activer/désactiver une fonctionnalité pour un rôle (Super Admin) |
| `GET` | `/api/iam/roles` | `users:view` | Catalogue des rôles et de leurs permissions |
| `GET` | `/api/iam/users` | `users:view` | Lister les utilisateurs (Admin/Super Admin) |
| `POST` | `/api/iam/users` | `users:create` | Créer un utilisateur (règles d'attribution appliquées côté serveur) |
| `DELETE` | `/api/iam/users/{id}` | `users:delete` | Supprimer un utilisateur |
| `PATCH` | `/api/iam/users/{id}` | `users:update` | Modifier un utilisateur (nom, grade, rôles) |
| `POST` | `/api/iam/users/{id}/active` | `users:update` | Activer/suspendre un compte (Super Admin) — activation forcée possible |
| `POST` | `/api/iam/users/{id}/reset-code` | `users:update` | Régénérer le code temporaire d'un compte |
| `GET` | `/api/iam/users/{id}/temp-code` | `users:view` | Consulter le code temporaire (Admin/Super Admin) |

## Feature flags — `/api/flags`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/flags` | `settings:view` | Lire la matrice des feature flags |
| `PATCH` | `/api/flags/{key}` | `settings:update` | Activer/désactiver un module (Super Admin) — audité |

## Audit — `/api/audit`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/audit` | `audit:view` | Lister les entrées du journal d'audit (rôle Auditeur/Super Admin) |
| `GET` | `/api/audit/verify` | `audit:view` | Vérifier l'intégrité de la chaîne d'audit (tamper-evidence) |

## Domaine opérationnel — incidents, unités, hôpitaux, abris, morgue, équipement, référence

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/alert-level` | `missions:view` | Niveau d'alerte national courant (1 à 4). |
| `PATCH` | `/api/alert-level` | `orsec:update` | Changer le niveau d'alerte national — décision de commandement. |
| `GET` | `/api/catalog` | `dashboard:view` | Catalogue des modules opérationnels (inventaire, triage, ORSEC, …) |
| `GET` | `/api/comms` | `comms:view` | Centre de communication : canaux, messages, présence |
| `POST` | `/api/comms/categories` | `comms_admin:create` | Créer un groupe de canaux — ADMINISTRATION (audité) |
| `POST` | `/api/comms/channels` | `comms_admin:create` | Créer un canal texte dans un groupe — ADMINISTRATION (audité). |
| `DELETE` | `/api/comms/channels/{id}` | `comms_admin:delete` | Supprimer définitivement un canal — SUPERADMIN uniquement. |
| `PATCH` | `/api/comms/channels/{id}` | `comms_admin:update` | Renommer un canal / changer son sujet. |
| `POST` | `/api/comms/channels/{id}/members` | `comms:update` | Ajouter des membres à un canal. |
| `DELETE` | `/api/comms/channels/{id}/members/{matricule}` | `comms:update` | Retirer un membre d'un canal. |
| `POST` | `/api/comms/channels/{id}/receipts` | `comms:view` | Accuser réception ou lecture des messages d'une conversation directe, jusqu'à `upToId`. |
| `POST` | `/api/comms/channels/{id}/typing` | `comms:view` | Signaler qu'on écrit dans une conversation directe (transitoire, non journalisé). |
| `POST` | `/api/comms/direct/{matricule}` | `comms:update` | Ouvrir la conversation directe avec un compte (idempotent) |
| `GET` | `/api/comms/directory` | `comms:view` | Annuaire des comptes joignables — pour composer un canal |
| `POST` | `/api/comms/messages` | `comms:view` | Envoyer un message dans un canal (audité) |
| `GET` | `/api/comms/notices` | `comms:view` | Alertes adressées au compte connecté (incident déclaré dans sa région…) |
| `GET` | `/api/comms/responsables` | `comms:view` | Qui tient quoi — titulaire de chaque entité affectée et de chaque poste déployé |
| `GET` | `/api/dashboard/risk` | `dashboard:view` | Prédictions de risques (moteur déterministe, calculé côté serveur) |
| `GET` | `/api/dashboard/stats` | `dashboard:view` | Statistiques de commandement : évolution 30 j, gravité, bilan humain, saturation hospitalière, posture des unités |
| `GET` | `/api/deployable-posts` | `incidents:update` | Comptes déployables, avec leur affectation courante. |
| `GET` | `/api/dispatch/movements` | `dispatch:view` | Mouvements de transport en cours |
| `GET` | `/api/dispatch/queue` | `dispatch:view` | File de dispatching (besoins entrants) |
| `GET` | `/api/equipment-parks/{id}/items` | `equipment:view` | Parc d'équipement d'une unité |
| `POST` | `/api/equipment-parks/{id}/items` | `equipment:create` | Ajouter un article — dans SON parc uniquement |
| `DELETE` | `/api/equipment-parks/{id}/items/{eid}` | `equipment:archive` | Sortir un article du parc — dans SON parc uniquement |
| `PATCH` | `/api/equipment-parks/{id}/items/{eid}` | `equipment:update` | Modifier un article — dans SON parc uniquement |
| `GET` | `/api/feed` | `dashboard:view` | Fil des événements |
| `GET` | `/api/field-hospitals` | `hospinet:view` | Hôpitaux de campagne visibles. |
| `GET` | `/api/floods/gauges` | `seismic:view` | Jauges du Maroc et leur dernier statut de crue (Flood Hub, proxy souverain, cache 15 min) |
| `GET` | `/api/floods/gauges/{id}/forecast` | `seismic:view` | Dernière prévision émise pour une jauge, avec ses seuils d'alerte |
| `GET` | `/api/floods/polygons/{id}` | `seismic:view` | Polygone d'inondation de Flood Hub (KML converti en GeoJSON) |
| `GET` | `/api/floods/status` | `seismic:view` | État du flux des crues (clé configurée, dernière relecture, dégradation, attribution) |
| `GET` | `/api/hospitals` | `hospinet:view` | Liste des hôpitaux |
| `POST` | `/api/hospitals` | `hospinet:create` | Créer un hôpital (audité) |
| `PATCH` | `/api/hospitals/{id}` | `hospinet:update` | Mettre à jour un établissement — un responsable ne peut agir que sur le sien |
| `POST` | `/api/hospitals/{id}/deceased` | `hospinet:update` | Décès en établissement : annoncer le transfert du corps vers un site mortuaire — depuis SON établissement uniquement |
| `GET` | `/api/hospitals/{id}/wards` | `hospinet:view` | Services de soins d'un établissement |
| `POST` | `/api/hospitals/{id}/wards` | `hospinet:create` | Ouvrir un service de soins — dans SON établissement uniquement |
| `DELETE` | `/api/hospitals/{id}/wards/{wid}` | `hospinet:archive` | Fermer un service de soins — dans SON établissement uniquement |
| `PATCH` | `/api/hospitals/{id}/wards/{wid}` | `hospinet:update` | Modifier un service de soins — dans SON établissement uniquement |
| `GET` | `/api/incident-types` | `incidents:view` | Catalogue paramétrable des types d'incident (libellés FR/AR/EN + icônes) |
| `POST` | `/api/incident-types` | `settings:update` | Enregistrer un nouveau type d'incident (Super Admin, audité) |
| `GET` | `/api/incidents` | `incidents:view` | Liste des incidents VISIBLES par le compte. |
| `POST` | `/api/incidents` | `incidents:create` | Déclarer un incident (audité) — type validé contre le catalogue |
| `DELETE` | `/api/incidents/{id}` | `incidents:delete` | Supprimer définitivement un incident — SUPERADMIN uniquement. |
| `PATCH` | `/api/incidents/{id}` | `incidents:update` | Modifier ou archiver un incident (audité) |
| `GET` | `/api/incidents/{id}/deployments` | `incidents:view` | Postes déployés sur cette opération. |
| `POST` | `/api/incidents/{id}/deployments` | `incidents:update` | Déployer un poste sur l'opération. |
| `DELETE` | `/api/incidents/{id}/deployments/{matricule}` | `incidents:update` | Retirer un poste de l'opération. |
| `POST` | `/api/incidents/{id}/posts` | `map_edit:create` | Poser un poste sur la carte d'une opération — Super Administrateur (audité) |
| `DELETE` | `/api/incidents/{id}/posts/{postId}` | `map_edit:delete` | Retirer un poste de la carte — Super Administrateur (audité) |
| `PATCH` | `/api/incidents/{id}/posts/{postId}` | `map_edit:update` | Déplacer ou renommer un poste — Super Administrateur (audité) |
| `POST` | `/api/incidents/{id}/sub-incidents` | `subincidents:create` | Rattacher un sous-incident (aléa secondaire) à un incident (audité) |
| `DELETE` | `/api/incidents/{id}/sub-incidents/{subId}` | `subincidents:archive` | Détacher un sous-incident (audité) |
| `GET` | `/api/morgues` | `morgue:view` | Sites mortuaires |
| `POST` | `/api/morgues` | `morgue:create` | Créer un site mortuaire fixe — de ville ou régional, rattaché à un établissement |
| `PATCH` | `/api/morgues/{id}` | `morgue:update` | Mettre à jour un site mortuaire — le sien uniquement |
| `POST` | `/api/morgues/{id}/recall` | `morgue:update` | Replier une morgue mobile — vide de tout corps |
| `GET` | `/api/morgues/{id}/records` | `morgue:view` | Registre d'identification d'un site mortuaire |
| `POST` | `/api/morgues/{id}/records` | `morgue:create` | Admettre un corps sous référence provisoire — dans SON site uniquement |
| `PATCH` | `/api/morgues/{id}/records/{rid}` | `morgue:update` | Faire évoluer un dossier d'identification — dans SON site uniquement |
| `POST` | `/api/morgues/{id}/records/{rid}/receive` | `morgue:update` | Confirmer la réception d'un corps transféré — dans SON site uniquement |
| `POST` | `/api/morgues/{id}/records/{rid}/transfer` | `morgue:update` | Transférer un corps vers un autre site mortuaire — depuis SON site uniquement |
| `POST` | `/api/morgues/mobile` | `morgue:create` | Déployer une morgue mobile (conteneur réfrigéré) sur le terrain |
| `GET` | `/api/morgues/registry` | `morgue:view` | Registre mortuaire de tous les sites — par incident au besoin |
| `GET` | `/api/posts` | `map:view` | Postes posés sur la carte — ceux des opérations visibles par le compte |
| `GET` | `/api/reference` | authentifié (soi-même) | Données de référence : provinces, routes d'animation carte |
| `GET` | `/api/seismic/alert-config` | `seismic:view` | Configuration des alertes sismiques (seuils national/mondial, autorités notifiées) |
| `PATCH` | `/api/seismic/alert-config` | `settings:update` | Mettre à jour la configuration des alertes sismiques (audité) |
| `GET` | `/api/seismic/events` | `seismic:view` | Séismes récents (CSEM/EMSC, proxy souverain) — minmag & region (morocco\|world) |
| `GET` | `/api/seismic/notifications` | `seismic:view` | Historique des notifications SMS/e-mail envoyées aux autorités |
| `GET` | `/api/shelters` | `shelters:view` | Liste des abris d'hébergement |
| `POST` | `/api/shelters` | `shelters:create` | Ouvrir un abri (audité). |
| `PATCH` | `/api/shelters/{id}` | `shelters:update` | Mettre à jour un abri — un responsable ne peut agir que sur le sien |
| `GET` | `/api/sitreps` | `missions:view` | Comptes rendus de situation, du plus récent au plus ancien. |
| `POST` | `/api/sitreps` | `missions:create` | Publier un compte rendu — IMMUABLE et numéroté une fois publié. |
| `GET` | `/api/sitreps/missing` | `missions:view` | Entités EN RETARD de compte rendu. |
| `GET` | `/api/sub-incident-types` | `subincidents:view` | Catalogue des sous-types + mapping par type d'incident principal |
| `GET` | `/api/units` | `teams:view` | Liste des unités visibles. |
| `POST` | `/api/units` | `teams:create` | Créer une unité (audité) |
| `PATCH` | `/api/units/{id}` | `units:update` | Mettre à jour une unité — un responsable ne peut agir que sur la sienne |
| `GET` | `/api/weather/cities` | `seismic:view` | Villes disponibles pour la météo |
| `GET` | `/api/weather/forecast` | `seismic:view` | Prévisions météo (Open-Meteo, proxy souverain) pour lat/lon |
| `GET` | `/api/weather/grid` | `seismic:view` | Grille de conditions actuelles (carte météo, proxy souverain) |
| `GET` | `/api/weather/grid-world` | `seismic:view` | Grille météo mondiale grossière (pas 10°, couverture planétaire de la carte) |

## Tableau de bord d'incident — `/api/incidents/{id}/dashboard`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/incidents/{id}/dashboard` | `dash_incident:view` | Tableau de bord d'UNE opération. |

## Missions — la boucle fermée (ADR 0007)

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/missions` | `missions:view` | Missions filtrées (incident, nature, état, boucles ouvertes). |
| `POST` | `/api/missions` | `missions:create` | Émettre une mission (ordre, demande de moyen, transfert). |
| `GET` | `/api/missions/{id}` | `missions:view` | Une mission par son identifiant. |
| `POST` | `/api/missions/{id}/accept` | `missions:update` | Accuser réception — réservé au destinataire. |
| `POST` | `/api/missions/{id}/cancel` | `missions:update` | Annuler avec motif — réservé à l'émetteur. |
| `POST` | `/api/missions/{id}/complete` | `missions:update` | Clore la boucle — réservé au destinataire. |
| `POST` | `/api/missions/{id}/decline` | `missions:update` | Refuser avec motif — réservé au destinataire. |
| `POST` | `/api/missions/{id}/milestone` | `missions:update` | Franchir un jalon (en route, sur zone, relève) — réservé au destinataire. |
| `GET` | `/api/missions/inbox` | `missions:view` | Boucles ouvertes attendant un geste de moi. |
| `GET` | `/api/missions/outbox` | `missions:view` | Boucles ouvertes que j'ai émises — le suivi de mes demandes. |

## Bons de travail — `/api/orders`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/orders` | `workorders:view` | Liste des bons de travail (filtrable) |
| `POST` | `/api/orders` | `workorders:create` | Ouvrir un bon de travail (état « demandé ») |
| `GET` | `/api/orders/{id}` | `workorders:view` | Détail d'un bon de travail |
| `PATCH` | `/api/orders/{id}` | `workorders:update` | Corriger les données descriptives d'un bon |
| `PATCH` | `/api/orders/{id}/assignee` | `workorders:update` | Désigner l'exécutant d'un bon |
| `PATCH` | `/api/orders/{id}/cancel` | `workorders:update` | Annuler un bon de travail (motif obligatoire) |
| `PATCH` | `/api/orders/{id}/status` | `workorders:update` | Faire avancer un bon dans son cycle de vie |
| `GET` | `/api/orders/summary` | `workorders:view` | Indicateurs des bons de travail (ouverts, en cours, urgents) |

## Capacité NRBC — substances et panache (ADR 0005)

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/nrbc/library` | `nrbc:view` | Bibliothèque de substances dangereuses — recherche et provenance (lot N-3). |
| `GET` | `/api/nrbc/plume/{incidentId}` | `nrbc:view` | Panache chimique estimé d'un incident NRBC (GeoJSON). |
| `GET` | `/api/nrbc/substances` | `nrbc:view` | Catalogue des substances chimiques (table 1 de l'ERG 2024). |
| `GET` | `/api/nrbc/substances/{id}` | `nrbc:view` | Fiche opérationnelle d'une substance. |

## Suivi aérien — ADS-B (ADR 0004)

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/aviation/aircraft` | `aviation:view` | Aéronefs inscrits à la surveillance. |
| `POST` | `/api/aviation/aircraft` | `aviation:create` | Inscrire un aéronef à la surveillance. |
| `DELETE` | `/api/aviation/aircraft/{id}` | `aviation:delete` | Supprimer définitivement (superadmin uniquement). |
| `PATCH` | `/api/aviation/aircraft/{id}` | `aviation:update` | Modifier un aéronef inscrit. |
| `POST` | `/api/aviation/aircraft/{id}/archive` | `aviation:archive` | Archiver un aéronef (geste par défaut, réversible). |
| `POST` | `/api/aviation/aircraft/{id}/restore` | `aviation:archive` | Réactiver un aéronef archivé. |
| `GET` | `/api/aviation/states` | `aviation:view` | Positions courantes des seuls aéronefs inscrits. |

## Traceurs GPS — FMC920 (ADR 0008)

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `GET` | `/api/tracking/trackers` | `tracking:view` | Traceurs déclarés, avec leur dernière position connue. |
| `POST` | `/api/tracking/trackers` | `tracking:create` | Déclarer un traceur — sans quoi le boîtier n'est pas admis. |
| `DELETE` | `/api/tracking/trackers/{id}` | `tracking:delete` | Supprimer définitivement un traceur — SUPERADMIN uniquement. |
| `GET` | `/api/tracking/trackers/{id}` | `tracking:view` | Un traceur et sa trace récente. |
| `PATCH` | `/api/tracking/trackers/{id}` | `tracking:update` | Modifier le libellé, le rattachement, l'engagement, ou archiver. |

## Communications — canaux, messages, temps réel, pièces jointes

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `POST` | `/api/comms/attachments` | `comms:create` | Verser une pièce jointe (image, vidéo, document). |
| `GET` | `/api/comms/attachments/{id}` | `comms:view` | Télécharger une pièce jointe. |
| `GET` | `/api/comms/presence` | `comms:view` | Comptes actuellement connectés. |
| `GET` | `/api/comms/stream` | `comms:view` | Flux temps réel des communications (Server-Sent Events). |

## Exemple de bout en bout

```bash
TOK=$(curl -s -X POST http://localhost:3005/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"matricule":"m.zraib","password":"<mot de passe du compte de démonstration>"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:3005/api/orders/summary -H "Authorization: Bearer $TOK"
```

## Chiffres

119 chemins · 148 opérations · 13 groupes.

## Modifier le contrat

1. Modifier le contrôleur (décorateurs `@ApiOperation`, `@RequirePermission`).
2. `npm run contract:sync` — exporte le contrat, met à jour la copie versionnée
   et régénère le client TypeScript consommé par `apps/web` (contrat d'abord :
   jamais de `fetch` écrit à la main). `npm run contract:check` vérifie sans écrire.
3. `npm run docs:api` — régénère ce document.
