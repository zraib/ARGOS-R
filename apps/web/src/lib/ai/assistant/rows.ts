// ============================================================================
// ARGOS — assistant IA · Projection des entités du domaine en lignes de réponse (tableaux de l'assistant).
//
// Extrait de l'ancien `assistant.ts` (2 782 lignes) lors de la refactorisation :
// même code, découpé par responsabilité pour être lisible, testable et
// modifiable sans relire le tout. Voir `index.ts` pour la surface publique.
// ============================================================================

import { SEV_LABEL, ST_LABEL, sevLabel } from "./labels";
import type { AiContext, AiHospitalRow, AiIncidentRow } from "./types";
import type { Hospital, Incident } from "@/lib/types";
import { etaMinutes, haversineKm } from "@/lib/reco";

export function incidentRow(i: Incident): AiIncidentRow {
  return {
    id: i.id,
    titre: i.titre,
    region: i.region,
    type: i.type,
    sev: SEV_LABEL[i.sev] ?? i.sev,
    st: ST_LABEL[i.st] ?? i.st,
    time: i.time,
    casualties: i.casualties ? { ...i.casualties } : undefined,
  };
}


export function hospitalRow(h: Hospital, fromLL?: [number, number]): AiHospitalRow {
  const occPct = h.lits ? Math.round((h.occ / h.lits) * 100) : 0;
  const icuPct = h.rea ? Math.round((h.reaOcc / h.rea) * 100) : 0;
  const row: AiHospitalRow = {
    id: h.id,
    nom: h.nom,
    ville: h.ville,
    kind: h.kind,
    occPct,
    icuPct,
    lits: h.lits,
    rea: h.rea,
  };
  if (fromLL) {
    row.distanceKm = Math.round(haversineKm(h.ll, fromLL) * 10) / 10;
    row.etaMin = etaMinutes(h.ll, fromLL);
  }
  return row;
}


export function toAiRow(i: AiContext["incidents"][number]): AiIncidentRow {
  return {
    id: i.id, titre: i.titre, region: i.region ?? "—",
    type: i.type ?? "—", sev: (sevLabel(i.sev ?? "medium") === "faible" ? "moyenne" : sevLabel(i.sev ?? "medium") === "moyen" ? "moyenne" : sevLabel(i.sev ?? "medium") === "élevé" ? "élevée" : "critique"),
    st: i.st === "prog" ? "en cours" : i.st === "closed" ? "fermé" : "ouvert",
    time: /^\d{4}-/.test(i.time ?? "")
      ? new Date(i.time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      : (i.time ?? "—"),
    lieu: i.adresse, coords: i.ll,
    declared: i.time,
  };
}
