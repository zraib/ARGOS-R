"use client";

import { useEffect } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { FLOOD_SEVERITY_COLOR } from "@/components/map/layers/floods";
import type { FloodSource } from "@/lib/store/slices/flood";
import type { FloodGauge, FloodSeverity, FloodTrend, FloodUnit } from "@/lib/types";

// ============================================================================
// Panneau « Crues » de la carte (ADR 0010) — deux blocs, volontairement
// distincts à l'écran :
//   1. les PRÉVISIONS de Google Flood Hub, servies par l'API : jauges du pays,
//      gravité, tendance, seuils, prévision et cartes d'inondation ;
//   2. le SIMULATEUR d'inondation, calculé ici même sur le relief : rivière,
//      lac ou barrage, une hauteur d'eau, une emprise et ce qu'elle atteint.
// Une prévision est une information ; une simulation est une hypothèse. Les
// mélanger ferait lire l'une pour l'autre.
// ============================================================================

const lbl = "text-[10px] font-bold uppercase tracking-wider text-white/60";
const champ = "w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] text-white";
const btn = "btn-secondaire min-h-11 w-full text-[13px] lg:min-h-0";

/** « il y a 2 h », « le 14/09 06:00 » — l'heure d'émission d'un statut, lisible. */
function quand(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FloodPanel() {
  const t = useDict();
  const status = useArgos((s) => s.floodStatus);
  const gauges = useArgos((s) => s.floodGauges);
  const gaugesOn = useArgos((s) => s.floodGaugesOn);
  const busy = useArgos((s) => s.floodBusy);
  const sel = useArgos((s) => s.floodSel);
  const forecast = useArgos((s) => s.floodForecast);
  const polygons = useArgos((s) => s.floodPolygons);
  const mapsOn = useArgos((s) => s.floodMapsOn);
  const seed = useArgos((s) => s.floodSeed);
  const arming = useArgos((s) => s.floodArming);
  const params = useArgos((s) => s.floodParams);
  const sim = useArgos((s) => s.floodSim);
  const simBusy = useArgos((s) => s.floodSimBusy);
  const simError = useArgos((s) => s.floodSimError);
  const loadFloodGauges = useArgos((s) => s.loadFloodGauges);
  const toggleFloodGauges = useArgos((s) => s.toggleFloodGauges);
  const selectFloodGauge = useArgos((s) => s.selectFloodGauge);
  const toggleFloodMaps = useArgos((s) => s.toggleFloodMaps);
  const setFloodArming = useArgos((s) => s.setFloodArming);
  const setFloodSeed = useArgos((s) => s.setFloodSeed);
  const setFloodParams = useArgos((s) => s.setFloodParams);
  const runFloodSim = useArgos((s) => s.runFloodSim);
  const clearFloodSim = useArgos((s) => s.clearFloodSim);
  const setMapCenter = useArgos((s) => s.setMapCenter);

  // Le statut du flux se lit dès l'ouverture : il dit s'il y a une clé.
  useEffect(() => {
    if (!status) void loadFloodGauges();
  }, [status, loadFloodGauges]);

  const sevLabel: Record<FloodSeverity, string> = {
    extreme: t.flood_sev_extreme,
    severe: t.flood_sev_severe,
    above_normal: t.flood_sev_above,
    no_flooding: t.flood_sev_none,
    unknown: t.flood_sev_unknown,
  };
  const trendLabel: Record<FloodTrend, string> = { rise: t.flood_trend_rise, fall: t.flood_trend_fall, no_change: t.flood_trend_flat, unknown: "" };
  const jauge = gauges.find((g) => g.gaugeId === sel) ?? null;
  const unite = (u: FloodUnit) => (u === "m3/s" ? "m³/s" : u === "m" ? "m" : "");
  const ouvrir = (g: FloodGauge) => {
    void selectFloodGauge(g.gaugeId);
    setMapCenter(g.ll, 11, g.siteName);
  };

  return (
    <div className="flex flex-col gap-4 text-[13px] text-white/85">
      {/* ------------------------------------------------ prévisions Flood Hub */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className={lbl}>{t.flood_feed}</span>
          <button
            type="button"
            onClick={() => void loadFloodGauges()}
            disabled={busy}
            aria-label={t.flood_feed_refresh}
            title={t.flood_feed_refresh}
            className="flex h-8 w-8 items-center justify-center rounded-md text-white/60 transition-colors hover:text-or-400 disabled:opacity-40"
          >
            <Icon path={UI_ICONS.refresh} size={14} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
        {status && !status.configured && (
          <p className="rounded-lg bg-or-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-or-300">{t.flood_feed_off}</p>
        )}
        {status?.degraded && (
          <p className="rounded-lg bg-danger-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-danger-300">
            {tpl(t.flood_feed_degraded, { at: quand(status.fetchedAt) })}
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
          <input type="checkbox" className="size-4 accent-or-500" checked={gaugesOn} onChange={toggleFloodGauges} />
          <span>{t.flood_show_gauges}</span>
          <span className="ms-auto font-mono text-[11px] text-white/50">{gauges.length}</span>
        </label>

        {status?.configured && gauges.length === 0 && !busy && <p className="text-[11.5px] text-white/50">{t.flood_no_gauges}</p>}
        {busy && gauges.length === 0 && <p className="text-[11.5px] text-white/50">{t.flood_loading}</p>}

        {gauges.length > 0 && (
          <ul className="flex max-h-44 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-lg border border-white/10">
            {gauges.map((g) => (
              <li key={g.gaugeId}>
                <button
                  type="button"
                  onClick={() => ouvrir(g)}
                  aria-pressed={g.gaugeId === sel}
                  className={`flex min-h-11 w-full items-center gap-2 px-2 py-1 text-start transition-colors hover:bg-white/10 lg:min-h-0 ${g.gaugeId === sel ? "bg-white/10" : ""}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FLOOD_SEVERITY_COLOR[g.severity] }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{g.siteName}</span>
                    <span className="block truncate text-[10.5px] text-white/55">
                      {g.river ? `${g.river} · ` : ""}
                      {sevLabel[g.severity]}
                      {g.trend !== "unknown" ? ` · ${trendLabel[g.trend]}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {jauge && (
          <div className="flex flex-col gap-2 rounded-lg border border-white/15 p-2.5">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FLOOD_SEVERITY_COLOR[jauge.severity] }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-white">{jauge.siteName}</div>
                <div className="text-[11px] text-white/60">
                  {sevLabel[jauge.severity]}
                  {jauge.trend !== "unknown" ? ` · ${trendLabel[jauge.trend]}` : ""}
                  {jauge.qualityVerified ? "" : " · *"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void selectFloodGauge(null)}
                aria-label={t.flood_gauge_close}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/50 hover:text-or-400"
              >
                <Icon path={UI_ICONS.close} size={14} strokeWidth={2} />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
              <dt className="text-white/55">{t.flood_issued}</dt>
              <dd className="text-end font-mono text-white">{quand(jauge.issuedTime)}</dd>
              {jauge.thresholds && (
                <>
                  <dt className="text-white/55">{t.flood_warning}</dt>
                  <dd className="text-end font-mono text-white">{jauge.thresholds.warning} {unite(jauge.thresholds.unit)}</dd>
                  <dt className="text-white/55">{t.flood_danger}</dt>
                  <dd className="text-end font-mono text-white">{jauge.thresholds.danger} {unite(jauge.thresholds.unit)}</dd>
                  {jauge.thresholds.extreme !== undefined && (
                    <>
                      <dt className="text-white/55">{t.flood_extreme}</dt>
                      <dd className="text-end font-mono text-white">{jauge.thresholds.extreme} {unite(jauge.thresholds.unit)}</dd>
                    </>
                  )}
                </>
              )}
            </dl>
            <div>
              <div className={lbl}>{t.flood_forecast}</div>
              {forecast && forecast.points.length > 0 ? (
                <ul className="mt-1 max-h-32 overflow-y-auto overscroll-contain text-[11px]">
                  {forecast.points.slice(0, 12).map((pt) => {
                    const th = forecast.thresholds;
                    const teinte = th
                      ? th.extreme !== undefined && pt.value >= th.extreme
                        ? FLOOD_SEVERITY_COLOR.extreme
                        : pt.value >= th.danger
                          ? FLOOD_SEVERITY_COLOR.severe
                          : pt.value >= th.warning
                            ? FLOOD_SEVERITY_COLOR.above_normal
                            : undefined
                      : undefined;
                    return (
                      <li key={pt.start} className="flex items-center justify-between gap-2 border-b border-white/10 py-0.5 last:border-0">
                        <span className="font-mono text-white/60">{quand(pt.start)}</span>
                        <span className="font-mono font-semibold" style={{ color: teinte ?? "#fff" }}>
                          {pt.value.toFixed(2)} {unite(forecast.unit)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-[11px] text-white/50">{t.flood_forecast_none}</p>
              )}
            </div>
            {jauge.inundationMaps.length > 0 ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
                <input type="checkbox" className="size-4 accent-or-500" checked={mapsOn} onChange={toggleFloodMaps} />
                <span>{t.flood_maps}</span>
                <span className="ms-auto font-mono text-[11px] text-white/50">{polygons.length}/{jauge.inundationMaps.length}</span>
              </label>
            ) : (
              <p className="text-[11px] text-white/50">{t.flood_maps_none}</p>
            )}
            <button
              type="button"
              className={btn}
              onClick={() => {
                setFloodParams({ source: "river" });
                setFloodSeed(jauge.ll);
              }}
            >
              {t.flood_use_gauge}
            </button>
          </div>
        )}
        {status?.configured && <p className="text-[10.5px] leading-snug text-white/45">{t.flood_attribution}</p>}
      </section>

      {/* ------------------------------------------------ simulateur */}
      <section className="flex flex-col gap-2 border-t border-white/10 pt-3">
        <span className={lbl}>{t.flood_sim}</span>
        <p className="text-[11px] leading-snug text-white/55">{t.flood_sim_hint}</p>

        <div className={lbl}>{t.flood_src}</div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {(["river", "lake", "dam"] as FloodSource[]).map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setFloodParams({ source: src })}
              aria-pressed={params.source === src}
              className={`min-h-11 flex-1 rounded-md px-2 text-[12px] font-semibold transition-colors lg:min-h-0 lg:py-1 ${
                params.source === src ? "bg-or-500 text-rdia-900" : "text-white/70 hover:bg-white/10"
              }`}
            >
              {src === "river" ? t.flood_src_river : src === "lake" ? t.flood_src_lake : t.flood_src_dam}
            </button>
          ))}
        </div>

        <div className={lbl}>{t.flood_seed}</div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">
            {seed ? `${seed[1].toFixed(4)}, ${seed[0].toFixed(4)}` : t.flood_seed_none}
          </span>
          <button
            type="button"
            onClick={() => setFloodArming(!arming)}
            aria-pressed={arming}
            className={`min-h-11 shrink-0 rounded-md px-2.5 text-[12px] font-semibold transition-colors lg:min-h-0 lg:py-1 ${
              arming ? "bg-or-500 text-rdia-900" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            {arming ? t.flood_picking : t.flood_pick}
          </button>
        </div>

        {params.source === "dam" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between">
                <span className={lbl}>{t.flood_height}</span>
                <span className="font-mono text-[11.5px] text-white">{params.heightM} m</span>
              </span>
              <input type="range" min={2} max={60} step={1} value={params.heightM} onChange={(e) => setFloodParams({ heightM: Number(e.target.value) })} className="w-full accent-or-500" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex justify-between">
                <span className={lbl}>{t.flood_atten}</span>
                <span className="font-mono text-[11.5px] text-white">{params.attenuationKm} km</span>
              </span>
              <input type="range" min={2} max={60} step={1} value={params.attenuationKm} onChange={(e) => setFloodParams({ attenuationKm: Number(e.target.value) })} className="w-full accent-or-500" />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="flex justify-between">
              <span className={lbl}>{t.flood_rise}</span>
              <span className="font-mono text-[11.5px] text-white">{params.riseM} m</span>
            </span>
            <input type="range" min={0.5} max={15} step={0.5} value={params.riseM} onChange={(e) => setFloodParams({ riseM: Number(e.target.value) })} className="w-full accent-or-500" />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className={lbl}>{t.flood_extent}</span>
          <select className={champ} value={params.extentKm} onChange={(e) => setFloodParams({ extentKm: Number(e.target.value) === 40 ? 40 : 20 })}>
            <option value={20}>≈ 20 km</option>
            <option value={40}>≈ 40 km</option>
          </select>
        </label>

        <div className="flex gap-2">
          <button type="button" className="btn-primaire min-h-11 flex-1 text-[13px] lg:min-h-0" onClick={() => void runFloodSim()} disabled={simBusy || !seed}>
            {simBusy ? t.flood_running : t.flood_run}
          </button>
          {sim && (
            <button type="button" className={`${btn} w-auto`} onClick={clearFloodSim}>
              {t.flood_clear}
            </button>
          )}
        </div>
        {simError && (
          <p role="alert" className="rounded-lg bg-danger-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-danger-300">
            {simError === "seed" ? t.flood_err_seed : simError === "elevation" ? t.flood_err_elevation : t.flood_err_dem}
          </p>
        )}

        {sim && (
          <div className="flex flex-col gap-2 rounded-lg border border-white/15 p-2.5">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
              <dt className="text-white/55">{t.flood_area}</dt>
              <dd className="text-end font-mono font-semibold text-white">{sim.areaKm2.toFixed(1)} km²</dd>
              <dt className="text-white/55">{t.flood_depth}</dt>
              <dd className="text-end font-mono font-semibold text-white">{sim.maxDepth.toFixed(1)} m</dd>
              <dt className="text-white/55">{t.flood_seed_elev}</dt>
              <dd className="text-end font-mono text-white">{Math.round(sim.seedElev)} m</dd>
              <dt className="text-white/55">{t.flood_cells}</dt>
              <dd className="text-end font-mono text-white">{Math.round(sim.cellMeters)} m</dd>
            </dl>
            {sim.partial && <p className="text-[11px] leading-snug text-or-300">{t.flood_partial}</p>}
            <div className={lbl}>{t.flood_impacts}</div>
            {(
              [
                [t.flood_hospitals, sim.impacts.hospitals],
                [t.flood_units, sim.impacts.units],
                [t.flood_shelters, sim.impacts.shelters],
                [t.flood_cities, sim.impacts.cities],
              ] as const
            ).map(([titre, liste]) =>
              liste.length > 0 ? (
                <div key={titre} className="text-[11.5px]">
                  <span className="font-semibold text-or-300">{titre}</span>
                  <span className="text-white/80"> · {liste.join(", ")}</span>
                </div>
              ) : null,
            )}
            {Object.values(sim.impacts).every((l) => l.length === 0) && <p className="text-[11px] text-white/50">{t.flood_none_hit}</p>}
          </div>
        )}
      </section>
    </div>
  );
}
