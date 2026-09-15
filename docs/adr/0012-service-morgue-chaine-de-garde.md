# ADR 0012 — Service morgue : morgues mobiles, chaîne de garde, traçabilité avec les hôpitaux

- **Statut :** accepté
- **Date :** 2026-09-15
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
4. **Les morgues mobiles sont des sites** (`kind: "mobile"`, `deployment`) :
   déployées par le service (`POST morgues/mobile` — position d'un incident
   ou d'une ville, capacité réfrigérée, effectif), visibles sur la carte en
   ambre, repliées (`recall`) seulement vides. Une référence suit `code-année-numéro`
   (`RBT-2026-012`, `MM1-2026-003`), attribuée par le site si l'admission
   n'en apporte pas.
5. **Le registre du service** (`GET morgues/registry`, par incident au
   besoin) est en lecture pour qui détient `morgue:view` — matrice élargie au
   stratégique, au wali, à la place d'armes et au responsable d'hôpital (il
   doit voir où adresser un décès) ; toute écriture reste cantonnée au site
   (`@RequireScope("morgue")`) ou à l'établissement (`hospital`).
6. **Un seul écran de service** (`/morgue`) : sites fixes et mobiles avec
   leurs places, réceptions en attente, non identifiés, registre filtrable
   (site, incident, réceptions à confirmer, recherche), fiche avec la chaîne
   de garde, actions « Réceptionner » et « Transférer », déploiement et repli
   des mobiles ; Hospinet porte « Déclarer un décès » sur la fiche de
   l'établissement et liste ses transferts en attente. Les vues « Ma
   responsabilité » du responsable de site gagnent la réception et le badge
   « réception à confirmer ».

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
