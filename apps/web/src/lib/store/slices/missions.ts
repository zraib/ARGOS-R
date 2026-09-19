// ============================================================================
// lib/store/slices/missions.ts — missions en boucle fermée (ADR 0007), niveau d'alerte, comptes rendus
//
// Tranche du magasin Zustand. `set`/`get` portent sur l'état COMPLET
// (ArgosState) : une tranche peut lire les autres, jamais les importer.
// ============================================================================

import type { StateCreator } from "zustand";
import type { ArgosState } from "@/lib/store";
import type {
  Mission,
  MissionMilestoneKey,
  } from "@/lib/types";
import { api } from "@/lib/api";
import {
  Engagement,
  } from "@/lib/store/shared";

export interface MissionsSlice {
  // --- missions : la boucle fermée (ADR 0007) ---
  /** Boucles ouvertes attendant MON geste — alimente « Ordres reçus ». */
  missionInbox: Mission[];
  /** Boucles ouvertes que j'ai émises — suivi côté répartiteur. */
  missionOutbox: Mission[];
  /** Vrai pendant un geste de boucle, pour désarmer les boutons. */
  missionBusy: boolean;
  // --- niveau d'alerte et comptes rendus (lot P3) ---
  /** Niveau d'alerte national, servi par l'API (plus une constante figée). */
  alertLevel: 1 | 2 | 3 | 4;
  /** Entités en retard de compte rendu — le silence rendu visible. */
  sitrepMissing: { entityKind: string; entityId: string; nom: string; lastAt: string | null; overdueMin: number }[];
  /** Cadence attendue en minutes, dérivée du niveau d'alerte. */
  sitrepCadenceMin: number;
  // --- dispatching (Répartiteur) ---
  engagements: Engagement[];
  // --- missions ---
  /** Recharge inbox + outbox (appelé au tick de la coquille). */
  loadMissions: () => Promise<void>;
  /** Recharge le niveau d'alerte et les comptes rendus manquants. */
  loadPosture: () => Promise<void>;
  /** Publie un compte rendu pour son entité. */
  publishSitrep: (input: {
    entityKind: "hospital" | "unit" | "shelter" | "morgue";
    entityId: string;
    state: "nominal" | "strained" | "overwhelmed";
    needs?: string;
    nextPoint?: string;
  }) => Promise<boolean>;
  /** Demander un moyen depuis son entité — entre dans la file du répartiteur. */
  requestResource: (input: {
    incidentId: string;
    label: string;
    capability: string;
    urgency: "low" | "medium" | "high";
  }) => Promise<boolean>;
  /** Accepter / refuser / jalonner / clore / annuler — recharge ensuite. */
  actOnMission: (
    id: string,
    action: "accept" | "decline" | "milestone" | "complete" | "cancel",
    arg?: string,
  ) => Promise<boolean>;
}

export const createMissionsSlice: StateCreator<ArgosState, [], [], MissionsSlice> = (set, get) => ({
  missionInbox: [],
  missionOutbox: [],
  missionBusy: false,
  alertLevel: 3,
  sitrepMissing: [],
  sitrepCadenceMin: 240,
  engagements: [],
  // --- missions : la boucle fermée (ADR 0007) ---
  loadMissions: async () => {
    // Les deux corbeilles dégradent indépendamment : un rôle sans droit de
    // lecture rend simplement une liste vide, jamais une erreur bloquante.
    const [inbox, outbox, open] = await Promise.allSettled([
      api.getMissionInbox(),
      api.getMissionOutbox(),
      // Toutes les boucles ouvertes : on y puise les demandes de moyens, qui
      // s'adressent à la conduite en général et non à un destinataire nommé.
      api.getMissions(undefined, true),
    ]);
    const pick = (r: PromiseSettledResult<{ data?: unknown }>): Mission[] => {
      if (r.status !== "fulfilled") return [];
      const d = r.value.data as { missions?: Mission[] } | undefined;
      return d?.missions ?? [];
    };
    const ouvertes = pick(open);
    set({
      missionInbox: pick(inbox),
      missionOutbox: pick(outbox),
      resourceRequests: ouvertes.filter((m) => m.kind === "resource_request"),
      // Les ENGAGEMENTS du répartiteur sont les ordres ouverts adressés à une
      // unité : ils viennent de l'API, pas de la mémoire du navigateur — un
      // rechargement ne les efface plus, et chaque poste voit les mêmes.
      engagements: ouvertes
        .filter((m) => m.payload.kind === "order" && typeof m.payload.unitId === "string")
        .map((m) => ({
          id: m.id,
          unitId: m.payload.unitId as string,
          incidentId: m.incidentId,
          reason: m.label.includes(" — ") ? m.label.slice(m.label.indexOf(" — ") + 3) : m.label,
          via: (typeof m.payload.etaMin === "number" ? "reco" : "manual") as "manual" | "reco",
          ...(typeof m.payload.etaMin === "number" ? { score: m.payload.etaMin } : {}),
          time: new Date(m.issuedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        })),
    });
  },
  loadPosture: async () => {
    const [lvl, missing] = await Promise.allSettled([api.getAlertLevel(), api.getMissingSitreps()]);
    const patch: Partial<{ alertLevel: 1 | 2 | 3 | 4; sitrepMissing: never[]; sitrepCadenceMin: number }> = {};
    if (lvl.status === "fulfilled") {
      const d = lvl.value.data as { level?: 1 | 2 | 3 | 4 } | undefined;
      if (d?.level) patch.alertLevel = d.level;
    }
    if (missing.status === "fulfilled") {
      const d = missing.value.data as { missing?: never[]; cadenceMin?: number } | undefined;
      if (d?.missing) patch.sitrepMissing = d.missing;
      if (d?.cadenceMin) patch.sitrepCadenceMin = d.cadenceMin;
    }
    set(patch);
  },
  publishSitrep: async (input) => {
    const res = await api.publishSitrep(input);
    if (res.error) return false;
    await get().loadPosture();
    return true;
  },
  requestResource: async (input) => {
    set({ missionBusy: true });
    try {
      const res = await api.issueMission({
        incidentId: input.incidentId,
        label: input.label,
        // La demande s'adresse à la CONDUITE, pas à quelqu'un en particulier :
        // c'est une file partagée, pas un message privé.
        to: { role: "tacom" },
        payload: { kind: "resource_request", capability: input.capability, urgency: input.urgency },
      });
      if (res.error) return false;
      await get().loadMissions();
      return true;
    } finally {
      set({ missionBusy: false });
    }
  },
  actOnMission: async (id, action, arg) => {
    set({ missionBusy: true });
    try {
      const res =
        action === "accept" ? await api.acceptMission(id)
        : action === "decline" ? await api.declineMission(id, arg ?? "")
        : action === "milestone" ? await api.missionMilestone(id, (arg ?? "en_route") as MissionMilestoneKey)
        : action === "complete" ? await api.completeMission(id)
        : await api.cancelMission(id, arg ?? "");
      if (res.error) return false;
      // La boucle a bougé : les corbeilles ET le domaine (posture d'unité,
      // fil d'événements) sont rafraîchis.
      await get().loadMissions();
      await get().loadDomain();
      return true;
    } finally {
      set({ missionBusy: false });
    }
  },
});
