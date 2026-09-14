// Aides partagées par les composants de page.tsx (extraites, exportées).
import {
  type Assignments,
  type Role,
} from "@/lib/roles";

/** Projection publique d'un compte, telle que renvoyée par l'API (/iam/users). */
export interface ApiUser {
  id: string;
  /** Identifiant de connexion — libellé d'interface : « nom d'utilisateur ». */
  matricule: string;
  nom: string;
  prenom?: string;
  phone?: string;
  grade?: string;
  roles: Role[];
  /** Entités affectées (portée ABAC) — une par nature de responsabilité. */
  assignments?: Assignments;
  status: "active" | "inactive";
  activatedByAdmin: boolean;
  hasTempCode: boolean;
  online: boolean;
  builtin: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
  /** « Mot de passe oublié » posé depuis l'écran de connexion, en attente d'un code provisoire. */
  resetRequestedAt: string | null;
}

export type Tab = "users" | "roles";

/** Nom affiché d'un compte : « Prénom Nom » si le prénom est renseigné. */
export const fullName = (u: { nom: string; prenom?: string }) => (u.prenom ? `${u.prenom} ${u.nom}` : u.nom);
