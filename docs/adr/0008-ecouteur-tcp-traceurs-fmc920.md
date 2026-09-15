# ADR 0008 — Traceurs FMC920 : ARGOS est le serveur du boîtier

- **Statut :** accepté — lot N-2 livré (registre, écouteur, ingestion)
- **Date :** 2026-09-01
- **Révisé le 2026-09-15 :** deux sources de positions — le boîtier (inchangé)
  et le **partage de position par l'application** ; l'incident d'engagement se
  choisit par son nom ; le registre survit aux redémarrages.
- **Portée :** nouveau module `apps/api/src/modules/tracking` ; second port en
  écoute à côté du serveur HTTP ; ligne `tracking` de la matrice de permissions

## Contexte

L'état-major veut voir sur la carte les moyens qu'il engage : ambulances,
véhicules de commandement, détachements. Le boîtier retenu est le **Teltonika
FMC920** — 4G Cat M1 / NB-IoT, GNSS, batterie interne.

Ce boîtier ne parle pas HTTP. Il ouvre une connexion **TCP** vers une adresse
et un port configurés dans son firmware, présente son **IMEI**, puis pousse des
paquets **Codec 8** ou **Codec 8 Extended**. Le serveur accuse chaque paquet par
le nombre d'enregistrements acceptés ; ce que le serveur n'accuse pas, le
boîtier le retransmet.

Le MASTER_PLAN §4.2 décrit une API HTTP et un courtier MQTT (EMQX). Il ne
prévoit rien pour un protocole binaire propriétaire sur TCP brut. D'où cet ADR.

## Décision

**ARGOS est lui-même le serveur des boîtiers.** Un écouteur TCP tourne à côté
du serveur HTTP, dans le même processus, et parle Codec 8 directement.

Trois conséquences assumées :

1. **Aucune plateforme tierce.** L'alternative — router par la plateforme du
   constructeur (Teltonika FOTA, Wialon, ou tout intégrateur) — ferait transiter
   *les positions en temps réel d'unités militaires marocaines* par un service
   étranger. L'ADR 0006 interdit déjà d'interroger un service tiers à
   l'exécution ; ici l'enjeu est plus lourd encore, puisque la donnée ne serait
   pas consultée à l'extérieur mais **produite vers** l'extérieur. Un flux de
   positions de moyens de secours est un renseignement d'ordre de bataille.

2. **Aucune dépendance nouvelle.** L'écouteur n'utilise que `node:net` et le
   décodeur est écrit à la main (`codec8.ts`, fonction pure). L'exigence de
   souveraineté du MASTER_PLAN §4.3 est tenue sans exception à demander.

3. **Le registre EST la liste blanche.** Le protocole Teltonika ne porte ni
   secret partagé, ni certificat, ni horodatage signé : **l'IMEI est la seule
   identité présentée**, et il est imprimé sous le boîtier. Un traceur doit donc
   être déclaré dans ARGOS *avant* d'être admis ; un IMEI inconnu est refusé à
   la poignée de main. Déclarer un traceur n'est pas un rangement d'inventaire,
   c'est l'acte qui autorise un boîtier à écrire dans la carte de l'état-major
   — la matrice traite `tracking:create` en conséquence.

## Ce que cette décision N'apporte PAS

À écrire ici parce que c'est ici qu'on l'oublie.

**L'authentification par IMEI n'est pas une authentification.** Un IMEI se lit
sous le boîtier, se devine mal mais se rejoue parfaitement. Quiconque atteint le
port et connaît un IMEI déclaré peut injecter une position arbitraire. La liste
blanche réduit la surface ; elle ne la ferme pas.

**Le confinement réseau est donc obligatoire, pas recommandé.** Le port doit
être atteint par l'APN privé de l'opérateur mobile ou par un tunnel, jamais
depuis l'Internet public. L'écouteur est **éteint par défaut** et se lie au
**bouclage** en l'absence de réglage explicite : il faut vouloir s'exposer, non
s'y trouver faute d'avoir choisi.

**Ce qui reste à faire**, et qui n'est pas dans ce lot :

- chiffrement du transport (le FMC920 sait faire du TLS sur certains firmwares —
  à vérifier sur le parc réel avant de s'y fier) ;
- persistance des positions en hypertable TimescaleDB — aujourd'hui la trace
  vit en mémoire, bornée à 240 points par traceur ;
- décodage des éléments de longueur variable du Codec 8 Extended, dont la
  **liste de balises Bluetooth (identifiant 385)**. Ces octets sont *conservés
  tels quels*, en hexadécimal, et non interprétés : leur structure interne n'est
  pas assez documentée pour être décodée sans deviner, et un décodage faux d'une
  donnée de sécurité est pire qu'un décodage absent. Rien n'est perdu ; rien
  n'est inventé. C'est par là que passeraient de futurs capteurs ou étiquettes
  BLE relayés par le boîtier.

## Alternatives écartées

**Passer par la plateforme du constructeur.** Écartée pour la raison 1
ci-dessus. Le confort d'intégration ne rachète pas l'exposition.

**Un service d'ingestion séparé poussant vers l'API en HTTP.** Ajoute un
processus, un déploiement et un secret partagé, sans rien résoudre : le
décodeur et la liste blanche seraient les mêmes, simplement ailleurs. À
reconsidérer si le parc grandit au point que l'ingestion doive être mise à
l'échelle indépendamment de l'API.

**Une route HTTP d'ingestion.** Écartée : elle permettrait à n'importe quel
compte porteur d'un jeton de faire mentir la carte sur la position d'une unité.
Les positions n'entrent que par l'écouteur, où l'IMEI est confronté au registre.

## Vérification

Le décodeur est couvert par les **trames d'exemple publiées par le
constructeur** — Codec 8 et Codec 8 Extended, CRC compris. C'est le seul ancrage
honnête : un décodeur binaire testé sur des trames que l'on a soi-même
fabriquées ne prouve que sa cohérence avec ses propres erreurs.

La chaîne complète est éprouvée par une vraie socket TCP dans
`tracking.spec.ts` : IMEI inconnu refusé, position versée et accusée,
enregistrement sans fix accusé mais non tracé, déversement de tampon remis dans
l'ordre du temps, traceur archivé refusé, trame au CRC faux rejetée sans accusé.

## Révision du 2026-09-15 — partage de position par l'application

**Demande.** Tous les moyens n'ont pas de boîtier : un chef de détachement,
un médecin, un agent en reconnaissance ont un téléphone avec IRIS. Le
propriétaire du produit veut, à côté du boîtier, l'option « partage de
position via l'application », et rattacher chaque traceur à l'incident sur
lequel il est déployé — choisi dans la liste des incidents, pas tapé.

**Ce que cette décision garde de la précédente.** L'ingestion des BOÎTIERS
reste TCP, l'IMEI reste confronté au registre, et il n'existe toujours pas de
route HTTP qui accepterait « la position de l'unité U3 » sur simple jeton.

**Ce qui s'ouvre, et dans quelle limite.** Un traceur a une `source` :
`device` (boîtier, IMEI) ou `app` (partage). Un partage est déclaré au
registre comme un boîtier (`POST tracking/trackers`, `source: "app"`,
`account` = le matricule, un seul partage par compte, clé `app:<matricule>`
à la place de l'IMEI), rattaché à un moyen et à un incident comme lui. Les
positions entrent par `POST tracking/trackers/:id/position`, ouverte à tout
compte connecté (`@SelfService`) mais dont le service vérifie que **le
partage est celui du compte appelant**, actif, et que la position est sur le
globe. Un compte ne peut donc dire que SA propre position, jamais celle d'un
moyen ; archiver le partage le ferme. `GET tracking/trackers/mine` rend le
partage du compte, pour que l'application le retrouve sans droit de lecture
sur le registre.

**Côté application.** L'écran « Traceurs GPS » propose les deux sources à la
déclaration (l'IMEI n'est demandé que pour un boîtier), le compte qui
partage (le sien par défaut), le moyen équipé et l'**incident dans une liste
par nom**. La carte « Ma position » démarre et arrête le partage de
l'appareil : géolocalisation du navigateur, une position envoyée dès que
l'appareil a bougé de 25 m ou toutes les 20 s ; l'état vit hors de l'écran,
changer de page n'arrête pas l'envoi. Une précision inférieure à 50 m vaut
« localisé » (`satellites: 1`), priorité `low`.

**Persistance.** Le registre des traceurs vivait en mémoire : un redémarrage
de l'API sur la station effaçait les boîtiers déclarés et les partages. Il
passe par l'instantané JSON commun (`tracking.json`, `common/dev-store`),
comme le domaine et les comptes.

**Conséquences négatives, assumées.** Un téléphone n'est pas un boîtier : pas
de satellites, une précision variable, un envoi qui dépend de l'application
ouverte et de l'autorisation de géolocalisation du navigateur ; la position
d'un compte reste déclarative — c'est lui qui la partage, IRIS ne peut pas
la contredire. Les gardes `@SelfService` des deux routes sont inscrites dans
la liste blanche de `authz-coverage.spec.ts`.

