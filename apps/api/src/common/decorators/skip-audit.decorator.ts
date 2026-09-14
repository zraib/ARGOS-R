import { SetMetadata } from "@nestjs/common";

export const SKIP_AUDIT_KEY = "skipAudit";

/**
 * Une route qui porte un SIGNAL, pas un acte — « en train d'écrire », accusé
 * de réception — reste hors du journal d'audit chaîné : elle se répète à
 * chaque frappe, et n'engage rien. L'intercepteur d'audit la laisse passer.
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
