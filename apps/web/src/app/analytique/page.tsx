"use client";

import { useMemo } from "react";
import { useArgos, useModules, useDict } from "@/lib/store";
import { StatTile } from "@/components/ui/StatTile";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { KPI_ICONS, NAV_ICONS } from "@/lib/icons";

const CHART_BOX = "h-64 min-w-0 sm:h-72 lg:h-80";

// ========================================================================
// Style PREMIUM · Editorial Executive Dashboard
// Direction artistique : Editorial / Luxury Executive (haut de gamme
// finance + défense. Typographie Serif Display (Playfair via className
// font-serif) en grand titre + Sans-Serif (Inter/Geist via font-sans
// pour le corps. Palette monochrome ivoire / encre, accent unique
// Bronze doré (#B8860B → #C9A84C). Effets : verre dépoli, ombres
// cheveux (hairline shadows 0.3px), séparation, micro-bordures
// 0.5px. Layout asymétrique · révélation stagger 80ms.
// ========================================================================

function DatedBadge() {
  const date = new Date();
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#C9A84C]/25 bg-white/50 px-2.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] backdrop-blur dark:border-[#C9A84C]/20 dark:bg-rdia-800/30 dark:text-[#E4C77A]">
      <span className="inline-block h-1 w-1 rounded-full bg-[#C9A84C]" />
      {d} · {m} · {y}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8A6D1B] dark:text-[#D6B86B]">
      <span className="h-px flex-1 bg-gradient-to-r from-[#C9A84C]/40 via-[#C9A84C]/10 to-transparent" />
      <span className="font-serif not-italic tracking-[0.28em]">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-[#C9A84C]/40 via-[#C9A84C]/10 to-transparent" />
    </div>
  );
}

function PremiumCard({
  tone = "light",
  children,
  className = "",
}: {
  tone?: "light" | "dark" | "ivory";
  children: React.ReactNode;
  className?: string;
}) {
  const surfaces: Record<string, string> = {
    light:
      "bg-white/80 border-black/[0.03]",
    dark:
      "bg-rdia-800/40 border-rdia-50/[0.06]",
    ivory:
      "bg-gradient-to-br from-[#FBF8EF] to-[#F4EEDB] border-black/[0.04] dark:from-rdia-800/40 dark:to-rdia-900/40 dark:border-rdia-50/[0.05]",
  };
  return (
    <div
      className={`group relative h-full w-full overflow-hidden rounded-xl backdrop-blur-md transition-all duration-500 hover:-translate-y-[1px] hover:shadow-[0_30px_80px_-30px_rgba(201,168,76,0.18)] dark:hover:shadow-[0_30px_100px_-30px_rgba(201,168,76,0.10)] ${surfaces[tone]} ${className}`}
      style={{
        border: "1px solid rgba(175,140,60,0.14)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.6) inset, 0 20px 40px -24px rgba(30,20,0,0.08)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-0 h-[3px] w-14 rounded-b-full opacity-80"
        style={{ background: "linear-gradient(90deg,#C9A84C,transparent)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#C9A84C]/[0.04] to-transparent transition-transform duration-[1400ms] ease-out group-hover:translate-x-full"
      />
      {children}
    </div>
  );
}

export default function AnalytiquePage() {
  const catalog = useArgos((s) => s.catalog);
  const ANALYTICS = catalog.analytics;
  const m = useModules();
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const a = ANALYTICS;

  const severityDist: ChartDatum[] = useMemo(
    () => [
      { label: t.sev_high, value: incidents.filter((i) => i.sev === "high").length, couleur: "#EF4444" },
      { label: t.sev_med, value: incidents.filter((i) => i.sev === "medium").length, couleur: "#F59E0B" },
      { label: t.sev_low, value: incidents.filter((i) => i.sev === "low").length, couleur: "#9CA3AF" },
    ],
    [incidents, t.sev_high, t.sev_med, t.sev_low],
  );

  const closedCount = useMemo(() => incidents.filter((i) => i.st === "closed").length, [incidents]);
  const progCount = useMemo(() => incidents.filter((i) => i.st === "prog").length, [incidents]);
  const openCount = incidents.length - closedCount;
  const highCount = severityDist[0].value;

  const cleanLabel = (s: string) =>
    s.replace(/^\[[^\]]+\]\s*/g, "")  // ← retire indicatif préfixe [HC037], [H4]...
      .replace(/…\s*$/g, "")
      .replace(/\.{3,}\s*$/g, "")
      .trim();

  const hotHosps = useMemo(
    () => (a.hospitalSat ?? []).filter((h) => h.value >= 85).map((h) => cleanLabel(h.label)),
    [a.hospitalSat],
  );
  const peakSat = useMemo(
    () => Math.max(0, ...(a.hospitalSat ?? []).map((h) => h.value)),
    [a.hospitalSat],
  );
  const avgResponseSeg = useMemo(() => {
    const arr = a.responseTimes ?? [];
    if (!arr.length) return 0;
    return Math.round(arr.reduce((s, r) => s + r.value, 0) / arr.length);
  }, [a.responseTimes]);
  const lastTrend = a.incidentTrend?.[a.incidentTrend.length - 1]?.value ?? 0;
  const prevTrend = a.incidentTrend?.[a.incidentTrend.length - 2]?.value ?? lastTrend;
  const trendDelta =
    prevTrend === 0 ? 0 : Math.round(((lastTrend - prevTrend) / prevTrend) * 100);

  const kpis = [
    {
      k: 0,
      tone: "#C9A84C",
      tint: "or" as const,
      label: m.analytics.kpi_response,
      value: `${a.kpis.avgResponse} ${m.analytics.minutes}`,
      icon: KPI_ICONS.incidents,
      eyebrow: `${avgResponseSeg} min / segment`,
      suffix: a.kpis.avgResponse <= 45 ? "Conforme SLA" : "Dépassement",
      ok: a.kpis.avgResponse <= 45,
    },
    {
      k: 1,
      tone: "#8A5A08",
      tint: "danger" as const,
      label: m.analytics.kpi_evac_admit,
      value: `${a.kpis.evacAdmit} ${m.analytics.minutes}`,
      icon: KPI_ICONS.beds,
      eyebrow: "Passerelle sanitaire",
      suffix: "Prises en charge",
      ok: true,
    },
    {
      k: 2,
      tone: "#4B7A51",
      tint: "green" as const,
      label: m.analytics.kpi_closed,
      value: `${a.kpis.closedRate}%`,
      icon: KPI_ICONS.units,
      eyebrow: `${closedCount} / ${incidents.length} incidents`,
      suffix: `${openCount} restant(s)`,
      ok: a.kpis.closedRate >= 50,
    },
    {
      k: 3,
      tone: "#1F5FA4",
      tint: "blue" as const,
      label: m.analytics.kpi_util,
      value: `${a.kpis.util}%`,
      icon: NAV_ICONS.res,
      eyebrow: "Pers · Véh · Éqp · Hôp",
      suffix: a.kpis.util >= 80 ? "Charge élevée" : "Marge disponible",
      ok: a.kpis.util < 80,
    },
  ];

  const chartPalette = [
    {
      tone: "#C9A84C",
      eyebrow: "Segmentation 4 phases",
      suffix: a.kpis.avgResponse <= 45 ? "▼ Sous SLA" : "▲ Dépassement",
      ok: a.kpis.avgResponse <= 45,
      node: <ChartCard titre={m.analytics.response_times} type="bars" data={a.responseTimes} />,
    },
    {
      tone: "#B8860B",
      eyebrow: lastTrend ? `J0 : ${lastTrend} incidents` : "Fenêtre 7 jours",
      suffix:
        trendDelta > 0
          ? `▲ +${trendDelta}% vs J-1`
          : trendDelta < 0
            ? `▼ ${trendDelta}% vs J-1`
            : "＝ stable · J-1",
      ok: trendDelta <= 0,
      node: <ChartCard titre={m.analytics.incident_trend} type="column3d" data={a.incidentTrend} />,
    },
    {
      tone: "#4B7A51",
      eyebrow: "Agrégat zones TRIAGE",
      suffix: (a.triageOutcomes?.[0]?.value ?? 0) > 0 ? "Tri prioritaire" : "Distribution standard",
      ok: (a.triageOutcomes?.[0]?.value ?? 0) <= (a.triageOutcomes?.[2]?.value ?? 1) / 3,
      node: <DonutChart titre={m.analytics.triage_outcomes} data={a.triageOutcomes} />,
    },
    {
      tone: "#1F5FA4",
      eyebrow: "Moyenne pondérée 30 / 25 / 20 / 25",
      suffix: `Global ≈ ${a.kpis.util}%`,
      ok: a.kpis.util < 85,
      node: <ChartCard titre={m.analytics.resource_util} type="bars" data={a.resourceUtil} />,
    },
    {
      tone: "#9A3412",
      eyebrow: `Pic à ${peakSat} % · 6 établissements`,
      suffix:
        (a.hospitalSat ?? []).some((h) => h.value >= 90)
          ? "▲ Saturation critique"
          : "▼ Réseau maîtrisé",
      ok: !(a.hospitalSat ?? []).some((h) => h.value >= 90),
      node: (
        <ChartCard
          titre={m.analytics.hospital_sat}
          type="bars"
          data={(a.hospitalSat ?? []).map((d) => {
            const full = cleanLabel(d.label);
            const idx = full.lastIndexOf("·");
            const label = idx > -1 ? full.slice(0, idx).trim() : full;
            const subtitle = idx > -1 ? full.slice(idx + 1).trim() : undefined;
            return { ...d, label, subtitle };
          })}
        />
      ),
    },
    {
      tone: "#B8860B",
      eyebrow: `${incidents.length} incidents référencés`,
      suffix: highCount > 0 ? "▲ Gravité haute détectée" : "▼ Pas d'incident critique",
      ok: highCount === 0,
      node: <DonutChart titre={m.analytics.severity_dist} data={severityDist} />,
    },
  ];

  return (
    <section className="relative mx-auto flex w-full max-w-[1400px] min-w-0 flex-col gap-10 pb-16 pt-6">
      {/* =========================================================
           HERO · Asymétrique premium editorial
           ========================================================= */}
      <header className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3">
          <DatedBadge />
        </div>
          <h1 className="font-serif text-[30px] font-semibold leading-[1.05] tracking-tight text-[#1C1A17] dark:text-[#F3EBD6] sm:text-[38px] lg:text-[44px]">
            Analytique
            <span className="ml-2 inline-block align-middle text-[16px] font-sans font-normal italic text-[#8A6D1B] dark:text-[#E4C77A] sm:text-[18px]">
              opérationnelle
            </span>
          </h1>
          <p className="mt-4 max-w-[62ch] text-[13px] leading-[1.65] text-[#3E3A33] dark:text-[#CBBFA8]">
            Synthèse exécutive des indicateurs du système IRIS. Données consolidées en temps réel.
          </p>

          {/* 4 micro métriques hero · en résumé inline */}
          <div className="mt-6 flex flex-wrap items-center gap-5">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[22px] font-semibold text-[#1C1A17] dark:text-[#F3EBD6] tabular-nums">
                {incidents.length}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#8A6D1B]">
                Incidents
              </span>
            </div>
            <span className="h-6 w-px bg-gradient-to-b from-transparent via-[#C9A84C]/40 to-transparent" />
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[22px] font-semibold text-[#1C1A17] dark:text-[#F3EBD6] tabular-nums">
                {progCount}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#8A6D1B]">
                En cours
              </span>
            </div>
            <span className="h-6 w-px bg-gradient-to-b from-transparent via-[#C9A84C]/40 to-transparent" />
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-[22px] font-semibold text-[#1C1A17] dark:text-[#F3EBD6] tabular-nums">
                {closedCount}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#8A6D1B]">
                Clôturés
              </span>
            </div>
            <span className="h-6 w-px bg-gradient-to-b from-transparent via-[#C9A84C]/40 to-transparent" />
            <div className="flex items-baseline gap-2">
              <span
                className="font-serif text-[22px] font-semibold tabular-nums"
                style={{ color: highCount > 0 ? "#B91C1C" : "#1C1A17" }}
              >
                {highCount}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#8A6D1B]">
                Haute gravité
              </span>
            </div>
          </div>
        </div>

        {/* Colonne droite hero · Synthèse carte ton ivoire minimaliste */}
        <PremiumCard tone="ivory" className="flex animate-fade-in-up">
          <div className="flex h-full w-full flex-col justify-between gap-5 p-6">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-serif text-[13px] italic text-[#8A6D1B] dark:text-[#E4C77A]">
                  Synthèse
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[4px] text-[9px] font-bold uppercase tracking-[0.2em] ${
                  peakSat >= 90 || highCount > 0
                    ? "bg-[#B91C1C]/10 text-[#B91C1C] dark:bg-[#B91C1C]/20"
                    : a.kpis.util < 70
                      ? "bg-[#4B7A51]/10 text-[#4B7A51] dark:bg-[#4B7A51]/20"
                      : "bg-[#C9A84C]/15 text-[#8A6D1B] dark:text-[#E4C77A]"
                }`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                  {peakSat >= 90 || highCount > 0
                    ? "Attention requise"
                    : a.kpis.util < 70
                      ? "Situation nominal"
                      : "Monitoring continu"}
                </span>
              </div>
              <div className="mt-4 font-serif text-[17px] font-medium leading-snug text-[#1C1A17] dark:text-[#F3EBD6]">
                {peakSat >= 90
                  ? `Posture vigilance : établissements sous tension (pic à ${peakSat} %)`
                  : highCount > 0
                    ? `${highCount} incident(s) critique(s) · pilotage fin des unités`
                    : `Système nominal · ${a.kpis.closedRate} % des incidents clos`
                }
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 border-t border-[#C9A84C]/15 pt-4 dark:border-[#C9A84C]/10">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                  Réponse
                </div>
                <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                  {a.kpis.avgResponse}
                  <span className="ml-[2px] text-[10px] text-[#8A6D1B]">min</span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                  Clôture
                </div>
                <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                  {a.kpis.closedRate}
                  <span className="ml-[2px] text-[10px] text-[#8A6D1B]">%</span>
                </div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                  Moyens
                </div>
                <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                  {a.kpis.util}
                  <span className="ml-[2px] text-[10px] text-[#8A6D1B]">%</span>
                </div>
              </div>
            </div>
          </div>
        </PremiumCard>
      </header>

      {/* =========================================================
           BLOC 1 · KPIs · 4 cartes premium
           ========================================================= */}
      <div>
        <SectionLabel>Indicateurs clés · Executive</SectionLabel>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
          {kpis.map((k) => (
            <PremiumCard
              key={k.k}
              className="animate-fade-in-up"
              tone="light"
            >
              <div
                className="flex h-full w-full flex-col justify-between p-4 sm:p-5"
                style={{ animationDelay: `${80 + k.k * 90}ms`, animationFillMode: "both" }}
              >
                <StatTile label={k.label} value={k.value} icon={k.icon} tint={k.tint} />
                <div className="mt-4 flex items-end justify-between border-t border-[#C9A84C]/15 pt-3 dark:border-[#C9A84C]/10">
                  <span className="text-[9.5px] font-medium leading-tight text-[#5A4A1F] dark:text-[#CBBFA8]">
                    {k.eyebrow}
                  </span>
                  <span
                    className={`text-[9.5px] font-semibold tracking-wide ${
                      k.ok ? "text-[#4B7A51] dark:text-[#8CBA7B]" : "text-[#B07A0D] dark:text-[#E4C77A]"
                    }`}
                  >
                    {k.suffix}
                  </span>
                </div>
              </div>
            </PremiumCard>
          ))}
        </div>
      </div>

      {/* =========================================================
           BLOC 2 · 6 graphiques · 2 × 3
           ========================================================= */}
      <div>
        <SectionLabel>Cartographies de performance</SectionLabel>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 sm:gap-4">
          {chartPalette.map((c, k) => (
            <div
              key={k} className={`animate-fade-in-up ${CHART_BOX}`} style={{ animationDelay: `${500 + k * 70}ms`, animationFillMode:"both"}}>
              <PremiumCard tone="light">
                <div className="flex h-full w-full flex-col">
                  <div className="flex items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
                    <span className="text-[9.5px] font-medium leading-tight text-[#5A4A1F] dark:text-[#CBBFA8]">
                      {c.eyebrow}
                    </span>
                    <span
                      className={`text-[9.5px] font-semibold tracking-wide ${
                        c.ok ? "text-[#4B7A51]" : "text-[#B07A0D]"
                      }`}
                    >
                      {c.suffix}
                    </span>
                  </div>
                  <div className="-mt-2 h-full w-full p-1.5 sm:p-3">{c.node}</div>
                </div>
              </PremiumCard>
            </div>
          ))}
        </div>
      </div>

      {/* =========================================================
           BLOC 3 · Notes de situation · 2 colonnes
           ========================================================= */}
      <div>
        <SectionLabel>Notes de situation</SectionLabel>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5">
          <PremiumCard tone="ivory" className="animate-fade-in-up">
            <div className="flex h-full w-full flex-col gap-2 p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <span className="font-serif text-[14px] italic text-[#8A6D1B] dark:text-[#E4C77A]">
                  Réseau hospitalier
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-[4px] text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{
                    color: peakSat >= 85 ? "#B91C1C" : "#4B7A51",
                    backgroundColor:
                      peakSat >= 85 ? "rgba(185,28,28,0.08)" : "rgba(75,122,81,0.08)",
                  }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                  {peakSat >= 85 ? "Sous tension" : "Maîtrisé"}
                </span>
              </div>
              <div className="font-serif text-[14px] leading-[1.6] text-[#1C1A17] dark:text-[#EAD8C5]">
                {hotHosps.length > 0 ? (
                  <>
                    <p className="mb-2">
                      Les établissements suivants dépassent le seuil de 85 % d'occupation :
                    </p>
                    <ul className="ml-1 space-y-1.5">
                      {hotHosps.map((name, k) => {
                        const hasCity = name.includes("·");
                        const parts = hasCity
                          ? [name.slice(0, name.lastIndexOf("·")).trim(), name.slice(name.lastIndexOf("·") + 1).trim()]
                          : [name, ""];
                        return (
                          <li key={`${name}-${k}`} className="flex items-start gap-2 break-all whitespace-normal">
                            <span aria-hidden className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#C9A84C" }} />
                            <div className="min-w-0 flex flex-col break-all whitespace-normal leading-[1.2]">
                              <span className="font-medium text-[#1C1A17] dark:text-[#EAD8C5]">{parts[0]}</span>
                              {parts[1] ? (
                                <span className="text-[12px] italic text-[#8A6D1B] dark:text-[#E4C77A]">{parts[1]}</span>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="break-all whitespace-normal">
                    Aucun établissement ne dépasse le seuil de 85 %. Le pic du réseau est observé à {peakSat} %.
                  </p>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3 border-t border-[#C9A84C]/15 pt-3 dark:border-[#C9A84C]/10">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[24px] font-semibold tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                    {peakSat}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.22em] text-[#8A6D1B]">
                    % pic
                  </span>
                </div>
                <span className="ml-auto text-[10px] leading-tight text-[#5A4A1F] dark:text-[#CBBFA8]">
                  {hotHosps.length > 0
                    ? `${hotHosps.length} site(s) au-dessus du seuil`
                    : "Réseau disponible"}
                </span>
              </div>
            </div>
          </PremiumCard>

          <PremiumCard tone="ivory" className="animate-fade-in-up">
            <div
              className="flex h-full w-full flex-col gap-2 p-5 sm:p-6"
              style={{ animationDelay: "120ms", animationFillMode: "both" }}
            >
              <div className="flex items-center justify-between">
                <span className="font-serif text-[14px] italic text-[#8A6D1B] dark:text-[#E4C77A]">
                  Posture opérationnelle
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-[4px] text-[9px] font-bold uppercase tracking-[0.2em]"
                  style={{
                    color: highCount > 0 ? "#B91C1C" : "#4B7A51",
                    backgroundColor:
                      highCount > 0 ? "rgba(185,28,28,0.08)" : "rgba(75,122,81,0.08)",
                  }}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                  {highCount > 0 ? "FOP active" : "Surveillance"}
                </span>
              </div>
              <p className="break-all whitespace-normal font-serif text-[14px] leading-[1.6] text-[#1C1A17] dark:text-[#EAD8A5]">
                {highCount > 0
                  ? `${highCount} incident(s) de haute gravité sont ouverts. ${progCount} incidents sont traités en ce moment, ${closedCount} ont été cloturés. L'utilisation globale des moyens atteint ${a.kpis.util} %.`
                  : `Aucun incident de haute gravité n'est ouvert. ${progCount} incidents sont en cours et ${closedCount} ont été cloturés. Taux de clôture de ${a.kpis.closedRate} %.`}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-3 border-t border-[#C9A84C]/15 pt-3 dark:border-[#C9A84C]/10">
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                    Ouverts
                  </div>
                  <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                    {openCount}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                    En cours
                  </div>
                  <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                    {progCount}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#8A6D1B] dark:text-[#D6B86B]">
                    Clos
                  </div>
                  <div className="mt-[2px] font-serif text-[19px] tabular-nums text-[#1C1A17] dark:text-[#F3EBD6]">
                    {closedCount}
                  </div>
                </div>
              </div>
            </div>
          </PremiumCard>
        </div>
      </div>
    </section>
  );
}
