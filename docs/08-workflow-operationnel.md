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

### Membres d'un canal

| `members` | Sens |
| --- | --- |
| **absent** | canal **ouvert** — c'est le cas des canaux thématiques historiques (état-major, logistique…), qui ne changent donc pas de comportement |
| **défini** | canal **restreint** — seuls les membres le voient et y écrivent |

Un canal ouvert **devient restreint dès son premier membre** : le geste qui le
referme doit être explicite. Les canaux d'incident, eux, naissent restreints et
se peuplent au fil des engagements.

### Qui fait quoi

| Geste | Système | Conduite | Admin | Superadmin |
| --- | :---: | :---: | :---: | :---: |
| Créer le canal d'un incident | ✅ à la déclaration | — | ✅ | ✅ |
| Renommer, sujet | — | — | ✅ | ✅ |
| Ajouter / retirer des membres | ✅ convocation | ✅ sur *ses* incidents | ✅ | ✅ |
| Archiver | ✅ avec l'incident | — | ✅ | ✅ |
| **Supprimer** | — | ❌ | **❌ jamais** | ✅ **seul** |

**Garde-fou.** La suppression d'un canal est refusée tant que l'incident
porteur est **actif** : effacer la conversation d'une opération en cours
détruirait la trace au moment où elle sert le plus. Il faut archiver l'incident
d'abord — et le message d'erreur le dit.

## 7. Supprimer un incident — le superadmin, et personne d'autre

La règle du dépôt est **monolithique et sans exception** : personne ne
supprime, sauf le Super Administrateur. `expand()` n'émet jamais `delete` ;
seul le joker `*` du superadmin porte ces permissions. L'archivage reste le
geste par défaut de tous les autres rôles — la suppression est l'exception
outillée, pas le raccourci.

`DELETE /api/incidents/:id` est gardé par `incidents:delete`, que la matrice
n'accorde à personne. **L'administrateur reçoit 403**, par construction et par
test.

### La cascade

| Emporté | Comment |
| --- | --- |
| Les boucles de l'incident | **annulées avec motif** (« Incident supprimé »), *puis* purgées |
| Le canal et ses messages | supprimés avec l'incident |
| Une ligne de fil | `INC-… — SUPPRIMÉ par …`, couleur danger |

**Annuler avant de purger** n'est pas un détail : l'annulation trace le motif
dans le fil et dans le canal ; une purge sèche ne laisserait rien. On veut
pouvoir savoir *pourquoi* des boucles ont disparu.

> **Limite assumée.** En dépôt mémoire, la suppression n'est **pas atomique** :
> si une cascade échoue, l'incident est déjà retiré. Le passage à PostgreSQL
> apportera la transaction.

### Pourquoi la cascade s'inscrit au lieu d'être appelée

Supprimer un incident doit toucher aux missions — mais le module `missions`
importe déjà `domain`. Un appel direct de `domain` vers `missions` créerait un
**cycle de modules**, et `forwardRef` ne ferait que le masquer.

L'inversion est donc franche : le domaine expose un point d'accroche
(`registerIncidentCascade`), et c'est le module **dépendant** qui vient s'y
inscrire au démarrage (`IncidentCascadeRegistrar`, `OnModuleInit`). Le domaine
continue d'ignorer ce qu'est une mission ; aucun cycle n'est créé.

## 8. La chaîne des personnes

Triage, Hospinet, morgue et abris étaient **quatre tronçons sans référence
partagée** : l'évacuation ne réservait rien à l'hôpital, le décès hospitalier
ne créait pas d'admission en morgue. Un `transfer` relie ces maillons — et
comme tout `transfer` est une boucle, chaque maillon **s'accepte**.

### EVASAN — la réservation de lit

| Transition | Effet sur l'hôpital destinataire |
| --- | --- |
| `accepted` | **+1 réservé** — l'occupation ne bouge pas |
| `completed` (arrivée) | −1 réservé, **+1 occupé** |
| `declined` / `cancelled` *après acceptation* | −1 réservé, le lit est rendu |
| `declined` sur une boucle jamais acceptée | rien — il n'y avait rien à rendre |

**Libres = armés − occupés − réservés.** Sans ce compteur, deux transferts
pouvaient viser le dernier lit libre : chacun le voyait disponible, puisque
l'occupation ne bouge qu'à l'arrivée. Hospinet affiche la réserve à côté du
nombre de libres.

### Décès — le registre DVI pré-rempli

Accepter un transfert de corps **crée la fiche** dans le registre de la morgue :
référence dérivée de la mission (`AH-M-0012`), **incident d'origine**, lieu de
provenance, statut `unidentified`. Le responsable morgue ressaisissait jusque-là
tout depuis une fiche vierge, sans lien avec l'incident.

### Données de santé — le périmètre, arrêté

Une boucle de transfert transporte **la catégorie de triage**
(`red`/`yellow`/`green`/`black`) et les champs déjà présents au registre DVI
(sexe, tranche d'âge estimée). **Aucune donnée nominative.** Ce n'est pas une
convention : le type du domaine ne permet pas d'en transporter.

## 9. Le battement — niveau d'alerte et comptes rendus

### Le niveau d'alerte est un état du serveur

Il vivait dans une **constante du frontend** : chaque poste affichait la même
valeur figée, et rien ne permettait de la changer sans redéployer. C'est
pourtant une décision de commandement — et c'est elle qui **cadence** les
comptes rendus.

`PATCH /api/alert-level` (permission `orsec:update`, donc la conduite) le
change pour tous les postes ; le changement s'inscrit dans le fil et dans le
journal d'audit. `GET /api/alert-level` est lisible par tout poste : le niveau
s'affiche dans la barre haute quel que soit le rôle.

### La cadence attendue

| Niveau | Posture | Compte rendu attendu |
| :---: | --- | --- |
| 1 | routine | toutes les **24 h** |
| 2 | vigilance | toutes les **8 h** |
| 3 | vigilance renforcée | toutes les **4 h** |
| 4 | urgence nationale | toutes les **heures** |

Passer de N3 à N4 resserre la cadence **sans redéploiement** — et fait
mécaniquement apparaître des entités en retard.

### Le compte rendu

Trois champs saisis — état général (*nominal* / *tendu* / *débordé*), besoins,
prochain point — et rien d'autre : les chiffres de l'entité sont déjà connus de
la plateforme, les redemander serait faire ressaisir ce qu'elle sait. **Un
compte rendu long n'est pas rendu.**

Publié = **numéroté et immuable** (`SIT-0001`, `SIT-0002`…). Un compte rendu
qu'on peut réécrire après coup ne prouve rien.

### Le silence devient un signal

`GET /api/sitreps/missing` liste les entités **en retard**, et surtout celles
qui **n'ont jamais rendu compte** (`overdueMin: -1`). C'était le manque de
départ : l'état-major lisait des jauges, jamais des comptes rendus — impossible
de savoir si le silence d'un abri voulait dire « rien à signaler » ou
« débordé ».

Le responsable voit son propre retard sur le même écran où il rend compte : le
signal est le même des deux côtés.

> **Rattachement des permissions.** Le SITREP suit la permission des
> **missions**, pas celle des rapports d'incidents : la ligne `reports` de la
> matrice ne comprend aucun responsable d'entité — or ce sont précisément eux
> qui rendent compte. Le compte rendu est le volet « rendre compte » de la
> boucle, pas un rapport d'incident.

## 10. Le panache en lecture — la fumée dans le temps

Le panache montrait une échéance à la fois, choisie au curseur. Deux lots le
mettent en mouvement, **sans aucune dépendance nouvelle**.

### ▶ Lecture (V1)

La caméra passe en **théâtre** — inclinaison 60°, zoom serré sur le point de
rejet — puis les sept échéances H+0 → H+6 défilent en interpolant la géométrie.

L'interpolation est possible sans ruse : les anneaux produits par le moteur ont
un **nombre de sommets constant** par type de zone (64 pour un cercle, 4 pour un
triangle, 5 pour un carré). L'interpolation se fait sommet à sommet, et le
gabarit **pivote continûment** avec le vent au lieu de sauter d'heure en heure.

Les zones sont appariées par `model` + `level`. Si une échéance perd une zone
— le vent tombe sous le seuil ATP-45 de 10 km/h, et le triangle sous le vent
cède la place à un cercle de vigilance — la géométrie de départ est conservée
plutôt qu'une transition inventée.

`prefers-reduced-motion` supprime l'interpolation : le panache avance alors pas
à pas, ce qui reste lisible sans mouvement continu.

### Nappe 3D (V2)

En vue inclinée, les zones prennent du volume (`fill-extrusion`, natif
MapLibre). La **hauteur porte du sens** : le danger immédiat monte plus haut
que la vigilance, si bien que la silhouette se lit avant la couleur. À plat, la
nappe disparaît — elle n'ajouterait rien et masquerait les remplissages.

### Ce que ce n'est pas

> **La lecture anime des GABARITS DE PLANIFICATION, pas une simulation
> physique de dispersion.** Le bandeau « Estimation — pas une mesure » reste
> affiché pendant toute la lecture, et le rendu évite délibérément le
> réalisme : pas de volutes photoréalistes sur une forme géométrique.
>
> La vraie fumée — des particules advectées dans un champ de concentration —
> attend le moteur Gauss (phase 4 de l'ADR 0005). L'ordonner ainsi est un choix
> de doctrine : animer des particules sur un gabarit donnerait l'illusion d'une
> simulation que la plateforme n'a pas encore.

## 11. Le parcours à l'écran

### Côté conduite — engager

Dans **Répartition** : sélectionner un incident → *Traiter* une demande de la
file → *Engager* une unité → saisir le **motif** → *Confirmer l'engagement*.

L'engagement ne vit plus seulement dans le navigateur : il **ouvre une boucle**
côté serveur (`POST /api/missions`, `kind: "order"`). Avant, il n'existait que
dans le store — l'unité n'était jamais prévenue, et rien n'en restait au
rechargement. La mission est désormais la trace qui fait foi.

L'affichage local reste immédiat : le répartiteur voit son geste pris en compte
sans attendre le réseau. Si l'émission échoue (droits, incident inconnu), un
message le dit — plutôt que de laisser croire qu'un ordre est parti.

### Côté terrain — demander

Dans **Ma responsabilité**, le bouton **« Demander un moyen »** ouvre le sens
*montant* de la file : incident concerné, moyen demandé, urgence, précision.
Le nombre de demandes en cours s'affiche à côté — le demandeur suit son geste,
c'est ce que promet la boucle.

Jusque-là, la file du répartiteur était **strictement descendante** : alimentée
par des données de démonstration, elle ne recevait rien du terrain. Un hôpital
saturé ou un abri à court d'eau n'avait aucun geste pour réclamer quoi que ce
soit — le champ `needs` d'un abri était un texte libre que personne ne
consommait.

Le catalogue de moyens est celui du **moteur de recommandation**
(`lib/reco.ts`) : demander « eau » signifie exactement la même chose des deux
côtés de la file, et la reco sait déjà classer les unités qui portent cette
capacité.

Côté **Répartition**, les demandes du terrain arrivent au **même endroit** que
les besoins existants — un répartiteur n'a pas deux files à surveiller. Les
traiter engage une unité, ce qui ouvre un *ordre* : **les boucles s'enchaînent**,
et le demandeur voit l'état de bout en bout.

### Côté terrain — répondre

Dans **Ma responsabilité**, la bannière **« Ordres reçus »** passe *avant* le
tableau de bord de l'entité : ce qui attend un geste doit se voir avant ce qui
informe. Elle ne s'affiche que s'il y a quelque chose à faire — un panneau vide
en permanence apprend à l'opérateur à ne plus le regarder.

Chaque ordre porte sa référence, son incident, son âge (`depuis 4 min` — un
ordre émis qui vieillit est un signal), ses jalons franchis, et les seuls
gestes légitimes dans son état.

Deux règles d'interface qui découlent du domaine :

- **le motif de refus est bloquant dans l'écran comme dans l'API.** Le bouton
  *Refuser* reste désarmé tant que le motif est vide : l'API le rejetterait
  (400), autant ne pas le proposer ;
- **les jalons sont offerts dans l'ordre.** On ne montre pas *Sur zone* à
  quelqu'un qui n'a pas déclaré *En route* — une action visible qui échoue est
  pire qu'une action absente.

### Le rafraîchissement

Les corbeilles se rechargent toutes les **15 s**, dans un effet **lié à la
session** — délibérément séparé du tick de simulation : les greffer dessus les
aurait éteintes avec lui, alors qu'un ordre reçu doit apparaître même
simulation coupée. Pas de WebSocket, pas de dépendance nouvelle ; EMQX prendra
le relais en production sans changer le contrat de `/missions/inbox`.

### Sur la carte — voir ce qui se joue

La carte cesse d'être une photographie des positions pour devenir le **théâtre**
de ce qui se joue. La couche **« Boucles en cours »** (famille *Forces*, aux
côtés des unités et des convois — une boucle engage une unité) trace un segment
de l'unité vers son incident, pour chaque ordre ouvert.

| Aspect du trait | État |
| --- | --- |
| tireté, ambre | `issued` — l'appel est parti, personne n'a répondu |
| plein, bleu | `accepted` — pris en charge |
| plein, vert | `in_progress` — en route ou sur zone |

**Le plein/tireté n'est pas décoratif** : il distingue l'engagement réel de
l'appel sans réponse *avant* toute lecture de couleur — utile en vision
nocturne, et pour les opérateurs daltoniens. La couleur confirme, la forme
informe.

Seuls les **ordres** sont tracés : une demande de moyen ou un transfert n'ont
pas de trajet d'unité à montrer. Les deux corbeilles sont fusionnées sans
doublon — selon son rôle on est d'un côté ou de l'autre de la boucle, la carte
doit montrer les deux.

L'interrupteur de l'arbre des couches éteint les deux traits d'un coup.

## 12. Les endpoints

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

## 13. Un cycle complet, au curl

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

## 14. Qui voit quoi — la doctrine de visibilité (lot V-1)

Le RBAC répond « ce rôle peut-il lire des incidents ? ». Il ne répond pas
« LESQUELS ». Jusqu'à ce lot, la réponse implicite était « tous, pour tout le
monde » : un wali de Casablanca voyait les crues de Zagora, un OPCOM déployé sur
un séisme voyait un feu de forêt à 300 km. La doctrine ci-dessous répond à la
question manquante, et un seul fichier y répond —
`apps/api/src/modules/domain/visibility.service.ts`. Un filtrage dispersé dans
les contrôleurs finit toujours par diverger d'une route à l'autre.

### 14.1 Les cinq portées

| Portée | Rôles | Ce qu'ils voient |
|---|---|---|
| `global` | superadmin, admin, stratégique | Le pays entier. La vue d'ensemble EST la fonction du rôle stratégique. |
| `region` | wali | Les incidents de **sa** région administrative. Unités et réseau hospitalier restent nationaux (voir 15.3). |
| `zone` | place d'armes | Incidents, unités et hôpitaux de campagne dans un rayon de **40 km** autour de sa ville. |
| `incident` | OPCOM, TACOM, cellules bleue/verte/orange, resp. abri, resp. équipement | **Un seul** incident : celui sur lequel le compte est déployé. |
| `entity` | resp. hôpital, resp. unité, resp. morgue | Tous les incidents où **leur** entité est engagée — ils servent plusieurs opérations à la fois. |

Le filtrage est **serveur**. `GET /incidents`, `/units` et `/field-hospitals`
passent par le service de visibilité : la carte, les listes et les compteurs du
tableau de bord en héritent sans une ligne modifiée côté web. C'est ce qui évite
qu'un écran oublié ne devienne une fuite.

### 14.2 Default-deny, jusqu'au bout

Un rôle cantonné **sans affectation ne voit rien**. Un wali sans région, un OPCOM
non déployé : liste vide, jamais la liste entière. Le silence d'une affectation
ne vaut pas permission.

Deux garde-fous complètent la règle à la saisie, pour que l'oubli soit visible
plutôt que dangereux :

- **Région et ville sont exigées à la création** du compte. Un wali sans région
  serait aveugle, ce qui se lit comme une panne et non comme un oubli
  d'administration — mieux vaut refuser le compte.
- **L'incident ne l'est pas.** On crée un OPCOM bien avant de le déployer ; le
  déploiement est un acte distinct et tracé (lot V-2).
- **Une portée orpheline est refusée** : affecter une région à un OPCOM renvoie
  400. Chaque rôle ne porte que le périmètre dont il relève
  (`ROLE_SCOPE_KEY`, `apps/api/src/shared/responsibilities.ts`).

Un responsable d'abri ou d'équipement **cumule** les deux rattachements — son
entité *et* son incident : contrairement à l'hôpital ou à l'unité, il est armé
pour une opération donnée.

### 14.3 Deux décisions à expliciter

**Le wali voit les moyens du pays entier.** Seuls ses *incidents* sont filtrés.
C'est délibéré : un wali doit pouvoir demander des renforts **hors** de sa
région, ce qu'il ne pourrait pas faire s'il ne voyait que ses propres unités.

**La zone n'est pas une frontière administrative** mais un cercle de 40 km : une
place d'armes commande ce qu'elle peut *atteindre*, pas ce qui relève de sa
préfecture. Un incident à 23 km mais dans la région voisine lui est visible ; un
incident à 87 km dans sa propre région ne l'est pas. La distance l'emporte sur
l'étiquette.

### 14.4 La région comme clé — reprise des données

La région est devenue une **clé de visibilité**, plus un simple libellé. Deux
conséquences :

- `CreateIncidentDto.region` est contraint au référentiel des 12 régions
  (`REGIONS_MA`). Sans cela, « Oriental » et « L'Oriental » coexistaient : le
  filtre en affichait deux entrées, et un wali affecté à l'une ne voyait pas les
  incidents libellés de l'autre.
- Les instantanés disque écrits **avant** ce lot sont canonicalisés à la lecture
  (`LEGACY_REGION_MAP`, `domain.service.ts`), comme `LEGACY_ROLE_MAP` le fait
  pour les rôles renommés. Corriger le seed n'aurait réparé que les
  installations neuves.

### 14.5 Élargissements de la matrice

`strategic`, `wali` et `place_arme` étaient **absents** des lignes `incidents`,
`teams`, `hospinet`, `shelters` et `equipment` de `docs/MATRICE ROLES.xlsx` :
ils recevaient 403 avant même que le filtrage ne s'applique. Les cellules
ajoutées sont annotées une à une dans `shared/permissions.ts`. Aucun des trois ne
reçoit `A`, `M` ni `R` — **ils observent, ils ne conduisent pas**.

### 14.6 Ce que ce lot ne fait pas

Trois limites, assumées et non masquées :

- **Les hôpitaux de campagne ne sont pas filtrés par zone.** Le modèle API
  `FieldHospital` ne porte aucune coordonnée : il n'y a rien à comparer à un
  rayon. Inventer une position pour *faire semblant* de filtrer serait pire que
  de ne pas filtrer sur une plateforme de commandement. À traiter quand
  `FieldHospital` portera `ll`.
- **Le tableau de bord global reste fermé au wali et à la place d'armes.**
  `GET /dashboard/stats` agrège le pays entier sans paramètre de portée : leur
  ouvrir la route leur montrerait des chiffres **nationaux** sur une page censée
  montrer leur territoire — pire qu'un refus. Les compteurs qu'ils voient
  aujourd'hui sont dérivés côté client des listes déjà filtrées, donc justes ;
  les panneaux nationaux (fil des événements, analyse de risque) restent vides.
  Résolu par le tableau de bord par incident (V-3) et les vues par portée (V-4).
- **Le jeu de démonstration est trop clairsemé pour éprouver la zone.** L'unité
  la plus proche de Casablanca est à 85 km : une place d'armes y voit 3 incidents
  et **zéro** unité. Le filtre est juste, les données ne le sont pas encore
  (lot V-4).

### 14.7 Éprouver la doctrine

```bash
# Un wali de Casablanca-Settat, un commandant de place d'armes, un OPCOM déployé
SU=$(curl -s -X POST localhost:3005/api/auth/dev-token -H 'Content-Type: application/json' \
  -d '{"username":"m.zraib","role":"superadmin"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST localhost:3005/api/iam/users -H "Authorization: Bearer $SU" \
  -H 'Content-Type: application/json' \
  -d '{"matricule":"wali.demo","nom":"Bennani","roles":["wali"],
       "assignments":{"region":"Casablanca-Settat"}}'
```

Le code temporaire est renvoyé par la création. Connecté à l'écran, le wali doit
voir **3 incidents** (tous Casablanca-Settat) là où le superadmin en voit 10 —
sur le tableau de bord, dans la liste et sur la carte.

## 15. Ce qui reste à construire

Le workflow est posé ; ces maillons le compléteront (voir le plan d'exécution) :

| Lot | Ce qu'il ferme |
| --- | --- |

**Limite connue.** Le dépôt en mémoire ne connaît pas les transactions : la
cascade de suppression d'incident (annulation des boucles puis purge) n'est pas
atomique tant que PostgreSQL n'est pas branché.
