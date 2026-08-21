"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { svgToLL, llToSvg, typeLabel } from "@/lib/helpers";
import type { NrbcFamily, Province } from "@/lib/types";
import {
  useDraftProposal,
  TitleAssistButtons,
  DescAssistButtons,
  type DescriptionProposalInput,
} from "@/components/incidents/IncidentDraftAssist";

// Aperçu carte réel chargé côté client uniquement (MapLibre accède à window).
const LocationPreviewMap = dynamic(
  () => import("@/components/incidents/LocationPreviewMap").then((m) => m.LocationPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] w-full items-center justify-center rounded-xl border border-gray-200 text-xs text-gray-400 dark:border-rdia-600 dark:text-rdia-400">
        …
      </div>
    ),
  },
);

/** Province la plus proche d'un point géographique (rattachement région). */
function nearestProvince(ll: [number, number], provinces: Province[]): Province | undefined {
  let best: Province | undefined;
  let bestD = Infinity;
  for (const p of provinces) {
    const pll = p.ll ?? svgToLL(p.x, p.y);
    const d = (pll[0] - ll[0]) ** 2 + (pll[1] - ll[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Distance approximative en km entre deux points [lng, lat] (équirectangulaire). */
function distKm(a: [number, number], b: [number, number]): number {
  const dLat = (a[1] - b[1]) * 111;
  const dLng = (a[0] - b[0]) * 111 * Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng));
}

/** Classe des moyens du plus proche au plus loin du point (sinon ordre d'origine). */
function rankByDistance<T extends { ll: [number, number] }>(items: T[], pt: [number, number] | null): (T & { km: number | null })[] {
  if (!pt) return items.map((i) => ({ ...i, km: null }));
  return items.map((i) => ({ ...i, km: distKm(i.ll, pt) })).sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
}

/** Normalisation pour l'appariement local d'adresse (minuscules, sans accents). */
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Assistant « Signaler un incident » en 4 étapes (type → détails → localisation
 * → victimes & moyens). Les types viennent du catalogue paramétrable de l'API.
 * L'étape localisation réunit adresse / province / ville (cascade) / coordonnées
 * et un aperçu carte réel (MapLibre). La dernière étape saisit le bilan humain et
 * sélectionne les premiers intervenants (unités + hôpitaux) suggérés par proximité.
 */
export function IncidentWizard() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const open = useArgos((s) => s.wizOpen);
  const initLL = useArgos((s) => s.wizInitLL);
  const wizEdit = useArgos((s) => s.wizEdit);
  const close = useArgos((s) => s.closeWizard);
  const loadDomain = useArgos((s) => s.loadDomain);
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const showToast = useArgos((s) => s.showToast);

  const [step, setStep] = useState(1);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [adresse, setAdresse] = useState("");
  const [prov, setProv] = useState("");
  const [city, setCity] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  // Point résolu [lng, lat] — source de vérité unique de la localisation.
  const [pt, setPt] = useState<[number, number] | null>(null);
  const [geoErr, setGeoErr] = useState(false);
  // Étape 4 — bilan humain + premiers intervenants.
  const [dead, setDead] = useState("");
  const [injured, setInjured] = useState("");
  const [missing, setMissing] = useState("");
  const [selUnits, setSelUnits] = useState<string[]>([]);
  const [selHosps, setSelHosps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Volet NRBC (section conditionnelle de l'étape 2, type « nrbc » uniquement).
  const [nrbcFamily, setNrbcFamily] = useState<NrbcFamily | null>(null);
  const [nrbcSubstance, setNrbcSubstance] = useState("");
  const [nrbcSpill, setNrbcSpill] = useState<"small" | "large">("large");
  const [nrbcRelease, setNrbcRelease] = useState<"instant" | "continuous">("instant");
  const nrbcSubstances = useArgos((s) => s.nrbcSubstances);
  const ensureNrbcSubstances = useArgos((s) => s.ensureNrbcSubstances);

  // Le catalogue de substances n'est tiré que lorsqu'il devient nécessaire.
  useEffect(() => {
    if (open && type === "nrbc") void ensureNrbcSubstances();
  }, [open, type, ensureNrbcSubstances]);

  const province = useMemo(() => provinces.find((p) => p.v === prov), [prov, provinces]);
  const selectedCity = useMemo(() => cities.find((c) => c.v === city), [city, cities]);
  // Villes de la province sélectionnée (par région) ; sinon référentiel complet.
  const cityOptions = useMemo(() => {
    const reg = province?.region;
    return reg ? cities.filter((c) => c.region === reg) : cities;
  }, [province, cities]);
  // Moyens classés par proximité au point de l'incident (suggestion = le plus proche).
  const nearUnits = useMemo(() => rankByDistance(units, pt), [units, pt]);
  const nearHosps = useMemo(() => rankByDistance(hospitals, pt), [hospitals, pt]);

  const toggleUnit = (id: string) => setSelUnits((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleHosp = (id: string) => setSelHosps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  /* ===== Proposition IA description (UNIQUEMENT à partir du type choisi) ===== */
  const descProposalInput = useMemo<DescriptionProposalInput>(() => ({
    type,
    titre: title,
    adresse,
    province: prov,
    ville: city,
    pt,
    lang: (lang as "fr" | "ar" | "en") ?? "fr",
    incidentTypes,
  }), [type, title, adresse, prov, city, pt, lang, incidentTypes]);

  /* ===== HOOK useDraftProposal : propositions DIRECTEMENT DANS LES CHAMPS =====
   * - Régénère via bouton icône refresh À DROITE de l'input
   * - Appliquer via icône sparkles
   * - Auto-apply SI CHAMP VIDE (demande utilisateur : pas de bloc en dessous)
   */
  const draft = useDraftProposal(descProposalInput, {
    currentTitle: title,
    currentDesc: desc,
    autoApplyIfEmpty: true, // injecte directement la valeur dans le champ SI VIDE
    setTitle,
    setDesc,
  });

  // Pose le point et met à jour l'affichage des coordonnées.
  const applyLL = (ll: [number, number]) => {
    setPt(ll);
    setLng(ll[0].toFixed(5));
    setLat(ll[1].toFixed(5));
  };

  // Ouverture depuis la carte (Shift+clic droit) : point pré-rempli.
  useEffect(() => {
    if (open && initLL) {
      setStep(1);
      applyLL(initLL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initLL]);

  // Ouverture en mode édition : pré-remplissage depuis l'incident existant.
  useEffect(() => {
    if (open && wizEdit) {
      setStep(1);
      setType(wizEdit.type);
      setTitle(wizEdit.titre);
      applyLL(wizEdit.ll);
      setAdresse(wizEdit.adresse ?? "");
      setDead(wizEdit.casualties ? String(wizEdit.casualties.dead) : "");
      setInjured(wizEdit.casualties ? String(wizEdit.casualties.injured) : "");
      setMissing(wizEdit.casualties ? String(wizEdit.casualties.missing) : "");
      setSelUnits(wizEdit.responders?.units ?? []);
      setSelHosps(wizEdit.responders?.hospitals ?? []);
      setNrbcFamily(wizEdit.nrbc?.family ?? null);
      setNrbcSubstance(wizEdit.nrbc?.substanceId ?? "");
      setNrbcSpill(wizEdit.nrbc?.spill ?? "large");
      setNrbcRelease(wizEdit.nrbc?.release ?? "instant");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wizEdit]);

  /** Appariement local d'une adresse saisie contre le référentiel villes/provinces. */
  const matchPlace = (text: string): [number, number] | null => {
    const q = norm(text);
    if (q.length < 3) return null;
    const c = cities.find((x) => norm(x.v) === q) ?? cities.find((x) => norm(x.v).startsWith(q));
    if (c) return c.ll;
    const p = provinces.find((x) => norm(x.v) === q) ?? provinces.find((x) => norm(x.v).startsWith(q));
    if (p) return p.ll ?? svgToLL(p.x, p.y);
    return null;
  };

  const onAddress = (v: string) => {
    setAdresse(v);
    const m = matchPlace(v);
    if (m) applyLL(m);
  };
  const onProv = (v: string) => {
    setProv(v);
    const p = provinces.find((x) => x.v === v);
    if (p) {
      applyLL(p.ll ?? svgToLL(p.x, p.y));
      const c = cities.find((x) => x.v === city);
      if (c && c.region !== p.region) setCity("");
    }
  };
  const onCity = (v: string) => {
    setCity(v);
    const c = cities.find((x) => x.v === v);
    if (c) applyLL(c.ll);
  };
  const onLat = (v: string) => {
    setLat(v);
    const la = parseFloat(v);
    const lo = parseFloat(lng);
    if (Number.isFinite(la) && Number.isFinite(lo)) setPt([lo, la]);
  };
  const onLng = (v: string) => {
    setLng(v);
    const la = parseFloat(lat);
    const lo = parseFloat(v);
    if (Number.isFinite(la) && Number.isFinite(lo)) setPt([lo, la]);
  };
  const onMapPick = (ll: [number, number]) => applyLL(ll);

  const useGeolocation = () => {
    setGeoErr(false);
    if (!navigator.geolocation) {
      setGeoErr(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => applyLL([pos.coords.longitude, pos.coords.latitude]),
      () => setGeoErr(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const reset = () => {
    setStep(1); setType(null); setTitle(""); setDesc(""); setFiles([]);
    setAdresse(""); setProv(""); setCity(""); setLat(""); setLng(""); setPt(null); setGeoErr(false);
    setDead(""); setInjured(""); setMissing(""); setSelUnits([]); setSelHosps([]);
    setNrbcFamily(null); setNrbcSubstance(""); setNrbcSpill("large"); setNrbcRelease("instant");
  };
  const onClose = () => { reset(); close(); };

  const canNext = step === 1 ? !!type : step === 2 ? !!title.trim() : step === 3 ? pt !== null : true;
  const canSubmit = pt !== null;
  // Récapitulatif dérivé directement du point (cohérent avec les champs lat/lng).
  const coordsTxt = pt
    ? `${pt[1].toFixed(3)}° ${pt[1] >= 0 ? "N" : "S"} · ${Math.abs(pt[0]).toFixed(3)}° ${pt[0] >= 0 ? "E" : "W"}`
    : "—";

  const submit = async () => {
    if (!canSubmit || !pt || busy) return;
    setBusy(true);
    try {
      const { x, y } = llToSvg(pt);
      const attachedProv = province ?? nearestProvince(pt, provinces);
      const place = selectedCity?.v ?? attachedProv?.v;
      const region = selectedCity?.region ?? attachedProv?.region ?? "—";
      const d = Math.max(0, parseInt(dead, 10) || 0);
      const inj = Math.max(0, parseInt(injured, 10) || 0);
      const mis = Math.max(0, parseInt(missing, 10) || 0);
      const hasCasualties = d + inj + mis > 0;
      const hasResponders = selUnits.length + selHosps.length > 0;
      const body = {
        type: type ?? incidentTypes[0]?.id ?? "earthquake",
        titre: title.trim() || typeLabel(type ?? "", incidentTypes, lang) + (place ? ` — ${place}` : ""),
        region,
        adresse: adresse.trim() || undefined,
        x,
        y,
        ll: pt,
        casualties: hasCasualties ? { dead: d, injured: inj, missing: mis } : undefined,
        responders: hasResponders ? { units: selUnits, hospitals: selHosps } : undefined,
        // Volet NRBC : uniquement pour le type dédié, avec une famille choisie.
        // La substance et l'ampleur n'ont de sens que pour la famille chimique.
        nrbc:
          type === "nrbc" && nrbcFamily
            ? {
                family: nrbcFamily,
                substanceId: nrbcFamily === "C" && nrbcSubstance ? nrbcSubstance : undefined,
                spill: nrbcFamily === "C" ? nrbcSpill : undefined,
                release: nrbcFamily === "C" ? nrbcRelease : undefined,
              }
            : undefined,
      };
      // Édition : PATCH (conserve gravité/statut). Sinon création (audité).
      if (wizEdit) {
        await api.updateIncident(wizEdit.id, body);
      } else {
        await api.createIncident({ ...body, sev: "medium", st: "open" });
      }
      await loadDomain();
      showToast(t.toast_ok);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const steps = [t.wz1, t.wz2, t.wz3, t.wz4];
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  // 16 px sur mobile : sous ce seuil iOS zoome automatiquement au focus et
  // décale toute la modale. La densité d'origine (14 px) revient à partir de md.
  const fieldCls = "input-champ text-base md:text-sm";
  const sectionCls = "mb-2 text-xs font-bold uppercase tracking-wide text-rdia-500 dark:text-rdia-300";

  /** Ligne « moyen » sélectionnable (unité ou hôpital), ordonnée par proximité. */
  const responderRow = (
    item: { id: string; nom: string; ville: string; km: number | null },
    selected: boolean,
    suggested: boolean,
    onToggle: (id: string) => void,
  ) => (
    <button
      key={item.id}
      type="button"
      onClick={() => onToggle(item.id)}
      className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-left transition-colors ${
        selected
          ? "border-or-500 bg-or-500/10"
          : "border-gray-200 hover:border-or-500/40 dark:border-rdia-600"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
          selected ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"
        }`}
      >
        {selected && <Icon path={UI_ICONS.check} size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-gray-700 dark:text-rdia-100">{item.nom}</span>
        <span className="block text-[10px] text-gray-400 dark:text-rdia-400">
          {item.ville}
          {item.km != null ? ` · ${item.km} km` : ""}
        </span>
      </span>
      {suggested && (
        <span className="shrink-0 rounded-md bg-green-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-600 dark:text-green-400">
          {t.wz_suggested}
        </span>
      )}
    </button>
  );

  return (
    <Modal open={open} title={wizEdit ? t.edit_title : t.wiz_title} onClose={onClose} size="xl">
      <div className="flex flex-col gap-5">
        {/* Stepper — quatre colonnes égales : espacement uniforme entre les étapes.
            Sous `sm` les libellés ne tiennent pas côte à côte (375 px ÷ 4 ≈ 85 px) :
            on ne garde que les pastilles numérotées, et le libellé de l'étape en
            cours est rappelé sur la ligne du dessous. */}
        <div>
          <div className="grid grid-cols-4">
            {steps.map((label, i) => {
              const num = i + 1;
              const done = step > num;
              const current = step === num;
              return (
                <div key={label} className="flex items-center justify-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-green-500 text-white" : current ? "bg-or-500 text-rdia-600" : "bg-gray-200 text-gray-500 dark:bg-rdia-600 dark:text-rdia-300"
                    }`}
                  >
                    {num}
                  </span>
                  <span className={`hidden text-xs sm:inline ${current ? "font-bold text-or-500" : "text-gray-400 dark:text-rdia-400"}`}>{label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-center text-sm font-bold text-or-500 sm:hidden">{steps[step - 1]}</div>
        </div>

        {/* Étape 1 — type (catalogue paramétrable servi par l'API) */}
        {step === 1 && (
          <div className="grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 sm:gap-3 md:grid-cols-4">
            {incidentTypes.map((def) => (
              <button
                key={def.id}
                onClick={() => setType(def.id)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-3 text-xs font-semibold transition-all sm:p-4 ${
                  type === def.id
                    ? "border-or-500 bg-or-500/10 text-or-500"
                    : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                }`}
              >
                <Icon path={def.icon} size={26} strokeWidth={1.6} />
                <span className="text-center leading-tight">{def.labels[lang]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Étape 2 — détails */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {/* Champ TITRE avec icônes sparkles + refresh DANS la barre droite */}
            <div>
              <label className={labelCls}>{t.f_title}</label>
              <div className="flex items-stretch gap-1.5">
                <input
                  className={`${fieldCls} min-w-0 flex-1`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={draft.proposal.title || "Titre de l'incident…"}
                />
                <div className="flex shrink-0 items-center">
                  <TitleAssistButtons
                    onApply={draft.applyTitle}
                    onRegen={draft.regenFreshT}
                    applied={draft.titleUsed}
                    disabled={!type}
                  />
                </div>
              </div>
            </div>

            {/* Champ DESCRIPTION avec icônes sparkles + refresh DANS barre droite (au-dessus textarea)
                Valeur proposée DIRECTEMENT ÉCRITE DANS textarea si vide (via hook autoApply) */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className={labelCls + " mb-0"}>{t.f_desc}</label>
                <DescAssistButtons
                  onApply={draft.applyDesc}
                  onRegen={draft.regenFreshD}
                  applied={draft.descUsed}
                  disabled={!type}
                />
              </div>
              <textarea
                className={fieldCls}
                rows={4}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={draft.proposal.desc || "Description de l'incident (2 lignes)…"}
              />
            </div>

            {/* Volet NRBC — visible uniquement pour le type dédié. La famille
                pilote le reste : substance/ampleur/rejet n'existent qu'en chimique. */}
            {type === "nrbc" && (
              <div className="rounded-xl border-2 border-or-500/30 bg-or-500/5 p-3">
                <div className={sectionCls}>{t.nrbc_section}</div>
                <label className={labelCls}>{t.nrbc_family}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ["N", t.nrbc_fam_n],
                      ["R", t.nrbc_fam_r],
                      ["B", t.nrbc_fam_b],
                      ["C", t.nrbc_fam_c],
                    ] as [NrbcFamily, string][]
                  ).map(([fam, label]) => (
                    <button
                      key={fam}
                      type="button"
                      onClick={() => setNrbcFamily(fam)}
                      className={`flex flex-col items-center rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                        nrbcFamily === fam
                          ? "border-or-500 bg-or-500/10 text-or-500"
                          : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                      }`}
                    >
                      <span className="text-base font-bold">{fam}</span>
                      <span className="text-center text-[10px] leading-tight">{label}</span>
                    </button>
                  ))}
                </div>

                {nrbcFamily === "C" && (
                  <div className="mt-3 flex flex-col gap-3">
                    <div>
                      <label className={labelCls}>{t.nrbc_substance}</label>
                      <select className={fieldCls} value={nrbcSubstance} onChange={(e) => setNrbcSubstance(e.target.value)}>
                        <option value="">{t.nrbc_substance_none}</option>
                        {nrbcSubstances.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.labels[lang]} — UN {s.un}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const sel = nrbcSubstances.find((s) => s.id === nrbcSubstance);
                        return sel && !sel.ergVerified ? (
                          <p className="mt-1 text-[10px] font-semibold text-or-500">{t.nrbc_unverified}</p>
                        ) : null;
                      })()}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>{t.nrbc_spill}</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ["small", t.nrbc_spill_small],
                              ["large", t.nrbc_spill_large],
                            ] as ["small" | "large", string][]
                          ).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setNrbcSpill(v)}
                              className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                                nrbcSpill === v
                                  ? "border-or-500 bg-or-500/10 text-or-500"
                                  : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>{t.nrbc_release}</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(
                            [
                              ["instant", t.nrbc_release_instant],
                              ["continuous", t.nrbc_release_continuous],
                            ] as ["instant" | "continuous", string][]
                          ).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setNrbcRelease(v)}
                              className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                                nrbcRelease === v
                                  ? "border-or-500 bg-or-500/10 text-or-500"
                                  : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={labelCls}>{t.f_attach}</label>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-5 text-gray-400 transition-colors hover:border-or-500/50 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-400">
                <Icon path={UI_ICONS.upload} size={22} strokeWidth={1.6} />
                <span className="text-xs">{t.f_attach_hint}</span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? []).map((x) => x.name)])}
                />
              </label>
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {files.map((name, i) => (
                    <span key={`${name}-${i}`} className="rounded-md bg-or-500/15 px-2 py-1 text-[10px] font-semibold text-or-500">
                      {name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Étape 3 — localisation : tout en une vue, piloté par l'aperçu carte réel */}
        {step === 3 && (
          <div className="grid gap-4 md:grid-cols-[minmax(240px,300px)_1fr]">
            {/* Saisies — adresse, province, ville (cascade), coordonnées, position */}
            <div className="flex flex-col gap-3">
              <div>
                <label className={labelCls}>{t.f_addr}</label>
                <input
                  list="loc-places"
                  className={fieldCls}
                  value={adresse}
                  onChange={(e) => onAddress(e.target.value)}
                  placeholder={t.f_addr}
                />
                <datalist id="loc-places">
                  {cities.map((c) => (
                    <option key={c.v} value={c.v} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className={labelCls}>{t.f_prov}</label>
                <select className={fieldCls} value={prov} onChange={(e) => onProv(e.target.value)}>
                  <option value="">—</option>
                  {provinces.map((p) => (
                    <option key={p.v} value={p.v}>{p.v} — {p.region}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelCls}>{t.f_city}</label>
                <select className={fieldCls} value={city} onChange={(e) => onCity(e.target.value)}>
                  <option value="">—</option>
                  {cityOptions.map((c) => (
                    <option key={c.v} value={c.v}>{prov ? c.v : `${c.v} — ${c.region}`}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>{t.wz_lat}</label>
                  <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="31.630" value={lat} onChange={(e) => onLat(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>{t.wz_lng}</label>
                  <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="-8.010" value={lng} onChange={(e) => onLng(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className="btn-secondaire flex items-center gap-2 text-xs" onClick={useGeolocation}>
                  <Icon path={UI_ICONS.users} size={14} />
                  {t.wz_geo_btn}
                </button>
                {geoErr && <span className="text-[11px] font-semibold text-danger-500">{t.wz_geo_err}</span>}
              </div>

              <div>
                <label className={labelCls}>{t.f_coords}</label>
                <div className="input-champ font-mono text-sm text-gray-500 dark:text-rdia-300">{coordsTxt}</div>
              </div>
            </div>

            {/* Colonne carte : haut aligné sur le champ adresse, bas sur la case
                coordonnées. L'étiquette fantôme (invisible, même texte que « Adresse »)
                décale le haut de la carte au niveau du champ ; la carte remplit ensuite
                la hauteur restante jusqu'au bas de la colonne (= bas des coordonnées). */}
            <div className="flex flex-col">
              <label className={`${labelCls} invisible`} aria-hidden="true">{t.f_addr}</label>
              <div className="min-h-[300px] flex-1">
                {/* Aperçu carte réel — pilote le marqueur ; clic = pose le point */}
                <LocationPreviewMap
                  value={pt}
                  onPick={onMapPick}
                  labels={{ hint: t.wz_map_hint, full: t.wz_fullscreen, exit: t.wz_exit_full }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Étape 4 — victimes & moyens (premiers intervenants suggérés par proximité) */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            {/* Bilan humain */}
            <div>
              <div className={sectionCls}>{t.wz_casualties}</div>
              <div className="grid grid-cols-3 gap-3">
                {([[t.wz_dead, dead, setDead], [t.wz_injured, injured, setInjured], [t.wz_missing, missing, setMissing]] as const).map(
                  ([lbl, val, set]) => (
                    <div key={lbl}>
                      <label className={labelCls}>{lbl}</label>
                      <input
                        type="number"
                        min={0}
                        className="input-champ text-sm"
                        placeholder="0"
                        value={val}
                        onChange={(e) => set(e.target.value)}
                      />
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Premiers intervenants — suggérés selon la proximité du lieu de l'incident */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className={sectionCls}>
                  {t.wz_units_near}
                  {selUnits.length > 0 && <span className="ml-1 text-or-500">({selUnits.length})</span>}
                </div>
                <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto pr-1">
                  {nearUnits.map((u, i) => responderRow(u, selUnits.includes(u.id), pt !== null && i === 0, toggleUnit))}
                </div>
              </div>
              <div>
                <div className={sectionCls}>
                  {t.wz_hospitals_near}
                  {selHosps.length > 0 && <span className="ml-1 text-or-500">({selHosps.length})</span>}
                </div>
                <div className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto pr-1">
                  {nearHosps.map((h, i) => responderRow(h, selHosps.includes(h.id), pt !== null && i === 0, toggleHosp))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-rdia-700/50">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <div className="flex gap-2">
            {step > 1 && (
              <button className="btn-secondaire text-sm" onClick={() => setStep((s) => Math.max(1, s - 1))}>{t.prev}</button>
            )}
            {step < 4 && (
              <button className="btn-primaire text-sm" onClick={() => canNext && setStep((s) => Math.min(4, s + 1))} disabled={!canNext}>
                {t.next}
              </button>
            )}
            {step === 4 && (
              <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? "…" : t.submit}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
