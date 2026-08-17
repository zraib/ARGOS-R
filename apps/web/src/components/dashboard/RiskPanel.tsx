"use client";

// ========================================================================
// ARGOS · Panel Prédictions de risques à base d'IA — format OPÉRATEUR direct.
//
// Ce que le composant FAIT :
//  - Au montage + CHAQUE FOIS QUE les données de la plateforme CHANGENT
//    (incidents, hopitaux, unités, dashStats) → relance une analyse IA.
//  - Affiche CHAQUE prédiction sous FORMAT CARTE OPÉRATEUR normalisée :
//       🔴 Risque identifié     (level emoji + label)
//       Type : ...              (riskType : Saturation hospitalière, Incendie, etc.)
//       Zone : ...              (zoneLabel)
//       Localisation : ...      (optionnel si locationLabel)
//       Probabilité : XX %
//       Horizon : prochaines XXh
//       Facteurs principaux :
//          · augmentation du nombre de blessés ;
//          · hausse des évacuations sanitaires ;
//          · ...
//       Tendance : ↗ En aggravation  /  → Stable  /  ↘ En amélioration
// ========================================================================
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { useArgos } from "@/lib/store";
import { Pill } from "@/components/ui/Pill";
import {
  levelLabel,
  levelTint,
  probabilityToPercent,
} from "@/lib/ai/risk/types";
import type { RiskHorizon, RiskLevel, RiskPrediction, RiskTrend } from "@/lib/ai/risk/types";

const FILTERS_HORIZON: (RiskHorizon | "all")[] = ["all", "2h", "6h", "24h", "48h"];
const FILTERS_LEVEL: (RiskLevel | "all")[] = ["all", "critique", "eleve", "modere", "faible"];
const HORIZON_ORDER: Record<RiskHorizon, number> = { "2h": 0, "6h": 1, "24h": 2, "48h": 3 };

export function RiskPanel({ bare = false }: { bare?: boolean }) {
  const preds = useArgos((s) => s.riskPredictions);
  const validateRisk = useArgos((s) => s.validateRiskPrediction);
  const dismissRisk = useArgos((s) => s.dismissRiskPrediction);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const recomputeAI = useArgos((s) => s.recomputeRiskPredictionsAI);
  const riskLoadingAI = useArgos((s) => s.riskLoadingAI);

  const incLen = useArgos((s) => s.incidents.length);
  const hosLen = useArgos((s) => s.hospitals.length);
  const uniLen = useArgos((s) => s.units.length);
  const evoHash = useArgos((s) =>
    s.dashStats ? `${s.dashStats.evolution.length}:${s.dashStats.status.open}:${s.dashStats.status.prog}` : "",
  );

  const [fHorizon, setFHorizon] = useState<RiskHorizon | "all">("all");
  const [fLevel, setFLevel] = useState<RiskLevel | "all">("all");
  const [showDismissed, setShowDismissed] = useState(false);

  // 🔥 MÀJ AUTOMATIQUE : à l'ouverture + chaque modification des données.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await recomputeAI();
      } catch {
        /* fallback déterministe déjà appliqué en interne ; aucune erreur UI */
        void cancelled;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incLen, hosLen, uniLen, evoHash]);

  const filtered = useMemo(() => {
    const nonDismissed = preds.filter((p) => !p.dismissed || showDismissed);
    const f = nonDismissed.filter((p) => {
      if (fHorizon !== "all" && p.horizon !== fHorizon) return false;
      if (fLevel !== "all" && p.level !== fLevel) return false;
      return true;
    });
    f.sort((a, b) => {
      const ho = HORIZON_ORDER[a.horizon] - HORIZON_ORDER[b.horizon];
      if (ho !== 0) return ho;
      return b.score - a.score;
    });
    return f;
  }, [preds, fHorizon, fLevel, showDismissed]);

  // --- Section titre (EXACTEMENT l'intro demandée)
  const intro = (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-or-500/20 to-red-500/15 text-or-500 ring-1 ring-or-500/20 dark:from-or-500/25 dark:to-red-500/20">
          <Icon path={KPI_ICONS.risk} size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-rdia-700 dark:text-rdia-50">
            Prédictions de risques à base d&apos;IA
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {riskLoadingAI ? (
            <span className="flex items-center gap-1.5 rounded-full bg-purple-500/10 px-2.5 py-1 text-[10.5px] font-medium text-purple-600 ring-1 ring-purple-500/20 dark:text-purple-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
              Analyse IA en cours…
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[10.5px] font-medium text-green-600 ring-1 ring-green-500/20 dark:text-green-400">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Données analysées · à jour
            </span>
          )}
          <button
            type="button"
            onClick={() => void recomputeAI()}
            disabled={riskLoadingAI}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-rdia-700/60 dark:hover:text-rdia-100"
            title="Réanalyser les données (modèle IA)"
          >
            <Icon path={UI_ICONS.refresh} size={11} />
            Actualiser
          </button>
        </div>
      </div>
    </div>
  );

  // --- Filtres (horizon / niveau + voir ignorées)
  const filters = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[10.5px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">Horizon</span>
      <div className="flex flex-wrap gap-1">
        {FILTERS_HORIZON.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setFHorizon(h)}
            className={`rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${
              fHorizon === h
                ? "bg-or-500/10 text-or-600 ring-1 ring-or-500/30 dark:text-or-400"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-rdia-700/60 dark:text-rdia-300"
            }`}
          >
            {h === "all" ? "Tous horizons" : h}
          </button>
        ))}
      </div>
      <span className="ml-2 text-[10.5px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">Niveau</span>
      <div className="flex flex-wrap gap-1">
        {FILTERS_LEVEL.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setFLevel(l)}
            className={`rounded-full px-2.5 py-1 text-[10.5px] transition-colors ${
              fLevel === l
                ? "bg-or-500/10 text-or-600 ring-1 ring-or-500/30 dark:text-or-400"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-rdia-700/60 dark:text-rdia-300"
            }`}
          >
            {l === "all" ? "Tous niveaux" : levelLabel(l as RiskLevel)}
          </button>
        ))}
      </div>
      <div className="ml-auto">
        <button
          type="button"
          onClick={() => setShowDismissed((v) => !v)}
          className="rounded-md px-2 py-1 text-[10.5px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-700/60 dark:hover:text-rdia-100"
        >
          {showDismissed ? "Masquer les ignorées" : "Voir les prédictions ignorées"}
        </button>
      </div>
    </div>
  );

  // --- Cartes prédictions FORMAT OPÉRATEUR EXIGÉ
  const rows = (
    <div className="flex flex-col gap-3">
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-[12px] text-gray-400 dark:border-rdia-600/60 dark:text-rdia-400">
          {riskLoadingAI
            ? "🔄 Analyse IA des données de la plateforme en cours… les prédictions s'afficheront ci-dessous."
            : "Aucune dégradation significative n'est anticipée sur les données ARGOS actuelles."}
        </div>
      ) : (
        filtered.map((p) => (
          <PredictionOperatorCard
            key={p.id}
            p={p}
            onValidate={() => validateRisk(p.id)}
            onDismiss={() => dismissRisk(p.id)}
            onFocus={() => {
              if (!p.ll) return;
              setMapCenter(p.ll, 9, `${p.riskType} · ${p.zoneLabel} · horizon ${p.horizon}`);
            }}
          />
        ))
      )}
    </div>
  );

  const signature = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100/70 pt-3 text-[10px] text-gray-400 dark:border-rdia-700/50 dark:text-rdia-400">
      <span>
        🛈 Prédictions produites à partir <b>des données réelles de la plateforme ARGOS</b>.
      </span>
      <span>Validation humaine OBLIGATOIRE · ne sont pas des décisions opérationnelles.</span>
    </div>
  );

  const inner = (
    <>
      {intro}
      {filters}
      {rows}
      {signature}
    </>
  );

  if (bare) return <div className="space-y-3">{inner}</div>;
  return (
    <div className="rounded-2xl border border-gray-200/70 bg-white/60 p-4 shadow-sm backdrop-blur dark:border-rdia-700/50 dark:bg-rdia-800/40">
      {inner}
    </div>
  );
}

// ========================================================================
// Carte opérateur FORMAT STANDARD (exigence user).
//  🔴 Risque <niveau> détecté
//  Type : <riskType>
//  Zone : <zoneLabel>
//  Localisation : <locationLabel> (si présent)
//  Probabilité : XX %
//  Horizon : prochaines <horizon>
//  Facteurs principaux :
//     · f1 ;
//     · f2 ;
//     ...
//  Tendance : ↗ En aggravation / → Stable / ↘ En amélioration
// ========================================================================
function PredictionOperatorCard({
  p,
  onValidate,
  onDismiss,
  onFocus,
}: {
  p: RiskPrediction;
  onValidate: () => void;
  onDismiss: () => void;
  onFocus: () => void;
}) {
  const tint = levelTint(p.level);
  const emoji = p.level === "critique" ? "🔴" : p.level === "eleve" ? "🟠" : p.level === "modere" ? "🟡" : "🟢";
  const proba = Math.round(probabilityToPercent(p.probability));

  // Horizon texte lisible
  const horizonTxt =
    p.horizon === "2h" ? "prochaines 2 h" :
    p.horizon === "6h" ? "prochaines 6 h" :
    p.horizon === "24h" ? "prochaines 24 h" :
    "prochains 2 jours";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 transition-all ${
        p.dismissed
          ? "border-gray-200/50 bg-gray-50/60 opacity-60 dark:border-rdia-700/50 dark:bg-rdia-900/40"
          : "border-gray-200/70 bg-white/80 shadow-sm dark:border-rdia-700/60 dark:bg-rdia-800/60"
      }`}
    >
      {/* Accent vertical gauche */}
      <span
        aria-hidden
        className={`absolute left-0 top-0 h-full w-1.5 ${
          tint === "red" ? "bg-red-500" :
          tint === "amber" ? "bg-amber-500" :
          tint === "blue" ? "bg-blue-500" :
          tint === "gray" ? "bg-gray-400" :
          "bg-emerald-500"
        }`}
      />

      {/* 🔴 + Titre Risque Niveau détecté */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-lg leading-none" aria-hidden>{emoji}</span>
        <div className="font-semibold text-[13.5px] tracking-tight text-rdia-700 dark:text-rdia-50">
          Risque <span className="capitalize">{levelLabel(p.level)}</span> détecté
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <Pill tone={tint} size="sm" label={levelLabel(p.level)} />
          <Pill tone="purple" size="sm" label={`Horizon ${p.horizon}`} />
          {p.validatedByHuman && (
            <Pill tone="green" size="sm" label={`Validée${p.validatedBy ? ` · ${p.validatedBy}` : ""}`} />
          )}
          {p.dismissed && <Pill tone="gray" size="sm" label="Ignorée" />}
        </div>
      </div>

      {/* 5 champs opérateurs en 2 colonnes responsive */}
      <div className="grid grid-cols-1 gap-2 text-[12.5px] leading-relaxed text-rdia-700 md:grid-cols-2 dark:text-rdia-100">
        <Field label="Type" value={p.riskType} strong />
        <Field label="Zone" value={p.zoneLabel} strong />
        {p.locationLabel && p.locationLabel.trim() && p.locationLabel !== p.zoneLabel && (
          <Field label="Localisation" value={p.locationLabel} className="md:col-span-2" />
        )}
        <Field
          label="Probabilité"
          value={
            <span className="font-semibold tabular-nums text-rdia-700 dark:text-rdia-50">
              {proba} %
            </span>
          }
        />
        <Field label="Horizon" value={horizonTxt} />
      </div>

      {/* Facteurs principaux */}
      {p.factors?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
            Facteurs principaux :
          </div>
          <ul className="space-y-1 text-[12px] text-rdia-700 dark:text-rdia-100">
            {p.factors.slice(0, 6).map((f, idx, arr) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-or-500" />
                <span className="min-w-0 flex-1">
                  {f.label}
                  {idx < arr.length - 1 ? " ;" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tendance */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <TrendBadge trend={p.trend} />

        {/* Actions discrètes opérateur */}
        <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
          {p.ll && (
            <button
              type="button"
              onClick={onFocus}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-600/50 dark:hover:text-rdia-100"
            >
              <Icon path={UI_ICONS.map} size={11} />
              Centrer la carte
            </button>
          )}
          {!p.validatedByHuman && !p.dismissed && (
            <button
              type="button"
              onClick={onValidate}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-green-600 transition-colors hover:bg-green-500/10 dark:text-green-400"
            >
              <Icon path={UI_ICONS.check ?? UI_ICONS.sliders} size={11} />
              Valider
            </button>
          )}
          {!p.dismissed && (
            <button
              type="button"
              onClick={onDismiss}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-rdia-600/50 dark:hover:text-rdia-100"
            >
              <Icon path={UI_ICONS.eyeOff ?? UI_ICONS.close} size={11} />
              Ignorer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${className ?? ""}`}>
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/70">
        {label} :
      </span>
      <span className={strong ? "truncate font-semibold text-rdia-700 dark:text-rdia-50" : "truncate"}>
        {value}
      </span>
    </div>
  );
}

function TrendBadge({ trend }: { trend: RiskTrend }) {
  const cfg =
    trend === "aggravation"
      ? { emoji: "↗", label: "En aggravation", cls: "bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-400" }
      : trend === "amelioration"
      ? { emoji: "↘", label: "En amélioration", cls: "bg-green-500/10 text-green-600 ring-green-500/20 dark:text-green-400" }
      : { emoji: "→", label: "Stable", cls: "bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ${cfg.cls}`}>
      <span aria-hidden className="text-[13px] leading-none">{cfg.emoji}</span>
      Tendance : <b>{cfg.label}</b>
    </span>
  );
}
