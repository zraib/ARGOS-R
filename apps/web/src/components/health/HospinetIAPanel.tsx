"use client";

// ============================================================================
// ARGOS — Panneau IA Hospinet · style minimaliste What-If + expand par carte
//
// Chaque carte graphe dispose d'un bouton ⤢ (expand) dans son coin supérieur
// droit. Au clic, le graphe s'affiche en plein écran XL (pattern identique à
// LocationPreviewMap / IncidentWizard) avec à la suite un TABLEAU détaillé des
// chiffres par service / réseau / seuil → résout le problème "écriture sous
// les services pas visible" : détails déplacés DANS l'expand (illisible 12 px
// sur compact → lisible 13 px dans tableau plein écran).
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import {
  aggregateHospitalsFacts,
  generateHospinetSummary,
  generateSummaryFallback,
  type HospinetFacts,
} from "@/lib/ai/llmHospinetSummary";

// ---------------------------------------------------------------------------
// Utilitaires graphe (SVG inline, aucune dépendance)
// ---------------------------------------------------------------------------

const PAD = { top: 6, right: 10, bottom: 22, left: 26 };
const PAD_XL = { top: 14, right: 18, bottom: 44, left: 48 };

function fmtInt(n: number): string {
  if (n >= 1000) return n.toLocaleString("fr-FR");
  return String(n);
}
function fmtPct(n: number): string {
  const c = Math.max(0, Math.min(100, Math.round(n)));
  return `${c} %`;
}
function occTint(pct: number) {
  return pct >= 92 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#10B981";
}
function occLabel(pct: number): string {
  if (pct >= 92) return "saturé";
  if (pct >= 75) return "en tension";
  return "confortable";
}
function occChip(pct: number): string {
  if (pct >= 92)
    return "rounded-md bg-danger-500/15 px-2 py-0.5 text-[10.5px] font-bold text-danger-700 dark:text-danger-300";
  if (pct >= 75)
    return "rounded-md bg-or-500/15 px-2 py-0.5 text-[10.5px] font-bold text-or-700 dark:text-or-300";
  return "rounded-md bg-green-500/15 px-2 py-0.5 text-[10.5px] font-bold text-green-700 dark:text-green-300";
}

// ===========================================================================
// 1 · Anneau d'occupation global
// ===========================================================================

function OccupancyRing({
  pct,
  freePct,
  totalLits,
  freeLits,
  size = 112,
  stroke = 11,
  big = false,
}: {
  pct: number;
  freePct: number;
  totalLits: number;
  freeLits: number;
  size?: number;
  stroke?: number;
  big?: boolean;
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const dashOcc = (clamped / 100) * circ;
  const dashFree = Math.max(0, circ - dashOcc - 2);
  const colorOcc = occTint(pct);
  const fs = big ? 24 : 20;
  const subFs = big ? 11 : 9;

  return (
    <div className={`flex w-full flex-col items-center ${big ? "gap-5" : "gap-2.5"}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} strokeLinecap="butt" />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={colorOcc}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${dashOcc} ${dashFree}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 select-none">
          <div
            className="font-bold tabular-nums leading-none text-gray-800 dark:text-white"
            style={{ fontSize: fs }}
          >
            {fmtPct(pct)}
          </div>
          <div
            className="font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-300"
            style={{ fontSize: subFs }}
          >
            occupés
          </div>
        </div>
      </div>
      <div className={`grid w-full grid-cols-2 ${big ? "gap-3 max-w-[420px]" : "gap-1.5"}`}>
        <div
          className={
            big
              ? "rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-rdia-500 dark:bg-rdia-700"
              : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
          }
        >
          <div
            className={big ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300" : "text-[9px] uppercase tracking-wider text-gray-400 dark:text-rdia-400"}
          >
            total
          </div>
          <div
            className={
              big
                ? "text-[22px] font-bold tabular-nums text-gray-800 dark:text-white"
                : "text-[11px] font-bold tabular-nums text-gray-700 dark:text-rdia-100"
            }
          >
            {fmtInt(totalLits)}
          </div>
        </div>
        <div
          className={
            big
              ? "rounded-lg border border-gray-200 bg-white p-3 text-center dark:border-rdia-500 dark:bg-rdia-700"
              : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
          }
        >
          <div
            className={big ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300" : "text-[9px] uppercase tracking-wider text-gray-400 dark:text-rdia-400"}
          >
            libres
          </div>
          <div
            className={
              big
                ? "text-[22px] font-bold tabular-nums text-green-600 dark:text-green-400"
                : "text-[11px] font-bold tabular-nums text-green-600 dark:text-green-400"
            }
          >
            {fmtInt(freeLits)}
            {big ? null : (
              <span className="ml-0.5 text-[9px] opacity-70">({fmtPct(freePct)})</span>
            )}
          </div>
          {big && (
            <div className="mt-1 text-[11px] font-medium text-gray-500 dark:text-rdia-300">
              soit {fmtPct(freePct)} du parc
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// 2 · Barres verticales par service
// ===========================================================================

function ServicesBars({
  services,
  big = false,
}: {
  services: HospinetFacts["services"];
  big?: boolean;
}) {
  const pad = big ? PAD_XL : PAD;
  const W = big ? 560 : 360;
  const H = big ? 260 : 138;
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const count = services.length;
  const gap = big ? 28 : 14;
  const barW = (innerW - (count - 1) * gap) / count;
  const tickFs = big ? 10 : 8.5;
  const nameFs = big ? 12 : 9;
  const pctFs = big ? 11 : 8.5;

  return (
    <div className="flex w-full flex-col">
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {/* axes */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={H - pad.bottom}
          stroke="#E5E7EB"
          strokeWidth={big ? 1.2 : 1}
        />
        <line
          x1={pad.left}
          y1={H - pad.bottom}
          x2={W - pad.right}
          y2={H - pad.bottom}
          stroke="#E5E7EB"
          strokeWidth={big ? 1.2 : 1}
        />
        {/* ticks Y */}
        {[0, 25, 50, 75, 100].map((g) => {
          const y = H - pad.bottom - (g / 100) * innerH;
          return (
            <g key={g}>
              <line
                x1={pad.left - (big ? 5 : 3)}
                y1={y}
                x2={pad.left}
                y2={y}
                stroke="#C7CCD2"
                strokeWidth={1}
              />
              <text
                x={pad.left - (big ? 8 : 5)}
                y={y + (big ? 4 : 3)}
                textAnchor="end"
                className="fill-gray-400"
                style={{ fontSize: tickFs, fontWeight: 500 }}
              >
                {g}
              </text>
              {big && g !== 0 && (
                <line
                  x1={pad.left}
                  y1={y}
                  x2={W - pad.right}
                  y2={y}
                  stroke="#E5E7EB"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                  opacity="0.6"
                />
              )}
            </g>
          );
        })}
        {services.map((s, i) => {
          const x = pad.left + i * (barW + gap);
          const clamped = Math.max(0, Math.min(100, s.pct));
          const h = Math.max(1, (clamped / 100) * innerH);
          const y = H - pad.bottom - h;
          const fill = occTint(s.pct);
          const pctAbove = big ? true : h >= 20;
          return (
            <g key={s.name}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={big ? 3 : 2}
                fill={fill}
                opacity="0.92"
              >
                <title>
                  {s.name} · {s.free} libres / {s.total} ({fmtPct(s.pct)})
                </title>
              </rect>
              {/* nom du service sous l'axe */}
              <text
                x={x + barW / 2}
                y={H - pad.bottom + (big ? 22 : 14)}
                textAnchor="middle"
                className="fill-gray-700 dark:fill-rdia-200"
                style={{ fontSize: nameFs, fontWeight: big ? 700 : 600 }}
              >
                {s.name}
              </text>
              {/* % : au-dessus si place, sinon à droite */}
              {pctAbove ? (
                <text
                  x={x + barW / 2}
                  y={y - (big ? 8 : 4)}
                  textAnchor="middle"
                  className="fill-gray-800 dark:fill-white"
                  style={{ fontSize: pctFs, fontWeight: 800 }}
                >
                  {fmtPct(s.pct)}
                </text>
              ) : (
                <text
                  x={x + barW + 3}
                  y={y + (big ? 11 : 8)}
                  className="fill-gray-600 dark:fill-rdia-200"
                  style={{ fontSize: pctFs, fontWeight: 700 }}
                >
                  {fmtPct(s.pct)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ===========================================================================
// 3 · Barres horizontales · Réseaux militaire / civil + catégories
// ===========================================================================

function NetworksBars({
  networks,
  kinds,
  big = false,
}: {
  networks: HospinetFacts["networks"];
  kinds: HospinetFacts["kinds"];
  big?: boolean;
}) {
  const W = big ? 560 : 340;
  const H = big ? 80 : 150;
  const padL = big ? 80 : 60;
  const padR = big ? 18 : 8;
  const padT = big ? 14 : 8;
  const innerW = W - padL - padR;
  const barH = big ? 18 : 12;
  const gap = big ? 12 : 10;
  const startY = padT;

  const labelFs = big ? 12 : 9.5;
  const valueFs = big ? 11 : 8.5;
  const kindFs = big ? 11 : 8.5;

  return (
    <div className={`flex w-full flex-col ${big ? "gap-3" : "gap-2"}`}>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        {networks.map((n, i) => {
          const y = startY + i * (barH + gap);
          const clamped = Math.max(0, Math.min(100, n.pct));
          const w = Math.max(2, (clamped / 100) * innerW);
          const color = n.reseau === "militaire" ? "#C9A84C" : "#3B82F6";
          const label = n.reseau === "militaire" ? "Militaire" : "Civil";
          const labelInside = w > (big ? 130 : 62);
          return (
            <g key={n.reseau}>
              <text
                x={padL - (big ? 12 : 6)}
                y={y + barH / 2 + (big ? 5 : 3.5)}
                textAnchor="end"
                className="fill-gray-700 dark:fill-rdia-200"
                style={{ fontSize: labelFs, fontWeight: big ? 800 : 600 }}
              >
                {label}
              </text>
              <rect
                x={padL}
                y={y}
                width={innerW}
                height={barH}
                rx={big ? 5 : 2.5}
                fill="#E5E7EB"
                opacity="0.45"
              />
              <rect
                x={padL}
                y={y}
                width={w}
                height={barH}
                rx={big ? 5 : 2.5}
                fill={color}
              >
                <title>
                  {label} · {n.free} libres / {n.lits} lits ({fmtPct(n.pct)})
                </title>
              </rect>
              {labelInside ? (
                <text
                  x={padL + (big ? 10 : 4)}
                  y={y + barH / 2 + (big ? 4.5 : 3)}
                  style={{ fontSize: valueFs, fontWeight: 800 }}
                  fill="#fff"
                >
                  {fmtPct(n.pct)} · {fmtInt(n.lits)} lits
                </text>
              ) : (
                <text
                  x={padL + w + (big ? 8 : 3)}
                  y={y + barH / 2 + (big ? 4.5 : 3)}
                  style={{ fontSize: valueFs, fontWeight: 800 }}
                  className="fill-gray-800 dark:fill-white"
                >
                  {fmtPct(n.pct)} · {fmtInt(n.lits)}
                </text>
              )}
            </g>
          );
        })}
        {/* Légende catégories (mode compact seulement) */}
        {!big && (
          <g transform={`translate(${padL - 2}, ${startY + 2 * (barH + gap) + 6})`}>
            {kinds.slice(0, 4).map((k, i) => {
              const col = i % 2;
              const row = Math.floor(i / 2);
              const cx_ = col * 132;
              const cy_ = row * 15;
              return (
                <g key={k.kind ?? i} transform={`translate(${cx_}, ${cy_})`}>
                  <rect
                    x={0}
                    y={2}
                    width={8}
                    height={8}
                    rx={1.5}
                    fill={k.color}
                  />
                  <text
                    x={12}
                    y={9}
                    className="fill-gray-700 dark:fill-rdia-200"
                    style={{ fontSize: kindFs, fontWeight: 600 }}
                  >
                    {k.label}
                    <tspan className="opacity-60" style={{ fontWeight: 500 }}>
                      {" "}
                      · {k.count} éta.
                    </tspan>
                  </text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Légende catégories (mode big) — HTML centré */}
      {big && (
        <div className="mx-auto grid w-full max-w-[520px] grid-cols-2 gap-y-2 gap-x-6">
          {kinds.slice(0, 4).map((k) => (
            <div key={k.kind ?? k.label} className="flex items-center gap-2.5">
              <div
                className="h-3 w-3 shrink-0 rounded-[2.5px] shadow-inner"
                style={{ background: k.color }}
              />
              <span className="text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">
                {k.label}
                <span className="opacity-60"> · {k.count} éta.</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {!big && (
        <div
          className={`grid grid-cols-2 ${big ? "gap-4 max-w-[560px]" : "gap-1.5"}`}
        >
          {networks.map((n) => {
            const reaPct = n.reaPct;
            const color =
              reaPct >= 92
                ? "text-danger-500 dark:text-danger-300"
                : reaPct >= 75
                  ? "text-or-500 dark:text-or-400"
                  : "text-green-600 dark:text-green-400";
            const header =
              big
                ? "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300"
                : "text-[8.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
            const valueCls = big
              ? `text-[22px] font-extrabold tabular-nums ${color}`
              : `text-[11px] font-bold tabular-nums ${color}`;
            return (
              <div
                key={n.reseau}
                className={
                  big
                    ? "rounded-xl border border-gray-200 bg-white p-4 text-center dark:border-rdia-500 dark:bg-rdia-700"
                    : "rounded-md border border-gray-100 bg-gray-50/70 px-1.5 py-1 text-center dark:border-rdia-600 dark:bg-rdia-800/40"
                }
              >
                <div className={header}>
                  REA {n.reseau === "militaire" ? "militaire" : "civil"}
                </div>
                <div className={valueCls}>
                  {fmtInt(n.reaFree)}
                  <span className="opacity-60">/{fmtInt(n.rea)}</span>
                </div>
                {big && (
                  <div className="mt-1 text-[12px] font-medium text-gray-500 dark:text-rdia-300">
                    {fmtPct(reaPct)} d'occupation
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 4 · KPI
// ===========================================================================

interface KpiProps {
  icon: string;
  label: string;
  primary: string;
  secondary?: string;
  tint?: "neutral" | "green" | "orange" | "red" | "blue";
}
const TINT: Record<NonNullable<KpiProps["tint"]>, { chipBg: string; chipText: string; primary: string }> = {
  neutral: {
    chipBg: "bg-gray-100 dark:bg-rdia-600",
    chipText: "text-gray-500 dark:text-rdia-300",
    primary: "text-gray-800 dark:text-rdia-50",
  },
  green: {
    chipBg: "bg-green-500/12 dark:bg-green-500/20",
    chipText: "text-green-600 dark:text-green-400",
    primary: "text-green-700 dark:text-green-400",
  },
  orange: {
    chipBg: "bg-or-500/12 dark:bg-or-500/20",
    chipText: "text-or-600 dark:text-or-400",
    primary: "text-or-700 dark:text-or-400",
  },
  red: {
    chipBg: "bg-danger-500/12 dark:bg-danger-500/20",
    chipText: "text-danger-600 dark:text-danger-400",
    primary: "text-danger-700 dark:text-danger-400",
  },
  blue: {
    chipBg: "bg-blue-500/12 dark:bg-blue-500/20",
    chipText: "text-blue-600 dark:text-blue-400",
    primary: "text-blue-700 dark:text-blue-400",
  },
};
function KpiCard({ icon, label, primary, secondary, tint = "neutral" }: KpiProps) {
  const c = TINT[tint];
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.chipBg} ${c.chipText}`}
        >
          <Icon path={icon} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
            {label}
          </div>
          <div className={`mt-0.5 truncate text-[18px] font-bold tabular-nums leading-tight ${c.primary}`}>
            {primary}
          </div>
          {secondary && (
            <div className="mt-0.5 truncate text-[10.5px] font-medium leading-tight text-gray-500 dark:text-rdia-300">
              {secondary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Bouton expand (⤢) / close (✕) · pattern LocationPreviewMap
// ===========================================================================

function ExpandBtn({
  expanded,
  onClick,
  title,
}: {
  expanded: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        expanded
          ? "absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-rdia-700 shadow-lg transition-colors hover:bg-gray-100 dark:bg-rdia-700 dark:text-white dark:hover:bg-rdia-600"
          : "absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md border border-gray-100 bg-white/85 text-gray-500 shadow-sm backdrop-blur transition-all hover:border-gray-200 hover:text-gray-800 dark:border-rdia-500 dark:bg-rdia-700/85 dark:text-rdia-200 dark:hover:bg-rdia-700 dark:hover:text-white"
      }
    >
      <Icon
        path={expanded ? UI_ICONS.close : UI_ICONS.expand}
        size={expanded ? 17 : 13}
        strokeWidth={2}
      />
    </button>
  );
}

// ===========================================================================
// Composant principal
// ===========================================================================

type ExpandedKey = "occ" | "svc" | "net" | null;

export function HospinetIAPanel() {
  const t = useDict();
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);

  const facts = useMemo(
    () => aggregateHospitalsFacts(hospitals, fieldHosps),
    [hospitals, fieldHosps]
  );

  const fallback = useMemo(() => generateSummaryFallback(facts), [facts]);

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
      const res = await generateHospinetSummary(hospitals, fieldHosps);
      if (!alive) return;
      setText(res.text);
      setIsFallback(res.fallback);
      setError(res.error);
      setBusy(false);
    })();
    return () => {
      alive = false;
    };
  }, [hospitals, fieldHosps, fallback]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    const res = await generateHospinetSummary(hospitals, fieldHosps);
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
          primary={`${fmtInt(facts.lits)} lits`}
          secondary={`${fmtInt(facts.totalHospitals)} éta. · ${fmtInt(facts.totalFieldHospitals)} camp.`}
          tint="blue"
        />
        <KpiCard
          icon={UI_ICONS.beds}
          label={t.hn_kpi_free}
          primary={fmtInt(facts.free)}
          secondary={`${fmtPct(freePct)} · REA ${fmtInt(facts.reaFree)} lib.`}
          tint={kpiFreeTint}
        />
        <KpiCard
          icon={UI_ICONS.alert}
          label={t.hn_kpi_saturated}
          primary={`${facts.saturated} / ${facts.totalHospitals}`}
          secondary={`${facts.tense} tendus · ${facts.relaxed} conf.`}
          tint={kpiSatTint}
        />
        <KpiCard
          icon={UI_ICONS.ambulance}
          label={t.hn_kpi_fleet}
          primary={`${fmtInt(facts.amb)} amb · ${fmtInt(facts.heli)} hel`}
          secondary={`${fmtInt(facts.staff)} pers. médicaux`}
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
            title={expanded === "occ" ? "Fermer le plein écran" : "Agrandir"}
          />
          <div className="mb-2.5 pr-10">
            <div className={sectionTitleCls}>{t.hn_chart_occ}</div>
            <div className={sectionSubtitleCls}>Tous établissements</div>
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
            title={expanded === "svc" ? "Fermer le plein écran" : "Agrandir"}
          />
          <div className="mb-2 pr-10">
            <div>
              <div className={sectionTitleCls}>{t.hn_chart_services}</div>
              <div className={sectionSubtitleCls}>Occupation par service</div>
            </div>
          </div>
          <ServicesBars services={facts.services} />
        </div>

        {/* RÉSEAUX */}
        <div className={`${cardCls} ${cardRelativeWrap}`}>
          <ExpandBtn
            expanded={expanded === "net"}
            onClick={() => setExpanded(expanded === "net" ? null : "net")}
            title={expanded === "net" ? "Fermer le plein écran" : "Agrandir"}
          />
          <div className="mb-2 pr-10">
            <div className={sectionTitleCls}>{t.hn_chart_networks}</div>
            <div className={sectionSubtitleCls}>Militaire · Civil · Catégories</div>
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
            {isFallback ? "Synthèse déterministe" : "Synthèse IA"}
          </div>
          {busy && (
            <span className="text-[10px] font-semibold text-gray-400">
              · mise à jour en cours…
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
              title="Fermer (Échap)"
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
                    Occupation globale du parc Hospinet
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    {fmtInt(facts.totalHospitals)} éta. permanents · {fmtInt(facts.totalFieldHospitals)} hôpitaux de campagne
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
                        { label: "Confortables", val: facts.relaxed, max: facts.totalHospitals, tint: "bg-green-500" },
                        { label: "En tension", val: facts.tense, max: facts.totalHospitals, tint: "bg-or-500" },
                        { label: "Saturés", val: facts.saturated, max: facts.totalHospitals, tint: "bg-danger-500" },
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
                        Répartition occupation globale
                      </div>
                      <div className="space-y-1 text-[12px]">
                        <Row label={`Lits totaux`} val={fmtInt(facts.lits)} tint="text-gray-900 dark:text-white" />
                        <Row label={`Lits occupés (${fmtPct(facts.pct)})`} val={fmtInt(facts.occ)} tint="text-or-600 dark:text-or-400" />
                        <Row label={`Lits libres (${fmtPct(100 - facts.pct)})`} val={fmtInt(facts.free)} tint="text-green-700 dark:text-green-400" />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={`Lits REA totaux`} val={fmtInt(facts.rea)} tint="text-gray-900 dark:text-white" />
                        <Row label={`REA occupés (${fmtPct(facts.reaPct)})`} val={fmtInt(facts.reaOcc)} tint="text-or-600 dark:text-or-400" />
                        <Row label={`REA libres`} val={fmtInt(facts.reaFree)} tint="text-green-700 dark:text-green-400" />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label={`Hôpitaux de campagne`} val={`${fmtInt(facts.fieldHosps.count)} éta. · ${fmtInt(facts.fieldHosps.free)} lits lib.`} tint="text-blue-700 dark:text-blue-300" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  Données agrégées ARGOS ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">fermer</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">Échap</kbd>
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
                    Occupation détaillée par service médical
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    Les 5 services clés · Pondérations identiques à la vue détail hôpital
                  </p>
                </header>

                <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                  <ServicesBars services={facts.services} big />
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm text-[12px] dark:border-rdia-500 dark:bg-rdia-800">
                  <table className="w-full text-left text-gray-800 dark:text-rdia-100">
                    <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wider text-gray-500 dark:bg-rdia-700 dark:text-rdia-300">
                      <tr>
                        <th className="px-3.5 py-2 font-bold">Service</th>
                        <th className="px-3 py-2 text-right font-bold">Tot.</th>
                        <th className="px-3 py-2 text-right font-bold">Occ.</th>
                        <th className="px-3 py-2 text-right font-bold">Lib.</th>
                        <th className="px-3 py-2 text-right font-bold">Occupation</th>
                        <th className="px-3.5 py-2 text-right font-bold">État</th>
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
                            }>{occLabel(s.pct)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  Données agrégées ARGOS ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">fermer</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">Échap</kbd>
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
                    Réseaux Militaire & Civil · Catégories
                  </h1>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-rdia-200">
                    Détail par réseau · Catégories CHU · CHR · CH · Militaire
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
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-300">Réseau</div>
                            <div className="text-[16px] font-extrabold text-gray-900 dark:text-white">{n.reseau === "militaire" ? "Militaire" : "Civil"}</div>
                          </div>
                        </div>
                        <span className={occChip(n.pct)}>{occLabel(n.pct)}</span>
                      </div>
                      <div className="mt-2.5 space-y-1 text-[12px]">
                        <Row label="Établissements" val={fmtInt(n.hospitals)} tint="text-gray-900 dark:text-white" />
                        <Row label="Lits totaux" val={fmtInt(n.lits)} tint="text-gray-900 dark:text-white" />
                        <Row label="Lits occupés" val={fmtInt(n.occ)} tint="text-or-600 dark:text-or-400" />
                        <Row label="Taux occupation" val={fmtPct(n.pct)} tint={n.pct >= 92 ? "text-danger-700 dark:text-danger-300" : n.pct >= 75 ? "text-or-600 dark:text-or-400" : "text-green-700 dark:text-green-400"} />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label="REA · libres" val={`${fmtInt(n.reaFree)} / ${fmtInt(n.rea)}`} tint="text-green-700 dark:text-green-400" />
                        <Row label="REA · occ." val={fmtPct(n.reaPct)} tint={n.reaPct >= 92 ? "text-danger-700 dark:text-danger-300" : n.reaPct >= 75 ? "text-or-600 dark:text-or-400" : "text-green-700 dark:text-green-400"} />
                        <div className="my-0.5 h-px bg-gray-200 dark:bg-rdia-600" />
                        <Row label="Ambulances" val={fmtInt(n.amb)} tint="text-blue-700 dark:text-blue-400" />
                        <Row label="Hélicoptères" val={fmtInt(n.heli)} tint="text-blue-700 dark:text-blue-400" />
                        <Row label="Effectif médical" val={`${fmtInt(n.staff)} pers.`} tint="text-gray-900 dark:text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Catégories établissements */}
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-sm dark:border-rdia-500 dark:bg-rdia-800">
                  <div className="border-b border-gray-200 px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:border-rdia-600 dark:text-rdia-300">
                    Catégories d'établissements permanents
                  </div>
                  <div className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 dark:divide-rdia-600">
                    {facts.kinds.slice(0, 4).map((k) => (
                      <div key={k.kind ?? k.label} className="flex items-center justify-between gap-3 px-3.5 py-2 hover:bg-white dark:hover:bg-rdia-700/50">
                        <div className="flex min-w-0 items-center gap-2">
                          <div className="h-3.5 w-3.5 shrink-0 rounded-md shadow-inner" style={{ background: k.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-[12px] font-bold text-gray-900 dark:text-white">{k.label}</div>
                            <div className="text-[10.5px] text-gray-500 dark:text-rdia-300">{fmtInt(k.lits)} lits · {fmtPct(k.pct)} occ.</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[15px] font-extrabold tabular-nums text-gray-900 dark:text-white">{fmtInt(k.count)}</div>
                          <div className="text-[10px] text-gray-500 dark:text-rdia-300">établ.</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-0 text-center text-[10.5px] text-gray-400 dark:text-rdia-300">
                  Données agrégées ARGOS ·{" "}
                  <button type="button" onClick={() => setExpanded(null)} className="font-semibold text-gray-800 underline-offset-2 hover:underline dark:text-white">fermer</button>
                  {" "}· touche <kbd className="rounded border border-gray-200 bg-white px-1 py-0.5 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-100">Échap</kbd>
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

// Row label/value inside overlay (theme-aware)
function Row({
  label,
  val,
  tint,
}: {
  label: string;
  val: string;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="text-[12px] font-medium text-gray-500 dark:text-rdia-300">{label}</div>
      <div className={`tabular-nums font-bold ${tint}`}>{val}</div>
    </div>
  );
}
