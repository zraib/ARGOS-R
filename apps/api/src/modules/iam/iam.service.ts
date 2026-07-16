import { Injectable } from "@nestjs/common";
import { PERMISSIONS, ROLES, ROLE_LABELS, permissionsForRole, type Role } from "@/shared/permissions";

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  role: Role;
}

/**
 * Service IAM. Utilisateurs seedés in-memory pour la Phase 0/1 ; en production,
 * synchronisés avec l'API Admin de Keycloak (source de vérité des identités) et
 * miroir en base pour les scopes ABAC.
 */
@Injectable()
export class IamService {
  private readonly users: UserRecord[] = [
    { id: "u-001", username: "k.benjelloun", name: "Col. K. Benjelloun", role: "superadmin" },
    { id: "u-002", username: "admin", name: "Administrateur", role: "admin" },
    { id: "u-003", username: "auditeur", name: "Auditeur", role: "auditor" },
    { id: "u-004", username: "r.alaoui", name: "Gén. R. Alaoui", role: "command" },
    { id: "u-005", username: "repartiteur", name: "Officier de Dispatching", role: "dispatcher" },
    { id: "u-006", username: "chef.unite", name: "Chef d'Unité", role: "unit_commander" },
    { id: "u-007", username: "agent", name: "Agent de Terrain", role: "field_agent" },
  ];

  listUsers(): UserRecord[] {
    return this.users;
  }

  listRoles() {
    return ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r], permissions: permissionsForRole(r) }));
  }

  listPermissions(): readonly string[] {
    return PERMISSIONS;
  }
}
