import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { NOTIFICATION_GATEWAY, type NotificationGateway } from "@/common/ports/notification-gateway.port";
import { LogNotificationGateway } from "@/common/notifications/log-notification.gateway";
import { loadDevState, saveDevState } from "@/common/dev-store";
import { SeismicService, SeismicEvent } from "@/modules/domain/seismic.service";

// ============================================================================
// ARGOS — alertes sismiques nationales : configuration + notification autorités
// Le serveur surveille lui-même le flux sismique (indépendamment des postes
// connectés) : tout séisme SUR LE TERRITOIRE NATIONAL de magnitude ≥ seuil
// déclenche l'envoi SMS + e-mail aux autorités configurées. En mode dev,
// l'envoi est SIMULÉ (journalisé + historisé) ; en production, brancher la
// passerelle SMS souveraine et le SMTP interne ici, sans toucher au contrat.
// Le seuil « monde » est lu par le frontend (notification dans l'app seulement).
// ============================================================================

export interface AuthorityContact {
  name: string;
  phone: string;
  email: string;
}

export interface SeismicAlertConfig {
  /** Magnitude minimale d'un séisme NATIONAL déclenchant SMS + e-mail. */
  maMinMag: number;
  /** Magnitude minimale d'un séisme MONDIAL pour la notification dans l'app. */
  globalMinMag: number;
  /** Autorités notifiées (SMS + e-mail) pour les séismes nationaux. */
  contacts: AuthorityContact[];
}

/** Trace d'un envoi aux autorités (historique consultable dans les Paramètres). */
export interface SeismicNotification {
  id: string;
  quakeId: string;
  mag: number;
  region: string;
  /** Heure d'origine du séisme (ISO). */
  quakeTime: string;
  /** Heure de l'envoi (ISO). */
  sentAt: string;
  /** Nombre d'autorités notifiées. */
  contacts: number;
  channels: ("sms" | "email")[];
  /**
   * Ce qui est RÉELLEMENT parti, par destinataire et par canal. `via: "log"`
   * signifie « simulé, rien n'est parti » : l'historique ne laisse jamais croire
   * à un envoi qui n'a pas eu lieu.
   */
  deliveries?: { channel: "sms" | "email"; to: string; via: string; ok: boolean; detail?: string }[];
}

const DEFAULT_CONFIG: SeismicAlertConfig = { maMinMag: 4.0, globalMinMag: 5.5, contacts: [] };
const POLL_MS = 60_000;
const LOG_MAX = 50;

// Contour national approché (Maroc, provinces du Sud incluses), [lng, lat].
// Copie du polygone du frontend (apps/web/src/lib/map/morocco.ts) — bases de
// code indépendantes ; garder les deux contours synchronisés.
const MOROCCO_POLY: [number, number][] = [
  [-17.06, 20.77], [-16.2, 23.0], [-15.93, 23.72], [-15.2, 24.6],
  [-14.5, 26.13], [-13.4, 27.1], [-12.93, 27.94], [-11.4, 28.4],
  [-10.6, 28.99], [-10.18, 29.37], [-9.81, 30.05], [-9.6, 30.42],
  [-9.88, 30.63], [-9.77, 31.51], [-9.26, 32.3], [-8.5, 33.25],
  [-7.62, 33.6], [-6.84, 34.03], [-6.29, 34.88], [-6.15, 35.19],
  [-5.93, 35.79], [-5.56, 35.85], [-5.36, 35.89], [-5.28, 35.6],
  [-5.09, 35.45], [-4.67, 35.21], [-3.93, 35.25], [-2.96, 35.44],
  [-2.75, 35.12], [-2.22, 35.09], [-1.79, 34.75], [-1.73, 34.5],
  [-1.67, 34.09], [-1.55, 33.4], [-1.3, 32.9], [-1.13, 32.42],
  [-1.23, 32.11], [-2.0, 31.85], [-2.93, 31.68], [-3.65, 31.1],
  [-4.6, 30.55], [-5.3, 30.1], [-6.5, 29.6], [-7.35, 29.4],
  [-8.2, 28.9], [-8.67, 28.7], [-8.67, 27.66], [-8.67, 26.0],
  [-12.0, 26.0], [-12.0, 23.45], [-13.0, 22.75], [-13.1, 21.33],
  [-16.96, 21.33],
];

/** Test point-dans-polygone (lancer de rayon) sur le contour national. */
export function pointInMorocco(lng: number, lat: number): boolean {
  let inside = false;
  const n = MOROCCO_POLY.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = MOROCCO_POLY[i];
    const [xj, yj] = MOROCCO_POLY[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

@Injectable()
export class SeismicAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeismicAlertsService.name);
  private config: SeismicAlertConfig;
  /** Séismes déjà traités (pas de double envoi, survit aux redémarrages). */
  private readonly notified: Set<string>;
  private notifications: SeismicNotification[];
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Premier passage : on amorce sans notifier (pas de rafale au démarrage). */
  private primed = false;

  constructor(
    private readonly seismic: SeismicService,
    @Optional() @Inject(NOTIFICATION_GATEWAY) private readonly gateway: NotificationGateway = new LogNotificationGateway(),
  ) {
    this.config = { ...DEFAULT_CONFIG, ...loadDevState<Partial<SeismicAlertConfig>>("seismic-alert-config", {}) };
    this.notified = new Set(loadDevState<string[]>("seismic-notified", []));
    this.notifications = loadDevState<SeismicNotification[]>("seismic-notifications", []);
    this.primed = this.notified.size > 0;
  }

  onModuleInit(): void {
    // Surveillance serveur : la notification des autorités ne dépend d'aucun
    // navigateur ouvert. Premier balayage rapide puis toutes les POLL_MS.
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getConfig(): SeismicAlertConfig {
    return this.config;
  }

  updateConfig(next: SeismicAlertConfig): SeismicAlertConfig {
    this.config = {
      maMinMag: Math.round(next.maMinMag * 10) / 10,
      globalMinMag: Math.round(next.globalMinMag * 10) / 10,
      contacts: next.contacts.map((c) => ({ name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim() })),
    };
    saveDevState("seismic-alert-config", this.config);
    return this.config;
  }

  listNotifications(): SeismicNotification[] {
    return this.notifications;
  }

  /** Balayage : séismes nationaux ≥ seuil non encore traités → notification. */
  private async sweep(): Promise<void> {
    try {
      // Flux mondial puis test polygone : la boîte EMSC « morocco » est plus
      // étroite que le territoire (provinces du Sud).
      const events = await this.seismic.recent(this.config.maMinMag, "world", 100);
      const national = events.filter((e) => e.mag >= this.config.maMinMag && pointInMorocco(e.lon, e.lat));
      if (!this.primed) {
        // Amorçage : l'existant est considéré déjà traité (pas d'envoi rétroactif).
        for (const e of national) this.notified.add(e.id);
        this.primed = true;
        saveDevState("seismic-notified", [...this.notified]);
        return;
      }
      for (const e of national) {
        if (this.notified.has(e.id)) continue;
        this.notified.add(e.id);
        this.dispatch(e);
      }
      saveDevState("seismic-notified", [...this.notified]);
    } catch (err) {
      this.logger.warn(`Balayage sismique en échec : ${(err as Error).message}`);
    }
  }

  /**
   * Prévient les autorités configurées par la passerelle (SMTP réel si
   * configuré, journalisation sinon) et historise l'envoi AVEC son résultat.
   * L'entrée d'historique est écrite tout de suite (l'alerte a été déclenchée),
   * puis complétée par les livraisons quand elles répondent.
   */
  private dispatch(e: SeismicEvent): void {
    const { contacts } = this.config;
    const msg = `ARGOS — ALERTE SISMIQUE NATIONALE : M${e.mag.toFixed(1)} ${e.region} (${e.time}), prof. ${e.depth} km`;
    if (contacts.length === 0) this.logger.warn(`Séisme national M${e.mag} sans autorité configurée — aucun envoi.`);
    const entree: SeismicNotification = {
      id: `NTF-${Date.now().toString(36)}`,
      quakeId: e.id,
      mag: e.mag,
      region: e.region,
      quakeTime: e.time,
      sentAt: new Date().toISOString(),
      contacts: contacts.length,
      channels: ["sms", "email"] as ("sms" | "email")[],
      deliveries: [],
    };
    this.notifications = [entree, ...this.notifications].slice(0, LOG_MAX);
    saveDevState("seismic-notifications", this.notifications);
    void this.deliver(entree, contacts, msg);
  }

  private async deliver(entree: SeismicNotification, contacts: SeismicAlertConfig["contacts"], msg: string): Promise<void> {
    for (const c of contacts) {
      const [sms, email] = await Promise.all([
        this.gateway.sendSms({ to: c.phone, text: msg }),
        this.gateway.sendEmail({ to: c.email, subject: msg.slice(0, 80), text: `${msg}\n\nDestinataire : ${c.name}` }),
      ]);
      entree.deliveries?.push({ channel: "sms", to: c.phone, via: sms.via, ok: sms.ok, detail: sms.detail });
      entree.deliveries?.push({ channel: "email", to: c.email, via: email.via, ok: email.ok, detail: email.detail });
      this.logger.log(`${c.name} : SMS ${sms.ok ? "envoyé" : "non envoyé"} (${sms.via}) · e-mail ${email.ok ? "envoyé" : "non envoyé"} (${email.via})`);
    }
    saveDevState("seismic-notifications", this.notifications);
  }
}
