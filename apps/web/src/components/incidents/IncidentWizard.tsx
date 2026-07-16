"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS, TYPE_ICONS } from "@/lib/icons";
import { svgToLL, svgLatLon, typeLabel } from "@/lib/helpers";
import type { IncidentType } from "@/lib/types";

const TYPES: IncidentType[] = ["earthquake", "flood", "wildfire", "landslide", "epidemic", "industrial"];

interface Pt {
  x: number;
  y: number;
}

/** Assistant « Signaler un incident » en 3 étapes (type → détails → localisation). */
export function IncidentWizard() {
  const t = useDict();
  const open = useArgos((s) => s.wizOpen);
  const close = useArgos((s) => s.closeWizard);
  const loadDomain = useArgos((s) => s.loadDomain);
  const provinces = useArgos((s) => s.provinces);
  const showToast = useArgos((s) => s.showToast);

  const [step, setStep] = useState(1);
  const [type, setType] = useState<IncidentType | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [prov, setProv] = useState("");
  const [pt, setPt] = useState<Pt | null>(null);

  const province = useMemo(() => provinces.find((p) => p.v === prov), [prov, provinces]);

  const reset = () => {
    setStep(1);
    setType(null);
    setTitle("");
    setDesc("");
    setFiles([]);
    setProv("");
    setPt(null);
  };
  const onClose = () => {
    reset();
    close();
  };

  const canNext = step === 1 ? !!type : step === 2 ? !!title.trim() : true;
  const canSubmit = !!(pt || province);

  const coordsTxt = pt ? svgLatLon(pt.x, pt.y) : province ? svgLatLon(province.x, province.y) : "—";

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

  const submit = async () => {
    if (!canSubmit) return;
    const p = province ?? provinces[0];
    const point = pt ?? { x: p.x, y: p.y };
    const [lng, lat] = svgToLL(point.x, point.y);
    // Déclaration via l'API (auditée côté serveur), puis rechargement du domaine.
    await api.createIncident({
      type: type ?? "earthquake",
      titre: title.trim() || typeLabel(type ?? "earthquake", t) + (prov ? ` — ${prov}` : ""),
      region: province ? province.region : "—",
      sev: "medium",
      st: "open",
      x: point.x,
      y: point.y,
      ll: [lng, lat],
    });
    await loadDomain();
    showToast(t.toast_ok);
    onClose();
  };

  const steps = [t.wz1, t.wz2, t.wz3];

  return (
    <Modal open={open} title={t.wiz_title} onClose={onClose} size="lg">
      <div className="flex flex-col gap-5">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-4">
          {steps.map((label, i) => {
            const num = i + 1;
            const done = step > num;
            const current = step === num;
            return (
              <div key={label} className="flex items-center gap-2">
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

        {/* Step 1 — type */}
        {step === 1 && (
          <div className="grid grid-cols-3 gap-3">
            {TYPES.map((k) => (
              <button
                key={k}
                onClick={() => setType(k)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-xs font-semibold transition-all ${
                  type === k
                    ? "border-or-500 bg-or-500/10 text-or-500"
                    : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                }`}
              >
                <Icon path={TYPE_ICONS[k]} size={26} strokeWidth={1.6} />
                <span className="text-center leading-tight">{typeLabel(k, t)}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — details */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.f_title}</label>
              <input className="input-champ text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.f_desc}</label>
              <textarea className="input-champ text-sm" rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.f_attach}</label>
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

        {/* Step 3 — location */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.f_prov}</label>
                <select className="input-champ text-sm" value={prov} onChange={(e) => setProv(e.target.value)}>
                  <option value="">—</option>
                  {provinces.map((p) => (
                    <option key={p.v} value={p.v}>
                      {p.v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.f_coords}</label>
                <div className="input-champ font-mono text-sm text-gray-500 dark:text-rdia-300">{coordsTxt}</div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] text-gray-400 dark:text-rdia-400">{t.pick_map}</div>
              <div className="overflow-hidden rounded-xl" style={{ background: "#10202f", height: 300 }}>
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
          </div>
        )}

        {/* Footer nav */}
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
              <button className="btn-primaire text-sm" onClick={() => void submit()} disabled={!canSubmit}>{t.submit}</button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
