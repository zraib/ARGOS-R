"use client";

import { useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { headProgress, type SpreadPoiKind, type SpreadRun } from "@/lib/sim/spread";

// ============================================================================
// Pièces communes aux panneaux de simulation de la carte (crues, feux) : un
// réglage qui se tape ou se glisse, le lecteur (lire / pause / rejouer,
// horloge simulée, curseur), la liste des points atteints avec leur heure,
// et deux formats. Un seul style pour deux aléas : l'œil ne réapprend rien.
// ============================================================================

export const lbl = "text-[10px] font-bold uppercase tracking-wider text-white/60";

/** « 13 500 », « 245 », « 36.3 » — un nombre lisible selon sa taille (espace fine insécable aux milliers). */
export function nombre(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return n.toFixed(1);
}

/** Heures et minutes d'une durée simulée, pour l'horloge « t + 2 h 35 ». */
export function hm(seconds: number): { h: number; m: string } {
  const total = Math.max(0, Math.round(seconds / 60));
  return { h: Math.floor(total / 60), m: String(total % 60).padStart(2, "0") };
}

/** Un réglage numérique : la valeur se tape ou se glisse. */
export function Reglage({
  label, value, unit, min, max, step, onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const poser = (raw: string) => {
    const v = Number(raw);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between gap-2">
        <span className={lbl}>{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => poser(e.target.value)}
            className="w-24 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-end font-mono text-[11.5px] text-white"
            aria-label={label}
          />
          <span className="w-9 text-[11px] text-white/60">{unit}</span>
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => poser(e.target.value)} className="w-full accent-or-500" aria-hidden="true" tabIndex={-1} />
    </label>
  );
}

/**
 * Le lecteur d'une course : lire / pause / rejouer, l'horloge simulée
 * « t + 2 h 35 », l'avancement du calcul tant qu'il court, le curseur — le
 * tirer met en pause à l'instant choisi, jamais au-delà de ce qui est calculé.
 */
export function Lecteur({
  run, progress, playing, onToggle, onSeek,
}: {
  run: SpreadRun;
  progress: number;
  playing: boolean;
  onToggle: () => void;
  onSeek: (p: number) => void;
}) {
  const t = useDict();
  const pct = Math.round(progress * 100);
  const tete = Math.round(headProgress(run) * 100);
  const horloge = tpl(t.sim_clock, hm(progress * run.horizonS));
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? t.sim_pause : pct >= 100 ? t.sim_replay : t.sim_play}
        title={playing ? t.sim_pause : pct >= 100 ? t.sim_replay : t.sim_play}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-or-500 text-rdia-900 transition-colors hover:bg-or-400 lg:h-9 lg:w-9"
      >
        <Icon path={playing ? UI_ICONS.pause : pct >= 100 ? UI_ICONS.refresh : UI_ICONS.play} size={16} strokeWidth={2.2} />
      </button>
      <label className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] font-bold text-white">{horloge}</span>
          <span className="font-mono text-[10.5px] text-white/55">{!run.done && !run.aborted ? tpl(t.sim_computing, { pct: tete }) : `${pct} %`}</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          aria-label={t.sim_progress}
          onChange={(e) => onSeek(Math.min(Number(e.target.value) / 100, headProgress(run)))}
          className="w-full accent-or-500"
        />
      </label>
    </div>
  );
}

/** Les points atteints par le phénomène, avec l'heure ; ceux que l'instant lu n'a pas encore atteints restent en retrait. */
export function Impacts({ run, tSim }: { run: SpreadRun; tSim: number }) {
  const t = useDict();
  const kindLabel: Record<SpreadPoiKind, string> = { hospital: t.sim_hospitals, unit: t.sim_units, shelter: t.sim_shelters, city: t.sim_cities };
  return (
    <>
      <div className={lbl}>{t.sim_impacts}</div>
      {run.impacts.length === 0 ? (
        <p className="text-[11px] text-white/50">{t.sim_none_hit}</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-[11.5px]">
          {run.impacts.map((i) => {
            const { h, m } = hm(i.reachedAt);
            return (
              <li key={i.id} className={`flex items-baseline justify-between gap-2 ${i.reachedAt > tSim ? "opacity-45" : ""}`}>
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-or-300">{kindLabel[i.kind]}</span>
                  <span className="text-white/80"> · {i.nom}</span>
                </span>
                <span className="shrink-0 font-mono text-[10.5px] text-white/60">{tpl(t.sim_reached_at, { t: `${h} h ${m}` })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
