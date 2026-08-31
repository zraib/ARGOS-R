import type { Incident, Unit } from "@/modules/domain/domain.service";

// ============================================================================
// ARGOS — JEU DE DÉMONSTRATION (lot V-4)
//
// Le jeu précédent n'était pas adapté au workflow : six incidents réduits à un
// titre et une position, SANS description, SANS bilan humain, SANS intervenants.
// Les tableaux de bord par incident (V-3) y étaient donc vides, et les portées
// de visibilité (V-1) n'y étaient pas éprouvables — l'unité la plus proche de
// Casablanca stationnait à 85 km, si bien qu'une place d'armes y voyait
// exactement ZÉRO moyen. Le filtre était juste ; les données ne l'étaient pas.
//
// CE JEU EST CONSTRUIT POUR ÊTRE ÉPROUVÉ. Chaque portée de la doctrine y trouve
// de quoi se démontrer, et de quoi se démentir :
//
//  • RÉGION (wali) — Casablanca-Settat porte quatre opérations, les autres
//    régions le reste. Un wali qui verrait cinq incidents verrait trop.
//
//  • ZONE (place d'armes, 40 km autour de sa ville) — autour de Casablanca :
//        Casablanca      0 km   ✓
//        Mohammedia     23 km   ✓
//        Berrechid      33 km   ✓
//        Benslimane     44 km   ✗  ← le cas limite qui compte
//        Settat         63 km   ✗
//    Benslimane est délibérément placée JUSTE au-delà : un filtre approximatif
//    (par province, par région, par « à peu près ») l'inclurait. Le bon filtre
//    ne le fait pas. Sans ce point, une erreur de 20 % passerait inaperçue.
//
//  • ENTITÉ (responsables hôpital / unité / morgue) — H2 (Casablanca) sert
//    DEUX opérations, H1 (Rabat) trois. Un responsable cantonné à une seule
//    ne verrait pas les autres, et le défaut serait invisible.
//
//  • INCIDENT (conduite déployée) — les opérations ouvertes ont de quoi être
//    conduites : bilan, moyens engagés, sous-incidents.
//
// Les régions sont les valeurs CANONIQUES de `REGIONS_MA` : elles servent de clé
// de visibilité depuis V-1, et une variante orthographique soustrairait
// l'incident au wali concerné.
//
// `seeded: true` marque ce qui appartient à la démonstration : une montée de
// version du seed reconstruit ces lignes et CONSERVE ce qu'un utilisateur a créé
// (voir `domain.service.ts`).
// ============================================================================

/**
 * Identifiants du jeu ANTÉRIEUR à ce lot.
 *
 * Les lignes déjà écrites sur disque ne portent pas `seeded` — elles sont
 * antérieures au marqueur. Sans cette liste, la reconstruction les conserverait
 * comme s'il s'agissait de travail réel, et l'ancien jeu cohabiterait avec le
 * nouveau. Reprise ponctuelle : les montées de version suivantes s'appuient sur
 * le marqueur.
 */
export const LEGACY_SEED_INCIDENT_IDS = new Set([
  "INC-2595", "INC-2598", "INC-2601", "INC-2604", "INC-2606", "INC-2607",
]);

export const LEGACY_SEED_UNIT_IDS = new Set(["U1", "U2", "U3", "U4", "U5", "U6"]);

// ---------------------------------------------------------------------------
// Unités — réparties pour que les zones de compétence aient un sens
// ---------------------------------------------------------------------------

export const SEED_UNITS: Unit[] = [
  // --- U1..U6 : identifiants HISTORIQUES, inchangés ------------------------
  // Le catalogue d'équipements rattache douze matériels à ces identifiants
  // (`catalog.data.ts`). Les renuméroter aurait réaffecté, sans un mot, le parc
  // du Génie à une unité NRBC. Un identifiant est une RÉFÉRENCE : on l'étend,
  // on ne le réattribue pas.
  { id: "U1", nom: "1er Groupement d'Intervention", ville: "Rabat", cmdt: "Col. Y. Benjelloun", eff: 420, dispo: "ready", readiness: 92, x: 196, y: 148, ll: [-6.84, 34.02], seeded: true },
  { id: "U2", nom: "3e Bataillon du Génie", ville: "Marrakech", cmdt: "Lt-Col. A. Tazi", eff: 365, dispo: "deployed", readiness: 78, x: 180, y: 262, ll: [-8.01, 31.63], seeded: true },
  { id: "U3", nom: "7e Régiment Aéroporté", ville: "Agadir", cmdt: "Col. M. El Fassi", eff: 510, dispo: "ready", readiness: 85, x: 112, y: 330, ll: [-9.6, 30.42], seeded: true },
  { id: "U4", nom: "2e Groupe Logistique", ville: "Fès", cmdt: "Lt-Col. S. Amrani", eff: 290, dispo: "deployed", readiness: 70, x: 268, y: 140, ll: [-5.0, 34.03], seeded: true },
  { id: "U5", nom: "5e Bataillon de Soutien", ville: "Oujda", cmdt: "Cdt. H. Berrada", eff: 245, dispo: "ready", readiness: 88, x: 378, y: 120, ll: [-1.91, 34.68], seeded: true },
  { id: "U6", nom: "4e Unité NRBC", ville: "Kénitra", cmdt: "Cdt. N. Chraibi", eff: 180, dispo: "standby", readiness: 81, x: 205, y: 132, ll: [-6.58, 34.26], seeded: true },

  // --- axe Casablanca : ce qu'une place d'armes de Casablanca commande ------
  // Sans ces unités, la zone de 40 km ne contenait AUCUN moyen : le filtre
  // rendait une liste vide, indiscernable d'une panne.
  { id: "U7", nom: "2e Groupement d'Intervention", ville: "Casablanca", cmdt: "Col. R. Sekkat", eff: 460, dispo: "deployed", readiness: 88, x: 178, y: 172, ll: [-7.59, 33.57], seeded: true },
  { id: "U8", nom: "Unité NRBC du Littoral", ville: "Mohammedia", cmdt: "Lt-Col. K. Bennis", eff: 165, dispo: "deployed", readiness: 94, x: 182, y: 168, ll: [-7.38, 33.69], seeded: true },
  { id: "U9", nom: "Détachement du Génie — Berrechid", ville: "Berrechid", cmdt: "Cdt. A. Hajji", eff: 210, dispo: "deployed", readiness: 76, x: 179, y: 180, ll: [-7.59, 33.27], seeded: true },
  // Benslimane est à 44 km de Casablanca : HORS zone. Placée là exprès — c'est
  // le cas qui démasque un filtre trop généreux.
  { id: "U10", nom: "Compagnie de Réserve — Benslimane", ville: "Benslimane", cmdt: "Cne. Y. Filali", eff: 130, dispo: "ready", readiness: 69, x: 184, y: 170, ll: [-7.12, 33.61], seeded: true },

  // --- Détroit et Rif ------------------------------------------------------
  { id: "U11", nom: "Bataillon de Sécurité Civile — Détroit", ville: "Tanger", cmdt: "Lt-Col. O. Mrani", eff: 320, dispo: "deployed", readiness: 83, x: 236, y: 62, ll: [-5.8, 35.77], seeded: true },
  { id: "U12", nom: "Compagnie de Montagne du Rif", ville: "Tétouan", cmdt: "Cne. Z. Lahlou", eff: 155, dispo: "deployed", readiness: 79, x: 252, y: 74, ll: [-5.37, 35.57], seeded: true },
];

// ---------------------------------------------------------------------------
// Opérations — chacune avec de quoi être conduite
// ---------------------------------------------------------------------------

export const SEED_INCIDENTS: Incident[] = [
  // === CASABLANCA-SETTAT (4) — la région du wali de démonstration ==========

  // Dans la zone de la place d'armes (0 km).
  {
    id: "INC-2612",
    type: "nrbc",
    titre: "Fuite de chlore — port de Casablanca",
    region: "Casablanca-Settat",
    adresse: "Terminal à conteneurs, môle Tarik",
    desc:
      "Rupture d'une vanne sur un conteneur-citerne de chlore gazeux au débarquement. " +
      "Nuage visible dérivant vers l'est. Vent de secteur ouest, 14 km/h. Périmètre " +
      "d'exclusion de 500 m établi, trafic portuaire suspendu.",
    sev: "high",
    st: "prog",
    time: "07:12",
    x: 178,
    y: 172,
    ll: [-7.59, 33.57],
    casualties: { dead: 0, injured: 23, missing: 2 },
    responders: { units: ["U7", "U8"], hospitals: ["H2"] },
    nrbc: { family: "C", substanceId: "chlorine", spill: "large", release: "continuous" },
    subIncidents: [
      { id: "SUB-1", type: "toxic_release", sev: "high", note: "Nuage dérivant vers les quartiers est", time: "07:25" },
      { id: "SUB-2", type: "evacuation", sev: "medium", note: "Périmètre de 500 m — 340 personnes", time: "07:40" },
    ],
    seeded: true,
  },
  // 23 km — dans la zone.
  {
    id: "INC-2613",
    type: "industrial",
    titre: "Explosion — raffinerie de Mohammedia",
    region: "Casablanca-Settat",
    adresse: "Zone industrielle portuaire",
    desc:
      "Explosion sur une unité de distillation suivie d'un incendie de bac. Deux bacs " +
      "voisins menacés par rayonnement thermique. Alimentation en mousse en cours " +
      "d'acheminement depuis Casablanca.",
    sev: "high",
    st: "prog",
    time: "05:48",
    x: 182,
    y: 168,
    ll: [-7.38, 33.69],
    casualties: { dead: 3, injured: 41, missing: 1 },
    responders: { units: ["U8", "U9"], hospitals: ["H2", "H1"] },
    subIncidents: [
      { id: "SUB-1", type: "structure_fire", sev: "high", note: "Bac de brut en feu — risque de propagation", time: "05:55" },
      { id: "SUB-2", type: "mass_casualty", sev: "high", note: "Afflux aux urgences de H2", time: "06:40" },
    ],
    seeded: true,
  },
  // 33 km — dans la zone, tout juste.
  {
    id: "INC-2614",
    type: "road_accident",
    titre: "Carambolage — autoroute A7, Berrechid",
    region: "Casablanca-Settat",
    adresse: "A7, PK 32, sens Casablanca–Marrakech",
    desc:
      "Collision en chaîne de 14 véhicules dont deux poids lourds, par brouillard dense. " +
      "Voie sud coupée dans les deux sens. Désincarcération en cours.",
    sev: "medium",
    st: "prog",
    time: "06:30",
    x: 179,
    y: 180,
    ll: [-7.59, 33.27],
    casualties: { dead: 2, injured: 18, missing: 0 },
    responders: { units: ["U9"], hospitals: ["H2"] },
    seeded: true,
  },
  // 44 km — HORS zone. Même région que les trois précédentes : c'est ce qui
  // distingue la portée « zone » de la portée « région ».
  {
    id: "INC-2615",
    type: "flood",
    titre: "Inondations — plaine de Benslimane",
    region: "Casablanca-Settat",
    adresse: "Douars de la rive de l'oued Cherrat",
    desc:
      "Crue soudaine après 80 mm de pluie en six heures. Trois douars isolés, une " +
      "quarantaine de foyers évacués vers le centre communal.",
    sev: "medium",
    st: "open",
    time: "J-1",
    x: 184,
    y: 170,
    ll: [-7.12, 33.61],
    casualties: { dead: 0, injured: 6, missing: 3 },
    responders: { units: ["U10"], hospitals: ["H2"] },
    seeded: true,
  },

  // === MARRAKECH-SAFI (2) ==================================================
  {
    id: "INC-2616",
    type: "earthquake",
    titre: "Séisme M5.9 — province d'Al Haouz",
    region: "Marrakech-Safi",
    adresse: "Communes de montagne, versant nord du Haut Atlas",
    desc:
      "Secousse de magnitude 5,9 à 18 km de profondeur, ressentie jusqu'à Marrakech. " +
      "Effondrements de bâti traditionnel en terre dans les douars d'altitude. Accès " +
      "routier coupé sur trois axes de vallée.",
    sev: "high",
    st: "prog",
    time: "06:42",
    x: 188,
    y: 286,
    ll: [-8.44, 31.06],
    casualties: { dead: 34, injured: 187, missing: 12 },
    responders: { units: ["U2", "U3"], hospitals: ["H4", "H1"] },
    subIncidents: [
      { id: "SUB-1", type: "building_collapse", sev: "high", note: "École communale — deux niveaux effondrés", time: "07:05" },
      { id: "SUB-2", type: "road_cut", sev: "medium", note: "Route de vallée coupée au PK 12", time: "08:20" },
      { id: "SUB-3", type: "isolated_population", sev: "high", note: "Quatre douars sans accès routier", time: "09:15" },
    ],
    seeded: true,
  },
  {
    id: "INC-2617",
    type: "flood",
    titre: "Crues de l'oued Ourika",
    region: "Marrakech-Safi",
    adresse: "Vallée de l'Ourika, aval de Setti Fatma",
    desc:
      "Montée rapide des eaux en amont, aggravée par les éboulis consécutifs au séisme. " +
      "Établissements touristiques de fond de vallée évacués.",
    sev: "high",
    st: "prog",
    time: "05:10",
    x: 196,
    y: 276,
    ll: [-7.79, 31.32],
    casualties: { dead: 4, injured: 22, missing: 7 },
    responders: { units: ["U2"], hospitals: ["H4"] },
    seeded: true,
  },

  // === TANGER-TÉTOUAN-AL HOCEÏMA (2) =======================================
  {
    id: "INC-2618",
    type: "wildfire",
    titre: "Feu de forêt — massif de Chefchaouen",
    region: "Tanger-Tétouan-Al Hoceïma",
    adresse: "Versants boisés au sud de la ville",
    desc:
      "Front de flammes de 4 km progressant vers le nord-est sous vent de Chergui. " +
      "Deux douars menacés à 2 km du front. Largages aériens suspendus la nuit.",
    sev: "medium",
    st: "prog",
    time: "J-1",
    x: 248,
    y: 82,
    ll: [-5.27, 35.17],
    casualties: { dead: 0, injured: 9, missing: 0 },
    responders: { units: ["U11", "U12"], hospitals: ["H1"] },
    seeded: true,
  },
  {
    // Al Hoceïma relève de Tanger-Tétouan-Al Hoceïma. L'ancien jeu la rattachait
    // à « L'Oriental » — une erreur sans conséquence tant que la région n'était
    // qu'un libellé, mais qui, depuis V-1, l'aurait montrée au mauvais wali.
    id: "INC-2619",
    type: "landslide",
    titre: "Glissement de terrain — Al Hoceïma",
    region: "Tanger-Tétouan-Al Hoceïma",
    adresse: "Route provinciale 5208, corniche",
    desc:
      "Pan de falaise effondré sur la chaussée après plusieurs jours de pluie. " +
      "Circulation interrompue, deux véhicules ensevelis.",
    sev: "medium",
    st: "open",
    time: "J-1",
    x: 300,
    y: 94,
    ll: [-3.93, 35.25],
    casualties: { dead: 1, injured: 3, missing: 2 },
    responders: { units: ["U12"], hospitals: ["H1"] },
    seeded: true,
  },

  // === AUTRES RÉGIONS (3) ==================================================
  {
    id: "INC-2620",
    type: "epidemic",
    titre: "Foyer de choléra suspecté — province de Zagora",
    region: "Drâa-Tafilalet",
    adresse: "Communes rurales de la vallée du Drâa",
    desc:
      "Quarante-trois cas de diarrhée aiguë en cinq jours, deux décès. Prélèvements " +
      "en cours d'acheminement. Point d'eau collectif suspecté.",
    sev: "high",
    st: "prog",
    time: "J-2",
    x: 214,
    y: 320,
    ll: [-5.84, 30.33],
    casualties: { dead: 2, injured: 43, missing: 0 },
    responders: { units: ["U4"], hospitals: ["H4"] },
    seeded: true,
  },
  {
    id: "INC-2621",
    type: "storm",
    titre: "Tempête côtière — port de Tanger Med",
    region: "Tanger-Tétouan-Al Hoceïma",
    adresse: "Digue nord et terminal passagers",
    desc:
      "Rafales à 110 km/h et houle de 6 m. Deux navires en difficulté au mouillage, " +
      "opérations portuaires suspendues.",
    sev: "medium",
    st: "open",
    time: "03:20",
    x: 240,
    y: 58,
    ll: [-5.5, 35.89],
    casualties: { dead: 0, injured: 4, missing: 1 },
    responders: { units: ["U11"], hospitals: ["H1"] },
    seeded: true,
  },
  {
    // Opération CLOSE : le tableau de bord doit rester consultable, mais on n'y
    // déploie plus de poste (règle V-2).
    id: "INC-2622",
    type: "industrial",
    titre: "Fuite d'ammoniac — entrepôt frigorifique d'Agadir",
    region: "Souss-Massa",
    adresse: "Zone industrielle d'Aït Melloul",
    desc:
      "Fuite sur circuit de réfrigération, colmatée après quatre heures. Site ventilé " +
      "et rendu à l'exploitant. Opération close.",
    sev: "low",
    st: "closed",
    time: "J-3",
    x: 112,
    y: 330,
    ll: [-9.6, 30.42],
    casualties: { dead: 0, injured: 11, missing: 0 },
    responders: { units: ["U3"], hospitals: ["H5"] },
    seeded: true,
  },
];
