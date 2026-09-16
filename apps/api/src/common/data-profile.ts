// ============================================================================
// ARGOS — profil de données : « demo » ou « empty » (ADR 0015)
//
// Le dépôt embarque un jeu de démonstration (incidents, unités, abris,
// morgues, dossiers, parcs, fil d'événements, convois animés, noria aérienne
// simulée, salons de communication fictifs). Il sert à développer et à
// montrer ; il n'a rien à faire sur une station en service, où chaque
// entité affichée doit être une entité réelle.
//
//   demo  — le jeu est reconstruit, complété et entretenu (poste du
//           développeur, démonstration) ;
//   empty — aucune graine n'est réinjectée : seuls restent les référentiels
//           (réseau hospitalier, géographie, types d'incident, substances) et
//           ce que les opérateurs créent. Les simulateurs client (convois) et
//           la noria aérienne d'exercice sont coupés à la source.
//
// Depuis l'ADR 0016 le profil DÉCOULE du mode de la station (`app-mode.ts`) :
// le mode « démonstration » sème, les modes « exercice » et « opérationnel »
// laissent la station vide.
// ============================================================================

import { APP_MODE, type AppMode } from "@/common/app-mode";

export type DataProfile = "demo" | "empty";

export function profileOfMode(mode: AppMode): DataProfile {
  return mode === "demo" ? "demo" : "empty";
}

/** Profil effectif du processus — celui du mode de la station. */
export const DATA_PROFILE: DataProfile = profileOfMode(APP_MODE);

/** Vrai quand le jeu de démonstration doit exister. */
export const DEMO_DATA = DATA_PROFILE === "demo";
