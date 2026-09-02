// ============================================================================
// lib/incidents/wizard.ts — la logique de l'assistant « Signaler un incident »
//
// Tout ce que l'assistant DÉCIDE sans React : la forme du formulaire, son
// pré-remplissage depuis une fiche existante, la validation de chaque étape,
// l'appariement local d'une adresse, le classement des moyens par proximité,
// et la construction de la charge envoyée à l'API. Le composant ne fait plus
// que tenir l'état et dessiner ; ce qui se trompe se teste ici.
// ============================================================================

import type { CreateIncidentBody } from "@/lib/api-client";
import { casualtyKind } from "@/lib/derive";
import { llToSvg, svgToLL, typeLabel } from "@/lib/helpers";
import type { City, Incident, IncidentTypeDef, Lang, NrbcDetails, NrbcFamily, Province } from "@/lib/types";

// --- le formulaire ------------------------------------------------------------

export type NrbcSpill = "small" | "large";
export type NrbcRelease = "instant" | "continuous";

/** Ce que l'opérateur saisit, tel quel : des chaînes, jamais déjà interprétées. */
export interface WizardForm {
  type: string | null;
  keywords: string[];
  keywordDraft: string;
  title: string;
  desc: string;
  files: string[];
  adresse: string;
  prov: string;
  city: string;
  lat: string;
  lng: string;
  /** Point résolu [lng, lat] — source de vérité unique de la localisation. */
  pt: [number, number] | null;
  dead: string;
  injured: string;
  missing: string;
  infected: string;
  contaminated: string;
  units: string[];
  hospitals: string[];
  nrbcFamily: NrbcFamily | null;
  nrbcSubstance: string;
  nrbcSpill: NrbcSpill;
  nrbcRelease: NrbcRelease;
}

export const EMPTY_FORM: WizardForm = {
  type: null,
  keywords: [],
  keywordDraft: "",
  title: "",
  desc: "",
  files: [],
  adresse: "",
  prov: "",
  city: "",
  lat: "",
  lng: "",
  pt: null,
  dead: "",
  injured: "",
  missing: "",
  infected: "",
  contaminated: "",
  units: [],
  hospitals: [],
  nrbcFamily: null,
  nrbcSubstance: "",
  nrbcSpill: "large",
  nrbcRelease: "instant",
};

export const LAST_STEP = 4;

/** Pose le point et aligne les champs de coordonnées affichés (5 décimales). */
export function withPoint(form: WizardForm, ll: [number, number]): WizardForm {
  return { ...form, pt: ll, lng: ll[0].toFixed(5), lat: ll[1].toFixed(5) };
}

/**
 * Pré-remplissage en mode édition.
 *
 * La description est rechargée : depuis le lot V-3 l'API la conserve, et
 * rouvrir une fiche n'efface plus le récit à la première modification. Les
 * compteurs absents restent des chaînes vides, pas « 0 » : un zéro saisi et un
 * champ laissé vide ne disent pas la même chose.
 */
export function formFromIncident(inc: Incident): WizardForm {
  const c = inc.casualties;
  return withPoint(
    {
      ...EMPTY_FORM,
      type: inc.type,
      title: inc.titre,
      desc: inc.desc ?? "",
      adresse: inc.adresse ?? "",
      dead: c ? String(c.dead) : "",
      injured: c ? String(c.injured) : "",
      missing: c ? String(c.missing) : "",
      infected: c ? String(c.infected ?? "") : "",
      contaminated: c ? String(c.contaminated ?? "") : "",
      units: inc.responders?.units ?? [],
      hospitals: inc.responders?.hospitals ?? [],
      nrbcFamily: inc.nrbc?.family ?? null,
      nrbcSubstance: inc.nrbc?.substanceId ?? "",
      nrbcSpill: inc.nrbc?.spill ?? "large",
      nrbcRelease: inc.nrbc?.release ?? "instant",
    },
    inc.ll,
  );
}

// --- validation ---------------------------------------------------------------

/** Peut-on passer à l'étape suivante ? Type choisi, puis titre, puis point posé. */
export function canNext(step: number, form: Pick<WizardForm, "type" | "title" | "pt">): boolean {
  if (step === 1) return !!form.type;
  if (step === 2) return !!form.title.trim();
  if (step === 3) return form.pt !== null;
  return true;
}

/** Récapitulatif des coordonnées, dérivé du point (cohérent avec les champs). */
export function coordsText(pt: [number, number] | null): string {
  if (!pt) return "—";
  return `${pt[1].toFixed(3)}° ${pt[1] >= 0 ? "N" : "S"} · ${Math.abs(pt[0]).toFixed(3)}° ${pt[0] >= 0 ? "E" : "W"}`;
}

// --- géographie ---------------------------------------------------------------

/** Normalisation pour l'appariement local d'adresse (minuscules, sans accents). */
export const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Province la plus proche d'un point géographique (rattachement région). */
export function nearestProvince(ll: [number, number], provinces: Province[]): Province | undefined {
  let best: Province | undefined;
  let bestD = Infinity;
  for (const p of provinces) {
    const pll = p.ll ?? svgToLL(p.x, p.y);
    const d = (pll[0] - ll[0]) ** 2 + (pll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Distance approximative en km entre deux points [lng, lat] (équirectangulaire). */
export function distKm(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111;
  const dLng = (a[0] - b[0]) * 111 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

/** Classe les moyens du plus proche au plus loin du point (sinon ordre d'origine, km inconnu). */
export function rankByDistance<T extends { ll: [number, number] }>(
  items: T[],
  pt: [number, number] | null,
): (T & { km: number | null })[] {
  if (!pt) return items.map((i) => ({ ...i, km: null }));
  return items.map((i) => ({ ...i, km: distKm(i.ll, pt) })).sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
}

/**
 * Appariement local d'une adresse saisie contre le référentiel villes/provinces.
 *
 * Exact d'abord, puis préfixe ; les villes avant les provinces. Sous trois
 * caractères on ne devine pas : « ra » désignerait Rabat comme Rachidia.
 */
export function matchPlace(text: string, cities: City[], provinces: Province[]): [number, number] | null {
  const q = norm(text);
  if (q.length < 3) return null;
  const c = cities.find((x) => norm(x.v) === q) ?? cities.find((x) => norm(x.v).startsWith(q));
  if (c) return c.ll;
  const p = provinces.find((x) => norm(x.v) === q) ?? provinces.find((x) => norm(x.v).startsWith(q));
  if (p) return p.ll ?? svgToLL(p.x, p.y);
  return null;
}

/** Villes proposées : celles de la région de la province choisie, sinon toutes. */
export function cityOptionsFor(province: Province | undefined, cities: City[]): City[] {
  const reg = province?.region;
  return reg ? cities.filter((c) => c.region === reg) : cities;
}

// --- bilan humain -------------------------------------------------------------

/** Un compteur saisi : entier positif, « » ou n'importe quoi d'autre = 0. */
export function parseCount(s: string): number {
  return Math.max(0, parseInt(s, 10) || 0);
}

export type CasualtyField = "injured" | "infected" | "contaminated";

/**
 * Le champ central du bilan dépend du type d'incident : NRBC / chimique →
 * contaminés ; épidémie → infectés ; sinon blessés.
 */
export function casualtySecondary(type: string | null): { field: CasualtyField; label: string; color: string } {
  const k = casualtyKind(type ?? "");
  if (k === "epidemic") return { field: "infected", label: "Infectés", color: "text-pink-600" };
  if (k === "hazmat") return { field: "contaminated", label: "Contaminés", color: "text-purple-600" };
  return { field: "injured", label: "Blessés", color: "text-orange-500" };
}

export type CasualtiesBody = {
  dead: number;
  injured: number;
  missing: number;
  infected?: number;
  contaminated?: number;
};

/** Le bilan à envoyer — ou rien du tout si aucun compteur n'est renseigné. */
export function buildCasualties(
  form: Pick<WizardForm, "dead" | "injured" | "missing" | "infected" | "contaminated">,
): CasualtiesBody | undefined {
  const dead = parseCount(form.dead);
  const injured = parseCount(form.injured);
  const missing = parseCount(form.missing);
  const infected = parseCount(form.infected);
  const contaminated = parseCount(form.contaminated);
  if (dead + injured + missing + infected + contaminated === 0) return undefined;
  return {
    dead,
    injured,
    missing,
    ...(infected > 0 ? { infected } : {}),
    ...(contaminated > 0 ? { contaminated } : {}),
  };
}

// --- volet NRBC ---------------------------------------------------------------

/**
 * Le volet NRBC n'existe que pour le type dédié, avec une famille choisie ; la
 * substance et l'ampleur n'ont de sens que pour la famille chimique.
 */
export function buildNrbc(
  form: Pick<WizardForm, "type" | "nrbcFamily" | "nrbcSubstance" | "nrbcSpill" | "nrbcRelease">,
): NrbcDetails | undefined {
  if (form.type !== "nrbc" || !form.nrbcFamily) return undefined;
  const chimique = form.nrbcFamily === "C";
  return {
    family: form.nrbcFamily,
    substanceId: chimique && form.nrbcSubstance ? form.nrbcSubstance : undefined,
    spill: chimique ? form.nrbcSpill : undefined,
    release: chimique ? form.nrbcRelease : undefined,
  };
}

// --- la charge envoyée à l'API ---------------------------------------------------

export interface WizardContext {
  cities: City[];
  provinces: Province[];
  incidentTypes: IncidentTypeDef[];
  lang: Lang;
}

/** Ce que l'assistant envoie (PATCH en édition ; la création y ajoute gravité et statut). */
export interface IncidentWizardBody {
  type: string;
  titre: string;
  region: CreateIncidentBody["region"];
  adresse?: string;
  desc?: string;
  x: number;
  y: number;
  ll: [number, number];
  casualties?: CasualtiesBody;
  responders?: { units: string[]; hospitals: string[] };
  nrbc?: NrbcDetails;
}

/**
 * Où rattacher l'incident : la ville choisie, sinon la province choisie, sinon
 * la province la plus proche du point. Rend aussi le lieu à inscrire dans un
 * titre de repli.
 */
export function resolvePlace(
  form: Pick<WizardForm, "pt" | "prov" | "city">,
  ctx: Pick<WizardContext, "cities" | "provinces">,
): { region: string | undefined; place: string | undefined } {
  const province = ctx.provinces.find((p) => p.v === form.prov);
  const city = ctx.cities.find((c) => c.v === form.city);
  const attached = province ?? (form.pt ? nearestProvince(form.pt, ctx.provinces) : undefined);
  return { region: city?.region ?? attached?.region, place: city?.v ?? attached?.v };
}

/**
 * Construit la charge. Rend `null` si la région n'est pas résolvable.
 *
 * La région est une CLÉ DE VISIBILITÉ (lot V-1) : l'API la contraint au
 * référentiel des douze régions, et un repli « — » serait refusé en 400 sans
 * que l'opérateur sache pourquoi. On s'arrête donc ici, ce qui n'arrive que si
 * le référentiel géographique n'a pas été chargé.
 */
export function buildIncidentBody(form: WizardForm, ctx: WizardContext): IncidentWizardBody | null {
  if (!form.pt) return null;
  const { region, place } = resolvePlace(form, ctx);
  if (!region) return null;
  const { x, y } = llToSvg(form.pt);
  const type = form.type ?? ctx.incidentTypes[0]?.id ?? "earthquake";
  const responders = form.units.length + form.hospitals.length > 0 ? { units: form.units, hospitals: form.hospitals } : undefined;
  return {
    type,
    titre: form.title.trim() || typeLabel(form.type ?? "", ctx.incidentTypes, ctx.lang) + (place ? ` — ${place}` : ""),
    region: region as CreateIncidentBody["region"],
    adresse: form.adresse.trim() || undefined,
    // La description était saisie depuis toujours et jamais envoyée : le seul
    // récit de l'événement disparaissait à l'enregistrement. L'API la conserve
    // depuis le lot V-3, et le tableau de bord de l'opération l'affiche.
    desc: form.desc.trim() || undefined,
    x,
    y,
    ll: form.pt,
    casualties: buildCasualties(form),
    responders,
    nrbc: buildNrbc(form),
  };
}
