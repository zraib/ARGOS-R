"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";

// ============================================================================
// Partage de la position de CET appareil (ADR 0008, révision)
//
// Le téléphone d'un compte devient un traceur : la géolocalisation du
// navigateur alimente le partage déclaré au registre pour ce compte. L'état
// vit au niveau du module, pas d'un écran : ouvrir la carte ou changer de page
// n'interrompt pas l'envoi ; seuls « Arrêter », la fermeture de l'application
// ou un refus définitif du serveur (partage archivé) l'arrêtent.
//
// Cadence : une position part quand l'appareil a bougé d'au moins MOVE_M
// mètres, ou toutes les EVERY_MS au plus — assez pour suivre un déplacement,
// sans marteler le serveur à l'arrêt.
// ============================================================================

export const EVERY_MS = 20_000;
export const MOVE_M = 25;

export type ShareError = "unsupported" | "geo" | "send" | "archived" | null;

export interface ShareState {
  active: boolean;
  trackerId: string | null;
  /** Dernier envoi accepté par le serveur (ISO). */
  lastAt: string | null;
  sent: number;
  error: ShareError;
}

let state: ShareState = { active: false, trackerId: null, lastAt: null, sent: 0, error: null };
let watchId: number | null = null;
let lastSent: { at: number; ll: [number, number] } | null = null;
let sending = false;
const listeners = new Set<() => void>();

function set(patch: Partial<ShareState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

/** Distance entre deux points en mètres (haversine) — assez pour un seuil de mouvement. */
export function metersBetween(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Faut-il envoyer cette position ? Première fois, mouvement notable, ou délai écoulé. */
export function shouldSend(prev: { at: number; ll: [number, number] } | null, ll: [number, number], now: number): boolean {
  if (!prev) return true;
  if (now - prev.at >= EVERY_MS) return true;
  return metersBetween(prev.ll, ll) >= MOVE_M;
}

async function envoyer(pos: GeolocationPosition): Promise<void> {
  if (!state.trackerId || sending) return;
  const ll: [number, number] = [pos.coords.longitude, pos.coords.latitude];
  const now = Date.now();
  if (!shouldSend(lastSent, ll, now)) return;
  sending = true;
  try {
    const res = await api.sharePosition(state.trackerId, {
      ll,
      at: pos.timestamp > 0 ? Math.round(pos.timestamp) : now,
      accuracyM: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
      speedKmh: pos.coords.speed !== null && Number.isFinite(pos.coords.speed) ? Math.max(0, pos.coords.speed * 3.6) : undefined,
      headingDeg: pos.coords.heading !== null && Number.isFinite(pos.coords.heading) ? pos.coords.heading : undefined,
      altitudeM: pos.coords.altitude !== null && Number.isFinite(pos.coords.altitude) ? pos.coords.altitude : undefined,
    });
    const code = res.response?.status;
    if (res.error || (code !== undefined && code >= 400)) {
      // 409 = partage archivé (ou boîtier) : inutile d'insister ; le reste se retente à la position suivante.
      if (code === 409) { stopSharing(); set({ error: "archived" }); }
      else set({ error: "send" });
      return;
    }
    lastSent = { at: now, ll };
    set({ lastAt: new Date(now).toISOString(), sent: state.sent + 1, error: null });
  } finally {
    sending = false;
  }
}

/** Démarre le partage sur le traceur `trackerId` (le partage déclaré pour ce compte). */
export function startSharing(trackerId: string): void {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    set({ active: false, trackerId, error: "unsupported" });
    return;
  }
  stopSharing();
  lastSent = null;
  set({ active: true, trackerId, error: null });
  watchId = navigator.geolocation.watchPosition(
    (pos) => void envoyer(pos),
    () => set({ error: "geo" }),
    { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
  );
}

export function stopSharing(): void {
  if (watchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  if (state.active) set({ active: false });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

/** L'état du partage, réactif — le même d'un écran à l'autre. */
export function useShare(): ShareState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
