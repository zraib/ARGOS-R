# Référence API

Monolithe modulaire NestJS. Base : `http://localhost:3005/api` ·
Documentation interactive (Swagger) : `http://localhost:3005/api/docs`.

Toutes les routes exigent un jeton porteur (`Authorization: Bearer <jwt>`) sauf
celles marquées **publique**. Une route sans la permission requise renvoie
**403** ; sans jeton, **401**.

---

## Authentification — `/api/auth`

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | **publique** | connexion par nom d'utilisateur + mot de passe |
| `POST` | `/auth/dev-token` | **publique** | jeton HS256 de développement `{ username, role }` (`AUTH_MODE=dev`) |
| `GET` | `/auth/profile` | authentifié | profil de la session |
| `PATCH` | `/auth/profile` | authentifié | mise à jour du profil |
| `POST` | `/auth/select-role` | authentifié | choisir le rôle actif (comptes multi-rôles) |
| `POST` | `/auth/change-password` | authentifié | changement de mot de passe (obligatoire au 1er login) |

En production (`AUTH_MODE=keycloak`), les jetons sont émis par Keycloak et
validés en RS256 via le JWKS distant (`issuer` et `audience` contrôlés).

## Identité et habilitations — `/api/iam`

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/iam/me` | authentifié — renvoie rôle + **permissions résolues côté serveur** |
| `GET` | `/iam/roles` | `iam:roles:read` |
| `GET` | `/iam/permissions` | `iam:permissions:read` |
| `GET` | `/iam/users` | `iam:users:read` |
| `POST` | `/iam/users` | `iam:users:create` |
| `PATCH` | `/iam/users/:id` | `iam:users:update` |
| `DELETE` | `/iam/users/:id` | `iam:users:delete` |
| `POST` | `/iam/users/:id/active` | `iam:users:activate` |
| `POST` | `/iam/users/:id/reset-code` | `iam:users:update` |
| `GET` | `/iam/users/:id/temp-code` | `iam:users:read` |
| `GET` | `/iam/role-features` | `iam:roles:read` |
| `PATCH` | `/iam/role-features/:role` | `iam:roles:features` |

## Feature flags — `/api/flags`

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/flags` | `admin:feature_flags:read` |
| `PATCH` | `/flags/:key` | `admin:feature_flags:toggle` |

## Audit — `/api/audit`

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/audit` | `audit:log:read` |
| `GET` | `/audit/verify` | `audit:log:verify` — vérifie l'intégrité de la chaîne |

## Domaine opérationnel

### Incidents

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/incidents` | `incidents:read` |
| `POST` | `/incidents` | `incidents:create` |
| `PATCH` | `/incidents/:id` | `incidents:create` |
| `POST` | `/incidents/:id/sub-incidents` | `incidents:create` |
| `DELETE` | `/incidents/:id/sub-incidents/:subId` | `incidents:create` |
| `GET` | `/incident-types` | `incidents:read` |
| `POST` | `/incident-types` | `admin:settings:update` |
| `GET` | `/sub-incident-types` | `incidents:read` |

### Organisation

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/units` | `org:units:read` |
| `POST` | `/units` | `org:units:manage` |
| `GET` | `/hospitals` | `org:hospitals:read` |
| `POST` | `/hospitals` | `org:hospitals:manage` |
| `GET` | `/field-hospitals` | `org:hospitals:read` |

### Pilotage

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/dashboard/stats` | `incidents:read` |
| `GET` | `/feed` | `incidents:read` |
| `GET` | `/catalog` | `incidents:read` — catalogue des modules (inventaire, triage, ORSEC, ICS, plans…) |
| `GET` | `/reference` | authentifié — provinces, villes, routes |
| `GET` | `/dispatch/queue` | `dispatch:assign` |
| `GET` | `/dispatch/movements` | `dispatch:assign` |

### Communications

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/comms` | authentifié |
| `POST` | `/comms/messages` | authentifié |
| `POST` | `/comms/categories` | authentifié |
| `POST` | `/comms/channels` | authentifié |

### Sismologie et météo

Proxy souverain avec cache et dégradation gracieuse ([ADR 0002](adr/0002-flux-externes-sismologie-meteo.md)).

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/seismic/events` | `incidents:read` |
| `GET` | `/seismic/alert-config` | `incidents:read` |
| `PATCH` | `/seismic/alert-config` | `admin:settings:update` |
| `GET` | `/seismic/notifications` | `incidents:read` |
| `GET` | `/weather/cities` | `incidents:read` |
| `GET` | `/weather/forecast?lat=&lon=` | `incidents:read` |
| `GET` | `/weather/grid` | `incidents:read` — grille dense Maroc |
| `GET` | `/weather/grid-world` | `incidents:read` — grille mondiale 10° |

## Bons de travail — `/api/orders`

Module hexagonal ([README](../apps/api/src/modules/orders/README.md) ·
[ADR 0003](adr/0003-module-orders-architecture-hexagonale.md)).

| Méthode | Route | Permission |
| --- | --- | --- |
| `GET` | `/orders?status=&priority=&unit=&assignee=&incidentId=` | `workorders:read` |
| `GET` | `/orders/summary` | `workorders:read` |
| `GET` | `/orders/:id` | `workorders:read` |
| `POST` | `/orders` | `workorders:create` |
| `PATCH` | `/orders/:id` | `workorders:update` |
| `PATCH` | `/orders/:id/assignee` | `workorders:assign` |
| `PATCH` | `/orders/:id/status` | `workorders:update` |
| `PATCH` | `/orders/:id/cancel` | `workorders:update` |

**Cycle de vie**

```
requested ──▶ approved ──▶ assigned ──▶ inprogress ──▶ done ──▶ verified
    │            │            │             │            │
    └────────────┴────────────┴─────────────┘            │
                  cancelled                              │
                                      inprogress ◀───────┘  (contrôle refusé)
```

`verified` et `cancelled` sont terminaux. Un exécutant désigné est obligatoire à
partir de `assigned`. L'annulation exige un motif.

**Codes d'erreur** — les erreurs de domaine sont traduites en un point unique du
contrôleur : validation → `400`, introuvable → `404`, transition interdite →
`409`.

## Santé

| Méthode | Route | Accès |
| --- | --- | --- |
| `GET` | `/health` | **publique** |

---

## Exemple de bout en bout

```bash
TOK=$(curl -s -X POST http://localhost:3005/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"matricule":"m.zraib","password":"ARGOS-2026"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s http://localhost:3005/api/orders/summary -H "Authorization: Bearer $TOK"
```

## Modifier le contrat

Toute évolution d'un endpoint doit être répercutée dans le client généré, sinon
le typecheck du frontend échoue. Procédure dans
[06-developpement.md](06-developpement.md#4-régénérer-le-client-api).
