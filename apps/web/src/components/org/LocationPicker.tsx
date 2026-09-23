"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useArgos, useDict, useModules } from "@/lib/store";
import { parseCoordinate, parseCoordinatePair, resolvePoint } from "@/lib/geo";
import { EMPTY_LOCATION, LocationCascade, locationLL, type LocationValue } from "@/components/org/LocationCascade";

// ============================================================================
// Le sélecteur de lieu des entités (unité, hôpital, hôpital de campagne, abri,
// site mortuaire, morgue mobile), à la création comme à la modification — le
// même geste qu'à la déclaration d'un incident : la cascade Région → Province
// → Commune, puis un point posé sur la carte, ou des COORDONNÉES tapées
// (ADR 0030 : relevé GPS, carte d'état-major, point collé — degrés décimaux,
// virgule française, degrés-minutes-secondes, paire « lat, lng »). Le point
// PRIME : posé ou tapé, il déduit région, province et commune (la commune la
// plus proche du référentiel complet) ; choisir dans la cascade recentre la
// carte sur la commune et efface le point.
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

/** La cascade, la carte et les coordonnées — à poser dans le formulaire. */
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
      <CoordinateFields point={picker.pin ?? picker.ll ?? null} onPoint={picker.onPin} />
    </>
  );
}

/**
 * Latitude et longitude, lues et écrites (ADR 0030). Elles montrent le point
 * en cours (posé, ou la commune choisie) ; tapées — ou une paire collée dans
 * la latitude —, elles posent le point à la validation (sortie du champ ou
 * Entrée). Ce qui ne se lit pas est signalé, jamais converti au hasard.
 */
export function CoordinateFields({ point, onPoint }: { point: [number, number] | null; onPoint: (ll: [number, number]) => void }) {
  const t = useDict();
  const fmt = (v: number | undefined) => (v === undefined ? "" : v.toFixed(5));
  const [lat, setLat] = useState(fmt(point?.[1]));
  const [lng, setLng] = useState(fmt(point?.[0]));
  const [erreur, setErreur] = useState(false);
  // Le point bouge (clic sur la carte, commune choisie) : les champs le suivent.
  useEffect(() => {
    setLat(fmt(point?.[1]));
    setLng(fmt(point?.[0]));
    setErreur(false);
  }, [point?.[0], point?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const valider = () => {
    // Une paire collée dans la latitude (« 31.22, -8.24 ») prime.
    const paire = parseCoordinatePair(lat);
    if (paire) { setErreur(false); onPoint(paire); return; }
    if (!lat.trim() && !lng.trim()) { setErreur(false); return; }
    const la = parseCoordinate(lat, "lat");
    const lo = parseCoordinate(lng, "lng");
    if (la === null || lo === null) { setErreur(true); return; }
    setErreur(false);
    if (!point || Math.abs(point[1] - la) > 1e-7 || Math.abs(point[0] - lo) > 1e-7) onPoint([lo, la]);
  };
  const touche = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); valider(); }
  };
  const champ = `input-champ w-full font-mono text-base md:text-sm ${erreur ? "border-danger-500" : ""}`;
  return (
    <div className="-mt-1 flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600 dark:text-rdia-200">
          {t.loc_lat}
          <input className={champ} value={lat} onChange={(e) => setLat(e.target.value)} onBlur={valider} onKeyDown={touche} placeholder="31.22000" inputMode="decimal" spellCheck={false} aria-invalid={erreur} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-gray-600 dark:text-rdia-200">
          {t.loc_lng}
          <input className={champ} value={lng} onChange={(e) => setLng(e.target.value)} onBlur={valider} onKeyDown={touche} placeholder="-8.24000" inputMode="decimal" spellCheck={false} aria-invalid={erreur} />
        </label>
      </div>
      <p className={`text-[10.5px] leading-snug ${erreur ? "font-semibold text-danger-500" : "text-gray-400 dark:text-rdia-400"}`} role={erreur ? "alert" : undefined}>
        {erreur ? t.loc_coords_invalid : t.loc_coords_hint}
      </p>
    </div>
  );
}
