import { roleInProfile, rolesShareProfile } from "@/shared/profiles";
import { ProfileService } from "@/modules/mode/profile.service";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  assignableRoles,
  canAssignMultipleRoles,
  DEFAULT_ROLE_FEATURES,
  defaultRoleFeatures,
  isCoreModule,
  isModuleKey,
  MODULE_KEYS,
  type ModuleKey,
  isRole,
  LEGACY_ROLE_MAP,
  ROLES,
  ROLE_LABELS,
  type Role,
} from "@/shared/permissions";
import {
  type Assignments,
  CIVIL_ROLES,
  RESPONSIBILITY_KINDS,
  RESPONSIBILITY_LABELS,
  ROLE_RESPONSIBILITY,
  type ResponsibilityKind,
  type Responsible,
  SCOPE_LABELS,
  UNIQUE_PER_REGION_ROLES,
  isDeployableRole,
  isResponsibilityKind,
  isScopeKey,
  mandatoryScopeKeysOf,
  requiredAssignments,
  scopeKeysOf,
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
  /**
   * Bascules de modules PROPRES au compte (ADR 0016) : `false` coupe le module
   * pour ce compte quoi qu'en dise son rôle, `true` le rouvre ; absent = le rôle
   * décide. Effectif côté API (garde) comme côté écran.
   */
  modules?: Partial<Record<ModuleKey, boolean>>;
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
  /**
   * « Mot de passe oublié » posé depuis l'écran de connexion (ISO 8601), en
   * attente qu'un administrateur régénère le code provisoire. Effacée dès que
   * le code est régénéré, qu'un mot de passe est posé, ou que le compte se
   * reconnecte de lui-même — la demande n'a alors plus d'objet.
   */
  resetRequestedAt?: string | null;
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
  /** Bascules de modules propres au compte (ADR 0016). */
  modules?: Partial<Record<ModuleKey, boolean>>;
  status: "active" | "inactive";
  activatedByAdmin: boolean;
  hasTempCode: boolean;
  online: boolean;
  photo?: string;
  builtin: boolean;
  createdBy: string;
  createdAt: string;
  lastLogin: string | null;
  /** Demande de réinitialisation en attente — l'écran d'administration la signale. */
  resetRequestedAt: string | null;
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
    modules: u.modules,
    status: userActive(u) ? "active" : "inactive",
    activatedByAdmin: u.activatedByAdmin,
    hasTempCode: !u.passwordChanged && !!u.tempPassword,
    online: u.online,
    photo: u.photo,
    builtin: !!u.builtin,
    createdBy: u.createdBy,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    resetRequestedAt: u.resetRequestedAt ?? null,
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

    // --- comptes de DÉMONSTRATION des portées (lot V-4) ---------------------
    // Sans eux, éprouver la doctrine de visibilité imposait de créer trois
    // comptes à la main à chaque installation neuve — assez fastidieux pour
    // qu'on finisse par ne plus l'éprouver du tout. Mots de passe temporaires :
    // le changement au premier login reste obligatoire, comme pour tout compte.
    { id: "u-wali-casa", matricule: "w.casa", nom: "Bennani", prenom: "Karim", roles: ["wali"], assignments: { region: "Casablanca-Settat" }, passwordChanged: false, tempPassword: "WALI-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-08-01T08:00:00Z", lastLogin: null },
    { id: "u-pa-casa", matricule: "p.casa", nom: "Sekkat", prenom: "Rachid", grade: "Colonel", roles: ["place_arme"], assignments: { region: "Casablanca-Settat" }, passwordChanged: false, tempPassword: "ZONE-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-08-01T08:00:00Z", lastLogin: null },
    // OPCOM créé NON déployé : le déploiement est un acte distinct (V-2), et un
    // compte non déployé ne voit rien — c'est la première chose à démontrer.
    { id: "u-opcom-demo", matricule: "o.chraibi", nom: "Chraibi", prenom: "Nabil", grade: "Colonel", roles: ["opcom"], passwordChanged: false, tempPassword: "OPCOM-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-08-01T08:00:00Z", lastLogin: null },
    { id: "u-resp-h2", matricule: "s.moutaouakil", nom: "Moutaouakil", prenom: "Salma", grade: "Médecin-Cdt", roles: ["resp_hospital"], assignments: { hospital: "H2" }, passwordChanged: false, tempPassword: "HOSP-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-08-01T08:00:00Z", lastLogin: null },

    // --- comptes de DÉMONSTRATION du profil « direx » (ADR 0022) ------------
    // La direction d'exercice et ses postes de commandement, prêts à jouer le
    // même jeu de démonstration que les comptes classiques. Codes provisoires,
    // changement obligatoire au premier login, comme pour tout compte.
    { id: "u-direx-chef", matricule: "a.direx", nom: "Benali", prenom: "Ahmed", grade: "Colonel-major", roles: ["direx_chef"], passwordChanged: false, tempPassword: "DIREX-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-direx-eval", matricule: "e.direx", nom: "Ouazzani", prenom: "Leila", grade: "Lieutenant-colonel", roles: ["direx_eval"], passwordChanged: false, tempPassword: "EVAL-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-direx-anim", matricule: "n.direx", nom: "Tahiri", prenom: "Youssef", grade: "Commandant", roles: ["direx_anim"], passwordChanged: false, tempPassword: "ANIM-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-direx-rls", matricule: "r.direx", nom: "Kettani", prenom: "Samir", grade: "Commandant", roles: ["direx_rls"], passwordChanged: false, tempPassword: "RLS-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pcfar-chef", matricule: "c.pcfar", nom: "El Amrani", prenom: "Driss", grade: "Colonel", roles: ["pcfar_chef"], passwordChanged: false, tempPassword: "PCFAR-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pcfar-ops", matricule: "o.pcfar", nom: "Mansouri", prenom: "Hicham", grade: "Commandant", roles: ["pcfar_ops"], passwordChanged: false, tempPassword: "OPSF-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pcf-chef", matricule: "c.pcf", nom: "Lahlou", prenom: "Mounir", grade: "Contrôleur général", roles: ["pcf_chef"], passwordChanged: false, tempPassword: "PCF-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pcf-ops", matricule: "o.pcf", nom: "Berrada", prenom: "Nadia", grade: "Commissaire", roles: ["pcf_ops"], passwordChanged: false, tempPassword: "OPSP-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pct-chef", matricule: "c.pct", nom: "Sbai", prenom: "Karim", grade: "Lieutenant-colonel", roles: ["pct_chef"], passwordChanged: false, tempPassword: "PCT-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pct-ops", matricule: "o.pct", nom: "Zouhri", prenom: "Omar", grade: "Capitaine", roles: ["pct_ops"], passwordChanged: false, tempPassword: "OPST-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pco-chef", matricule: "c.pco", nom: "Haddad", prenom: "Salma", grade: "Colonel", roles: ["pco_chef"], passwordChanged: false, tempPassword: "PCO-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
    { id: "u-pco-ops", matricule: "o.pco", nom: "Rahmouni", prenom: "Ilias", grade: "Capitaine", roles: ["pco_ops"], passwordChanged: false, tempPassword: "OPSO-2026", activatedByAdmin: true, disabled: false, online: false, createdBy: "système", createdAt: "2026-09-19T08:00:00Z", lastLogin: null },
  ];

  private roleFeatures = defaultRoleFeatures();

  constructor(@Optional() private readonly profiles?: ProfileService) {
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
      const seeded = [...this.users];
      this.users.splice(0, this.users.length, ...snap.users.map((u) => ({ ...u, roles: migrate(u.roles), online: false })));

      // Comptes du seed ABSENTS du disque : ajoutés, jamais substitués.
      //
      // Le registre disque fait autorité — un compte modifié, désactivé ou
      // supprimé le reste. Mais un compte AJOUTÉ au seed (les comptes de
      // démonstration des portées, lot V-4) n'apparaîtrait jamais sur une
      // installation existante, et il faudrait le recréer à la main sur chaque
      // poste. L'ajout est purement additif : rien n'est écrasé, rien n'est
      // ressuscité — un matricule déjà connu du disque est laissé tel quel.
      const known = new Set(this.users.map((u) => u.matricule.toLowerCase()));
      for (const u of seeded) {
        if (!known.has(u.matricule.toLowerCase())) this.users.push({ ...u });
      }
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
    // La matrice persistée peut porter d'anciens rôles ou l'ancien vocabulaire
    // (fonctionnalités RBAC au lieu de modules, avant l'ADR 0015) : on ne reprend
    // que les clés connues, les défauts complètent le reste.
    // Un instantané d'avant l'ADR 0022 ne connaît pas les rôles du profil
    // « direx » : on reprend les bascules des rôles qu'il connaît, les autres
    // gardent leurs défauts.
    if (snap.roleFeatures) {
      for (const role of ROLES) {
        if (!snap.roleFeatures[role]) continue;
        for (const [k, v] of Object.entries(snap.roleFeatures[role])) {
          if (isModuleKey(k) && typeof v === "boolean") this.roleFeatures[role][k] = v;
        }
      }
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
    // Deux organisations ne se mêlent pas sur un compte (ADR 0022) : ses rôles
    // sont ceux d'un seul mode — les rôles techniques et les chefs d'entité,
    // communs aux deux, se cumulent avec l'un ou l'autre.
    if (!rolesShareProfile(roles)) {
      throw new BadRequestException("Un compte porte les rôles d'un seul mode : classique ou Direx, pas les deux.");
    }
    // Sous un mode, l'autre profil n'est pas servi : ses rôles ne s'attribuent pas.
    const active = this.profiles?.current() ?? "classique";
    const horsMode = roles.filter((r) => !roleInProfile(r, active));
    if (horsMode.length > 0) {
      throw new BadRequestException(`${this.profiles?.refusal() ?? "Mode en service."} Rôle(s) hors mode : ${horsMode.join(", ")}.`);
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

  /**
   * Une région n'a qu'UN wali et qu'UN commandant de place d'armes. Un second
   * titulaire n'est pas une nuance mais une erreur de saisie : le compte est
   * refusé, avec le nom du titulaire en place pour que l'administrateur sache
   * qui déloger s'il le faut vraiment. `exceptId` exclut le compte en cours de
   * modification — se réaffecter à sa propre région n'est pas un doublon.
   */
  private assertUniqueOnRegion(roles: readonly Role[], assignments: Assignments | undefined, exceptId?: string): void {
    const region = assignments?.region;
    if (!region) return;
    for (const role of UNIQUE_PER_REGION_ROLES) {
      if (!roles.includes(role)) continue;
      const titulaire = this.users.find(
        (u) => u.id !== exceptId && !u.disabled && u.roles.includes(role) && u.assignments?.region === region,
      );
      if (titulaire) {
        throw new ConflictException(
          `La région « ${region} » a déjà un ${ROLE_LABELS[role]} : ${displayName(titulaire)} (${titulaire.matricule}).`,
        );
      }
    }
  }

  /**
   * Une autorité civile n'a pas de grade militaire. Le refuser à l'écriture
   * vaut mieux que l'afficher : « Colonel » devant le nom d'un wali serait une
   * information fausse sur un poste de commandement.
   */
  private assertCivilHasNoGrade(roles: readonly Role[], grade: string | undefined): void {
    if (!grade?.trim()) return;
    const civil = CIVIL_ROLES.find((r) => roles.includes(r));
    if (civil) {
      throw new BadRequestException(`Un ${ROLE_LABELS[civil]} est une autorité civile : il ne porte pas de grade militaire.`);
    }
  }

  // --- écriture ------------------------------------------------------------

  create(
    creator: Role,
    actorUsername: string,
    input: { matricule: string; nom: string; prenom?: string; phone?: string; grade?: string; roles: Role[]; assignments?: Assignments },
  ): { user: ManagedUserPublic; tempPassword: string } {
    this.validateRoles(creator, input.roles);
    const assignments = this.normalizeAssignments(input.roles, input.assignments, input.assignments !== undefined);
    this.assertCivilHasNoGrade(input.roles, input.grade);
    this.assertUniqueOnRegion(input.roles, assignments);
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
      this.assertUniqueOnRegion(u.roles, u.assignments, u.id);
    }
    this.assertCivilHasNoGrade(u.roles, patch.grade !== undefined ? patch.grade : u.grade);
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
    // La demande d'aide est SERVIE : c'est ce geste-ci qu'elle attendait.
    u.resetRequestedAt = null;
    this.persist();
    return { tempPassword };
  }

  /**
   * Les administrateurs à prévenir d'une demande concernant `target` : ceux
   * qui pourraient y RÉPONDRE. Un Administrateur ne gère pas un compte
   * privilégié (`assertManageable`) — le prévenir d'une demande qu'il ne peut
   * pas servir ne ferait que lui révéler un compte qu'il ne doit pas voir. Un
   * compte suspendu ne reçoit rien, et personne n'est prévenu de sa propre
   * demande.
   */
  listAdminsFor(target: ManagedUser): ManagedUser[] {
    const privileged = target.roles.some((r) => r === "superadmin" || r === "admin");
    return this.users.filter(
      (u) =>
        !u.disabled &&
        u.id !== target.id &&
        (u.roles.includes("superadmin") || (!privileged && u.roles.includes("admin"))),
    );
  }

  /**
   * « Mot de passe oublié », depuis l'écran de connexion — SANS session.
   *
   * Pose la demande sur le compte et le rend, pour que l'appelant prévienne
   * l'administration. Rend `null` — et l'appelant répond EXACTEMENT comme si
   * la demande était prise — quand le compte est inconnu, suspendu, ou qu'une
   * demande est déjà en attente : l'écran de connexion n'est pas un annuaire,
   * et une demande répétée ne doit pas marteler la cloche des administrateurs.
   * Le compte système n'a pas d'administrateur au-dessus de lui : son code se
   * remet hors-bande, comme à l'installation.
   */
  requestPasswordReset(matricule: string): ManagedUser | null {
    const u = this.byMatricule(matricule);
    if (!u || u.disabled || u.builtin || u.resetRequestedAt) return null;
    u.resetRequestedAt = new Date().toISOString();
    this.persist();
    return u;
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

  /** Ne garde que les rôles du mode en service (ADR 0022) : l'autre profil n'est pas servi. */
  private onlyActive<T>(table: Record<Role, T>): Record<Role, T> {
    const active = this.profiles?.current() ?? "classique";
    return Object.fromEntries(Object.entries(table).filter(([r]) => roleInProfile(r as Role, active))) as Record<Role, T>;
  }

  getRoleFeatures(): Record<Role, Record<string, boolean>> {
    return this.onlyActive(this.roleFeatures);
  }

  /** Les défauts (dérivés de la matrice RBAC) : ce que « réinitialiser » restaure, ce que le point « modifié » compare. */
  getDefaultRoleFeatures(): Record<Role, Record<string, boolean>> {
    return this.onlyActive(DEFAULT_ROLE_FEATURES);
  }

  setRoleFeature(role: Role, feature: string, enabled: boolean): Record<string, boolean> {
    if (!isModuleKey(feature)) {
      throw new BadRequestException(`Module inconnu : ${feature}`);
    }
    // Le cœur (comptes, supervision, paramètres) figure dans la matrice mais ne
    // se coupe pas : c'est par lui qu'on rallume le reste (ADR 0017).
    if (isCoreModule(feature)) {
      throw new BadRequestException(`Module verrouillé : ${feature}`);
    }
    if (role === "superadmin" || role === "admin") {
      throw new ForbiddenException("Les rôles superadmin/admin ont un accès total verrouillé.");
    }
    this.roleFeatures[role] = { ...this.roleFeatures[role], [feature]: enabled };
    this.persist();
    return this.roleFeatures[role];
  }

  /**
   * Bascule d'un module pour UN compte (ADR 0016) : `enabled` à `null` rend la
   * décision au rôle. Les comptes superadmin/admin ne se coupent pas.
   */
  setUserModule(actorRole: Role, id: string, module: string, enabled: boolean | null): ManagedUserPublic {
    if (!isModuleKey(module)) throw new BadRequestException(`Module inconnu : ${module}`);
    if (isCoreModule(module)) throw new BadRequestException(`Module verrouillé : ${module}`);
    const u = this.findVisible(actorRole, id);
    this.assertManageable(actorRole, u);
    if (u.roles.some((r) => r === "superadmin" || r === "admin")) {
      throw new ForbiddenException("Les comptes superadmin/admin ont un accès total verrouillé.");
    }
    const next: Partial<Record<ModuleKey, boolean>> = { ...(u.modules ?? {}) };
    if (enabled === null) delete next[module];
    else next[module] = enabled;
    u.modules = Object.keys(next).length ? next : undefined;
    this.persist();
    return toPublic(u);
  }

  /** Les bascules propres à un compte, par nom d'utilisateur (garde RBAC, profil). */
  userModules(matricule: string): Partial<Record<ModuleKey, boolean>> {
    return this.byMatricule(matricule)?.modules ?? {};
  }

  /**
   * Modules effectifs d'un compte pour un rôle actif : drapeaux globaux ∧ rôle
   * ∧ compte. Le joker du Super Administrateur n'est coupé que par les drapeaux.
   * Le cœur (ADR 0017) ne se coupe par rien : son état est celui du RBAC.
   */
  effectiveModules(matricule: string, role: Role, flags: Record<string, boolean>): Record<ModuleKey, boolean> {
    const own = this.userModules(matricule);
    const byRole = this.roleFeatures[role] ?? {};
    return Object.fromEntries(
      MODULE_KEYS.map((m) => {
        if (isCoreModule(m)) return [m, DEFAULT_ROLE_FEATURES[role][m]];
        if (flags[m] === false) return [m, false];
        if (role === "superadmin") return [m, true];
        if (own[m] !== undefined) return [m, own[m] === true];
        return [m, byRole[m] !== false];
      }),
    ) as Record<ModuleKey, boolean>;
  }

  /** Remet un rôle à ses modules par défaut. */
  resetRoleFeatures(role: Role): Record<string, boolean> {
    if (role === "superadmin" || role === "admin") {
      throw new ForbiddenException("Les rôles superadmin/admin ont un accès total verrouillé.");
    }
    this.roleFeatures[role] = { ...DEFAULT_ROLE_FEATURES[role] };
    this.persist();
    return this.roleFeatures[role];
  }

  // --- déploiement sur incident (lot V-2) ----------------------------------
  //
  // Écriture ÉTROITE, volontairement distincte de `update()` : déployer n'est pas
  // administrer un compte. `update()` exige d'être admin (`assertManageable`),
  // alors qu'un OPCOM — qui n'a aucun droit sur les comptes — doit pouvoir armer
  // SON opération. Le contrôle d'accès du geste vit donc sur la route
  // (`incidents:update` + visibilité de l'incident), pas ici.

  /**
   * Pose ou retire l'incident de déploiement d'un compte.
   *
   * Passe par `normalizeAssignments` plutôt que d'écrire le champ directement :
   * c'est lui qui tient les invariants. Un compte dont aucun rôle ne relève d'un
   * incident sera donc refusé ici même, sans que l'appelant ait à y penser.
   *
   * UN SEUL incident à la fois : poser une nouvelle affectation REMPLACE la
   * précédente. L'ancienne valeur est renvoyée pour que l'appelant puisse la
   * tracer — un retrait implicite qui ne laisserait pas de trace serait le
   * genre de chose qu'on ne découvre qu'après coup.
   */
  setDeployment(matricule: string, incidentId: string | null): { user: ManagedUser; previous: string | null } {
    const u = this.byMatricule(matricule);
    if (!u) throw new NotFoundException(`Compte inconnu : ${matricule}`);
    const previous = u.assignments?.incident ?? null;
    const next: Assignments = { ...(u.assignments ?? {}) };
    if (incidentId) next.incident = incidentId;
    else delete next.incident;
    u.assignments = this.normalizeAssignments(u.roles, next, true);
    this.persist();
    return { user: u, previous };
  }

  /**
   * Comptes actuellement déployés sur cet incident.
   *
   * `viewer` n'est PAS décoratif : la règle « un compte Super Administrateur est
   * invisible à tout autre rôle » vaut ici comme partout ailleurs. Un superadmin
   * cumulant un rôle déployable (le cas du compte de service) apparaîtrait
   * autrement dans la fiche d'incident de n'importe quel OPCOM.
   */
  listDeployedOn(incidentId: string, viewer: Role = "superadmin"): ManagedUserPublic[] {
    return this.users
      .filter((u) => u.assignments?.incident === incidentId && this.isVisibleTo(viewer, u))
      .map(toPublic);
  }

  /**
   * Qui tient quoi, vu par `viewer` : un titulaire par entité affectée et un
   * par poste déployé sur un incident. Un compte suspendu ne tient rien ; un
   * superadmin cumulant un rôle n'apparaît qu'à un superadmin, comme partout.
   * Le rôle porté est celui qui donne la charge (`resp_unit` pour une unité),
   * pas le premier de la liste.
   */
  listResponsibles(viewer: Role = "superadmin"): Responsible[] {
    const out: Responsible[] = [];
    for (const u of this.users) {
      if (u.disabled || !this.isVisibleTo(viewer, u)) continue;
      const a = u.assignments;
      if (!a) continue;
      const base = { matricule: u.matricule, nom: displayName(u), grade: u.grade };
      for (const kind of RESPONSIBILITY_KINDS) {
        const entityId = a[kind];
        if (!entityId) continue;
        const role = u.roles.find((r) => ROLE_RESPONSIBILITY[r] === kind);
        if (role) out.push({ kind, entityId, role, ...base });
      }
      if (a.incident) {
        for (const role of u.roles.filter(isDeployableRole)) out.push({ kind: "incident", entityId: a.incident, role, ...base });
      }
    }
    return out;
  }

  /** Comptes actifs tenant l'un de ces rôles SUR cette région — les autorités à prévenir. */
  listByRegion(region: string, roles: readonly Role[]): ManagedUser[] {
    return this.users.filter((u) => !u.disabled && u.assignments?.region === region && u.roles.some((r) => roles.includes(r)));
  }

  /** Comptes occupant un poste déployable — les candidats au déploiement. */
  listDeployable(viewer: Role = "superadmin"): ManagedUserPublic[] {
    return this.users
      .filter((u) => u.roles.some(isDeployableRole) && this.isVisibleTo(viewer, u))
      .map(toPublic);
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
    // Le compte s'est reconnecté de lui-même : sa demande d'aide est sans objet.
    u.resetRequestedAt = null;
    this.persist();
    return { user: u, mustChangePassword: !u.passwordChanged, mustChooseRole: u.roles.length > 1 };
  }

  /**
   * Vérifie un mot de passe SANS ouvrir de session ni rien noter (step-up :
   * signer un geste sensible depuis une session déjà ouverte). Faux pour un
   * compte inconnu, suspendu, ou dont le mot de passe n'est pas celui-là — et
   * pour un compte géré ailleurs (Keycloak), dont ce registre n'a rien.
   */
  verifyPassword(matricule: string, password: string): boolean {
    const u = this.byMatricule(matricule);
    if (!u || u.disabled) return false;
    const expected = u.passwordChanged ? u.password : u.tempPassword ?? undefined;
    return expected !== undefined && password === expected;
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
    u.resetRequestedAt = null;
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
