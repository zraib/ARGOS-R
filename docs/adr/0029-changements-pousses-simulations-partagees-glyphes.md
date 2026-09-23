# ADR 0029 — Ce que tout le monde voit bouger : changements poussés en temps réel, simulations partagées, glyphes de la carte

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-23
- **Complète :** ADR 0020 (la carte de tous), ADR 0024 (croquis partagés), ADR 0027 (unités et
  terrain visibles de tous), ADR 0010/0011/0025 (simulateurs), ADR 0015 (abris sur la carte).
- **Portée :** `apps/api/src/modules/domain/http/{domain-change.interceptor,simulations}.ts`,
  `domain.service.ts`, `domain.types.ts`, `dto.ts`, `incident-types.service.ts`,
  `incidents.controller.ts`, `shared/permissions.ts` + `direx.matrix.ts`
  (+ `docs/matrice-roles-direx.csv/.xlsx`) ; `apps/web` : `lib/store/slices/simulations.ts`,
  `lib/map/markers.ts`, `components/map/layers/{glyphs,shelters,morgues}.ts`,
  `app/map/_parts/SharedSims.tsx`, `components/org/AddEntityModals.tsx`,
  `app/parametres/page.tsx`.

## Contexte

Cinq constats de terrain, tous de la même famille — ce qu'un poste fait, les autres ne le
voyaient pas :

1. **Rien n'était poussé** hors des croquis, des postes de commandement, des ressources posées
   et des hôpitaux : déclarer un incident, ouvrir un sous-incident ou un incident rattaché,
   relever une victime, créer ou déplacer une unité, ouvrir un abri, déployer une morgue
   mobile — tout cela restait invisible aux autres écrans jusqu'au prochain rechargement.
2. **Une simulation ne se partageait pas.** Un opérateur lançait une crue ou un feu ; ses
   voisins n'en savaient rien.
3. **Un abri ne se créait pas.** Les chefs de PC (et les Rens) n'avaient que « voir » sur la
   ligne `shelters` : l'API refusait (403) et la modale **avalait le refus** (`if (res.error)
   return;`) — le bouton semblait ne rien faire. Même silence pour une unité ou un hôpital
   refusés.
4. **La carte ne distinguait pas ses familles** : l'unité était un carré or, l'abri et le site
   mortuaire deux pastilles rondes — impossible de les lire d'un coup d'œil, et une morgue
   mobile déployée ressemblait à tout le reste.
5. **Un type d'incident ajouté ne se corrigeait pas** (une faute de frappe restait), et ses
   pictogrammes étaient trop petits pour être choisis sur une console.

## Décision

1. **Toute écriture du domaine qui réussit pousse un événement.** Un intercepteur
   (`DomainChangeInterceptor`) habille les contrôleurs `incidents` et `resources` : POST,
   PATCH, PUT et DELETE qui aboutissent émettent `{ kind: "domain", what }` (`incidents`,
   `units`, `shelters`, `morgues` selon le chemin) ; chaque poste relit le domaine. Une
   requête refusée (403) ou en erreur ne pousse rien — on ne réveille pas les postes pour une
   écriture qui n'a pas eu lieu. Un intercepteur plutôt que vingt `emit` : les routes à venir
   sont couvertes d'office.
2. **Les simulations se partagent — le SCÉNARIO, pas les images.** `SharedSimulation`
   (nature, point de départ, réglages, auteur) rejoint le domaine ; `GET/POST/DELETE
   /simulations` et l'événement `simulations` le diffusent. Chaque poste **rejoue** le
   scénario sur son propre relief : quelques centaines d'octets échangés au lieu de dizaines
   de mégaoctets d'images, et une station hors ligne s'en accommode. Un poste qui ne calcule
   rien adopte la dernière simulation de chaque nature ; celui qui travaille garde la sienne
   et la reprend d'un geste (« Rejouer ici »). **Retirée, elle disparaît de toutes les cartes,
   calcul compris** — par son auteur ou le Super Administrateur, comme un croquis (ADR 0024).
   Une même nature ne garde qu'une simulation par auteur : republier remplace la sienne.
3. **Ouvrir un abri revient aux chefs, aux OPS, aux LOG et aux Rens** — profil direx : `AMV`
   pour les chefs et les Rens (ouvrir et tenir), `FULL` conservé pour les OPS, les LOG et
   l'Anim ; profil classique : `AMV` pour l'OPCOM, le TACOM, les chefs de PCO et de PCT et les
   trois cellules. La **fermeture définitive** reste au Super Administrateur et à
   l'administration. Un abri s'ouvre dans l'urgence, là où le commandement est.
4. **Un refus se DIT.** Les modales de création (unité, hôpital, abri) affichent le message de
   l'API (`apiErrorMessage`, partagé) au lieu de retourner en silence.
5. **Chaque famille porte son glyphe** (marqueurs DOM, pas de serveur de glyphes requis) :
   l'unité un **bouclier** teinté par son corps (FAR or, gendarmerie bleu nuit, DGSN bleu,
   DGPC orange, FA vert) ; l'abri une **tente** de la couleur de son remplissage ; le site
   mortuaire une **plaque** ardoise ; la morgue mobile déployée la même plaque **sur des
   roues**, en ambre — elle se déploie et se lit sur la carte comme une morgue, sans se
   confondre avec elle. Le nom au survol, la fiche au clic, l'anneau d'or sur la sélection.
6. **Un type d'incident ajouté se modifie** (`PATCH /incident-types/:id` — libellés et icône ;
   l'identifiant est figé, des incidents le portent ; un type fourni d'origine répond 409), et
   les pictogrammes sont **agrandis** (liste 26 px, grille de choix 28 px en cases plus larges).

## Conséquences

- Un poste qui regarde la carte voit arriver, sans rien faire : les incidents et leurs
  rattachements, les unités, les abris, les morgues mobiles, les croquis — et la simulation
  qu'un autre vient de lancer.
- Le coût d'une simulation partagée est un calcul par poste (quelques secondes à quelques
  dizaines de secondes) : c'est le prix de l'autonomie hors ligne, et il évite de pousser des
  images à travers le réseau de la station.
- Tests : API `everyone-sees-changes.spec.ts` (événement poussé sur chaque écriture, aucun sur
  un refus ; simulation publiée, servie à tous, retirée par l'auteur ou le Super
  Administrateur, 403 pour un tiers ; abri ouvert par chefs / OPS / LOG / Rens, 403 pour la
  synthèse ; type ajouté modifié, type d'origine 409, type inconnu 404) ; web
  `markers.test.ts` (les quatre glyphes, l'échappement du nom, l'anneau de sélection).
- Vérifié navigateur (dev, mode Direx) : Chef / PCT ouvre « Abri du Chef PCT » (position
  d'Amizmiz portée, toast de confirmation) — c'est le cas qui échouait en silence ; la carte
  montre les quatre glyphes distincts ; une simulation publiée par un autre compte est
  rejouée seule sur ce poste (121 images, 4,8 km²) et son retrait depuis l'autre poste efface
  le calcul ici ; un type ajouté se renomme et change d'icône, son identifiant reste figé.
