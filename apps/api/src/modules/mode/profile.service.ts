// ============================================================================
// ARGOS — le MODE DE L'APPLICATION (ADR 0022) : « classique » ou « direx »
//
// Un réglage de la station, comme le mode démo / exercice / opérationnel
// (ADR 0016) : persisté dans `settings.json`, changé par le Super
// Administrateur seul, signé par son mot de passe. Sous un mode, l'autre
// profil de rôles n'est pas servi : ses comptes ne se connectent pas, ses
// rôles ne s'attribuent pas, ses colonnes ne s'affichent pas. Changer de mode
// ne redémarre rien — le catalogue est en mémoire, seul le filtre change ; les
// sessions de l'autre profil tombent à leur prochaine requête.
// ============================================================================
import { Injectable, Logger } from "@nestjs/common";
import type { StationSettings } from "@/common/app-mode";
import { loadDevState, saveDevState } from "@/common/dev-store";
import { PROFILE_LABELS, isProfileId, type ProfileId } from "@/shared/profiles";

@Injectable()
export class ProfileService {
  private readonly logger = new Logger("AppProfile");
  private active: ProfileId;

  constructor() {
    const persisted = loadDevState<StationSettings>("settings", {}).profile;
    this.active = isProfileId(persisted) ? persisted : "classique";
  }

  /** Le mode en service. */
  current(): ProfileId {
    return this.active;
  }

  label(): string {
    return PROFILE_LABELS[this.active];
  }

  describe(): { profile: ProfileId; label: string } {
    return { profile: this.active, label: this.label() };
  }

  /** Change le mode — l'appelant a vérifié le rôle et la signature. */
  set(profile: ProfileId, actor: string): { profile: ProfileId; label: string; changed: boolean } {
    const changed = profile !== this.active;
    if (changed) {
      const settings = loadDevState<StationSettings>("settings", {});
      saveDevState("settings", { ...settings, profile });
      this.logger.warn(`Mode de l'application : ${this.active} → ${profile} par ${actor}`);
      this.active = profile;
    }
    return { profile, label: PROFILE_LABELS[profile], changed };
  }

  /** Le message servi à qui n'entre pas dans le mode en service. */
  refusal(): string {
    return `Le ${this.label()} est activé sur cette station — contactez l'administrateur.`;
  }
}
