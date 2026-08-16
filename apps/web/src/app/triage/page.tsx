"use client";

import { useArgos, useDict, useModules } from "@/lib/store";
import { type TriageColor } from "@/lib/data/modules";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";

const COLORS: Record<TriageColor, { hex: string; ring: string; key: "red" | "yellow" | "green" | "black" }> = {
  red: { hex: "#EF4444", ring: "ring-danger-500/30", key: "red" },
  yellow: { hex: "#F59E0B", ring: "ring-amber-500/30", key: "yellow" },
  green: { hex: "#10B981", ring: "ring-green-500/30", key: "green" },
  black: { hex: "#4B5563", ring: "ring-gray-500/30", key: "black" },
};
const ORDER: TriageColor[] = ["red", "yellow", "green", "black"];

export default function TriagePage() {
  const catalog = useArgos((s) => s.catalog);
  const TRIAGE_ZONES = catalog.triageZones;
  const TRIAGE_FLOW = catalog.triageFlow;
  const VICTIMS = catalog.victims;
  const m = useModules();
  const t = useDict();
  const totals = ORDER.reduce((acc, c) => {
    acc[c] = TRIAGE_ZONES.reduce((s, z) => s + z[c], 0);
    return acc;
  }, {} as Record<TriageColor, number>);
  const totalVictims = ORDER.reduce((s, c) => s + totals[c], 0);

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Compteurs couleur START/SALT */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {ORDER.map((c) => {
          const cfg = COLORS[c];
          return (
            // `borderInlineStart` et non `borderLeft` : le liseré passe à droite en arabe.
            <div key={c} className="carte flex items-center gap-3 p-3 sm:gap-4 sm:p-4" style={{ borderInlineStart: `4px solid ${cfg.hex}` }}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white sm:h-12 sm:w-12" style={{ backgroundColor: cfg.hex }}>
                {totals[c]}
              </div>
              <div className="min-w-0">
                <div className="break-words text-xs font-semibold text-gray-700 dark:text-rdia-100">{m.triage[cfg.key]}</div>
                <div className="text-xs text-gray-400 dark:text-rdia-400 md:text-[10px]">{Math.round((totals[c] / totalVictims) * 100)}%</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tableau de flux des victimes */}
      <div className="carte p-4 sm:p-5">
        <h3 className="mb-4 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.triage.flow}</h3>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          {[
            { label: m.triage.flow_site, value: TRIAGE_FLOW.site, tint: "text-or-500" },
            { label: m.triage.flow_evac, value: TRIAGE_FLOW.evac, tint: "text-blue-500" },
            { label: m.triage.flow_hosp, value: TRIAGE_FLOW.hospital, tint: "text-green-600" },
          ].map((stage, i, arr) => (
            <div key={stage.label} className="flex flex-1 items-center gap-3">
              <div className="min-w-0 flex-1 rounded-lg bg-gray-50 p-4 text-center dark:bg-rdia-800/50">
                <div className={`text-3xl font-bold tabular-nums ${stage.tint}`}>{stage.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-gray-400 dark:text-rdia-400 md:text-[10px]">{stage.label}</div>
              </div>
              {/* Étapes empilées sous `sm` : la flèche horizontale n'a plus de sens
                  (et son orientation RTL deviendrait fausse) — pure décoration, retirée. */}
              {i < arr.length - 1 && (
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="hidden shrink-0 text-gray-300 dark:text-rdia-600 sm:block rtl:rotate-180">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Détail par zone */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.triage.zones}</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TRIAGE_ZONES.map((z) => {
            const zTotal = ORDER.reduce((s, c) => s + z[c], 0);
            return (
              <div key={z.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                  <h4 className="min-w-0 break-words text-sm font-bold text-rdia-600 dark:text-rdia-50">{z.name}</h4>
                  <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-rdia-400">{zTotal} {m.triage.kpi_victims.toLowerCase()}</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                  {ORDER.map((c) => z[c] > 0 && <div key={c} style={{ backgroundColor: COLORS[c].hex, width: `${(z[c] / zTotal) * 100}%` }} />)}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {ORDER.map((c) => (
                    <div key={c} className="text-center">
                      <div className="text-base font-bold tabular-nums" style={{ color: COLORS[c].hex }}>{z[c]}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Victimes récentes — tableau : à partir de `md`, la densité redevient lisible. */}
      <div className="hidden md:block">
        <Table headers={[m.triage.col_tag, m.triage.col_category, m.common.zone, t.sort_time, m.triage.col_destination]}>
          {VICTIMS.map((v) => (
            <tr key={v.tag} className={TR}>
              <td className={TD_MONO}>{v.tag}</td>
              <td className={TD}>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[v.color].hex }} />
                  <span className="text-xs font-medium text-gray-700 dark:text-rdia-100">{m.triage[COLORS[v.color].key]}</span>
                </span>
              </td>
              <td className={TD_MUTED}>{v.zone}</td>
              <td className={TD_MONO}>{v.time}</td>
              <td className={TD_STRONG}>{v.destination}</td>
            </tr>
          ))}
        </Table>
      </div>

      {/* Sous `md` : une carte par victime — mêmes colonnes, rien de perdu. */}
      <div className="flex flex-col gap-2 md:hidden">
        {VICTIMS.map((v) => (
          <div key={v.tag} className="carte flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 truncate font-mono text-sm font-semibold text-gray-800 dark:text-rdia-50">{v.tag}</span>
              <span className="inline-flex shrink-0 items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[v.color].hex }} />
                <span className="text-xs font-medium text-gray-700 dark:text-rdia-100">{m.triage[COLORS[v.color].key]}</span>
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <Champ label={m.common.zone} value={v.zone} />
              <Champ label={t.sort_time} value={v.time} mono />
              <Champ label={m.triage.col_destination} value={v.destination} />
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Couple libellé/valeur d'une carte mobile (équivalent d'une cellule du tableau). */
function Champ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className={`break-words text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
