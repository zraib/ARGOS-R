// Constructeurs de marqueurs HTML pour la carte opérationnelle — répliquent
// les glyphes stylés du prototype pour que la carte soit identique à l'export.

import type { FieldHospital, Hospital, Incident, Unit, VehRoute } from "@/lib/types";
import { incidentFill } from "@/lib/helpers";

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

export function hospMarkerHTML(h: Hospital, sel: boolean): string {
  // Symbole croix + croissant (emblèmes humanitaires jumelés) sur pastille blanche.
  return (
    `<div style="width:20px;height:20px;background:#fff;border-radius:9999px;border:2px solid #0f1f14;display:flex;align-items:center;justify-content:center;${selRing(sel)}">` +
    '<svg width="14" height="11" viewBox="0 0 26 20" aria-hidden="true">' +
    '<path fill-rule="evenodd" fill="#EF4444" d="M8,10 m-8,0 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0 M10.8,10 m-5.8,0 a5.8,5.8 0 1,0 11.6,0 a5.8,5.8 0 1,0 -11.6,0"/>' +
    '<path fill="#EF4444" d="M19 5.5h4v3h3v4h-3v3h-4v-3h-3v-4h3z"/></svg></div>'
  );
}

export function fieldMarkerHTML(sel: boolean): string {
  return (
    `<div style="width:20px;height:20px;border:2px dashed #10B981;border-radius:9999px;background:rgba(16,185,129,.25);display:flex;align-items:center;justify-content:center;${selRing(sel)}">` +
    '<span style="color:#6EE7B7;font:900 11px Inter,sans-serif;line-height:1;">+</span></div>'
  );
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
};

export function fieldLL(f: FieldHospital): [number, number] {
  return f.ll ?? FIELD_LL_FALLBACK[f.nom] ?? [-8.3, 31.1];
}
