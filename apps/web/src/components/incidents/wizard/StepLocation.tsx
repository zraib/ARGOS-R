"use client";

import dynamic from "next/dynamic";
import { Icon } from "@/components/ui/Icon";
import { LocationCascade } from "@/components/org/LocationCascade";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";
import { coordsText, locationLocks, type WizardForm } from "@/lib/incidents/wizard";
import type { City } from "@/lib/types";
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

/**
 * Étape 3 — localisation : tout en une vue, pilotée par l'aperçu carte réel.
 *
 * Trois façons de dire où : la cascade région → province → ville, les
 * coordonnées, ou un point sur la carte. Une seule tient à la fois — l'autre
 * côté se remplit tout seul et se verrouille ; le point posé sur la carte
 * remplit tout sans rien verrouiller. La ligne sous les champs dit qui tient
 * et comment reprendre la main.
 */
export function StepLocation({ form, cities, loc }: { form: WizardForm; cities: City[]; loc: ReturnType<typeof useLocationFields> }) {
  const t = useDict();
  const locks = locationLocks(form);
  const hint =
    form.locMode === "admin" ? t.wz_loc_hint_admin : form.locMode === "coords" ? t.wz_loc_hint_coords : form.locMode === "point" ? t.wz_loc_hint_point : null;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(240px,300px)_1fr]">
      <div className="flex flex-col gap-3">
        <div>
          <label className={labelCls}>{t.f_addr}</label>
          <input list="loc-places" className={fieldCls} value={form.adresse} onChange={(e) => loc.onAddress(e.target.value)} placeholder={t.f_addr} />
          <datalist id="loc-places">
            {/* Homonymes d'une province à l'autre : la clé porte la province. */}
            {cities.map((c) => (
              <option key={`${c.province}/${c.v}`} value={c.v} />
            ))}
          </datalist>
        </div>

        <LocationCascade
          value={{ region: form.region, province: form.prov, city: form.city }}
          onChange={loc.onPlace}
          disabled={locks.admin}
          layout="column"
        />

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>{t.wz_lat}</label>
            <input
              className="input-champ font-mono text-sm"
              inputMode="decimal"
              placeholder="31.630"
              value={form.lat}
              disabled={locks.coords}
              onChange={(e) => loc.onLat(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>{t.wz_lng}</label>
            <input
              className="input-champ font-mono text-sm"
              inputMode="decimal"
              placeholder="-8.010"
              value={form.lng}
              disabled={locks.coords}
              onChange={(e) => loc.onLng(e.target.value)}
            />
          </div>
        </div>

        {hint && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:border-rdia-600 dark:bg-rdia-800 dark:text-rdia-300">
            <span>{hint}</span>
            <button type="button" className="shrink-0 font-semibold text-rdia-600 hover:underline dark:text-or-400" onClick={loc.clear}>
              {t.wz_loc_clear}
            </button>
          </div>
        )}

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
