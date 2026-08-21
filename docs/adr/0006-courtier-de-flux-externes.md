# ADR 0006 — Courtier de flux externes : séparer ARGOS de ses fournisseurs

- **Statut :** proposé
- **Date :** 2026-08-21
- **Portée :** nouveau service `apps/broker` ; adaptateurs sortants de
  `apps/api` (`aviation`, `seismic`, `weather`) ; CSP et fond de carte de
  `apps/web` ; `infra/compose`

## Contexte

L'inventaire des appels sortants du 21/08/2026 donne une image nette, et elle
n'est pas celle qu'on attendait.

**Côté serveur, la séparation existe déjà.** Trois fournisseurs externes sont
appelés depuis `apps/api`, jamais depuis le navigateur : OpenSky (ADS-B), EMSC
(sismologie), Open-Meteo (météo). Ce qui manque n'est pas une frontière, c'est
son **uniformité** : seul le suivi aérien est isolé derrière un port
(ADR 0004) ; la sismologie et la météo sont câblées dans leur service.

**Côté navigateur, il n'y a aucune frontière.** Le poste de commandement parle
directement à :

| Destination | Nature | Ce qui sort |
| --- | --- | --- |
| `server.arcgisonline.com` | Esri (commercial, US) | imagerie satellite : chaque zone regardée |
| `s3.amazonaws.com` | AWS | tuiles d'élévation : idem |
| `tile.openstreetmap.org` | OSM | fond de plan : idem |
| `router.project-osrm.org` | **serveur de démonstration public** | **coordonnées réelles des incidents** |
| `127.0.0.1:11434` | Ollama local | requêtes de l'assistant |

Le risque dominant n'est pas le contenu, c'est le **profil d'activité** : la
seule séquence des requêtes de tuiles indique quelle région l'état-major
observe, à quelle heure et avec quelle intensité. Aucune donnée classifiée n'a
besoin de transiter pour que le renseignement soit exploitable. Le calcul
d'itinéraire, lui, transmet des coordonnées d'incident en clair à un serveur de
démonstration public.

Deux constats aggravants :

1. **Aucune CSP n'est configurée**, alors que le `MASTER_PLAN.md` §4.3 et le
   `CLAUDE.md` l'exigent explicitement. Rien n'empêche donc, aujourd'hui,
   qu'un nouvel appel direct soit ajouté sans que personne ne le voie.
2. `apps/web/src/lib/map/routing.ts` **documente lui-même** qu'OSRM public est
   « à NE PAS utiliser en production ». La dette est connue, pas traitée.

À l'inverse, les remplaçants souverains sont **déjà provisionnés** dans
`infra/compose` — `martin` (tuiles) et `valhalla` (routage) — mais ne sont pas
le défaut.

Quatre moteurs ont été confirmés pour cette décision : souveraineté et
anti-fuite, **zonage réseau et homologation**, **plusieurs applications
clientes** à venir, et découplage des fournisseurs. Les deux moteurs en gras
sont ceux qui font basculer la décision vers un processus séparé : sans eux,
consolider dans `apps/api` suffirait.

## Décision

### 1. Un service séparé : `apps/broker`

Un **courtier de flux externes** est extrait en service autonome (NestJS, même
pile et mêmes conventions que `apps/api`), déployable dans une **zone réseau
distincte** de l'enclave où tourne ARGOS. Il devient le **seul processus du
système autorisé à ouvrir une connexion sortante**.

Cette contrainte est ce qui rend l'homologation possible : un point de sortie
unique se journalise, se quota, s'inspecte et se coupe. Réparti sur trois
services, l'egress n'est ni auditable ni maîtrisable.

### 2. Le courtier n'est PAS un proxy transparent

C'est le cœur de la décision, et sa seule justification sécuritaire réelle.
Relayer les requêtes une à une changerait l'adresse IP source **sans supprimer
la fuite** : le fournisseur observerait le même profil d'activité, à la même
cadence. Le trafic est donc partagé en deux classes, traitées différemment :

**Classe A — moisson en masse, découplée dans le temps.** Le courtier récupère
des jeux de données **publics et non ciblés** selon son propre calendrier
(grille météo nationale, événements sismiques, emprise ADS-B nationale) et les
sert depuis son magasin local. Une requête d'ARGOS ne déclenche **jamais** un
appel fournisseur : la corrélation entre l'activité opérationnelle et le trafic
sortant est rompue par construction. `apps/api` applique déjà cette logique
pour la grille météo — c'est le bon réflexe, il est ici généralisé et déplacé.

**Classe B — interrogation portant sur un point opérationnel.** Itinéraires,
géocodage, panache NRBC : ces requêtes **portent la position d'un incident** et
ne franchissent **jamais** la frontière. Elles sont servies localement par
`valhalla`, `martin` et le moteur NRBC. Le courtier **refuse de les relayer** —
c'est une règle de conception, pas une option de configuration.

Un flux nouveau doit être classé A ou B avant d'être branché. En cas de doute,
il est de classe B.

### 3. Ce que le courtier absorbe

Les mécanismes déjà écrits *ad hoc* dans `apps/api` y sont regroupés — il
s'agit d'une consolidation, pas de code nouveau :

- **cache et TTL** par flux (aujourd'hui dans `weather.service.ts`) ;
- **refroidissement après échec** (le 429 en chaîne d'Open-Meteo) ;
- **étalement des lots** pour respecter les plafonds fournisseur ;
- **persistance du dernier état connu**, pour servir en mode dégradé ;
- **journal d'egress** : horodatage, fournisseur, volume, motif — pièce du
  dossier d'homologation ;
- **quotas par application cliente**, quand elles seront plusieurs.

### 4. ARGOS garde ses ports ; seuls les adaptateurs changent

Le patron de l'ADR 0004 est généralisé : `seismic` et `weather` passent
derrière un port, comme `aviation`. Les services applicatifs ne bougent pas.
L'adaptateur cesse de viser le fournisseur et vise le courtier — un fichier par
flux. Passer en air-gap, changer de fournisseur ou basculer sur une source
nationale reste **une ligne dans le module**.

### 5. Contrat d'abord, comme pour `apps/api`

Le courtier publie son propre OpenAPI ; ARGOS et les futures applications
n'en consomment que le client généré. Aucun `fetch` écrit à la main, même entre
services internes.

### 6. La CSP est le mécanisme d'application

`connect-src 'self'` et `img-src 'self'` rendent l'appel direct **impossible**
au lieu de simplement déconseillé. Sans elle, tout ce qui précède est une
convention que le prochain commit peut contourner sans bruit.

### 7. Phasage — la sécurité d'abord, l'architecture ensuite

L'ordre n'est pas négociable : la **phase 1 supprime l'exposition et ne dépend
pas du courtier**. On ne fait pas attendre la fermeture d'une fuite le temps de
construire un service.

1. **CSP stricte + `martin` et `valhalla` par défaut.** Les appels directs du
   navigateur cessent. Aucun service nouveau.
2. **Ports pour `seismic` et `weather`.** Uniformité avec l'aviation ; aucun
   changement de comportement.
3. **Extraction de `apps/broker`.** Les adaptateurs visent le courtier ; les
   mécanismes de cache et de quota y déménagent.
4. **Durcissement multi-client.** Quotas par consommateur, journal d'egress
   exploitable pour l'homologation.

## Conséquences

**Positives**

- Un **point de sortie unique**, journalisable et coupable — condition
  nécessaire à l'homologation en zone classifiée.
- La corrélation entre activité opérationnelle et trafic sortant est **rompue
  par construction** (classe A), pas seulement masquée.
- Les coordonnées d'incident **ne sortent plus jamais** (classe B).
- Les mécanismes de cache, quota et repli cessent d'être dupliqués par flux.
- Une seconde application cliente ne re-négocie pas l'accès aux fournisseurs.

**Négatives — assumées**

- **Une unité de déploiement de plus** à surveiller, patcher et homologuer.
- **Un mode de panne nouveau** : courtier indisponible = flux externes figés.
  Atténuation : ARGOS sert le dernier état connu, comportement déjà en place
  dans `weather.service.ts` — mais la fraîcheur des données se dégrade en
  silence si la supervision est faible.
- **Deux contrats OpenAPI** à tenir : une évolution de schéma touche désormais
  deux clients générés.
- **Un saut réseau supplémentaire.** Négligeable sur des données de classe A
  servies depuis le magasin du courtier, réel malgré tout.
- Le courtier devient une **cible de valeur** : concentrer l'egress concentre
  aussi le risque. Il doit être le composant le plus durci du système.
- **`npm run dev` démarre trois processus** au lieu de deux.

## Alternatives écartées

**Proxy HTTP transparent (Squid, nginx).** Le moins cher, et le plus trompeur :
il change l'IP source sans changer le profil d'activité, donc **la fuite de
pattern-of-life subsiste intégralement**. Il n'offre en outre aucun contrat, ce
qui contredit la règle du contrat-first. Écarté — il donnerait l'illusion du
traitement.

**Passerelle API du commerce (Kong, Tyk).** Lourde, et c'est une dépendance
runtime externe qui exigerait à elle seule un ADR (§4.3). L'essentiel de ses
fonctions — authentification, autorisation, quotas par consommateur — duplique
Keycloak et les gardes déjà en place. Écartée.

**Tout consolider dans `apps/api`.** C'était la recommandation initiale, et
elle resterait la bonne sans les moteurs « zonage réseau » et « multi-client » :
`apps/api` est déjà le seul point de sortie côté serveur, et un service de plus
n'aurait acheté qu'un saut réseau. Ces deux moteurs étant confirmés, l'option
est écartée — un composant à déployer en DMZ ne peut pas être le même processus
que celui qui sert l'enclave.

**Ne rien faire côté navigateur.** Écartée sans discussion : c'est la seule
frontière du système qui fuit aujourd'hui.
