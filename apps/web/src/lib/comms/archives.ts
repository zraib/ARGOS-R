"use client";

// ============================================================================
// ARGOS — traçabilité du centre de communication (ADR 0021)
//
// L'export est un document JSON que l'API rend et que l'import reprend ; le
// navigateur n'y ajoute rien. Il le nomme, le fait télécharger, et vérifie
// avant tout envoi qu'un fichier choisi en est bien un — pour refuser ici,
// avec un message clair, ce que le serveur refuserait de toute façon.
// ============================================================================

import type { ImportCommsBody } from "@/lib/api-client";

/** Format du document — le même que côté serveur (`COMMS_EXPORT_FORMAT`). */
export const COMMS_EXPORT_FORMAT = "iris-comms/1";

/** Ce document est-il un export du centre ? Format, date et liste des canaux suffisent ; le serveur valide le reste. */
export function isCommsExport(doc: unknown): doc is ImportCommsBody {
  if (typeof doc !== "object" || doc === null) return false;
  const d = doc as { format?: unknown; exportedAt?: unknown; channels?: unknown };
  return d.format === COMMS_EXPORT_FORMAT && typeof d.exportedAt === "string" && Array.isArray(d.channels);
}

/** Le bilan que rend l'import : canaux repris, messages repris, canaux déjà présents. */
export type ImportOutcome = { channels: number; messages: number; skipped: number };

export function isImportOutcome(v: unknown): v is ImportOutcome {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.channels === "number" && typeof o.messages === "number" && typeof o.skipped === "number";
}

/** Nom de fichier sûr tiré d'un nom de canal : lettres et chiffres, tirets, 48 caractères au plus. */
export function fileSlug(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return s || "canal";
}

/** « iris-comms-crue-de-l-ourika-2026-09-18.json » — le canal et le jour se lisent dans le nom. */
export function exportFileName(name: string, at = new Date()): string {
  return `iris-comms-${fileSlug(name)}-${at.toISOString().slice(0, 10)}.json`;
}

/** Fait télécharger un document JSON : un objet URL éphémère, révoqué aussitôt le clic parti. */
export function downloadJson(doc: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Date et heure lisibles d'un horodatage ISO, dans la langue de l'interface —
 * pour les archives, où l'heure seule ne dit plus rien. Un horodatage
 * illisible est rendu tel quel plutôt que « Invalid Date ».
 */
export function formatStamp(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = lang === "ar" ? "ar-MA" : lang === "en" ? "en-GB" : "fr-FR";
  return d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
