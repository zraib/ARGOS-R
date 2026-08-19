"use client";

import { useMemo, useState } from "react";
import { useArgos } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { FLUX_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { AI_ENABLED } from "@/lib/ai/config";
import type { Incident } from "@/lib/types";
import { typeLabel } from "@/lib/helpers";
import {
  buildBaseline,
  simulateWhatIf,
  sanitizeDeltas,
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

function cn(...parts: unknown[]): string {
  return parts.filter(Boolean).join(" ");
}

const LABEL_SEV: Record<"high" | "medium" | "low", { fr: string; en: string; ar: string }> = {
  high: { fr: "Critique", en: "Critical", ar: "حرجة" },
  medium: { fr: "Modérée", en: "Moderate", ar: "متوسطة" },
  low: { fr: "Faible", en: "Low", ar: "ضعيفة" },
};

function sevLabel(sev: "high" | "medium" | "low", lang: "fr" | "en" | "ar"): string {
  const item = LABEL_SEV[sev];
  if (lang === "ar") return item.ar;
  if (lang === "en") return item.en;
  return item.fr;
}

const haversineKm = (a: [number, number], b: [number, number]): number => {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const hh =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(hh)));
};

const parseISO = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
};

interface SliderCfg {
  key: keyof WhatIfDeltas;
  icon: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  /** si true, la valeur "max" = empiré, sinon max = améliore */
  higherIsWorse?: boolean;
  fmt?: (v: number) => string;
}

const SLIDERS: SliderCfg[] = [
  {
    key: "aggravationPct",
    icon: UI_ICONS.alert,
    label: "Sévérité : atténuation (à droite) / aggravation (à gauche)",
    min: -50,
    max: 50,
    step: 5,
    unit: " pts",
    higherIsWorse: false,
    fmt: (v) => (v > 0 ? `+${v}` : `${v}`),
  },
  {
    key: "addUnits",
    icon: UI_ICONS.truck,
    label: "Unités mobiles supplémentaires",
    min: 0,
    max: 10,
    step: 1,
    unit: " unité(s)",
    higherIsWorse: false,
    fmt: (v) => `+${v}`,
  },
  {
    key: "addHospitalBeds",
    icon: UI_ICONS.beds,
    label: "Lits hôpital supplémentaires",
    min: 0,
    max: 200,
    step: 10,
    unit: " lits",
    higherIsWorse: false,
    fmt: (v) => `+${v}`,
  },
  {
    key: "windMult",
    icon: FLUX_ICONS.wind,
    label: "Multiplicateur de vent",
    min: 0.5,
    max: 2,
    step: 0.05,
    unit: " ×",
    higherIsWorse: true,
    fmt: (v) => v.toFixed(2),
  },
  {
    key: "rainAddMm",
    icon: FLUX_ICONS.rain,
    label: "Pluie additionnelle (24h)",
    min: 0,
    max: 200,
    step: 10,
    unit: " mm",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
  {
    key: "seismicAddMag",
    icon: NAV_ICONS.seismic || UI_ICONS.alert,
    label: "Magnitude sismique additionnelle",
    min: 0,
    max: 1,
    step: 0.1,
    unit: " Mw",
    higherIsWorse: true,
    fmt: (v) => (v > 0 ? `+${v.toFixed(1)}` : "0"),
  },
  {
    key: "addCasualties",
    icon: UI_ICONS.alert || UI_ICONS.alert,
    label: "Victimes additionnelles (blessés + disparus)",
    min: 0,
    max: 200,
    step: 10,
    unit: " pers.",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
  {
    key: "addAffected",
    icon: UI_ICONS.users,
    label: "Personnes affectées / évacuées en plus",
    min: 0,
    max: 1000,
    step: 50,
    unit: " pers.",
    higherIsWorse: true,
    fmt: (v) => `+${v}`,
  },
];

// ============================================================================
// Composant PRINCIPAL
// ============================================================================
export function WhatIfPageShell() {
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
        Module Simulation What-If désactivé — contacter l'administrateur.
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
              Simulation What-If · IA
            </h1>
            <p className="text-[11px] text-gray-500 dark:text-rdia-300">
              Scénarios de crise · Impact sur situation globale
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
              Choisir un incident
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
                What If
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
                label="Évolution du risque"
                sub="positif = empiré · négatif = amélioré"
                delta={impact.deltaScore}
                suffix=" pts"
              />
              <DeltaKpi label="Horizon H6" sub={impact.simulated.h6.probabilityLabel} delta={impact.simulated.h6.deltaScore} />
              <DeltaKpi label="Horizon H12" sub={impact.simulated.h12.probabilityLabel} delta={impact.simulated.h12.deltaScore} />
              <DeltaKpi label="Horizon H24" sub={impact.simulated.h24.probabilityLabel} delta={impact.simulated.h24.deltaScore} />
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
                  Sous-métriques
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
                  Horizons temporels
                </h2>
                <div className="space-y-3">
                  <HorizonRow label="H6 · 6 heures" base={impact.baseline.h6.score} sim={impact.simulated.h6.score} delta={impact.simulated.h6.deltaScore} probLabel={impact.simulated.h6.probabilityLabel} />
                  <HorizonRow label="H12 · 12 heures" base={impact.baseline.h12.score} sim={impact.simulated.h12.score} delta={impact.simulated.h12.deltaScore} probLabel={impact.simulated.h12.probabilityLabel} />
                  <HorizonRow label="H24 · 24 heures" base={impact.baseline.h24.score} sim={impact.simulated.h24.score} delta={impact.simulated.h24.deltaScore} probLabel={impact.simulated.h24.probabilityLabel} />
                </div>
                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-rdia-600">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    Zones impact
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
                Actions recommandées
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
              aria-label="Configuration What-If"
            >
              {/* Overlay flouté blur (clique pour fermer) */}
              <button
                type="button"
                aria-label="Fermer la configuration What-If"
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
                        Configuration What-If
                      </div>
                      <div className="text-[10.5px] text-gray-500 dark:text-rdia-300">
                        Scénarios prédéfinis · 8 leviers · résultat en temps réel
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(false)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-rdia-700 dark:hover:text-rdia-100"
                    aria-label="Fermer"
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
                          Situation base
                        </h2>
                        <button
                          type="button"
                          onClick={reset}
                          className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 transition-colors hover:border-danger-500 hover:text-danger-500 dark:border-rdia-500 dark:text-rdia-300"
                        >
                          <Icon path={UI_ICONS.refresh} size={10} strokeWidth={2} />
                          Reset
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[10.5px] leading-tight">
                        <BaselineStat label="Risque" value={`${Math.round(baseline?.score ?? 0)}`} />
                        <BaselineStat
                          label="Durée"
                          value={
                            ctx.durationMin < 60
                              ? `${ctx.durationMin}m`
                              : `${Math.floor(ctx.durationMin / 60)}h${String(ctx.durationMin % 60).padStart(2, "0")}`
                          }
                        />
                        <BaselineStat label="Unités" value={`${ctx.deployedUnits}`} />
                        <BaselineStat label="Hôp <60km" value={`${ctx.nearbyHospitals}`} />
                        <BaselineStat
                          label="Sat hôp"
                          value={`${Math.round(ctx.hospitalSatPct)}%`}
                        />
                        <BaselineStat label="Vent" value={`${Math.round(ctx.windKmh)}km/h`} />
                        <BaselineStat
                          label="Pluie 24h"
                          value={`${Math.round(ctx.rain24Mm)}mm`}
                        />
                        <BaselineStat
                          label="Séisme"
                          value={
                            ctx.seismicEffectiveMag > 0
                              ? `M${ctx.seismicEffectiveMag.toFixed(1)}`
                              : "—"
                          }
                        />
                        {/* 2 stats BRUTES VICTIMES + AFFECTÉS pour ne plus avoir "5 figé mystérieux" */}
                        <BaselineStat
                          label="Victimes"
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
                          label="Affectés"
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
                        Scénarios prédéfinis
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
                      Leviers What-If
                      <button
                        type="button"
                        onClick={reset}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-rdia-600 dark:text-rdia-400"
                      >
                        Reset
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
                      Appliquer & voir
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 dark:border-rdia-600 dark:bg-rdia-700 dark:text-rdia-300">
          Sélectionnez un incident dans le bouton en haut pour démarrer la simulation What-If.
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

// ============================================================================
// Sous-composants UI
// ============================================================================
function BaselineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5 dark:border-rdia-600 dark:bg-rdia-800/40">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold text-gray-800 dark:text-rdia-100">
        {value}
      </div>
    </div>
  );
}

function SliderRow({
  cfg,
  value,
  onChange,
  compact = false,
}: {
  cfg: SliderCfg;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}) {
  const isDual = cfg.min < 0 && cfg.max > 0;
  const pctDual = isDual
    ? ((value - cfg.min) / (cfg.max - cfg.min)) * 100
    : ((value - cfg.min) / (cfg.max - cfg.min)) * 100;
  const fmtVal = cfg.fmt ? cfg.fmt(value) : `${value}${cfg.unit}`;

  const delta = isDual ? value : 0;

  // DIMENSIONS selon compact ou non
  const icSize = compact ? 12 : 14;
  const labelCls = compact ? "text-[10.5px]" : "text-[11.5px]";
  const valCls = compact ? "text-[10.5px] px-1.5 py-[2px]" : "text-[11px] px-1.5 py-0.5";
  const trH = compact ? "[&::-webkit-slider-runnable-track]:h-[6px] [&::-moz-range-track]:h-[6px]" : "[&::-webkit-slider-runnable-track]:h-2 [&::-moz-range-track]:h-2";
  const thMt = compact ? "[&::-webkit-slider-thumb]:mt-[-4px]" : "[&::-webkit-slider-thumb]:mt-[-6px]";
  const thSz = compact ? "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3" : "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4";

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-1.5")}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon
            path={cfg.icon}
            size={icSize}
            strokeWidth={compact ? 1.9 : 1.8}
            className={cn(
              "shrink-0",
              cfg.higherIsWorse ? "text-gray-500 dark:text-rdia-400" : "text-or-500/80",
            )}
          />
          <span className={cn("truncate font-medium text-gray-700 dark:text-rdia-200", labelCls)}>
            {cfg.label}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-md font-mono font-bold",
            valCls,
            isDual && delta > 0 && "bg-green-500/15 text-green-700 dark:text-green-300",
            isDual && delta < 0 && "bg-danger-400/15 text-danger-700 dark:text-danger-300",
            !isDual && cfg.higherIsWorse && value > 0 && "bg-danger-400/12 text-danger-700 dark:text-danger-300",
            !isDual && !cfg.higherIsWorse && value > 0 && "bg-green-500/12 text-green-700 dark:text-green-300",
            (!isDual || delta === 0) && value === 0 && "bg-gray-100 text-gray-500 dark:bg-rdia-600 dark:text-rdia-300",
          )}
        >
          {fmtVal}
        </span>
      </div>
      <div className="relative">
        {isDual && (
          <div className={cn(
            "pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 dark:bg-rdia-500",
            compact ? "opacity-70" : "",
          )} />
        )}
        <input
          type="range"
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "relative z-10 w-full appearance-none cursor-pointer bg-transparent",
            trH,
            "[&::-webkit-slider-runnable-track]:rounded-full",
            "[&::-webkit-slider-runnable-track]:bg-gray-100 dark:[&::-webkit-slider-runnable-track]:bg-rdia-600",
            "[&::-webkit-slider-thumb]:appearance-none",
            thMt,
            thSz,
            "[&::-webkit-slider-thumb]:rounded-full",
            "[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-sm",
            "[&::-webkit-slider-thumb]:bg-or-500 [&::-webkit-slider-thumb]:transition-transform",
            "active:[&::-webkit-slider-thumb]:scale-110",
            "[&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-gray-100 dark:[&::-moz-range-track]:bg-rdia-600",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-or-500",
          )}
          style={{
            background:
              typeof window === "undefined"
                ? undefined
                : `linear-gradient(to right, ${
                    isDual
                      ? `rgba(239,68,68,0.6) 0%, rgba(229,62,62,0.4) ${pctDual * (value < 0 ? 1 : 0)}%, transparent ${pctDual}%`
                      : value < 0
                      ? `rgba(239,68,68,0.55) ${pctDual}%, transparent ${pctDual}%`
                      : `rgba(249,115,22,0.6) ${pctDual}%, transparent ${pctDual}%`
                  })`,
          }}
        />
      </div>
    </div>
  );
}

function DeltaKpi({
  label,
  sub,
  delta,
  suffix,
}: {
  label: string;
  sub?: string;
  delta: number;
  suffix?: string;
}) {
  // Convention : Δ = sim - baseline
  //   Δ > 0 : score monte → empiré → ROUGE + ⬆️
  //   Δ < 0 : score baisse → améliore → VERT + ⬇️
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 transition-all text-center flex flex-col items-stretch h-full",
        worse && "border-danger-400/20 bg-danger-400/[0.04]",
        better && "border-green-500/20 bg-green-500/[0.04]",
        !worse && !better && "border-gray-200 bg-white dark:border-rdia-600 dark:bg-rdia-700",
      )}
    >
      {/* LIGNE 1 : LABEL — HAUTEUR FIXE 12px (~2 lignes max) */}
      <div
        className="h-[22px] flex items-end justify-center text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400 dark:text-rdia-400"
        title={label}
      >
        <span className="line-clamp-2 leading-[11px] text-center">{label}</span>
      </div>

      {/* LIGNE 2 : CHIFFRE Δ — HAUTEUR FIXE 20px, FONT MONO pour alignement horizontal ±0 */}
      <div
        className={cn(
          "mt-1 h-[20px] flex items-center justify-center font-mono font-bold text-[16px] leading-none",
          worse && "text-danger-600 dark:text-danger-300",
          better && "text-green-600 dark:text-green-400",
          !worse && !better && "text-gray-600 dark:text-rdia-300",
        )}
      >
        <span className="tabular-nums">
          {delta === 0
            ? "± 0"
            : `${delta > 0 ? "⬆ +" : "⬇ "}${delta}${suffix ?? ""}`}
        </span>
      </div>

      {/* LIGNE 3 : SOUS-LABEL — HAUTEUR FIXE 22px (~2 lignes max), alignement bottom constant */}
      <div className="mt-1 min-h-[22px] flex items-start justify-center text-[10px] leading-[11px] text-gray-400 dark:text-rdia-400">
        <span className="text-center">{sub ?? "\u00A0"}</span>
      </div>
    </div>
  );
}

function MetricBar({
  metric,
  detail,
}: {
  metric: WhatIfSubMetric;
  detail?: string;
}) {
  const delta = metric.delta;
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">
            {metric.label}
          </div>
          {detail && (
            <div className="truncate text-[9.5px] leading-tight text-gray-400 dark:text-rdia-400">
              {detail}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-[11.5px] font-semibold text-gray-700 dark:text-rdia-200">
            {Math.round(metric.value)}
          </span>
          <DeltaBadge delta={delta} small />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            worse ? "bg-danger-400" : better ? "bg-green-500" : "bg-or-400",
          )}
          style={{ width: `${Math.max(3, Math.min(100, metric.value))}%` }}
        />
      </div>
    </div>
  );
}

function HorizonRow({
  label,
  base,
  sim,
  delta,
  probLabel,
}: {
  label: string;
  base: number;
  sim: number;
  delta: number;
  probLabel: string;
}) {
  const worse = delta > 0;
  const better = delta < 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold text-gray-700 dark:text-rdia-200">
          {label}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-mono">
          <span className="text-gray-400 dark:text-rdia-400">{base} →</span>
          <span className="font-bold text-gray-800 dark:text-rdia-100">{sim}</span>
          <DeltaBadge delta={delta} small />
        </div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
        <div
          className={cn(
            "h-full rounded-full",
            worse ? "bg-danger-400" : better ? "bg-green-500" : "bg-or-400",
          )}
          style={{ width: `${Math.max(4, Math.min(100, sim))}%` }}
        />
      </div>
      <div className="text-[10.5px] text-gray-500 dark:text-rdia-400">
        <span className="font-semibold">{probLabel}</span>
      </div>
    </div>
  );
}

function DeltaBadge({
  delta,
  small,
}: {
  delta: number;
  small?: boolean;
}) {
  if (delta === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md bg-gray-100 font-mono font-bold text-gray-500 dark:bg-rdia-600 dark:text-rdia-400",
          small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-xs",
        )}
      >
        ±0
      </span>
    );
  }
  // pos → empiré ROUGE, neg → améliore VERT
  const worse = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-bold",
        worse
          ? "rounded-md bg-danger-400/15 text-danger-700 dark:text-danger-300"
          : "rounded-md bg-green-500/15 text-green-700 dark:text-green-300",
        small ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-xs",
      )}
    >
      {worse ? "⬆ +" : "⬇ "}
      {delta}
    </span>
  );
}

// ============================================================================
// Modale picker
// ============================================================================
function PickerModal({
  onClose,
  onPick,
  incidents,
  incidentTypes,
  presentTypes,
  typeFilter,
  setTypeFilter,
  q,
  setQ,
  lang,
  selectedId,
}: {
  onClose: () => void;
  onPick: (id: string) => void;
  incidents: Incident[];
  incidentTypes: any[];
  presentTypes: string[];
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  lang: string;
  selectedId: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-16 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-rdia-500 dark:bg-rdia-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-3 dark:border-rdia-600">
          <h3 className="text-[13px] font-bold text-gray-900 dark:text-rdia-100">
            Choisir un incident pour la simulation
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100 dark:text-rdia-400 dark:hover:bg-rdia-600"
          >
            <Icon path={UI_ICONS.close} size={16} strokeWidth={2.2} />
          </button>
        </div>
        <div className="space-y-2 border-b border-gray-100 p-3 dark:border-rdia-600">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon
                path={NAV_ICONS.seismic || UI_ICONS.sliders}
                size={13}
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none transition-all focus:border-or-500 focus:ring-2 focus:ring-or-500/20 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100"
                placeholder="Rechercher par titre / région / ID"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none transition-all focus:border-or-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100"
            >
              <option value="">Tous types</option>
              {presentTypes.map((id) => (
                <option key={id} value={id}>
                  {typeLabel(id, incidentTypes, lang as any)}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[11px] font-semibold text-gray-400 dark:text-rdia-400">
            {incidents.length} incident(s) · cliquer pour charger dans la simulation
          </div>
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-2">
          {incidents.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400 dark:text-rdia-400">
              Aucun incident ne correspond à votre recherche.
            </div>
          )}
          {incidents.map((i) => {
            const selected = i.id === selectedId;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onPick(i.id)}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-start transition-all",
                  selected
                    ? "border-or-500 bg-or-500/[0.07]"
                    : "border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-rdia-500 dark:hover:bg-rdia-600",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-bold text-gray-900 dark:text-rdia-100">
                      {i.titre}
                    </span>
                    <Badge
                      type={i.sev}
                      label={sevLabel(i.sev, lang as any)}
                    />
                    <span className="truncate text-[11px] text-gray-500 dark:text-rdia-400">
                      {i.region} · {typeLabel(i.type, incidentTypes, lang as any)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-rdia-400">
                    {i.id} · {new Date(i.time).toLocaleString("fr-FR")}
                  </div>
                </div>
                {selected && (
                  <Icon
                    path={UI_ICONS.check}
                    size={15}
                    strokeWidth={2.4}
                    className="mt-1 shrink-0 text-or-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
