// ============================================================================
// lib/incidents/wizard.ts — la logique de l'assistant « Signaler un incident »
//
// Tout ce que l'assistant DÉCIDE sans React : la forme du formulaire, son
// pré-remplissage depuis une fiche existante, la validation de chaque étape,
// l'appariement local d'une adresse, le classement des moyens par proximité,
// et la construction de la charge envoyée à l'API. Le composant ne fait plus
// que tenir l'état et dessiner ; ce qui se trompe se teste ici.
// ============================================================================

import { distKm, nearestProvince, provinceLL, resolvePoint } from "@/lib/geo";
import type { CreateIncidentBody } from "@/lib/api-client";
import { casualtyKind } from "@/lib/derive";
import { llToSvg, svgToLL, typeLabel } from "@/lib/helpers";
import type { City, Incident, IncidentTypeDef, Lang, NrbcDetails, NrbcFamily, Province } from "@/lib/types";

// --- le formulaire ------------------------------------------------------------

export type NrbcSpill = "small" | "large";
export type NrbcRelease = "instant" | "continuous";

/**
 * Qui tient la localisation. Une seule source à la fois : deux sources, ce
 * serait deux vérités.
 * - `none`   : rien n'est posé.
 * - `admin`  : région → province → ville choisies ; le point en découle et les
 *              coordonnées se verrouillent.
 * - `coords` : coordonnées saisies ; le découpage administratif en découle et
 *              se verrouille.
 * - `point`  : point posé (carte, géolocalisation, adresse reconnue) ; tout
 *              est déduit, rien n'est verrouillé — toucher un champ reprend la main.
 */
export type LocMode = "none" | "admin" | "coords" | "point";

/** Ce que l'opérateur saisit, tel quel : des chaînes, jamais déjà interprétées. */
export interface WizardForm {
  type: string | null;
  keywords: string[];
  keywordDraft: string;
  title: string;
  desc: string;
  files: string[];
  adresse: string;
  region: string;
  prov: string;
  city: string;
  lat: string;
  lng: string;
  /** Point résolu [lng, lat] — ce qui part à l'API et ce que la carte montre. */
  pt: [number, number] | null;
  locMode: LocMode;
  dead: string;
  injured: string;
  missing: string;
  infected: string;
  contaminated: string;
  /** Personnes impliquées : touchées sans être victimes (ADR 0034). */
  involved: string;
  units: string[];
  hospitals: string[];
  /** Sites mortuaires proposés dès qu'un décès est déclaré, comme les unités et les hôpitaux. */
  morgues: string[];
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
  region: "",
  prov: "",
  city: "",
  lat: "",
  lng: "",
  pt: null,
  locMode: "none",
  dead: "",
  injured: "",
  missing: "",
  infected: "",
  contaminated: "",
  involved: "",
  units: [],
  hospitals: [],
  morgues: [],
  nrbcFamily: null,
  nrbcSubstance: "",
  nrbcSpill: "large",
  nrbcRelease: "instant",
};

export const LAST_STEP = 4;

/** Le référentiel géographique dont la localisation a besoin. */
export type GeoRef = { provinces: readonly Province[]; cities: readonly City[] };

/** Pose le point et aligne les champs de coordonnées affichés (5 décimales). */
export function withPoint(form: WizardForm, ll: [number, number]): WizardForm {
  return { ...form, pt: ll, lng: ll[0].toFixed(5), lat: ll[1].toFixed(5) };
}

/** Le découpage administratif tel que le point le dit — vide quand le référentiel manque. */
function derivedPlace(ll: [number, number], geo: GeoRef): Pick<WizardForm, "region" | "prov" | "city"> {
  const r = resolvePoint(ll, geo.provinces, geo.cities);
  return { region: r.region ?? "", prov: r.province ?? "", city: r.city ?? "" };
}

/**
 * Un point posé (carte, géolocalisation, adresse reconnue) : région, province,
 * ville et coordonnées s'alignent sur lui. Rien n'est verrouillé.
 */
export function placePoint(form: WizardForm, ll: [number, number], geo: GeoRef): WizardForm {
  return { ...withPoint(form, ll), ...derivedPlace(ll, geo), locMode: "point" };
}

export interface PlaceChoice {
  region: string;
  province: string;
  city: string;
}

/**
 * Un lieu choisi dans la cascade : le point est celui de la ville, sinon le
 * chef-lieu de la province, et les coordonnées se verrouillent. Une région
 * seule ne localise rien : le point est retiré, sans verrou.
 */
export function choosePlace(form: WizardForm, v: PlaceChoice, geo: GeoRef): WizardForm {
  const base: WizardForm = { ...form, region: v.region, prov: v.province, city: v.city };
  // Des communes homonymes existent d'une province à l'autre : celle de la province choisie d'abord.
  const city = v.city ? (geo.cities.find((c) => c.v === v.city && c.province === v.province) ?? geo.cities.find((c) => c.v === v.city)) : undefined;
  const province = v.province ? geo.provinces.find((x) => x.v === v.province) : undefined;
  const ll = city?.ll ?? (province ? provinceLL(province) : undefined);
  if (!ll) return { ...base, pt: null, lat: "", lng: "", locMode: "none" };
  return { ...withPoint(base, ll), locMode: "admin" };
}

/**
 * Des coordonnées saisies : dès la première frappe le découpage administratif
 * se verrouille ; dès que les deux valeurs se lisent, le point bouge et le
 * découpage est déduit. Les deux champs vidés rendent la main.
 */
export function typeCoords(form: WizardForm, typed: { lat?: string; lng?: string }, geo: GeoRef): WizardForm {
  const lat = typed.lat ?? form.lat;
  const lng = typed.lng ?? form.lng;
  if (!lat.trim() && !lng.trim()) return { ...form, lat, lng, pt: null, region: "", prov: "", city: "", locMode: "none" };
  const la = parseFloat(lat);
  const lo = parseFloat(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return { ...form, lat, lng, locMode: "coords" };
  const ll: [number, number] = [lo, la];
  return { ...form, lat, lng, pt: ll, ...derivedPlace(ll, geo), locMode: "coords" };
}

/**
 * L'adresse libre : si elle nomme une ville ou une province connue, elle pose
 * le point — sauf quand l'opérateur a déjà choisi un lieu ou saisi des
 * coordonnées : un nom tapé dans un complément d'adresse ne renverse pas ce choix.
 */
export function typeAddress(form: WizardForm, adresse: string, geo: GeoRef): WizardForm {
  const free = form.locMode === "none" || form.locMode === "point";
  const m = free ? matchPlace(adresse, geo.cities, geo.provinces) : null;
  return m ? placePoint({ ...form, adresse }, m, geo) : { ...form, adresse };
}

/** Efface la localisation ; l'adresse libre, tapée à la main, reste. */
export function clearLocation(form: WizardForm): WizardForm {
  return { ...form, region: "", prov: "", city: "", lat: "", lng: "", pt: null, locMode: "none" };
}

/** Ce qui est verrouillé : l'un des deux côtés, jamais les deux. */
export function locationLocks(form: Pick<WizardForm, "locMode">): { admin: boolean; coords: boolean } {
  return { admin: form.locMode === "coords", coords: form.locMode === "admin" };
}

/**
 * Pré-remplissage en mode édition.
 *
 * La description est rechargée : depuis le lot V-3 l'API la conserve, et
 * rouvrir une fiche n'efface plus le récit à la première modification. Les
 * compteurs absents restent des chaînes vides, pas « 0 » : un zéro saisi et un
 * champ laissé vide ne disent pas la même chose. Avec le référentiel, le
 * découpage administratif est relu depuis le point de la fiche.
 */
export function formFromIncident(inc: Incident, geo?: GeoRef): WizardForm {
  const c = inc.casualties;
  const base: WizardForm = {
    ...EMPTY_FORM,
    type: inc.type,
    title: inc.titre,
    desc: inc.desc ?? "",
    adresse: inc.adresse ?? "",
    region: inc.region ?? "",
    dead: c ? String(c.dead) : "",
    injured: c ? String(c.injured) : "",
    missing: c ? String(c.missing) : "",
    infected: c ? String(c.infected ?? "") : "",
    contaminated: c ? String(c.contaminated ?? "") : "",
    involved: c?.involved ? String(c.involved) : "",
    units: inc.responders?.units ?? [],
    hospitals: inc.responders?.hospitals ?? [],
    morgues: inc.responders?.morgues ?? [],
    nrbcFamily: inc.nrbc?.family ?? null,
    nrbcSubstance: inc.nrbc?.substanceId ?? "",
    nrbcSpill: inc.nrbc?.spill ?? "large",
    nrbcRelease: inc.nrbc?.release ?? "instant",
  };
  return geo ? placePoint(base, inc.ll, geo) : withPoint(base, inc.ll);
}

// --- validation ---------------------------------------------------------------

/** Peut-on passer à l'étape suivante ?
 *  Ordre : 1 Type → 2 Localisation → 3 Victimes/Moyens → 4 Détails (Titre+Description, IA auto)
 */
export function canNext(step: number, form: Pick<WizardForm, "type" | "title" | "pt">): boolean {
  if (step === 1) return !!form.type;
  if (step === 2) return form.pt !== null;
  if (step === 3) return true;
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

// Les aides géographiques (province la plus proche, distance, cascade) vivent
// dans `lib/geo` — un seul endroit pour tous les écrans. Réexportées ici pour
// les appelants historiques du wizard.
export { distKm, nearestProvince };

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
export function matchPlace(text: string, cities: readonly City[], provinces: readonly Province[]): [number, number] | null {
  const q = norm(text);
  if (q.length < 3) return null;
  const c = cities.find((x) => norm(x.v) === q) ?? cities.find((x) => norm(x.v).startsWith(q));
  if (c) return c.ll;
  const p = provinces.find((x) => norm(x.v) === q) ?? provinces.find((x) => norm(x.v).startsWith(q));
  if (p) return p.ll ?? svgToLL(p.x, p.y);
  return null;
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
  /** Personnes impliquées — jamais comptées parmi les victimes (ADR 0034). */
  involved?: number;
};

/** Le bilan à envoyer — ou rien du tout si aucun compteur n'est renseigné. */
export function buildCasualties(
  form: Pick<WizardForm, "dead" | "injured" | "missing" | "infected" | "contaminated" | "involved">,
): CasualtiesBody | undefined {
  const dead = parseCount(form.dead);
  const injured = parseCount(form.injured);
  const missing = parseCount(form.missing);
  const infected = parseCount(form.infected);
  const contaminated = parseCount(form.contaminated);
  const involved = parseCount(form.involved);
  if (dead + injured + missing + infected + contaminated + involved === 0) return undefined;
  return {
    dead,
    injured,
    missing,
    ...(infected > 0 ? { infected } : {}),
    ...(contaminated > 0 ? { contaminated } : {}),
    ...(involved > 0 ? { involved } : {}),
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
  responders?: { units: string[]; hospitals: string[]; morgues?: string[] };
  nrbc?: NrbcDetails;
}

/** Au moins un décédé déclaré : la déclaration propose alors les sites mortuaires. */
export function needsMorgue(form: Pick<WizardForm, "dead">): boolean {
  return parseCount(form.dead) >= 1;
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
  const city = ctx.cities.find((c) => c.v === form.city && (!form.prov || c.province === form.prov)) ?? ctx.cities.find((c) => c.v === form.city);
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
  // Les morgues ne partent qu'avec un décès déclaré : sans lui, un site coché par erreur ne rattache personne.
  const morgues = needsMorgue(form) ? form.morgues : [];
  const responders =
    form.units.length + form.hospitals.length + morgues.length > 0
      ? { units: form.units, hospitals: form.hospitals, ...(morgues.length > 0 ? { morgues } : {}) }
      : undefined;
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
