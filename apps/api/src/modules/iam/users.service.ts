import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  assignableRoles,
  canAssignMultipleRoles,
  defaultRoleFeatures,
  MODULE_FEATURES,
  type Role,
} from "@/shared/permissions";

/**
 * Compte utilisateur géré (registre serveur). En production, ces identités sont
 * la source de vérité côté Keycloak ; ici le registre est in-memory (Phase 0/1)
 * et applique le RBAC + les règles d'attribution de rôles côté serveur.
 */
export interface ManagedUser {
  id: string;
  matricule: string;
  nom: string;
  grade?: string;
  roles: Role[];
  passwordChanged: boolean;
  /** Mot de passe défini par l'utilisateur (démo ; à hacher en production). */
  password?: string;
  /** Code temporaire, effacé dès que l'utilisateur pose son mot de passe. */
  tempPassword: string | null;
  activatedByAdmin: boolean;
  disabled: boolean;
  online: boolean;
  /** Photo de profil (data URL, redimensionnée côté client). */
  photo?: string;
  builtin?: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
}

/** Projection publique : jamais de mot de passe ; code temporaire masqué. */
export interface ManagedUserPublic {
  id: string;
  matricule: string;
  nom: string;
  grade?: string;
  roles: Role[];
  status: "active" | "inactive";
  activatedByAdmin: boolean;
  hasTempCode: boolean;
  online: boolean;
  photo?: string;
  builtin: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateTempPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${group()}-${group()}`;
}

function userActive(u: ManagedUser): boolean {
  if (u.disabled) return false;
  return u.passwordChanged || u.activatedByAdmin;
}

function toPublic(u: ManagedUser): ManagedUserPublic {
  return {
    id: u.id,
    matricule: u.matricule,
    nom: u.nom,
    grade: u.grade,
    roles: u.roles,
    status: userActive(u) ? "active" : "inactive",
    activatedByAdmin: u.activatedByAdmin,
    hasTempCode: !u.passwordChanged && !!u.tempPassword,
    online: u.online,
    photo: u.photo,
    builtin: !!u.builtin,
    createdBy: u.createdBy,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
  };
}

@Injectable()
export class UsersService {
  private readonly users: ManagedUser[] = [
    // Compte fondateur : code initial « ARGOS-2026 » (remis hors-bande), mot de
    // passe personnel OBLIGATOIRE au 1er login — aucun mot de passe passe-partout.
    { id: "u-benjelloun", matricule: "k.benjelloun", nom: "Col. K. Benjelloun", grade: "Colonel", roles: ["superadmin"], passwordChanged: false, tempPassword: "ARGOS-2026", activatedByAdmin: true, disabled: false, online: false, builtin: true, createdBy: "système", createdAt: "2026-01-04T08:00:00Z", lastLogin: null },
    { id: "u-alami", matricule: "h.alami", nom: "Cdt. H. Alami", grade: "Commandant", roles: ["admin"], passwordChanged: true, password: "argos", tempPassword: null, activatedByAdmin: false, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-02-11T09:20:00Z", lastLogin: "2026-07-13T18:40:00Z" },
    { id: "u-tazi", matricule: "y.tazi", nom: "Cne. Y. Tazi", grade: "Capitaine", roles: ["dispatcher"], passwordChanged: true, password: "argos", tempPassword: null, activatedByAdmin: false, disabled: false, online: true, createdBy: "h.alami", createdAt: "2026-03-02T14:05:00Z", lastLogin: "2026-07-14T00:10:00Z" },
    { id: "u-fassi", matricule: "n.fassi", nom: "Lt. N. Fassi", grade: "Lieutenant", roles: ["field_agent"], passwordChanged: false, tempPassword: "A7X2-K9D3", activatedByAdmin: false, disabled: false, online: false, createdBy: "h.alami", createdAt: "2026-07-12T11:30:00Z", lastLogin: null },
    { id: "u-bennani", matricule: "s.bennani", nom: "Cdt. S. Bennani", grade: "Commandant", roles: ["command", "dispatcher", "unit_commander"], passwordChanged: false, tempPassword: "Q4M8-P2L6", activatedByAdmin: false, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-07-13T16:45:00Z", lastLogin: null },
    { id: "u-idrissi", matricule: "r.idrissi", nom: "Cne. R. Idrissi", grade: "Capitaine", roles: ["auditor"], passwordChanged: false, tempPassword: "Z9C1-H5R7", activatedByAdmin: true, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-07-10T10:15:00Z", lastLogin: null },
  ];

  private roleFeatures = defaultRoleFeatures();

  // --- lecture -------------------------------------------------------------

  list(): ManagedUserPublic[] {
    return this.users.map(toPublic);
  }

  private find(id: string): ManagedUser {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new NotFoundException(`Utilisateur inconnu : ${id}`);
    return u;
  }

  // --- règles d'attribution / de gestion -----------------------------------

  private validateRoles(creator: Role, roles: Role[]): void {
    if (!roles || roles.length === 0) throw new BadRequestException("Au moins un rôle est requis.");
    const allowed = assignableRoles(creator);
    const illegal = roles.filter((r) => !allowed.includes(r));
    if (illegal.length > 0) {
      throw new ForbiddenException(`Rôle(s) non attribuable(s) par ${creator} : ${illegal.join(", ")}`);
    }
    if (!canAssignMultipleRoles(creator) && roles.length > 1) {
      throw new BadRequestException("Un seul rôle peut être attribué par un Administrateur.");
    }
  }

  /** Un acteur peut-il gérer (modifier/supprimer) ce compte cible ? */
  private assertManageable(actorRole: Role, target: ManagedUser): void {
    if (target.builtin) throw new ForbiddenException("Compte système protégé.");
    if (actorRole === "superadmin") return;
    const allowed = assignableRoles(actorRole);
    if (!target.roles.every((r) => allowed.includes(r))) {
      throw new ForbiddenException("Un Administrateur ne peut pas gérer un compte privilégié.");
    }
  }

  // --- écriture ------------------------------------------------------------

  create(creator: Role, actorUsername: string, input: { matricule: string; nom: string; grade?: string; roles: Role[] }): { user: ManagedUserPublic; tempPassword: string } {
    this.validateRoles(creator, input.roles);
    const matricule = input.matricule.trim();
    if (this.users.some((u) => u.matricule.toLowerCase() === matricule.toLowerCase())) {
      throw new ConflictException("Ce matricule existe déjà.");
    }
    const tempPassword = generateTempPassword();
    const user: ManagedUser = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      matricule,
      nom: input.nom.trim(),
      grade: input.grade?.trim() || undefined,
      roles: input.roles,
      passwordChanged: false,
      tempPassword,
      activatedByAdmin: false,
      disabled: false,
      online: false,
      createdBy: actorUsername,
      createdAt: new Date().toISOString(),
      lastLogin: null,
    };
    this.users.unshift(user);
    return { user: toPublic(user), tempPassword };
  }

  update(actorRole: Role, id: string, patch: { nom?: string; grade?: string; roles?: Role[] }): ManagedUserPublic {
    const u = this.find(id);
    this.assertManageable(actorRole, u);
    if (patch.roles !== undefined) {
      this.validateRoles(actorRole, patch.roles);
      u.roles = patch.roles;
    }
    if (patch.nom !== undefined) u.nom = patch.nom.trim();
    if (patch.grade !== undefined) u.grade = patch.grade.trim() || undefined;
    return toPublic(u);
  }

  remove(actorRole: Role, actorUsername: string, id: string): void {
    const u = this.find(id);
    this.assertManageable(actorRole, u);
    if (u.matricule === actorUsername) throw new ForbiddenException("Impossible de supprimer son propre compte.");
    const idx = this.users.findIndex((x) => x.id === id);
    this.users.splice(idx, 1);
  }

  /** Activation forcée / suspension (contrôleur réservé au Super Admin via permission). */
  setActive(id: string, active: boolean): ManagedUserPublic {
    const u = this.find(id);
    if (u.builtin) throw new ForbiddenException("Compte système protégé.");
    if (active) {
      u.activatedByAdmin = true;
      u.disabled = false;
    } else {
      u.disabled = true;
    }
    return toPublic(u);
  }

  resetCode(actorRole: Role, id: string): { tempPassword: string } {
    const u = this.find(id);
    this.assertManageable(actorRole, u);
    const tempPassword = generateTempPassword();
    u.tempPassword = tempPassword;
    u.passwordChanged = false;
    u.password = undefined;
    u.disabled = false;
    return { tempPassword };
  }

  /**
   * Révèle le code temporaire (contrôleur : iam:users:read → Admin/Super Admin).
   * Un Admin ne peut pas lire le code d'un compte privilégié ; le code du compte
   * système n'est jamais révélé par l'API (remis hors-bande).
   */
  revealCode(actorRole: Role, id: string): { tempPassword: string | null } {
    const u = this.find(id);
    if (u.builtin) throw new ForbiddenException("Code du compte système non consultable.");
    if (actorRole !== "superadmin" && u.roles.some((r) => r === "superadmin" || r === "admin")) {
      throw new ForbiddenException("Code d'un compte privilégié réservé au Super Admin.");
    }
    return { tempPassword: !u.passwordChanged ? u.tempPassword : null };
  }

  // --- matrice rôle → fonctionnalités --------------------------------------

  getRoleFeatures(): Record<Role, Record<string, boolean>> {
    return this.roleFeatures;
  }

  setRoleFeature(role: Role, feature: string, enabled: boolean): Record<string, boolean> {
    if (!(MODULE_FEATURES as readonly string[]).includes(feature)) {
      throw new BadRequestException(`Fonctionnalité inconnue : ${feature}`);
    }
    if (role === "superadmin" || role === "admin") {
      throw new ForbiddenException("Les rôles superadmin/admin ont un accès total verrouillé.");
    }
    this.roleFeatures[role] = { ...this.roleFeatures[role], [feature]: enabled };
    return this.roleFeatures[role];
  }

  // --- cycle de vie / authentification -------------------------------------

  private byMatricule(matricule: string): ManagedUser | undefined {
    return this.users.find((x) => x.matricule.toLowerCase() === matricule.trim().toLowerCase());
  }

  /**
   * Vérifie les identifiants d'un compte géré (code temporaire ou mot de passe).
   * Retourne l'état du cycle de vie ; null si l'authentification échoue.
   */
  authenticate(matricule: string, password: string): { user: ManagedUser; mustChangePassword: boolean; mustChooseRole: boolean } | null {
    const u = this.byMatricule(matricule);
    if (!u) return null;
    if (u.disabled) return null; // compte suspendu : connexion refusée
    // Strictement le code temporaire (avant 1er login) ou le mot de passe posé.
    // Aucun passe-partout, y compris pour le compte système.
    const expected = u.passwordChanged ? u.password : u.tempPassword ?? undefined;
    if (expected === undefined || password !== expected) return null;
    u.online = true;
    u.lastLogin = new Date().toISOString();
    return { user: u, mustChangePassword: !u.passwordChanged, mustChooseRole: u.roles.length > 1 };
  }

  /** Profil du compte courant (identité + photo, pour la page profil). */
  ownProfile(matricule: string): { matricule: string; nom: string; grade?: string; roles: Role[]; photo?: string } {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    return { matricule: u.matricule, nom: u.nom, grade: u.grade, roles: u.roles, photo: u.photo };
  }

  /** Mise à jour par l'utilisateur de son propre profil (nom affiché, photo). */
  updateOwnProfile(matricule: string, patch: { nom?: string; photo?: string | null }): { nom: string; photo?: string } {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    if (patch.nom !== undefined && patch.nom.trim()) u.nom = patch.nom.trim();
    if (patch.photo !== undefined) u.photo = patch.photo === null ? undefined : patch.photo;
    return { nom: u.nom, photo: u.photo };
  }

  changePassword(matricule: string, newPassword: string): void {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    u.passwordChanged = true;
    u.password = newPassword;
    u.tempPassword = null;
    u.disabled = false;
  }

  /** Valide qu'un rôle appartient bien au compte (sélecteur de rôle multi-rôles). */
  hasRole(matricule: string, role: Role): boolean {
    const u = this.byMatricule(matricule);
    return !!u && u.roles.includes(role);
  }

  markOffline(matricule: string): void {
    const u = this.byMatricule(matricule);
    if (u) u.online = false;
  }
}
