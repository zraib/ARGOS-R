"use client";

import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";
import { coordsText, type WizardForm } from "@/lib/incidents/wizard";
import type { City, Province } from "@/lib/types";
import { fieldCls, labelCls } from "./styles";
import type { useLocationFields } from "./useLocationFields";

// Aperçu carte réel chargé côté client uniquement (MapLibre accède à window).
const LocationPreviewMap = dynamic(
  () => import("@/components/incidents/LocationPreviewMap").then((m) => m.LocationPreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-400 dark:border-rdia-600 dark:bg-rdia-800">
        …
      </div>
    ),
  },
);

/** Étape 3 — localisation : tout en une vue, pilotée par l'aperçu carte réel. */
export function StepLocation({
  form,
  cities,
  provinces,
  cityOptions,
  loc,
}: {
  form: WizardForm;
  cities: City[];
  provinces: Province[];
  cityOptions: City[];
  loc: ReturnType<typeof useLocationFields>;
}) {
  const t = useDict();
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(240px,300px)_1fr]">
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>{t.f_addr}</label>
          <input list="loc-places" className={fieldCls} value={form.adresse} onChange={(e) => loc.onAddress(e.target.value)} placeholder={t.f_addr} />
          <datalist id="loc-places">
            {cities.map((c) => (
              <option key={c.v} value={c.v} />
            ))}
          </datalist>
        </div>

        <div>
          <label className={labelCls}>{t.f_prov}</label>
          <select className={fieldCls} value={form.prov} onChange={(e) => loc.onProv(e.target.value)}>
            <option value="">—</option>
            {provinces.map((p) => (
              <option key={p.v} value={p.v}>
                {p.v} — {p.region}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>{t.f_city}</label>
          <select className={fieldCls} value={form.city} onChange={(e) => loc.onCity(e.target.value)}>
            <option value="">—</option>
            {cityOptions.map((c) => (
              <option key={c.v} value={c.v}>
                {form.prov ? c.v : `${c.v} — ${c.region}`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t.wz_lat}</label>
            <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="31.630" value={form.lat} onChange={(e) => loc.onLat(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{t.wz_lng}</label>
            <input className="input-champ font-mono text-sm" inputMode="decimal" placeholder="-8.010" value={form.lng} onChange={(e) => loc.onLng(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondaire flex items-center gap-2 text-xs" onClick={loc.locate}>
            <Icon path={UI_ICONS.users} size={14} />
            {t.wz_geo_btn}
          </button>
          {loc.geoErr && <span className="text-[11px] font-semibold text-danger-500">{t.wz_geo_err}</span>}
        </div>

        <div>
          <label className={labelCls}>{t.f_coords}</label>
          <div className="input-champ font-mono text-sm text-gray-500 dark:text-rdia-300">{coordsText(form.pt)}</div>
        </div>
      </div>

      {/* Colonne carte : haut aligné sur le champ adresse (étiquette fantôme),
          bas sur la case coordonnées (la carte remplit la hauteur restante). */}
      <div className="flex flex-col">
        <label className={`${labelCls} invisible`} aria-hidden="true">
          {t.f_addr}
        </label>
        <div className="min-h-[300px] flex-1">
          <LocationPreviewMap value={form.pt} onPick={loc.onPick} labels={{ hint: t.wz_map_hint, full: t.wz_fullscreen, exit: t.wz_exit_full }} />
        </div>
      </div>
    </div>
  );
}
