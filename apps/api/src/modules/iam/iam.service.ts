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
    { id: "u-003", username: "strategique", name: "Utilisateur Stratégique", role: "strategic" },
    { id: "u-004", username: "tacom", name: "TACOM", role: "tacom" },
    { id: "u-005", username: "cellule.bleue", name: "Cellule Bleue (Opérations)", role: "bluecell" },
    { id: "u-006", username: "cellule.verte", name: "Cellule Verte (Logistique)", role: "greencell" },
    { id: "u-007", username: "cellule.orange", name: "Cellule Orange (Sécurité)", role: "orangecell" },
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
