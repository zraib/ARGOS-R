"use client";

// ============================================================================
// ARGOS — pop-up de prévisions météo d'un point de la carte
// Ouverte depuis le menu contextuel (Maj + clic droit). Reprend les détails de
// l'ancienne page Météo : conditions actuelles + 7 jours, sans défilement.
// ============================================================================

import { useEffect, useState } from "react";
import { useArgos } from "@/lib/store";
import { api } from "@/lib/api";
import { FLUX, wmoText } from "@/lib/i18n/flux";
import { Modal } from "@/components/ui/Modal";
import type { WeatherForecast } from "@/lib/types";

/** Jour court localisé (mer. 6). */
function fmtDay(dateISO: string, lang: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric" });
}
const hm = (iso: string) => (iso && iso.length >= 16 ? iso.slice(11, 16) : "—");

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{value}</div>
    </div>
  );
}

/**
 * Prévisions complètes pour un point [lng, lat] cliqué sur la carte.
 * `place` : nom de la ville la plus proche du clic (≤ 35 km) — le titre
 * l'affiche à la place des coordonnées brutes quand il est connu.
 */
export function WeatherPopup({ ll, place, onClose }: { ll: [number, number]; place?: string | null; onClose: () => void }) {
  const lang = useArgos((s) => s.lang);
  const f = FLUX[lang];
  const [fc, setFc] = useState<WeatherForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void api.getWeatherForecast(ll[1], ll[0]).then((res) => {
      if (!alive) return;
      setFc((res.data as WeatherForecast | undefined) ?? null);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [ll]);

  const now = fc?.current;
  const w = now ? wmoText(now.code, lang) : null;
  const today = fc?.daily[0];

  return (
    <Modal open title={`${f.wx_title} — ${place ?? `${ll[1].toFixed(3)}, ${ll[0].toFixed(3)}`}`} onClose={onClose} size="xl">
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-rdia-400">…</div>
      ) : !fc || !now || !w ? (
        <div className="py-16 text-center text-sm text-gray-400 dark:text-rdia-400">{f.wx_unavailable}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Conditions actuelles */}
          <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
            <div className="flex items-center gap-4">
              <span className="text-6xl leading-none">{w.icon}</span>
              <div>
                <div className="text-4xl font-bold text-gray-800 dark:text-rdia-50">{now.temp}°C</div>
                <div className="text-sm text-gray-500 dark:text-rdia-300">{w.label} · {f.wx_feels_short} {now.feels}°</div>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
              <Metric label={f.wx_humidity} value={`${now.humidity} %`} />
              <Metric label={f.wx_wind} value={`${now.wind} km/h`} />
              <Metric label={f.wx_gust} value={`${now.gust} km/h`} />
              <Metric label={f.wx_pressure} value={`${now.pressure} hPa`} />
              <Metric label={f.wx_cloud} value={`${now.cloud} %`} />
              <Metric label={f.wx_precip} value={`${now.precip} mm`} />
            </div>
          </div>

          {/* Prévisions 7 jours */}
          <div>
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{f.wx_forecast}</div>
            <div className="grid grid-cols-7 gap-2">
              {fc.daily.map((d, i) => {
                const wd = wmoText(d.code, lang);
                return (
                  <div
                    key={d.date}
                    className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center ${i === 0 ? "bg-or-500/10 ring-1 ring-or-500/30" : "bg-gray-50 dark:bg-rdia-800/50"}`}
                  >
                    <div className="text-[11px] font-semibold text-gray-500 dark:text-rdia-300">{i === 0 ? f.wx_today : fmtDay(d.date, lang)}</div>
                    <div className="text-2xl leading-none">{wd.icon}</div>
                    <div className="flex items-baseline gap-1 tabular-nums">
                      <span className="text-sm font-bold text-gray-800 dark:text-rdia-50">{d.tmax}°</span>
                      <span className="text-xs text-gray-400 dark:text-rdia-400">{d.tmin}°</span>
                    </div>
                    <div className="min-h-[13px] text-[10px] font-semibold tabular-nums text-blue-500">{d.precip > 0 ? `${d.precip} mm` : ""}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Repères du jour */}
          {today && (
            <div className="grid grid-cols-3 gap-4 border-t border-gray-100 pt-3 dark:border-rdia-700/50">
              <Metric label={f.wx_sunrise} value={hm(today.sunrise)} />
              <Metric label={f.wx_sunset} value={hm(today.sunset)} />
              <Metric label={f.wx_uv} value={`${today.uvMax}`} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
