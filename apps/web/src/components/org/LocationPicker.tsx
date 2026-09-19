"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useArgos, useModules } from "@/lib/store";
import { resolvePoint } from "@/lib/geo";
import { EMPTY_LOCATION, LocationCascade, locationLL, type LocationValue } from "@/components/org/LocationCascade";

// ============================================================================
// Le sélecteur de lieu des entités (unité, hôpital, abri, site mortuaire), à la
// création comme à la modification — le même geste qu'à la déclaration d'un
// incident : la cascade Région → Province → Commune, puis un point posé sur la
// carte. Le point PRIME : posé, il déduit région, province et commune (la
// commune la plus proche du référentiel complet) ; choisir dans la cascade
// recentre la carte sur la commune et efface le point.
// ============================================================================

// La carte d'aperçu est chargée à la demande (MapLibre n'a pas de rendu serveur).
const LocationPreviewMap = dynamic(() => import("@/components/incidents/LocationPreviewMap").then((x) => x.LocationPreviewMap), { ssr: false });

export interface LocationState {
  loc: LocationValue;
  /** Point posé sur la carte [lng, lat] ; `null` tant que la cascade seule parle. */
  pin: [number, number] | null;
}

/**
 * L'état du sélecteur et ses gestes. `onCity` reçoit la commune déduite (point
 * posé ou choisie dans la cascade) pour remplir le champ « commune » du
 * formulaire, qui reste libre pour une localité absente du référentiel.
 */
export function useLocationPicker(initial: Partial<LocationState> = {}, onCity?: (city: string) => void) {
  const provinces = useArgos((s) => s.provinces);
  const cities = useArgos((s) => s.cities);
  const [loc, setLoc] = useState<LocationValue>(initial.loc ?? EMPTY_LOCATION);
  const [pin, setPin] = useState<[number, number] | null>(initial.pin ?? null);

  const onPin = useCallback(
    (ll: [number, number]) => {
      setPin(ll);
      const r = resolvePoint(ll, { provinces, cities });
      if (r.region || r.province) setLoc({ region: r.region ?? "", province: r.province ?? "", city: r.city ?? "" });
      if (r.city) onCity?.(r.city);
    },
    [provinces, cities, onCity],
  );
  const onLoc = useCallback(
    (next: LocationValue) => {
      setLoc(next);
      setPin(null);
      if (next.city) onCity?.(next.city);
    },
    [onCity],
  );
  const reset = useCallback((next: Partial<LocationState> = {}) => {
    setLoc(next.loc ?? EMPTY_LOCATION);
    setPin(next.pin ?? null);
  }, []);

  // Ce que la carte montre, et ce que le formulaire enverra : le point, sinon la commune, sinon le chef-lieu.
  const ll = useMemo(() => pin ?? locationLL(loc, provinces, cities), [pin, loc, provinces, cities]);
  return { loc, pin, ll: ll ?? undefined, onPin, onLoc, reset, ready: !!(loc.province || pin) };
}

/** La cascade, la carte et la ligne de coordonnées — à poser dans le formulaire. */
export function LocationPicker({
  picker,
  height = "h-56",
  cascadeLayout = "row",
  value,
}: {
  picker: ReturnType<typeof useLocationPicker>;
  /** Hauteur de la carte (classe Tailwind). */
  height?: string;
  cascadeLayout?: "row" | "column";
  /** Point montré par la carte quand le formulaire en connaît un meilleur (l'établissement de rattachement…). */
  value?: [number, number] | null;
}) {
  const m = useModules();
  return (
    <>
      <LocationCascade value={picker.loc} onChange={picker.onLoc} layout={cascadeLayout} />
      <div className={`${height} overflow-hidden rounded-lg border border-gray-200 dark:border-rdia-600`}>
        <LocationPreviewMap value={value !== undefined ? value : (picker.ll ?? null)} onPick={picker.onPin} labels={{ hint: m.morgue.a_map_hint, full: m.morgue.a_map_full, exit: m.morgue.a_map_exit }} />
      </div>
      {picker.pin && (
        <p className="-mt-2 font-mono text-[11px] text-gray-500 dark:text-rdia-300">
          {picker.pin[1].toFixed(4)}, {picker.pin[0].toFixed(4)}
        </p>
      )}
    </>
  );
}
