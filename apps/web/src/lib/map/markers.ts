// Constructeurs de marqueurs HTML pour la carte opérationnelle — répliquent
// les glyphes stylés du prototype pour que la carte soit identique à l'export.

import type { FieldHospital, Hospital, HospitalKind, Incident, Unit, VehRoute } from "@/lib/types";
import { incidentFill } from "@/lib/helpers";
import { fieldKind, hospKind, kindDef } from "@/lib/hospitals";

export function selRing(sel: boolean): string {
  return sel ? "box-shadow: 0 0 0 3px #C9A84C, 0 0 12px rgba(201,168,76,0.8); border-radius: 9999px;" : "";
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
