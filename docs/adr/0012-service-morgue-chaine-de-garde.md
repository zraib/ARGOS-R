# ADR 0012 — Service morgue : morgues mobiles, chaîne de garde, traçabilité avec les hôpitaux

- **Statut :** accepté
- **Date :** 2026-09-15
- **Révisé le 2026-09-15 :** la morgue suit la logique des hôpitaux — un
  échelon (régionale / de ville), une région, un établissement de
  rattachement ; création d'un site comme d'un hôpital.
- **Révisé le 2026-09-15 (bis) :** le bilan des victimes de l'incident
  (victimes nommées, identification préliminaire d'un décédé, affectation à
  une morgue), la nature et le statut « plein » des sites, la fiche complète
  d'une morgue avec ses corps, l'identification complète à la morgue.
- **Portée :** `apps/api` : `domain.types.ts` (sites, chaîne de garde),
  `morgue.rules.ts`, `domain.service.ts`, routes `morgues/registry`,
  `morgues/mobile`, `morgues/:id/recall`, `morgues/:id/records/:rid/{receive,transfer}`,
  `hospitals/:id/deceased`, matrice `morgue` ; `apps/web` : page `/morgue`,
  `components/morgue/`, `lib/morgue.ts`, couche `layers/morgues.ts`, Hospinet.

## Contexte

Le registre DVI existait (sites mortuaires, dossiers sous référence
provisoire, parcours d'identification — `dvi.rules.ts`), tenu par le
responsable de chaque site depuis « Ma responsabilité ». Il manquait le
**service** : la vue d'ensemble de l'état-major sur la gestion des corps, les
**morgues mobiles** à déployer près d'un incident quand les sites saturent,
et la **traçabilité avec les hôpitaux** — un décès en établissement doit
arriver au site mortuaire sans rupture de responsabilité.

Les pratiques de référence sont celles de la gestion des corps après
catastrophe : le guide DVI d'INTERPOL et le manuel de terrain OMS / OPS /
CICR (*Management of Dead Bodies after Disasters*). Elles tiennent en
quelques règles : une **référence unique** attribuée dès la prise en charge
et jamais réattribuée ; une **chaîne de garde** — chaque changement de
responsabilité daté, signé, d'où à où ; une **réception confirmée** par
celui qui reçoit avant tout nouveau mouvement ; des capacités réfrigérées
connues et des unités mobiles déployées avant la saturation ; un dossier
restitué qui ne bouge plus.

## Décision

1. **La chaîne de garde est une donnée du dossier** (`custody[]`) : étapes
   `hospital` (décès en établissement), `transferred`, `received`,
   `released` (et `recovered` pour le terrain), chacune avec l'instant, le
   matricule qui l'acte, l'origine, la destination, une note. Elle se lit
   sur la fiche du corps comme une frise. Les dossiers antérieurs n'en ont
   pas : l'écran le dit (« admission le … ») plutôt que d'inventer.
2. **Le décès en établissement part de l'hôpital** (`POST hospitals/:id/deceased`,
   cantonné à SON établissement) : le dossier naît au site mortuaire choisi
   — le plus proche d'abord, avec ses places libres —, « réception à
   confirmer », identifié si l'identité est connue, avec `origin` (l'hôpital)
   et ses deux premières étapes. Le site **confirme la réception**
   (`receive`) ; tant qu'il ne l'a pas fait, aucun transfert n'est possible.
3. **Un transfert entre sites** (`transfer`) est le même mécanisme dans
   l'autre sens : réception à confirmer par la destination, capacité et
   ouverture de la destination vérifiées, dossier restitué intransférable.
4. **La morgue suit la logique des hôpitaux.** Un site fixe porte un
   **échelon** — *régionale* (l'institut médico-légal de la région, grand et
   équipé) ou *de ville* (la chambre mortuaire d'un établissement) —, une
   **région**, une province, et l'**établissement de rattachement**
   (`hospitalId`) dont il prend la position et dont le responsable connaît
   « sa » morgue. Un site se **crée comme un hôpital** (`POST morgues` :
   cascade région → province → ville, échelon, établissement, capacité),
   les sites de départ couvrent les grandes régions (Rabat, Casablanca,
   Marrakech, Meknès, Agadir), et les instantanés antérieurs sont complétés
   (échelon, région, rattachement, sites régionaux apparus). La région d'un
   site — pour la visibilité et les alertes — se lit comme celle d'un
   hôpital : la sienne, sinon sa ville, sinon sa position. Le service se lit
   **par région**, filtré par échelon ; sur la fiche Hospinet d'un
   établissement, sa morgue rattachée (places libres) ou, à défaut, le site
   indiqué de sa région ; un décès en établissement est adressé **à sa
   propre morgue d'abord, puis à la régionale, puis à la plus proche**.
5. **Les morgues mobiles sont des sites** (`kind: "mobile"`, `deployment`) :
   déployées par le service (`POST morgues/mobile` — position d'un incident
   ou d'une ville, capacité réfrigérée, effectif), visibles sur la carte en
   ambre, repliées (`recall`) seulement vides. Une référence suit `code-année-numéro`
   (`RBT-2026-012`, `MM1-2026-003`), attribuée par le site si l'admission
   n'en apporte pas.
6. **Le registre du service** (`GET morgues/registry`, par incident au
   besoin) est en lecture pour qui détient `morgue:view` — matrice élargie au
   stratégique, au wali, à la place d'armes et au responsable d'hôpital (il
   doit voir où adresser un décès) ; toute écriture reste cantonnée au site
   (`@RequireScope("morgue")`) ou à l'établissement (`hospital`).
7. **Un seul écran de service** (`/morgue`) : sites fixes et mobiles avec
   leurs places, réceptions en attente, non identifiés, registre filtrable
   (site, incident, réceptions à confirmer, recherche), fiche avec la chaîne
   de garde, actions « Réceptionner » et « Transférer », déploiement et repli
   des mobiles ; Hospinet porte « Déclarer un décès » sur la fiche de
   l'établissement et liste ses transferts en attente. Les vues « Ma
   responsabilité » du responsable de site gagnent la réception et le badge
   « réception à confirmer ».

8. **Le bilan des victimes part de l'incident.** Dès qu'un décès est déclaré,
   le wizard propose les **sites mortuaires** comme il propose unités et
   hôpitaux (`responders.morgues`) — la morgue sert l'incident dès la
   déclaration. Après la déclaration, les intervenants **affinent le bilan**
   (`victims`, matrice dédiée : cellules opérations et logistique,
   responsables d'unité et d'hôpital écrivent ; morgue et autorités lisent ;
   chaque route est cantonnée au périmètre de visibilité de l'incident,
   comme les déploiements) : les compteurs (décédés, blessés, disparus)
   corrigés, et des **victimes nommées** — pour un décédé, l'**identification
   préliminaire** (nom, prénom, CNI si elle existe, sexe féminin / masculin /
   inconnu, âge ou « non identifié », heure du décès ou « non connue »),
   **à confirmer par la morgue d'affectation**. Les compteurs lus valent
   `max(déclaré, nommés)` par nature, recalculés à chaque changement (jamais
   un cliquet). **Affecter** un décédé ouvre son dossier à la morgue avec la
   préliminaire, réception à confirmer, deux étapes de garde (relevé sur le
   terrain, transfert) ; les corrections du terrain suivent tant que la
   morgue n'a pas confirmé ; un décédé affecté ne se retire plus.
9. **La fiche d'un site dit tout, corps compris.** Un site porte une
   **nature** (champ mortuaire, morgue temporaire, morgue hospitalière,
   camion réfrigéré), un **statut** lu (opérationnel, partiel, non
   opérationnel — et **plein**, dérivé, jamais saisi, quand la capacité est
   atteinte ; un site plein ne reçoit plus), sa capacité totale, sa
   localisation comme à la déclaration d'incident (cascade région →
   province → ville, point sur la carte), son rattachement. Un clic sur la
   morgue (service ou carte) ouvre la fiche avec **ses corps**, chacun avec
   sa fiche de présentation et l'heure du décès si elle est connue, sinon
   « non connue ».
10. **L'identification se fait à la morgue.** Elle reçoit la préliminaire et
    la complète avec des informations exactes : heure du décès corrigée,
    nom, prénom, CNI, sexe (féminin / masculin), âge, **mode**
    d'identification (ADN, empreinte digitale, dentaire, signe corporel),
    date d'identification, identifié par, note. Confirmer compose
    l'identité (« Nom Prénom ») que la règle DVI exige et passe le dossier
    « identifié » ; dès lors la préliminaire du terrain ne l'écrase plus.

## Conséquences

- **Positives :** aucun corps sans référence ni sans responsable désigné à
  chaque instant ; l'hôpital et le site partagent le même dossier plutôt que
  deux registres ; la saturation se voit avant d'arriver (places libres par
  site, unités mobiles) ; les invariants sont purs et testés (`morgue.rules`,
  `morgue.spec`), l'écran ne fait que refléter ce que l'API refuse.
- **Négatives :** pas encore de données ante-mortem (familles), de photos ni
  d'inhumation temporaire tracée — étapes suivantes de la doctrine ; les
  instantanés antérieurs sont complétés (nature, code, position des sites de
  départ) mais leurs dossiers n'ont pas de chaîne de garde rétroactive ; le
  déploiement d'une mobile pose sa position sur un incident ou une ville,
  pas encore par un clic sur la carte.
