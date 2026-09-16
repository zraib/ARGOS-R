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
// Réglage : `DATA_PROFILE`. Absent, la production est VIDE et le
// développement en DÉMO — le même réflexe que pour le fond de carte : on ne
// devine jamais dans le sens de la simulation sur une station.
// ============================================================================

export type DataProfile = "demo" | "empty";

export function resolveDataProfile(env: NodeJS.ProcessEnv = process.env): DataProfile {
  const explicit = (env.DATA_PROFILE ?? "").trim().toLowerCase();
  if (explicit === "demo" || explicit === "empty") return explicit;
  return (env.NODE_ENV ?? "development") === "production" ? "empty" : "demo";
}

/** Profil effectif du processus — lu une fois, comme les autres réglages d'environnement. */
export const DATA_PROFILE: DataProfile = resolveDataProfile();

/** Vrai quand le jeu de démonstration doit exister. */
export const DEMO_DATA = DATA_PROFILE === "demo";
