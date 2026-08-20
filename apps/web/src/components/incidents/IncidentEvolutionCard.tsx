"use client";

import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { IncidentEvolution, EvolutionTrend } from "@/lib/ai/risk/incidentEvolution";
import type { RiskLevel } from "@/lib/ai/risk/types";

const LEVEL_BADGE: Record<RiskLevel, { type: "high" | "medium" | "on_hold" | "low" | "active"; label: string }> = {
  critique: { type: "high", label: "CRITIQUE" },
  eleve: { type: "medium", label: "ÉLEVÉ" },
  modere: { type: "on_hold", label: "MODÉRÉ" },
  faible: { type: "active", label: "FAIBLE" },
};

const LEVEL_TEXT: Record<RiskLevel, string> = {
  critique: "text-danger-500",
  eleve: "text-or-500",
  modere: "text-amber-500",
  faible: "text-green-600 dark:text-green-400",
};

const LEVEL_BAR: Record<RiskLevel, string> = {
  critique: "bg-danger-500",
  eleve: "bg-or-500",
  modere: "bg-amber-500",
  faible: "bg-green-500",
};

const TREND_BADGE: Record<EvolutionTrend, { type: "high" | "medium" | "active"; icon: string; label: string }> = {
  aggravation: { type: "high", icon: UI_ICONS.alert, label: "Aggravation" },
  stable: { type: "medium", icon: UI_ICONS.scale, label: "Stable" },
  amelioration: { type: "active", icon: UI_ICONS.check, label: "Amélioration" },
};

const H_MIN = (m: number): string => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2, "0")}`;
};

/**
 * Carte Évolution IA — 2 modes, minimaliste et lisible :
 *  - compact : ligne tableau (score + niveau + tendance)
 *  - full    : fiche — score, prob, horizon, scénario, top signaux, 3 actions
 */
export function IncidentEvolutionCard({ ev, compact }: { ev: IncidentEvolution; compact?: boolean }) {
  const lb = LEVEL_BADGE[ev.level];
  const tb = TREND_BADGE[ev.trend];
  const lvTxt = LEVEL_TEXT[ev.level];
  const lvBar = LEVEL_BAR[ev.level];
  const scoreClean = Math.round(ev.score);

  if (compact) {
    return (
      <div className="flex flex-col gap-1 py-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`font-mono text-[11px] font-bold ${lvTxt}`}>{scoreClean}/100</span>
          <Badge type={lb.type} label={lb.label} />
        </div>
        <div className="flex items-center gap-1">
          <Icon path={tb.icon} size={10} className={lvTxt} />
          <span className="text-[10px] text-gray-500 dark:text-rdia-300">{tb.label}</span>
        </div>
      </div>
    );
  }

  // Top 3 signaux qui tirent le score (les plus utiles à lire).
  const topSignals = [...ev.factors]
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white/70 p-5 dark:border-rdia-600/50 dark:bg-rdia-800/30">
      {/* ==== BLOC SYNTHÈSE (en-tête) ==== */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start leading-none">
            <div className={`font-mono text-[28px] font-bold leading-none ${lvTxt}`}>{scoreClean}</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">/ 100</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Badge type={lb.type} label={lb.label} />
            <div className="flex items-center gap-1.5">
              <Icon path={tb.icon} size={11} className={lvTxt} />
              <span className="text-[11px] font-medium text-gray-700 dark:text-rdia-200">{tb.label}</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-[12px]">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">Probabilité</div>
          <div className={`font-mono font-bold ${ev.probabilityPct >= 65 ? "text-danger-500" : ev.probabilityPct >= 40 ? "text-or-500" : "text-green-600 dark:text-green-400"}`}>{Math.round(ev.probabilityPct)}%</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">Horizon</div>
          <div className="font-mono font-semibold text-gray-800 dark:text-rdia-50">{H_MIN(ev.horizonMin)}</div>
        </div>
      </div>

      {/* ==== JAUGE COURTE ==== */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200/70 dark:bg-rdia-600/40">
        <div className={`h-full rounded-full ${lvBar} transition-all`} style={{ width: `${Math.max(2, ev.score)}%` }} />
      </div>

      {/* ==== SCÉNARIO (1 phrase) ==== */}
      <p className="text-[13px] leading-relaxed text-gray-700 dark:text-rdia-100">{ev.scenario}</p>

      {/* ==== DÉTAIL DES 9 FACTEURS (visible en modale uniquement) ==== */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
          Détail des signaux
        </div>
        <div className="flex flex-col gap-1.5">
          {ev.factors.map((f) => {
            const pct = Math.round(f.rawScore * 100);
            return (
              <div key={f.label} className="flex items-start gap-2 rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-700/30">
                <span className="flex-1 text-[11.5px] leading-snug text-gray-700 dark:text-rdia-150">{f.label}</span>
                <div className="mt-1 h-1.5 w-[100px] shrink-0 overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600/40">
                  <div
                    className={`h-full rounded-full ${pct >= 75 ? "bg-danger-500" : pct >= 50 ? "bg-or-500" : pct >= 25 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <span className="mt-0.5 w-10 shrink-0 text-right font-mono text-[11px] text-gray-500 dark:text-rdia-300">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==== 3 ACTIONS RECOMMANDÉES ==== */}
      <div>
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
          Actions recommandées
        </div>
        <ol className="flex flex-col gap-1.5">
          {ev.actions.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 dark:bg-rdia-700/30">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? "bg-danger-500/20 text-danger-600 dark:text-danger-400" : i === 1 ? "bg-or-500/20 text-or-600 dark:text-or-400" : "bg-blue-500/20 text-blue-600 dark:text-blue-400"}`}>{i + 1}</span>
              <span className="text-[12px] leading-snug text-gray-800 dark:text-rdia-50">{a}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
