import { SetMetadata } from "@nestjs/common";

export const SELF_SERVICE_KEY = "selfService";

/**
 * Marque une route qui n'agit QUE sur le compte de l'appelant (son profil, son
 * rôle actif, son mot de passe) ou qui sert une donnée de référence publique à
 * tout compte authentifié.
 *
 * Pourquoi un décorateur pour ne rien exiger ? Parce que la garde RBAC laisse
 * passer toute route sans `@RequirePermission` : une route ouverte par OUBLI et
 * une route ouverte par DÉCISION se ressemblaient exactement. Quatre routes du
 * centre de communication ont ainsi été trouvées ouvertes à tous (lot COMMS).
 * Désormais l'audit (`authz-coverage.spec.ts`) exige l'un ou l'autre : la
 * permission, ou cette déclaration explicite. Le silence n'est plus une option.
 */
export const SelfService = () => SetMetadata(SELF_SERVICE_KEY, true);
