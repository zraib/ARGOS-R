"use client";

// ============================================================================
// ARGOS — pièces jointes : verser un fichier, en relire le contenu
//
// Partagé par le centre de communication et les fenêtres flottantes. Le
// contenu part par une route dédiée qui vérifie son type contre ses octets
// réels ; seule la FICHE de la pièce voyage ensuite dans le message. Un
// fichier refusé ne laisse donc jamais un message orphelin dans le canal.
// Le jeton porteur ne pouvant pas voyager dans une balise `img`, le contenu
// se relit par `fetch` authentifié — ce qui évite aussi qu'une pièce soit
// lisible par une simple URL.
// ============================================================================

import { API_BASE, getStoredToken } from "@/lib/api";
import type { CommsAttachment } from "@/lib/api-client";

export const ATTACHMENT_MAX_BYTES = 40 * 1024 * 1024;
/** La liste BLANCHE du serveur, telle quelle : ce que le sélecteur de fichier propose. */
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/csv";

export type UploadFailure = "too_big" | "refused" | "failed";
export type UploadResult = { ok: true; attachment: CommsAttachment } | { ok: false; reason: UploadFailure };

/** Verse un fichier et rend sa fiche — ou la raison, nommée, de l'échec. */
export async function uploadAttachment(file: File): Promise<UploadResult> {
  if (file.size > ATTACHMENT_MAX_BYTES) return { ok: false, reason: "too_big" };
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/comms/attachments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getStoredToken() ?? ""}` },
      body: form,
    });
    if (!res.ok) return { ok: false, reason: res.status === 400 ? "refused" : "failed" };
    return { ok: true, attachment: (await res.json()) as CommsAttachment };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** Le contenu d'une pièce, ou `null` si le serveur ne le rend pas. */
export async function fetchAttachmentBlob(id: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${API_BASE}/api/comms/attachments/${id}`, {
      headers: { Authorization: `Bearer ${getStoredToken() ?? ""}` },
    });
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/** « 12 Ko », « 3,4 Mo » — au moins 1 Ko, pour qu'un fichier ne pèse jamais « 0 ». */
export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1048576).toFixed(1)} Mo`;
}
