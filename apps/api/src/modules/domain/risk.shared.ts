// ============================================================================
// ARGOS — aides partagées des moteurs IA (PORT côté API)
// Copie conforme de apps/web/src/lib/ai/shared.ts (module pur, zéro import) :
// le moteur de risques porté (F-04) en dépend depuis la fusion de la branche
// IA. Régénérer avec lui à chaque évolution du client.
// ============================================================================

// ============================================================
// Shared helpers IA C1 (IncidentEvolution + WhatIf + Situational)
// — centralise DUPLICATIONS entre incidentEvolution.ts + incidentWhatif.ts
// — AUCUN CHANGEMENT FONCTIONNEL : mêmes sorties, mêmes paliers
// ============================================================

// ---------------- Types partagés ----------------
export type RiskLevel = "faible" | "modere" | "eleve" | "critique";
export type Trend = "amelioration" | "stabilite" | "aggravation";
export type Impact = "faible" | "moyen" | "haut";

// ---------------- Clamp helpers (zéro NaN / Infini) ----------------
export function safeNum(v: unknown, d = 0): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return d;
  return v;
}
export function clamp01(n: number): number { return Math.max(0, Math.min(1, safeNum(n, 0))); }
export function clamp100(n: number): number { return Math.max(0, Math.min(100, safeNum(n, 0))); }

// ---------------- Tendance ----------------
// Même formule que predictIncidentEvolution et buildHorizons
//  (prob amélioration − prob dégradation) ≥ 8% → amélioration
export function trendOf(score: number, probaAmelioration?: number): Trend {
  const pDeg = Math.max(0, (score - 30) / 110);
  const pAm = probaAmelioration ?? Math.max(0, Math.min(1, (72 - score) / 80));
  const diff = (pAm - pDeg) * 100;
  if (diff >= 8) return "amelioration";
  if (diff <= -8) return "aggravation";
  return "stabilite";
}

// ---------------- Bilan humain (somme casualties parent+sous) ----------------
export interface CasualtiesCount { dead: number; injured: number; missing: number; }

// ---------------- Saturation hôpital (MAX occ/lits < 60km) ----------------
export type HospitalLite = { ville?: string | null; lits: number; occ: number; ll?: [number, number] | null };

// ---------------- Distance haversine km ----------------
export function haversineKm(a: [number, number], b: [number, number] | null | undefined): number {
  if (!b) return 0;
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------- Classification Δ What If (convention harmonisée) ----------------
export type DeltaDirection = "empire" | "stable" | "ameliore";

// ---------------- Level Metadata (UI style) ----------------
export interface LevelMeta {
  label: string;               // "Alerte rouge" …
  tint: string;                // couleur texte chiffre / MAJUSCULE
  bg: string;                  // bg header
  border: string;              // border header
  dot: string;                 // point voyant
  scoreFill: string;           // fill barre score
}
