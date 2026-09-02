// ============================================================================
// Port : la PASSERELLE de notification des autorités (SMS, e-mail).
//
// Le domaine (alertes sismiques) décide QUI prévenir et QUOI dire ; il ne sait
// pas COMMENT le message part. Deux adaptateurs : la journalisation
// (développement, aucun envoi réel) et le SMTP (production, `SMTP_HOST`). La
// passerelle SMS d'un opérateur télécom se brancherait ici, sans toucher au
// domaine (registre R-5).
// ============================================================================

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SmsMessage {
  to: string;
  text: string;
}

/** Ce qu'un envoi rend : est-il PARTI, et par quel canal réel ? */
export interface Delivery {
  ok: boolean;
  /** `smtp`, `log` (simulé) … — ce que l'historique affiche, pour ne pas laisser croire à un envoi. */
  via: string;
  detail?: string;
}

export interface NotificationGateway {
  sendEmail(msg: EmailMessage): Promise<Delivery>;
  sendSms(msg: SmsMessage): Promise<Delivery>;
}

export const NOTIFICATION_GATEWAY = Symbol("NOTIFICATION_GATEWAY");
