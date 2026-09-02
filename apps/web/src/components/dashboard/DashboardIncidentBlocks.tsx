// =========================================================================
// Blocs incidents · PARTAGÉS entre Dashboard (ops) et Dashboard (future)
// -------------------------------------------------------------------------
//  - IncidentTypeBars : répartition par catégorie (barres horizontales,
//    palette ARGOS dédiée, cliquable → ouvre 1er incident de la catégorie)
//  - IncidentRows    : liste cliquable d'incidents tri, ouvre modale
//  - IncidentsPanel  : BLOC UNIQUE FUSIONNÉ · anneau donut + légende
//    (filtre interactif par catégorie) + liste incidents triée en dessous
// =========================================================================

import { useMemo, useState } from "react";
import type { Incident, IncidentTypeDef, Lang } from "@/lib/types";
import type { Dict } from "@/lib/i18n/translations";
import type { ChartDatum } from "@/components/charts/ChartCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { sevBadge, stBadge, typeLabel } from "@/lib/helpers";
import { UI_ICONS } from "@/lib/icons";
import { Icon } from "@/components/ui/Icon";
import { compareIncidentDate, formatIncidentHour, incidentColor, INCIDENT_TYPE_COLORS } from "@/lib/derive";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// Palette classes CSS (badge fill + text) — gardées pour les badges
// qui préfèrent les classes que l'hex inline
const TYPE_CLASS: Record<string, { fill: string; text: string }> = {
  earthquake: { fill: "bg-danger-400", text: "text-danger-700 dark:text-danger-400" },
  flood:      { fill: "bg-blue-500",   text: "text-blue-700 dark:text-blue-400" },
  wildfire:   { fill: "bg-or-500",     text: "text-or-700 dark:text-or-400" },
  landslide:  { fill: "bg-yellow-600 dark:bg-yellow-500", text: "text-yellow-800 dark:text-yellow-400" },
  epidemic:   { fill: "bg-pink-500",   text: "text-pink-700 dark:text-pink-400" },
  industrial: { fill: "bg-purple-500", text: "text-purple-700 dark:text-purple-400" },
};
const FALLBACK_CLASS = { fill: "bg-rdia-500", text: "text-rdia-700 dark:text-rdia-300" };

export function typeClass(type: string) {
  const cls = TYPE_CLASS[type] ?? FALLBACK_CLASS;
  return { ...cls, hex: incidentColor(type) };
}

export function typeHex(type: string): string {
  return INCIDENT_TYPE_COLORS[type] ?? incidentColor(type);
}

// Barre horizontale unique (toute la largeur du parent)
function Bar({ value, max = 100, fill, className }: {
  value: number; max?: number; fill: string; className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentTypeBars — répartition par catégorie, jusqu'à 6 lignes, cliquable
// ---------------------------------------------------------------------------
export function IncidentTypeBars({
  incidents, types, lang, onSelectType,
}: {
  incidents: Incident[];
  types: IncidentTypeDef[];
  lang: Lang;
  onSelectType: (type: string) => void;
}) {
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of incidents) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    return [...counts.entries()]
      .map(([k, n]) => ({
        type: k,
        label: typeLabel(k, types, lang),
        n,
        meta: TYPE_CLASS[k] ?? FALLBACK_CLASS,
      }))
      .sort((a, b) => b.n - a.n);
  }, [incidents, types, lang]);

  if (!rows.length) {
    return <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-rdia-400">Aucun incident</div>;
  }
  const max = Math.max(...rows.map((r) => r.n), 1);
  const show = rows.slice(0, 8);
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto pe-1 w-full min-w-0">
      {show.map((r) => (
        <button
          key={r.type}
          type="button"
          onClick={() => onSelectType(r.type)}
          className="group flex flex-col gap-1 rounded-md border border-gray-200/70 bg-white/60 px-2 py-1.5 text-left transition hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-rdia-600 min-w-0"
        >
          <div className="flex items-center gap-1.5 w-full min-w-0">
            <span className={cn("shrink-0 h-1.5 w-1.5 rounded-full", r.meta.fill)} />
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold leading-snug text-gray-800 dark:text-rdia-100">
              {r.label}
            </span>
            <span className="shrink-0 font-mono text-[11px] font-black tabular-nums leading-none text-gray-900 dark:text-rdia-50">
              {r.n}
            </span>
          </div>
          <Bar value={(r.n / max) * 100} className="h-1.5" fill={r.meta.fill} />
        </button>
      ))}
      {rows.length > show.length && (
        <p className="shrink-0 text-right text-[10px] font-semibold text-gray-400 dark:text-rdia-400 leading-none">
          +{rows.length - show.length} autre(s) catégorie(s)
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentRows — liste d'incidents triés (statut → sévérité → date)
// ---------------------------------------------------------------------------
export function IncidentRows({
  incidents, types, lang, t, onOpen,
}: {
  incidents: Incident[];
  types: IncidentTypeDef[];
  lang: Lang;
  t: Dict;
  onOpen: (i: Incident) => void;
}) {
  const sorted = useMemo(
    () =>
      [...incidents]
        .sort((a, b) => {
          const sw = (s: Incident["st"]) => (s === "open" ? 0 : s === "prog" ? 1 : 2);
          const sew = (s: Incident["sev"]) => (s === "high" ? 0 : s === "medium" ? 1 : 2);
          return (sw(a.st) - sw(b.st)) || (sew(a.sev) - sew(b.sev)) || compareIncidentDate(a, b);
        }),
    [incidents],
  );
  if (!sorted.length) {
    return <div className="flex h-full items-center justify-center text-xs text-gray-400 dark:text-rdia-400">Aucun incident signalé</div>;
  }
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto pe-1 w-full min-w-0">
      {sorted.map((i) => {
        const sev = sevBadge(i.sev, t);
        const stP = stBadge(i.st, t);
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => onOpen(i)}
            className="group flex shrink-0 items-center gap-2 rounded-md border border-gray-200/70 bg-white/60 px-2 py-1.5 text-left transition hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-rdia-600 min-w-0"
          >
            <span className={cn(
              "shrink-0 h-2 w-2 rounded-full",
              sev.type === "high" ? "bg-danger-500" : sev.type === "medium" ? "bg-or-500" : "bg-green-500",
            )} />
            <div className="min-w-0 flex-1 flex flex-col gap-0.5">
              <div className="truncate text-[11.5px] font-extrabold leading-snug text-gray-900 dark:text-rdia-50">
                {i.titre}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9.5px] font-semibold text-gray-500 dark:text-rdia-400">
                  {typeLabel(i.type, types, lang)}
                </span>
                <span className="text-[9px] text-gray-400">·</span>
                <span className="text-[9.5px] text-gray-500 dark:text-rdia-400">{i.region}</span>
                <span className="text-[9px] text-gray-400">·</span>
                <span className="text-[9px] text-gray-400 font-mono tabular-nums">
                  {formatIncidentHour(i)}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex items-center gap-1">
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                  stP.type === "completed"
                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                    : stP.type === "active"
                    ? "bg-rdia-500/10 text-rdia-600 dark:text-rdia-300"
                    : "bg-or-500/10 text-or-600 dark:text-or-400",
                )}
              >
                {stP.label}
              </span>
              <Icon path={UI_ICONS.chevronRight} size={12} className="text-gray-400 group-hover:text-rdia-500 dark:group-hover:text-rdia-300 transition" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IncidentsPanel — BLOC UNIQUE FUSIONNÉ (graphe sophistiqué + liste)
// ---------------------------------------------------------------------------
export function IncidentsPanel({
  incidents, types, lang, t, onOpen, filterType, onFilterChange,
}: {
  incidents: Incident[];
  types: IncidentTypeDef[];
  lang: Lang;
  t: Dict;
  onOpen: (i: Incident) => void;
  /** Filtre catégorie contrôlé (lifté au parent DashboardPage) ; null = aucun filtre */
  filterType?: string | null;
  /** Callback de changement du filtre catégorie */
  onFilterChange?: (type: string | null) => void;
}) {
  const [localFilter, setLocalFilter] = useState<string | null>(null);
  const filter = filterType !== undefined ? filterType : localFilter;
  const setFilter = (v: string | null) => {
    if (onFilterChange) onFilterChange(v); else setLocalFilter(v);
  };

  const { rows, donut, total } = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of incidents) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    const raw = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const rowsArr = raw.map(([k, n]) => ({
      type: k,
      label: typeLabel(k, types, lang),
      n,
      hex: incidentColor(k),
      cls: typeClass(k),
    }));
    const donutArr: ChartDatum[] = rowsArr.map((r) => ({
      label: r.label,
      value: r.n,
      couleur: r.hex,
    }));
    return {
      rows: rowsArr,
      donut: donutArr,
      total: rowsArr.reduce((acc, d) => acc + d.n, 0),
    };
  }, [incidents, types, lang]);

  const filtered = useMemo(
    () => (filter ? incidents.filter((i) => i.type === filter) : incidents),
    [incidents, filter],
  );

  const stCount = useMemo(() => ({
    open: incidents.filter((i) => i.st === "open").length,
    prog: incidents.filter((i) => i.st === "prog").length,
    closed: incidents.filter((i) => i.st === "closed").length,
  }), [incidents]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      {/* ==========================================================
          ZONE HAUTE · REPARTITION PAR CATEGORIE (style command-panel)
          ========================================================== */}
      <div className="relative flex min-h-0 shrink-0 flex-col gap-3 overflow-hidden rounded-xl border border-gray-200/70 bg-gradient-to-br from-white via-white to-gray-50 p-3 dark:border-white/10 dark:from-rdia-800/40 dark:via-rdia-800/20 dark:to-rdia-900/30 md:flex-row">
        {/* ==== Coin déco · LIVE corner ==== */}
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-rdia-400">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger-500" />
          </span>
          {t.dash_by_type ?? "Répartition"}
        </div>
        <div className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 text-[9px] font-mono font-bold tabular-nums text-gray-400 dark:text-rdia-400">
          <span className="rounded-sm border border-gray-200 bg-white/80 px-1.5 py-0.5 dark:border-white/10 dark:bg-white/5">
            {String(total).padStart(3, "0")} INC
          </span>
        </div>

        {/* ==== COLONNE GAUCHE · DONUT ENRICHED ==== */}
        <div className="mt-3 min-h-0 shrink-0 md:mt-4 md:w-[38%]">
          <div className="relative flex h-full items-center justify-center">
            {donut.length > 0 ? (
              <div className="relative w-full max-w-[200px]">
                <DonutChart titre="" data={donut} bare />
                {/* overlay anneau extérieur · déco */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full ring-1 ring-gray-200/60 dark:ring-white/5" />
                </div>
                {/* ==== Légende ring-bottom ==== */}
                <div className="mt-1 flex items-center justify-between gap-1 px-2 text-[9.5px] text-gray-500 dark:text-rdia-300/90">
                  <span className="font-mono font-bold tabular-nums">TOP-{Math.min(6, rows.length)}</span>
                  <span className="font-semibold">
                    {rows[0]?.label ?? "-"}
                    <span className="mx-1 text-gray-300 dark:text-rdia-700">·</span>
                    <span className="font-mono tabular-nums">{rows[0] ? Math.round((rows[0].n / Math.max(1, total)) * 100) : 0}%</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-gray-400 dark:text-rdia-400">
                Aucune donnée
              </div>
            )}
          </div>
        </div>

        {/* ==== COLONNE DROITE · CARDS CATEGORIES + KPIs STATUT ==== */}
        <div className="min-w-0 flex-1 flex flex-col gap-2.5">
          {/* reset filter button — military chip */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 dark:text-rdia-400">
              Catégories
            </span>
            <button
              type="button"
              onClick={() => setFilter(null)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-[9.5px] font-black uppercase tracking-wider transition-all duration-200",
                filter === null
                  ? "border-rdia-500/70 bg-rdia-500 text-white shadow-[0_0_0_3px_rgba(75,85,99,0.08)] dark:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
                  : "border-gray-200 bg-white/80 text-gray-600 hover:border-gray-300 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-rdia-300 dark:hover:border-rdia-500/50 dark:hover:bg-white/10",
              )}
            >
              ◉ TOUS · {total}
            </button>
          </div>

          {/* — Catégories cards grid : 2 colonnes, chaque carte = pastille + label + barre + % — */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {rows.slice(0, 6).map((r) => {
              const active = filter === r.type;
              const pct = Math.round((r.n / Math.max(1, total)) * 100);
              return (
                <button
                  key={r.type}
                  type="button"
                  onClick={() => setFilter(active ? null : r.type)}
                  className={cn(
                    "group relative flex items-center gap-2 rounded-lg border p-2 text-left transition-all duration-200",
                    active
                      ? "border-transparent text-white shadow-md scale-[1.02]"
                      : "border-gray-200/70 bg-white/70 text-gray-800 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-rdia-100 dark:hover:border-rdia-500/40",
                  )}
                  style={active ? { backgroundColor: r.hex, boxShadow: `0 6px 20px -8px ${r.hex}aa` } : undefined}
                >
                  {/* barre verticale couleur */}
                  <span
                    className={cn(
                      "h-full w-1 shrink-0 self-stretch rounded-full transition-all",
                    )}
                    style={!active ? { backgroundColor: r.hex, opacity: 0.75 } : { backgroundColor: "rgba(255,255,255,0.85)" }}
                  />
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-extrabold leading-none">
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-black tabular-nums leading-none",
                        )}
                        style={
                          active
                            ? { backgroundColor: "rgba(255,255,255,0.2)", color: "white" }
                            : { backgroundColor: `${r.hex}15`, color: r.hex }
                        }
                      >
                        {r.n}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                        )}
                        style={
                          active
                            ? { backgroundColor: "rgba(255,255,255,0.8)", width: `${pct}%` }
                            : { backgroundColor: r.hex, width: `${pct}%`, opacity: 0.85 }
                        }
                      />
                      <div
                        className="absolute inset-y-0 left-0 w-full rounded-full"
                        style={
                          active
                            ? { backgroundColor: "rgba(255,255,255,0.08)" }
                            : { backgroundColor: "currentColor", opacity: 0.05 }
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-[9px] font-bold tabular-nums",
                          active ? "text-white/90" : "text-gray-500 dark:text-rdia-400",
                        )}
                      >
                        {pct}%
                      </span>
                      {active && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-white/90">
                          ● FILTRÉ
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ==== KPIs statuts ==== */}
          <div className="mt-0.5 grid grid-cols-3 gap-2 overflow-hidden rounded-lg border border-gray-200/60 bg-gray-50/60 p-1.5 dark:border-white/10 dark:bg-white/[0.03]">
            {[
              { k: "open" as const,  label: "Ouverts",     hex: "#EF4444", n: stCount.open,  glyph: "▲" },
              { k: "prog" as const,  label: "Progression", hex: "#F59E0B", n: stCount.prog,  glyph: "◆" },
              { k: "closed" as const,label: "Clôturés",    hex: "#10B981", n: stCount.closed,glyph: "■" },
            ].map((s) => (
              <div
                key={s.k}
                className="group relative flex flex-col gap-0.5 overflow-hidden rounded-md border border-transparent bg-white/80 px-2 py-1.5 transition-all hover:-translate-y-0.5 hover:shadow-sm dark:bg-white/[0.05]"
                style={{ borderTop: `2px solid ${s.hex}` }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[9.5px] font-black uppercase tracking-wider leading-none"
                    style={{ color: s.hex }}
                  >
                    {s.label}
                  </span>
                  <span
                    className="text-[10px] font-bold leading-none"
                    style={{ color: `${s.hex}99` }}
                  >
                    {s.glyph}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-mono text-[18px] font-black leading-none tabular-nums"
                    style={{ color: s.hex }}
                  >
                    {s.n}
                  </span>
                  <span className="font-mono text-[9.5px] font-bold tabular-nums text-gray-400 dark:text-rdia-400">
                    {total > 0 ? Math.round((s.n / total) * 100) : 0}%
                  </span>
                </div>
                {/* barre de fond proportionnelle */}
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, total > 0 ? (s.n / total) * 100 : 0)}%`,
                      backgroundColor: s.hex,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {rows.length > 6 && (
            <div className="flex items-center justify-between text-[9.5px] font-semibold text-gray-400 dark:text-rdia-400">
              <span>+{rows.length - 6} autre(s) catégorie(s)</span>
              <span className="font-mono tabular-nums">top 6 affiché</span>
            </div>
          )}
        </div>
      </div>

      {/* ==========================================================
          ZONE BASSE · LISTE INCIDENTS
          ========================================================== */}
      <div className="min-h-0 flex-1 flex flex-col gap-1">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1 px-0.5 dark:border-white/5">
          <p className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-rdia-300">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-rdia-500" />
            {filter
              ? `${typeLabel(filter, types, lang)} · ${filtered.length}`
              : `${t.dash_incidents ?? "Incidents"} · ${filtered.length}`}
          </p>
          <div className="flex items-center gap-2 text-[9px] text-gray-400 dark:text-rdia-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-danger-500" />
              OUVERT
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-or-500" />
              PROG
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
              CLOT
            </span>
            {filter && (
              <button
                type="button"
                onClick={() => setFilter(null)}
                className="ml-1 rounded-md border border-gray-200 bg-white/70 px-1.5 py-0.5 font-bold text-gray-600 hover:border-gray-300 hover:text-gray-800 dark:border-white/10 dark:bg-white/5 dark:text-rdia-300 dark:hover:border-rdia-500/50"
              >
                ✕ reset filtre
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <IncidentRows incidents={filtered} types={types} lang={lang} t={t} onOpen={onOpen} />
        </div>
      </div>
    </div>
  );
}
