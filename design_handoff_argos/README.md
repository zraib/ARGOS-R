# Handoff : ARGOS — Plateforme militaire de gestion des catastrophes

## Overview
ARGOS est un poste de commandement (Command HQ, vue nationale — Maroc) pour la gestion des catastrophes. Le prototype couvre : tableau de bord (2 dispositions), signalement d'incident par wizard, gestion des unités (personnel / équipements / véhicules), gestion hospitalière « Hospinet » (personnel médical / lits / véhicules / hôpitaux de campagne), carte opérationnelle temps réel (MapLibre, satellite/plan, 2D/3D), centre de communication type Discord, et une navigation complète vers les modules futurs (triage de masse, ICS, ORSEC, abris, etc.).

## About the Design Files
Les fichiers de ce dossier sont des **références de design réalisées en HTML** (prototype interactif), pas du code de production à copier tel quel. La tâche du développeur est de **recréer ces écrans dans l'environnement du vrai projet** (React/Next.js, Vue, etc.) avec ses patterns et bibliothèques — ou, si le projet n'existe pas encore, de choisir le framework le plus adapté (recommandé : React + Tailwind CSS, car le design system source « Amin Design / Kanban RDIA » est une bibliothèque React + Tailwind).

`Disaster Command.dc.html` est le prototype principal. Il utilise un runtime de prototypage propriétaire (`support.js`, balises `<x-dc>`, `sc-for`, `sc-if`, `x-import`) : **ne pas réutiliser ce runtime**. Lire le fichier comme spécification : le template décrit la structure/les classes, la classe `Component` décrit l'état, les données mock et la logique.

## Fidelity
**Haute fidélité (hifi).** Couleurs, typographies, espacements, états et copies sont finaux. Recréer l'UI au pixel près avec le design system existant.

## Stack & dépendances recommandées
- React 18 + Tailwind CSS (préréglage du DS Kanban RDIA : palettes `rdia`, `or`, `danger`, classes `.carte`, `.btn-primaire`, `.btn-secondaire`, `.input-champ`, animations `animate-fade-in`…)
- **MapLibre GL JS** (^4.x) pour la carte
- i18n : 3 langues — FR (défaut), AR (RTL, police Amiri `font-arabe`), EN
- Dark mode par classe `dark` sur `<html>`, persisté (clé localStorage `kanban_rdia_theme` dans le prototype)

## Screens / Views

### 0. Page d'authentification (login)
- Plein écran, fond `rgb(15 31 20)` avec halo radial vert `rgb(27 77 46 / 0.6)` centré à ~32%/45%.
- Deux colonnes égales (`minmax(320px, 400px)` chacune, gap 16px, centrées, largeur max 880px) :
  - **Gauche** : logo ARGOS grand format (max 320×360px, `drop-shadow(0 24px 48px rgba(0,0,0,0.55))`), titre « ARGOS » 30px bold `#F5F0E8`, sous-titre uppercase or `#C9A84C`.
  - **Droite** : carte (`carte p-8`) — titre « Authentification requise », bandeau or `bg-or-500/10` avec icône bouclier « Accès restreint — usage officiel uniquement », champs **Matricule** et **Mot de passe** (`input-champ`), bouton `btn-primaire` pleine largeur (désactivé si champs vides, Entrée valide), sélecteur FR/AR/EN, mention institutionnelle en pied de carte.
- Connexion réussie → toast « Session ouverte » ; bouton de **déconnexion** dans le pied de la sidebar. En production : brancher sur le SSO/annuaire réel (le prototype accepte tout couple non vide).

### 1. Coquille applicative (App shell)
- **Sidebar repliable** : 256px ouverte / 64px repliée (icônes seules + tooltips), transition 200ms. Fond : blanc en mode clair, `rgb(15 45 26)` (rdia-800) en sombre. Logo ARGOS (`argos-logo.png`, PNG transparent) + titre « ARGOS » + sous-titre. Navigation avec groupes dépliables (chevron rotatif) :
  Tableau de bord · Incidents (badge compteur rouge) · Carte opérationnelle · Triage de masse · **Ressources** (Inventaire équipements, Équipes, Personnel, Bons de travail) · Hospinet · **Gestion de désastres** (Formulaire ICS) · Évaluation des dommages · Gestion des abris · **Commandement** (Tableau ORSEC) · Plans · Centre de communication · Rapports d'incidents · Analytique.
  Item actif : `bg-or-500/15` + texte or. Pied : avatar utilisateur, rôle, bouton thème, sélecteur FR/AR/EN.
- **Header** (64px) : bouton repli sidebar, titre d'écran, ticker « direct » (dernier événement, point rouge pulsant), badge niveau d'alerte (NIVEAU 1–4), horloge HH:MM:SS, bouton primaire « Signaler un incident ». Responsive : ticker/badge/horloge se masquent sous 860/1040/1180px.

### 2. Tableau de bord (2 dispositions commutables A/B)
- 4 KPI en `carte` : Incidents actifs, Personnel déployé, Lits disponibles, Unités en alerte (icône teintée 40px, valeur 24px bold tabular, delta coloré).
- Disposition A : 3 graphiques (barres « Incidents par type 30 j », colonnes « par région », donut « Moyens engagés » — composants DashboardChartCard/DashboardDonut du DS) + liste « Opérations en cours » avec progressions + « Fil des événements » (timestamp mono, point coloré, texte).
- Disposition B : carte de situation stylisée (SVG Maroc) 2 colonnes + fil, puis graphiques.
- Le fil et le ticker sont alimentés par une simulation temps réel (nouvel événement ~toutes les 15s).

### 3. Incidents
Recherche (input-champ) + compteur, table : Réf. (mono), Incident, Type, Région, Gravité (badge Critique/Modérée/Faible), Statut (badge Ouvert/En cours/Clôturé), Heure, action « Carte » (navigue vers la carte et sélectionne le marqueur).

### 4. Wizard « Signaler un incident » (modal DS, 3 étapes)
1. **Type** : grille 3×2 de tuiles icône+libellé (séisme, inondation, feu de forêt, glissement, épidémie, accident industriel), sélection bordure or.
2. **Détails** : titre (requis), description (textarea), zone de pièces jointes en pointillés (photo/vidéo/document, multi, chips des noms).
3. **Localisation** : select Province + coordonnées calculées + mini-carte cliquable (crosshair, marqueur avec ping).
Stepper numéroté (or = courant, vert = validé). Soumission → l'incident apparaît dans la liste, le fil et sur la carte + toast de confirmation.

### 5. Équipes (unités)
Grille de cartes unité (nom, ville, badge Opérationnelle/Déployée/En attente, commandant, effectif, jauge « Disponibilité opérationnelle » or). Détail : en-tête retour + stats + onglets **Personnel** (grade, nom, fonction, statut) / **Équipements** (désignation, catégorie, qté, état Opérationnel/Maintenance) / **Véhicules** (type, immatriculation militaire, affectation, état).

### 6. Hospinet (hôpitaux)
Cartes hôpital (occupation avec jauge colorée : vert <75%, or 75–89%, rouge ≥90% ; lits disponibles, réa x/y, effectif médical). Détail : 4 tuiles stats (Lits totaux / Occupés / Disponibles / Réanimation) + onglets **Personnel médical** / **Lits** (jauges par service : Réanimation, Chirurgie, Médecine interne, Urgences, Pédiatrie) / **Véhicules** (ambulances, VAB sanitaire, hélicoptère médicalisé) / **Hôpitaux de campagne** (cartes HMC : capacité, déployé depuis J+n, occupation ; bouton « Déployer un hôpital de campagne » qui crée un HMC rattaché, visible sur la carte).

### 7. Carte opérationnelle (MapLibre)
- Fonds raster : **Satellite** Esri World Imagery + labels, **Plan** OSM. Bascule segmentée 2D/3D et Satellite/Plan (overlay en haut à droite, fond `rgba(15,31,20,0.85)` + blur).
- **3D** : terrain raster-dem (terrarium AWS, exagération 1.4), pitch 62°, recentrage Haut Atlas.
- Couches togglables (interrupteurs or) : Unités (carré or), Hôpitaux (cercle blanc + croix rouge), Incidents (triangle « ! » rouge/ambre/gris + ping animé si actif), Véhicules/convois (losange bleu), Hôpitaux de campagne (cercle vert pointillé).
- **Convois animés** sur vrais itinéraires : LOG-1 Rabat→Marrakech (A7), SAR-2 Agadir→Amizmiz, EVASAN-1 rotation hélico — polylignes or pointillées (GeoJSON), position interpolée en continu (requestAnimationFrame).
- Panneau de sélection (à gauche) : titre, sous-titre, badge statut, lignes clé/valeur, bouton « Détails » qui navigue vers l'écran correspondant.

### 8. Centre de communication (type Discord)
3 colonnes `minmax(180px,220px) / minmax(320px,1fr) / minmax(0,190px)` :
- **Canaux** : groupes majuscules dépliables (OPÉRATIONS, RENSEIGNEMENT, SALLES VOCALES), canaux texte « # » et salles vocales (haut-parleur). Création : bouton + global (nouveau groupe) et + par groupe (nouveau canal) — input inline, Entrée valide / Échap annule, nom slugifié.
- **Chat** : en-tête # canal + sujet, messages (avatar initiales coloré, nom, heure mono, texte), input + envoi (Entrée ou bouton). Salle vocale : avatars des connectés avec anneau vert « parle », bouton Rejoindre.
- **Membres** : En ligne (point vert) / Hors ligne (grisé), avec unité d'affectation.

### 9. Modules à concevoir (stubs)
Triage de masse, Inventaire équipements, Personnel, Bons de travail, Formulaire ICS, Évaluation des dommages, Gestion des abris, Tableau ORSEC, Plans, Rapports d'incidents, Analytique — écran vide « Module en préparation ».

## Interactions & Behavior
- Navigation par état interne (SPA) ; prévoir un routeur réel (React Router/Next).
- Simulation live : horloge 1s ; convois interpolés en continu ; nouvel événement de fil périodique — à remplacer par WebSocket/SSE en production.
- Toasts : coin bas-droit, `carte` + point vert, auto-dismiss 4s.
- RTL complet quand langue = AR (`dir="rtl"`, padding logique `padding-inline-start`).
- Thème clair/sombre synchronisé partout (sidebar comprise), persisté.

## State Management (prototype → production)
- `screen`, `sbOpen`, `navGroups`, `lang`, `dark`
- `incidents[]` (id INC-XXXX, type, titre, région, gravité, statut, heure, lng/lat), `fieldHosps[]`, `feed[]`
- Wizard : `wizStep/Type/Titre/Desc/Files/Prov/Pt`
- Carte : `layers{}`, `selMarker{kind,id}`, `map3d`, `mapSat`
- Comms : `comCats[]`, `comMsgs{}`, `comSel`, inputs de création
- Données mock dans la classe `Component` (UNITS, HOSPITALS, VEHROUTES, POOLS…) → API REST/WS réelle.

## Design Tokens
- **Vert militaire `rdia`** : 600 `rgb(27,77,46)` (primaire clair), 700 `rgb(22,61,36)` (surfaces cartes sombres), 800 `rgb(15,45,26)` (sidebar sombre), 900 `rgb(15,31,20)` (fond sombre)
- **Or `or-500`** `#C9A84C` (actions, actif, jauges) ; **Danger** `#EF4444` ; ambre `#F59E0B` ; succès `#10B981` ; info `#3B82F6`
- Polices : **Inter** (sans), **Amiri** (`font-arabe`, arabe) ; mono système pour heures/réfs
- Rayons : badges `rounded-md`, boutons/inputs `rounded-lg`, cartes `rounded-xl`, modals `rounded-2xl`
- Échelle texte : labels 10px uppercase tracking-wider, corps 13–14px, titres écran 18px, KPI 24px
- Carte : fond panneau `#10202f`, tracés convois `#C9A84C` dasharray 2 2

## Assets
- `argos-logo.png` — logo ARGOS (fond transparent, recadré)
- Design system Amin Design : `_ds/amin-design-.../styles.css` + `_ds_bundle.js` (+ `fonts/`)
- Tuiles cartographiques en ligne : Esri World Imagery, OSM, DEM terrarium (prévoir clés/CDN en production)

## Files
- `Disaster Command.dc.html` — prototype complet (template + logique + données mock + i18n FR/AR/EN)
- `ds-widgets.jsx` — wrappers des composants DS (Chart, Donut, Badge, Modal, ListCard…)
- `Disaster Command (standalone).html` — version autonome à ouvrir dans un navigateur (démo)
- `argos-logo.png`, dossier `_ds/` — assets et design system
