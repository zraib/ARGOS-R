"use client";

import { useState } from "react";
import type { WizardActions } from "./useWizardForm";

// ============================================================================
// Les gestes de l'étape localisation. Ce qu'ils font au formulaire se décide
// dans `lib/incidents/wizard` (une seule source de vérité à la fois) ; ici ne
// reste que la géolocalisation du navigateur, qui n'est qu'une façon de plus
// de poser le point.
// ============================================================================

export function useLocationFields(actions: WizardActions) {
  const [geoErr, setGeoErr] = useState(false);

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

  return {
    onAddress: actions.setAddress,
    onPlace: actions.choosePlace,
    onLat: (v: string) => actions.typeCoords({ lat: v }),
    onLng: (v: string) => actions.typeCoords({ lng: v }),
    onPick: actions.setPoint,
    clear: actions.clearLocation,
    locate,
    geoErr,
    resetGeoErr: () => setGeoErr(false),
  };
}
