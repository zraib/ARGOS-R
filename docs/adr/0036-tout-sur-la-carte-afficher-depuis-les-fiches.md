# ADR 0036 — Tout ce qui a une position est sur la carte, et chaque fiche y mène

- **Statut :** accepté — livré sur `fusion-V2` et `fusion-RIF`
- **Date :** 2026-09-24
- **Révise :** ADR 0015 (la couche des abris ne montrait que les abris positionnés ; les autres restaient dans les listes).
- **Complète :** ADR 0029 (glyphes par famille), ADR 0030 (hôpital de campagne déployé par l'API).
- **Portée :** web seulement — `lib/map/positions.ts` (nouveau), `components/map/layers/{markers,glyphs,morgues,shelters}.ts`,
  `components/map/MapCanvas.tsx`, `app/map/page.tsx`, `lib/store/slices/map.ts` (`showOnMap`),
  `components/map/{ShowOnMapButton,EntityGlyph}.tsx` (nouveaux), les fiches : `app/hospinet/page.tsx`,
  `components/opsnet/OpsnetSheets.tsx`, `components/responsibility/{Shared,HospitalViews,UnitViews,ShelterViews,MorgueViews}.tsx`,
  `components/morgue/{MorgueDetailModal,MorgueService}.tsx`, `app/abris/page.tsx`. L'API ne change pas.

## Contexte

Demande du 24 septembre 2026 : « pourquoi l'hôpital de campagne ne s'affiche pas sur la carte avec son
icône dédiée quand je le déploie ; pourquoi les hôpitaux de tout type n'ont pas de bouton pour aller sur
la carte depuis leur fiche ; les unités, les abris, les sites mortuaires, les morgues mobiles et les
morgues doivent s'afficher sur la carte et avoir un bouton “afficher sur la carte” ».

Diagnostic (poste de développement, mode Direx, données de démonstration) :

- Un hôpital de campagne déployé depuis HospiNet est bien posé par l'API à son point, avec sa tente,
  et relu par tous les postes (événement `domain`). Mais **trois défauts pouvaient le cacher** :
  1. des marqueurs posés **au même point** se recouvraient exactement. Un détachement déployé sur la
     commune de l'incident tombait sous le marqueur de l'incident, dessiné après lui. Sur la commune
     d'un autre détachement, c'était le même cas : constaté pour HDC-08 et HCC Asni ;
  2. un établissement dont le **type est « campagne »** (choisi dans sa fiche de modification) était
     rangé dans la couche des hôpitaux civils, **masquée par défaut** ;
  3. sélectionner un hôpital de campagne dans l'arbre des couches ne recentrait pas la carte : le
     recentrage ignorait cette famille.
- **6 abris sur 8** n'avaient pas de coordonnées propres : jamais dessinés, alors que leur fiche
  annonçait la position de leur commune.
- Aucune fiche d'hôpital, d'unité ou d'abri ne menait à la carte. Le bouton des morgues centrait la
  carte sans allumer la couche ni sélectionner le site, et visait aussi une morgue mobile repliée,
  absente de la carte.
- La légende dessinait encore un carré pour les unités et deux pastilles pour les abris et les
  morgues, formes abandonnées par l'ADR 0029.

## Décision

1. **Une seule position par élément** (`lib/map/positions.ts`), lue par le marqueur, le recentrage
   et le bouton des fiches :
   - un abri se place à ses coordonnées, sinon à celles de sa **commune** (la province départage
     les homonymes) ; son infobulle dit alors « position de la commune » ;
   - une morgue mobile se place là où elle est **déployée** ; repliée, elle n'est pas sur la carte ;
   - un hôpital de campagne se retrouve par son identifiant (`HDC-01`…), qui sert désormais de clé
     sur la carte, ou par son nom (l'ancienne clé) ;
   - un établissement de type « campagne » se range avec les **hôpitaux de campagne** (couche,
     arbre, bouton), plus dans son réseau.
2. **Des marqueurs au même point s'écartent** (`mapMarkerOffsets`). Le premier garde sa place exacte,
   dans cet ordre de priorité : incident, poste, unité, établissement, hôpital de campagne, site
   mortuaire, abri, ressource posée. Les autres se rangent en cercle autour de lui, à 34 px au moins.
   Le calcul couvre ensemble tous les marqueurs visibles, ceux des sites mortuaires et des abris
   compris. En mode édition, un poste ou une ressource qu'on déplace garde sa position exacte.
3. **« Afficher sur la carte » dans chaque fiche** — un bouton commun (`ShowOnMapButton`) et une action
   du magasin (`showOnMap`) :
   - le bouton **allume la couche** de l'élément, le **sélectionne** (la carte s'y recentre et
     ouvre son détail), puis ouvre la carte ;
   - sans position connue, il reste visible mais **inactif**, et son infobulle dit pourquoi.

   Il est posé sur :
   - les établissements de santé : fiche HospiNet, carte de chaque hôpital de campagne,
     vues « Ma responsabilité » (tableau de bord, gestion, détachements rattachés) ;
   - les unités et les abris : fiches OPSnet, vues « Ma responsabilité », cartes de « Gestion des
     abris » ;
   - les sites mortuaires et les morgues mobiles : fiche et liste du service morgue, vues
     « Ma responsabilité ».

   Le panneau de sélection d'un hôpital de campagne gagne « Détails », qui ouvre son établissement
   de rattachement.
4. **Le redessin suit les unités et les établissements** : une unité créée ou déplacée, un
   établissement modifié se redessinent sans attendre un autre changement.
5. **La légende reprend les vrais glyphes** (`EntityGlyph`, réplique SVG comme `HealthGlyph`) : bouclier,
   tente, plaque, plaque sur roues ; les morgues mobiles déployées ont leur ligne.
6. La fiche HospiNet d'un établissement laisse sa place au titre : les onglets passent à la ligne au
   lieu de réduire le nom à quelques lettres. Il en va de même sur les cartes des détachements.

## Conséquences

- Tests : web `map-positions.test.ts`, qui couvre :
  - l'abri posé à sa commune, avec les homonymes départagés par la province ;
  - la morgue mobile déployée ou repliée ;
  - la couche d'un établissement de type « campagne » ;
  - l'hôpital de campagne retrouvé par son identifiant et par son nom ;
  - l'écartement : le premier garde sa place et les autres ne le chevauchent pas ; une couche
    éteinte ne pousse personne ; un point à 50 m n'est pas « au même point ».

  Suite web : 246 tests.
- Vérifié dans le navigateur (dev, Direx, superadmin) :
  - les 8 abris sur la carte, dont 6 à leur commune ;
  - HDC-08 déployé sur Asni, écarté de HCC Asni et de l'abri d'Asni (34 px) ;
  - les boutons depuis la fiche HospiNet, la carte d'un détachement, la fiche OPSnet d'une unité
    (couche éteinte, rallumée) et celle d'un abri sans coordonnées, la morgue mobile (couche éteinte,
    rallumée, centrée sur son déploiement), la fiche d'un site mortuaire et « Gestion des abris » ;
  - les quatre vues de supervision (hôpital, unité, abri, morgue) ;
  - un hôpital civil passé au type « campagne », visible sans rallumer la couche civile ;
  - la légende.
- Les scripts PowerShell ne changent pas : le lot pré-signé de l'ADR 0035 reste valable.
