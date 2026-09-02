import { createServer, type Server, type Socket } from "node:net";
import { LogNotificationGateway } from "@/common/notifications/log-notification.gateway";
import { SmtpNotificationGateway, composerMessage, smtpConfigFromEnv } from "@/common/notifications/smtp-notification.gateway";

// ============================================================================
// Passerelle de notification (registre R-5) — le SMTP minimal est éprouvé
// contre un serveur factice qui parle le dialogue de la RFC 5321 et garde ce
// qu'il reçoit ; la passerelle de journalisation dit qu'elle n'envoie rien.
// ============================================================================

interface Capture {
  commandes: string[];
  data: string;
  auth?: string;
}

/** Un serveur SMTP factice : accepte tout, retient le message. */
function fauxSmtp(opts: { exigerAuth?: boolean } = {}): Promise<{ port: number; captures: Capture[]; close: () => Promise<void> }> {
  const captures: Capture[] = [];
  const server: Server = createServer((socket: Socket) => {
    const cap: Capture = { commandes: [], data: "" };
    captures.push(cap);
    let enData = false;
    let tampon = "";
    socket.write("220 faux.smtp ESMTP\r\n");
    socket.on("data", (d) => {
      tampon += d.toString("utf8");
      for (;;) {
        const fin = tampon.indexOf("\r\n");
        if (fin === -1) return;
        const ligne = tampon.slice(0, fin);
        tampon = tampon.slice(fin + 2);
        if (enData) {
          if (ligne === ".") {
            enData = false;
            socket.write("250 OK queued\r\n");
          } else cap.data += ligne + "\r\n";
          continue;
        }
        cap.commandes.push(ligne);
        const verbe = ligne.split(" ")[0].toUpperCase();
        if (verbe === "EHLO") socket.write("250-faux.smtp\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n");
        else if (verbe === "AUTH") {
          cap.auth = ligne.slice(11);
          socket.write("235 Authentication successful\r\n");
        } else if (verbe === "MAIL") {
          if (opts.exigerAuth && !cap.auth) socket.write("530 Authentication required\r\n");
          else socket.write("250 OK\r\n");
        } else if (verbe === "RCPT") socket.write("250 OK\r\n");
        else if (verbe === "DATA") {
          enData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (verbe === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else socket.write("500 Unknown\r\n");
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, captures, close: () => new Promise<void>((r) => server.close(() => r())) });
    }),
  );
}

describe("Passerelle SMTP", () => {
  it("livre un e-mail : dialogue complet, en-têtes, corps, et le dit", async () => {
    const srv = await fauxSmtp();
    try {
      const gw = new SmtpNotificationGateway({ host: "127.0.0.1", port: srv.port, from: "argos@etat-major.ma", tls: false });
      const r = await gw.sendEmail({ to: "wali@region.ma", subject: "ALERTE SISMIQUE", text: "M5.9 Al Haouz\nprof. 10 km" });
      expect(r).toEqual({ ok: true, via: "smtp" });
      const cap = srv.captures[0];
      expect(cap.commandes.map((c) => c.split(" ")[0])).toEqual(["EHLO", "MAIL", "RCPT", "DATA", "QUIT"]);
      expect(cap.commandes).toContain("MAIL FROM:<argos@etat-major.ma>");
      expect(cap.commandes).toContain("RCPT TO:<wali@region.ma>");
      expect(cap.data).toContain("Subject: ALERTE SISMIQUE\r\n");
      expect(cap.data).toContain("To: wali@region.ma\r\n");
      expect(cap.data).toContain("M5.9 Al Haouz\r\nprof. 10 km");
    } finally {
      await srv.close();
    }
  });

  it("s'authentifie en PLAIN quand un compte est configuré", async () => {
    const srv = await fauxSmtp({ exigerAuth: true });
    try {
      const gw = new SmtpNotificationGateway({ host: "127.0.0.1", port: srv.port, from: "argos@x", tls: false, user: "argos", password: "secret" });
      const r = await gw.sendEmail({ to: "a@b.c", subject: "s", text: "t" });
      expect(r.ok).toBe(true);
      expect(Buffer.from(srv.captures[0].auth ?? "", "base64").toString("utf8")).toBe("\0argos\0secret");
    } finally {
      await srv.close();
    }
  });

  it("double le point en début de ligne (le corps ne peut pas terminer le message)", () => {
    const m = composerMessage("a@b", { to: "c@d", subject: "s", text: "ligne\n.fin prématurée ?\n..deux" });
    expect(m).toContain("\r\n..fin prématurée ?\r\n...deux");
  });

  it("refuse une adresse qui injecterait des en-têtes", async () => {
    const gw = new SmtpNotificationGateway({ host: "127.0.0.1", port: 1, from: "a@b", tls: false });
    const r = await gw.sendEmail({ to: "x@y\r\nBcc: espion@ailleurs", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/destinataire invalide/);
  });

  it("serveur injoignable : l'envoi échoue en le disant, sans lever", async () => {
    const srv = await fauxSmtp();
    await srv.close(); // port libéré → connexion refusée
    const gw = new SmtpNotificationGateway({ host: "127.0.0.1", port: srv.port, from: "a@b", tls: false, timeoutMs: 2000 });
    const r = await gw.sendEmail({ to: "a@b.c", subject: "s", text: "t" });
    expect(r.ok).toBe(false);
    expect(r.via).toBe("smtp");
    expect(r.detail).toBeTruthy();
  });

  it("les SMS restent journalisés : aucune passerelle télécom n'est branchée, et c'est écrit", async () => {
    const gw = new SmtpNotificationGateway({ host: "127.0.0.1", port: 1, from: "a@b", tls: false });
    expect(await gw.sendSms({ to: "+2126…", text: "t" })).toMatchObject({ ok: false, via: "log" });
  });
});

describe("Passerelle de journalisation et configuration", () => {
  it("sans SMTP_HOST, aucune configuration SMTP — la journalisation prend le relais", () => {
    expect(smtpConfigFromEnv({})).toBeNull();
    expect(smtpConfigFromEnv({ SMTP_HOST: "  " })).toBeNull();
  });

  it("avec SMTP_HOST, les défauts visent mailpit (1025, sans TLS)", () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "mailpit" })).toMatchObject({ host: "mailpit", port: 1025, tls: false, from: "argos@localhost" });
    expect(smtpConfigFromEnv({ SMTP_HOST: "relais", SMTP_PORT: "465", SMTP_TLS: "on", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toMatchObject({ port: 465, tls: true, user: "u", password: "p" });
  });

  it("la journalisation ne fait jamais croire à un envoi", async () => {
    const gw = new LogNotificationGateway();
    expect(await gw.sendEmail({ to: "a@b.c", subject: "s", text: "t" })).toMatchObject({ ok: false, via: "log" });
    expect(await gw.sendSms({ to: "+212", text: "t" })).toMatchObject({ ok: false, via: "log" });
  });
});
