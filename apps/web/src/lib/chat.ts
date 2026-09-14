// ============================================================================
// ARGOS — conversations flottantes : ce qui se décide sans écran
//
// Quelles conversations sont « à chaud », qui est le correspondant d'une
// conversation directe, dans quel ordre les têtes s'alignent, et combien de
// fenêtres tiennent côte à côte sans recouvrir ce qui vit au bord de départ
// de la carte (mesure, coordonnées) ni la colonne des boutons flottants.
// Pur, pour être testé seul ; les composants ne font que rendre.
// ============================================================================

import type { Channel, CommCategory, CommMessage, PresenceUser } from "@/lib/types";

/** Largeur d'une fenêtre et espace entre deux fenêtres (px). */
export const CHAT_WINDOW_WIDTH = 320;
export const CHAT_WINDOW_GAP = 12;
/**
 * Bord de fin où commencent les fenêtres, en px, quand le Copilot occupe le
 * coin : la colonne des deux boutons flottants reste dégagée. 24 (marge) + 56
 * (bouton) + 12 (respiration) à partir de `sm`, 16 + 56 + 12 en dessous. Sans
 * Copilot (module coupé), le bouton des conversations prend le coin et les
 * fenêtres s'alignent sur la marge.
 */
export const CHAT_WINDOWS_END_SM = 92;
export const CHAT_WINDOWS_END_XS = 84;
export const CHAT_MARGIN_SM = 24;
export const CHAT_MARGIN_XS = 16;
/** Réserve au bord de départ, jamais recouverte : barre de mesure et coordonnées de la carte. */
export const CHAT_START_RESERVE = 420;
/** Sous cette largeur, une seule fenêtre, pleine largeur (téléphone). */
export const CHAT_MOBILE_MAX = 640;

/** Les conversations directes vivantes — celles qui ont une tête dans le dock. */
export function directChannels(cats: readonly CommCategory[]): Channel[] {
  const out: Channel[] = [];
  for (const c of cats) for (const ch of c.chans) if (ch.direct && !ch.archived) out.push(ch);
  return out;
}

/** L'AUTRE membre d'une conversation directe ; `undefined` si on n'y est pas. */
export function correspondentOf(ch: Channel, me: string | undefined): string | undefined {
  const moi = me?.toLowerCase();
  const membres = ch.members ?? [];
  if (moi && !membres.some((m) => m.toLowerCase() === moi)) return undefined;
  return membres.find((m) => m.toLowerCase() !== moi);
}

/** La présence est la connexion : un compte est en ligne s'il a un flux ouvert. */
export function isOnline(matricule: string | undefined, online: readonly PresenceUser[]): boolean {
  if (!matricule) return false;
  const m = matricule.toLowerCase();
  return online.some((u) => u.matricule.toLowerCase() === m);
}

/** Identifiant du dernier message serveur (les brouillons, négatifs, ne comptent pas) ; 0 sans message. */
export function lastMessageId(msgs: readonly CommMessage[] | undefined): number {
  let best = 0;
  for (const m of msgs ?? []) if (m.id > best) best = m.id;
  return best;
}

/**
 * L'ordre des têtes : les fenêtres ouvertes d'abord, dans leur ordre
 * d'ouverture, puis les autres de la plus récemment active à la plus ancienne.
 * Une conversation sans message (qui vient d'être ouverte) passe avant le
 * silence des autres, pour qu'on la retrouve là où on l'attend.
 */
export function orderConversations(
  chans: readonly Channel[],
  msgs: Readonly<Record<string, CommMessage[]>>,
  open: readonly string[],
): Channel[] {
  const rang = new Map(open.map((id, i) => [id, i]));
  return [...chans].sort((a, b) => {
    const ra = rang.get(a.id);
    const rb = rang.get(b.id);
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    const d = lastMessageId(msgs[b.id]) - lastMessageId(msgs[a.id]);
    return d !== 0 ? d : a.name.localeCompare(b.name, "fr");
  });
}

/** Non-lus des seules conversations directes — le badge du bouton flottant. */
export function unreadDirect(chans: readonly Channel[], unread: Readonly<Record<string, number>>): number {
  return chans.reduce((n, ch) => n + (unread[ch.id] ?? 0), 0);
}

/**
 * Combien de fenêtres tiennent côte à côte : une sur téléphone, sinon ce que
 * la largeur permet entre la colonne des boutons et la réserve du bord de
 * départ — au moins une, quatre au plus (au-delà on ne suit plus).
 */
export function maxOpenWindows(viewportWidth: number, withCopilot = true): number {
  if (viewportWidth < CHAT_MOBILE_MAX) return 1;
  const utile = viewportWidth - windowsEnd(viewportWidth, withCopilot) - CHAT_START_RESERVE;
  return Math.max(1, Math.min(4, Math.floor(utile / (CHAT_WINDOW_WIDTH + CHAT_WINDOW_GAP))));
}

/**
 * Où commencent les fenêtres depuis le bord de fin : AU NIVEAU DES BULLES,
 * alignées sur le bouton des conversations — une fenêtre s'ouvre juste
 * au-dessus des têtes, jamais à l'autre bout de l'écran. Ce que la carte
 * garde à ce bord (panneau de sélection, rose des vents) s'écarte de son côté.
 */
export function windowsEnd(viewportWidth: number, withCopilot = true): number {
  if (viewportWidth < CHAT_MOBILE_MAX) return withCopilot ? CHAT_WINDOWS_END_XS : CHAT_MARGIN_XS;
  return withCopilot ? CHAT_WINDOWS_END_SM : CHAT_MARGIN_SM;
}

/** Décalage depuis le bord de fin de la fenêtre de rang `index` (0 = la plus récente, la plus près des boutons). */
export function windowOffset(index: number, viewportWidth: number, withCopilot = true): number {
  return windowsEnd(viewportWidth, withCopilot) + index * (CHAT_WINDOW_WIDTH + CHAT_WINDOW_GAP);
}

/** Ouvre une fenêtre en tête et retient les `limit` plus récentes. */
export function withOpened(open: readonly string[], id: string, limit: number): string[] {
  return [id, ...open.filter((x) => x !== id)].slice(0, Math.max(1, limit));
}
