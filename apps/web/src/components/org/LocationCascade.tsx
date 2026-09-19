"use client";

import { useMemo } from "react";
import { useArgos, useDict } from "@/lib/store";
import { citiesOf, provinceLL, provincesOf, regionsOf } from "@/lib/geo";
import type { City, Province } from "@/lib/types";

// ============================================================================
// Cascade Région → Province → Ville — LE sélecteur de lieu de l'application.
//
// Chaque modale à localisation (unité, hôpital, abri, rattachement d'un compte)
// l'emploie ; aucune ne refait ses listes. Changer la région vide la province
// si elle n'en est plus, changer la province vide la ville si elle n'en est
// plus : on ne peut pas afficher Safi sous Chichaoua. Le référentiel des
// communes est COMPLET (urbaines et rurales) : une commune se cherche d'abord
// dans la province choisie — des homonymes existent d'une province à l'autre.
// ============================================================================

/** La commune nommée, dans la province donnée d'abord ; sinon la première de ce nom. */
export function findCity(cities: readonly City[], name: string, province?: string): City | undefined {
  if (!name) return undefined;
  return (province ? cities.find((c) => c.v === name && c.province === province) : undefined) ?? cities.find((c) => c.v === name);
}

export interface LocationValue {
  region: string;
  province: string;
  city: string;
}

export const EMPTY_LOCATION: LocationValue = { region: "", province: "", city: "" };

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const inputCls = "input-champ text-sm";

export function LocationCascade({
  value,
  onChange,
  withCity = true,
  disabled = false,
  layout = "row",
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  /** Sans ville : région et province seulement (rattachement d'un compte, par exemple). */
  withCity?: boolean;
  disabled?: boolean;
  /** `column` empile les trois listes — pour un volet étroit comme celui du wizard. */
  layout?: "row" | "column";
}) {
  const t = useDict();
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const regions = useMemo(() => regionsOf(provinces), [provinces]);
  const provs = useMemo(() => provincesOf(provinces, value.region || undefined), [provinces, value.region]);
  const villes = useMemo(
    () => citiesOf(cities, value.province || undefined, value.region || undefined),
    [cities, value.province, value.region],
  );

  const setRegion = (region: string) => {
    const p = provinces.find((x) => x.v === value.province);
    const province = p && p.region === region ? value.province : "";
    const c = findCity(cities, value.city, value.province);
    const city = c && c.region === region && (!province || c.province === province) ? value.city : "";
    onChange({ region, province, city });
  };
  const setProvince = (province: string) => {
    const p = provinces.find((x) => x.v === province);
    const c = findCity(cities, value.city, province);
    onChange({
      region: p?.region ?? value.region,
      province,
      city: c && (!province || c.province === province) ? value.city : "",
    });
  };
  const setCity = (city: string) => {
    const c = findCity(cities, city, value.province);
    onChange({ region: c?.region ?? value.region, province: c?.province ?? value.province, city });
  };

  return (
    <div className={`grid grid-cols-1 gap-3 ${layout === "column" ? "" : withCity ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      <div>
        <label className={labelCls}>{t.f_region}</label>
        <select className={inputCls} value={value.region} onChange={(e) => setRegion(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {regions.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t.f_prov}</label>
        <select className={inputCls} value={value.province} onChange={(e) => setProvince(e.target.value)} disabled={disabled}>
          <option value="">—</option>
          {provs.map((p) => (
            <option key={p.v} value={p.v}>{p.v}</option>
          ))}
        </select>
      </div>
      {withCity && (
        <div>
          <label className={labelCls}>{t.f_city}</label>
          <select className={inputCls} value={value.city} onChange={(e) => setCity(e.target.value)} disabled={disabled}>
            <option value="">—</option>
            {villes.map((c) => (
              <option key={`${c.province}/${c.v}`} value={c.v}>{c.v}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** La province choisie, résolue dans le référentiel. */
export function locationProvince(value: LocationValue, provinces: readonly Province[]): Province | undefined {
  return provinces.find((p) => p.v === value.province);
}

/** Coordonnées du lieu : la ville si elle est nommée, sinon le chef-lieu de la province. */
export function locationLL(value: LocationValue, provinces: readonly Province[], cities: readonly City[]): [number, number] | undefined {
  const c = findCity(cities, value.city, value.province);
  if (c) return c.ll;
  const p = locationProvince(value, provinces);
  return p ? provinceLL(p) : undefined;
}
