// ============================================================================
// ARGOS — mode de la station : démonstration, exercice, opérationnel (ADR 0016)
//
//   demo        — toutes les fonctionnalités, avec le jeu de démonstration
//                 (données simulées sur la carte) : formation, présentation.
//   exercise    — rien de simulé ; les cellules et l'OPCOM créent unités et
//                 ressources pour jouer un exercice d'état-major.
//   operational — station en service : les unités sont créées par le Super
//                 Administrateur, les ressources par les chefs d'entité,
//                 l'OPCOM affecte, le TACOM exploite, les cellules déploient.
//
// Le mode est un RÉGLAGE persisté (Paramètres, Super Administrateur), lu au
// démarrage — le jeu de démonstration se sème ou s'élague au démarrage, et
// plusieurs modules choisissent leurs adaptateurs à la construction. Sur la
// station, l'API redémarre d'elle-même après un changement (Docker la relance).
//
// Résolution, dans l'ordre : réglage persisté > APP_MODE > DATA_PROFILE
// (demo → demo, empty → opérationnel, ADR 0015) > NODE_ENV (production →
// opérationnel, sinon démonstration). On ne devine jamais dans le sens de la
// simulation sur une station.
// ============================================================================

import { loadDevState } from "@/common/dev-store";

export const APP_MODES = ["demo", "exercise", "operational"] as const;
export type AppMode = (typeof APP_MODES)[number];

export function isAppMode(v: unknown): v is AppMode {
  return typeof v === "string" && (APP_MODES as readonly string[]).includes(v);
}

export const MODE_LABELS: Record<AppMode, string> = {
  demo: "Démonstration",
  exercise: "Exercice",
  operational: "Opérationnel",
};

/** Le fichier de réglages de la station (instantané `settings`). */
export interface StationSettings {
  mode?: string;
  /** Mode de l'application (ADR 0022) : « classique » ou « direx ». */
  profile?: string;
}

export function resolveAppMode(env: NodeJS.ProcessEnv = process.env, persisted?: string): AppMode {
  if (isAppMode(persisted)) return persisted;
  const explicit = (env.APP_MODE ?? "").trim().toLowerCase();
  if (isAppMode(explicit)) return explicit;
  const profile = (env.DATA_PROFILE ?? "").trim().toLowerCase();
  if (profile === "demo") return "demo";
  if (profile === "empty") return "operational";
  return (env.NODE_ENV ?? "development") === "production" ? "operational" : "demo";
}

/** Mode effectif du processus — lu une fois au démarrage. */
export const APP_MODE: AppMode = resolveAppMode(process.env, loadDevState<StationSettings>("settings", {}).mode);
