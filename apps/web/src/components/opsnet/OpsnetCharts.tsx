"use client";

import { useMemo } from "react";
import { useDict, useModules } from "@/lib/store";
import type { Shelter } from "@/lib/data/modules";
import type { Unit } from "@/lib/types";

// ============================================================================
// OPSnet — graphes des unités et des abris
//
// SVG en ligne, aucune dépendance (MASTER_PLAN §4.3), même parti que le panneau
// Hospinet. Ce ne sont PAS les graphes d'Hospinet renommés : un hôpital se lit
// par son taux d'occupation, une unité par sa disponibilité et un abri par sa
// saturation ET son approvisionnement — trois grandeurs qui ne se ramènent pas
// l'une à l'autre.
//
// La couleur ne porte jamais seule : chaque valeur est aussi écrite.
// ============================================================================

const CARTE =
  "rounded-xl border border-gray-200 bg-white p-3 dark:border-rdia-600 dark:bg-rdia-700";
const TITRE = "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400";

/** Teinte selon la saturation — seuils communs à tout l'écran. */
export function satTint(pct: number): string {
  return pct >= 92 ? "text-danger-500" : pct >= 75 ? "text-or-500" : "text-green-600";
}
function satStroke(pct: number): string {
  return pct >= 92 ? "#ef4444" : pct >= 75 ? "#e0b243" : "#16a34a";
}

// ---------------------------------------------------------------------------
// 1 · Anneau — une proportion, écrite au centre
// ---------------------------------------------------------------------------

export function Anneau({
  pct,
  label,
  sous,
  taille = 116,
}: {
  pct: number;
  label: string;
  sous: string;
  taille?: number;
}) {
  const r = taille / 2 - 10;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={`${CARTE} flex flex-col items-center gap-1.5`}>
      <span className={TITRE}>{label}</span>
      <div className="relative" style={{ width: taille, height: taille }}>
        <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden="true">
          <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="currentColor" strokeWidth={9} className="text-gray-200 dark:text-rdia-600" />
          <circle
            cx={taille / 2}
            cy={taille / 2}
            r={r}
            fill="none"
            stroke={satStroke(v)}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray={`${(c * v) / 100} ${c}`}
            transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-[22px] font-bold leading-none tabular-nums ${satTint(v)}`}>
            {Math.round(v)}%
          </span>
        </div>
      </div>
      <span className="text-center text-[11px] leading-snug text-gray-500 dark:text-rdia-300">{sous}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Disponibilité des unités — barre empilée, chaque part chiffrée
// ---------------------------------------------------------------------------

export function DispoUnites({ units }: { units: Unit[] }) {
  const t = useDict();
  const n = useMemo(
    () => ({
      ready: units.filter((u) => u.dispo === "ready").length,
      standby: units.filter((u) => u.dispo === "standby").length,
      deployed: units.filter((u) => u.dispo === "deployed").length,
    }),
    [units],
  );
  const total = Math.max(1, units.length);
  const parts = [
    { k: "ready" as const, n: n.ready, couleur: "#16a34a", label: t.ops_ready },
    { k: "standby" as const, n: n.standby, couleur: "#e0b243", label: t.ops_standby },
    { k: "deployed" as const, n: n.deployed, couleur: "#3b82f6", label: t.ops_deployed },
  ];

  return (
    <div className={CARTE}>
      <span className={TITRE}>{t.ops_availability}</span>
      <div className="mt-2 flex h-6 w-full overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}>
        {parts.map((p) => (
          <div
            key={p.k}
            style={{ width: `${(100 * p.n) / total}%`, background: p.couleur }}
            className="h-full transition-[width] duration-300 motion-reduce:transition-none"
          />
        ))}
      </div>
      {/* La légende porte le CHIFFRE : une bande colorée seule ne se compte pas. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((p) => (
          <li key={p.k} className="flex items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-rdia-200">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.couleur }} aria-hidden="true" />
            {p.label}
            <span className="font-mono font-bold tabular-nums text-gray-800 dark:text-rdia-50">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Préparation des unités — barres horizontales triées
// ---------------------------------------------------------------------------

export function PreparationUnites({ units, max = 8 }: { units: Unit[]; max?: number }) {
  const t = useDict();
  const tri = useMemo(() => [...units].sort((a, b) => a.readiness - b.readiness).slice(0, max), [units, max]);

  return (
    <div className={CARTE}>
      <span className={TITRE}>{t.ops_readiness_low}</span>
      {/* Les MOINS prêtes en tête : c'est là qu'une décision se prend. Trier par
          les meilleures ferait un tableau d'honneur, pas un outil. */}
      <ul className="mt-2 flex flex-col gap-1.5">
        {tri.map((u) => (
          <li key={u.id} className="flex items-center gap-2">
            <span className="w-[38%] shrink-0 truncate text-[11.5px] text-gray-700 dark:text-rdia-100" title={u.nom}>
              {u.nom}
            </span>
            <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-gray-200 dark:bg-rdia-600">
              <span
                className="absolute inset-y-0 start-0 rounded-sm"
                style={{ width: `${Math.max(0, Math.min(100, u.readiness))}%`, background: satStroke(100 - u.readiness) }}
              />
            </span>
            <span className="w-9 shrink-0 text-end font-mono text-[11px] font-bold tabular-nums text-gray-700 dark:text-rdia-100">
              {u.readiness}%
            </span>
          </li>
        ))}
        {tri.length === 0 && <li className="text-[12px] text-gray-500 dark:text-rdia-300">{t.ops_no_units}</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 · Saturation des abris — barres, les plus tendus en tête
// ---------------------------------------------------------------------------

export function SaturationAbris({ shelters, max = 8 }: { shelters: Shelter[]; max?: number }) {
  const t = useDict();
  const lignes = useMemo(
    () =>
      shelters
        .map((s) => ({ s, pct: Math.round((100 * s.occupants) / Math.max(1, s.capacity)) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, max),
    [shelters, max],
  );

  return (
    <div className={CARTE}>
      <span className={TITRE}>{t.ops_saturation}</span>
      <ul className="mt-2 flex flex-col gap-1.5">
        {lignes.map(({ s, pct }) => (
          <li key={s.id} className="flex items-center gap-2">
            <span className="w-[38%] shrink-0 truncate text-[11.5px] text-gray-700 dark:text-rdia-100" title={s.nom}>
              {s.nom}
            </span>
            <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-sm bg-gray-200 dark:bg-rdia-600">
              <span className="absolute inset-y-0 start-0 rounded-sm" style={{ width: `${Math.min(100, pct)}%`, background: satStroke(pct) }} />
            </span>
            <span className={`w-9 shrink-0 text-end font-mono text-[11px] font-bold tabular-nums ${satTint(pct)}`}>
              {pct}%
            </span>
          </li>
        ))}
        {lignes.length === 0 && <li className="text-[12px] text-gray-500 dark:text-rdia-300">{t.ops_no_shelters}</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 · Approvisionnement — trois états, comptés
// ---------------------------------------------------------------------------

export function Approvisionnement({ shelters }: { shelters: Shelter[] }) {
  const t = useDict();
  const m = useModules();
  const n = useMemo(
    () => ({
      ok: shelters.filter((s) => s.supplies === "ok").length,
      low: shelters.filter((s) => s.supplies === "low").length,
      critical: shelters.filter((s) => s.supplies === "critical").length,
    }),
    [shelters],
  );
  const parts = [
    { n: n.critical, couleur: "#ef4444", label: m.shelters.sup_critical },
    { n: n.low, couleur: "#e0b243", label: m.shelters.sup_low },
    { n: n.ok, couleur: "#16a34a", label: m.shelters.sup_ok },
  ];

  return (
    <div className={CARTE}>
      <span className={TITRE}>{t.ops_supplies_state}</span>
      {/* Le CRITIQUE en tête, pas l'inverse : ce qui manque se lit d'abord. */}
      <ul className="mt-2 flex flex-col gap-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.couleur }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-gray-700 dark:text-rdia-100">{p.label}</span>
            <span className="font-mono text-[14px] font-bold tabular-nums text-gray-800 dark:text-rdia-50">{p.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6 · Composition des hébergés — adultes / enfants / aînés
// ---------------------------------------------------------------------------

export function Composition({ shelters }: { shelters: Shelter[] }) {
  const t = useDict();
  const n = useMemo(
    () =>
      shelters.reduce(
        (a, s) => ({ adults: a.adults + s.adults, children: a.children + s.children, elderly: a.elderly + s.elderly }),
        { adults: 0, children: 0, elderly: 0 },
      ),
    [shelters],
  );
  const total = n.adults + n.children + n.elderly;
  const parts = [
    { n: n.children, couleur: "#3b82f6", label: t.ops_children },
    { n: n.adults, couleur: "#16a34a", label: t.ops_adults },
    { n: n.elderly, couleur: "#e0b243", label: t.ops_elderly },
  ];

  return (
    <div className={CARTE}>
      <span className={TITRE}>{t.ops_composition}</span>
      {total === 0 ? (
        // Un dénombrement absent est DIT : un graphe à zéro se lirait comme
        // « aucun enfant », alors qu'il signifie « pas encore recensé ».
        <p className="mt-2 text-[12px] leading-snug text-gray-500 dark:text-rdia-300">{t.ops_no_census}</p>
      ) : (
        <>
          <div className="mt-2 flex h-6 w-full overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}>
            {parts.map((p) => (
              <div key={p.label} style={{ width: `${(100 * p.n) / total}%`, background: p.couleur }} className="h-full" />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-rdia-200">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.couleur }} aria-hidden="true" />
                {p.label}
                <span className="font-mono font-bold tabular-nums text-gray-800 dark:text-rdia-50">
                  {p.n.toLocaleString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
