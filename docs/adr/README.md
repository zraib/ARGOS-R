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
| [0008](0008-ecouteur-tcp-traceurs-fmc920.md) | Traceurs FMC920 : ARGOS est le serveur du boîtier (Codec 8 sur TCP) | **accepté** (lot N-2) | `apps/api/src/modules/tracking`, permission `tracking:*`, second port en écoute |
| [0010](0010-crues-flood-hub-et-simulateur.md) | Crues : prévisions GloFAS (Open-Meteo, sans clé) ou Google Flood Hub (sur clé) par le courtier, simulateur d'inondation hydraulique local (onde inertielle, débit et volume, animé) | **accepté** | `flood.service.ts`, `flood.openmeteo.ts`, routes `floods/*`, `lib/flood/`, panneau « Crues » de la carte, `FLOOD_API_KEY` |
| [0011](0011-feux-de-foret-simulateur.md) | Feux de forêt : simulateur de propagation local (temps minimal de parcours, vent, pente, combustible), socle commun des propagations | **accepté** | `lib/fire/`, `lib/sim/spread.ts`, `layers/{spread,fire}.ts`, panneau « Feux de forêt » de la carte |
| [0012](0012-service-morgue-chaine-de-garde.md) | Service morgue : morgues mobiles, chaîne de garde, traçabilité hôpital → site (doctrine DVI / OMS-CICR) | **accepté** | `morgue.rules.ts`, routes `morgues/*`, `hospitals/:id/deceased`, page `/morgue`, `components/morgue/`, couche `layers/morgues.ts` |
| [0013](0013-exposition-temporaire-tunnel.md) | Exposition temporaire de la station sur Internet par un tunnel tiers (tunnelto.dev) — démonstrations seulement ; client épinglé ; borne des échecs de connexion | **accepté** (démonstrations) | `deploy/scripts/tunnel.ps1`, `deploy/scripts/package.sh`, `auth.controller.ts` (`RateWindow` sur `login`) |

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
