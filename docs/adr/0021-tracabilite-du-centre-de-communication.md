# ADR 0021 — Traçabilité du centre de communication : canal au titre de l'incident, conversations conservées, archives, export et import

- **Statut :** accepté
- **Date :** 2026-09-18
- **Portée :** `apps/api/src/modules/domain/comms.service.ts` (instantané `comms` du dev-store, `at` sur
  chaque message, `uniqueChannelTitle`, `renameIncidentChannel`, `archiveChannel*`, `exportChannels`,
  `importDocument`), `http/comms.controller.ts` (`POST comms/channels/:id/archive|unarchive`,
  `GET comms/channels/:id/export`, `GET comms/export`, `POST comms/import`), `http/incidents.controller.ts`
  (`PATCH incidents/:id` : le canal suit le titre et l'archivage), `dto.ts` (`ImportCommsDto`,
  `ImportedChannelDto`, `ImportedMessageDto`) ; côté web `app/communication/page.tsx` (section
  « Archives », bandeau, actions archiver/rouvrir/exporter/importer), `lib/comms/archives.ts`,
  `lib/types.ts`, `lib/api-client/index.ts`.
- **Révise :** le lot G1 (canal d'incident nommé d'un identifiant dérivé du titre) ; le lot COMMS
  (centre purement en mémoire).

## Contexte

Retours du propriétaire du produit : à la déclaration d'un incident, le canal créé portait un
identifiant dérivé (« crues-de-l-oued-ourika ») et non le titre saisi ; le centre de communication
ne gardait aucune trace — toute conversation disparaissait au redémarrage de l'API ; il n'existait
ni archivage de l'historique, ni moyen de l'exporter ou de le reprendre sur une autre station.

## Décision

1. **Le canal d'une opération porte son titre, tel quel.** « Crue de l'oued Ourika », avec ses
   accents, ses majuscules et sa ponctuation (80 caractères au plus) — c'est ainsi que l'opération
   se nomme partout ailleurs. Deux opérations de même titre : la seconde reçoit le numéro de sa
   référence entre parenthèses (« Feu de forêt (2702) »). L'identifiant technique reste dérivé de la
   référence (`c-inc-2623`) et la référence reste dans le sujet. Le canal **suit l'opération** : renommé
   quand son titre change, archivé quand elle est archivée, rouvert avec elle.

2. **Les conversations sont conservées.** Le centre (groupes, canaux, messages, compteur) est
   inscrit dans l'instantané `comms` du dev-store à chaque écriture et relu au démarrage — au même
   titre que les incidents et les ressources. Chaque message porte désormais son horodatage ISO
   complet (`at`) à côté de l'heure affichée (`time`).

3. **Archiver, c'est conserver.** Un canal archivé reste servi à ceux qui le voyaient, avec toute sa
   conversation, sous une section « Archives » en fin de liste ; il n'accepte plus de message
   (403 « Canal archivé : il se lit, il ne s'écrit plus. ») ; il se rouvre. L'archivage est un acte
   d'administration (`comms_admin:update`), audité, daté et signé (`archivedAt`, `archivedBy`). Une
   conversation directe ne s'archive pas : elle appartient à ses deux correspondants.

4. **L'export est un document.** `GET comms/channels/:id/export` (`comms:view` ; une conversation
   directe ne sort que pour ses correspondants) et `GET comms/export` (`comms_admin:view`, tout le
   centre) rendent un JSON `iris-comms/1` daté et signé : chaque canal avec son groupe, ses membres,
   son incident, et ses messages avec auteur (matricule et nom), texte, horodatage et fiche de pièce
   jointe. Le navigateur le fait télécharger sous « iris-comms-<canal>-<jour>.json ».

5. **L'import reprend en archives, sans fusionner.** `POST comms/import` (`comms_admin:create`, audité)
   valide le document (`ImportCommsDto`, refus 400 sinon) et crée, pour chaque canal, un canal
   **archivé** dans le groupe « ARCHIVES IMPORTÉES », nommé « <nom> (<jour de l'export>) », portant
   d'où il vient (`imported {from, originalId, category, at, by}`), avec ses messages sous de nouveaux
   identifiants, leurs auteurs et horodatages conservés, à personne (`mine: false`). Rien n'entre dans
   un canal en cours ; un canal déjà repris du même export est sauté (idempotent) ; une conversation
   directe importée reste réservée à ses deux correspondants.

6. **Côté web.** La liste ne montre que les canaux vivants ; les archives se rangent dans une
   section dédiée (groupe d'origine en info-bulle) ; un canal archivé affiche un bandeau (par qui,
   quand, d'où) et ses messages avec la date ; sa saisie disparaît. Chacun exporte la conversation
   qu'il lit ; l'administration archive, rouvre, exporte tout et importe (bouton dans l'en-tête de la
   liste ; un fichier qui n'est pas un export est refusé avant envoi). Les fenêtres flottantes
   ignorent les conversations archivées.

## Conséquences

- Contrat OpenAPI : cinq routes, trois DTO, champs `archivedAt`, `archivedBy`, `imported`, `at` ;
  client et `docs/03-api.md` régénérés.
- La persistance est celle du dev-store (fichier `comms.json` du volume de l'API, sauvegardé avec
  lui par `backup.ps1`) — jusqu'au passage du domaine sur PostgreSQL. Les messages d'avant ce lot
  n'ont pas de `at` : l'archive les affiche avec leur heure seule.
- Seule la **fiche** d'une pièce jointe voyage dans l'export, pas son contenu : sur une autre
  station, la pièce d'un message importé n'est pas consultable.
- Le fichier d'export n'est pas chiffré : il se garde comme tout document opérationnel.
- Tests : `modules/domain/comms.spec.ts` (titre tel quel et suffixe, suivi du titre, archivage,
  export, import, direct réservé), `modules/realtime/comms-archive.spec.ts` (routes, gardes,
  incident → canal renommé/archivé/rouvert, import idempotent, refus 400) ; web
  `lib/comms/archives.test.ts`.
