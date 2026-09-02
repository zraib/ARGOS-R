"use client";

import { useMemo, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { AI_ENABLED } from "@/lib/ai/config";
import type { Incident } from "@/lib/types";
import { typeLabel } from "@/lib/helpers";
import {
  buildBaseline,
  simulateWhatIf,
} from "@/lib/ai/whatif/incidentWhatif";
import type { WhatIfContext } from "@/lib/ai/whatif/types";
import {
  DEFAULT_DELTAS,
  type WhatIfDeltas,
  type WhatIfImpact,
  type WhatIfPreset,
  type WhatIfSubMetric,
} from "@/lib/ai/whatif/types";
import { WHAT_IF_PRESETS } from "@/lib/ai/whatif/presets";
import {
  cn,
  sevLabel,
  haversineKm,
  parseISO,
  SLIDERS,
} from "@/components/whatif/parts/shared";
import { BaselineStat } from "@/components/whatif/parts/BaselineStat";
import { SliderRow } from "@/components/whatif/parts/SliderRow";
import { DeltaKpi } from "@/components/whatif/parts/DeltaKpi";
import { MetricBar } from "@/components/whatif/parts/MetricBar";
import { HorizonRow } from "@/components/whatif/parts/HorizonRow";
import { DeltaBadge } from "@/components/whatif/parts/DeltaBadge";
import { PickerModal } from "@/components/whatif/parts/PickerModal";

// ============================================================================
// Composant PRINCIPAL
// ============================================================================
export function WhatIfPageShell() {
  const m = useModules();
  const incidents = useArgos((s) => s.incidents);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);
  const quakes = useArgos((s) => s.quakes);
  const lang = useArgos((s) => s.lang);

  const [selectedId, setSelectedId] = useState<string>(() => {
    const first = incidents.find((i) => !i.archived);
    return first?.id ?? "";
  });
  const [deltas, setDeltas] = useState<WhatIfDeltas>(DEFAULT_DELTAS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [qPicker, setQPicker] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const incident: Incident | undefined = useMemo(
    () => incidents.find((i) => i.id === selectedId),
    [incidents, selectedId],
  );

  // Contexte du moteur (WhatIfContext) depuis l'incident sélectionné + store
  const ctx: WhatIfContext | null = useMemo(() => {
    if (!incident) return null;

    // =============== BILAN HUMAIN (FIDÈLE : parent + TOUS sous-incidents SOMMÉS) ===============
    // Les victimes sont souvent saisies SUR les sous-incidents (ex: Saturation hospitalière)
    // et PAS sur l'incident parent. ON SOMME TOUT pour correspondre à l'UI incidents.
    let dead = incident.casualties?.dead ?? 0;
    let inj = incident.casualties?.injured ?? 0;
    let mis = incident.casualties?.missing ?? 0;
    for (const s of incident.subIncidents || []) {
      dead += s.casualties?.dead ?? 0;
      inj += s.casualties?.injured ?? 0;
      mis += s.casualties?.missing ?? 0;
    }
    const casualties = dead * 10 + inj * 3 + mis * 2;

    // Affectés = (décès+blessés+disparus)*4 + sous-incidents*15 (fidèle moteur)
    const affected = (inj + mis + dead) * 4 + (incident.subIncidents?.length ?? 0) * 15;

    let windKmh = 12;
    let rain24Mm = 4;
    // Prédictions météo éventuelles depuis RiskPredictions si dispo
    try {
      const w = (incident as any)._weather;
      if (typeof w?.current?.wind === "number") windKmh = w.current.wind;
      if (typeof w?.daily?.[0]?.precipSum === "number") rain24Mm = w.daily[0].precipSum;
    } catch {
      /* noop */
    }

    // Séismes proche 72h — mag effective (max selon haversine <200km)
    const now = Date.now();
    const t72h = now - 72 * 3600 * 1000;
    let bestMag = 0;
    for (const q of quakes || []) {
      if (q.evtype && q.evtype !== "earthquake") continue;
      const qt = parseISO(q.time);
      if (!Number.isFinite(qt) || qt < t72h) continue;
      const km = haversineKm(incident.ll, q.ll);
      if (km > 200) continue;
      const mag = typeof q.mag === "number" ? q.mag : 0;
      const distF = Math.max(0, 1 - km / 150);
      const eff = mag * (0.5 + 0.5 * distF);
      if (eff > bestMag) bestMag = eff;
    }

    // Hopitaux proche <60km — FIDÈLE À HOSPINET : formule 100% IDENTIQUE
    // (occ / lits) * 100 — on prend MAX des hôpitaux dans 60km (pas de pondération rea/distance).
    let hospitalSatPct = 0;
    let nearHop = 0;
    for (const h of hospitals || []) {
      const km = haversineKm(incident.ll, h.ll);
      if (km > 60) continue;
      nearHop++;
      const pct = h.lits > 0 ? Math.round(((h.occ ?? 0) / h.lits) * 100) : 0;
      if (pct > hospitalSatPct) hospitalSatPct = pct;
    }

    // unités deployees
    const selIds = incident.responders?.units ?? [];
    const sel = selIds
      .map((id) => (units || []).find((u) => u.id === id))
      .filter(Boolean);
    const deployedCount = sel.length;

    const start = parseISO(incident.time);
    const durationMin = Number.isFinite(start) ? Math.round((now - start) / 60000) : 120;

    // Régions limitrophes (basé sur région + 3 villes d'unités proches)
    const regionsSet = new Set<string>([incident.region || "Région immédiate"]);
    const sortedUnits = [...(units || [])]
      .map((u) => ({ u, km: haversineKm(incident.ll, u.ll) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 6);
    for (const it of sortedUnits) if (it.u.ville) regionsSet.add(it.u.ville);
    const sortedHop = [...(hospitals || [])]
      .map((h) => ({ h, km: haversineKm(incident.ll, h.ll) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 4);
    for (const it of sortedHop) if (it.h.ville) regionsSet.add(it.h.ville);
    const nearbyRegions = Array.from(regionsSet).slice(0, 4);

    return {
      incidentType: incident.type,
      region: incident.region,
      severity: incident.sev,
      durationMin,
      deployedUnits: deployedCount,
      nearbyHospitals: nearHop,
      hospitalSatPct,
      casualties,
      affected,
      windKmh,
      rain24Mm,
      seismicEffectiveMag: bestMag,
      nearbyRegions,
    };
  }, [incident, hospitals, units, quakes]);

  const baseline = useMemo(() => (ctx ? buildBaseline(ctx) : null), [ctx]);
  const impact: WhatIfImpact | null = useMemo(() => {
    if (!ctx || !baseline) return null;
    return simulateWhatIf(ctx, deltas);
  }, [ctx, baseline, deltas]);

  const reset = () => setDeltas(DEFAULT_DELTAS);
  const applyPreset = (p: WhatIfPreset) =>
    setDeltas({ ...DEFAULT_DELTAS, ...p.deltas });

  // Incidents list pour le picker
  const filtered = useMemo(() => {
    const q = qPicker.trim().toLowerCase();
    return (incidents || [])
      .filter((i) => !i.archived)
      .filter((i) => !typeFilter || i.type === typeFilter)
      .filter(
        (i) =>
          !q ||
          `${i.titre} ${i.region} ${i.id} ${typeLabel(i.type, incidentTypes, lang as any)}`.toLowerCase().includes(q),
      );
  }, [incidents, typeFilter, qPicker, incidentTypes, lang]);

  const presentTypes = useMemo(
    () => [...new Set((incidents || []).filter((i) => !i.archived).map((i) => i.type))],
    [incidents],
  );

  if (!AI_ENABLED) {
    return (
      <section className="animate-fade-in rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500 dark:border-rdia-600 dark:bg-rdia-700 dark:text-rdia-300">
        {m.whatif.disabled}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-or-500/[0.12] text-or-500">
            <Icon
              path={
                NAV_ICONS.seismic ||
                "M9 3h6 M10 3v6l-4.5 8.5A2 2 0 007.3 21h9.4a2 2 0 001.8-3.5L14 9V3 M8.5 15h7"
              }
              size={18}
              strokeWidth={1.8}
            />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-gray-900 dark:text-rdia-100">
              {m.whatif.title}
            </h1>
            <p className="text-[11px] text-gray-500 dark:text-rdia-300">
              {m.whatif.subtitle}
            </p>
          </div>
        </div>

        {/* LIGNE BOUTONS DROITE : picker incident + bouton WHAT IF */}
        <div className="flex items-center gap-2">
          {incident ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-800 shadow-sm transition-all hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-600 dark:text-rdia-100 dark:hover:border-or-500"
            >
              <Icon path={NAV_ICONS.incidents || UI_ICONS.alert} size={15} strokeWidth={1.8} />
              <span className="truncate max-w-[320px]">
                {incident.titre} · {incident.region}
              </span>
              <Badge
                type={incident.sev}
                label={sevLabel(incident.sev, lang)}
              />
              <Icon path={UI_ICONS.caretDown} size={12} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 transition-all hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-600 dark:text-rdia-100 dark:hover:border-or-500"
            >
              {m.whatif.choose_incident}
            </button>
          )}

          {/* ⭐️ BOUTON WHAT IF — HAUT À DROITE */}
          {incident && ctx && impact && (
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-or-500 to-or-600 px-4 py-2 text-[13px] font-bold text-rdia-600 shadow-[0_4px_12px_-2px_rgba(234,140,14,0.45)] transition-all duration-200 hover:from-or-500 hover:to-or-500 hover:shadow-[0_6px_16px_-2px_rgba(234,140,14,0.6)] hover:scale-[1.02] active:scale-[0.98]"
            >
              <Icon
                path={UI_ICONS.sliders}
                size={16}
                strokeWidth={2.1}
                className="transition-transform group-hover:rotate-[-6deg]"
              />
              <span className="tracking-wide">
                {m.whatif.whatif}
              </span>
              {impact.deltaScore !== 0 && (
                <span className="ml-1 inline-flex items-center rounded-full bg-rdia-600/20 px-2 py-0.5 text-[10.5px] font-bold">
                  {impact.deltaScore > 0 ? "+" : ""}
                  {impact.deltaScore}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {/* Layout principal — RÉSULTATS PLEINE LARGEUR (la config est dans un Drawer flottant) */}
      {incident && ctx && impact ? (
        <div className="relative">
          {/* ===== COLONNE UNIQUE : RÉSULTATS (12/12 pleine largeur) ===== */}
          <main className="col-span-12 space-y-4">
            {/* 4 KPIS EN HAUT : Δ score · H6 · H12 · H24 — TOUS DE MÊME TAILLE, TOUS CENTRÉS */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DeltaKpi
                label={m.whatif.risk_evolution}
                sub="positif = empiré · négatif = amélioré"
                delta={impact.deltaScore}
                suffix=" pts"
              />
              <DeltaKpi label={m.whatif.horizon_h6} sub={impact.simulated.h6.probabilityLabel} delta={impact.simulated.h6.deltaScore} />
              <DeltaKpi label={m.whatif.horizon_h12} sub={impact.simulated.h12.probabilityLabel} delta={impact.simulated.h12.deltaScore} />
              <DeltaKpi label={m.whatif.horizon_h24} sub={impact.simulated.h24.probabilityLabel} delta={impact.simulated.h24.deltaScore} />
            </div>

            {/* Interpretation FR 1 phrase */}
            <div
              className={cn(
                "rounded-xl border p-3 text-[12.5px] leading-relaxed",
                impact.impactClass === "fort_amelioration" &&
                  "border-green-500/25 bg-green-500/[0.07] text-green-700 dark:text-green-300",
                impact.impactClass === "amelioration" &&
                  "border-green-500/15 bg-green-500/[0.04] text-green-800 dark:text-green-300",
                impact.impactClass === "neutre" &&
                  "border-gray-200 bg-gray-50 text-gray-700 dark:border-rdia-600 dark:bg-rdia-800/40 dark:text-rdia-200",
                impact.impactClass === "degradation" &&
                  "border-danger-400/25 bg-danger-400/[0.06] text-danger-600 dark:text-danger-300",
                impact.impactClass === "forte_degradation" &&
                  "border-danger-400/45 bg-danger-400/[0.1] text-danger-700 dark:text-danger-300",
              )}
            >
              <div className="flex items-start gap-2">
                <Icon
                  path={
                    impact.deltaScore <= 0
                      ? UI_ICONS.shield
                      : UI_ICONS["alert-triangle"] || UI_ICONS.alert
                  }
                  size={17}
                  strokeWidth={1.9}
                  className="mt-0.5 shrink-0"
                />
                <span className="font-medium leading-snug">{impact.interpret}</span>
              </div>
            </div>

            {/* 2 colonnes : barres sous-métriques + horizons */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 lg:col-span-7 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                  {m.whatif.submetrics}
                </h2>
                <div className="space-y-2.5">
                  {impact.simulated.subMetrics.map((m: WhatIfSubMetric) => {
                    // Injection DÉTAIL BRUT par sous-métrique (plus de "5 figé" mystérieux)
                    let detail: string | undefined;
                    if (m.key === "casualties" && incident) {
                      // FIDÈLE : TOTAL parent + sous-incidents (comme le calcul global ctx.casualties)
                      let d = incident.casualties?.dead ?? 0;
                      let b = incident.casualties?.injured ?? 0;
                      let di = incident.casualties?.missing ?? 0;
                      for (const s of incident.subIncidents || []) {
                        d += s.casualties?.dead ?? 0;
                        b += s.casualties?.injured ?? 0;
                        di += s.casualties?.missing ?? 0;
                      }
                      const aff =
                        (incident as any).affectedPeople ??
                        (incident as any).affected ??
                        0;
                      detail = `Décès ${d} · Blessés ${b} · Disparus ${di}` + (aff ? ` · Affectés ${aff}` : "");
                    } else if (m.key === "severity" && incident) {
                      const sevTxt = sevLabel(incident.sev, lang);
                      const typTxt = typeLabel(incident.type, incidentTypes, lang as any);
                      detail = `${typTxt} · Sévérité ${sevTxt}`;
                    } else if (m.key === "deployedCap" && ctx) {
                      detail = `${ctx.deployedUnits} unité(s) déployée(s) · Besoin ${
                        incident?.sev === "high" ? "8" : incident?.sev === "medium" ? "4" : "2"
                      } (sev)`;
                    } else if (m.key === "hospitalSat" && ctx) {
                      detail = `Sat. ${Math.round(ctx.hospitalSatPct)}% · ${ctx.nearbyHospitals} hôpital(s) <60km`;
                    } else if (m.key === "weatherImpact" && ctx) {
                      detail = `Vent ${Math.round(ctx.windKmh)}km/h · Pluie 24h ${Math.round(ctx.rain24Mm)}mm`;
                    } else if (m.key === "seismicImpact" && ctx) {
                      detail =
                        ctx.seismicEffectiveMag > 0
                          ? `Magnitude effective M${ctx.seismicEffectiveMag.toFixed(1)} (EMS/72h <200km)`
                          : `Aucun séisme significatif`;
                    } else if (m.key === "duration" && ctx) {
                      const m2 = ctx.durationMin;
                      const dur =
                        m2 < 60
                          ? `${m2} min`
                          : `${Math.floor(m2 / 60)}h${String(m2 % 60).padStart(2, "0")}`;
                      // Plages indicatives (durationScore 0..100 aligné)
                      let qual: string;
                      if (m2 < 60) qual = "récent (score risque faible)";
                      else if (m2 < 180) qual = "en cours de déploiement";
                      else if (m2 < 480) qual = "prolongé (risque moyen)";
                      else qual = "prolongé critique";
                      detail = `${dur} écoulées · ${qual}`;
                    }
                    return (
                      <MetricBar key={m.key} metric={m} detail={detail} />
                    );
                  })}
                </div>
              </div>
              <div className="col-span-12 lg:col-span-5 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                  {m.whatif.horizons}
                </h2>
                <div className="space-y-3">
                  <HorizonRow label={m.whatif.h6_long} base={impact.baseline.h6.score} sim={impact.simulated.h6.score} delta={impact.simulated.h6.deltaScore} probLabel={impact.simulated.h6.probabilityLabel} />
                  <HorizonRow label={m.whatif.h12_long} base={impact.baseline.h12.score} sim={impact.simulated.h12.score} delta={impact.simulated.h12.deltaScore} probLabel={impact.simulated.h12.probabilityLabel} />
                  <HorizonRow label={m.whatif.h24_long} base={impact.baseline.h24.score} sim={impact.simulated.h24.score} delta={impact.simulated.h24.deltaScore} probLabel={impact.simulated.h24.probabilityLabel} />
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-rdia-600">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    {m.whatif.impact_zones}
                  </h3>
                  <div className="space-y-1.5">
                    {impact.simulated.regions.map((r) => (
                      <div key={r.region} className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">
                          {r.region}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="h-1.5 w-[90px] overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                r.delta <= 0 ? "bg-green-500" : "bg-danger-400",
                              )}
                              style={{ width: `${Math.max(6, Math.min(100, r.score))}%` }}
                            />
                          </div>
                          <DeltaBadge delta={r.delta} small />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Top 3 actions recommandées */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                <Icon path={UI_ICONS.sparkles} size={12} strokeWidth={2} />
                {m.whatif.recommended_actions}
              </h2>
              <ul className="space-y-1.5">
                {impact.topActions.map((a, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-gray-100 p-2 text-[12px] leading-snug dark:border-rdia-600"
                  >
                    <div
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                        a.priority === 1 && "bg-danger-400/15 text-danger-600 dark:text-danger-300",
                        a.priority === 2 && "bg-or-500/15 text-or-600 dark:text-or-400",
                        a.priority === 3 && "bg-rdia-400/15 text-rdia-600 dark:text-rdia-200",
                      )}
                    >
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 dark:text-rdia-100">
                        {a.label}
                      </div>
                      <div className="text-[10.5px] text-gray-400 dark:text-rdia-400">
                        Impact estimé : {a.estimatedImpact > 0 ? "+" : ""}
                        {a.estimatedImpact} pts sur score risque
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </main>

          {/* ===== OVERLAY + MODAL CENTRÉE WHAT IF ===== */}
          {drawerOpen && (
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={m.whatif.config_title}
            >
              {/* Overlay flouté blur (clique pour fermer) */}
              <button
                type="button"
                aria-label={m.whatif.close_config}
                onClick={() => setDrawerOpen(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-[6px] animate-fade-in"
              />

              {/* MODAL CENTRÉE — max 720px large, max 85vh hauteur scroll interne */}
              <aside className="relative z-10 flex h-full w-full max-w-[720px] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35)] animate-in zoom-in-95 duration-200 dark:border-rdia-500 dark:bg-rdia-800">
                {/* HEADER Modal */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-rdia-600">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-or-500/[0.12] text-or-500">
                      <Icon path={UI_ICONS.sliders} size={17} strokeWidth={2} />
                    </div>
                    <div>
                      <div className="text-[14px] font-bold text-gray-900 dark:text-rdia-100">
                        {m.whatif.config_title}
                      </div>
                      <div className="text-[10.5px] text-gray-500 dark:text-rdia-300">
                        {m.whatif.config_subtitle}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-rdia-700 dark:hover:text-rdia-100"
                    aria-label={m.whatif.close}
                  >
                    <Icon path={UI_ICONS.close} size={17} strokeWidth={2.1} />
                  </button>
                </div>

                {/* CONTENU Modal — scroll interne : baseline + presets + sliders COMPACTÉS */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                  {/* 2 colonnes en haut : Baseline (gauche) · Presets (droite) → compact */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
                    {/* Baseline (2/5) */}
                    <div className="md:col-span-2 rounded-xl border border-gray-200 p-2.5 dark:border-rdia-600 dark:bg-rdia-700">
                      <div className="mb-1.5 flex items-center justify-between">
                        <h2 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-rdia-400">
                          {m.whatif.baseline}
                        </h2>
                        <button
                          type="button"
                          onClick={reset}
                          className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 transition-colors hover:border-danger-500 hover:text-danger-500 dark:border-rdia-500 dark:text-rdia-300"
                        >
                          <Icon path={UI_ICONS.refresh} size={10} strokeWidth={2} />
                          {m.whatif.reset}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10.5px] leading-tight">
                        <BaselineStat label={m.whatif.m_risk} value={`${Math.round(baseline?.score ?? 0)}`} />
                        <BaselineStat
                          label={m.whatif.m_duration}
                          value={
                            ctx.durationMin < 60
                              ? `${ctx.durationMin}m`
                              : `${Math.floor(ctx.durationMin / 60)}h${String(ctx.durationMin % 60).padStart(2, "0")}`
                          }
                        />
                        <BaselineStat label={m.whatif.m_units} value={`${ctx.deployedUnits}`} />
                        <BaselineStat label={m.whatif.m_hosp60} value={`${ctx.nearbyHospitals}`} />
                        <BaselineStat
                          label={m.whatif.m_hosp_sat}
                          value={`${Math.round(ctx.hospitalSatPct)}%`}
                        />
                        <BaselineStat label={m.whatif.m_wind} value={`${Math.round(ctx.windKmh)}km/h`} />
                        <BaselineStat
                          label={m.whatif.m_rain24}
                          value={`${Math.round(ctx.rain24Mm)}mm`}
                        />
                        <BaselineStat
                          label={m.whatif.m_quake}
                          value={
                            ctx.seismicEffectiveMag > 0
                              ? `M${ctx.seismicEffectiveMag.toFixed(1)}`
                              : "—"
                          }
                        />
                        {/* 2 stats BRUTES VICTIMES + AFFECTÉS pour ne plus avoir "5 figé mystérieux" */}
                        <BaselineStat
                          label={m.whatif.m_victims}
                          value={(() => {
                            // FIDÈLE : TOTAL parent + sous-incidents (identique sous-métriques)
                            let d = incident?.casualties?.dead ?? 0;
                            let b = incident?.casualties?.injured ?? 0;
                            let di = incident?.casualties?.missing ?? 0;
                            for (const s of incident?.subIncidents || []) {
                              d += s.casualties?.dead ?? 0;
                              b += s.casualties?.injured ?? 0;
                              di += s.casualties?.missing ?? 0;
                            }
                            const tot = d + b + di;
                            return tot === 0
                              ? "Aucune"
                              : `D${d} · B${b} · Di${di}`;
                          })()}
                        />
                        <BaselineStat
                          label={m.whatif.m_affected}
                          value={`${
                            (incident as any)?.affectedPeople ??
                            (incident as any)?.affected ??
                            "0"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Scénarios prédéfinis (3/5) */}
                    <div className="md:col-span-3 rounded-xl border border-gray-200 p-2.5 dark:border-rdia-600 dark:bg-rdia-700">
                      <h2 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-rdia-400">
                        {m.whatif.presets}
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {WHAT_IF_PRESETS.map((p) => {
                          const active = Object.entries(p.deltas).every(
                            ([k, v]) => (deltas as any)[k] === v,
                          );
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => applyPreset(p)}
                              className={cn(
                                "group flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-start transition-all",
                                active
                                  ? "border-or-500 bg-or-500/[0.08] text-or-600 dark:text-or-400"
                                  : "border-gray-200 hover:border-or-500/[0.6] hover:bg-or-500/[0.04] text-gray-700 dark:border-rdia-500 dark:text-rdia-200",
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-[11.5px] font-bold leading-tight">
                                  {p.name}
                                </div>
                                <div className="truncate text-[10px] text-gray-500 dark:text-rdia-400 group-hover:text-gray-600 dark:group-hover:text-rdia-300 leading-tight">
                                  {p.description}
                                </div>
                              </div>
                              {active && (
                                <Icon
                                  path={UI_ICONS.check}
                                  size={12}
                                  strokeWidth={2.6}
                                  className="mt-0 shrink-0"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 8 SLIDERS What-If — COMPACTÉS (2 colonnes md+) */}
                  <div className="rounded-xl border border-gray-200 p-3 dark:border-rdia-600 dark:bg-rdia-700">
                    <h2 className="mb-2 flex items-center justify-between text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-rdia-400">
                      {m.whatif.levers}
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-rdia-600 dark:text-rdia-400"
                      >
                        {m.whatif.reset}
                      </button>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2.5">
                      {SLIDERS.map((s) => (
                        <SliderRow
                          key={s.key}
                          cfg={s}
                          value={deltas[s.key]}
                          onChange={(v) => setDeltas((d) => ({ ...d, [s.key]: v }))}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* FOOTER Modal */}
                <div className="shrink-0 border-t border-gray-100 bg-gray-50/70 px-5 py-3 dark:border-rdia-600 dark:bg-rdia-700/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-[11px] leading-tight text-gray-500 dark:text-rdia-300">
                      <span className="font-semibold text-gray-700 dark:text-rdia-100">
                        Δ en cours :{" "}
                      </span>
                      <span
                        className={cn(
                          "font-bold",
                          impact.deltaScore > 0 && "text-danger-600 dark:text-danger-300",
                          impact.deltaScore < 0 && "text-green-600 dark:text-green-400",
                          impact.deltaScore === 0 && "text-gray-600 dark:text-rdia-300",
                        )}
                      >
                        {impact.deltaScore === 0
                          ? "±0"
                          : `${impact.deltaScore > 0 ? "+" : ""}${impact.deltaScore} pts`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(false)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-or-500 px-4 py-2 text-[12.5px] font-bold text-rdia-600 transition-all hover:bg-or-500/90 shadow-[0_4px_10px_-2px_rgba(234,140,14,0.4)]"
                    >
                      <Icon path={UI_ICONS.eye} size={14} strokeWidth={2} />
                      {m.whatif.apply_view}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-rdia-600 dark:bg-rdia-700 dark:text-rdia-300">
          {m.whatif.select_hint}
        </div>
      )}

      {/* Modale : picker incident */}
      {pickerOpen && (
        <PickerModal
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            setSelectedId(id);
            setDeltas(DEFAULT_DELTAS);
            setPickerOpen(false);
          }}
          incidents={filtered}
          incidentTypes={incidentTypes}
          presentTypes={presentTypes}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          q={qPicker}
          setQ={setQPicker}
          lang={lang}
          selectedId={selectedId}
        />
      )}
    </section>
  );
}
