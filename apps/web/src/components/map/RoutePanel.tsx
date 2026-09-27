"use client";

import { useEffect } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { OVERLAY_STYLE } from "@/lib/map/overlay";
import type { Dict } from "@/lib/i18n/translations";
import type { RoutePlan, RouteWarning } from "@/lib/types";

// ============================================================================
// components/map/RoutePanel.tsx — l'outil d'itinéraire de la carte (ADR 0039)
//
// Deux morceaux :
//   • `RouteToolbox` — le panneau de l'outil, parmi ceux de la barre de gauche
//     (onglet de la feuille du bas sur mobile) : options (véhicule ou à pied,
//     obstacles, zones NRBC), étapes, et le plan rendu par l'API — sortie de
//     zone, points d'approche sûrs, détour imposé, alertes ;
//   • `RouteBar` — en bas à gauche de la carte : le bouton qui ouvre l'outil, le
//     résumé du trajet, « Effacer ». Toujours monté : c'est lui qui recalcule le
//     plan quand un obstacle ou un incident chimique change.
// Un trajet qui ne contourne pas tout s'affiche NON SÛR — jamais comme sûr.
// ============================================================================

const panel = "rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg";
const stepBtn = "rounded p-0.5 text-white/60 transition-colors hover:text-or-400 disabled:opacity-25";

/** Les alertes qui disent que le trajet n'est PAS sûr : en rouge. */
const GRAVES: readonly RouteWarning[] = ["no_safe_route", "exit_not_found", "engine_unavailable", "engine_limit"];

/** La phrase d'une alerte du plan. */
export function warningText(w: RouteWarning, t: Dict): string {
  switch (w) {
    case "engine_unavailable":
      return t.rt_w_engine_unavailable;
    case "no_safe_route":
      return t.rt_w_no_safe_route;
    case "origin_in_zone":
      return t.rt_w_origin_in_zone;
    case "exit_not_found":
      return t.rt_w_exit_not_found;
    case "point_in_zone":
      return t.rt_w_point_in_zone;
    case "point_in_obstacle":
      return t.rt_w_point_in_obstacle;
    case "wind_unknown":
      return t.rt_w_wind_unknown;
    case "engine_limit":
      return t.rt_w_engine_limit;
    case "not_in_zone":
      return t.rt_w_not_in_zone;
  }
}

/** Remplit un gabarit « {clé} ». */
function fill(tpl: string, v: Record<string, string | number>): string {
  return Object.entries(v).reduce((s, [k, x]) => s.split(`{${k}}`).join(String(x)), tpl);
}

/** Libellé d'une étape selon sa place : départ, étape n, arrivée. */
function stepLabel(i: number, n: number, t: Dict): string {
  if (i === 0) return t.rt_start;
  if (i === n - 1) return t.rt_end;
  return `${t.rt_stop} ${i}`;
}

/** Ce que le plan contient au-delà du trajet : sortie, approches, détour, contournements, alertes. */
function PlanDetails({ plan, n, t }: { plan: RoutePlan; n: number; t: Dict }) {
  const sortie = plan.legs.find((l) => l.kind === "exit");
  const ref = plan.reference;
  // Un détour se mesure quand les extrémités sont les mêmes (ni sortie ni approche).
  const memesExtremites = !plan.exit && plan.approaches.length === 0;
  const lignes: { cle: string; texte: string; ton: "grave" | "note" | "info" }[] = [];
  for (const w of plan.warnings) {
    // Sortie et approches ont leur propre ligne, plus précise.
    if ((w === "origin_in_zone" && plan.exit) || (w === "point_in_zone" && plan.approaches.length > 0)) continue;
    lignes.push({ cle: w, texte: warningText(w, t), ton: GRAVES.includes(w) ? "grave" : "note" });
  }
  if (plan.avoided.obstacles > 0) lignes.push({ cle: "obstacles", texte: fill(t.rt_obstacles_avoided, { n: plan.avoided.obstacles }), ton: "info" });
  if (plan.avoided.hours.length > 0) lignes.push({ cle: "heures", texte: fill(t.rt_hours, { h: Math.max(...plan.avoided.hours) }), ton: "info" });
  return (
    <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2">
      {sortie && plan.exit && (
        <div className="rounded-md border border-orange-400/50 bg-orange-500/10 px-2 py-1.5">
          <div className="font-bold text-orange-300">{t.rt_exit}</div>
          <div className="text-white/85">
            {fill(t.rt_exit_detail, { km: sortie.km.toFixed(1), min: sortie.min, inKm: plan.exit.insideKm.toFixed(1), inMin: plan.exit.insideMin })}
          </div>
        </div>
      )}
      {plan.approaches.map((a) => (
        <div key={a.index} className="rounded-md border border-green-400/40 bg-green-500/10 px-2 py-1.5 text-white/85">
          {fill(t.rt_approach, { p: stepLabel(a.index, n, t) })}
        </div>
      ))}
      {ref && plan.min != null && (
        <div className="text-white/75">
          {memesExtremites && plan.km >= ref.km
            ? fill(t.rt_detour, { km: (plan.km - ref.km).toFixed(1), min: Math.max(0, plan.min - ref.min), refKm: ref.km.toFixed(1), refMin: ref.min })
            : fill(t.rt_reference, { km: ref.km.toFixed(1), min: ref.min })}
        </div>
      )}
      {lignes.map((l) => (
        <div
          key={l.cle}
          className={l.ton === "grave" ? "font-semibold text-danger-400" : l.ton === "note" ? "text-or-300" : "text-white/60"}
        >
          {l.texte}
        </div>
      ))}
    </div>
  );
}

/** Le panneau de l'outil : options, étapes, plan. */
export function RouteToolbox() {
  const t = useDict();
  const pts = useArgos((s) => s.routePts);
  const plan = useArgos((s) => s.routePlan);
  const busy = useArgos((s) => s.routeBusy);
  const opts = useArgos((s) => s.routeOptions);
  const move = useArgos((s) => s.moveRoutePt);
  const remove = useArgos((s) => s.removeRoutePt);
  const setOptions = useArgos((s) => s.setRouteOptions);
  const nbObstacles = useArgos((s) => s.drawings.filter((d) => !!d.obstacle).length);

  const seg = (actif: boolean) =>
    `flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 font-semibold transition-colors ${actif ? "bg-or-500 text-rdia-600" : "text-white/75 hover:text-white"}`;
  const coche = (checked: boolean, onChange: (v: boolean) => void, label: string, retrait = false) => (
    <label className={`flex cursor-pointer items-center gap-2 ${retrait ? "ps-5" : ""}`}>
      <input type="checkbox" className="accent-or-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="flex flex-col gap-2.5 text-[12px] text-white/90">
      <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5" role="group" aria-label={t.rt_tool}>
        <button type="button" aria-pressed={opts.mode === "auto"} className={seg(opts.mode === "auto")} onClick={() => setOptions({ mode: "auto" })}>
          <Icon path={UI_ICONS.car} size={14} /> {t.rt_mode_auto}
        </button>
        <button type="button" aria-pressed={opts.mode === "pedestrian"} className={seg(opts.mode === "pedestrian")} onClick={() => setOptions({ mode: "pedestrian" })}>
          <Icon path={UI_ICONS.walk} size={14} /> {t.rt_mode_walk}
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {coche(opts.avoidObstacles, (v) => setOptions({ avoidObstacles: v }), `${t.rt_avoid_obstacles} (${nbObstacles})`)}
        {coche(opts.avoidNrbc, (v) => setOptions({ avoidNrbc: v }), t.rt_avoid_nrbc)}
        {opts.avoidNrbc && coche(opts.nrbcVigilance, (v) => setOptions({ nrbcVigilance: v }), t.rt_vigilance, true)}
      </div>
      {pts.length === 0 ? (
        <p className="leading-snug text-white/65">{t.rt_hint}</p>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-white/55">{t.map_points}</div>
          {pts.map((p, i) => (
            <div key={`${p[0]},${p[1]},${i}`} className="flex items-center gap-1 text-[11px] text-white/90">
              <span className="w-16 shrink-0 truncate font-bold text-or-400">{stepLabel(i, pts.length, t)}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{p[1].toFixed(4)}, {p[0].toFixed(4)}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={12} strokeWidth={2.5} className="rotate-180" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === pts.length - 1} className={stepBtn} aria-label={t.map_points}>
                <Icon path={UI_ICONS.caretDown} size={12} strokeWidth={2.5} />
              </button>
              <button onClick={() => remove(i)} className="rounded p-0.5 text-danger-400 transition-colors hover:text-danger-300" aria-label={t.flt_clear}>
                <Icon path={UI_ICONS.close} size={12} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
      {busy && <p className="text-white/60">{t.rt_computing}</p>}
      {plan && !busy && <PlanDetails plan={plan} n={pts.length} t={t} />}
    </div>
  );
}

/** En bas à gauche de la carte : ouvrir l'outil, lire le résumé, effacer. */
export function RouteBar() {
  const t = useDict();
  const on = useArgos((s) => s.routeOn);
  const pts = useArgos((s) => s.routePts);
  const plan = useArgos((s) => s.routePlan);
  const busy = useArgos((s) => s.routeBusy);
  const setOn = useArgos((s) => s.setRouteOn);
  const clear = useArgos((s) => s.clearRoute);
  const drawings = useArgos((s) => s.drawings);
  const incidents = useArgos((s) => s.mapIncidents);

  // Un obstacle posé, déplacé ou retiré, un incident chimique déclaré ou clos : le
  // plan en cours se recalcule — sur ce poste comme sur les autres (temps réel).
  const sigObstacles = drawings
    .filter((d) => !!d.obstacle)
    .map((d) => `${d.id}:${d.updatedAt}`)
    .join("|");
  const sigNrbc = incidents
    .filter((i) => !i.archived && i.st !== "closed" && i.nrbc?.family === "C")
    .map((i) => `${i.id}:${i.st}:${i.ll?.join(",")}`)
    .join("|");
  useEffect(() => {
    if (useArgos.getState().routePts.length > 0) void useArgos.getState().computeRoute();
  }, [sigObstacles, sigNrbc]);

  const statut = !plan || plan.legs.length === 0 ? null : !plan.road ? (
    <span className="text-white/50"> · {t.map_direct}</span>
  ) : plan.safe ? (
    <span className="text-green-400"> · {t.rt_safe}</span>
  ) : (
    <span className="font-bold text-danger-400"> · {t.rt_unsafe}</span>
  );

  return (
    <div className="absolute z-10 flex items-center gap-1.5" style={{ bottom: 46, insetInlineStart: 8 }}>
      <button
        onClick={() => setOn(!on)}
        aria-pressed={on}
        className={`${panel} flex items-center gap-1 font-bold transition-colors ${on ? "bg-or-500 text-rdia-600" : "text-white/90 hover:text-or-400"}`}
        style={on ? undefined : OVERLAY_STYLE}
      >
        <Icon path={UI_ICONS.route} size={13} />
        {t.rt_tool}
      </button>
      {busy && (
        <span className={`${panel} text-white/70`} style={OVERLAY_STYLE}>
          {t.rt_computing}
        </span>
      )}
      {!busy && plan && plan.legs.length > 0 && (
        <span className={`${panel} font-mono text-white/90`} style={OVERLAY_STYLE}>
          {plan.km.toFixed(1)} km
          {plan.min != null ? ` · ${plan.min} min` : ""}
          {statut}
        </span>
      )}
      {pts.length > 0 && (
        <button onClick={clear} className={`${panel} font-semibold text-danger-400 hover:text-danger-300`} style={OVERLAY_STYLE}>
          {t.flt_clear}
        </button>
      )}
    </div>
  );
}
