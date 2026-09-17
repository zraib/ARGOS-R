// Constructeurs de marqueurs HTML pour la carte opérationnelle — répliquent
// les glyphes stylés du prototype pour que la carte soit identique à l'export.

import type {
  AircraftRole,
  FieldHospital,
  Hospital,
  HospitalKind,
  Incident,
  TrackingStatus,
  Unit,
  VehRoute,
} from "@/lib/types";
import { incidentFill } from "@/lib/helpers";
import { fieldKind, hospKind, kindDef } from "@/lib/hospitals";
import { FAMILY_PICTOGRAM, hazardSvgString } from "@/lib/hazard/pictograms";

export function selRing(sel: boolean): string {
  return sel ? "box-shadow: 0 0 0 3px #C9A84C, 0 0 12px rgba(201,168,76,0.8); border-radius: 9999px;" : "";
}

/**
 * Poste d'opération : une étiquette pleine, de la couleur de sa nature, qui
 * porte son code (OPCOM, TACOM, cellule, abri, parc) et, dessous, son libellé
 * ou l'entité qu'il représente.
 */
export function postMarkerHTML(code: string, fill: string, sel: boolean, caption?: string): string {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
    `<div style="padding:2px 6px;border-radius:6px;background:${fill};border:2px solid #0f1f14;color:#fff;font:800 9px Inter,sans-serif;letter-spacing:.04em;text-shadow:0 1px 1px rgba(0,0,0,.5);white-space:nowrap;${selRing(sel)}">${esc(code)}</div>` +
    (caption
      ? `<span style="font:700 9px Inter,sans-serif;color:#fff;text-shadow:0 1px 2px #000;background:rgba(15,31,20,.7);padding:0 4px;border-radius:4px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(caption)}</span>`
      : "") +
    "</div>"
  );
}

/** Ressource posée sur le terrain (ADR 0018) : pastille ronde à code court, pour ne pas la confondre avec un poste. */
export function placedMarkerHTML(code: string, fill: string, sel: boolean, caption?: string): string {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
    `<div style="min-width:22px;padding:3px 5px;border-radius:999px;background:${fill};border:2px solid #0f1f14;color:#fff;font:800 9px Inter,sans-serif;letter-spacing:.04em;text-align:center;text-shadow:0 1px 1px rgba(0,0,0,.5);white-space:nowrap;${selRing(sel)}">${esc(code)}</div>` +
    (caption
      ? `<span style="font:700 9px Inter,sans-serif;color:#fff;text-shadow:0 1px 2px #000;background:rgba(15,31,20,.7);padding:0 4px;border-radius:4px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(caption)}</span>`
      : "") +
    "</div>"
  );
}

export function unitMarkerHTML(u: Unit, sel: boolean): string {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;">' +
    `<div style="width:16px;height:16px;background:#C9A84C;border:2px solid #0f1f14;${selRing(sel)}"></div>` +
    `<span style="font:700 9px Inter,sans-serif;color:#fff;text-shadow:0 1px 2px #000;background:rgba(15,31,20,.7);padding:0 4px;border-radius:4px;">${u.id}</span></div>`
  );
}

// --- Symboles des établissements de santé ---------------------------------
// Grammaire visuelle commune aux six catégories (voir lib/hospitals.ts) :
//   FORME   hexagone = réseau militaire · cercle = réseau civil
//   TRAIT   plein = structure permanente · pointillé = hôpital de campagne
//   COULEUR or = militaire · violet = CHU · bleu = CHR · rouge = CHP / local

/** Croix + croissant (emblèmes humanitaires jumelés), dans la couleur donnée. */
function crossCrescentSVG(color: string, w = 15): string {
  return (
    `<svg width="${w}" height="${Math.round((w * 20) / 26)}" viewBox="0 0 26 20" aria-hidden="true">` +
    `<path fill-rule="evenodd" fill="${color}" d="M8,10 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M10.8,10 m-5.8,0 a5.8,5.8 0 1,0 11.6,0 a5.8,5.8 0 1,0 -11.6,0"/>` +
    `<path fill="${color}" d="M19 5.5h4v3h3v4h-3v3h-4v-3h-3v-4h3z"/></svg>`
  );
}

/** Tente de campagne surmontée d'une croix — structure déployée. */
function tentSVG(color: string, w = 15): string {
  return (
    `<svg width="${w}" height="${w}" viewBox="0 0 20 20" aria-hidden="true">` +
    `<path fill="${color}" d="M10 3.2 2.4 15.6h4.9L10 10.4l2.7 5.2h4.9z"/>` +
    `<path fill="#fff" d="M9.2 11.2h1.6v1.5h1.5v1.6h-1.5v1.5H9.2v-1.5H7.7v-1.6h1.5z"/></svg>`
  );
}

/** Enveloppe hexagonale (réseau militaire) : clip-path CSS, pas d'image. */
const HEX_CLIP = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

/**
 * Marqueur d'un établissement de santé, différencié par catégorie.
 * Le libellé `title` porte le nom et l'échelon (info-bulle native).
 */
export function healthMarkerHTML(kind: HospitalKind, title: string, sel: boolean): string {
  const d = kindDef(kind);
  const mil = d.reseau === "militaire";
  const dash = d.campagne ? "dashed" : "solid";
  const glyph = d.campagne ? tentSVG(mil ? "#F5DE9B" : "#EF4444", 15) : crossCrescentSVG(mil ? "#F5DE9B" : d.color, 15);
  const bg = mil ? "#1B4D2E" : "#ffffff";
  const size = mil ? 24 : 22;
  // Militaire : hexagone vert armée cerclé d'or. Un hexagone ne peut pas
  // porter de bordure en CSS avec clip-path → on superpose deux hexagones
  // (l'extérieur fait office de liseré).
  if (mil) {
    return (
      `<div title="${esc(title)}" style="width:${size}px;height:${size}px;clip-path:${HEX_CLIP};background:${d.color};display:flex;align-items:center;justify-content:center;${selRing(sel)}">` +
      `<div style="width:${size - 5}px;height:${size - 5}px;clip-path:${HEX_CLIP};background:${bg};display:flex;align-items:center;justify-content:center;` +
      `${d.campagne ? `outline:1.5px ${dash} ${d.color};outline-offset:-2px;` : ""}">${glyph}</div></div>`
    );
  }
  // Civil : pastille blanche cerclée selon l'échelon (violet CHU, bleu CHR,
  // rouge CHP/local) ; bordure pointillée pour les structures de campagne.
  return (
    `<div title="${esc(title)}" style="width:${size}px;height:${size}px;background:${bg};border-radius:9999px;border:2.5px ${dash} ${d.color};` +
    `box-sizing:border-box;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.55);${selRing(sel)}">${glyph}</div>`
  );
}

/** Échappe les guillemets/chevrons d'un attribut HTML construit à la main. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function hospMarkerHTML(h: Hospital, sel: boolean): string {
  return healthMarkerHTML(hospKind(h), h.type ? `${h.nom} — ${h.type}` : h.nom, sel);
}

export function fieldMarkerHTML(f: FieldHospital, sel: boolean): string {
  const k = fieldKind(f);
  return healthMarkerHTML(k, `${f.nom} — ${kindDef(k).long}`, sel);
}

export function incMarkerHTML(i: Incident, sel: boolean): string {
  const fill = incidentFill(i.sev, i.st === "closed");
  const ping = i.st !== "closed"
    ? `<div style="position:absolute;inset:-4px;border-radius:9999px;background:${fill};opacity:.5;animation:cgc-ping 1.8s ease-out infinite;"></div>`
    : "";

  // --- INCIDENT NRBC : le pictogramme réglementaire, pas le triangle générique
  //
  // Tous les incidents portaient le même triangle « ! » : sur la carte, une
  // fuite de chlore ne se distinguait pas d'une crue. Or c'est la NATURE du
  // danger qui décide des distances d'isolement, de la tenue de protection et
  // du sens d'approche — l'information la plus coûteuse à ne pas voir.
  //
  // L'anneau reste teinté par la GRAVITÉ : le symbole dit de quoi il s'agit,
  // l'anneau dit à quel point c'est grave. Les deux se lisent d'un coup d'œil
  // sans se gêner.
  const kind = i.nrbc ? FAMILY_PICTOGRAM[i.nrbc.family] : undefined;
  if (kind) {
    const glyph = hazardSvgString(kind, 22);
    return (
      `<div style="position:relative;width:30px;height:30px;${selRing(sel)}">${ping}` +
      `<div style="position:relative;width:30px;height:30px;border-radius:9999px;background:${fill};` +
      "border:2px solid #0f1f14;box-sizing:border-box;display:flex;align-items:center;justify-content:center;" +
      `box-shadow:0 1px 4px rgba(0,0,0,.6);">${glyph}</div></div>`
    );
  }

  return (
    `<div style="position:relative;width:22px;height:20px;${selRing(sel)}">${ping}` +
    `<svg width="22" height="20" viewBox="0 0 22 20" style="position:relative;"><path d="M11,1 L21,19 L1,19 Z" fill="${fill}" stroke="#0f1f14" stroke-width="1.5"></path>` +
    '<text x="11" y="16" text-anchor="middle" font-size="10" font-weight="900" fill="#0f1f14">!</text></svg></div>'
  );
}

export function vehMarkerHTML(v: VehRoute, sel: boolean): string {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">' +
    `<div style="width:14px;height:14px;background:#3B82F6;border:2px solid #0f1f14;transform:rotate(45deg);${selRing(sel)}"></div>` +
    `<span style="font:700 8px Inter,sans-serif;color:#BFDBFE;text-shadow:0 1px 2px #000;background:rgba(15,31,20,.7);padding:0 3px;border-radius:3px;">${v.id}</span></div>`
  );
}

/**
 * Marqueur d'aéronef suivi : silhouette orientée au cap réel.
 *
 * Le cap porte une information opérationnelle — savoir qu'un bombardier fait
 * route vers le front ou en revient vaut autant que sa position. La silhouette
 * pivote donc, mais l'étiquette reste horizontale pour rester lisible.
 *
 * Trois états : en vol (plein), au sol (atténué), sans signal (contour seul).
 */
export function acftMarkerHTML(
  label: string,
  role: AircraftRole,
  status: TrackingStatus,
  heading: number | null,
  sel: boolean,
  /** Dernier contact réel trop ancien : la position affichée n'engage plus. */
  stale = false,
): string {
  const fill = status === "no_signal" ? "none" : ACFT_FILL[role];
  const stroke = ACFT_FILL[role];
  // Contact périmé : la silhouette s'estompe. Un appareil dont on n'a plus de
  // nouvelles depuis une minute ne doit pas s'afficher aussi franchement qu'un
  // appareil suivi en continu.
  const opacity = status === "ground" ? "0.55" : stale ? "0.4" : "1";
  // Sans écho, on n'invente pas de cap : la silhouette reste au nord.
  const rot = status === "no_signal" ? 0 : Math.round(heading ?? 0);
  // Un appareil sans signal est signalé explicitement plutôt que masqué :
  // l'absence d'écho est elle-même une information pour le commandement.
  const glyph =
    role === "helicopter"
      ? '<path d="M12,3 L12,21 M4,6 L20,6 M8,21 L16,21" stroke-width="2.2" stroke-linecap="round" fill="none"/>'
      : '<path d="M12,2 L14,10 L22,14 L22,16 L14,14 L13.5,20 L16,22 L16,23 L12,22 L8,23 L8,22 L10.5,20 L10,14 L2,16 L2,14 L10,10 Z"/>';

  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">' +
    `<div style="width:24px;height:24px;opacity:${opacity};transform:rotate(${rot}deg);${selRing(sel)}">` +
    `<svg width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="1.4">${glyph}</svg></div>` +
    `<span style="font:700 8px Inter,sans-serif;color:#FDE68A;text-shadow:0 1px 2px #000;background:rgba(15,31,20,.75);padding:0 3px;border-radius:3px;white-space:nowrap;">${escapeHtml(label)}</span></div>`
  );
}

/** Couleur par rôle opérationnel — cohérente avec la palette `or` / `danger`. */
const ACFT_FILL: Record<AircraftRole, string> = {
  waterbomber: "#F59E0B",
  helicopter: "#38BDF8",
  observation: "#A3E635",
  transport: "#C4B5FD",
  medevac: "#F87171",
};

/** Le libellé vient d'une saisie opérateur : il est inséré dans du HTML. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Position le long d'une polyligne à la progression fractionnaire p ∈ [0,1). */
export function vehPos(route: [number, number][], p: number): [number, number] {
  const n = route.length - 1;
  const f = Math.min(p * n, n - 0.0001);
  const i = Math.floor(f);
  const r = f - i;
  return [route[i][0] + (route[i + 1][0] - route[i][0]) * r, route[i][1] + (route[i + 1][1] - route[i][1]) * r];
}

const FIELD_LL_FALLBACK: Record<string, [number, number]> = {
  "HMC Amizmiz": [-8.25, 31.22],
  "HMC Talat N'Yaaqoub": [-8.26, 30.98],
  "HMC Taroudant": [-8.88, 30.47],
  "HCC Asni": [-7.98, 31.25],
  "HCC Ouirgane": [-8.09, 31.17],
};

export function fieldLL(f: FieldHospital): [number, number] {
  return f.ll ?? FIELD_LL_FALLBACK[f.nom] ?? [-8.3, 31.1];
}
