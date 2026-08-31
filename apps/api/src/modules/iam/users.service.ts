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
  isRole,
  LEGACY_ROLE_MAP,
  MODULE_FEATURES,
  ROLES,
  type Role,
} from "@/shared/permissions";
import {
  isResponsibilityKind,
  isScopeKey,
  mandatoryScopeKeysOf,
  scopeKeysOf,
  SCOPE_LABELS,
  requiredAssignments,
  RESPONSIBILITY_LABELS,
  type Assignments,
  type ResponsibilityKind,
} from "@/shared/responsibilities";
import type { ScopeResolver } from "@/common/ports/scope-resolver.port";
import { loadDevState, saveDevState } from "@/common/dev-store";

/**
 * Compte utilisateur géré (registre serveur). En production, ces identités sont
 * la source de vérité côté Keycloak ; ici le registre est in-memory (Phase 0/1)
 * et applique le RBAC + les règles d'attribution de rôles côté serveur.
 */
export interface ManagedUser {
  id: string;
  /** Identifiant de connexion (libellé d'interface : « nom d'utilisateur »). */
  matricule: string;
  nom: string;
  prenom?: string;
  /** Téléphone de contact (SMS d'astreinte, annuaire). */
  phone?: string;
  grade?: string;
  roles: Role[];
  /**
   * Entités affectées (portée ABAC), une par nature de responsabilité :
   * `{ hospital: "H4" }` pour un Responsable Hôpital. Obligatoire pour tout
   * rôle `resp_*` — un responsable sans entité ne peut rien piloter.
   */
  assignments?: Assignments;
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
  prenom?: string;
  phone?: string;
  grade?: string;
  roles: Role[];
  /** Entités affectées (portée ABAC) — visible dans l'écran d'administration. */
  assignments?: Assignments;
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

/** Nom affiché d'un compte : « Prénom Nom » si le prénom est renseigné. */
export function displayName(u: { nom: string; prenom?: string }): string {
  return u.prenom ? `${u.prenom} ${u.nom}` : u.nom;
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
    prenom: u.prenom,
    phone: u.phone,
    grade: u.grade,
    roles: u.roles,
    assignments: u.assignments,
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
export class UsersService implements ScopeResolver {
  private readonly users: ManagedUser[] = [
    // Compte fondateur : code initial « ARGOS-2026 » (remis hors-bande), mot de
    // passe personnel OBLIGATOIRE au 1er login — aucun mot de passe passe-partout.
    { id: "u-benjelloun", matricule: "m.zraib", nom: "Zraib", prenom: "Mohammed", phone: "+212663002950", grade: "Commandant", roles: ["superadmin"], passwordChanged: false, tempPassword: "ARGOS-2026", activatedByAdmin: true, disabled: false, online: false, builtin: true, createdBy: "système", createdAt: "2026-01-04T08:00:00Z", lastLogin: null },
    { id: "u-alami", matricule: "h.alami", nom: "Cdt. H. Alami", grade: "Commandant", roles: ["admin"], passwordChanged: true, password: "argos", tempPassword: null, activatedByAdmin: false, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-02-11T09:20:00Z", lastLogin: "2026-07-13T18:40:00Z" },
    { id: "u-tazi", matricule: "y.tazi", nom: "Cne. Y. Tazi", grade: "Capitaine", roles: ["bluecell"], passwordChanged: true, password: "argos", tempPassword: null, activatedByAdmin: false, disabled: false, online: true, createdBy: "h.alami", createdAt: "2026-03-02T14:05:00Z", lastLogin: "2026-07-14T00:10:00Z" },
    { id: "u-fassi", matricule: "n.fassi", nom: "Lt. N. Fassi", grade: "Lieutenant", roles: ["resp_unit"], assignments: { unit: "U3" }, passwordChanged: false, tempPassword: "A7X2-K9D3", activatedByAdmin: false, disabled: false, online: false, createdBy: "h.alami", createdAt: "2026-07-12T11:30:00Z", lastLogin: null },
    { id: "u-bennani", matricule: "s.bennani", nom: "Cdt. S. Bennani", grade: "Commandant", roles: ["tacom", "bluecell", "resp_unit"], assignments: { unit: "U2" }, passwordChanged: false, tempPassword: "Q4M8-P2L6", activatedByAdmin: false, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-07-13T16:45:00Z", lastLogin: null },
    { id: "u-idrissi", matricule: "r.idrissi", nom: "Cne. R. Idrissi", grade: "Capitaine", roles: ["strategic"], passwordChanged: false, tempPassword: "Z9C1-H5R7", activatedByAdmin: true, disabled: false, online: false, createdBy: "k.benjelloun", createdAt: "2026-07-10T10:15:00Z", lastLogin: null },
  ];

  private roleFeatures = defaultRoleFeatures();

  constructor() {
    // Persistance dev : restaure le registre depuis l'instantané disque afin que
    // le mot de passe fondateur (et tous les comptes) SURVIVE aux redémarrages —
    // plus de « 1er login » à chaque lancement. Voir common/dev-store.
    // (Réinitialiser : supprimer le dossier .dev-data.)
    const snap = loadDevState<{ users?: ManagedUser[]; roleFeatures?: Record<Role, Record<string, boolean>> }>("iam", {});
    if (snap.users && snap.users.length > 0) {
      // `online` est un état de session : on repart déconnecté après un restart.
      // Les rôles HÉRITÉS (avant la refonte de l'organisation) sont migrés vers
      // leur rôle de reprise (LEGACY_ROLE_MAP) — aucun compte n'est invalidé.
      const migrate = (roles: string[]): Role[] => {
        const out = roles.map((r) => (isRole(r) ? r : LEGACY_ROLE_MAP[r] ?? "resp_unit"));
        return [...new Set(out)];
      };
      this.users.splice(0, this.users.length, ...snap.users.map((u) => ({ ...u, roles: migrate(u.roles), online: false })));
      // Le compte fondateur reprend l'identité par défaut si elle n'a jamais été
      // renseignée (registre créé avant l'ajout prénom/téléphone). Le mot de
      // passe et l'historique du compte sont conservés.
      const founder = this.users.find((u) => u.id === "u-benjelloun");
      if (founder && !founder.phone) {
        founder.matricule = "m.zraib";
        founder.nom = "Zraib";
        founder.prenom = "Mohammed";
        founder.grade = "Commandant";
        founder.phone = "+212663002950";
      }
    }
    // La matrice persistée peut porter d'anciens rôles : on repart des défauts
    // de la nouvelle organisation si elle ne couvre pas les rôles actuels.
    if (snap.roleFeatures && ROLES.every((r) => r in snap.roleFeatures!)) {
      this.roleFeatures = snap.roleFeatures;
    }
  }

  /** Écrit l'instantané du registre (débounce dans dev-store ; no-op hors dev). */
  private persist(): void {
    saveDevState("iam", { users: this.users, roleFeatures: this.roleFeatures });
  }

  // --- lecture -------------------------------------------------------------

  /**
   * Registre visible par l'appelant. Un compte Super Administrateur est
   * INVISIBLE à tout autre rôle : le filtrage est fait ici, côté serveur, et
   * non à l'affichage — masquer une ligne dans l'IHM n'est pas un contrôle.
   */
  list(viewer: Role = "superadmin"): ManagedUserPublic[] {
    return this.users.filter((u) => this.isVisibleTo(viewer, u)).map(toPublic);
  }

  /** Le compte `target` est-il visible par un porteur du rôle `viewer` ? */
  private isVisibleTo(viewer: Role, target: ManagedUser): boolean {
    return viewer === "superadmin" || !target.roles.includes("superadmin");
  }

  private find(id: string): ManagedUser {
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new NotFoundException(`Utilisateur inconnu : ${id}`);
    return u;
  }

  /**
   * Résout un compte pour un appelant donné. Un Super Administrateur est
   * introuvable (404) pour les autres rôles — répondre 403 révélerait son
   * existence.
   */
  private findVisible(viewer: Role, id: string): ManagedUser {
    const u = this.find(id);
    if (!this.isVisibleTo(viewer, u)) throw new NotFoundException(`Utilisateur inconnu : ${id}`);
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

  /**
   * Valide le rattachement ABAC : chaque rôle `resp_*` doit se voir affecter
   * une entité, et aucune affectation ne peut porter sur une nature que les
   * rôles du compte ne couvrent pas (pas de portée orpheline).
   */
  private normalizeAssignments(
    roles: readonly Role[],
    input: Assignments | undefined,
    /**
     * `true` quand l'appelant a explicitement fourni des affectations : une clé
     * hors périmètre est alors une erreur de saisie. `false` quand on reprend
     * l'état existant du compte : les affectations devenues orphelines (rôle
     * retiré) sont simplement PURGÉES, sans faire échouer la modification.
     */
    explicit: boolean,
  ): Assignments | undefined {
    const needed = requiredAssignments(roles);
    const allowedScopes = scopeKeysOf(roles);
    const provided = input ?? {};

    if (explicit) {
      // Ne considérer que les clés RÉELLEMENT renseignées : désérialisé depuis
      // le DTO, l'objet porte toutes les natures, la plupart à `undefined`.
      for (const [key, value] of Object.entries(provided)) {
        if (value === undefined || value === null || String(value).trim() === "") continue;
        // Périmètre (région / ville / incident) : autorisé si un rôle du compte
        // le porte. Un OPCOM n'a pas de région, un wali n'a pas d'incident.
        if (isScopeKey(key)) {
          if (!allowedScopes.includes(key)) {
            throw new BadRequestException(
              `Rattachement « ${SCOPE_LABELS[key]} » impossible : aucun rôle du compte n'en relève.`,
            );
          }
          continue;
        }
        if (!isResponsibilityKind(key)) {
          throw new BadRequestException(`Nature de responsabilité inconnue : ${key}`);
        }
        if (!needed.includes(key)) {
          throw new BadRequestException(
            `Affectation « ${RESPONSIBILITY_LABELS[key]} » impossible : aucun rôle du compte n'en est responsable.`,
          );
        }
      }
    }

    const out: Assignments = {};
    for (const kind of needed) {
      const id = provided[kind]?.trim();
      if (!id) {
        throw new BadRequestException(
          `Le rôle « responsable ${RESPONSIBILITY_LABELS[kind].toLowerCase()} » exige d'affecter une entité.`,
        );
      }
      out[kind] = id;
    }

    // Les périmètres sont reportés au même titre que les entités : les omettre
    // ici les effacerait silencieusement à chaque modification du compte.
    const mandatory = mandatoryScopeKeysOf(roles);
    for (const key of allowedScopes) {
      const value = provided[key]?.trim();
      if (value) {
        out[key] = value;
      } else if (mandatory.includes(key)) {
        throw new BadRequestException(
          `Le rattachement « ${SCOPE_LABELS[key]} » est exigé par les rôles de ce compte.`,
        );
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  // --- écriture ------------------------------------------------------------

  create(
    creator: Role,
    actorUsername: string,
    input: { matricule: string; nom: string; prenom?: string; phone?: string; grade?: string; roles: Role[]; assignments?: Assignments },
  ): { user: ManagedUserPublic; tempPassword: string } {
    this.validateRoles(creator, input.roles);
    const assignments = this.normalizeAssignments(input.roles, input.assignments, input.assignments !== undefined);
    const matricule = input.matricule.trim();
    if (this.users.some((u) => u.matricule.toLowerCase() === matricule.toLowerCase())) {
      throw new ConflictException("Ce matricule existe déjà.");
    }
    const tempPassword = generateTempPassword();
    const user: ManagedUser = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      matricule,
      nom: input.nom.trim(),
      prenom: input.prenom?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      grade: input.grade?.trim() || undefined,
      roles: input.roles,
      assignments,
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
    this.persist();
    return { user: toPublic(user), tempPassword };
  }

  update(
    actorRole: Role,
    id: string,
    patch: { matricule?: string; nom?: string; prenom?: string; phone?: string; grade?: string; roles?: Role[]; assignments?: Assignments },
  ): ManagedUserPublic {
    const u = this.findVisible(actorRole, id);
    this.assertManageable(actorRole, u);
    if (patch.roles !== undefined) {
      this.validateRoles(actorRole, patch.roles);
      u.roles = patch.roles;
    }
    // Le rattachement est revalidé dès que les rôles OU les affectations
    // changent : passer un compte à « Responsable Hôpital » sans lui affecter
    // d'établissement doit échouer, et retirer le rôle doit purger la portée.
    if (patch.roles !== undefined || patch.assignments !== undefined) {
      u.assignments = this.normalizeAssignments(
        u.roles,
        patch.assignments ?? u.assignments,
        patch.assignments !== undefined,
      );
    }
    // Le nom d'utilisateur (identifiant de connexion) n'est modifiable que par
    // le Super Administrateur, et doit rester unique.
    if (patch.matricule !== undefined && patch.matricule.trim() !== u.matricule) {
      if (actorRole !== "superadmin") throw new ForbiddenException("Seul le Super Administrateur peut modifier le nom d'utilisateur.");
      const next = patch.matricule.trim();
      if (!next) throw new BadRequestException("Nom d'utilisateur requis.");
      if (this.users.some((x) => x.id !== u.id && x.matricule.toLowerCase() === next.toLowerCase())) {
        throw new ConflictException("Ce nom d'utilisateur existe déjà.");
      }
      u.matricule = next;
    }
    if (patch.nom !== undefined) u.nom = patch.nom.trim();
    if (patch.prenom !== undefined) u.prenom = patch.prenom.trim() || undefined;
    if (patch.phone !== undefined) u.phone = patch.phone.trim() || undefined;
    if (patch.grade !== undefined) u.grade = patch.grade.trim() || undefined;
    this.persist();
    return toPublic(u);
  }

  remove(actorRole: Role, actorUsername: string, id: string): void {
    const u = this.findVisible(actorRole, id);
    this.assertManageable(actorRole, u);
    if (u.matricule === actorUsername) throw new ForbiddenException("Impossible de supprimer son propre compte.");
    const idx = this.users.findIndex((x) => x.id === id);
    this.users.splice(idx, 1);
    this.persist();
  }

  /**
   * Activation forcée / suspension. Un Administrateur peut DÉSACTIVER un compte
   * (matrice : M sur Utilisateurs) mais jamais le supprimer — et un compte
   * Super Administrateur lui reste introuvable.
   */
  setActive(actorRole: Role, id: string, active: boolean): ManagedUserPublic {
    const u = this.findVisible(actorRole, id);
    if (u.builtin) throw new ForbiddenException("Compte système protégé.");
    if (active) {
      u.activatedByAdmin = true;
      u.disabled = false;
    } else {
      u.disabled = true;
    }
    this.persist();
    return toPublic(u);
  }

  resetCode(actorRole: Role, id: string): { tempPassword: string } {
    const u = this.findVisible(actorRole, id);
    this.assertManageable(actorRole, u);
    const tempPassword = generateTempPassword();
    u.tempPassword = tempPassword;
    u.passwordChanged = false;
    u.password = undefined;
    u.disabled = false;
    this.persist();
    return { tempPassword };
  }

  /**
   * Révèle le code temporaire (contrôleur : iam:users:read → Admin/Super Admin).
   * Un Admin ne peut pas lire le code d'un compte privilégié ; le code du compte
   * système n'est jamais révélé par l'API (remis hors-bande).
   */
  revealCode(actorRole: Role, id: string): { tempPassword: string | null } {
    const u = this.findVisible(actorRole, id);
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
    this.persist();
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
    this.persist();
    return { user: u, mustChangePassword: !u.passwordChanged, mustChooseRole: u.roles.length > 1 };
  }

  /** Profil du compte courant (identité + photo, pour la page profil). */
  ownProfile(matricule: string): { matricule: string; nom: string; grade?: string; roles: Role[]; photo?: string } {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    return { matricule: u.matricule, nom: displayName(u), grade: u.grade, roles: u.roles, photo: u.photo };
  }

  /** Mise à jour par l'utilisateur de son propre profil (nom affiché, photo). */
  updateOwnProfile(matricule: string, patch: { nom?: string; photo?: string | null }): { nom: string; photo?: string } {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    if (patch.nom !== undefined && patch.nom.trim()) u.nom = patch.nom.trim();
    if (patch.photo !== undefined) u.photo = patch.photo === null ? undefined : patch.photo;
    this.persist();
    return { nom: u.nom, photo: u.photo };
  }

  changePassword(matricule: string, newPassword: string): void {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException("Compte introuvable.");
    u.passwordChanged = true;
    u.password = newPassword;
    u.tempPassword = null;
    u.disabled = false;
    this.persist();
  }

  /** Valide qu'un rôle appartient bien au compte (sélecteur de rôle multi-rôles). */
  /**
   * Portée ABAC d'un compte (implémente `ScopeResolver`). Appelée par la garde
   * JWT à chaque requête : une réaffectation prend effet sans reconnexion.
   */
  resolveScope(username: string): Assignments | undefined {
    const u = this.users.find((x) => x.matricule.toLowerCase() === username.toLowerCase());
    return u?.assignments;
  }

  /** Entité affectée pour une nature donnée, ou `undefined`. */
  assignedEntity(username: string, kind: ResponsibilityKind): string | undefined {
    return this.resolveScope(username)?.[kind];
  }

  hasRole(matricule: string, role: Role): boolean {
    const u = this.byMatricule(matricule);
    return !!u && u.roles.includes(role);
  }

  markOffline(matricule: string): void {
    const u = this.byMatricule(matricule);
    if (u) { u.online = false; this.persist(); }
  }
}
