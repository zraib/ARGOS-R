"use client";

// ============================================================================
// ARGOS — « Actions entreprises » : le journal de conduite d'un incident
// (ADR 0032)
//
// Deux colonnes — l'événement, l'action entreprise — et, pour chaque ligne, la
// date et l'heure choisies au sélecteur. Le journal reste chronologique ; qui
// a saisi ou corrigé une ligne est affiché. Saisir, corriger, retirer suivent
// les permissions servies (`actions_log:create/update/delete`) — l'API
// refuse de toute façon ce que le bouton ne montre pas.
// ============================================================================

import { useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import type { Incident, IncidentActionEntry } from "@/lib/types";

/** Valeur d'un champ `datetime-local` (heure locale du poste) pour un instant ISO. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** L'instant ISO d'un champ `datetime-local` ; `null` si vide ou invalide. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Draft = { at: string; event: string; action: string };

export function ActionsLog({ incident }: { incident: Incident }) {
  const t = useDict();
  const can = useArgos((s) => s.can);
  const showToast = useArgos((s) => s.showToast);
  const loadDomain = useArgos((s) => s.loadDomain);
  const canAdd = can("actions_log:create");
  const canEdit = can("actions_log:update");
  const canDelete = can("actions_log:delete");
  const log = incident.actionsLog ?? [];

  const [draft, setDraft] = useState<Draft>(() => ({ at: toLocalInput(new Date().toISOString()), event: "", action: "" }));
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>({ at: "", event: "", action: "" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Exécute une écriture, dit le refus s'il y en a un, relit le domaine sinon. */
  const run = async (write: () => Promise<{ error?: unknown }>, ok: string): Promise<boolean> => {
    setBusy(true);
    setErr(null);
    const res = await write();
    setBusy(false);
    if (res.error) {
      setErr(apiErrorMessage(res.error));
      return false;
    }
    showToast(ok);
    void loadDomain({ ai: false });
    return true;
  };

  const add = async () => {
    const at = fromLocalInput(draft.at);
    if (!at || (!draft.event.trim() && !draft.action.trim())) {
      setErr(t.al_need_text);
      return;
    }
    const done = await run(() => api.addIncidentAction(incident.id, { at, event: draft.event.trim(), action: draft.action.trim() }), t.al_saved);
    if (done) setDraft({ at: toLocalInput(new Date().toISOString()), event: "", action: "" });
  };

  const save = async (e: IncidentActionEntry) => {
    const at = fromLocalInput(edit.at);
    if (!at || (!edit.event.trim() && !edit.action.trim())) {
      setErr(t.al_need_text);
      return;
    }
    const done = await run(() => api.updateIncidentAction(incident.id, e.id, { at, event: edit.event.trim(), action: edit.action.trim() }), t.al_saved);
    if (done) setEditing(null);
  };

  const remove = async (e: IncidentActionEntry) => {
    const done = await run(() => api.deleteIncidentAction(incident.id, e.id), t.al_removed);
    if (done) setConfirming(null);
  };

  const cellInput = "input-champ w-full text-[12.5px]";

  return (
    <section aria-labelledby={`al-${incident.id}`} className="rounded-xl border border-gray-200 bg-white/60 p-3 dark:border-rdia-700/50 dark:bg-rdia-800/30">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`al-${incident.id}`} className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
          <Icon path={UI_ICONS.check} size={13} className="text-or-500" />
          {t.al_title}
          <span className="rounded-md bg-rdia-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rdia-600 dark:text-rdia-200">{log.length}</span>
        </h3>
        {!canAdd && <span className="text-[11px] text-gray-400 dark:text-rdia-400">{t.al_readonly}</span>}
      </div>

      {/* En-têtes (écran large) : date et heure · événement · action entreprise. */}
      <div className="hidden grid-cols-[11.5rem_1fr_1fr_auto] gap-2 border-b border-gray-200 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 dark:border-rdia-700 dark:text-rdia-400 md:grid">
        <span>{t.al_col_at}</span>
        <span>{t.al_col_event}</span>
        <span>{t.al_col_action}</span>
        <span className="w-16" />
      </div>

      {log.length === 0 && <p className="py-2 text-[12px] text-gray-500 dark:text-rdia-300">{t.al_empty}</p>}

      <ol className="divide-y divide-gray-100 dark:divide-rdia-700/60">
        {log.map((e) =>
          editing === e.id ? (
            <li key={e.id} className="grid grid-cols-1 gap-2 py-2 md:grid-cols-[11.5rem_1fr_1fr_auto]">
              <input type="datetime-local" aria-label={t.al_col_at} className={cellInput} value={edit.at} onChange={(ev) => setEdit({ ...edit, at: ev.target.value })} />
              <textarea rows={2} aria-label={t.al_col_event} className={cellInput} value={edit.event} onChange={(ev) => setEdit({ ...edit, event: ev.target.value })} />
              <textarea rows={2} aria-label={t.al_col_action} className={cellInput} value={edit.action} onChange={(ev) => setEdit({ ...edit, action: ev.target.value })} />
              <div className="flex items-start gap-1.5">
                <button className="btn-primaire cible-tactile text-xs" disabled={busy} onClick={() => void save(e)}>{t.al_save}</button>
                <button className="btn-secondaire cible-tactile text-xs" disabled={busy} onClick={() => setEditing(null)}>{t.cancel}</button>
              </div>
            </li>
          ) : (
            <li key={e.id} className="grid grid-cols-1 gap-1 py-2 text-[12.5px] md:grid-cols-[11.5rem_1fr_1fr_auto] md:gap-2">
              <span className="font-mono text-[11.5px] tabular-nums text-rdia-600 dark:text-or-300">{fmt(e.at)}</span>
              <span className="whitespace-pre-wrap break-words text-gray-800 dark:text-rdia-100">
                <span className="me-1 text-[10.5px] font-semibold uppercase text-gray-400 md:hidden">{t.al_col_event} :</span>
                {e.event || "—"}
              </span>
              <span className="whitespace-pre-wrap break-words font-semibold text-gray-900 dark:text-white">
                <span className="me-1 text-[10.5px] font-semibold uppercase text-gray-400 md:hidden">{t.al_col_action} :</span>
                {e.action || "—"}
                <span className="mt-0.5 block text-[10.5px] font-normal text-gray-400 dark:text-rdia-400">
                  {tpl(t.al_by, { by: e.by })}
                  {e.updatedBy ? ` · ${tpl(t.al_edited, { by: e.updatedBy })}` : ""}
                </span>
              </span>
              <span className="flex items-start justify-end gap-1">
                {canEdit && (
                  <button
                    type="button"
                    title={t.al_edit}
                    aria-label={`${t.al_edit} — ${fmt(e.at)}`}
                    className="cible-tactile rounded-md p-1.5 text-gray-500 hover:bg-rdia-500/10 hover:text-rdia-600 dark:text-rdia-300 dark:hover:text-or-300"
                    onClick={() => {
                      setEditing(e.id);
                      setConfirming(null);
                      setEdit({ at: toLocalInput(e.at), event: e.event, action: e.action });
                    }}
                  >
                    <Icon path={UI_ICONS.edit} size={14} />
                  </button>
                )}
                {canDelete &&
                  (confirming === e.id ? (
                    <span className="flex items-center gap-1">
                      <button className="rounded-md bg-danger-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-danger-500" disabled={busy} onClick={() => void remove(e)}>{t.al_delete}</button>
                      <button className="rounded-md px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:text-rdia-300 dark:hover:bg-white/5" onClick={() => setConfirming(null)}>{t.cancel}</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      title={t.al_delete_confirm}
                      aria-label={`${t.al_delete} — ${fmt(e.at)}`}
                      className="cible-tactile rounded-md p-1.5 text-danger-500 hover:bg-danger-500/10"
                      onClick={() => setConfirming(e.id)}
                    >
                      <Icon path={UI_ICONS.trash} size={14} />
                    </button>
                  ))}
              </span>
            </li>
          ),
        )}
      </ol>

      {canAdd && (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-dashed border-gray-200 pt-2 dark:border-rdia-700 md:grid-cols-[11.5rem_1fr_1fr_auto]">
          <input type="datetime-local" aria-label={t.al_col_at} className={cellInput} value={draft.at} onChange={(ev) => setDraft({ ...draft, at: ev.target.value })} />
          <textarea rows={2} aria-label={t.al_col_event} placeholder={t.al_event_ph} className={cellInput} value={draft.event} onChange={(ev) => setDraft({ ...draft, event: ev.target.value })} />
          <textarea rows={2} aria-label={t.al_col_action} placeholder={t.al_action_ph} className={cellInput} value={draft.action} onChange={(ev) => setDraft({ ...draft, action: ev.target.value })} />
          <button className="btn-primaire cible-tactile flex items-center justify-center gap-1 self-start text-xs" disabled={busy} onClick={() => void add()}>
            <Icon path={UI_ICONS.plus} size={13} /> {t.al_add}
          </button>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-2 rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-1.5 text-[12px] font-semibold text-danger-400">{err}</p>
      )}
    </section>
  );
}
