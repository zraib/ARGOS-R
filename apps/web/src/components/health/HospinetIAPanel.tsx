"use client";

import { tpl } from "@/lib/i18n/format";
import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import {
  aggregateHospitalsFacts,
  generateHospinetSummary,
  generateSummaryFallback,
  } from "@/lib/ai/llmHospinetSummary";
import {
  fmtInt,
  fmtPct,
  occTint,
  occLabelKey,
  occChip,
  KpiProps,
  ExpandedKey,
} from "@/components/health/parts/shared";
import { OccupancyRing } from "@/components/health/parts/OccupancyRing";
import { ServicesBars } from "@/components/health/parts/ServicesBars";
import { NetworksBars } from "@/components/health/parts/NetworksBars";
import { KpiCard } from "@/components/health/parts/KpiCard";
import { ExpandBtn } from "@/components/health/parts/ExpandBtn";
import { Row } from "@/components/health/parts/Row";

export function HospinetIAPanel() {
  const t = useDict();
  const m = useModules();
  const lang = useArgos((s) => s.lang);
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const L = m.hospinet;

  const facts = useMemo(
    () => aggregateHospitalsFacts(hospitals, fieldHosps, L),
    [hospitals, fieldHosps, L]
  );

  const fallback = useMemo(() => generateSummaryFallback(facts, L), [facts, L]);

  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string>(fallback);
  const [isFallback, setIsFallback] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const [expanded, setExpanded] = useState<ExpandedKey>(null);

  // LLM en arrière-plan (fallback affiché immédiatement)
  useEffect(() => {
    let alive = true;
    setText(fallback);
    setIsFallback(true);
    setBusy(true);
    void (async () => {
      const res = await generateHospinetSummary(hospitals, fieldHosps, lang, L);
      if (!alive) return;
      setText(res.text);
      setIsFallback(res.fallback);
      setError(res.error);
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [hospitals, fieldHosps, fallback, lang, L]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    const res = await generateHospinetSummary(hospitals, fieldHosps, lang, L);
    setText(res.text);
    setIsFallback(res.fallback);
    setError(res.error);
    setBusy(false);
  }

  // Échap ferme l'overlay expand (pattern LocationPreviewMap)
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setExpanded(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  const freePct = facts.lits > 0 ? Math.round((facts.free / facts.lits) * 100) : 0;
  const kpiFreeTint: KpiProps["tint"] =
    freePct >= 25 ? "green" : freePct >= 15 ? "orange" : "red";
  const kpiSatTint: KpiProps["tint"] =
    facts.saturated === 0 ? "green" : facts.saturated <= 2 ? "orange" : "red";

  const cardCls =
    "rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700";
  const sectionTitleCls =
    "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
  const sectionSubtitleCls =
    "mt-0.5 text-[11px] font-medium text-gray-500 dark:text-rdia-300";

  const cardRelativeWrap = "relative";

  return (
    <section className="flex flex-col gap-3 animate-fade-in">
      {/* ---------------- HEADER ---------------- */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
            <Icon path={UI_ICONS.sparkles} size={17} />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-extrabold text-rdia-600 dark:text-rdia-50">
              {t.hn_ia_title}
            </h2>
            <p className="truncate text-[11px] font-medium text-gray-500 dark:text-rdia-300">
              {t.hn_ia_subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {error &&
            typeof process !== "undefined" &&
            process.env?.NODE_ENV !== "production" && (
              <span className="hidden text-[10px] text-gray-400 sm:inline">
                · {error}
              </span>
            )}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11.5px] font-semibold text-gray-800 shadow-sm transition-colors hover:border-or-500 hover:text-or-500 disabled:opacity-60 dark:border-rdia-500 dark:bg-rdia-600 dark:text-rdia-100 dark:hover:border-or-500 dark:hover:text-or-400"
          >
            <Icon
              path={UI_ICONS.refresh}
              size={13}
              className={busy ? "animate-spin" : ""}
            />
            {busy ? t.hn_ia_loading : t.hn_ia_regenerate}
          </button>
        </div>
      </header>

      {/* ---------------- KPIs ---------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={NAV_ICONS.hospitals}
          label={t.hn_kpi_capacity}
          primary={tpl(m.hospinet.beds_n, { n: fmtInt(facts.lits) })}
          secondary={tpl(m.hospinet.facilities_camps, { h: fmtInt(facts.totalHospitals), c: fmtInt(facts.totalFieldHospitals) })}
          tint="blue"
        />
        <KpiCard
          icon={UI_ICONS.beds}
          label={t.hn_kpi_free}
          primary={fmtInt(facts.free)}
          secondary={tpl(m.hospinet.free_icu_line, { p: fmtPct(freePct), n: fmtInt(facts.reaFree) })}
          tint={kpiFreeTint}
        />
        <KpiCard
          icon={UI_ICONS.alert}
          label={t.hn_kpi_saturated}
          primary={`${facts.saturated} / ${facts.totalHospitals}`}
          secondary={tpl(L.kpi_tendus_conf_tpl, { tense: facts.tense, relaxed: facts.relaxed })}
          tint={kpiSatTint}
        />
        <KpiCard
          icon={UI_ICONS.ambulance}
          label={t.hn_kpi_fleet}
          primary={`${fmtInt(facts.amb)} amb · ${fmtInt(facts.heli)} hel`}
          secondary={tpl(m.hospinet.medical_people, { n: fmtInt(facts.staff) })}
          tint="neutral"
        />
      </div>

      {/* ---------------- GRAPHES ---------------- */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-3">
        {/* OCCUPATION */}
        <div className={`${cardCls} ${cardRelativeWrap}`}>
          <ExpandBtn
            expanded={expanded === "occ"}
            onClick={() => setExpanded(expanded === "occ" ? null : "occ")}
            title={expanded === "occ" ? m.hospinet.close_fullscreen : m.hospinet.expand}
          />
          <div className="mb-2.5 pr-10">
            <div className={sectionTitleCls}>{t.hn_chart_occ}</div>
            <div className={sectionSubtitleCls}>{m.hospinet.all_facilities}</div>
          </div>
          <OccupancyRing
            pct={facts.pct}
            freePct={100 - facts.pct}
            totalLits={facts.lits}
            freeLits={facts.free}
          />
        </div>

        {/* SERVICES */}
        <div className={`${cardCls} ${cardRelativeWrap}`}>
          <ExpandBtn
            expanded={expanded === "svc"}
            onClick={() => setExpanded(expanded === "svc" ? null : "svc")}
            title={expanded === "svc" ? m.hospinet.close_fullscreen : m.hospinet.expand}
          />
          <div className="mb-2 pr-10">
            <div>
              <div className={sectionTitleCls}>{t.hn_chart_services}</div>
              <div className={sectionSubtitleCls}>{m.hospinet.occ_by_ward}</div>
            </div>
          </div>
          <ServicesBars services={facts.services} />
        </div>

        {/* RÉSEAUX */}
        <div className={`${cardCls} ${cardRelativeWrap}`}>
          <ExpandBtn
            expanded={expanded === "net"}
            onClick={() => setExpanded(expanded === "net" ? null : "net")}
            title={expanded === "net" ? m.hospinet.close_fullscreen : m.hospinet.expand}
          />
          <div className="mb-2 pr-10">
            <div className={sectionTitleCls}>{t.hn_chart_networks}</div>
            <div className={sectionSubtitleCls}>{m.hospinet.mil_civ_cat}</div>
          </div>
          <NetworksBars networks={facts.networks} kinds={facts.kinds} />
        </div>
      </div>

      {/* ---------------- SYNTHÈSE TEXTE ---------------- */}
      <div className={cardCls}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Icon
            path={UI_ICONS.scale}
            size={13}
            className="text-emerald-600 dark:text-emerald-400"
          />
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-400">
            {isFallback ? m.hospinet.summary_det : m.hospinet.summary_ai}
          </div>
          {busy && (
            <span className="text-[10px] font-semibold text-gray-400">
              {m.hospinet.updating}
            </span>
          )}
        </div>
        <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-gray-700 dark:text-rdia-100">
          {text}
        </p>
      </div>

      {/* =====================================================================
          MODALE CENTRÉE (style Tableau de bord · max-w-5xl · rounded-3xl)
         ===================================================================== */}

      {expanded && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-rdia-900/55 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-3xl bg-white shadow-[0_24px_64px_-16px_rgba(0,0,0,0.22)] ring-1 ring-gray-200 dark:bg-rdia-700 dark:ring-rdia-500">
            <ExpandBtn
              expanded
              onClick={() => setExpanded(null)}
              title={m.hospinet.close_esc}
            />
            <div className="h-[88vh] overflow-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="mx-auto w-full max-w-4xl flex flex-col gap-3">
            {/* --- Occupation expand --- */}
            {expanded === "occ" && (
              <>
                <header>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-rdia-300">
                    {t.hn_chart_occ}
                  </div>
                  <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight text-gray-900 dark:text-white">
                    {m.hospinet.occ_global_title}
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    {tpl(m.hospinet.permanent_field_line, { h: fmtInt(facts.totalHospitals), f: fmtInt(facts.totalFieldHospitals) })}
                  </p>
                </header>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2 dark:border-rdia-500 dark:bg-rdia-800">
                    <OccupancyRing
                      pct={facts.pct}
                      freePct={100 - facts.pct}
                      totalLits={facts.lits}
                      freeLits={facts.free}
                      size={180}
                      stroke={18}
                      big
                    />
                  </div>
                  <div className="flex flex-col gap-2.5 lg:col-span-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: L.kpi_confortables, val: facts.relaxed, max: facts.totalHospitals, tint: "bg-green-500" },
                        { label: L.kpi_en_tension, val: facts.tense, max: facts.totalHospitals, tint: "bg-or-500" },
                        { label: m.hospinet.saturated_pl, val: facts.saturated, max: facts.totalHospitals, tint: "bg-danger-500" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                          <div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300">{s.label}</div>
                          <div className="mt-0.5 text-[20px] font-extrabold tabular-nums text-gray-900 dark:text-white">
                            {fmtInt(s.val)}
                            <span className="ml-0.5 text-[11px] font-semibold text-gray-400 dark:text-rdia-300"> / {fmtInt(s.max)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-rdia-600">
                            <div className={`h-full rounded-full ${s.tint}`} style={{ width: `${s.max > 0 ? Math.min(100, (s.val / s.max) * 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300">
                        {m.hospinet.occ_global_split}
                      </div>
                      <div className="space-y-1 text-[12px]">
                        <Row label={L.row_lits_tot} val={fmtInt(facts.lits)} tint="text-gray-900 dark:text-white" />
                        <Row label={tpl(m.hospinet.beds_occupied_pct, { p: fmtPct(facts.pct) })} val={fmtInt(facts.occ)} tint="text-or-600 dark:text-or-400" />
                        <Row label={tpl(L.row_lits_libres_tpl, { pct: fmtPct(100 - facts.pct) })} val={fmtInt(facts.free)} tint="text-green-700 dark:text-green-400" />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={L.row_rea_tot} val={fmtInt(facts.rea)} tint="text-gray-900 dark:text-white" />
                        <Row label={tpl(m.hospinet.icu_occupied_pct, { p: fmtPct(facts.reaPct) })} val={fmtInt(facts.reaOcc)} tint="text-or-600 dark:text-or-400" />
                        <Row label={L.row_rea_libres} val={fmtInt(facts.reaFree)} tint="text-green-700 dark:text-green-400" />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={m.hospinet.field_hospitals} val={tpl(m.hospinet.field_stats, { n: fmtInt(facts.fieldHosps.count), f: fmtInt(facts.fieldHosps.free) })} tint="text-blue-700 dark:text-blue-300" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  {L.donnees_aggregees_iris} ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">{m.hospinet.close}</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">{m.hospinet.esc}</kbd>
                </div>
              </>
            )}

            {/* --- Services expand --- */}
            {expanded === "svc" && (
              <>
                <header>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-rdia-300">
                    {t.hn_chart_services}
                  </div>
                  <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight text-gray-900 dark:text-white">
                    {m.hospinet.occ_detail_title}
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    {m.hospinet.occ_detail_sub}
                  </p>
                </header>

                <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                  <ServicesBars services={facts.services} big />
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm text-[12px] dark:border-rdia-500 dark:bg-rdia-800">
                  <table className="w-full text-left text-gray-800 dark:text-rdia-100">
                    <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wider text-gray-500 dark:bg-rdia-700 dark:text-rdia-300">
                      <tr>
                        <th className="px-3.5 py-2 font-bold">{m.hospinet.col_service}</th>
                        <th className="px-3 py-2 text-right font-bold">{m.hospinet.col_tot}</th>
                        <th className="px-3 py-2 text-right font-bold">{m.hospinet.col_occ}</th>
                        <th className="px-3 py-2 text-right font-bold">{m.hospinet.col_free}</th>
                        <th className="px-3 py-2 text-right font-bold">{m.hospinet.col_occupation}</th>
                        <th className="px-3.5 py-2 text-right font-bold">{m.hospinet.col_state}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-rdia-600">
                      {facts.services.map((s) => (
                        <tr key={s.name} className="hover:bg-gray-50/60 dark:hover:bg-rdia-700/60">
                          <td className="px-3.5 py-2 font-bold">{s.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-700 dark:text-rdia-200">{fmtInt(s.total)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-or-600 dark:text-or-400">{fmtInt(s.occ)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-bold text-green-700 dark:text-green-400">{fmtInt(s.free)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200 dark:bg-rdia-600">
                                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: occTint(s.pct) }} />
                              </div>
                              <span className="tabular-nums font-extrabold text-gray-900 dark:text-white">{fmtPct(s.pct)}</span>
                            </div>
                          </td>
                          <td className="px-3.5 py-2 text-right">
                            <span className={
                              s.pct >= 92 ? "rounded-md bg-danger-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger-700 dark:text-danger-300"
                              : s.pct >= 75 ? "rounded-md bg-or-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-or-700 dark:text-or-300"
                              : "rounded-md bg-green-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:text-green-300"
                            }>{m.hospinet[occLabelKey(s.pct)]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  {L.donnees_aggregees_iris} ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">{m.hospinet.close}</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">{m.hospinet.esc}</kbd>
                </div>
              </>
            )}

            {/* --- Réseaux expand --- */}
            {expanded === "net" && (
              <>
                <header>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-rdia-300">
                    {t.hn_chart_networks}
                  </div>
                  <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight text-gray-900 dark:text-white">
                    {m.hospinet.networks_title}
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    {m.hospinet.networks_sub}
                  </p>
                </header>

                <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                  <NetworksBars networks={facts.networks} kinds={facts.kinds} big />
                </div>

                {/* 2 cartes détail réseau */}
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {facts.networks.map((n) => (
                    <div key={n.reseau} className="rounded-2xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg font-extrabold text-white shadow" style={{ background: n.reseau === "militaire" ? "#C9A84C" : "#3B82F6" }}>
                            {n.reseau === "militaire" ? "M" : "C"}
                          </div>
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300">{m.hospinet.col_network}</div>
                            <div className="text-[16px] font-extrabold text-gray-900 dark:text-white">{n.reseau === "militaire" ? m.hospinet.network_mil : m.hospinet.network_civ}</div>
                          </div>
                        </div>
                        <span className={occChip(n.pct)}>{m.hospinet[occLabelKey(n.pct)]}</span>
                      </div>
                      <div className="mt-2.5 space-y-1 text-[12px]">
                        <Row label={m.hospinet.facilities} val={fmtInt(n.hospitals)} tint="text-gray-900 dark:text-white" />
                        <Row label={m.hospinet.beds_total} val={fmtInt(n.lits)} tint="text-gray-900 dark:text-white" />
                        <Row label={m.hospinet.beds_occupied} val={fmtInt(n.occ)} tint="text-or-600 dark:text-or-400" />
                        <Row label={m.hospinet.occ_rate} val={fmtPct(n.pct)} tint={n.pct >= 92 ? "text-danger-700 dark:text-danger-300" : n.pct >= 75 ? "text-or-600 dark:text-or-400" : "text-green-700 dark:text-green-400"} />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={m.hospinet.icu_free} val={`${fmtInt(n.reaFree)} / ${fmtInt(n.rea)}`} tint="text-green-700 dark:text-green-400" />
                        <Row label={m.hospinet.icu_occ} val={fmtPct(n.reaPct)} tint={n.reaPct >= 92 ? "text-danger-700 dark:text-danger-300" : n.reaPct >= 75 ? "text-or-600 dark:text-or-400" : "text-green-700 dark:text-green-400"} />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={m.hospinet.ambulances} val={fmtInt(n.amb)} tint="text-blue-700 dark:text-blue-400" />
                        <Row label={m.hospinet.helicopters} val={fmtInt(n.heli)} tint="text-blue-700 dark:text-blue-400" />
                        <Row label={m.hospinet.medical_staff} val={tpl(L.staff_pers_tpl, { n: fmtInt(n.staff) })} tint="text-gray-900 dark:text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Catégories établissements */}
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                  <div className="border-b border-gray-200 px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:border-rdia-600 dark:text-rdia-300">
                    {m.hospinet.permanent_cats}
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-rdia-600">
                    {facts.kinds.slice(0, 4).map((k) => (
                      <div key={k.kind ?? k.label} className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-white dark:hover:bg-rdia-700/50">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="h-3.5 w-3.5 shrink-0 rounded-md shadow-inner" style={{ background: k.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-bold text-gray-900 dark:text-white">{k.label}</div>
                            <div className="text-[10.5px] text-gray-500 dark:text-rdia-300">{tpl(m.hospinet.beds_occ_line, { n: fmtInt(k.lits), p: fmtPct(k.pct) })}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[15px] font-extrabold tabular-nums text-gray-900 dark:text-white">{fmtInt(k.count)}</div>
                          <div className="text-[10px] text-gray-500 dark:text-rdia-300">{m.hospinet.facilities_abbr}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  {L.donnees_aggregees_iris} ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">{m.hospinet.close}</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">{m.hospinet.esc}</kbd>
                </div>
              </>
            )}

              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
