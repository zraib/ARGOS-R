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
OPÉRATIONS. Avant, le seul canal d'opération avait été créé à la main : rien ne
donnait un lieu de conversation aux intervenants d'un incident.

Le canal porte le **titre de l'opération**, pas sa référence : « Crues de l'oued
Ourika » donne `crues-de-l-oued-ourika`. C'est sous ce nom que l'état-major
désigne l'opération à l'oral ; `inc-2623` obligeait à aller chercher à quoi la
référence correspondait. Les lettres accentuées sont conservées — l'interface
est en français, en arabe et en anglais.

| Élément | Valeur | Pourquoi |
| --- | --- | --- |
| nom | `crues-de-l-oued-ourika` | ce que l'opérateur lit dans la liste |
| sujet | `Coordination — INC-2623 · Crues de l'oued Ourika` | la référence reste, elle n'est pas perdue |
| identifiant | `c-inc-2623` | dérivé de la référence : la suppression en cascade et les messages système retrouvent le canal par là, quel que soit le titre |

Deux opérations peuvent porter le même titre : la seconde reçoit le numéro de sa
référence en suffixe (`feu-de-forêt-2702`).

La création est **idempotente** : redemander le canal d'un incident déjà pourvu
rend l'existant plutôt que d'en empiler un second, et sans le renommer.

### Membres d'un canal

| `members` | Sens |
| --- | --- |
| **absent** | canal **ouvert** — c'est le cas des canaux thématiques historiques (état-major, logistique…), qui ne changent donc pas de comportement |
| **défini** | canal **restreint** — seuls les membres le voient et y écrivent |

Un canal ouvert **devient restreint dès son premier membre** : le geste qui le
referme doit être explicite. Les canaux d'incident, eux, naissent restreints et
se peuplent au fil des engagements.

**À la création d'un canal de discussion**, les membres se choisissent dans le
même geste : la boîte « Nouveau canal » porte le nom et l'annuaire des comptes
joignables. Ouvrir un canal puis penser à y convoquer les intéressés en deux
temps, c'est laisser une conversation sans destinataires. Aucun membre coché →
le canal reste ouvert.

**La liste se révise ensuite**, depuis le bouton « Participants » de l'en-tête du
canal : une unité relevée sort, un renfort arrivé entre. La composition d'une
conversation suit l'opération, elle n'est pas figée à la déclaration. Ce geste
relève de la **conduite** (`comms:update`, que tous les rôles opérationnels
détiennent) et non de l'administration : convoquer un renfort n'est pas du même
ordre que renommer ou supprimer un canal.

| Geste | Effet |
| --- | --- |
| Convoquer le **premier** participant d'un canal ouvert | le canal devient **restreint** |
| Retirer le **dernier** participant | le canal **reste restreint**, la liste est simplement vide |

Vider un canal ne le rouvre pas : le rendre visible de tous parce que son
dernier intervenant a été relevé exposerait la conversation au moment précis où
plus personne ne la surveille. Rouvrir est un geste séparé.

### L'annuaire des correspondants

`GET /comms/directory`, sous `comms:view` et **non** sous `users:view` :
convoquer quelqu'un dans une conversation relève de la participation, pas de
l'administration des comptes. Il ne rend que matricule, nom, grade et rôles —
rien du cycle de vie du compte (code temporaire, état du mot de passe,
activation), qui reste derrière l'écran des utilisateurs.

Deux conditions pour y figurer, et **la seconde est celle qui compte** :

1. le compte est actif (ni désactivé, ni en attente d'activation) ;
2. il a **déjà servi** — une première connexion est enregistrée.

Un compte ouvert par l'administration mais dont personne n'a encore pris
possession n'est pas un correspondant : le convoquer n'adresse la conversation à
personne, tout en laissant croire le contraire à qui lit la liste des
participants. Il apparaît de lui-même à sa première connexion. L'écran
d'administration des comptes, lui, continue de les montrer tous — c'est là qu'on
suit ceux qui n'ont pas encore ouvert.

### Qui fait quoi

| Geste | Système | Conduite | Admin | Superadmin |
| --- | :---: | :---: | :---: | :---: |
| Créer le canal d'un incident | ✅ à la déclaration | — | ✅ | ✅ |
| Renommer, sujet | — | — | ✅ | ✅ |
| Ajouter / retirer des participants | ✅ convocation | ✅ bouton « Participants » | ✅ | ✅ |
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

## 15. Armer une opération — le déploiement (lot V-2)

Le lot V-1 a décidé qu'un OPCOM ne voit que l'incident sur lequel il est
déployé. Restait à dire **comment il y est déployé**. Jusqu'ici : un champ parmi
d'autres dans `PATCH /iam/users/:id`, entre le grade et le téléphone.

Or ce champ décide de ce qu'un officier voit. Le poser est un acte de
commandement — il a un auteur, une date, une opération, et il **retire**
l'officier de celle qu'il servait.

### 15.1 Trois routes, deux contrôles

| Route | Permission | Effet |
|---|---|---|
| `GET /incidents/:id/deployments` | `incidents:view` | Les postes armés sur l'opération |
| `GET /deployable-posts` | `incidents:update` | Les candidats, **avec leur affectation courante** |
| `POST /incidents/:id/deployments` | `incidents:update` | Déploie ; remplace l'affectation précédente |
| `DELETE /incidents/:id/deployments/:matricule` | `incidents:update` | Retire |

Le contrôle est **double** : le RBAC (`incidents:update` — admin, OPCOM, TACOM)
**puis** la visibilité de l'incident. Sans le second, un OPCOM déployé sur une
opération pourrait armer celle d'un autre en devinant son identifiant. Avec lui,
la propriété suivante tombe d'elle-même : **un OPCOM non déployé ne voit aucune
opération, donc ne peut s'auto-déployer nulle part.** Le geste vient toujours
d'en haut.

Une opération hors portée répond **404, pas 403** : « interdit » confirmerait son
existence à quelqu'un qui n'a pas à la connaître.

### 15.2 Les règles du métier

- **Un poste, une opération.** Redéployer retire de la précédente. Le retrait
  implicite est *rendu* dans la réponse (`previousIncidentId`) et écrit au fil —
  un retrait subi sans trace est le genre de chose qu'on découvre trop tard.
- **On n'arme pas une opération close ou archivée** (409).
- **Seuls les postes déployables** : OPCOM, TACOM, cellules bleue/verte/orange,
  responsables abri et équipement. Un responsable d'hôpital, d'unité ou de morgue
  est refusé (400) — il sert **plusieurs** opérations à la fois, l'y cantonner
  l'aveuglerait sur les autres.
- **Idempotent** : redéployer sur la même opération renvoie `changed: false` et
  n'écrit rien au fil.
- **La suppression d'un incident libère ses postes** (cascade). Sans elle, les
  comptes resteraient affectés à un identifiant disparu : portée « incident »,
  incident inexistant, plus rien de visible — un compte mort sans message
  d'erreur.

### 15.3 Ce que le journal d'audit dit désormais

`AuditEntry.meta` existait depuis la Phase 0, chaîné dans le hash… et **rien ne
le remplissait**. La route seule suffit pour un `PATCH /incidents/:id` ; elle ne
dit rien pour un déploiement — ni qui, ni d'où.

Le décorateur `@AuditMeta()` (`common/decorators/audit-meta.decorator.ts`) permet
au gestionnaire d'enrichir l'entrée que l'intercepteur écrit déjà. **Une seule
ligne par geste, avec son détail** — écrire une seconde entrée à la main aurait
doublé chaque mutation du journal.

```
seq 3  m.zraib  POST /api/incidents/INC-2606/deployments
       meta={ deployed: "y.tazi", onto: "INC-2606",
              withdrawnFrom: "INC-2607", changed: true }
```

### 15.4 Une divergence supprimée en chemin

`DEPLOYED_ROLES` (visibilité, V-1) recopiait à la main ce que `ROLE_SCOPE_KEY`
encodait déjà. Les deux listes auraient fini par diverger, et la divergence
aurait été silencieuse **et grave** : un rôle déployable absent de la liste de
visibilité aurait été affecté à un incident **sans être cantonné à lui** —
l'inverse exact de ce que le déploiement doit garantir. La liste est désormais
`DEPLOYABLE_ROLES`, dérivée de la table unique.

### 15.5 À l'écran

La fiche d'incident porte une section **« Postes déployés »** : qui conduit
l'opération, en ligne ou non, avec le geste pour armer et retirer quand le compte
en a le droit. Deux choses y sont rendues visibles qui ne l'étaient pas :

- **l'affectation courante de chaque candidat**, écrite dans l'option elle-même
  (« Colonel Demo — OPCOM *(sur INC-2615)* ») : le seul moment où l'on peut
  encore renoncer sans dégarnir un autre théâtre ;
- **la conséquence du retrait** — un poste retiré ne voit plus aucune opération.

Le masquage des boutons n'est pas le contrôle d'accès : l'API refuse déjà. Il
évite seulement de proposer un geste voué au 403.

### 15.6 Une conséquence de V-1 remontée jusqu'au web

Contraindre `region` au référentiel a typé le champ en **énumération** dans
l'OpenAPI. L'assistant de création passait une chaîne libre avec un repli
`"—"` — désormais refusé en 400, et l'utilisateur aurait vu « échec » sans
savoir pourquoi. Le champ est maintenant typé depuis le contrat, et la création
s'arrête avec un message si la région n'est pas résolvable. **C'est le contrat
qui a trouvé le défaut**, pas un test.

### 15.7 Éprouver

```bash
# Déployer, puis constater que l'officier ne voit QUE cette opération
curl -X POST localhost:3005/api/incidents/INC-2607/deployments \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"matricule":"y.tazi"}'
```

14 tests couvrent le lot (`modules/domain/deployment.spec.ts`), dont la jonction
avec V-1 : déployé, le compte voit exactement une opération ; retiré, plus aucune.

## 16. Le tableau de bord d'une opération (lot V-3)

Le tableau de bord national répond à « comment va le pays ? ». Un OPCOM qui
prend son poste ne pose pas cette question : il veut le bilan, qui est engagé,
ce qui est en vol, et ce qui s'est passé depuis. D'où une page par opération,
`/incidents/[id]/dashboard`.

### 16.1 La double garde — enfin utilisée

C'est ici que `canSeeIncident`, écrite au lot V-1, sert. `dash_incident:view`
dit « ce rôle peut lire un tableau de bord d'incident » ; elle ne dit pas
**lequel**. Sans la seconde garde, un OPCOM ouvrirait celui d'une autre
opération en devinant son identifiant — et les identifiants sont séquentiels.

```
GET /incidents/:id/dashboard
  → RequirePermission("dash_incident:view")   le rôle
  → canSeeIncident(incident, portée)          l'opération
```

Un incident hors portée répond **404, comme un inconnu**. Distinguer les deux
apprendrait qu'une opération existe.

### 16.2 Calculé côté serveur, et pourquoi

L'agrégat aurait été plus simple à reconstruire dans le navigateur depuis les
listes déjà chargées. Il n'aurait alors **rien gardé** : il aurait suffi d'un
identifiant deviné. Le calcul serveur est ce qui rend la garde effective.

Le module `incident-dashboard` lit le domaine **et** les missions. Or
`MissionsModule` importe déjà `DomainModule` (pour enregistrer sa cascade de
suppression) : injecter `MissionService` dans le domaine aurait fermé le cycle.
D'où un module de **lecture** qui dépend des deux et dont personne ne dépend. Il
n'exporte rien et n'écrit rien — un agrégat de lecture ne doit pas devenir un
point d'écriture par commodité.

### 16.3 Ce que la page montre

| Bloc | Contenu |
|---|---|
| Bandeau | Bilan humain, personnel engagé, boucles (total · en cours) |
| Situation | La description libre — la seule prose de la fiche |
| Moyens engagés | Unités (effectif, disponibilité) et hôpitaux (**lits libres = armés − occupés − réservés**, barre de saturation) |
| Boucles opérationnelles | Les dernières, avec leur état |
| Postes déployés | Le composant V-2, avec le geste d'armement |
| Fil de l'opération | Les événements de CET incident |

Les lits **réservés** sont retranchés : une EVASAN acceptée mais pas encore
arrivée immobilise un lit que l'occupation ne montre pas (lot P2-b). Les taire
ferait viser deux transferts sur le même.

### 16.4 Le fil repose sur un lien, pas sur une recherche de texte

`FeedItem` ne portait aucun rattachement. Reconstituer le fil d'une opération
aurait obligé à chercher son identifiant **dans le texte** — une heuristique qui
rate dès qu'une formulation change, et qui rate **en silence**. Sur une
plateforme de commandement, une ligne de journal manquante ne se remarque pas.

`FeedItem.incidentId` a donc été ajouté, et `pushFeed` accepte le rattachement.
Six sites d'appel seulement : le coût était moindre que celui de l'heuristique.

### 16.5 Deux défauts corrigés en chemin

**La description était perdue.** L'assistant de création collectait un champ
`desc` depuis toujours — saisi à la main ou proposé par l'assistant — et ne
l'envoyait **jamais**. Le seul récit de l'événement disparaissait à
l'enregistrement, et un commentaire dans le code constatait le fait sans le
corriger. `Incident.desc` est désormais persisté, envoyé à la création, rechargé
à l'édition, et affiché en tête du tableau de bord.

**La modification pouvait écrire une région hors référentiel.** Le lot V-1 avait
contraint `CreateIncidentDto.region` mais pas `UpdateIncidentDto.region` :
modifier un incident pouvait encore y inscrire « Oriental » et le soustraire au
wali de « L'Oriental ». Fermer la porte d'entrée sans fermer celle de service ne
protège rien.

### 16.6 Un élargissement de matrice nécessaire

`resp_hospital` et `resp_unit` étaient **absents** de la ligne `dash_incident`.
Ils voyaient leurs incidents dans la liste (portée `entity`, V-1) et recevaient
403 en ouvrant l'un d'eux — la portée existait, la permission manquait. Les deux
cellules sont ajoutées ; le cantonnement reste appliqué : ils n'ouvrent que les
opérations où **leur** entité sert.

## 17. Le jeu de démonstration (lot V-4)

Un jeu de données de démonstration n'est pas un décor : c'est lui qui décide si
un défaut de portée **se voit** ou passe inaperçu. Le jeu précédent l'illustrait
à l'envers — l'unité la plus proche de Casablanca stationnait à 85 km, si bien
qu'une place d'armes y voyait **zéro** moyen. Une liste vide et un filtre cassé
se ressemblent beaucoup.

### 17.1 Construit pour être éprouvé — et démenti

| Portée | Ce que le jeu permet de démontrer |
|---|---|
| **région** (wali) | Casablanca-Settat porte **4** opérations, les autres régions les 7 restantes |
| **zone** (place d'armes, 40 km) | 3 des 4 opérations de Casablanca-Settat sont dans la zone |
| **entité** (resp. hôpital/unité/morgue) | H2 sert **4** opérations, H1 en sert 3 |
| **incident** (conduite) | Chaque opération ouverte a bilan, moyens, sous-incidents |

Le point qui compte est le **cas limite**. Autour de Casablanca :

```
Casablanca      0,0 km   ✓        Benslimane     43,8 km   ✗   ← ici
Mohammedia     23,6 km   ✓        Settat         63 km     ✗
Berrechid      33,4 km   ✓
```

L'incident de Benslimane et l'unité U10 sont placés à **43,8 km** : même région,
même province, hors de portée de 4 km. Un filtre approximatif — par province,
par région, « à peu près » — les inclurait. Sans ce point, une erreur de 20 %
sur le rayon passerait inaperçue, et les portées « région » et « zone »
seraient indiscernables à la démonstration.

### 17.2 Ce que le jeu contient

**11 opérations** sur 5 régions canoniques, chacune avec description, bilan
humain et intervenants — le jeu précédent n'avait ni l'un ni l'autre, d'où des
tableaux de bord vides. Une opération est **close** (elle éprouve le refus de
déploiement de V-2), une est **NRBC** (elle alimente le panache).

**12 unités.** `U1`..`U6` gardent leur identité : `catalog.data.ts` rattache
douze matériels à ces identifiants, et les renuméroter aurait réaffecté, sans un
mot, le parc du Génie à une unité NRBC. **Un identifiant est une référence : on
l'étend, on ne le réattribue pas.** Les unités de l'axe Casablanca sont `U7`..`U10`.

**4 comptes de démonstration**, dans le seed :

| Matricule | Rôle | Portée | Code |
|---|---|---|---|
| `w.casa` | Wali | Casablanca-Settat | `WALI-2026` |
| `p.casa` | Place d'Armes | Casablanca (40 km) | `ZONE-2026` |
| `o.chraibi` | OPCOM | **non déployé** | `OPCOM-2026` |
| `s.moutaouakil` | Resp. Hôpital | H2 | `HOSP-2026` |

L'OPCOM est créé **non déployé** : un compte sans affectation ne voit rien, et
c'est la première chose à démontrer. Le changement de mot de passe au premier
login reste obligatoire, comme pour tout compte.

### 17.3 Reprise des installations existantes

Un nouveau jeu de données doit prendre effet là où il en faut un, sans effacer
le travail d'une séance. Trois mécanismes :

- **`seeded: true`** marque les lignes de démonstration. Une montée de
  `DOMAIN_SEED_VERSION` les reconstruit et conserve ce qu'un utilisateur a créé.
- **Reprise ponctuelle** : les lignes déjà sur disque sont antérieures au
  marqueur, d'où `LEGACY_SEED_INCIDENT_IDS` / `LEGACY_SEED_UNIT_IDS`. Les montées
  suivantes s'appuieront sur le marqueur seul.
- **Comptes** : ajout purement **additif**. Le registre disque fait autorité — un
  compte modifié, désactivé ou supprimé le reste ; un compte du seed absent du
  disque est simplement ajouté.

### 17.4 Deux défauts que le jeu a révélés

**La numérotation des incidents reprenait des identifiants existants.** Elle
faisait `2608 + nombre d'incidents` : compter rendait un identifiant déjà pris
dès qu'un incident avait été supprimé — et, avec onze lignes amorcées à partir
de `INC-2612`, dès la **première** création. Deux incidents de même identifiant,
c'est une boucle adressée à la mauvaise opération. La numérotation part
désormais du **rang maximal**.

**Les doublons d'identifiant survivaient à la reprise.** Ils ne sont jamais
valides, mais rien ne les écartait hors d'une reconstruction — donc un
instantané abîmé se restituait tel quel indéfiniment. Le dédoublonnage est
maintenant appliqué à **chaque** lecture.

*(Le second a été trouvé en observant l'application, pas en lisant le code : une
reconstruction interrompue avait laissé quatre incidents en double sur le poste
de développement.)*

### 17.5 Éprouver, en trois connexions

```
w.casa / WALI-2026        → 4 incidents, tous Casablanca-Settat
p.casa / ZONE-2026        → 3 incidents et 3 unités ; Benslimane (43,8 km) absente
o.chraibi / OPCOM-2026    → AUCUN incident, tant qu'il n'est pas déployé
```

Puis, depuis la fiche d'une opération, déployer `o.chraibi` : il voit
immédiatement cette opération, et elle seule.

## 18. Les insignes NRBC (lot N-1)

Sur la carte, **tout incident portait le même triangle « ! »** : une fuite de
chlore ne se distinguait pas d'une crue. C'est l'information la plus coûteuse à
ne pas voir — la nature du danger décide des distances d'isolement, de la tenue
de protection et du sens d'approche.

### 18.1 Ce qui est dessiné, et selon quoi

Les pictogrammes suivent la signalisation **ADR/ONU**, pas une interprétation :

| Famille NRBC | Pictogramme | Référence |
|---|---|---|
| C — chimique | Losange **blanc**, tête de mort et tibias noirs | ADR 6.1 / 2.3 |
| N — nucléaire · R — radiologique | Moitié haute **jaune**, moitié basse blanche, trèfle noir | ADR 7 |
| B — biologique | Losange blanc, symbole de danger biologique | ADR 6.2 |
| — | Fût de matière dangereuse avec flaque | usage interne |

`N` et `R` partagent le trèfle : la signalisation ne distingue pas l'origine du
rayonnement (arme ou source industrielle). Les séparer inventerait un symbole
qui n'existe pas.

**Une réserve, assumée.** La demande décrivait « un losange jaune avec crâne et
deux os ». Ce signal n'existe pas dans l'ADR : le jaune y désigne la
radioactivité (classe 7) et les comburants (5.1) ; la tête de mort se porte sur
fond **blanc**. Sur une plateforme de commandement, un pictogramme faux est pire
qu'un pictogramme générique — il *affirme*. Le repère jaune est donc porté par
l'**anneau du marqueur** cartographique : signal coloré à distance, symbole
exact de près. Basculer le fond en jaune reste une constante à changer.

### 18.2 Une géométrie, deux rendus

Les marqueurs MapLibre sont construits en **chaînes HTML**, l'interface en
**React**. Décrire les formes en données (`lib/hazard/pictograms.ts`) plutôt
qu'en JSX permet aux deux de partager la même source. Deux jeux de tracés
auraient fini par diverger, et c'est précisément le genre de divergence qu'on ne
remarque pas : le pictogramme resterait *plausible*.

### 18.3 La contrainte qui a fait défaut deux fois

À une hauteur `y`, la demi-largeur intérieure du losange vaut `24,5 − |y − 32|`
sur une grille de 64. Le premier dessin employait un rayon de 19 : **les tibias
sortaient du cadre**, et le trèfle touchait les bords au point que ses trois
vides — ce qui le fait reconnaître — cessaient de se lire. Une signalisation qui
déborde de son étiquette n'est plus une signalisation.

La géométrie est désormais bornée à ~15 de rayon, et les tibias croisent
**derrière** le crâne à hauteur de ses tempes (disposition de la planche ADR)
plutôt qu'en dessous : les placer dessous obligeait à les allonger pour qu'ils se
voient, donc à sortir du cadre.

### 18.4 Où ils apparaissent

- **Marqueur cartographique** — le pictogramme dans un anneau teinté par la
  **gravité** : le symbole dit de quoi il s'agit, l'anneau à quel point c'est
  grave. Les deux se lisent d'un coup d'œil sans se gêner.
- **Fiche d'incident**, en-tête du volet NRBC.
- **Tableau de bord de l'opération**, en-tête.
- **Panneau NRBC de la carte**, liste des panaches.

L'`aria-label` est traduit (FR/EN/AR) : c'est le seul contenu du pictogramme pour
qui ne le voit pas.

### 18.5 Ce qui n'est pas couvert

`apps/web` n'a **toujours aucune suite de tests** : cette géométrie est gardée
par le commentaire qui énonce la contrainte de cadre, et par l'œil. Le défaut de
débordement a d'ailleurs été trouvé en regardant une planche de rendu, pas en
lisant le code — c'est dire ce que vaut ici une relecture.

## 19. La bibliothèque de substances dangereuses (lot N-3)

### 19.1 Ce que c'est, et ce que ce n'est pas

CAMEO Chemicals (NOAA) publie environ six mille fiches. **ARGOS ne peut pas les
interroger** : aucun appel sortant vers un tiers n'est admis à l'exécution
(ADR 0006, MASTER_PLAN §4.3). Ce module n'est donc pas une copie de CAMEO. C'est
**la forme de ses données**, remplie de ce qu'on peut honnêtement affirmer, avec
un chemin explicite pour y verser les fiches réelles.

Trente et une substances toxiques par inhalation — industrie, ports,
agriculture — chacune avec sa fiche opérationnelle : aspect et odeur, densité de
vapeur, comportement du nuage, effets sur la santé, incendie, réactivité,
protection.

### 19.2 Deux jeux de données, deux provenances, jamais fondues

| Donnée | Source | Drapeau |
|---|---|---|
| Fiche — comportement, effets, réactivité | CAMEO Chemicals (NOAA) | `sheetVerified` |
| Distances d'isolement et de protection | Table 1 de l'ERG 2024 | `ergVerified` |

Les confondre ferait croire qu'une fiche juste vaut distance juste. Ce sont deux
documents et deux autorités. L'écran affiche les deux **séparément**, et en
tête — une bibliothèque dont on ignore ce qui a été vérifié se lit comme si tout
l'était.

État à la livraison : **31/31 fiches, 0 confrontée à CAMEO · 11/31 jeux de
distances, 2 relevés sur l'ERG 2024.** Ce n'est pas satisfaisant ; c'est exact,
et le dire est la seule façon que ça le devienne.

### 19.3 Pourquoi vingt substances n'ont PAS de distances

Leurs valeurs n'ont pas été relevées sur la table 1. **Une distance d'isolement
plausible mais fausse est le genre d'erreur qui ne se découvre qu'une fois le
périmètre posé trop court.** Le gabarit ERG du panache leur est donc
indisponible, et l'interface le dit ; le gabarit ATP-45, qui ne dépend que du
vent, reste utilisable.

Le service en tire la conséquence : `hasErgDistances` accompagne chaque réponse
de panache, pour que le client distingue « gabarit non demandé » de « gabarit
demandé, distances inconnues ». Sans ce drapeau, une carte sans cercle
laisserait croire à une panne.

### 19.4 La recherche cherche des NUMÉROS

Sur intervention, ce qui est lu sur une citerne est une étiquette orange — un
numéro, pas un nom français. La recherche porte donc sur le numéro ONU (avec ou
sans le préfixe « UN »), le numéro CAS, les synonymes et les trois langues.
`1017`, `UN 1017` et `gaz des égouts` trouvent tous ce qu'il faut.

### 19.5 Compléter la bibliothèque (procédure d'état-major)

1. ouvrir la fiche CAMEO Chemicals de la substance (numéro CAS dans le fichier) ;
2. confronter `sheet`, corriger, passer `sheetVerified: true` ;
3. relever la table 1 de l'ERG 2024 (petit et grand déversement), renseigner
   `small`/`large`, passer `ergVerified: true`.

Tout est dans `apps/api/src/modules/nrbc/infrastructure/substances.data.ts`. Le
port `SubstanceCatalog` permettra d'y substituer une table PostgreSQL alimentée
par l'état-major sans qu'une ligne du service ne bouge.

**« Grand déversement »** : retenir le PIRE CAS de la ligne (wagon /
semi-remorque), pas la citerne moyenne — un état-major planifie sur l'enveloppe.

### 19.6 Ce que les tests protègent

Pas le contenu des fiches, qui évoluera à chaque vérification, mais les
propriétés dont dépend la sûreté : unicité des identifiants ONU et CAS (un
doublon ferait remonter la mauvaise fiche à la recherche par étiquette),
distances renseignées **par paire**, aucune substance marquée vérifiée sans
porter de distances, et surtout : une substance sans distances ne fait dessiner
**aucune** zone.

### 19.7 Verser un référentiel complet — et pourquoi il n'est pas livré

**La limite n'est pas technique, elle est juridique.** Les conditions
d'utilisation de CAMEO Chemicals disent, mot pour mot :

> « Data from the above organizations shall not be duplicated by the recipient,
> without written permission from those organizations. »

Et plusieurs composants appartiennent à des tiers : informations de protection
DuPont, **numéros et synonymes CAS** (Chemical Abstracts Service), cotations
NFPA, seuils AEGL et ERPG. Une autorisation valable doit émaner de **ces
organisations-là** — un service utilisateur de CAMEO, fût-il d'un État,
ne peut pas concéder ce qu'il ne détient pas. Il n'existe par ailleurs aucun
export en masse ni API publiés.

La voie ouverte est l'**ERG 2024** : diffusé gratuitement aux services de
secours par le PHMSA, Transports Canada et le SCT, avec les fichiers de
production (`.xlsx`, `.docx`) fournis sur demande à `ERGComments@dot.gov`. C'est
le jeu qui porte les distances d'isolement pour environ 3 500 numéros ONU.

*(Décision tracée : les 31 numéros CAS de la bibliothèque livrée sont conservés
sur arbitrage de l'état-major — identifiants publiés dans d'innombrables sources
ouvertes, et indispensables à la recherche par étiquette.)*

**La chaîne d'import (lot N-3b).** Quel que soit le jeu obtenu — ERG, export
CAMEO autorisé, référentiel national marocain — il se charge sans toucher au
code :

```bash
npm run nrbc:import -- chemin/vers/erg2024.json   # depuis apps/api
```

Le format, `argos.substances.v1` :

```json
{
  "format": "argos.substances.v1",
  "source": "ERG 2024, table 1 — PHMSA / Transports Canada / SCT",
  "retrievedAt": "2026-09-15",
  "authorization": "diffusion libre aux services de secours (PHMSA)",
  "substances": [ { "id": "…", "un": "…", "ergGuide": "…", "labels": {…}, "state": "gas", "small": {…}, "large": {…} } ]
}
```

`authorization` est **obligatoire** et volontairement libre : il force celui qui
verse la donnée à écrire sous quel droit il le fait. C'est la seule trace qui
restera d'une question juridique avant d'être technique. Un champ vide est un
refus.

**Trois garanties :**

- **La donnée sous licence n'entre pas dans git.** Elle est déposée dans
  `apps/api/data/` (ignoré), pour qu'un dépôt cloné ailleurs ne devienne pas le
  vecteur d'une redistribution non autorisée.
- **Le fichier est refusé EN ENTIER** s'il cloche : format inconnu, numéro ONU
  en double, un seul déversement renseigné, `ergVerified` sans distances, ou
  distances hors de tout ordre de grandeur — le défaut le plus probable d'un
  tableur converti à la main étant des colonnes mètres/kilomètres permutées.
  Charger la moitié d'un référentiel de sécurité est pire que n'en charger
  aucun : on croit consulter la base complète.
- **La provenance voyage avec la donnée** et s'affiche : source, date de relevé,
  titre de détention. Une bibliothèque enrichie dont on ignore d'où vient
  l'enrichissement aurait l'air complète.

Le jeu versé **prime** sur la bibliothèque livrée, par identifiant : l'ordre
inverse rendrait l'import sans effet sur les 31 substances d'origine —
précisément celles qu'on veut voir vérifiées en premier.

*(Un défaut trouvé en éprouvant la chaîne : le répertoire était résolu depuis
`process.cwd()`, qui diffère entre la commande d'import et le serveur. Un jeu
« installé » restait invisible, sans le moindre message. Il est désormais ancré
sur la racine du paquet.)*

### 19.8 Extraire les distances ERG de l'application CAMEO de bureau

L'application CAMEO Chemicals de bureau embarque sa base : un fichier SQLite de
32 Mo, `Resources/server/CAMEOChemicalsServer/_internal/cameo.sqlite`. Elle
mélange **des jeux de statuts juridiques différents** :

| Tables | Origine | Statut |
|---|---|---|
| `unna_actiondistances`, `unna_table3`, `unnas`, `erg_guides`, `unna_cfr49s` | ERG 2024, 49 CFR | Publication gouvernementale, **diffusion libre aux secours** |
| `lol`, `cfats` | EPA, CISA | Publications gouvernementales |
| `dupont` | DuPont | **Propriété tierce, nommée dans les conditions** |
| `chemical_cas` | Chemical Abstracts Service | **Propriété tierce, nommée** |
| `aegls`, `erpgs` | NACA, AIHA | **Propriété tierce, nommées** |
| `chemicals` (5 094 fiches) | Compilation NOAA + contributeurs | **Interdiction de duplication** |

**Posséder l'application ne donne pas le droit d'en verser la base dans une
autre.** Le script `nrbc:extract-erg` ne lit donc QUE les tables ERG :

```bash
npm run nrbc:extract-erg -- "/chemin/vers/CAMEO CHEMICALS"   # depuis apps/api
npm run nrbc:import -- data/erg2024-extrait.json
```

Résultat : **272 matières avec distances complètes** — 30 qui complètent les
fiches françaises existantes, 242 nouvelles. La bibliothèque passe de 11 jeux de
distances (2 relevés) à 272 sur 273, tous relevés.

**Le pire cas est retenu.** La table 3 ventile le grand déversement par
CONTENANT — wagon-citerne, camion, bouteilles : un facteur 6 entre les extrêmes —
et par force de vent. ARGOS ne portant qu'une valeur, on prend le wagon-citerne
par vent faible. Un état-major planifie sur l'enveloppe.

**La fusion est champ par champ.** Un extrait de la table 1 apporte des
DISTANCES, pas des fiches : remplacer l'enregistrement entier effacerait la fiche
opérationnelle française contre rien. Les 30 substances complétées gardent leur
libellé, leurs synonymes, leur fiche — et gagnent des distances vérifiées.

#### Ce que l'extraction a corrigé

La confrontation à la base a révélé une **erreur dans une donnée que j'avais
marquée « relevée sur l'ERG »** : la distance de protection de jour de
l'ammoniac (grand déversement) valait 4,18 km, recopie de la valeur de NUIT. La
table 3 donne 1,0 mille de jour, soit **1,61 km**. Corrigée à la source.

C'est l'argument du lot en une ligne : *une saisie manuelle relue reste fausse ;
seule la confrontation à la source la corrige.* Les 272 distances ne sont plus
saisies, elles sont extraites.

#### Ce qui reste en anglais

Les noms des 242 nouvelles matières viennent de la base en anglais. Ils sont
recopiés tels quels dans les trois langues : une traduction automatique de nom
chimique serait une invention. Le français reste à faire par l'état-major.

### 19.9 Les fiches complètes — 5 336 substances (lot N-3d)

Les 5 094 fiches de la base de bureau sont désormais dans ARGOS. Ce qui a été
repris, et ce qui ne l'a pas été :

| Repris | Écarté, et pourquoi |
|---|---|
| Description, dangers santé, **premiers secours**, incendie, **lutte contre l'incendie**, **intervention hors incendie**, réactivité, profil, dangers particuliers, consignes d'isolement, protection | `chemical_cas` — **Chemical Abstracts Service** |
| Propriétés physiques de source NTP, USCG, EPA, NIOSH, ICSC | `dupont` — **DuPont** |
| Seuil **IDLH** (NIOSH), point d'éclair | `aegls` — **NACA** · `erpgs` — **AIHA** |
| Synonymes, formules | Toute propriété de source **NFPA**, et les colonnes `nfpa_*` |

Le script ne SÉLECTIONNE jamais les tables écartées. Garder trente et un numéros
CAS comme identifiants isolés est une chose ; recopier un registre de cinq mille
en est une autre. `prot_clothing` est repris après vérification : aucune de ses
4 951 valeurs ne mentionne DuPont — ces données vivent dans la table séparée.

```bash
npm run nrbc:extract-sheets -- "/chemin/vers/CAMEO CHEMICALS"
npm run nrbc:import -- data/staging/cameo-fiches.json
```

#### Une seule règle de fusion

**La valeur versée l'emporte, SAUF une rubrique de fiche déjà rédigée.**

Elle sert les deux cas sans qu'on ait à déclarer lequel. Un relevé de l'ERG doit
**corriger** une saisie fausse — c'est ainsi que la distance de jour de
l'ammoniac a été rectifiée. Une fiche CAMEO arrive en anglais : elle doit
**compléter** une rubrique française déjà écrite, pas la remplacer, tout en
apportant celles qui manquaient.

Résultat pour le chlore : prose française conservée, distances ERG vérifiées,
**et** premiers secours, lutte contre l'incendie et IDLH (10 ppm) en plus.

*(Une première version déclarait l'intention fichier par fichier. Complication
inutile, et avec un effet de bord : en mode « compléter », les DRAPEAUX de
l'existant l'emportaient aussi, si bien que des distances extraites de la source
ressortaient marquées non vérifiées. Ce qu'on veut préserver, c'est la prose.)*

#### Deux conséquences d'échelle

**La liste ne transporte plus les fiches.** 22 Mo de texte : la réponse aurait
dépassé les vingt méga-octets sur une liaison de campagne. `GET /nrbc/library`
renvoie des résumés avec un drapeau `hasSheet` ; la fiche se demande à
l'ouverture (`GET /nrbc/substances/:id`) et reste en mémoire ensuite.

**L'écran plafonne à 60 fiches rendues.** Personne ne fait défiler cinq mille
entrées, on cherche. Le compte total reste affiché, et **la recherche porte sur
la bibliothèque entière**, pas sur la tranche visible.

#### Ce qui reste imparfait

- **1 361 produits n'ont pas de numéro ONU** — ils ne voyagent pas sous régime
  ADR mais restent dangereux. `Substance.un` est devenu optionnel plutôt que de
  les taire.
- Un numéro ONU couvre parfois plusieurs produits (« liquide inflammable
  n.s.a. ») ; un seul le porte, les autres sont consultables par nom.
- **Les 5 063 nouvelles fiches sont en anglais.** Traduire automatiquement des
  noms et des consignes de sécurité serait une invention ; le français reste un
  travail d'état-major.
- **272 jeux de distances sur 5 336.** C'est la table 1 de l'ERG, qui ne couvre
  que les matières toxiques par inhalation. Le reste du référentiel n'en a pas,
  et n'est pas censé en avoir.

## 20. La fumée fluide (lot N-4)

Le panache était rendu par des formes géométriques : cercles, triangle sous le
vent, carré ERG. Elles disent exactement ce que disent l'ATP-45 et l'ERG — c'est
leur mérite — mais elles ne ressemblent pas à ce qu'un chef de secteur voit
arriver. Un nuage ne se propage pas en polygone.

### 20.1 La contrainte qui gouverne tout

**La fumée ne déborde JAMAIS du gabarit.** Une animation qui dépasserait le
périmètre doctrinal affirmerait une précision que le modèle n'a pas — et le
périmètre est ce sur quoi on pose une évacuation.

Le confinement n'est pas obtenu en réglant des paramètres, mais **par
construction** : le polygone est rastérisé en masque (256 × 256 sur sa propre
emprise), et **toute particule sortie du masque est réémise à la source**, à
chaque image. Le masque est calculé une fois par changement de géométrie —
tester l'appartenance polygone par polygone, pour 2 600 particules à 60 images
par seconde, coûterait deux cent mille lancers de rayon par image ; ici c'est
une lecture de tableau.

### 20.2 Ce que la fumée remplace, et ce qu'elle ne remplace pas

Elle remplace le **remplissage**. Elle ne remplace jamais le **contour** : le
tracé du gabarit reste visible sous elle. *Le nuage se regarde, la ligne se
mesure.* Le remplissage plat s'efface (opacité 0,28 → 0,06) car superposé à la
fumée il donne une teinte plate sur laquelle le mouvement ne se voit plus.

Une bascule **Fumée** dans le panneau NRBC rend les formes pleines : la lecture
géométrique reste disponible pour qui la préfère.

### 20.3 Comment elle se comporte

- **Dérive** dans le sens du vent — direction météorologique inversée, le nuage
  part à l'opposé d'où vient le vent. La traversée du gabarit prend ~7 s quelle
  que soit son étendue : la lecture est la même sur 300 m et sur 10 km.
- **Sans prévision de vent**, la nappe respire sur place au lieu de dériver dans
  une direction inventée — même parti que les gabarits, qui omettent leurs zones
  directionnelles quand le vent est inconnu.
- **Les bouffées grossissent en vieillissant** : c'est ce qui fait lire une
  dilution plutôt qu'un objet qui s'éloigne.
- **Mélange classique, non additif** : l'additif vire au blanc lumineux et ferait
  lire un incendie là où il s'agit d'un nuage toxique.
- Le bandeau **« ESTIMATION — PAS UNE MESURE »** reste affiché. Une belle
  animation rend la tentation d'y croire plus forte, pas moins.

### 20.4 Sans dépendance nouvelle

WebGL brut dans une `CustomLayerInterface` MapLibre : deux nuanceurs d'une
vingtaine de lignes, 2 600 particules, un tampon réécrit par image
(`lib/map/smoke.ts`). Aucune bibliothèque de particules — MASTER_PLAN §4.3.

### 20.5 Une conséquence à traiter, venue du lot précédent

L'import des 25 Mo de fiches CAMEO (N-3d) a fait passer la suite de tests de
quelques secondes à plus d'une minute par fichier, jusqu'à la faire échouer sur
délai : chaque fichier de test instancie l'application, donc relisait ces
mégaoctets. Plus grave que la lenteur, **le verdict dépendait de ce qu'un
opérateur avait versé sur sa machine.**

`jest.setup.js` pointe désormais un répertoire vide pour toute la suite : les
tests s'exécutent contre la bibliothèque **livrée avec le code**, la seule que le
dépôt garantisse. 257 tests, 66 s.

### 20.6 Reprise du lot (N-4b) — la géométrie et la matière

#### La zone sous le vent NE PART PAS d'un point

Le **GMU 2024** (« Mode d'emploi du tableau 1 », p. 284-285) décrit deux zones
distinctes : on **isole d'abord** « dans TOUTES les directions » — un cercle
autour du déversement — puis on **protège** sous le vent.

Le triangle employé jusqu'ici avait son sommet **sur le rejet** : à cinquante
mètres du déversement, la zone de danger avait une largeur nulle. Or le rejet
n'est pas un point : il occupe déjà le cercle d'isolement.

La nappe ATP-45 est donc reconstruite :
- ses deux flancs partent du **bord du cercle d'isolement**, pas du centre ;
- son fond est un **arc à portée constante**, non une corde — une corde
  sous-estimerait la portée en son milieu de près de 15 % à un demi-angle de 30° ;
- l'amont est fermé en suivant le cercle : la zone **englobe** le rejet.

`kind` passe de `triangle` à `wedge`. Deux tests épinglent la propriété :
aucun sommet ne coïncide avec la source, et le fond est bien à portée constante.

*(Le carré ERG, lui, était déjà conforme : côté = distance sous le vent,
déversement au milieu du bord amont, demi-distance de chaque côté — exactement
la figure de la page 285.)*

#### La fumée ne remplit QUE le polygone de diffusion

La nappe sous le vent, ou le cercle de vigilance par vent faible. Le cercle
d'**isolement** reste vide : c'est un rayon qu'on POSE autour du rejet, pas un
nuage qu'on observe. Les remplir tous ferait de la fumée une décoration.

Ce choix simplifie le confinement : plus de masque rastérisé, un test direct
contre l'anneau. Pendant la lecture, la géométrie change à **chaque image** —
rebâtir 65 000 cellules par image aurait été ruineux, là où tester 3 200
particules contre une trentaine de sommets ne coûte rien.

#### Vitesse proportionnelle au vent

La dérive est calculée depuis la vitesse **réelle** du vent, convertie en
mercator à la latitude du rejet. Une durée de traversée fixe donnait la même
lecture par brise et par tempête.

Le temps est accéléré d'un facteur **×120**, déclaré dans le code : à l'échelle
réelle, un nuage à 13 km/h met quarante-six minutes à traverser une nappe de
10 km, et l'animation serait immobile. À ×120 la même traversée prend vingt-trois
secondes, une brise à 4 km/h en prend soixante-quinze. **Le rapport entre les
deux est conservé** ; seule l'horloge est accélérée.

La **durée de vie** des bouffées est calée sur ce temps de traversée. Une durée
fixe les faisait mourir avant le fond du gabarit : le nuage restait massé sur le
rejet et la nappe paraissait vide, alors qu'elle est ce que l'opérateur doit
voir se remplir.

#### Pourquoi la première version ressemblait à un jet d'eau

Trois causes, toutes corrigées :

- **Turbulence en phase.** Toutes les particules partageaient la même sinusoïde
  et ondulaient ensemble — un filet, pas un gaz. Chacune a désormais deux
  fréquences décalées par sa graine, appliquées à des axes différents.
- **Taille constante.** Une bouffée qui ne grossit pas se lit comme un objet qui
  s'éloigne. Le rayon **quadruple** maintenant sur la vie de la particule : un
  gaz se dilate.
- **Bord trop net.** L'exposant de l'atténuation radiale est passé de 1,9 à 2,6,
  et l'opacité par bouffée a baissé — la densité vient de la **superposition**,
  et c'est elle qui donne le grain d'un nuage.

#### Couleurs principales et dérivées

Le nuanceur interpole du **cœur** vers la **traîne** selon l'âge : le cœur porte
la gravité de la zone, la traîne dit la dilution.

| Zone | Principale | Dérivée |
|---|---|---|
| Protection (sous le vent) | orange `#F97316` | crème `#FED7AA` |
| Vigilance (vent faible) | jaune `#EAB308` | ivoire `#FEF3C7` |
| Enveloppe prudente | rouge `#DC2626` | rose `#FCA5A5` |

C'est la même information que la teinte du gabarit, rendue **continue**.

#### Opacités réduites

Le remplissage plat passe à 0,05 sous la fumée (0,18 sans), et la **nappe
volumique 3D de 0,45 à 0,14** : à sa valeur d'origine elle dominait l'image dès
que la caméra s'inclinait. C'est la fumée qui doit porter le volume — par la
superposition des bouffées, pas par un aplat.

### 20.7 Le nuage disparaissait pendant la lecture (N-4c)

Trois défauts, dont deux de ma part.

#### La taille des bouffées ne suivait pas l'échelle

La taille était calée sur une courbe de zoom arbitraire : environ 10 px à zoom
11,5. Or la caméra de lecture **zoome à 11,5 et incline à 60°** ; le gabarit
occupait alors tout l'écran, et trois mille grains de 10 px éparpillés sur une
nappe de 400 px ne se voyaient pas. **Le nuage semblait éteint alors qu'il
tournait.**

La taille suit désormais l'**emprise du gabarit à l'écran** : une unité mercator
vaut 512 × 2^zoom pixels, la bouffée en fait un dixième. La nappe se couvre à
toute échelle — d'un périmètre de 300 m à un panache de 10 km.

#### Les bouffées débordaient du périmètre

Leur CENTRE était confiné, pas leur DISQUE — large de plusieurs dizaines de
pixels, et **quadruplant avec l'âge**. La promesse du lot était qu'elles ne
sortent jamais.

Quatre sondes par bouffée, au rayon RÉEL du disque (même formule d'âge que le
nuanceur), fixent son opacité : chaque sonde hors gabarit en retire un quart.
La bouffée **s'éteint** en approchant du bord au lieu de le franchir à moitié.
Une première version employait un rayon fixe — elle laissait déborder les
vieilles bouffées, c'est-à-dire les plus grandes, donc les plus visibles.

#### La nappe volumique était trop effacée

Ramenée de 0,45 à 0,14 au lot précédent, elle ne se voyait plus. Elle porte
pourtant une information que des bouffées à plat ne rendent pas : la **hauteur**
du nuage — un gaz dense rampe, un gaz léger monte. Rétablie à 0,32 sous la
fumée : retenue pour ne pas l'écraser, pas effacée.

### 20.8 Pourquoi le cône n'est pas là au début de l'animation

**Ce n'est pas un défaut, c'est la doctrine.** L'ATP-45 ne trace de zone
directionnelle qu'au-dessus de **10 km/h** : en deçà, le vent est jugé trop
faible ou trop variable pour désigner un secteur, et le gabarit devient un
**cercle de vigilance** omnidirectionnel.

Sur l'incident de démonstration, le vent monte de 4 à 15 km/h sur les six
échéances : la lecture commence donc en cercle et le cône apparaît à H+4. Le
changement de forme en cours d'animation est le modèle qui parle.

Ce que ce lot corrige, c'est l'**incohérence** qui l'accompagnait : la fumée
partait sous le vent même dans le cercle de vigilance, n'en occupant qu'une
moitié — une lecture qui contredisait le gabarit qu'elle habite. Elle s'y étend
désormais **radialement**, et remplit le cercle. C'est bien ce que « dérive
possible dans toutes les directions » veut dire.

*(Pour une forme directionnelle continue sur les six échéances, le gabarit
**ERG** convient : son carré sous le vent existe à chaque pas, quel que soit le
vent. Il suffit de le passer en référentiel primaire.)*

### 20.6 Le cône par vent faible (lot N-4e)

**La demande.** Garder le cône de diffusion même sous 15 km/h.

**Ce qui s'y opposait.** L'ATP-45 refuse de désigner un secteur en dessous de
10 km/h : la direction y est trop instable, et la zone doctrinale devient un
cercle omnidirectionnel de 10 km. Déplacer le seuil à 15 aurait été réécrire la
doctrine dans le code — et un état-major pourrait poser une évacuation du
mauvais côté sur la foi d'un cône que la norme ne garantit pas.

**Ce qui a été fait à la place.** Le cône est émis à TOUTE vitesse, **en plus**
du cercle et jamais à sa place :

| Vent | Zones émises |
|---|---|
| Direction inconnue | cercle de danger seul |
| ≤ 10 km/h | danger + **vigilance (cercle)** + **nappe d'axe**, marquée `lowWind` |
| > 10 km/h | danger + nappe ATP-45 |

**L'ouverture porte l'incertitude** : 30° de demi-angle au seuil, jusqu'à 75° par
vent quasi nul. C'est la façon honnête de dire *« voici l'axe, et voici combien
j'en doute »* — une nappe étroite par vent nul affirmerait une direction que le
modèle refuse d'affirmer.

**Le rendu la distingue** : contour tireté, aucun remplissage propre. Elle dit la
direction la plus probable, elle n'est pas un périmètre à poser. La bascule
« Zone de vigilance » (N-4d) permet de retirer le cercle pour travailler sur le
seul axe — c'est un acte explicite de l'opérateur, pas un défaut du modèle.

La question du seuil 10 contre 15 devient sans objet : le cône est là à toute
vitesse, et c'est le cercle qui reste ou s'en va.

## 21. Ce qui reste à construire

Le workflow est posé ; ces maillons le compléteront (voir le plan d'exécution) :

| Lot | Ce qu'il ferme |
| --- | --- |

**Limite connue.** Le dépôt en mémoire ne connaît pas les transactions : la
cascade de suppression d'incident (annulation des boucles puis purge) n'est pas
atomique tant que PostgreSQL n'est pas branché.
