// ============================================================================
// ARGOS — reprise des bascules par rôle depuis un instantané (règles PURES)
//
// Les modules du menu et les fonctionnalités de l'API s'ouvrent ou se coupent
// par rôle depuis l'écran Utilisateurs. Leurs défauts DÉCOULENT de la matrice
// RBAC : à chaque mise à jour qui ouvre une action à un rôle, son module et sa
// fonctionnalité s'ouvrent avec elle. Pour qu'un instantané d'avant ne masque
// pas cette ouverture, seuls les ÉCARTS aux défauts sont persistés (version 2)
// — une coupure décidée par l'administration, ou une ouverture au-delà de la
// matrice pour les modules sans fonctionnalité RBAC.
//
// Un instantané de la version 1 écrivait la table ENTIÈRE : chaque « non »
// hérité de la matrice d'alors y passe pour une coupure et masquerait ce qu'une
// mise à jour ouvre (le commandant d'unité et les incidents, l'équipement et la
// liste des incidents, la conduite des PC opératifs et la répartition…). Ces
// instantanés-là sont repris à leurs défauts.
// ============================================================================

import type { Role } from "@/shared/permissions";

/** Version courante de l'instantané des bascules : des écarts, pas une table. */
export const DEVIATIONS_VERSION = 2;

/**
 * Applique à `table` (les défauts, modifiés en place) les écarts d'un
 * instantané. `keep` dit si une valeur persistée se reprend pour cette clé
 * (par exemple : les fonctionnalités ne se coupent que là où la matrice les
 * ouvre). Un instantané d'une version antérieure est ignoré.
 */
export function restoreDeviations<K extends string>(
  table: Record<Role, Record<K, boolean>>,
  snap: Partial<Record<string, Record<string, boolean>>> | undefined,
  version: number | undefined,
  isKey: (k: string) => k is K,
  keep: (role: Role, key: K, value: boolean) => boolean = () => true,
): void {
  if (!snap || (version ?? 1) < DEVIATIONS_VERSION) return;
  for (const role of Object.keys(table) as Role[]) {
    const ecarts = snap[role];
    if (!ecarts) continue;
    for (const [k, v] of Object.entries(ecarts)) {
      if (isKey(k) && typeof v === "boolean" && keep(role, k, v)) table[role][k] = v;
    }
  }
}

/** Les écarts d'une table par rapport à ses défauts — ce qui s'écrit dans l'instantané. */
export function deviationsOf<K extends string>(
  table: Record<Role, Record<K, boolean>>,
  defaults: Record<Role, Record<K, boolean>>,
  isKey: (k: string) => k is K,
): Partial<Record<Role, Record<string, boolean>>> {
  const out: Partial<Record<Role, Record<string, boolean>>> = {};
  for (const role of Object.keys(table) as Role[]) {
    const ecarts = (Object.entries(table[role] ?? {}) as [string, boolean][]).filter(([k, v]) => isKey(k) && v !== defaults[role]?.[k]);
    if (ecarts.length > 0) out[role] = Object.fromEntries(ecarts) as Record<string, boolean>;
  }
  return out;
}
