# ADR 0033 — Une mise à jour de la station ne touche à rien : les données de la station font foi

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** ADR 0027 (comptes et parc conservés à la mise à jour), ADR 0015 (profil de
  données), le guide `deploy/MISE-A-JOUR-STATION.md`.
- **Portée :** `apps/api/src/common/dev-store.ts`, `common/snapshot-flusher.ts`, `main.ts`,
  `modules/domain/domain.service.ts`, `profile.rules.ts`, `resources.service.ts`,
  `modules/iam/users.service.ts`, `modules/orders/infrastructure/in-memory-order.repository.ts` ;
  `deploy/scripts/census.js`, `deploy/scripts/upgrade.ps1`.

## Contexte

Demande du 23 septembre 2026 : « la mise à jour de la version hors ligne ne touche à rien — ni
les messages déjà échangés, ni les incidents, les zones, les unités, les hôpitaux, les morgues :
tout doit rester intact ». L'audit du démarrage de l'API a trouvé cinq endroits où une mise à
jour — ou un simple redémarrage — pouvait modifier ou perdre des données :

1. **Montée de version du jeu de départ** (`DOMAIN_SEED_VERSION`) : le réseau hospitalier, les
   hôpitaux de campagne, les services, les abris, les sites mortuaires et leurs dossiers étaient
   **remplacés** par ceux du code ; les incidents et unités de démonstration reconstruits ; des
   morgues et articles de démonstration ajoutés. (La version n'a pas bougé depuis le 31 août :
   aucune station n'a été touchée, mais rien ne l'empêchait.)
2. **Bons de travail** : même mécanisme, sur leur propre version.
3. **Ressources** : au démarrage, les personnes, équipes, véhicules et vivres dont le détenteur
   était introuvable étaient **supprimés** définitivement — un instantané du domaine relu de
   travers aurait emporté toutes les ressources.
4. **Compte fondateur** : son matricule et son identité étaient réécrits si son téléphone était
   vide.
5. **Instantanés** : écriture non atomique (un fichier coupé en pleine écriture devient
   illisible), et un instantané illisible était **silencieusement** remplacé par les données de
   départ, puis réécrit par-dessus.

## Décision

1. **Les données de la station font foi.** Dès qu'un instantané existe, toutes les collections
   sont reprises telles quelles, **quelle que soit** la version du jeu de départ : aucune
   reconstruction, aucun remplacement, aucun ajout. Le jeu de départ ne s'applique qu'à une
   station **neuve** (sans instantané), ou sur un geste **explicite** de l'administrateur
   (changement de profil de données, remise à zéro). Seules restent les complétions de format,
   qui ne réécrivent aucune valeur renseignée (champs absents des anciens instantanés,
   identifiants des hôpitaux de campagne).
2. **Rien n'est retiré au démarrage** : les ressources orphelines restent au registre ; seule la
   suppression explicite d'une entité emporte ses ressources.
3. **Aucun compte n'est retouché** au démarrage : la réécriture de l'identité du fondateur est
   supprimée.
4. **Instantanés sûrs** : écriture atomique (fichier temporaire, l'ancien gardé en
   `<nom>.json.bak`, puis renommage) ; à la lecture, l'instantané, sinon sa copie de secours ; un
   fichier illisible est **mis de côté** (`<nom>.json.illisible-<horodatage>`), jamais écrasé. À
   l'arrêt (docker stop, mise à jour), les écritures différées sont vidées puis le processus sort
   aussitôt — l'arrêt « gracieux » de Nest attendait la fin des flux temps réel, qui ne finissent
   jamais : le processus restait en vie sans plus écouter.
5. **La mise à jour se vérifie elle-même** : `upgrade.ps1` recense les données du volume
   `iris_api_data` (en lecture seule, avec l'image de l'API, sans compte ni réseau —
   `census.js`) une fois l'ancienne pile arrêtée, puis une fois la nouvelle démarrée : incidents,
   sous-incidents, actions entreprises, victimes, unités, hôpitaux, abris, morgues, dossiers,
   zones et croquis, canaux, messages, pièces jointes, comptes, missions, ressources… Toute
   collection en baisse est signalée en rouge, avec la marche à suivre pour revenir en arrière.

## Conséquences

- Un nouveau jeu de démonstration ou une mise à jour du référentiel hospitalier du code ne
  s'applique plus aux stations existantes : c'est voulu. Pour les en faire profiter, il faudra un
  geste explicite (import) — à décider le jour où le besoin se présentera.
- Tests : `common/upgrade-preservation.spec.ts` (écriture atomique et copie de secours ; fichier
  illisible mis de côté ; instantané d'une version antérieure — hôpital renommé, abri ouvert,
  site retiré, incident et unité corrigés, zone dessinée — relu à l'identique ; le même test
  échoue sur le code précédent) ; `registry-update.spec.ts` (le parc repris tel quel, rien
  d'ajouté).
- Vérifié : le recensement sur la pile hors ligne locale ; la comparaison (perte de messages
  détectée) exécutée sous PowerShell ; l'API sort en 0,8 s au SIGTERM avec 8 connexions ouvertes,
  le mode watch la remplace en 2 s.
