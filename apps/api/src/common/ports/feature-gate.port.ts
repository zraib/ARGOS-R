// ============================================================================
// ARGOS — port « module ouvert ? » pour la garde RBAC (ADR 0015)
//
// La garde des permissions doit savoir si le module d'une permission est coupé
// — globalement (drapeau) ou pour le rôle (matrice rôle → modules) — sans
// connaître ni le dépôt des drapeaux ni le registre des comptes : `common/` ne
// dépend pas de `modules/`. Même inversion que pour la portée ABAC.
// ============================================================================

import type { Feature, ModuleKey, Role } from "@/shared/permissions";

export interface FeatureGate {
  /** Le module est coupé pour tout le monde (drapeau global à `false`). */
  moduleDisabled(module: ModuleKey): Promise<boolean>;
  /** Le module est coupé pour ce rôle (matrice rôle → modules à `false`). */
  roleModuleDisabled(role: Role, module: ModuleKey): boolean;
  /** La fonctionnalité de l'API est-elle coupée pour ce rôle (ADR 0022, lot 2) ? */
  roleFeatureDisabled(role: Role, feature: Feature): boolean;
  /**
   * Le module est tranché pour CE compte (ADR 0016) : `false` coupé, `true`
   * rouvert malgré le rôle, `undefined` quand le compte n'a rien de propre.
   */
  userModuleOverride(username: string, module: ModuleKey): boolean | undefined;
}

export const FEATURE_GATE = Symbol("FEATURE_GATE");
