"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
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
import {
  generateIncidentDraft,
  paraphraseIncidentDraft,
  type IncidentDraftResult,
} from "@/lib/ai/llmIncidentDraft";

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
  const [keywordsList, setKeywordsList] = useState<string[]>([]);
  const [keywordsDraft, setKeywordsDraft] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiBusyT, setAiBusyT] = useState(false);
  const [aiBusyD, setAiBusyD] = useState(false);
  const [aiFallback, setAiFallback] = useState(false);
  const [aiSalt, setAiSalt] = useState(1);
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

  /* ===== Proposition IA description =====
   * Nouveau workflow (demande utilisateur) :
   *   UNE SEULE méthode de génération : UN bouton « Générer par IA ».
   *   keywordsList[] chips → clic bouton → génére titre + description (basés STRICTEMENT sur keywords + type)
   *   Pas de boutons sparkles/refresh séparés sur les champs titre/descr.
   */
  const keywordsFlat = keywordsList.join(" , ");
  const descProposalInput = useMemo<DescriptionProposalInput>(() => ({
    type,
    titre: title,
    adresse,
    province: prov,
    ville: city,
    pt,
    lang: (lang as "fr" | "ar" | "en") ?? "fr",
    incidentTypes,
    keywords: keywordsFlat,
  }), [type, title, adresse, prov, city, pt, lang, incidentTypes, keywordsFlat]);

  const draft = useDraftProposal(descProposalInput, {
    currentTitle: title,
    currentDesc: desc,
    autoApplyIfEmpty: false, // JAMAIS d'auto-apply (demande UX : seule la génération par bouton IA compte)
    setTitle,
    setDesc,
  });

  /** Ajouter un keyword depuis le draft (Entrée ou bouton). */
  const addKeyword = () => {
    const t = keywordsDraft.trim();
    if (!t) return;
    if (keywordsList.includes(t)) {
      setKeywordsDraft("");
      return;
    }
    setKeywordsList((l) => [...l, t]);
    setKeywordsDraft("");
  };
  const removeKeyword = (idx: number) =>
    setKeywordsList((l) => l.filter((_, i) => i !== idx));
  const onKeywordKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";") {
      e.preventDefault();
      addKeyword();
    } else if (e.key === "Backspace" && !keywordsDraft && keywordsList.length > 0) {
      setKeywordsList((l) => l.slice(0, -1));
    }
  };

  /** Appliquer un résultat de draft aux états title/desc + hint fallback. */
  const applyDraft = (r: IncidentDraftResult) => {
    if (r.title) setTitle(r.title);
    if (r.desc) setDesc(r.desc);
    setAiFallback(Boolean(r.fallback));
  };

  /** Génération initiale / régénération globale via LLM + fallback. */
  const runAiGenerate = async () => {
    if (!type || keywordsList.length === 0 || aiBusy) return;
    setAiBusy(true);
    setAiGenerated(false);
    setAiFallback(false);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      const result = await generateIncidentDraft(keywordsList, descProposalInput, { salt: nextSalt });
      applyDraft(result);
      setAiGenerated(true);
    } finally {
      setAiBusy(false);
    }
  };

  /** Paraphrase seulement le titre. */
  const regenTitle = async () => {
    if (!aiGenerated || aiBusyT) return;
    setAiBusyT(true);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      const result = await paraphraseIncidentDraft({
        keywords: keywordsList,
        input: descProposalInput,
        currentTitle: title,
        currentDesc: desc,
        field: "title",
        salt: nextSalt,
      });
      applyDraft(result);
    } finally {
      setAiBusyT(false);
    }
  };

  /** Paraphrase seulement la description. */
  const regenDesc = async () => {
    if (!aiGenerated || aiBusyD) return;
    setAiBusyD(true);
    try {
      const nextSalt = aiSalt + 1;
      setAiSalt(nextSalt);
      const result = await paraphraseIncidentDraft({
        keywords: keywordsList,
        input: descProposalInput,
        currentTitle: title,
        currentDesc: desc,
        field: "desc",
        salt: nextSalt,
      });
      applyDraft(result);
    } finally {
      setAiBusyD(false);
    }
  };

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
      setKeywordsList([]);
      setKeywordsDraft("");
      setAiGenerated(true); // mode édition : le titre/descr existent déjà → on affiche les champs
      setTitle(wizEdit.titre);
      // La description n'est PAS persistée par l'API (absente du contrat
      // Incident) : en édition il n'y a rien à recharger. Champ laissé vide
      // plutôt que de laisser croire qu'une saisie antérieure a été conservée.
      setDesc("");
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
    setStep(1); setType(null);
    setKeywordsList([]); setKeywordsDraft(""); setAiGenerated(false); setAiBusy(false);
    setTitle(""); setDesc(""); setFiles([]);
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

        {/* Étape 2 — détails : workflow strict (demande utilisateur)
            1. SAISIE de mots-clés UN PAR UN → chips distincts avec ×
            2. UN SEUL BOUTON : « Générer par IA » (→ « Régénérer par IA » après 1ère génération)
            3. TANT QUE !aiGenerated : champs Titre + Description MASQUÉS
            4. APRÈS GÉNÉRATION : Titre + Description APPARAISSENT et restent ÉDITABLES
            5. PLUS AUCUN BOUTON sparkles/⟳ séparé sur titre/descr : 1 METHODE DE GENERATION UNIQUE */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            {/* ZONE UNIQUE DE SAISIE DES MOTS-CLÉS (chips) */}
            <div>
              <label className={labelCls}>{t.f_keywords}</label>
              {/* Chips existants + input pour en ajouter un nouveau (combo unique, style champ) */}
              <div
                className={`${fieldCls} flex flex-wrap items-center gap-1.5 py-2`}
                onClick={(e) => {
                  const el = (e.currentTarget.querySelector(
                    'input[data-wiz-keyword-input="1"]',
                  ) ?? null) as HTMLInputElement | null;
                  el?.focus();
                }}
              >
                {keywordsList.map((kw, i) => (
                  <span
                    key={`${kw}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border border-or-500/40 bg-or-500/10 px-2 py-0.5 text-xs font-semibold text-or-700 dark:text-or-300"
                  >
                    <span className="max-w-[18ch] truncate">{kw}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeKeyword(i);
                      }}
                      className="ml-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-or-700/70 hover:bg-or-500/20 hover:text-or-700 dark:text-or-300/80 dark:hover:text-or-200"
                      title={`Retirer « ${kw} »`}
                    >
                      <Icon path={UI_ICONS.close} size={11} strokeWidth={3} />
                    </button>
                  </span>
                ))}
                <input
                  data-wiz-keyword-input="1"
                  value={keywordsDraft}
                  onChange={(e) => setKeywordsDraft(e.target.value)}
                  onKeyDown={onKeywordKey}
                  placeholder={keywordsList.length ? "" : t.f_keywords_chip_ph}
                  className="min-w-[14ch] flex-1 border-0 bg-transparent p-0 text-sm outline-none ring-0 placeholder:text-gray-400 dark:placeholder:text-rdia-400"
                />
                {keywordsDraft.trim() && (
                  <button
                    type="button"
                    onClick={addKeyword}
                    className="btn-primaire px-2.5 py-1 text-[11px]"
                  >
                    {t.f_keywords_add}
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{t.f_keywords_hint}</p>
            </div>

            {/* BOUTON UNIQUE DE GÉNÉRATION IA */}
            <button
              type="button"
              onClick={() => void runAiGenerate()}
              disabled={!type || keywordsList.length === 0 || aiBusy}
              className="btn-primaire inline-flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon path={aiBusy ? UI_ICONS.refresh : UI_ICONS.sparkles} size={15} className={aiBusy ? "animate-spin" : ""} />
              {aiBusy ? "…" : aiGenerated ? t.f_ai_regenerate : t.f_ai_generate}
            </button>

            {/* ZONE TITRE + DESCRIPTION : APPARAÎT SEULEMENT APRÈS GÉNÉRATION */}
            {aiGenerated ? (
              <div className="flex flex-col gap-4 rounded-xl border border-or-500/15 bg-or-500/[0.03] p-3 dark:border-or-500/20 dark:bg-or-500/[0.05]">
                {/* Indicateur IA générée + hint fallback */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-or-600 dark:text-or-300">
                      <Icon path={UI_ICONS.sparkles} size={13} /> AI · {t.f_generated_hint}
                    </div>
                  </div>
                </div>

                {/* TITRE généré, éditable + bouton paraphraser */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={labelCls}>{t.f_generated_title}</label>
                    <button
                      type="button"
                      onClick={() => void regenTitle()}
                      disabled={aiBusyT || aiBusy || !aiGenerated}
                      className="inline-flex items-center gap-1 rounded-md border border-or-500/30 bg-or-500/10 px-2 py-0.5 text-[10px] font-semibold text-or-700 transition-colors hover:bg-or-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-or-300"
                    >
                      <Icon path={aiBusyT ? UI_ICONS.refresh : UI_ICONS.sparkles} size={11} className={aiBusyT ? "animate-spin" : ""} />
                      {aiBusyT ? t.f_ai_busy_title : t.f_ai_regen_title}
                    </button>
                  </div>
                  <input
                    className={`${fieldCls} min-w-0`}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Titre de l'incident…"
                  />
                </div>

                {/* DESCRIPTION générée, éditable + bouton paraphraser */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className={labelCls}>{t.f_generated_desc}</label>
                    <button
                      type="button"
                      onClick={() => void regenDesc()}
                      disabled={aiBusyD || aiBusy || !aiGenerated}
                      className="inline-flex items-center gap-1 rounded-md border border-or-500/30 bg-or-500/10 px-2 py-0.5 text-[10px] font-semibold text-or-700 transition-colors hover:bg-or-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-or-300"
                    >
                      <Icon path={aiBusyD ? UI_ICONS.refresh : UI_ICONS.sparkles} size={11} className={aiBusyD ? "animate-spin" : ""} />
                      {aiBusyD ? t.f_ai_busy_desc : t.f_ai_regen_desc}
                    </button>
                  </div>
                  <textarea
                    className={fieldCls}
                    rows={4}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Description de l'incident (2 lignes)…"
                  />
                </div>
              </div>
            ) : (
              // Placeholder tant que la génération n'a pas été faite.
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-rdia-600/60 dark:bg-white/[0.02] dark:text-rdia-400">
                {t.f_ai_generate}{" → "}<span className="text-gray-500 dark:text-rdia-300">{t.f_title} + {t.f_desc}</span>
              </div>
            )}

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

            {/* Pièces jointes (toujours visible, après les champs précédents) */}
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
