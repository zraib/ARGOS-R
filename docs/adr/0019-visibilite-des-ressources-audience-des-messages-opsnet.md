# ADR 0019 — Ressources visibles par qui elles concernent, messages poussés à leur audience, OPSnet modifiable

- **Statut :** accepté
- **Date :** 2026-09-17
- **Portée :** `apps/api/src/modules/domain/visibility.service.ts` (`canSeeResourceOwner`),
  `domain.service.ts` (`resourceOwnersOnIncident`, organe des abris), `http/resources-registry.controller.ts`
  (portée sur chaque lecture et écriture, `GET /resources/owners`), `comms.service.ts` (`audienceOf`),
  `http/comms.controller.ts` (messages poussés à l'audience), `shelter.rules.ts` (`SHELTER_ORGANS`),
  `dto.ts` (`organ`, `UpdateShelterDto` complet) ; côté web `app/opsnet/page.tsx` (organe sur les tuiles,
  Modifier), `components/org/EditEntityModals.tsx`, `components/org/AddEntityModals.tsx` (organe),
  `lib/mode.ts`, `components/resources/ResourcesScreen.tsx` (détenteurs servis par l'API).
- **Révise :** l'ADR 0016 (le registre des ressources était lisible en entier par qui avait
  `resources:view`), le lot COMMS (les messages traversaient le fil de tous).

## Contexte

Retours du propriétaire du produit sur la station : (1) OPSnet ne permettait pas de modifier une
unité ou un abri ; (2) l'organe d'origine (le corps d'une unité, l'organisme qui tient un abri) ne
se lisait pas sur les tuiles ; (3) les notifications de messages arrivaient chez tout le monde,
pas seulement chez le correspondant ; (4) l'écran Ressources laissait tout compte lire les
ressources de toutes les entités.

## Décision

1. **Visibilité des ressources par la doctrine de portée.** La portée du compte (`scopeOf`) dit
   quels détenteurs il lit : global → tous ; région → sa région ; incident → en opérationnel, les
   détenteurs engagés sur son opération (unités affectées ou intervenantes, hôpitaux intervenants,
   abris posés sur la carte), en démonstration et en exercice tous (on joue le scénario avec ce
   qu'on y crée) ; entité → la sienne, plus l'opération où il est déployé ; le responsable de parc
   voit l'unité de son parc. Appliquée à `GET /resources` (registre filtré), à toute lecture ou
   écriture d'un détenteur (**404** hors portée, sans révéler l'existence), au terrain
   (`/resources/placed`) et à `GET /resources/owners`, que l'écran Ressources utilise pour ne
   proposer que ce que le compte voit.

2. **Un message est poussé à son audience.** `audienceOf(channel)` : les membres d'un canal
   restreint ou direct ; `null` pour un canal ouvert, qui se diffuse à tous. La cloche, le rappel
   sonore et les badges ne comptent donc que ce qui concerne le compte.

3. **OPSnet : Modifier, et l'organe d'origine.** Chaque tuile d'unité montre son corps (FAR,
   Gendarmerie Royale, DGSN, DGPC, FA) ; chaque tuile d'abri son organe (`organ` :
   Protection civile, FAR, FA, commune, Croissant-Rouge, Entraide nationale, Éducation, Santé,
   autre) — saisi à l'ouverture et modifiable. Un bouton *Modifier* ouvre une modale complète
   (identité, corps ou organe, typologie, chiffres) ; il n'est proposé qu'à qui l'API l'accorde
   (`lib/mode.ts`, miroir de `mode.rules.ts` et de la portée des abris), l'API restant l'autorité
   (`units:update` + mode, `shelters:update` + `@RequireScope`). `UpdateShelterDto` accepte
   désormais le nom, la commune, la typologie et l'organe.

## Conséquences

- Un test existant change de verdict : un responsable qui écrit sur l'unité d'un autre reçoit
  404 (elle n'existe pas pour lui) et non plus 403.
- Les abris enregistrés avant portent `organ` absent : la tuile n'affiche rien tant qu'on ne
  l'a pas saisi.
- Contrat OpenAPI : `GET /resources/owners`, `organ` des abris, `UpdateShelterDto` ; client et
  `docs/03-api.md` régénérés.
- Tests : `modules/domain/resources-visibility.spec.ts` (portées, 404, registre, terrain,
  détenteurs, audience des messages) ; `command-chain.spec.ts` ajusté.
