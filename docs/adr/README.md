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
