#!/usr/bin/env node
// ============================================================================
// Régénère `src/modules/domain/cities.data.ts` : le référentiel COMPLET des
// communes du Royaume (urbaines et rurales), avec leur province, leur région et
// leurs coordonnées — la liste déroulante « Ville » de chaque formulaire et la
// résolution d'un point posé sur la carte en lisent chacune.
//
// Sources, au moment de la fabrication (poste de développement, Internet) :
//   - Wikidata — les communes du Maroc (classe Q2989400 et ses sous-classes),
//     puis les villes et bourgs (Q515, Q3957, Q1549591, Q1637706) dont l'entité
//     n'est pas typée « commune » (Casablanca, Rabat, Fès…) ;
//   - `scripts/communes.curated.json` — les localités vérifiées à la main
//     (référentiel d'avant) : elles priment sur Wikidata (orthographe,
//     coordonnées) et complètent ce que la requête ne rend pas.
// La station, elle, n'appelle rien : le fichier généré est dans le dépôt.
//
//   node scripts/communes.mjs                # interroge Wikidata (2 à 3 min)
//   node scripts/communes.mjs --cache <dir>  # relit wd-communes.json et wd-cities.json
//
// Le rattachement d'une commune se lit dans l'entité Wikidata (P131) et se
// rapporte au nom EXACT d'une province de `provinces.data.ts` ; sans
// correspondance (entité rattachée à sa région), le chef-lieu le plus proche
// décide. Deux entrées de même nom dans la même province sont fusionnées.
// ============================================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const provincesPath = resolve(here, "../src/modules/domain/provinces.data.ts");
const curatedPath = resolve(here, "communes.curated.json");
const outPath = resolve(here, "../src/modules/domain/cities.data.ts");
const cacheArg = process.argv.indexOf("--cache");
const cacheDir = cacheArg >= 0 ? resolve(process.argv[cacheArg + 1]) : null;

// --- les provinces du dépôt ---------------------------------------------------
const provincesSrc = readFileSync(provincesPath, "utf8");
const PROVINCES = [...provincesSrc.matchAll(/\{ v: "([^"]+)", region: "([^"]+)", ll: \[([-\d.]+), ([-\d.]+)\] \}/g)].map((m) => ({
  v: m[1],
  region: m[2],
  ll: [Number(m[3]), Number(m[4])],
}));
if (PROVINCES.length !== 75) throw new Error(`provinces.data.ts : 75 provinces attendues, ${PROVINCES.length} lues`);
const REGION_ORDER = [...new Set(PROVINCES.map((p) => p.region))];

/** Clé de comparaison : sans accents, sans casse, sans ponctuation, sans « province de… ». */
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^(province|prefecture|préfecture)\s+(de\s+la\s+|des\s+|du\s+|de\s+|d['’]\s*)?/, "")
    .replace(/[^a-z]/g, "");
const PROVINCE_BY_KEY = new Map(PROVINCES.map((p) => [norm(p.v), p]));
// Libellés Wikidata qui ne se ramènent pas au nom du dépôt par la seule normalisation.
const PROVINCE_ALIASES = {
  // Wikidata libelle la province de Béni Mellal (Q1019461) « Aït Mellal » en français.
  aitmellal: "Béni Mellal",
  moulayyaacoub: "Moulay Yacoub",
  ouededdahab: "Oued Ed-Dahab (Dakhla)",
  elkelaadessraghna: "El Kelâa des Sraghna",
};
for (const [k, v] of Object.entries(PROVINCE_ALIASES)) {
  const p = PROVINCES.find((x) => x.v === v);
  if (!p) throw new Error(`alias vers une province inconnue : ${v}`);
  PROVINCE_BY_KEY.set(k, p);
}
function provinceOf(labels, ll) {
  for (const label of labels) {
    const p = PROVINCE_BY_KEY.get(norm(label));
    if (p) return { p, byLabel: true };
  }
  // Rattachée à sa région, ou libellé inconnu : le chef-lieu le plus proche.
  let best = null;
  let bestD = Infinity;
  for (const p of PROVINCES) {
    const d = (p.ll[0] - ll[0]) ** 2 + (p.ll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { p: best, byLabel: false };
}

// --- Wikidata -------------------------------------------------------------------
const SPARQL = "https://query.wikidata.org/sparql";
const UA = "ARGOS-IRIS communes generator (https://github.com/zraib; dev-time only)";
const Q_COMMUNES = `SELECT ?item ?itemLabel ?fr ?coord ?provLabel ?typeLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q2989400 . ?item wdt:P17 wd:Q1028 .
  OPTIONAL { ?item wdt:P625 ?coord . } OPTIONAL { ?item wdt:P131 ?prov . } OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?item rdfs:label ?fr FILTER(LANG(?fr)="fr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }`;
const Q_CITIES = `SELECT ?item ?itemLabel ?fr ?coord ?provLabel ?typeLabel WHERE {
  VALUES ?cls { wd:Q515 wd:Q3957 wd:Q1549591 wd:Q1637706 }
  ?item wdt:P31/wdt:P279* ?cls . ?item wdt:P17 wd:Q1028 . ?item wdt:P625 ?coord .
  OPTIONAL { ?item wdt:P131 ?prov . } OPTIONAL { ?item wdt:P31 ?type . }
  OPTIONAL { ?item rdfs:label ?fr FILTER(LANG(?fr)="fr") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". } }`;

async function fetchRows(query, cacheName) {
  const cached = cacheDir ? join(cacheDir, cacheName) : null;
  if (cached && existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")).results.bindings;
  const url = `${SPARQL}?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/sparql-results+json", "User-Agent": UA } });
  if (!res.ok) throw new Error(`Wikidata ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (cached) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cached, JSON.stringify(json));
  }
  return json.results.bindings;
}

/** Regroupe les lignes SPARQL (une par combinaison province × type) par entité. */
function groupItems(rows) {
  const items = new Map();
  for (const r of rows) {
    const q = r.item.value.split("/").pop();
    const it = items.get(q) ?? { q, label: r.itemLabel?.value, fr: r.fr?.value, coord: r.coord?.value, provs: new Set(), types: new Set() };
    if (r.provLabel) it.provs.add(r.provLabel.value);
    if (r.typeLabel) it.types.add(r.typeLabel.value);
    items.set(q, it);
  }
  return [...items.values()];
}

const URBAN_TYPES = new Set(["municipalité", "ville", "grande ville", "petite ville", "ville frontalière", "ville nouvelle", "commune urbaine du Maroc"]);
const PLACE_TYPES = new Set([...URBAN_TYPES, "commune du Maroc", "commune rurale du Maroc", "établissement humain", "village", "chef-lieu"]);
function parsePoint(coord) {
  const m = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(coord ?? "");
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// --- fusion ---------------------------------------------------------------------
const curated = JSON.parse(readFileSync(curatedPath, "utf8"));
const byProvince = new Map(); // province.v → Map(nameKey → entry)
const put = (entry, { force = false } = {}) => {
  const bucket = byProvince.get(entry.province) ?? new Map();
  byProvince.set(entry.province, bucket);
  const k = norm(entry.v);
  const prev = bucket.get(k);
  if (prev && !force) {
    // Même nom, même province : on garde l'entrée en place, on retient le rang urbain si l'une le dit.
    if (entry.kind === "urban") prev.kind = "urban";
    return false;
  }
  bucket.set(k, entry);
  return true;
};
for (const c of curated) {
  const p = PROVINCES.find((x) => x.v === c.province);
  if (!p) throw new Error(`communes.curated.json : province inconnue « ${c.province} » (${c.v})`);
  put({ v: c.v, province: p.v, region: p.region, ll: c.ll, kind: c.kind ?? "urban", curated: true }, { force: true });
}

const stats = { communes: 0, villes: 0, ajoutees: 0, sansCoord: 0, sansNom: 0, horsType: 0, provinceParDistance: 0 };
function absorb(items, kindOf, label) {
  for (const it of items) {
    stats[label] += 1;
    // Wikidata désambiguïse certains libellés : « Ameur (Maroc) » → « Ameur ».
    const name = (it.fr ?? it.label ?? "").replace(/\s*\((Maroc|commune|province[^)]*)\)\s*$/i, "").trim();
    if (!name || /^Q\d+$/.test(name)) {
      stats.sansNom += 1;
      continue;
    }
    const ll = parsePoint(it.coord);
    if (!ll) {
      stats.sansCoord += 1;
      continue;
    }
    if (![...it.types].some((t) => PLACE_TYPES.has(t))) {
      stats.horsType += 1; // ksour, sites archéologiques, « patrimoine conservé »…
      continue;
    }
    const { p, byLabel } = provinceOf([...it.provs], ll);
    if (!byLabel) stats.provinceParDistance += 1;
    const kind = kindOf(it);
    if (put({ v: name, province: p.v, region: p.region, ll: [Number(ll[0].toFixed(4)), Number(ll[1].toFixed(4))], kind })) stats.ajoutees += 1;
  }
}
const communes = groupItems(await fetchRows(Q_COMMUNES, "wd-communes.json"));
absorb(communes, (it) => ([...it.types].some((t) => URBAN_TYPES.has(t)) ? "urban" : "rural"), "communes");
const villes = groupItems(await fetchRows(Q_CITIES, "wd-cities.json"));
absorb(villes, () => "urban", "villes");

// --- écriture -------------------------------------------------------------------
const collator = new Intl.Collator("fr");
const lines = [];
let total = 0;
for (const region of REGION_ORDER) {
  lines.push(`  // — ${region} —`);
  for (const p of PROVINCES.filter((x) => x.region === region)) {
    const entries = [...(byProvince.get(p.v)?.values() ?? [])].sort((a, b) => collator.compare(a.v, b.v));
    for (const e of entries) {
      total += 1;
      const kind = e.kind === "rural" ? ', kind: "rural"' : "";
      lines.push(`  { v: ${JSON.stringify(e.v)}, province: ${JSON.stringify(p.v)}, region: ${JSON.stringify(region)}, ll: [${e.ll[0]}, ${e.ll[1]}]${kind} },`);
    }
  }
}
const header = `// ============================================================================
// ARGOS — référentiel des communes du Royaume (localisation fine des incidents,
// des unités, des abris, des hôpitaux et des sites mortuaires)
//
// FICHIER GÉNÉRÉ par \`scripts/communes.mjs\` — ne pas éditer à la main : les
// corrections vont dans \`scripts/communes.curated.json\` (localités vérifiées,
// qui priment), puis on régénère. ${total} communes urbaines et rurales, chacune
// rattachée au nom EXACT d'une province de \`provinces.data.ts\` — c'est ce lien
// qui permet, une province choisie, de ne proposer que ses communes. Les
// coordonnées sont celles du chef-lieu de la commune (Wikidata, ~100 m à 2 km).
// ============================================================================

export interface CityDef {
  v: string;
  /** Province ou préfecture de rattachement — nom EXACT d'une entrée de \`PROVINCES_MA\`. */
  province: string;
  region: string;
  ll: [number, number];
  /** Commune rurale ; absent : commune urbaine (municipalité, ville). */
  kind?: "rural";
}

export const CITIES_MA: CityDef[] = [
`;
writeFileSync(outPath, `${header}${lines.join("\n")}\n];\n`, "utf8");
console.log(`cities.data.ts : ${total} communes — ${JSON.stringify(stats)}`);
