// ============================================================================
// lib/ai/draft/lexicon.ts — lexique : toponymes, mots vides, familles de mots-clés
//
// Les familles de mots (SEISMIC_WORDS…) sont la matière du moteur sémantique :
// on ne les modifie qu'avec un cas de test qui montre la phrase produite.
// Logique PURE, sans React : extraite de IncidentDraftAssist.tsx pour être
// testée seule et réutilisée par le brouillon LLM (lib/ai/llmIncidentDraft.ts)
// sans qu'une bibliothèque n'importe plus un composant.
// ============================================================================

import type { DescPair, DescriptionProposalInput } from "./types";

export function labelOf(
  input: Pick<DescriptionProposalInput, "type" | "lang" | "incidentTypes">,
): string {
  if (!input.type) return "Incident";
  const def = input.incidentTypes.find((d) => d.id === input.type);
  if (!def) return input.type;
  const labels = def.labels as Partial<Record<"fr" | "ar" | "en", string>>;
  return labels[input.lang] ?? labels.fr ?? labels.ar ?? labels.en ?? input.type;
}

const MOROCCAN_TOPONYMS_BASE = new Set<string>([
  "casablanca","rabat","salé","sale","marrakech","marrakesh","fès","fez","tanger","tangier","meknès","meknes","agadir","oujda","kenitra","tetouan","tétouan",
  "safi","mohammedia","beni mellal","benimellal","nador","khouribga","guelma","berrechid","settat","el jadida","taza","khémisset","khemisset","fquih ben salah","fqihbensalah",
  "ersane","taounat","tata","ouarzazate","midelt","marrakech-safi","tanger-tétouan-al hoceima","fès-meknès","casablanca-settat","drâa-tafilalet","souss-massa","beni mellal-khénifra",
  "oriental","guelmim-oued noun","laâyoune-sakia el hamra","dakhla-oued eddahab","région de rabat-salé-kénitra","region de rabat sale kenitra",
  "larache","chefchaouen","asfi","témara","temara","dar bouazza","bouskoura","aïn harrouda","ain harrouda","sidi slimane","sidi kacem","bouznika",
  "skhirate","témara","temara","tit mellil","youssoufia","al hoceima","hoceima","essaouira","zagora","tafilalet","goulimine","tan-tan","smara","dakhla","laâyoune","layoune",
  "kénitra","kenitra","el kelaâ des sraghna","kelaa sraghna","oued zem","azrou","ifrane","midelt","azzemour","bir jdid","benslimane","jerada","figuig",
  "fnideq","mdiq","martil","oualidia","azemmour","sidi ifni","sidi bennour","chichaoua","al haouz","haouz","el kelaa m'gouna","kelâat m'gouna","tinerhir","ouarzazat",
  "chichaoua","sidi qacem","skhour rhate","souk el arbaa","oulmes","tameslouht","ain sebaa","dar bouaazza","ain atta","azrou",
  "province de","wilaya de","cercle de","caïdat de","commune de","région","region","prefecture","province","wilaya",
  "mohamedia","mohammédia","mohamedia","mohammedia","mhamdia","mhamid","sidi bou othmane","sidi bou otman",
]);

const FRENCH_STOPWORDS_TOPO = new Set<string>([
  "de","des","du","le","la","les","un","une","et","ou","sur","sous","dans","vers","par","pour","au","aux","a","avec","sans","entre","en","à","au","dun","dune","ce","cette","ces","mon","ma","mes","ton","ta","tes","son","sa","ses","notre","votre","leur","leurs","je","tu","il","elle","on","nous","vous","ils","elles","qui","que","quoi","dont","ou","où","ça","ca","très","tres","plus","moins","tres","peu","beaucoup","ainsi","aussi","comme","depuis","quand","lorsque","pendant","après","avant","donc","alors","bien","mal","tout","tous","toute","toutes","aucun","aucune","autre","autres","même","meme","chaque","quel","quelle","quels","quelles","aucun","déjà","deja","ici","là","la","oui","non","encore","aussi","afin","suite","partir","selon","entre","suivant","via","havre","non","oui","lieux","lieu","zone","zones","site","sites","endroit","endroits","secteur","secteurs","region","regions","province","provinces","ville","villes","pays","quartier","quartiers","adresse","adresses","chemin","rue","avenue","boulevard","place","route","autoroute","nationale","rn","ra","rp","km",
]);

function isLikelyToponym(token: string, allLexicons: Set<string>): boolean {
  const n = normKW(token);
  if (n.length < 3) return false;
  if (allLexicons.has(n)) return false;
  if (FRENCH_STOPWORDS_TOPO.has(n)) return false;
  // Digit patterns like "n1", "2024", "4x4" not a toponym
  if (/^\d/.test(token) || /\d/.test(token) && n.length < 5) return false;
  // Capitalized (proper noun) OR in Moroccan dictionary → qualify
  const isProperNoun = /^[A-ZÀ-ÖÙ-Ý]/.test(token.trim());
  const hasKnownTopo = Array.from(MOROCCAN_TOPONYMS_BASE).some((k) =>
    k === n || n.includes(k) || k.includes(n)
  );
  return isProperNoun || hasKnownTopo;
}

const ALL_LEXICON_UNION: { current: Set<string> | null } = { current: null };
function getAllLexiconUnion(): Set<string> {
  if (ALL_LEXICON_UNION.current) return ALL_LEXICON_UNION.current;
  const s = new Set<string>();
  const pools: readonly string[][] = [
    typeof SEISMIC_WORDS !== "undefined" ? SEISMIC_WORDS : [],
    typeof FIRE_WORDS !== "undefined" ? FIRE_WORDS : [],
    typeof SMOKE_WORDS !== "undefined" ? SMOKE_WORDS : [],
    typeof FLOOD_WORDS !== "undefined" ? FLOOD_WORDS : [],
    typeof STORM_WORDS !== "undefined" ? STORM_WORDS : [],
    typeof COLLAPSE_WORDS !== "undefined" ? COLLAPSE_WORDS : [],
    typeof DAMAGE_WORDS !== "undefined" ? DAMAGE_WORDS : [],
    typeof BUILDING_WORDS !== "undefined" ? BUILDING_WORDS : [],
    typeof HUMAN_WORDS !== "undefined" ? HUMAN_WORDS : [],
    typeof HAZARD_WORDS !== "undefined" ? HAZARD_WORDS : [],
    typeof INDUSTRIAL_WORDS !== "undefined" ? INDUSTRIAL_WORDS : [],
    typeof CBRN_WORDS !== "undefined" ? CBRN_WORDS : [],
    typeof CBRN_ACTION_WORDS !== "undefined" ? CBRN_ACTION_WORDS : [],
    typeof EXPLOSION_WORDS !== "undefined" ? EXPLOSION_WORDS : [],
    typeof EVACUATION_WORDS !== "undefined" ? EVACUATION_WORDS : [],
    typeof MEDICAL_WORDS !== "undefined" ? MEDICAL_WORDS : [],
    typeof ROAD_WORDS !== "undefined" ? ROAD_WORDS : [],
    typeof WATER_ASSET_WORDS !== "undefined" ? WATER_ASSET_WORDS : [],
    typeof AIR_ASSET_WORDS !== "undefined" ? AIR_ASSET_WORDS : [],
    typeof FORCES_WORDS !== "undefined" ? FORCES_WORDS : [],
    typeof DROUGHT_WORDS !== "undefined" ? DROUGHT_WORDS : [],
    typeof HEAT_WORDS !== "undefined" ? HEAT_WORDS : [],
  ];
  for (const pool of pools) for (const w of pool) s.add(normKW(w));
  ALL_LEXICON_UNION.current = s;
  return s;
}

export function extractToponymsFromTokens(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const raw = t.trim();
    if (!raw) continue;
    const pretty = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    const n = normKW(raw);
    if (!n) continue;
    if (seen.has(n)) continue;
    if (isLikelyToponym(raw, getAllLexiconUnion())) {
      seen.add(n);
      out.push(pretty);
    }
  }
  return out;
}

export function lieuOf(
  input: Pick<DescriptionProposalInput, "ville" | "province" | "adresse"> & { keywords?: string },
): string {
  const fromForm = [input.ville, input.province, input.adresse]
    .map((s) => s.trim())
    .filter(Boolean);
  const fromKws = extractToponymsFromTokens(keywordTokens(input.keywords));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const x of [...fromForm, ...fromKws]) {
    const k = normKW(x);
    if (k && !seen.has(k)) { seen.add(k); merged.push(x); }
  }
  return merged.join(" · ") ?? "";
}

export function inject(s: string, label: string, lieu: string): string {
  const lieuDet = lieu ? ` au niveau de ${lieu}` : "";
  const labelCamel = label.charAt(0).toUpperCase() + label.slice(1);
  return s
    .replaceAll("{lieu}", lieu ? ` — ${lieu}` : "")
    .replaceAll("{lieuDet}", lieuDet)
    .replaceAll("{labelCamel}", labelCamel)
    .replaceAll("{label}", label);
}

export function buildDesc(p: DescPair, label: string, lieu: string): string {
  return `${inject(p.l1, label, lieu)}\n${inject(p.l2, label, lieu)}`;
}

export function rngSeed(seed: number, N: number): number {
  if (N <= 0) return 0;
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return Math.floor((x - Math.floor(x)) * N);
}

/* =========================== KEYWORDS HELPERS =========================== */

export function keywordTokens(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,;，、]+/)
    .map((t) => t.trim().replace(/^["'«»`]+|["'«»`]+$/g, ""))
    .filter(Boolean);
}

export function normKW(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "");
}

/* ======================================================================= */
/*                     NOUVEAU MOTEUR SÉMANTIQUE (demande utilisateur 2026-08-23)     */
/* ======================================================================= */

/* -------- Lexiques sémantiques -------- */
export const SEISMIC_WORDS = [
  "magnitude", "epicentre", "epicentres", "seisme", "seismes", "sismique", "sismiques",
  "tremblement", "secousse", "secousses", "tellurique", "telluriques", "replique",
  "repliques", "intensite", "intensites", "magnitudes", "tremblementterre",
  "tremblementsterre", "vibration", "vibrations", "seismes",
];
export const FIRE_WORDS = [
  "incendie", "incendies", "feu", "feux", "flamme", "flammes", "bruler", "brule",
  "embrasement", "embrasements", "fumee", "fumees", "fume", "fumes", "fumee", "fumer",
  "foyer", "foyers", "brousse", "brousses", "vegetation", "vegetaux", "foret",
  "forets", "propagation", "combustible", "inflammation", "braise", "braises", "flammes",
  "depart", "departdefeu", "deforest", "defriche", "fumee",
];
export const SMOKE_WORDS = ["fumee", "fumees", "fume", "fumes", "fumee", "fumer", "dense", "opaque", "nuee", "nuees", "fumigene"];
export const FLOOD_WORDS = [
  "inondation", "inondations", "innondation", "innondations", "eaux", "eau", "crue", "crues",
  "pluie", "pluies", "submersion", "submersions", "debo", "debords", "inonde",
  "montee", "montée", "debordement", "debordements", "torrent", "torrents",
  "precipitation", "precipitations", "coursdeau", "riviere", "ruissellement",
];
export const STORM_WORDS = [
  "tempete", "orages", "orage", "vents", "vent", "rafales", "cyclone", "ouragan",
  "depression", "tonnerre", "eclairs", "grain", "meteo", "perturbation",
];
export const COLLAPSE_WORDS = [
  "effondrement", "effondrements", "effondre", "ecroulement", "ecroulements",
  "effondrer", "deffondrement", "s'effondrer",
];
export const DAMAGE_WORDS = [
  "endommagés", "endommage", "endommages", "endommagees", "endommagees", "damage", "degrad",
  "degrades", "degats", "degats", "casse", "casser", "detruit", "detruits",
  "sinistre", "sinistres", "materiel", "abîme", "abimes", "abîmes", "perte", "pertes",
];
export const BUILDING_WORDS = [
  "batiment", "bâtiment", "batiments", "bâtiments", "immeuble", "immeubles",
  "logement", "logements", "maison", "maisons", "structure", "structures",
  "facade", "facades", "toiture", "toitures", "pont", "ponts", "infrastructure",
  "infrastructures", "habitation", "habitations", "etablissement", "etablissements",
  "pavillon",
];
export const HUMAN_WORDS = [
  "blesse", "blesses", "bles", "blessee", "blessees", "victime", "victimes", "deces",
  "decess", "mort", "morts", "decede", "cedes", "disparu", "disparus", "disparue",
  "disparues", "prisonnier", "prisonniers", "enseveli", "ensevelis", "bloque",
  "bloques", "evacue", "evacues", "sinistres", "fatal", "fatalites", "bilan",
  "humain", "kasualte", "casualties", "fatalite",
];
export const HAZARD_WORDS = [
  "risque", "risques", "danger", "dangers", "alerte", "alertes", "urgence",
  "urgences", "menace", "menaces", "crise", "crises", "hazard", "critical",
  "critique", "grave", "redoutable", "sensible", "sever", "haut", "eleve",
];
export const INDUSTRIAL_WORDS = [
  "industriel", "industriels", "industrie", "industries", "seveso", "usine", "usines",
  "site", "sites", "installation", "installations", "stockage", "atelier",
];
export const CBRN_WORDS = [
  "gaz", "chimique", "chimiques", "toxique", "toxiques",
  "propane", "butane", "cbrn", "nrbc", "radiologique", "radiologiques",
  "contamination", "contaminations", "ammoniac", "ammoniac", "chlore", "fluor", "carbonyle",
  "epandage", "epandages", "deversement", "deversements", "pollution",
  "pollutions", "rejet", "rejets", "odeur", "odeurs", "biologique", "biologiques",
  "nucleaire", "nucleaire", "pesticide", "pesticides", "methane", "mercaptan",
  "sulfure", "cyanure", "arsenic", "plomb", "mercure",
];
export const CBRN_ACTION_WORDS = ["fuite", "fuites"];
export const EXPLOSION_WORDS = [
  "explosion", "explosions", "deflagration", "deflagrations", "souffle", "souffles",
  "blast", "bombe", "bombes", "explose", "explosee",
];
export const EVACUATION_WORDS = [
  "evacuation", "evacuations", "evacuer", "evacue", "evacues", "secur",
  "securise", "securite", "exode", "exodes", "rassemblement", "abri", "abris",
  "deplacement", "deplacements",
];
export const MEDICAL_WORDS = [
  "hopital", "hospitals", "hopitaux", "hôpital", "hôpitaux", "lits", "lit",
  "rea", "reanim", "saturation", "saturations", "medical", "medicaux", "medecin",
  "medecins", "ambulance", "ambulances", "smur", "samu", "antenne", "priseencharge",
  "soins", "triage", "vaccin", "vaccins", "epidemie", "epidemies", "cluster",
  "clusters", "infectieux", "contamine", "cas", "groupes", "sanitaire",
  "sanitaires", "sante", "prevention",
];
export const ROAD_WORDS = [
  "accident", "accidents", "collision", "collisions", "choc", "chocs", "sortie",
  "sorties", "renversement", "renversements", "vehicule", "vehicules", "voiture",
  "voitures", "camion", "camions", "autoroute", "autoroutes", "route", "routes",
  "routier", "circulation", "circulations", "pieton", "pietons", "heurte",
  "heurte",
];
export const WATER_ASSET_WORDS = [
  "bateau", "bateaux", "navire", "navires", "embarcation", "embarcations",
  "maritime", "fluvial", "port", "ports", "sousmarin", "submersible", "naufrage",
  "naufrages", "baleinier",
];
export const AIR_ASSET_WORDS = [
  "helico", "helicos", "helicoptere", "helicopteres", "avion", "avions", "aerien",
  "aerien", "appuiaerien", "colonnemobile", "air",
];
export const FORCES_WORDS = [
  "pompier", "pompiers", "secours", "secouristes", "intervenant", "intervenants",
  "equipe", "equipes", "unite", "unites", "renfort", "renforts", "moyen",
  "moyens", "gendarmerie", "police", "securitecivile", "intervention", "arme",
  "armee", "militaires", "militaire",
];
export const DROUGHT_WORDS = [
  "secheresse", "secheresses", "seche", "seches", "penurie", "penuries",
  "hydrique", "stress", "manque", "manques", "sol", "sols", "sec",
  "nappes", "nappe", "eau", "alimentation", "restriction",
  "restrictions", "potable", "agricole", "agricoles",
  "aridite", "assechement", "secheresseprolongee",
];
export const HEAT_WORDS = [
  "chaleur", "chaleurs", "canicule", "canicules", "vagedechaleur",
  "picdechaleur", "temperature", "temperatures", "chaud",
  "extreme", "exceptionnel", "exceptionnelle", "episodecaniculaire",
];

/* -------- Détection TYPE INCIDENT à partir des keywords (pas étape 1) -------- */
