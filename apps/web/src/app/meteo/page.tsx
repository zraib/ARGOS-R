"use client";

// ============================================================================
// ARGOS — page Météo (flux Open-Meteo via proxy souverain)
// Conditions actuelles (indicateurs) + prévisions 7 jours par ville. Chrome
// partagé avec la page Sismologie (components/flux/FluxUI) pour la cohérence.
// Données servies par l'API (client généré, contrat-first §4.2).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useArgos } from "@/lib/store";
import { api } from "@/lib/api";
import { FLUX, wmoText } from "@/lib/i18n/flux";
import { FLUX_ICONS } from "@/lib/icons";
import { MICRO, SourceNote, StatTile } from "@/components/flux/FluxUI";
import type { WeatherCity, WeatherForecast } from "@/lib/types";

/** Jour de la semaine + quantième, localisé. */
function fmtDay(dateISO: string, lang: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

/** Heure HH:MM extraite d'une ISO locale (sans conversion de fuseau). */
function hm(iso: string): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : "—";
}

/** Champ libellé / valeur d'un détail (jour déplié). */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className={MICRO}>{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{value}</div>
    </div>
  );
}

export default function MeteoPage() {
  const lang = useArgos((s) => s.lang);
  const f = FLUX[lang];
  const [cities, setCities] = useState<WeatherCity[]>([]);
  const [cityId, setCityId] = useState<string>("");
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [dayIdx, setDayIdx] = useState<number | null>(null); // jour déplié

  const city = useMemo(() => cities.find((c) => c.id === cityId) ?? null, [cities, cityId]);

  // Chargement des villes disponibles (une fois).
  useEffect(() => {
    let alive = true;
    void api.getWeatherCities().then((res) => {
      if (!alive) return;
      const list = (res.data as WeatherCity[] | undefined) ?? [];
      setCities(list);
      if (list.length) setCityId((prev) => prev || list[0].id);
    });
    return () => { alive = false; };
  }, []);

  // Chargement des prévisions pour la ville sélectionnée.
  useEffect(() => {
    if (!city) return;
    let alive = true;
    setLoading(true);
    setDayIdx(null); // réinitialise le jour déplié au changement de ville
    void api.getWeatherForecast(city.lat, city.lon).then((res) => {
      if (!alive) return;
      setForecast((res.data as WeatherForecast | undefined) ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [city]);

  const now = forecast?.current;
  const nowWmo = now ? wmoText(now.code, lang) : null;
  const dash = "—";

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Barre d'outils : contexte à gauche, sélection de ville à droite */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-rdia-300">
          {f.wx_sub}{city ? ` · ${city.nom}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <label className={MICRO} htmlFor="wx-city">{f.wx_city}</label>
          <select
            id="wx-city"
            className="input-champ text-sm"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            {cities.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </div>
      </div>

      {/* Conditions actuelles (gabarit KPI, cohérent avec la page Sismologie) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={FLUX_ICONS.thermometer}
          iconWrap="bg-or-500/15 text-or-500"
          label={f.wx_temp}
          value={now ? `${now.temp}°C` : dash}
          sub={nowWmo ? `${nowWmo.icon} ${nowWmo.label}` : undefined}
          subColor="text-gray-500 dark:text-rdia-300"
        />
        <StatTile icon={FLUX_ICONS.droplet} iconWrap="bg-blue-500/10 text-blue-500" label={f.wx_humidity} value={now ? `${now.humidity} %` : dash} />
        <StatTile icon={FLUX_ICONS.wind} iconWrap="bg-green-500/10 text-green-600" label={f.wx_wind} value={now ? `${now.wind} km/h` : dash} />
        <StatTile icon={FLUX_ICONS.rain} iconWrap="bg-blue-500/10 text-blue-500" label={f.wx_precip} value={now ? `${now.precip} mm` : dash} />
      </div>

      {/* Prévisions 7 jours (cliquer un jour ouvre son détail) */}
      <div className="carte flex flex-col gap-3 p-4">
        <div className={MICRO}>{f.wx_forecast}</div>
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-rdia-400">…</div>
        ) : forecast && forecast.daily.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {forecast.daily.map((d, i) => {
                const w = wmoText(d.code, lang);
                const sel = dayIdx === i;
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDayIdx(sel ? null : i)}
                    className={`flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-center transition-colors ${
                      sel
                        ? "bg-or-500/15 ring-2 ring-or-500/50"
                        : i === 0
                          ? "bg-or-500/10 ring-1 ring-or-500/30 hover:bg-or-500/15"
                          : "bg-gray-50 hover:bg-gray-100 dark:bg-rdia-800/50 dark:hover:bg-rdia-800"
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-rdia-300">{i === 0 ? f.wx_today : fmtDay(d.date, lang)}</div>
                    <div className="text-3xl leading-none">{w.icon}</div>
                    <div className="min-h-[26px] text-[10px] leading-tight text-gray-400 dark:text-rdia-400">{w.label}</div>
                    <div className="mt-0.5 flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-sm font-bold text-gray-800 dark:text-rdia-50">{d.tmax}°</span>
                      <span className="text-xs text-gray-400 dark:text-rdia-400">{d.tmin}°</span>
                    </div>
                    <div className="min-h-[14px] text-[10px] font-semibold tabular-nums text-blue-500">{d.precip > 0 ? `${d.precip} mm` : ""}</div>
                  </button>
                );
              })}
            </div>

            {/* Détail du jour sélectionné */}
            {dayIdx != null && forecast.daily[dayIdx] && (() => {
              const d = forecast.daily[dayIdx];
              const w = wmoText(d.code, lang);
              return (
                <div className="mt-1 rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-rdia-700/50 dark:bg-rdia-800/40">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-2xl leading-none">{w.icon}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-rdia-50">{dayIdx === 0 ? f.wx_today : fmtDay(d.date, lang)}</span>
                    <span className="text-xs text-gray-500 dark:text-rdia-300">· {w.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                    <Metric label={f.wx_feels_short} value={`${d.feelMax}° / ${d.feelMin}°`} />
                    <Metric label={f.wx_precip_prob} value={`${d.precipProb} %`} />
                    <Metric label={f.wx_precip} value={`${d.precip} mm`} />
                    <Metric label={f.wx_wind_max} value={`${d.windMax} km/h`} />
                    <Metric label={f.wx_gust} value={`${d.gustMax} km/h`} />
                    <Metric label={f.wx_uv} value={`${d.uvMax}`} />
                    <Metric label={f.wx_sunrise} value={hm(d.sunrise)} />
                    <Metric label={f.wx_sunset} value={hm(d.sunset)} />
                  </div>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-rdia-400">{f.wx_unavailable}</div>
        )}
      </div>

      <SourceNote>{f.wx_source}</SourceNote>
    </section>
  );
}
