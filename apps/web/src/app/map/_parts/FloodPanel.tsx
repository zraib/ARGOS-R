"use client";

import { useEffect } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { FLOOD_SEVERITY_COLOR, frameAt, headProgress } from "@/components/map/layers/floods";
import { FLOOD_COLOR_REF_M, FLOOD_DEEP_RGB, FLOOD_SHALLOW_RGB } from "@/lib/flood/frames";
import { scenarioOf, type FloodSource } from "@/lib/flood/hydro";
import type { FloodPoiKind } from "@/lib/flood/run";
import { FLOOD_DEFAULT_PARAMS } from "@/lib/store/slices/flood";
import type { FloodGauge, FloodSeverity, FloodTrend, FloodUnit } from "@/lib/types";

// ============================================================================
// Panneau « Crues » de la carte (ADR 0010) — deux blocs, volontairement
// distincts à l'écran :
//   1. les PRÉVISIONS servies par l'API — GloFAS (Copernicus) par Open-Meteo
//      sans clé, Google Flood Hub dès qu'une clé est posée : jauges du pays,
//      gravité, tendance, pic, seuils, prévision et cartes d'inondation ;
//   2. le SIMULATEUR d'inondation, calculé ici même sur le relief : une
//      source (rivière, lac, barrage), un débit ou un volume, un horizon —
//      et l'eau qui se propage sur la carte, en temps simulé, avec l'heure
//      à laquelle elle atteint hôpitaux, unités, abris et villes.
// Une prévision est une information ; une simulation est une hypothèse. Les
// mélanger ferait lire l'une pour l'autre.
// ============================================================================

const lbl = "text-[10px] font-bold uppercase tracking-wider text-white/60";
const champ = "w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] text-white";
const btn = "btn-secondaire min-h-11 w-full text-[13px] lg:min-h-0";

/** « 14/09 06:00 » — l'heure d'émission d'un statut, lisible. */
function quand(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** « 13 500 », « 245 », « 36.3 » — un nombre lisible selon sa taille (espace fine insécable aux milliers). */
function nombre(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n.toFixed(1);
}

/** Heures et minutes d'une durée simulée, pour l'horloge « t + 2 h 35 ». */
function hm(seconds: number): { h: number; m: string } {
  const total = Math.max(0, Math.round(seconds / 60));
  return { h: Math.floor(total / 60), m: String(total % 60).padStart(2, "0") };
}

/** Un réglage numérique : la valeur se tape ou se glisse. */
function Reglage({
  label, value, unit, min, max, step, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const poser = (raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2">
        <span className={lbl}>{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => poser(e.target.value)}
            className="w-24 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-end font-mono text-[11.5px] text-white"
            aria-label={label}
          />
          <span className="w-9 text-[11px] text-white/60">{unit}</span>
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => poser(e.target.value)} className="w-full accent-or-500" aria-hidden="true" tabIndex={-1} />
    </label>
  );
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
  const run = useArgos((s) => s.floodSim);
  // Relu à chaque nouvelle image : la course est mutable, le magasin ne signale que son compte d'images.
  useArgos((s) => s.floodFrames);
  const done = useArgos((s) => s.floodDone);
  const partial = useArgos((s) => s.floodPartial);
  const simBusy = useArgos((s) => s.floodSimBusy);
  const simError = useArgos((s) => s.floodSimError);
  const progress = useArgos((s) => s.floodProgress);
  const playing = useArgos((s) => s.floodPlaying);
  const loadFloodGauges = useArgos((s) => s.loadFloodGauges);
  const toggleFloodGauges = useArgos((s) => s.toggleFloodGauges);
  const selectFloodGauge = useArgos((s) => s.selectFloodGauge);
  const toggleFloodMaps = useArgos((s) => s.toggleFloodMaps);
  const setFloodArming = useArgos((s) => s.setFloodArming);
  const setFloodSeed = useArgos((s) => s.setFloodSeed);
  const setFloodParams = useArgos((s) => s.setFloodParams);
  const runFloodSim = useArgos((s) => s.runFloodSim);
  const clearFloodSim = useArgos((s) => s.clearFloodSim);
  const setFloodProgress = useArgos((s) => s.setFloodProgress);
  const setFloodPlaying = useArgos((s) => s.setFloodPlaying);
  const setMapCenter = useArgos((s) => s.setMapCenter);

  // Le statut du flux se lit dès l'ouverture : il dit quel fournisseur sert.
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
  const kindLabel: Record<FloodPoiKind, string> = { hospital: t.flood_hospitals, unit: t.flood_units, shelter: t.flood_shelters, city: t.flood_cities };
  const jauge = gauges.find((g) => g.gaugeId === sel) ?? null;
  const unite = (u: FloodUnit) => (u === "m3/s" ? "m³/s" : u === "m" ? "m" : "");
  /** « 1 240 m³/s » — le pic prévu d'une jauge, dans l'unité de ses seuils (débit GloFAS quand ils manquent encore). */
  const pic = (g: FloodGauge) => (g.peak === null ? "" : `${nombre(g.peak)} ${unite(g.thresholds?.unit ?? "m3/s")}`);
  const ouvrir = (g: FloodGauge) => {
    void selectFloodGauge(g.gaugeId);
    setMapCenter(g.ll, 11, g.siteName);
  };

  // Le scénario et ses chiffres dérivés se lisent avant de lancer : volume
  // d'une crue, débit d'un déversement, pointe et vidange d'une rupture.
  const scenario = scenarioOf(params);
  const derive =
    params.source === "river"
      ? tpl(t.flood_derived_volume, { v: (scenario.volumeM3 / 1e6).toFixed(1) })
      : params.source === "lake"
        ? tpl(t.flood_derived_q, { q: nombre(scenario.peakQ) })
        : tpl(t.flood_derived_dam, { q: nombre(scenario.peakQ), d: (scenario.durationS / 3600).toFixed(1) });

  // L'instant lu : son image, ses chiffres, l'heure simulée.
  const image = run ? run.frames[frameAt(run, progress).k] : null;
  const tSim = run ? progress * run.horizonS : 0;
  const horloge = tpl(t.flood_clock, hm(tSim));
  const pct = Math.round(progress * 100);
  const tete = run ? Math.round(headProgress(run) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 text-[13px] text-white/85">
      {/* ------------------------------------------------ prévisions du courtier */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className={lbl}>{t.flood_feed}</span>
            {status && (
              <span className="block truncate text-[10.5px] text-white/45">
                {status.provider === "google-flood-hub" ? t.flood_provider_google : t.flood_provider_om}
              </span>
            )}
          </span>
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
        {/* Le flux ne répond pas : sans rien à montrer, on le dit sans alarmer
            (le serveur réessaie) ; avec un dernier relevé, on date ce qu'on montre. */}
        {status?.degraded && gauges.length === 0 && (
          <p className="rounded-lg bg-or-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-or-300">{t.flood_feed_down}</p>
        )}
        {status?.degraded && gauges.length > 0 && (
          <p className="rounded-lg bg-danger-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-danger-300">
            {tpl(t.flood_feed_degraded, { at: quand(status.fetchedAt) })}
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
          <input type="checkbox" className="size-4 accent-or-500" checked={gaugesOn} onChange={toggleFloodGauges} />
          <span>{t.flood_show_gauges}</span>
          <span className="ms-auto font-mono text-[11px] text-white/50">{gauges.length}</span>
        </label>

        {status && !status.degraded && gauges.length === 0 && !busy && <p className="text-[11.5px] text-white/50">{t.flood_no_gauges}</p>}
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
                      {g.peak !== null ? ` · ${pic(g)}` : ""}
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
              {jauge.peak !== null && (
                <>
                  <dt className="text-white/55">{t.flood_peak}</dt>
                  <dd className="text-end font-mono font-semibold text-white">{pic(jauge)}</dd>
                </>
              )}
              {jauge.thresholds && (
                <>
                  <dt className="text-white/55">{t.flood_warning}</dt>
                  <dd className="text-end font-mono text-white">{nombre(jauge.thresholds.warning)} {unite(jauge.thresholds.unit)}</dd>
                  <dt className="text-white/55">{t.flood_danger}</dt>
                  <dd className="text-end font-mono text-white">{nombre(jauge.thresholds.danger)} {unite(jauge.thresholds.unit)}</dd>
                  {jauge.thresholds.extreme !== undefined && (
                    <>
                      <dt className="text-white/55">{t.flood_extreme}</dt>
                      <dd className="text-end font-mono text-white">{nombre(jauge.thresholds.extreme)} {unite(jauge.thresholds.unit)}</dd>
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
            {/* La jauge devient le point de départ d'une crue de rivière, au débit de danger connu — sinon au pic prévu. */}
            <button
              type="button"
              className={btn}
              onClick={() => {
                const q = jauge.thresholds?.unit === "m3/s" ? jauge.thresholds.danger : (jauge.peak ?? 0);
                setFloodParams({ source: "river", peakQ: Math.max(100, Math.round(q || FLOOD_DEFAULT_PARAMS.peakQ)) });
                setFloodSeed(jauge.ll);
              }}
            >
              {t.flood_use_gauge}
            </button>
          </div>
        )}
        {status && (
          <p className="text-[10.5px] leading-snug text-white/45">{status.provider === "google-flood-hub" ? t.flood_attribution_google : t.flood_attribution_om}</p>
        )}
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

        {params.source === "river" && (
          <>
            <Reglage label={t.flood_peak_q} value={params.peakQ} unit="m³/s" min={50} max={30000} step={50} onChange={(v) => setFloodParams({ peakQ: v })} />
            <Reglage label={t.flood_duration} value={params.durationH} unit="h" min={1} max={48} step={1} onChange={(v) => setFloodParams({ durationH: v })} />
          </>
        )}
        {params.source === "lake" && (
          <>
            <Reglage label={t.flood_volume} value={params.volumeHm3} unit="hm³" min={1} max={1000} step={1} onChange={(v) => setFloodParams({ volumeHm3: v })} />
            <Reglage label={t.flood_duration} value={params.durationH} unit="h" min={1} max={48} step={1} onChange={(v) => setFloodParams({ durationH: v })} />
          </>
        )}
        {params.source === "dam" && (
          <>
            <Reglage label={t.flood_dam_volume} value={params.volumeHm3} unit="hm³" min={1} max={3000} step={1} onChange={(v) => setFloodParams({ volumeHm3: v })} />
            <Reglage label={t.flood_dam_height} value={params.damHeightM} unit="m" min={5} max={150} step={1} onChange={(v) => setFloodParams({ damHeightM: v })} />
          </>
        )}
        <p className="text-[11px] font-semibold text-or-300">{derive}</p>
        <Reglage label={t.flood_horizon} value={params.horizonH} unit="h" min={1} max={24} step={1} onChange={(v) => setFloodParams({ horizonH: v })} />

        <label className="flex flex-col gap-1">
          <span className={lbl}>{t.flood_extent}</span>
          <select className={champ} value={params.extentKm} onChange={(e) => setFloodParams({ extentKm: Number(e.target.value) === 50 ? 50 : 25 })}>
            <option value={25}>{t.flood_extent_25}</option>
            <option value={50}>{t.flood_extent_50}</option>
          </select>
        </label>

        <div className="flex gap-2">
          <button type="button" className="btn-primaire min-h-11 flex-1 text-[13px] lg:min-h-0" onClick={() => void runFloodSim()} disabled={simBusy || !seed}>
            {simBusy ? t.flood_running : t.flood_run}
          </button>
          {(run || simBusy) && (
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

        {run && image && (
          <div className="flex flex-col gap-2 rounded-lg border border-white/15 p-2.5">
            {/* Lecture : l'eau gagne la vallée sur la carte en temps simulé ;
                le curseur suit, et se saisit — le tirer met en pause à l'instant choisi. */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFloodPlaying(!playing)}
                aria-label={playing ? t.flood_pause : pct >= 100 ? t.flood_replay : t.flood_play}
                title={playing ? t.flood_pause : pct >= 100 ? t.flood_replay : t.flood_play}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-or-500 text-rdia-900 transition-colors hover:bg-or-400 lg:h-9 lg:w-9"
              >
                <Icon path={playing ? UI_ICONS.pause : pct >= 100 ? UI_ICONS.refresh : UI_ICONS.play} size={16} strokeWidth={2.2} />
              </button>
              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[13px] font-bold text-white">{horloge}</span>
                  <span className="font-mono text-[10.5px] text-white/55">
                    {!done && !run.aborted ? tpl(t.flood_computing, { pct: tete }) : `${pct} %`}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  aria-label={t.flood_progress}
                  onChange={(e) => {
                    setFloodPlaying(false);
                    setFloodProgress(Math.min(Number(e.target.value) / 100, headProgress(run)));
                  }}
                  className="w-full accent-or-500"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] text-white/60">
              <span className="shrink-0">{t.flood_legend} · 0.1 m</span>
              <span
                className="h-2 min-w-0 flex-1 rounded-full"
                style={{ background: `linear-gradient(to right, rgb(${FLOOD_SHALLOW_RGB.join(",")}), rgb(${FLOOD_DEEP_RGB.join(",")}))` }}
                aria-hidden="true"
              />
              <span className="shrink-0">≥ {FLOOD_COLOR_REF_M} m</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
              <dt className="text-white/55">{t.flood_area}</dt>
              <dd className="text-end font-mono font-semibold text-white">{image.area.toFixed(1)} km²</dd>
              <dt className="text-white/55">{t.flood_depth}</dt>
              <dd className="text-end font-mono font-semibold text-white">{image.maxDepth.toFixed(1)} m</dd>
              <dt className="text-white/55">{t.flood_volume_ground}</dt>
              <dd className="text-end font-mono text-white">{(image.volume / 1e6).toFixed(2)} hm³</dd>
              <dt className="text-white/55">{t.flood_volume_in}</dt>
              <dd className="text-end font-mono text-white">{(image.volumeIn / 1e6).toFixed(2)} hm³</dd>
              {image.volumeOut > 0 && (
                <>
                  <dt className="text-white/55">{t.flood_volume_out}</dt>
                  <dd className="text-end font-mono text-white">{(image.volumeOut / 1e6).toFixed(2)} hm³</dd>
                </>
              )}
              <dt className="text-white/55">{t.flood_cells}</dt>
              <dd className="text-end font-mono text-white">{Math.round(run.sim.dx)} m</dd>
            </dl>
            {partial && <p className="text-[11px] leading-snug text-or-300">{t.flood_partial}</p>}
            <div className={lbl}>{t.flood_impacts}</div>
            {run.impacts.length === 0 ? (
              <p className="text-[11px] text-white/50">{t.flood_none_hit}</p>
            ) : (
              <ul className="flex flex-col gap-0.5 text-[11.5px]">
                {run.impacts.map((i) => {
                  const { h, m } = hm(i.reachedAt);
                  return (
                    // Ce que l'eau n'a pas encore atteint à l'instant lu reste en retrait.
                    <li key={i.id} className={`flex items-baseline justify-between gap-2 ${i.reachedAt > tSim ? "opacity-45" : ""}`}>
                      <span className="min-w-0 truncate">
                        <span className="font-semibold text-or-300">{kindLabel[i.kind]}</span>
                        <span className="text-white/80"> · {i.nom}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] text-white/60">{tpl(t.flood_reached_at, { t: `${h} h ${m}` })}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
