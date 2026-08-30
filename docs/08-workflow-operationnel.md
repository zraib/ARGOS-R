# Workflow opérationnel — la boucle fermée

Ce document décrit **comment le travail circule** dans ARGOS entre l'état-major
et les entités de terrain (unités, hôpitaux, abris, morgue) : qui déclenche
quoi, qui doit répondre, et où la trace se dépose.

- La **décision** et ses alternatives : [ADR 0007](adr/0007-missions-boucle-fermee.md).
- La **méthode hexagonale** appliquée au module : [SOLID et hexagonal](02-solid-hexagonal.md).
- Les **endpoints** : [Référence API](03-api.md).

---

## 1. Le principe : aucune action sans réponse

Avant, tous les gestes opérationnels étaient **à sens unique**. Le répartiteur
engageait une unité — l'unité n'avait aucun moyen de l'accuser. Un hôpital
saturé ne pouvait rien demander. Le triage comptait des évacuations qui ne
réservaient rien à l'hôpital. Chaque module fonctionnait ; c'est **entre** les
modules que la catastrophe tombait dans un vide.

Le constat qui structure tout le reste : **engager une unité, demander un moyen
et transférer une victime sont le même geste** du point de vue du commandement
— une demande qui doit être acceptée, suivie de jalons, et tracée.

D'où un objet unique, la **mission**, et une règle unique :

> Chaque geste opérationnel est une boucle :
> **demande → acceptation → jalons → trace.**

## 2. La machine d'états

```
                 ┌──────────► declined  (motif OBLIGATOIRE)
                 │
   issued ───────┼──────────► accepted ──────► in_progress ──────► completed
                 │                │                  │
                 └──────────► cancelled ◄────────────┘  (motif OBLIGATOIRE)
```

| État | Ce qu'il veut dire | Qui peut en sortir |
| --- | --- | --- |
| `issued` | La demande est partie, personne ne l'a encore prise | le **destinataire** (accepter/refuser), l'**émetteur** (annuler) |
| `accepted` | Le destinataire s'en charge | le **destinataire** |
| `in_progress` | Au moins un jalon franchi | le **destinataire** |
| `declined` | Refusée, avec motif | terminal |
| `completed` | Boucle close | terminal |
| `cancelled` | Retirée par l'émetteur, avec motif | terminal |

**Jalons** : `en_route`, `on_site`, `handover`. Le premier jalon fait passer la
mission en exécution — l'état découle du terrain, il n'est pas ressaisi à part.

### Pourquoi le motif est obligatoire

Un refus sans motif n'est pas exploitable : il ne dit pas s'il faut réengager
ailleurs, escalader ou attendre. Le domaine le refuse (400).

## 3. Les trois natures de boucle

Une seule machine d'états, trois contextes portés par `kind` et `payload` :

| `kind` | Sens | Émetteur type | Destinataire type |
| --- | --- | --- | --- |
| `order` | Ordre d'engagement | conduite (OPCOM, TACOM, cellule bleue) | responsable d'unité |
| `resource_request` | Demande de moyen *(lot P2-a)* | responsable d'entité | répartiteur |
| `transfer` | Transfert de personne *(lot P2-b)* | triage, hôpital | hôpital, morgue, abri |

Les modéliser séparément aurait triplé la machine d'états, les tests et les
écrans — et surtout dispersé la règle « aucune action sans réponse » en trois
endroits où elle aurait divergé.

**Données de santé.** Un `transfer` ne transporte que la catégorie de triage
(`red`/`yellow`/`green`/`black`) et les champs déjà présents au registre DVI.
**Aucune donnée nominative** ne traverse une boucle.

## 4. Les deux gardes — et pourquoi il en faut deux

C'est le point le plus important de ce workflow, et le plus facile à casser
par inadvertance.

| Garde | Question posée | Où elle vit | Refus |
| --- | --- | --- | --- |
| **RBAC** | Ce *rôle* peut-il toucher aux missions ? | `@RequirePermission` (contrôleur) | 403 |
| **Règle d'acteur** | Cet *acteur* peut-il faire *ce* geste sur *cette* mission ? | l'agrégat (domaine) | 403 |

La règle d'acteur dit :

- **seul le destinataire** accepte, refuse et jalonne ;
- **seul l'émetteur** annule.

Sans elle, n'importe quel titulaire de `missions:update` — un OPCOM
parfaitement habilité, par exemple — pourrait accuser réception à la place de
l'unité destinataire. **L'état affiché à l'état-major deviendrait une
fiction** : la poignée de main ne prouverait plus rien.

### Comment le destinataire est reconnu

Depuis la **session**, jamais depuis le corps de la requête :

```
acteur = { userId: session.username,
           role:   session.role,
           entity: portée ABAC du rôle (ex. { hospital: "H1" } → "H1") }
```

Une mission visant `{ role: "resp_hospital", entity: "H1" }` n'apparaît donc
que dans l'inbox du responsable **réellement affecté à H1**. Un client ne peut
pas revendiquer être destinataire d'une boucle.

> **À savoir en développement.** Un jeton de dev pour un compte absent du
> registre IAM n'a **aucune portée** : ses inbox seront vides pour toute
> mission ciblée par entité. C'est le comportement correct, pas un bug —
> vérifier avec un compte réellement affecté.

## 5. Ce que la boucle rend visible

Chaque transition produit trois effets, tous **secondaires** (la mission est
déjà persistée quand ils se produisent) :

1. **Le fil du poste de commandement** — une ligne horodatée, colorée selon la
   gravité de la transition, motif de refus compris ;
2. **Le canal de l'incident** — un message système signé `ARGOS` ;
3. **La posture de l'unité** — dérivée des jalons.

```
M-0004 · ORDRE ÉMIS — Renfort feu de forêt
M-0004 · ACCUSÉ RÉCEPTION — Renfort feu de forêt
M-0004 · JALON · en_route — Renfort feu de forêt
```

### La posture ne se saisit plus deux fois

| Transition | Posture de l'unité |
| --- | --- |
| `accepted` | `standby` |
| `milestone` (tout jalon) | `deployed` |
| `completed` · `declined` · `cancelled` | `ready` |

Un responsable déclarait « en route » puis passait son unité en « déployée » à
la main : deux saisies pour un seul fait. La posture suit désormais la boucle.
Elle **reste modifiable manuellement** — le terrain prime sur le modèle — mais
un jalon la réaligne.

## 6. Le canal d'incident

Tout incident **naît avec son canal**, créé à la déclaration dans le groupe
OPÉRATIONS et nommé par sa référence (`inc-2614`). Avant, le seul canal
d'opération avait été créé à la main : rien ne donnait un lieu de conversation
aux intervenants d'un incident.

La création est **idempotente** : redemander le canal d'un incident déjà pourvu
rend l'existant plutôt que d'en empiler un second.

**Gouvernance des canaux** (voir la matrice complète dans le plan d'exécution) :

| Geste | Qui |
| --- | --- |
| Création du canal d'incident | **automatique**, à la déclaration |
| Renommer, sujet, membres | administration ; conduite sur *ses* incidents |
| Archiver | avec l'incident, ou administration |
| **Supprimer** | **superadmin uniquement** — comme toute suppression dans ARGOS |

## 7. Les endpoints

| Méthode | Route | Permission | Qui, en pratique |
| --- | --- | --- | --- |
| `GET` | `/api/missions` | `missions:view` | tous les rôles dotés |
| `GET` | `/api/missions/inbox` | `missions:view` | ce qui attend **mon** geste |
| `GET` | `/api/missions/outbox` | `missions:view` | ce que **j'ai** demandé |
| `GET` | `/api/missions/:id` | `missions:view` | |
| `POST` | `/api/missions` | `missions:create` | conduite uniquement |
| `POST` | `/api/missions/:id/accept` | `missions:update` | **destinataire** |
| `POST` | `/api/missions/:id/decline` | `missions:update` | **destinataire** · motif |
| `POST` | `/api/missions/:id/milestone` | `missions:update` | **destinataire** |
| `POST` | `/api/missions/:id/complete` | `missions:update` | **destinataire** |
| `POST` | `/api/missions/:id/cancel` | `missions:update` | **émetteur** · motif |

Aucun rôle ne détient `missions:delete` — `expand()` n'émet jamais `delete`,
et aucune route ne l'expose.

## 8. Un cycle complet, au curl

```bash
# La conduite émet un ordre vers l'unité U3
MID=$(curl -s -X POST localhost:3005/api/missions \
  -H "Authorization: Bearer $TACOM" -H 'Content-Type: application/json' \
  -d '{"incidentId":"INC-2614","label":"3e BG — renfort",
       "to":{"role":"resp_unit","entity":"U3"},
       "payload":{"kind":"order","unitId":"U3","etaMin":34}}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")

# L'émetteur tente d'accepter à la place du destinataire  → 403
curl -X POST localhost:3005/api/missions/$MID/accept -H "Authorization: Bearer $TACOM"

# Le destinataire le voit, l'accepte, jalonne, clôt
curl localhost:3005/api/missions/inbox            -H "Authorization: Bearer $U3"
curl -X POST localhost:3005/api/missions/$MID/accept    -H "Authorization: Bearer $U3"
curl -X POST localhost:3005/api/missions/$MID/milestone -H "Authorization: Bearer $U3" \
     -H 'Content-Type: application/json' -d '{"key":"en_route"}'
curl -X POST localhost:3005/api/missions/$MID/complete  -H "Authorization: Bearer $U3"
```

## 9. Ce qui reste à construire

Le workflow est posé ; ces maillons le compléteront (voir le plan d'exécution) :

| Lot | Ce qu'il ferme |
| --- | --- |
| **P1-b** | Bannière « Ordres reçus » côté responsable, états côté répartiteur, pastille de barre haute |
| **P1-c** | Couche « boucles » sur la carte : liens unité → incident colorés par état |
| **P2-a** | « Demander un moyen » : la file du répartiteur alimentée depuis le terrain |
| **P2-b** | EVASAN avec réservation de lit ; décès pré-remplissant le registre DVI |
| **P3** | SITREP cadencés par niveau d'alerte, le compte rendu manquant devenant un signal |

**Limite connue.** Le dépôt en mémoire ne connaît pas les transactions : la
cascade de suppression d'incident (annulation des boucles puis purge) n'est pas
atomique tant que PostgreSQL n'est pas branché.
