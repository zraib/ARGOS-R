import { connect as connectTcp, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { Logger } from "@nestjs/common";
import type { Delivery, EmailMessage, NotificationGateway, SmsMessage } from "@/common/ports/notification-gateway.port";

// ============================================================================
// Passerelle SMTP — un client minimal, SANS dépendance.
//
// Le dialogue SMTP (RFC 5321) tient en six commandes ; l'écrire ici plutôt que
// d'ajouter une bibliothèque respecte la règle de souveraineté (aucune
// dépendance runtime sans ADR, MASTER_PLAN §4.3) et garde la surface auditable :
// tout ce qui sort sur le réseau est dans ce fichier. Cible en développement :
// mailpit (`infra/compose`, port 1025) ; en production : le relais de
// l'organisme, avec TLS et authentification PLAIN si `SMTP_USER` est défini.
//
// Les SMS ne partent pas d'ici : sans passerelle télécom contractualisée, ils
// restent journalisés, et l'historique le dit.
// ============================================================================

export interface SmtpConfig {
  host: string;
  port: number;
  from: string;
  tls: boolean;
  user?: string;
  password?: string;
  timeoutMs?: number;
}

/** Lit la configuration SMTP dans l'environnement ; `null` si aucun hôte n'est déclaré. */
export function smtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = (env.SMTP_HOST ?? "").trim();
  if (!host) return null;
  return {
    host,
    port: Number(env.SMTP_PORT ?? 1025),
    from: env.SMTP_FROM ?? "argos@localhost",
    tls: (env.SMTP_TLS ?? "off").toLowerCase() === "on",
    user: env.SMTP_USER || undefined,
    password: env.SMTP_PASSWORD || undefined,
    timeoutMs: 10_000,
  };
}

/** Une ligne de réponse SMTP : code à trois chiffres, continuation `-` sur les réponses multilignes. */
function lireReponses(socket: Socket): { attendre: (codeAttendu: number) => Promise<string>; fermer: () => void } {
  let tampon = "";
  const enAttente: { resolve: (r: string) => void; reject: (e: Error) => void }[] = [];
  const traiter = () => {
    for (;;) {
      const fin = tampon.indexOf("\r\n");
      if (fin === -1) return;
      // Une réponse est complète quand la dernière ligne est `NNN ` (espace), pas `NNN-`.
      const bloc = tampon.slice(0, fin + 2);
      if (/^\d{3}-/.test(bloc.split("\r\n").filter(Boolean).at(-1) ?? "")) {
        // multiligne : attendre la suite
        const lignes = tampon.split("\r\n");
        const complete = lignes.findIndex((l) => /^\d{3} /.test(l));
        if (complete === -1) return;
        const reponse = lignes.slice(0, complete + 1).join("\r\n") + "\r\n";
        tampon = tampon.slice(reponse.length);
        enAttente.shift()?.resolve(reponse);
        continue;
      }
      tampon = tampon.slice(fin + 2);
      enAttente.shift()?.resolve(bloc);
    }
  };
  socket.on("data", (d) => {
    tampon += d.toString("utf8");
    traiter();
  });
  socket.on("error", (e) => enAttente.splice(0).forEach((p) => p.reject(e)));
  socket.on("close", () => enAttente.splice(0).forEach((p) => p.reject(new Error("connexion SMTP fermée"))));
  return {
    attendre: (codeAttendu) =>
      new Promise<string>((resolve, reject) => {
        enAttente.push({
          resolve: (r) => {
            const code = Number(r.slice(0, 3));
            if (code === codeAttendu) resolve(r);
            else reject(new Error(`SMTP : attendu ${codeAttendu}, reçu « ${r.trim().split("\r\n").at(-1)} »`));
          },
          reject,
        });
      }),
    fermer: () => socket.end(),
  };
}

/** Le message, prêt pour DATA : en-têtes minimaux, points doublés en début de ligne (RFC 5321 §4.5.2). */
export function composerMessage(from: string, msg: EmailMessage): string {
  const corps = msg.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  const sujet = msg.subject.replace(/[\r\n]+/g, " ");
  return [
    `From: ${from}`,
    `To: ${msg.to}`,
    `Subject: ${sujet}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    corps,
  ].join("\r\n");
}

export class SmtpNotificationGateway implements NotificationGateway {
  private readonly log = new Logger("Notifications");

  constructor(private readonly cfg: SmtpConfig) {}

  async sendEmail(msg: EmailMessage): Promise<Delivery> {
    // Une adresse est un en-tête : un retour à la ligne dedans injecterait des
    // en-têtes. On refuse plutôt que de nettoyer.
    if (/[\r\n]/.test(msg.to) || !msg.to.includes("@")) return { ok: false, via: "smtp", detail: `destinataire invalide : ${msg.to}` };
    const socket = this.cfg.tls
      ? connectTls({ host: this.cfg.host, port: this.cfg.port, servername: this.cfg.host })
      : connectTcp({ host: this.cfg.host, port: this.cfg.port });
    socket.setTimeout(this.cfg.timeoutMs ?? 10_000, () => socket.destroy(new Error("délai SMTP dépassé")));
    const io = lireReponses(socket);
    const envoyer = (ligne: string) => {
      socket.write(ligne + "\r\n");
    };
    try {
      await io.attendre(220);
      envoyer("EHLO argos");
      await io.attendre(250);
      if (this.cfg.user) {
        envoyer("AUTH PLAIN " + Buffer.from(`\0${this.cfg.user}\0${this.cfg.password ?? ""}`).toString("base64"));
        await io.attendre(235);
      }
      envoyer(`MAIL FROM:<${this.cfg.from}>`);
      await io.attendre(250);
      envoyer(`RCPT TO:<${msg.to}>`);
      await io.attendre(250);
      envoyer("DATA");
      await io.attendre(354);
      envoyer(composerMessage(this.cfg.from, msg) + "\r\n.");
      await io.attendre(250);
      envoyer("QUIT");
      await io.attendre(221).catch(() => undefined);
      io.fermer();
      return { ok: true, via: "smtp" };
    } catch (e) {
      socket.destroy();
      const detail = e instanceof Error ? e.message : String(e);
      this.log.error(`E-mail vers ${msg.to} non parti : ${detail}`);
      return { ok: false, via: "smtp", detail };
    }
  }

  async sendSms(msg: SmsMessage): Promise<Delivery> {
    this.log.log(`[SMS simulé → ${msg.to}] ${msg.text}`);
    return { ok: false, via: "log", detail: "aucune passerelle SMS configurée" };
  }
}
