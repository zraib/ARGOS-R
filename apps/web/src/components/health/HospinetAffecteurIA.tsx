// ============================================================================
// Affecteur IA · Hospinet
// ----------------------------------------------------------------------------
// Flux linéaire ultra-simple (Saisie → Classement → Justification) :
//   1. Coordonnées [lng,lat] point d'évacuation + nom libre
//   2. Nombre de victimes
//   3. Services médicaux requis (multi-select depuis ARGOS_WARD_REFERENCE,
//      presélectionnés par défaut : REA · Urgences · Chirurgie · Pédiatrie)
//   4. Options avancées : rayon km + hôpitaux de campagne
// Sortie :
//   - Top 3 cartes KPI (rang, score, ETA, km, occ, services)
//   - Classement complet tableau scrollable
//   - Justification LLM Top 3 + fallback déterministe
// ============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { hospId } from "@/lib/hospitals";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { HospitalServiceKey } from "@/lib/types";
import { ARGOS_WARD_REFERENCE } from "@/lib/types";
import {
  fallbackJustification,
  justifyTop3,
  rankHospitals,
  type AffecteurNeed,
  type AffecteurResult,
  type AffecteurRow,
} from "@/lib/ai/llmHospinetAffecteur";

/* ---------------- Style : palette cohérente avec HospinetIAPanel ---------------- */

const cardCls =
  "rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-600 dark:bg-rdia-700";
const sectionTitleCls =
  "text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const sectionSubtitleCls =
  "mt-0.5 text-[11px] font-medium text-gray-500 dark:text-rdia-300";
const smallLabel =
  "text-[10.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-400";
const inputCls =
  "w-full h-8 rounded-md border border-gray-200 bg-white px-2.5 text-[12px] text-gray-800 outline-none transition-colors focus:border-or-500 focus:ring-1 focus:ring-or-500/40 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100 dark:focus:border-or-500";
const helpCls = "mt-0.5 text-[10.5px] text-gray-400 dark:text-rdia-400 tabular-nums";

function occTint(pct: number) {
  return pct >= 92 ? "text-danger-600 dark:text-danger-400" : pct >= 75 ? "text-or-600 dark:text-or-400" : "text-green-700 dark:text-green-400";
}
function occBg(pct: number) {
  return pct >= 92 ? "bg-danger-500" : pct >= 75 ? "bg-or-500" : "bg-green-500";
}

function fmtInt(n: number): string {
  if (!isFinite(n)) return "0";
  return Math.round(n).toLocaleString("fr-FR");
}
/* ---------------- Sous-composants ---------------- */

const TOP_DEFAULT: HospitalServiceKey[] = ["rea", "urgences", "chirurgie", "pediatrie"];

function SvcChip(props: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  const { label, selected, onToggle } = props;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "rounded-full border px-2.5 py-1 text-[10.5px] font-semibold transition-all " +
        (selected
          ? "border-or-500 bg-or-500 text-white shadow-sm dark:border-or-400 dark:bg-or-400 dark:text-gray-900"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-300 dark:hover:border-rdia-400 dark:hover:text-rdia-100")
      }
    >
      {label}
    </button>
  );
}

function CoordInput(props: {
  ll: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
  preset: { label: string; ll: [number, number] }[];
}) {
  const { ll, onChange, preset } = props;
  const [lng, lat] = ll ?? [NaN, NaN];
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col">
          <span className={smallLabel + " mb-1"}>Longitude (lng)</span>
          <input
            type="number"
            step="0.0001"
            placeholder="-8.0123"
            className={inputCls}
            value={isFinite(lng) ? lng : ""}
            onChange={(e) => {
              const v = e.target.value === "" ? NaN : Number(e.target.value);
              const out: [number, number] = [isFinite(v) ? v : 0, isFinite(lat) ? lat : 0];
              onChange(isFinite(v) || isFinite(lat) ? out : null);
            }}
          />
        </label>
        <label className="flex flex-col">
          <span className={smallLabel + " mb-1"}>Latitude (lat)</span>
          <input
            type="number"
            step="0.0001"
            placeholder="31.6286"
            className={inputCls}
            value={isFinite(lat) ? lat : ""}
            onChange={(e) => {
              const v = e.target.value === "" ? NaN : Number(e.target.value);
              const out: [number, number] = [isFinite(lng) ? lng : 0, isFinite(v) ? v : 0];
              onChange(isFinite(v) || isFinite(lng) ? out : null);
            }}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {preset.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange([p.ll[0], p.ll[1]])}
            className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-300 dark:hover:border-or-400 dark:hover:text-or-400"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreBars({ row }: { row: AffecteurRow }) {
  const bars: [string, number, string][] = [
    ["Voy", row.breakdown.travel, "bg-sky-500"],
    ["Cap", row.breakdown.capacity, "bg-green-500"],
    ["Svc", row.breakdown.service, "bg-violet-500"],
  ];
  return (
    <div className="flex flex-col gap-1">
      {bars.map(([k, v, c]) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="w-6 shrink-0 text-[9.5px] font-bold tabular-nums text-gray-400 dark:text-rdia-400">{k}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
            <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
          </div>
          <span className="w-7 shrink-0 text-right text-[9.5px] font-bold tabular-nums text-gray-600 dark:text-rdia-300">{Math.round(v)}</span>
        </div>
      ))}
      {row.breakdown.bonus > 0 && (
        <div className="pl-7 text-[9.5px] font-semibold text-or-600 dark:text-or-400">
          +{row.breakdown.bonus} bonus flotte
        </div>
      )}
    </div>
  );
}

/* ---------------- Composant principal ---------------- */

export function HospinetAffecteurIA() {
  const t = useDict();
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const setSelHosp = useArgos((s) => s.setSelHosp);

  // ----- État : entrées (valeurs par défaut ultra-simples) -----
  const [originLabel, setOriginLabel] = useState("");
  // Point par défaut : Marrakech (Al Haouz — zone historique sismique MA)
  const [originLL, setOriginLL] = useState<[number, number] | null>([-8.0123, 31.6286]);
  const [victims, setVictims] = useState(36);
  const [services, setServices] = useState<HospitalServiceKey[]>(() => TOP_DEFAULT.slice());
  const [radius, setRadius] = useState(120);
  const [includeField, setIncludeField] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ----- État : sorties -----
  const [result, setResult] = useState<AffecteurResult | null>(null);
  const [ranking, setRanking] = useState(false);
  const [justifying, setJustifying] = useState(false);
  const [justification, setJustification] = useState<string | undefined>(undefined);
  const [justFallback, setJustFallback] = useState(false);
  const [justError, setJustError] = useState<string | undefined>(undefined);

  const coordPresets = useMemo(() => {
    const arr: { label: string; ll: [number, number] }[] = [];
    // Quelques capitales / villes clés du Maroc (référentiel hospinet)
    const seen = new Set<string>();
    for (const h of hospitals) {
      const k = `${h.ville}${h.region ? "·" + h.region : ""}`;
      if (!h.ville || seen.has(k)) continue;
      seen.add(k);
      arr.push({ label: h.ville, ll: h.ll });
      if (arr.length >= 8) break;
    }
    return arr;
  }, [hospitals]);

  function toggleService(key: HospitalServiceKey) {
    setServices((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function hasValidCoord(): boolean {
    if (!originLL) return false;
    return isFinite(originLL[0]) && isFinite(originLL[1]);
  }

  // Premier classement automatique au chargement si hôpitaux dispos
  useEffect(() => {
    if (!hasValidCoord() || !hospitals.length) return;
    const need: AffecteurNeed = {
      ll: originLL,
      label: originLabel || undefined,
      victims,
      services: services.length ? services : TOP_DEFAULT,
      radiusKm: radius,
      includeFieldHosps: includeField,
    };
    setResult(rankHospitals(need, hospitals, fieldHosps));
    setJustification(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (!hasValidCoord()) return;
    const need: AffecteurNeed = {
      ll: originLL,
      label: originLabel || undefined,
      victims: Math.max(0, victims | 0),
      services: services.length ? services : TOP_DEFAULT,
      radiusKm: radius,
      includeFieldHosps: includeField,
    };
    setRanking(true);
    setJustification(undefined);
    setJustFallback(false);
    setJustError(undefined);
    try {
      const res = rankHospitals(need, hospitals, fieldHosps);
      setResult(res);
    } finally {
      setRanking(false);
    }
  }

  async function runJustify() {
    if (!result) return;
    const need: AffecteurNeed = {
      ll: originLL,
      label: originLabel || undefined,
      victims: Math.max(0, victims | 0),
      services: services.length ? services : TOP_DEFAULT,
      radiusKm: radius,
      includeFieldHosps: includeField,
    };
    setJustifying(true);
    try {
      const res = await justifyTop3(need, result);
      setJustification(res.text);
      setJustFallback(res.fallback);
      setJustError(res.llmError);
    } finally {
      setJustifying(false);
    }
  }

  const validCoord = hasValidCoord();
  const top3 = result ? result.rows.slice(0, 3) : [];
  const rest = result ? result.rows.slice(3, Math.min(12, result.rows.length)) : [];

  return (
    <section className="flex flex-col gap-3">
      {/* HEADER */}
      <header className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] dark:border-rdia-500 dark:bg-rdia-800">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-or-500/10 text-or-500 dark:bg-or-400/15 dark:text-or-400">
            <Icon path={UI_ICONS.target} size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[14px] font-extrabold leading-tight text-gray-900 dark:text-white">
              {t.af_title}
            </h1>
            <p className="mt-0.5 truncate text-[11.5px] text-gray-500 dark:text-rdia-300">
              {t.af_subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={!validCoord || ranking}
          className={
            "inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[12px] font-extrabold shadow-sm transition-colors " +
            (validCoord && !ranking
              ? "bg-or-500 text-white hover:bg-or-600 dark:bg-or-400 dark:text-gray-900 dark:hover:bg-or-500"
              : "bg-gray-200 text-gray-400 dark:bg-rdia-600 dark:text-rdia-400")
          }
        >
          <Icon path={ranking ? UI_ICONS.loading : UI_ICONS.shuffle} size={14} strokeWidth={2} className={ranking ? "animate-spin" : ""} />
          {ranking ? t.af_running : t.af_run}
        </button>
      </header>

      {/* INPUTS : 2 colonnes (Coordonnées | Services) + options avancées */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Colonne 1 — Coordonnées + victimes */}
        <div className={cardCls}>
          <div className="mb-3">
            <div className={sectionTitleCls}>{t.af_origin}</div>
            <div className={sectionSubtitleCls}>Coordonnées [lng, lat] + nom libre</div>
          </div>

          <label className="mb-2 block">
            <span className={smallLabel + " mb-1 block"}>Libellé du lieu (facultatif)</span>
            <input
              className={inputCls}
              placeholder="Ex : Épicentre Al Haouz · Usine chimique Safi"
              value={originLabel}
              onChange={(e) => setOriginLabel(e.target.value)}
            />
          </label>

          <div className="mb-3">
            <CoordInput ll={originLL} onChange={setOriginLL} preset={coordPresets} />
            <p className={helpCls + " mt-1.5"}>
              {originLL && validCoord
                ? `[ ${originLL[0].toFixed(4)} , ${originLL[1].toFixed(4)} ]`
                : "saisir lng/lat ou cliquer sur une ville prédéfinie"}
            </p>
          </div>

          <label className="block">
            <div className="flex items-end justify-between">
              <span className={smallLabel + " mb-1"}>{t.af_victims}</span>
              <span className="text-[11px] font-bold tabular-nums text-gray-700 dark:text-rdia-200">{fmtInt(Math.max(0, victims | 0))}</span>
            </div>
            <input
              type="range"
              min={1}
              max={500}
              step={1}
              value={victims}
              onChange={(e) => setVictims(Number(e.target.value))}
              className="accent-or-500 w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-400 dark:text-rdia-400 tabular-nums">
              <span>1</span><span>50</span><span>150</span><span>300</span><span>500</span>
            </div>
          </label>

          <div className="mt-3 border-t border-dashed border-gray-200 pt-3 dark:border-rdia-600">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between text-[11px] font-semibold text-gray-500 hover:text-gray-800 dark:text-rdia-300 dark:hover:text-rdia-100"
            >
              <span className="flex items-center gap-1.5">
                <Icon path={UI_ICONS.settings} size={12} /> {t.af_advanced}
              </span>
              <Icon path={showAdvanced ? UI_ICONS.chevronDown : UI_ICONS.chevronRight} size={12} />
            </button>
            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col">
                  <span className={smallLabel + " mb-1"}>{t.af_radius} · km</span>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={radius}
                    onChange={(e) => setRadius(Math.max(0, Number(e.target.value) | 0))}
                  />
                  <span className={helpCls}>0 = pas de limite</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 h-8 dark:border-rdia-500 dark:bg-rdia-800">
                  <input
                    type="checkbox"
                    className="accent-or-500"
                    checked={includeField}
                    onChange={(e) => setIncludeField(e.target.checked)}
                  />
                  <span className="text-[11.5px] font-medium text-gray-700 dark:text-rdia-200">{t.af_field}</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Colonne 2 — Services requis */}
        <div className={cardCls}>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <div className={sectionTitleCls}>{t.af_services}</div>
              <div className={sectionSubtitleCls}>{t.af_services_sub}</div>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setServices(TOP_DEFAULT.slice())}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-300"
              >
                Réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setServices([])}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-500 hover:border-danger-500 hover:text-danger-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-300"
              >
                Aucun
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ARGOS_WARD_REFERENCE.map((r) => (
              <SvcChip
                key={String(r.key)}
                label={r.label}
                selected={services.includes(r.key)}
                onToggle={() => toggleService(r.key)}
              />
            ))}
          </div>
          <p className={helpCls + " mt-2"}>
            {services.length === 0
              ? "aucun service sélectionné"
              : `${services.length} service(s) requis · ${services.map(k => (ARGOS_WARD_REFERENCE.find(r => r.key===k)?.label ?? String(k))).join(" · ")}`}
          </p>
        </div>
      </div>

      {/* ---------------- SORTIES ---------------- */}
      {result && (
        <>
          {/* Top 3 cartes */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div>
                <div className={sectionTitleCls}>{t.af_rank_top3}</div>
                <div className={sectionSubtitleCls}>
                  {result.rows.length > 0 ? `${result.rows.length} établissements classés · ${radius ? "rayon " + radius + " km" : "pas de rayon"}` : t.af_empty}
                </div>
              </div>
              <button
                type="button"
                onClick={runJustify}
                disabled={result.empty || justifying}
                className={
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[11px] font-bold shadow-sm transition-colors " +
                  (!result.empty && !justifying
                    ? "text-gray-800 hover:border-or-500 hover:text-or-500 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-100 dark:hover:border-or-400 dark:hover:text-or-400"
                    : "text-gray-400 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-400")
                }
              >
                <Icon path={justifying ? UI_ICONS.loading : UI_ICONS.sparkles} size={12} className={justifying ? "animate-spin" : ""} />
                {justifying ? t.af_justifying : t.af_justify}
              </button>
            </div>

            {result.empty ? (
              <div className={cardCls + " py-5 text-center"}>
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-rdia-600 dark:text-rdia-400">
                  <Icon path={UI_ICONS.alert} size={18} />
                </div>
                <p className="text-[12px] text-gray-500 dark:text-rdia-300">{t.af_empty}</p>
                <p className="mt-1 text-[10.5px] text-gray-400 dark:text-rdia-400">
                  Augmentez le rayon, activez les hôpitaux de campagne ou déplacez le point d'origine.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {top3.map((r) => (
                  <TopRankCard key={hospId(r.hospital)} row={r} onOpen={() => !r.field && setSelHosp(hospId(r.hospital))} />
                ))}
              </div>
            )}
          </div>

          {/* Justification */}
          {(justification || justFallback || justError) && (
            <div className={cardCls}>
              <div className="mb-2 flex items-center justify-between gap-2 pr-8">
                <div>
                  <div className="sectionTitleCls">Justification IA · Top 3</div>
                  <div className={sectionSubtitleCls}>
                    {justError ? justError : "Synthèse neutre basée sur les chiffres Couche 1"}
                  </div>
                </div>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-gray-700 dark:text-rdia-100">
                {justification ?? fallbackJustification({ ll: originLL, label: originLabel, victims, services, radiusKm: radius, includeFieldHosps: includeField }, result)}
              </pre>
            </div>
          )}

          {/* Classement complet tableau */}
          {rest.length > 0 && (
            <div className={cardCls}>
              <div className="mb-2 pr-6">
                <div className={sectionTitleCls}>{t.af_rank_all}</div>
                <div className={sectionSubtitleCls}>Rangs 4 à {3 + rest.length} · {result.empty ? 0 : result.rows.length} au total</div>
              </div>
              <div className="max-h-[280px] overflow-auto rounded-lg border border-gray-100 dark:border-rdia-600">
                <table className="w-full text-left text-[11.5px] text-gray-700 dark:text-rdia-200">
                  <thead className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur text-[10px] uppercase tracking-wider text-gray-500 dark:bg-rdia-700/90 dark:text-rdia-400">
                    <tr>
                      <th className="px-3 py-2 font-bold">#</th>
                      <th className="px-3 py-2 font-bold">Établissement</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_score}</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_eta}</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_km}</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_occ}</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_free}</th>
                      <th className="px-2 py-2 text-right font-bold">{t.af_svc}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-rdia-600">
                    {[...top3, ...rest].map((r) => (
                      <tr
                        key={hospId(r.hospital)}
                        onClick={() => !r.field && setSelHosp(hospId(r.hospital))}
                        className="cursor-pointer transition-colors hover:bg-gray-50/60 dark:hover:bg-rdia-600/50"
                      >
                        <td className="px-3 py-1.5">
                          <span className={"inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold " + (r.rank <= 3 ? "bg-or-500 text-white dark:bg-or-400 dark:text-gray-900" : "bg-gray-100 text-gray-600 dark:bg-rdia-600 dark:text-rdia-300")}>{r.rank}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {r.field ? (
                              <Icon path={UI_ICONS.tent} size={12} className="text-violet-500 shrink-0" />
                            ) : (
                              <Icon path={UI_ICONS.hospitals} size={12} className="text-sky-600 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate font-bold text-gray-800 dark:text-rdia-100">{r.hospital.nom}</div>
                              <div className="truncate text-[10px] text-gray-500 dark:text-rdia-400">
                                {"ville" in r.hospital ? r.hospital.ville : "campagne"}
                                {" · "}{"type" in r.hospital && r.hospital.type ? r.hospital.type : r.field ? "campagne" : "hôpital"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="font-extrabold tabular-nums text-gray-900 dark:text-white">{r.score}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.etaMin} min</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.km.toFixed(1)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="inline-flex min-w-[60px] items-center justify-end gap-1.5">
                            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
                              <div className={"h-full rounded-full " + occBg(r.pctOcc)} style={{ width: `${Math.min(100, r.pctOcc)}%` }} />
                            </div>
                            <span className={"text-[10.5px] font-bold tabular-nums " + occTint(r.pctOcc)}>{r.pctOcc}%</span>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums text-green-700 dark:text-green-400">{fmtInt(r.estimatedFreeBeds)}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="tabular-nums text-[10.5px] font-bold text-violet-700 dark:text-violet-300">{r.svcMatch[0]}/{r.svcMatch[1]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------- Carte Top 3 dédiée ---------------- */

function TopRankCard({ row, onOpen }: { row: AffecteurRow; onOpen: () => void }) {
  const h = row.hospital;
  const rankClr =
    row.rank === 1 ? "from-or-500 to-or-400 text-white"
    : row.rank === 2 ? "from-gray-400 to-gray-300 text-white"
    : "from-amber-700 to-amber-600 text-white";
  return (
    <div
      onClick={onOpen}
      className="group flex cursor-pointer flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-3 shadow-[0_1px_0_0_rgba(0,0,0,0.03)] transition-all hover:-translate-y-0.5 hover:border-or-500/60 hover:shadow-md dark:border-rdia-600 dark:bg-rdia-700 dark:hover:border-or-400/60"
    >
      <div className="flex items-start gap-2.5">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${rankClr} text-[12px] font-extrabold shadow-sm`}>
          #{row.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {row.field
              ? <Icon path={UI_ICONS.tent} size={12} className="shrink-0 text-violet-500" />
              : <Icon path={UI_ICONS.hospitals} size={12} className="shrink-0 text-sky-600" />}
            <span className="truncate text-[12.5px] font-extrabold leading-tight text-gray-900 dark:text-white">{h.nom}</span>
          </div>
          <div className="mt-0.5 truncate text-[10.5px] text-gray-500 dark:text-rdia-400">
            {"ville" in h && h.ville ? h.ville : "hôpital de campagne"}
            {" · "}{"type" in h && h.type ? h.type : row.field ? "campagne" : "hôpital"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">SCORE</div>
          <div className="text-[20px] font-black leading-none tabular-nums text-or-500 dark:text-or-400">{row.score}</div>
        </div>
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-4 gap-1.5 rounded-lg bg-gray-50 p-2 dark:bg-rdia-800/60">
        <MiniKpi label="ETA" value={`${row.etaMin} min`} sub={row.km.toFixed(1) + " km"} />
        <MiniKpi label="OCC" value={`${row.pctOcc}%`} sub="" tint={occTint(row.pctOcc)} />
        <MiniKpi label="LIBRES" value={String(row.estimatedFreeBeds)} sub="estim." tint="text-green-700 dark:text-green-400" />
        <MiniKpi label="SVC" value={`${row.svcMatch[0]}/${row.svcMatch[1]}`} sub="" tint="text-violet-700 dark:text-violet-300" />
      </div>

      {/* Décomposition score barres */}
      <ScoreBars row={row} />

      {/* Services requis présents / absents */}
      {row.svcDetail.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-dashed border-gray-200 pt-2 dark:border-rdia-600">
          {row.svcDetail.map((s) => (
            <span
              key={String(s.key)}
              className={
                "rounded-md px-1.5 py-0.5 text-[9.5px] font-bold " +
                (s.present
                  ? "bg-green-500/12 text-green-700 dark:bg-green-400/15 dark:text-green-300"
                  : "bg-gray-100 text-gray-500 dark:bg-rdia-600 dark:text-rdia-400")
              }
            >
              {s.name.split(" / ")[0]}{s.present ? ` · ${s.free}` : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniKpi(props: { label: string; value: string; sub: string; tint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md bg-white px-1.5 py-1.5 dark:bg-rdia-700/70">
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{props.label}</div>
      <div className={"text-[11.5px] font-extrabold tabular-nums " + (props.tint ?? "text-gray-800 dark:text-rdia-100")}>{props.value}</div>
      {props.sub && <div className="text-[9px] text-gray-400 dark:text-rdia-400">{props.sub}</div>}
    </div>
  );
}
