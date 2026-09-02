import { Logger } from "@nestjs/common";
import type { Delivery, EmailMessage, NotificationGateway, SmsMessage } from "@/common/ports/notification-gateway.port";

/**
 * Passerelle de DÉVELOPPEMENT : rien ne part, tout est journalisé. Le résultat
 * le dit (`via: "log"`, `ok: false`) — un historique qui afficherait « envoyé »
 * pour un message jamais parti serait un mensonge dangereux en conduite.
 */
export class LogNotificationGateway implements NotificationGateway {
  private readonly log = new Logger("Notifications");

  async sendEmail(msg: EmailMessage): Promise<Delivery> {
    this.log.log(`[E-MAIL simulé → ${msg.to}] ${msg.subject} — ${msg.text}`);
    return { ok: false, via: "log", detail: "aucun serveur SMTP configuré (SMTP_HOST)" };
  }

  async sendSms(msg: SmsMessage): Promise<Delivery> {
    this.log.log(`[SMS simulé → ${msg.to}] ${msg.text}`);
    return { ok: false, via: "log", detail: "aucune passerelle SMS configurée" };
  }
}
