import { Injectable, Logger } from "@nestjs/common";
import { APP_MODE, MODE_LABELS, type AppMode, type StationSettings } from "@/common/app-mode";
import { DATA_PROFILE, profileOfMode } from "@/common/data-profile";
import { loadDevState, saveDevState } from "@/common/dev-store";

/**
 * Le mode de la station (ADR 0016) : celui du processus, et le geste qui le
 * change. Le mode est lu au démarrage par tous les modules (graines,
 * adaptateurs) : changer de mode, c'est persister le réglage puis REDÉMARRER.
 * Sur la station (production), l'API s'arrête d'elle-même une fois la réponse
 * partie et Docker la relance (`restart: unless-stopped`) ; en développement,
 * le lanceur arrêterait tout — on laisse le développeur relancer.
 */
@Injectable()
export class ModeService {
  private readonly logger = new Logger("StationMode");
  private pending: AppMode | null = null;

  /** Mode en service dans ce processus. */
  current(): AppMode {
    return APP_MODE;
  }

  /** Mode demandé et pas encore appliqué (en attente de redémarrage), s'il y en a un. */
  requested(): AppMode | null {
    const persisted = loadDevState<StationSettings>("settings", {}).mode;
    const next = this.pending ?? (persisted as AppMode | undefined) ?? null;
    return next && next !== APP_MODE ? next : null;
  }

  describe(): { mode: AppMode; label: string; dataProfile: typeof DATA_PROFILE; pending: AppMode | null } {
    return { mode: APP_MODE, label: MODE_LABELS[APP_MODE], dataProfile: DATA_PROFILE, pending: this.requested() };
  }

  /**
   * Persiste le nouveau mode. Rend `restarting: true` quand le processus va
   * s'arrêter pour renaître dans ce mode (production), `false` quand un
   * redémarrage manuel est attendu (développement).
   */
  set(mode: AppMode, actor: string): { mode: AppMode; restarting: boolean; dataProfile: ReturnType<typeof profileOfMode> } {
    const settings = loadDevState<StationSettings>("settings", {});
    saveDevState("settings", { ...settings, mode });
    this.pending = mode;
    this.logger.warn(`Mode de la station : ${APP_MODE} → ${mode} demandé par ${actor}`);
    const restarting = (process.env.NODE_ENV ?? "development") === "production" && mode !== APP_MODE;
    if (restarting) {
      // Après l'écriture différée de l'instantané (150 ms) et l'envoi de la réponse.
      const t = setTimeout(() => {
        this.logger.warn("Redémarrage de l'API pour appliquer le nouveau mode.");
        process.exit(0);
      }, 1_500);
      t.unref?.();
    }
    return { mode, restarting, dataProfile: profileOfMode(mode) };
  }
}
