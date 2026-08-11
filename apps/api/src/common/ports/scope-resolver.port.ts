// ============================================================================
// ARGOS — port de résolution de portée ABAC
//
// La garde JWT a besoin de connaître les entités affectées à un compte, mais
// elle n'a pas à connaître le registre des utilisateurs : `common/` ne doit
// pas dépendre de `modules/`. On inverse donc la dépendance — la garde déclare
// le service dont elle a besoin, le module IAM le fournit.
// ============================================================================

import type { Assignments } from "@/shared/responsibilities";

/** Fournit les entités affectées à un compte, par nom d'utilisateur. */
export interface ScopeResolver {
  resolveScope(username: string): Assignments | undefined;
}

export const SCOPE_RESOLVER = Symbol("SCOPE_RESOLVER");
