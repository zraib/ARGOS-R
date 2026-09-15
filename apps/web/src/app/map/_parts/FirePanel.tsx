"use client";

import { useArgos, useDict } from "@/lib/store";
import { tpl } from "@/lib/i18n/format";
import { FIRE_EMBER_RGB, FIRE_NEW_RGB, FIRE_OLD_RGB } from "@/components/map/layers/fire";
import { FUEL_KINDS, headRos, lengthToBreadth, type FuelKind } from "@/lib/fire/spread";
import { frameAt } from "@/lib/sim/spread";
import { Impacts, Lecteur, Reglage, lbl, nombre } from "@/app/map/_parts/simui";

// ============================================================================
// Panneau « Feux de forêt » de la carte (ADR 0011) : le simulateur de
// propagation du front, calculé ici même sur le relief — un point
// d'allumage, le combustible dominant, le vent (relevé au point par le
// courtier météo de l'API, ou réglé à la main), l'air, un horizon — et le
// feu qui gagne la carte en temps simulé, avec l'heure à laquelle il atteint
// hôpitaux, unités, abris et villes. Une simulation est une hypothèse : le
// panneau le dit en toutes lettres.
// ============================================================================

const champ = "w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[13px] text-white";
const btn = "btn-secondaire min-h-11 w-full text-[13px] lg:min-h-0";

/** « 12:40 » — l'heure d'un relevé, lisible. */
function heure(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FirePanel() {
  const t = useDict();
  const seed = useArgos((s) => s.fireSeed);
  const arming = useArgos((s) => s.fireArming);
  const params = useArgos((s) => s.fireParams);
  const weatherAt = useArgos((s) => s.fireWeatherAt);
  const weatherBusy = useArgos((s) => s.fireWeatherBusy);
  const weatherError = useArgos((s) => s.fireWeatherError);
  const run = useArgos((s) => s.fireSim);
  // Relu à chaque nouvelle image : la course est mutable, le magasin ne signale que son compte d'images.
  useArgos((s) => s.fireFrames);
  const partial = useArgos((s) => s.firePartial);
  const simBusy = useArgos((s) => s.fireSimBusy);
  const simError = useArgos((s) => s.fireSimError);
  const progress = useArgos((s) => s.fireProgress);
  const playing = useArgos((s) => s.firePlaying);
  const setFireArming = useArgos((s) => s.setFireArming);
  const setFireParams = useArgos((s) => s.setFireParams);
  const fetchFireWeather = useArgos((s) => s.fetchFireWeather);
  const runFireSim = useArgos((s) => s.runFireSim);
  const clearFireSim = useArgos((s) => s.clearFireSim);
  const setFireProgress = useArgos((s) => s.setFireProgress);
  const setFirePlaying = useArgos((s) => s.setFirePlaying);

  const fuelLabel: Record<FuelKind, string> = {
    grass: t.fire_fuel_grass,
    shrub: t.fire_fuel_shrub,
    conifer: t.fire_fuel_conifer,
    broadleaf: t.fire_fuel_broadleaf,
    sparse: t.fire_fuel_sparse,
  };
  // « d'ouest » se lit mieux que « 270° » : les huit points cardinaux, selon la langue.
  const points = t.fire_compass.split(",");
  const cardinal = points[Math.round((((params.windFromDeg % 360) + 360) % 360) / 45) % 8] ?? "";
  const tete = headRos(params);
  const lb = lengthToBreadth(params.windKmh);
  const image = run ? run.frames[frameAt(run, progress).k] : null;
  const tSim = run ? progress * run.horizonS : 0;

  return (
    <div className="flex flex-col gap-2 text-[13px] text-white/85">
      <span className={lbl}>{t.fire_sim}</span>
      <p className="text-[11px] leading-snug text-white/55">{t.fire_sim_hint}</p>

      <div className={lbl}>{t.sim_seed}</div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white">
          {seed ? `${seed[1].toFixed(4)}, ${seed[0].toFixed(4)}` : t.sim_seed_none}
        </span>
        <button
          type="button"
          onClick={() => setFireArming(!arming)}
          aria-pressed={arming}
          className={`min-h-11 shrink-0 rounded-md px-2.5 text-[12px] font-semibold transition-colors lg:min-h-0 lg:py-1 ${
            arming ? "bg-or-500 text-rdia-900" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          {arming ? t.sim_picking : t.sim_pick}
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className={lbl}>{t.fire_fuel}</span>
        <select className={champ} value={params.fuel} onChange={(e) => setFireParams({ fuel: e.target.value as FuelKind })}>
          {FUEL_KINDS.map((f) => (
            <option key={f} value={f}>
              {fuelLabel[f]}
            </option>
          ))}
        </select>
      </label>

      {/* La météo du point, par le courtier de l'API — jamais un tiers depuis le poste — puis corrigeable à la main. */}
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[10.5px] text-white/50">
          {weatherAt ? tpl(t.fire_weather_at, { at: heure(weatherAt) }) : weatherError ? t.fire_weather_fail : ""}
        </span>
        <button type="button" className={`${btn} w-auto shrink-0 px-2.5`} onClick={() => void fetchFireWeather()} disabled={!seed || weatherBusy}>
          {t.fire_weather_btn}
        </button>
      </div>
      <Reglage label={t.fire_wind} value={params.windKmh} unit="km/h" min={0} max={120} step={1} onChange={(v) => setFireParams({ windKmh: v })} />
      <Reglage label={`${t.fire_wind_from} · ${cardinal}`} value={params.windFromDeg} unit="°" min={0} max={359} step={1} onChange={(v) => setFireParams({ windFromDeg: v })} />
      <Reglage label={t.fire_humidity} value={params.humidityPct} unit="%" min={5} max={100} step={1} onChange={(v) => setFireParams({ humidityPct: v })} />
      <Reglage label={t.fire_temp} value={params.tempC} unit="°C" min={0} max={50} step={1} onChange={(v) => setFireParams({ tempC: v })} />
      <p className="text-[11px] font-semibold text-or-300">
        {t.fire_head_ros} ≈ {nombre(tete)} m/min · {t.fire_lb} {lb.toFixed(1)}
      </p>
      <Reglage label={t.sim_horizon} value={params.horizonH} unit="h" min={1} max={24} step={1} onChange={(v) => setFireParams({ horizonH: v })} />

      <label className="flex flex-col gap-1">
        <span className={lbl}>{t.sim_extent}</span>
        <select className={champ} value={params.extentKm} onChange={(e) => setFireParams({ extentKm: Number(e.target.value) === 50 ? 50 : 25 })}>
          <option value={25}>{t.sim_extent_25}</option>
          <option value={50}>{t.sim_extent_50}</option>
        </select>
      </label>

      <div className="flex gap-2">
        <button type="button" className="btn-primaire min-h-11 flex-1 text-[13px] lg:min-h-0" onClick={() => void runFireSim()} disabled={simBusy || !seed}>
          {simBusy ? t.sim_running : t.sim_run}
        </button>
        {(run || simBusy) && (
          <button type="button" className={`${btn} w-auto`} onClick={clearFireSim}>
            {t.sim_clear}
          </button>
        )}
      </div>
      {simError && (
        <p role="alert" className="rounded-lg bg-danger-500/15 px-2.5 py-1.5 text-[11.5px] leading-snug text-danger-300">
          {simError === "seed" ? t.sim_err_seed : simError === "elevation" ? t.sim_err_elevation : t.sim_err_dem}
        </p>
      )}

      {run && image && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/15 p-2.5">
          <Lecteur
            run={run}
            progress={progress}
            playing={playing}
            onToggle={() => setFirePlaying(!playing)}
            onSeek={(p) => {
              setFirePlaying(false);
              setFireProgress(p);
            }}
          />
          <div className="flex items-center gap-2 text-[10.5px] text-white/60">
            <span className="shrink-0">{t.fire_legend} · {t.fire_legend_new}</span>
            <span
              className="h-2 min-w-0 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, rgb(${FIRE_NEW_RGB.join(",")}), rgb(${FIRE_OLD_RGB.join(",")}) 70%, rgb(${FIRE_EMBER_RGB.join(",")}))` }}
              aria-hidden="true"
            />
            <span className="shrink-0">{t.fire_legend_old}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
            <dt className="text-white/55">{t.fire_area}</dt>
            <dd className="text-end font-mono font-semibold text-white">{image.area.toFixed(1)} km²</dd>
            <dt className="text-white/55">{t.fire_burning}</dt>
            <dd className="text-end font-mono font-semibold text-white">{image.burningKm2.toFixed(1)} km²</dd>
            <dt className="text-white/55">{t.fire_head_ros}</dt>
            <dd className="text-end font-mono text-white">{nombre(run.spread.head)} m/min</dd>
            <dt className="text-white/55">{t.sim_cells}</dt>
            <dd className="text-end font-mono text-white">{Math.round(run.spread.dx)} m</dd>
          </dl>
          {run.truncated && <p className="text-[11px] leading-snug text-or-300">{t.fire_truncated}</p>}
          {partial && !run.truncated && <p className="text-[11px] leading-snug text-or-300">{t.sim_partial}</p>}
          <Impacts run={run} tSim={tSim} />
        </div>
      )}
    </div>
  );
}
