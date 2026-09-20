# ADR 0027 — La carte de tous : unités visibles de tous, affectées par les PC ; équipement affecté à une équipe ; mise à jour sans injection

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-20
- **Révise :** ADR 0020 (unités par auteur et concernement), ADR 0022 (corps affectés par
  les PC du mode Direx), ADR 0016 (ressources d'une entité), ADR 0015/0016 (reprise du
  registre et du parc entre deux démarrages).
- **Portée :** `apps/api/src/modules/domain/visibility.service.ts`, `http/resources*.controller.ts`,
  `shared/profiles.ts`, `shared/direx.matrix.ts` (+ `docs/matrice-roles-direx.csv/.xlsx`),
  `modules/iam/users.service.ts`, `modules/domain/domain.service.ts`, `dto.ts`,
  `catalog.data.ts` ; `apps/web/src/components/resources/*`.

## Contexte

Sous le mode Direx, un chef de PCT, un OPS de PCO ou un LOG de PC FAR **ne voyait aucune
unité** tant qu'il n'était pas déployé sur une opération (portée « incident », ADR 0020) : ni
sur la carte, ni au répartiteur, ni dans OPSnet — rien à affecter. Le PC FAR n'affectait que
les FAR, le PCF les autres corps, les PCT et PCO n'affectaient pas (ADR 0022). Le Super
Administrateur ne voyait sous un mode que les unités de ce mode (ADR 0022). L'état-major a
tranché : **« pour le moment, tout le monde doit voir ce qui se passe sur la carte »**, et
les PC, l'Anim, les LOG et les OPS affectent les unités.

Deux constats sur la mise à jour d'une station : les comptes du jeu d'amorçage absents du
registre étaient **réinjectés** à chaque démarrage (les comptes de démonstration des portées,
puis ceux du mode Direx) — l'administrateur ne les voulait pas ; et en démonstration, une
montée de version du seed **remplaçait le parc d'équipement** par celui du code, perdant ce que
les opérateurs avaient saisi.

Enfin, un article du parc ne pouvait pas être affecté à une équipe, alors qu'une personne le
pouvait.

## Décision

1. **Les unités se voient de tous** (`unitsVisibleToAll()`, défaut) : `GET /units` sert à
   tout rôle toutes les unités du mode en service ; ce qui est **posé sur le terrain**
   (`GET /resources/placed`) se voit de même. Le cantonnement par portée (ADR 0020) reste
   écrit et éprouvé : `UNITS_VISIBILITY=scoped` le rétablit (suites `units-visibility.spec`,
   `resources-visibility.spec` tournent sous ce réglage). Les incidents suivent déjà la même
   règle (`INCIDENTS_VISIBILITY`).
2. **Le Super Administrateur voit tout** : les unités des deux modes de l'application
   (`unitVisibleTo`), qu'il tient aussi (modification, ressources, terrain). Les autres rôles
   restent dans leur mode.
3. **Les PC affectent, tous corps confondus** : la ligne `assign` de la matrice Direx passe à
   AMV pour les chefs, OPS et LOG des quatre PC (PC FAR, PCF, PCT, PCO) et pour l'Anim / DIREX ;
   leur trait `assignCorps` vaut `"*"`. La synthèse, la planification, le renseignement, le
   Chef, l'Eval et le RLS / DIREX observent. Le répartiteur (ordres) leur était déjà ouvert
   (décision du 19 septembre) ; désormais ils voient de quoi répartir.
4. **Un article du parc s'affecte à une équipe** (`EquipItem.teamId`) — une équipe **du même
   détenteur**, sinon 409 ; `""` le sort de l'équipe ; dissoudre l'équipe libère ses articles.
   Le formulaire d'article (écran Ressources, fiche OPSnet) porte le choix de l'équipe ; la
   liste montre l'équipe d'un article et le nombre d'articles d'une équipe.
5. **Une mise à jour ne réinjecte aucun compte** : le registre disque fait autorité, et lui
   seul — les comptes du seed absents ne sont plus ajoutés. Une seule exception de survie : un
   registre sans aucun Super Administrateur actif retrouve le compte fondateur (et lui seul),
   pour qu'une station reste administrable.
6. **Le parc d'équipement est repris tel quel**, quelle que soit la version du seed, sur tous
   les chemins de reprise : les articles déjà saisis (détenteur, équipe, numéro, position) ne
   sont ni écrasés ni retouchés ; en démonstration, les articles de démonstration absents
   rejoignent la liste sans toucher aux autres. `teamId` est facultatif : les articles d'avant
   n'ont pas d'équipe et restent tels quels.

## Conséquences

- Un Chef / PCT non déployé ouvre la carte et voit les douze unités du réseau, engage l'une
  d'elles depuis le répartiteur (ordre émis) et l'affecte à l'opération depuis sa fiche.
- La doctrine de portée reste disponible pour une station qui la voudra ; y revenir est un
  réglage, pas un chantier.
- Tests : API `everyone-sees-the-map.spec.ts` (PC non déployés = même liste que l'Anim,
  terrain compris ; affectation par un chef de PCT, un LOG de PC FAR, l'Anim ; synthèse 403 ;
  article ↔ équipe : 409 hors détenteur, sortie, dissolution, articles d'avant intacts),
  `registry-update.spec.ts` (registre existant sans injection ; fondateur rétabli seul ; parc
  repris tel quel après montée de version), `units-mode.spec.ts` (Super Administrateur : les
  deux modes ; l'Anim : le sien), `profiles.spec.ts` (corps et `assign`).
- Vérifié navigateur (dev, mode Direx) : Chef / PCT — 12 unités et 3 croquis sur la carte,
  engagement de U1 sur INC-2623 au répartiteur (ordre M-0010) ; Super Administrateur sous Direx
  voit l'unité créée en classique (l'Anim non) ; fiche OPSnet — article « Groupe électrogène »
  affecté à « Groupe Alpha » (liste : « Équipe : Groupe Alpha », équipe : « 1 membres ·
  1 équipements »), l'autre article inchangé.
