"use client";

// ============================================================================
// ARGOS — page Sismologie (flux CSEM/EMSC via proxy souverain)
// Situation sismique en direct : indicateurs, filtres, liste, renvoi carte.
// Chrome partagé avec la page Météo (components/flux/FluxUI) pour la cohérence.
// Données depuis l'API (store.quakes) — aucun fetch manuel (§4.2).
// ============================================================================

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
import { Icon } from "@/components/ui/Icon";
import { FLUX_ICONS, UI_ICONS } from "@/lib/icons";
import { LivePill, MICRO, Seg, SegBtn, SourceNote, StatTile, ToggleChip } from "@/components/flux/FluxUI";
import type { SeismicEvent } from "@/lib/types";

/** Pastille de magnitude : plus la magnitude est forte, plus la couleur alerte. */
function magClass(m: number): string {
  if (m >= 5) return "bg-danger-500 text-white";
  if (m >= 4) return "bg-or-500 text-rdia-600";
  if (m >= 3) return "bg-amber-400 text-rdia-700";
  return "bg-gray-300 text-gray-700 dark:bg-rdia-600 dark:text-rdia-100";
}

/** Date/heure UTC compacte JJ/MM HH:MM. */
function fmtUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Date/heure locale complète (fuseau du poste), localisée. */
function fmtLocal(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

/** Champ libellé / valeur d'une zone de détail (dépliée). */
function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className={MICRO}>{label}</div>
      <div className={`text-sm text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}

// Codes de type d'événement EMSC → libellé lisible (trilingue), repli sur le code.
const EVTYPE: Record<string, { fr: string; en: string; ar: string }> = {
  ke: { fr: "Séisme", en: "Earthquake", ar: "زلزال" },
  se: { fr: "Séisme suspecté", en: "Suspected earthquake", ar: "زلزال مشتبه" },
  qb: { fr: "Tir de carrière", en: "Quarry blast", ar: "تفجير محجر" },
  ex: { fr: "Explosion", en: "Explosion", ar: "انفجار" },
  ls: { fr: "Glissement de terrain", en: "Landslide", ar: "انزلاق أرضي" },
};
function evLabel(code: string, lang: "fr" | "ar" | "en"): string {
  const e = EVTYPE[(code || "").toLowerCase()];
  return e ? e[lang] : code || "—";
}

const MINMAGS = [2.5, 3, 4, 5];
const TH = `px-4 py-3 text-start ${MICRO}`;

export default function SeismologiePage() {
  const lang = useArgos((s) => s.lang);
  const f = FLUX[lang];
  const router = useRouter();
  const quakes = useArgos((s) => s.quakes);
  const quakesOn = useArgos((s) => s.quakesOn);
  const minmag = useArgos((s) => s.quakesMinMag);
  const region = useArgos((s) => s.quakesRegion);
  const setQuakesOn = useArgos((s) => s.setQuakesOn);
  const setQuakesFilter = useArgos((s) => s.setQuakesFilter);
  const loadQuakes = useArgos((s) => s.loadQuakes);
  const focusQuake = useArgos((s) => s.focusQuake);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null); // ligne dépliée

  // Chargement initial + rechargement à chaque changement de filtre.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadQuakes().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadQuakes, minmag, region]);

  const strongest = useMemo(() => (quakes.length ? quakes.reduce((a, b) => (b.mag > a.mag ? b : a)) : null), [quakes]);
  const last24 = useMemo(() => {
    const cut = Date.now() - 24 * 3600 * 1000;
    return quakes.filter((q) => new Date(q.time).getTime() >= cut).length;
  }, [quakes]);
  const avgDepth = useMemo(() => {
    if (!quakes.length) return null;
    return Math.round(quakes.reduce((s, q) => s + Math.abs(q.depth), 0) / quakes.length);
  }, [quakes]);

  const seeOnMap = (ev: SeismicEvent) => { focusQuake(ev); router.push("/map"); };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Barre d'outils : contexte à gauche, contrôles temps réel à droite.
          Sur téléphone les trois contrôles ne tiennent pas sur une ligne : ils
          s'enroulent au lieu de pousser la page hors de l'écran. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-rdia-300">{f.seis_sub}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LivePill label={f.seis_live} />
          <ToggleChip on={quakesOn} onClick={() => setQuakesOn(!quakesOn)} label={f.seis_layer} />
          <button
            onClick={() => { setLoading(true); void loadQuakes().finally(() => setLoading(false)); }}
            className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs disabled:opacity-50"
            disabled={loading}
            aria-label={f.seis_updated}
          >
            <Icon path={UI_ICONS.expand} size={13} className={loading ? "animate-spin" : ""} /> {f.seis_updated}
          </button>
        </div>
      </div>

      {/* Indicateurs (gabarit KPI du tableau de bord) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={FLUX_ICONS.activity} iconWrap="bg-or-500/15 text-or-500" label={f.seis_count} value={quakes.length} />
        <StatTile icon={FLUX_ICONS.clock} iconWrap="bg-blue-500/10 text-blue-500" label={f.seis_last24} value={last24} />
        <StatTile icon={FLUX_ICONS.alert} iconWrap="bg-danger-500/10 text-danger-500" label={f.seis_strongest} value={strongest ? `M${strongest.mag.toFixed(1)}` : "—"} valueColor="text-danger-500" sub={strongest ? strongest.region : undefined} />
        <StatTile icon={FLUX_ICONS.depth} iconWrap="bg-green-500/10 text-green-600" label={f.seis_col_depth} value={avgDepth != null ? `${avgDepth} ${f.seis_km}` : "—"} />
      </div>

      {/* Liste des séismes + filtres dans l'en-tête de la carte */}
      <div className="carte flex flex-col gap-3 p-0">
        {/* Filtres. Les deux groupes segmentés dépassent 375 px côte à côte : ils
            s'empilent sur téléphone. `[&_button]` porte la cible tactile de 44 px
            jusque dans `SegBtn`, primitive partagée avec l'écran Météo. */}
        <div className="flex flex-col gap-3 border-b border-gray-100 px-3 pt-3 pb-3 dark:border-rdia-700/50 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-4 sm:pt-4 [&_button]:min-h-[44px] lg:[&_button]:min-h-0">
          <Seg>
            <SegBtn on={region === "morocco"} onClick={() => setQuakesFilter(minmag, "morocco")}>{f.seis_region_morocco}</SegBtn>
            <SegBtn on={region === "world"} onClick={() => setQuakesFilter(minmag, "world")}>{f.seis_region_world}</SegBtn>
          </Seg>
          <div className="flex flex-wrap items-center gap-2">
            <span className={MICRO}>{f.seis_minmag}</span>
            <Seg>
              {MINMAGS.map((m) => (
                <SegBtn key={m} on={minmag === m} onClick={() => setQuakesFilter(m, region)}>≥ {m}</SegBtn>
              ))}
            </Seg>
          </div>
        </div>

        {/* Tableau : à partir de `md`, la densité redevient lisible. */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-rdia-600">
                <th className={TH}>{f.seis_col_mag}</th>
                <th className={TH}>{f.seis_col_region}</th>
                <th className={TH}>{f.seis_col_depth}</th>
                <th className={TH}>{f.seis_col_time}</th>
                <th className={`${TH} text-end`}></th>
              </tr>
            </thead>
            <tbody>
              {quakes.map((q) => {
                const open = openId === q.id;
                return (
                  <Fragment key={q.id}>
                    <tr
                      onClick={() => setOpenId(open ? null : q.id)}
                      className={`cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-rdia-700/50 dark:hover:bg-rdia-700/30 ${open ? "bg-gray-50 dark:bg-rdia-700/30" : ""}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex min-w-[3rem] items-center justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${magClass(q.mag)}`}>
                          {q.mag.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-rdia-100">{q.region}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-gray-500 dark:text-rdia-300">{Math.round(Math.abs(q.depth))} {f.seis_km}</td>
                      <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-gray-500 dark:text-rdia-300">{fmtUTC(q.time)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <button className="btn-secondaire cible-tactile inline-flex items-center gap-1.5 text-xs" onClick={(e) => { e.stopPropagation(); seeOnMap(q); }}>
                            <Icon path={UI_ICONS.map} size={13} /> {f.seis_on_map}
                          </button>
                          <Icon path={UI_ICONS.caretDown} size={14} className={`shrink-0 text-gray-400 transition-transform dark:text-rdia-400 ${open ? "rotate-180" : ""}`} />
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-gray-100 bg-gray-50/70 dark:border-rdia-700/50 dark:bg-rdia-800/40">
                        <td colSpan={5} className="px-4 py-3.5">
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
                            <Detail label={f.seis_evtype} value={evLabel(q.evtype, lang)} />
                            <Detail label={f.seis_magtype} value={q.magType || "—"} />
                            <Detail label={f.seis_agency} value={q.agency} />
                            <Detail label={f.seis_coords} value={`${q.lat.toFixed(3)}, ${q.lon.toFixed(3)}`} mono />
                            <Detail label={f.seis_local} value={fmtLocal(q.time, lang)} mono />
                            <Detail label={f.seis_update} value={fmtLocal(q.lastUpdate, lang)} mono />
                            {q.sourceId && <Detail label={f.seis_ref} value={q.sourceId} mono />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {quakes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-rdia-400">{loading ? "…" : f.seis_empty}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Sous `md` : une carte par séisme — mêmes colonnes, même dépliement de
            détail, même renvoi vers la carte. Rien n'est retiré. */}
        <div className="flex flex-col gap-2 px-3 pb-3 md:hidden">
          {quakes.map((q) => {
            const open = openId === q.id;
            return (
              <div key={q.id} className="rounded-xl border border-gray-100 dark:border-rdia-700/50">
                {/* L'en-tête entier est la commande de dépliement : cible large au doigt. */}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : q.id)}
                  className={`flex w-full items-center gap-3 rounded-t-xl p-3 text-start transition-colors ${open ? "bg-gray-50 dark:bg-rdia-700/30" : ""}`}
                >
                  <span className={`inline-flex min-w-[3rem] shrink-0 items-center justify-center rounded-lg px-2 py-1 text-sm font-bold tabular-nums ${magClass(q.mag)}`}>
                    {q.mag.toFixed(1)}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-gray-700 dark:text-rdia-100">{q.region}</span>
                  <Icon path={UI_ICONS.caretDown} size={16} className={`shrink-0 text-gray-400 transition-transform dark:text-rdia-400 ${open ? "rotate-180" : ""}`} />
                </button>

                <div className="flex flex-col gap-3 border-t border-gray-100 p-3 dark:border-rdia-700/50">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <Detail label={f.seis_col_depth} value={`${Math.round(Math.abs(q.depth))} ${f.seis_km}`} mono />
                    <Detail label={f.seis_col_time} value={fmtUTC(q.time)} mono />
                    {open && (
                      <>
                        <Detail label={f.seis_evtype} value={evLabel(q.evtype, lang)} />
                        <Detail label={f.seis_magtype} value={q.magType || "—"} />
                        <Detail label={f.seis_agency} value={q.agency} />
                        <Detail label={f.seis_coords} value={`${q.lat.toFixed(3)}, ${q.lon.toFixed(3)}`} mono />
                        <Detail label={f.seis_local} value={fmtLocal(q.time, lang)} mono />
                        <Detail label={f.seis_update} value={fmtLocal(q.lastUpdate, lang)} mono />
                        {q.sourceId && <Detail label={f.seis_ref} value={q.sourceId} mono />}
                      </>
                    )}
                  </div>
                  <button className="btn-secondaire cible-tactile inline-flex items-center justify-center gap-1.5 text-sm" onClick={() => seeOnMap(q)}>
                    <Icon path={UI_ICONS.map} size={14} /> {f.seis_on_map}
                  </button>
                </div>
              </div>
            );
          })}
          {quakes.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400 dark:text-rdia-400">{loading ? "…" : f.seis_empty}</div>
          )}
        </div>
      </div>

      <SourceNote>{f.seis_source}</SourceNote>
    </section>
  );
}
