"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { svgToLL, llToSvg, svgLatLon, typeLabel } from "@/lib/helpers";
import type { Province } from "@/lib/types";

interface Pt {
  x: number;
  y: number;
}

/** Mode de localisation de l'étape 3 (six méthodes, un seul emplacement). */
type LocMode = "prov" | "city" | "address" | "coords" | "map" | "geo";

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

/**
 * Assistant « Signaler un incident » en 3 étapes (type → détails → localisation).
 * Les types viennent du catalogue paramétrable de l'API ; la localisation accepte
 * province/ville (référentiel complet), coordonnées, clic carte ou géolocalisation.
 */
export function IncidentWizard() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const open = useArgos((s) => s.wizOpen);
  const initLL = useArgos((s) => s.wizInitLL);
  const close = useArgos((s) => s.closeWizard);
  const loadDomain = useArgos((s) => s.loadDomain);
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const showToast = useArgos((s) => s.showToast);

  const [step, setStep] = useState(1);
  const [type, setType] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [mode, setMode] = useState<LocMode>("prov");
  const [prov, setProv] = useState("");
  const [city, setCity] = useState("");
  const [adresse, setAdresse] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [pt, setPt] = useState<Pt | null>(null);
  const [geoErr, setGeoErr] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ouverture depuis la carte (Shift+clic droit) : coordonnées pré-remplies.
  useEffect(() => {
    if (open && initLL) {
      setMode("coords");
      setLng(initLL[0].toFixed(5));
      setLat(initLL[1].toFixed(5));
    }
  }, [open, initLL]);

  const province = useMemo(() => provinces.find((p) => p.v === prov), [prov, provinces]);
  const selectedCity = useMemo(() => cities.find((c) => c.v === city), [city, cities]);
  const coordsValid = useMemo(() => {
    const la = parseFloat(lat);
    const lo = parseFloat(lng);
    return Number.isFinite(la) && Number.isFinite(lo) && la >= 20 && la <= 37 && lo >= -18 && lo <= 0;
  }, [lat, lng]);

  /** Position résolue [lng, lat] selon le mode actif. */
  const resolvedLL = useMemo((): [number, number] | null => {
    if ((mode === "coords" || mode === "geo") && coordsValid) return [parseFloat(lng), parseFloat(lat)];
    if (mode === "map" && pt) return svgToLL(pt.x, pt.y);
    if (mode === "prov" && province) return province.ll ?? svgToLL(province.x, province.y);
    if (mode === "city" && selectedCity) return selectedCity.ll;
    // Adresse : rattachée à une province (source des coordonnées).
    if (mode === "address" && province) return province.ll ?? svgToLL(province.x, province.y);
    return null;
  }, [mode, coordsValid, lng, lat, pt, province, selectedCity]);

  const reset = () => {
    setStep(1); setType(null); setTitle(""); setDesc(""); setFiles([]);
    setMode("prov"); setProv(""); setCity(""); setAdresse(""); setLat(""); setLng(""); setPt(null); setGeoErr(false);
  };
  const onClose = () => { reset(); close(); };

  const canNext = step === 1 ? !!type : step === 2 ? !!title.trim() : true;
  const canSubmit = resolvedLL !== null;
  const coordsTxt = resolvedLL ? svgLatLon(llToSvg(resolvedLL).x, llToSvg(resolvedLL).y) : "—";

  const mapPick = (e: MouseEvent<SVGSVGElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const vb = { x: 60, y: 40, w: 320, h: 420 };
    const scale = Math.min(r.width / vb.w, r.height / vb.h);
    const ox = (r.width - vb.w * scale) / 2;
    const oy = (r.height - vb.h * scale) / 2;
    const x = vb.x + (e.clientX - r.left - ox) / scale;
    const y = vb.y + (e.clientY - r.top - oy) / scale;
    setPt({ x: Math.round(x), y: Math.round(y) });
  };

  const useGeolocation = () => {
    setGeoErr(false);
    if (!navigator.geolocation) { setGeoErr(true); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      () => setGeoErr(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = async () => {
    if (!canSubmit || !resolvedLL || busy) return;
    setBusy(true);
    try {
      const { x, y } = llToSvg(resolvedLL);
      const attachedProv = province ?? nearestProvince(resolvedLL, provinces);
      // Lieu affiché : ville sélectionnée, sinon province de rattachement.
      const place = mode === "city" ? selectedCity?.v : attachedProv?.v;
      const region = mode === "city" ? selectedCity?.region ?? attachedProv?.region ?? "—" : attachedProv?.region ?? "—";
      // Déclaration via l'API (auditée côté serveur), puis rechargement du domaine.
      await api.createIncident({
        type: type ?? incidentTypes[0]?.id ?? "earthquake",
        titre: title.trim() || typeLabel(type ?? "", incidentTypes, lang) + (place ? ` — ${place}` : ""),
        region,
        adresse: adresse.trim() || undefined,
        sev: "medium",
        st: "open",
        x,
        y,
        ll: resolvedLL,
      });
      await loadDomain();
      showToast(t.toast_ok);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const steps = [t.wz1, t.wz2, t.wz3];
  const modes: [LocMode, string][] = [
    ["prov", t.wz_mode_prov],
    ["city", t.wz_mode_city],
    ["address", t.wz_mode_address],
    ["coords", t.wz_mode_coords],
    ["map", t.wz_mode_map],
    ["geo", t.wz_mode_geo],
  ];
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <Modal open={open} title={t.wiz_title} onClose={onClose} size="xl">
      <div className="flex flex-col gap-5">
        {/* Stepper — trois colonnes égales : espacement uniforme entre les étapes */}
        <div className="grid grid-cols-3">
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
                <span className={`text-xs ${current ? "font-bold text-or-500" : "text-gray-400 dark:text-rdia-400"}`}>{label}</span>
              </div>
            );
          })}
        </div>

        {/* Étape 1 — type (catalogue paramétrable servi par l'API) */}
        {step === 1 && (
          <div className="grid max-h-[46vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {incidentTypes.map((def) => (
              <button
                key={def.id}
                onClick={() => setType(def.id)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-xs font-semibold transition-all ${
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
            <div>
              <label className={labelCls}>{t.f_title}</label>
              <input className="input-champ text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>{t.f_desc}</label>
              <textarea className="input-champ text-sm" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
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

        {/* Étape 3 — localisation : province/ville, coordonnées, carte ou géolocalisation */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            {/* Sélecteur de mode */}
            <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-rdia-800/60" style={{ width: "fit-content" }}>
              {modes.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === k ? "bg-white text-or-600 shadow-sm dark:bg-rdia-600 dark:text-or-400" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Mode : province (chefs-lieux — référentiel complet du Royaume) */}
              {mode === "prov" && (
                <div>
                  <label className={labelCls}>{t.f_prov}</label>
                  <select className="input-champ text-sm" value={prov} onChange={(e) => setProv(e.target.value)}>
                    <option value="">—</option>
                    {provinces.map((p) => (
                      <option key={p.v} value={p.v}>{p.v} — {p.region}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode : ville / commune (localisation fine) */}
              {mode === "city" && (
                <div>
                  <label className={labelCls}>{t.f_city}</label>
                  <select className="input-champ text-sm" value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="">—</option>
                    {cities.map((c) => (
                      <option key={c.v} value={c.v}>{c.v} — {c.region}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mode : adresse / lieu-dit rattachée à une province */}
              {mode === "address" && (
                <>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>{t.f_addr}</label>
                    <input className="input-champ text-sm" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder={t.f_addr} />
                  </div>
                  <div>
                    <label className={labelCls}>{t.wz_prov_anchor}</label>
                    <select className="input-champ text-sm" value={prov} onChange={(e) => setProv(e.target.value)}>
                      <option value="">—</option>
                      {provinces.map((p) => (
                        <option key={p.v} value={p.v}>{p.v} — {p.region}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {/* Mode : coordonnées manuelles ou position du poste */}
              {(mode === "coords" || mode === "geo") && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{t.wz_lat}</label>
                    <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="31.630" value={lat} onChange={(e) => setLat(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>{t.wz_lng}</label>
                    <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="-8.010" value={lng} onChange={(e) => setLng(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Coordonnées résolues — récapitulatif, tous modes */}
              <div>
                <label className={labelCls}>{t.f_coords}</label>
                <div className="input-champ font-mono text-sm text-gray-500 dark:text-rdia-300">{coordsTxt}</div>
              </div>
            </div>

            {/* Mode : géolocalisation du poste (position réelle de l'appareil) */}
            {mode === "geo" && (
              <div className="flex items-center gap-3">
                <button className="btn-secondaire flex items-center gap-2 text-sm" onClick={useGeolocation}>
                  <Icon path={UI_ICONS.users} size={14} />
                  {t.wz_geo_btn}
                </button>
                {geoErr && <span className="text-xs font-semibold text-danger-500">{t.wz_geo_err}</span>}
              </div>
            )}

            {/* Mode : clic sur la carte */}
            {mode === "map" && (
              <div>
                <div className="mb-1 text-[10px] text-gray-400 dark:text-rdia-400">{t.pick_map}</div>
                <div className="overflow-hidden rounded-xl" style={{ background: "#10202f", height: 360 }}>
                  <svg viewBox="60 40 320 420" className="h-full w-full" style={{ display: "block", cursor: "crosshair" }} onClick={mapPick}>
                    <path
                      d="M218,52 L196,148 L176,176 L156,196 L136,240 L120,278 L112,330 L96,368 L82,404 L52,436 L58,458 L30,516 L24,596 L38,678 L120,676 L128,600 L180,560 L190,500 L232,470 L262,448 L306,428 L338,398 L356,342 L398,286 L420,208 L396,150 L390,94 L354,98 L302,86 L245,62 Z"
                      fill="#1B4D2E"
                      stroke="#C9A84C"
                      strokeWidth={1}
                      strokeOpacity={0.5}
                    />
                    <path d="M150,300 L180,282 L210,272 L250,250 L290,230 L330,214 L360,200" fill="none" stroke="#0f3d22" strokeWidth={7} strokeLinecap="round" opacity={0.8} />
                    <g fill="rgba(255,255,255,0.45)" fontSize={9} fontFamily="Inter, sans-serif">
                      <circle cx={196} cy={148} r={1.5} /><text x={202} y={145}>Rabat</text>
                      <circle cx={180} cy={262} r={1.5} /><text x={186} y={258}>Marrakech</text>
                      <circle cx={112} cy={330} r={1.5} /><text x={118} y={327}>Agadir</text>
                      <circle cx={268} cy={140} r={1.5} /><text x={274} y={137}>Fès</text>
                      <circle cx={378} cy={120} r={1.5} /><text x={352} y={112}>Oujda</text>
                    </g>
                    {pt && (
                      <g transform={`translate(${pt.x} ${pt.y})`}>
                        <circle r={10} fill="none" stroke="#C9A84C" strokeWidth={1.5} style={{ animation: "cgc-ping 1.8s ease-out infinite", transformOrigin: "center" }} />
                        <path d="M0,-7 L7,6 L-7,6 Z" fill="#C9A84C" stroke="#0f1f14" strokeWidth={1} />
                      </g>
                    )}
                  </svg>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-rdia-700/50">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <div className="flex gap-2">
            {step > 1 && (
              <button className="btn-secondaire text-sm" onClick={() => setStep((s) => Math.max(1, s - 1))}>{t.prev}</button>
            )}
            {step < 3 && (
              <button className="btn-primaire text-sm" onClick={() => canNext && setStep((s) => Math.min(3, s + 1))} disabled={!canNext}>
                {t.next}
              </button>
            )}
            {step === 3 && (
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
