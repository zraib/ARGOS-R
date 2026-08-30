"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Mission, MissionMilestoneKey, MissionState } from "@/lib/types";

// ============================================================================
// « Ordres reçus » — le côté terrain de la boucle fermée (ADR 0007, lot P1-b)
//
// C'est la moitié qui manquait : le répartiteur engageait une unité, et
// l'unité n'avait AUCUN écran pour l'accuser. Ce panneau ferme la boucle —
// accuser, refuser avec motif, jalonner, clore.
//
// Deux principes de conception :
//
//  • le MOTIF de refus est bloquant dans l'UI comme il l'est dans le domaine.
//    Un refus sans motif ne dit pas s'il faut réengager ailleurs, escalader ou
//    attendre : l'API le rejette (400), l'écran ne le propose donc même pas ;
//
//  • les jalons sont OFFERTS DANS L'ORDRE. On ne montre pas « sur zone » à
//    quelqu'un qui n'a pas déclaré « en route » — l'API refuserait, et une
//    action visible qui échoue est pire qu'une action absente.
//
// Voir docs/08-workflow-operationnel.md.
// ============================================================================

/** Ordre des jalons — sert aussi à ne proposer que le suivant. */
const MILESTONE_ORDER: MissionMilestoneKey[] = ["en_route", "on_site", "handover"];

/** Pastille d'état : la couleur dit l'urgence du geste attendu. */
function StateChip({ state }: { state: MissionState }) {
  const t = useDict();
  const map: Record<MissionState, { label: string; cls: string }> = {
    issued: { label: t.ms_state_issued, cls: "bg-or-500/15 text-or-600 dark:text-or-400" },
    accepted: { label: t.ms_state_accepted, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    in_progress: { label: t.ms_state_progress, cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
    declined: { label: t.ms_state_declined, cls: "bg-danger-500/10 text-danger-500" },
    completed: { label: t.ms_state_completed, cls: "bg-gray-500/10 text-gray-500 dark:text-rdia-300" },
    cancelled: { label: t.ms_state_cancelled, cls: "bg-gray-500/10 text-gray-500 dark:text-rdia-300" },
  };
  const s = map[state];
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** Âge d'une boucle, en clair. Un ordre émis qui vieillit est un signal. */
function since(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")}`;
}

function MissionRow({ m }: { m: Mission }) {
  const t = useDict();
  const act = useArgos((s) => s.actOnMission);
  const busy = useArgos((s) => s.missionBusy);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const done = new Set(m.milestones.map((x) => x.key));
  // Seul le PROCHAIN jalon est proposé : l'API refuse les sauts, et une action
  // visible qui échoue est pire qu'une action absente.
  const nextMilestone = MILESTONE_ORDER.find((k) => !done.has(k));
  const milestoneLabel: Record<MissionMilestoneKey, string> = {
    en_route: t.ms_en_route,
    on_site: t.ms_on_site,
    handover: t.ms_handover,
  };

  return (
    <div className="carte flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2">
        <span className="font-mono text-[11px] font-bold text-gray-400 dark:text-rdia-400">{m.id}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-gray-800 dark:text-rdia-50">{m.label}</span>
        <StateChip state={m.state} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-rdia-300">
        <span className="font-mono">{m.incidentId}</span>
        <span>{t.ms_since} {since(m.issuedAt)}</span>
        {m.milestones.length > 0 && (
          <span className="text-green-600 dark:text-green-400">
            {m.milestones.map((x) => milestoneLabel[x.key]).join(" · ")}
          </span>
        )}
      </div>

      {/* Saisie du motif — le refus n'est armé qu'une fois le motif écrit. */}
      {declining ? (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-gray-600 dark:text-rdia-200" htmlFor={`r-${m.id}`}>
            {t.ms_decline_reason}
          </label>
          <input
            id={`r-${m.id}`}
            className="input-champ text-base md:text-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.ms_decline_reason}
            autoFocus
          />
          <p className="text-[10.5px] text-gray-400 dark:text-rdia-400">{t.ms_reason_required}</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primaire cible-tactile text-xs"
              disabled={busy || reason.trim().length === 0}
              onClick={async () => {
                if (await act(m.id, "decline", reason.trim())) setDeclining(false);
              }}
            >
              {t.ms_decline}
            </button>
            <button className="btn-secondaire cible-tactile text-xs" onClick={() => setDeclining(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {m.state === "issued" && (
            <>
              <button className="btn-primaire cible-tactile text-xs" disabled={busy} onClick={() => act(m.id, "accept")}>
                <Icon path={UI_ICONS.check} size={13} strokeWidth={2.5} /> {t.ms_accept}
              </button>
              <button className="btn-secondaire cible-tactile text-xs" disabled={busy} onClick={() => setDeclining(true)}>
                {t.ms_decline}
              </button>
            </>
          )}
          {(m.state === "accepted" || m.state === "in_progress") && (
            <>
              {nextMilestone && (
                <button
                  className="btn-primaire cible-tactile text-xs"
                  disabled={busy}
                  onClick={() => act(m.id, "milestone", nextMilestone)}
                >
                  {milestoneLabel[nextMilestone]}
                </button>
              )}
              <button className="btn-secondaire cible-tactile text-xs" disabled={busy} onClick={() => act(m.id, "complete")}>
                {t.ms_complete}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Bannière « Ordres reçus ». Ne s'affiche QUE s'il y a quelque chose à faire :
 * un panneau vide en permanence apprend à l'opérateur à ne plus le regarder.
 */
export function OrdersInbox() {
  const t = useDict();
  const inbox = useArgos((s) => s.missionInbox);
  if (inbox.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon path={UI_ICONS.shield} size={15} className="text-or-500" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-rdia-600 dark:text-rdia-50">{t.ms_inbox}</h2>
        <span className="rounded-full bg-or-500 px-2 py-0.5 text-[10px] font-bold text-rdia-900">{inbox.length}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {inbox.map((m) => (
          <MissionRow key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}
