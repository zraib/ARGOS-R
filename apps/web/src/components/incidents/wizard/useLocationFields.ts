"use client";

import { useState } from "react";
import { matchPlace } from "@/lib/incidents/wizard";
import { svgToLL } from "@/lib/helpers";
import type { City, Province } from "@/lib/types";
import type { WizardActions } from "./useWizardForm";

// ============================================================================
// Les gestes de l'étape localisation : chaque saisie qui désigne un lieu POSE
// LE POINT, et le point est la seule vérité (les champs lat/lng en découlent).
// La géolocalisation du navigateur n'est qu'une façon de plus de le poser.
// ============================================================================

export function useLocationFields(actions: WizardActions, cities: City[], provinces: Province[]) {
  const [geoErr, setGeoErr] = useState(false);

  const onAddress = (v: string) => {
    actions.patch({ adresse: v });
    const m = matchPlace(v, cities, provinces);
    if (m) actions.setPoint(m);
  };
  const onProv = (v: string) => {
    const p = provinces.find((x) => x.v === v);
    actions.update((f) => {
      // Une ville d'une autre région ne survit pas au changement de province.
      const c = cities.find((x) => x.v === f.city);
      return { prov: v, ...(p && c && c.region !== p.region ? { city: "" } : {}) };
    });
    if (p) actions.setPoint(p.ll ?? svgToLL(p.x, p.y));
  };
  const onCity = (v: string) => {
    actions.patch({ city: v });
    const c = cities.find((x) => x.v === v);
    if (c) actions.setPoint(c.ll);
  };
  const onLat = (v: string) =>
    actions.update((f) => {
      const la = parseFloat(v);
      const lo = parseFloat(f.lng);
      return { lat: v, ...(Number.isFinite(la) && Number.isFinite(lo) ? { pt: [lo, la] as [number, number] } : {}) };
    });
  const onLng = (v: string) =>
    actions.update((f) => {
      const la = parseFloat(f.lat);
      const lo = parseFloat(v);
      return { lng: v, ...(Number.isFinite(la) && Number.isFinite(lo) ? { pt: [lo, la] as [number, number] } : {}) };
    });

  const locate = () => {
    setGeoErr(false);
    if (!navigator.geolocation) {
      setGeoErr(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => actions.setPoint([pos.coords.longitude, pos.coords.latitude]),
      () => setGeoErr(true),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return { onAddress, onProv, onCity, onLat, onLng, onPick: actions.setPoint, locate, geoErr, resetGeoErr: () => setGeoErr(false) };
}
