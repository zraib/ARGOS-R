"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill, type Tone } from "@/components/ui/Pill";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { nearestSites } from "@/lib/morgue";
import { fromLocalInput, isAnonymous, personName, toLocalInput, victimsOf, whenShort } from "@/lib/victims";
import { EMPTY_IDENTITY, IdentityFields, identityBody, identityDraftOf, inputCls, labelCls, type IdentityDraft } from "@/components/morgue/IdentityFields";
import type { Incident, IncidentVictim, MortuaryRecord, VictimKind } from "@/lib/types";

// ============================================================================
// Le bilan des victimes d'un incident, affiné par les intervenants après la
// déclaration : les COMPTEURS (décédés, blessés, disparus) et, quand on les
// connaît, les personnes — pour un décédé, l'identification PRÉLIMINAIRE
// (nom, prénom, CNI, sexe, âge, heure du décès), à confirmer par la morgue
// à laquelle on l'affecte : le dossier s'ouvre là-bas, réception à confirmer.
// ============================================================================

const KIND_TONE: Record<VictimKind, Tone> = { dead: "red", injured: "amber", missing: "gray", involved: "blue" };
/** Les natures, dans l'ordre de l'écran : les victimes, puis les personnes impliquées (ADR 0034). */
const KINDS: readonly VictimKind[] = ["dead", "injured", "missing", "involved"];

type Draft = IdentityDraft & { kind: VictimKind; note: string; deathAt: string; hospitalId: string; lastSeen: string };
const EMPTY_DRAFT: Draft = { ...EMPTY_IDENTITY, kind: "dead", note: "", deathAt: "", hospitalId: "", lastSeen: "" };

export function VictimsModal({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const m = useModules();
  const role = useArgos((s) => s.role);
  // La permission servie par l'API (ADR 0022) vaut pour les deux profils de rôles.
  const can = useArgos((s) => s.can);
  const hospitals = useArgos((s) => s.hospitals);
  const morgues = useArgos((s) => s.morgues);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const live = useArgos((s) => s.incidents.find((i) => i.id === incident.id)) ?? incident;
  const [victims, setVictims] = useState<IncidentVictim[]>([]);
  const [records, setRecords] = useState<MortuaryRecord[]>([]);
  const [counts, setCounts] = useState({
    dead: String(live.casualties?.dead ?? 0),
    injured: String(live.casualties?.injured ?? 0),
    missing: String(live.casualties?.missing ?? 0),
    involved: String(live.casualties?.involved ?? 0),
  });
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<IncidentVictim | null>(null);
  const [mid, setMid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Qui affine : l'API le dit (matrice `victims`) ; l'écran masque ce qu'elle refuserait.
  const canWrite = can("victims:create") || role === "superadmin";

  const load = useCallback(async () => {
    const [v, r] = await Promise.all([api.getVictims(incident.id), api.getMortuaryRegistry(incident.id)]);
    if (Array.isArray(v.data)) setVictims(v.data as unknown as IncidentVictim[]);
    if (Array.isArray(r.data)) setRecords(r.data as unknown as MortuaryRecord[]);
  }, [incident.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const refuse = (res: { error?: unknown; response?: Response }) => {
    const code = res.response?.status;
    if (res.error || (code !== undefined && code >= 400)) {
      setError(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
      return true;
    }
    return false;
  };

  /** Les compteurs : ce que la déclaration a dit, corrigé par ceux qui sont sur place. */
  const saveCounts = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = (s: string) => Math.max(0, parseInt(s, 10) || 0);
      const res = await api.updateIncident(incident.id, { casualties: { dead: n(counts.dead), injured: n(counts.injured), missing: n(counts.missing), involved: n(counts.involved) } });
      if (refuse(res)) return;
      await loadDomain();
      showToast(m.victims.counts_saved);
    } finally {
      setBusy(false);
    }
  };

  const startAdd = (kind: VictimKind) => {
    setEditing({ ...EMPTY_DRAFT, kind });
    setEditingId(null);
    setError(null);
  };
  const startEdit = (v: IncidentVictim) => {
    setEditing({ ...identityDraftOf(v), kind: v.kind, note: v.note ?? "", deathAt: toLocalInput(v.deathAt), hospitalId: v.hospitalId ?? "", lastSeen: v.lastSeen ?? "" });
    setEditingId(v.id);
    setError(null);
  };
  const saveVictim = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        ...identityBody(editing),
        kind: editing.kind,
        note: editing.note.trim() || undefined,
        deathAt: editing.kind === "dead" ? fromLocalInput(editing.deathAt) : undefined,
        hospitalId: editing.kind === "injured" ? editing.hospitalId || undefined : undefined,
        lastSeen: editing.kind === "missing" ? editing.lastSeen.trim() || undefined : undefined,
      };
      const res = editingId ? await api.updateVictim(incident.id, editingId, body) : await api.addVictim(incident.id, body);
      if (refuse(res)) return;
      setEditing(null);
      setEditingId(null);
      await Promise.all([load(), loadDomain()]);
      showToast(editingId ? m.victims.saved : m.victims.added);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (v: IncidentVictim) => {
    if (!window.confirm(m.victims.remove_confirm)) return;
    const res = await api.removeVictim(incident.id, v.id);
    if (refuse(res)) return;
    await load();
  };
  const startAssign = (v: IncidentVictim) => {
    const choix = nearestSites(live.ll, morgues, records, { region: live.region });
    // La morgue rattachée à la déclaration d'abord, sinon la plus indiquée.
    const declaree = choix.find((c) => live.responders?.morgues?.includes(c.site.id) && c.free > 0);
    setMid((declaree ?? choix.find((c) => c.free > 0) ?? choix[0])?.site.id ?? "");
    setAssigning(v);
    setError(null);
  };
  const assign = async () => {
    if (!assigning || !mid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.assignVictimMorgue(incident.id, assigning.id, mid);
      if (refuse(res)) return;
      setAssigning(null);
      await Promise.all([load(), loadDomain()]);
      showToast(`${m.victims.assigned} ${morgues.find((s) => s.id === mid)?.nom ?? mid}.`);
    } finally {
      setBusy(false);
    }
  };

  const kindLabel: Record<VictimKind, string> = { dead: m.wizard.dead, injured: m.wizard.injured, missing: m.wizard.missing, involved: m.wizard.involved };
  const siteOf = (id?: string) => morgues.find((s) => s.id === id);
  const recordOf = (v: IncidentVictim) => records.find((r) => r.id === v.recordId);
  const choix = assigning ? nearestSites(live.ll, morgues, records, { region: live.region }) : [];

  const ligne = (v: IncidentVictim) => {
    const rec = recordOf(v);
    const nom = personName(v) ?? m.victims.unidentified;
    const details = [
      v.cni ? `CNI ${v.cni}` : null,
      m.resp.dvi_sex[v.sex ?? "unknown"],
      v.age === undefined ? m.victims.age_unknown : `${v.age} ${m.victims.years}`,
      v.kind === "dead" ? `${m.victims.death_at} ${whenShort(v.deathAt) ?? m.victims.time_unknown}` : null,
      v.kind === "injured" && v.hospitalId ? hospitals.find((h) => h.id === v.hospitalId)?.nom : null,
      v.kind === "missing" && v.lastSeen ? `${m.victims.last_seen} ${v.lastSeen}` : null,
    ].filter((x): x is string => !!x);
    return (
      <li key={v.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-gray-100 p-2.5 dark:border-rdia-700/60">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[13px] font-semibold ${isAnonymous(v) ? "italic text-gray-500 dark:text-rdia-300" : "text-gray-800 dark:text-rdia-50"}`}>{nom}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{v.id}</span>
            {v.kind === "dead" && (
              v.recordId ? (
                <Pill tone={rec?.status === "identified" || rec?.status === "released" ? "green" : rec?.pendingReceipt ? "amber" : "blue"} label={
                  rec?.status === "identified" || rec?.status === "released" ? m.victims.confirmed : rec?.pendingReceipt ? m.morgue.pending_badge : m.victims.at_morgue
                } size="sm" />
              ) : (
                <Pill tone="gray" label={m.victims.no_morgue} size="sm" />
              )
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500 dark:text-rdia-300">{details.join(" · ")}</div>
          {v.kind === "dead" && v.morgueId && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500 dark:text-rdia-300">
              <Icon path={NAV_ICONS.morgue} size={11} className="text-or-500" />
              {siteOf(v.morgueId)?.nom ?? v.morgueId}
              {rec ? ` · ${rec.reference}` : ""}
            </div>
          )}
          {v.note && <div className="mt-0.5 text-[11px] italic text-gray-400 dark:text-rdia-400">{v.note}</div>}
        </div>
        {canWrite && (
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {v.kind === "dead" && !v.recordId && (
              <button type="button" onClick={() => startAssign(v)} className="cible-tactile rounded-lg bg-or-500 px-2 py-1 text-[11px] font-bold text-rdia-900 hover:bg-or-400">
                {m.victims.assign}
              </button>
            )}
            <button type="button" title={m.resp.edit} aria-label={`${m.resp.edit} — ${v.id}`} onClick={() => startEdit(v)} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
              <Icon path={UI_ICONS.edit} size={14} />
            </button>
            {!v.recordId && (
              <button type="button" title={m.resp.delete} aria-label={`${m.resp.delete} — ${v.id}`} onClick={() => void remove(v)} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-danger-500 dark:hover:bg-rdia-600">
                <Icon path={UI_ICONS.close} size={14} />
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <Modal open onClose={onClose} title={`${m.victims.title} — ${incident.id}`} size="xl">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500 dark:text-rdia-300">{m.victims.hint}</p>

        {/* --- les compteurs ------------------------------------------------- */}
        <div className="carte flex flex-wrap items-end gap-3 p-3">
          {KINDS.map((k) => (
            <div key={k} className="min-w-[110px] flex-1">
              <label className={labelCls}>{kindLabel[k]}</label>
              <input type="number" min={0} className={`${inputCls} font-mono`} value={counts[k]} disabled={!canWrite} onChange={(e) => setCounts((c) => ({ ...c, [k]: e.target.value }))} />
            </div>
          ))}
          {canWrite && (
            <button type="button" className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void saveCounts()}>
              {m.victims.save_counts}
            </button>
          )}
        </div>

        {/* --- les personnes, par nature ------------------------------------- */}
        {KINDS.map((k) => {
          const liste = victimsOf(victims, k);
          return (
            <section key={k} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Pill tone={KIND_TONE[k]} label={kindLabel[k]} size="sm" />
                <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{liste.length} / {counts[k] || 0}</span>
                {k === "dead" && <span className="text-[11px] text-gray-500 dark:text-rdia-300">{m.victims.dead_hint}</span>}
                {k === "involved" && <span className="text-[11px] text-gray-500 dark:text-rdia-300">{m.wizard.involved_hint}</span>}
                {canWrite && (
                  <button type="button" onClick={() => startAdd(k)} className="ms-auto cible-tactile flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-or-500 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-200">
                    <Icon path={UI_ICONS.plus} size={12} />
                    {m.victims.add}
                  </button>
                )}
              </div>
              {liste.length === 0 ? (
                <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.victims.none}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">{liste.map(ligne)}</ul>
              )}
            </section>
          );
        })}

        {error && !editing && !assigning && <p className="text-xs font-semibold text-danger-500">{error}</p>}
      </div>

      {/* --- saisie / correction d'une personne ----------------------------------- */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editingId ? `${m.resp.edit} — ${editingId}` : `${m.victims.add} · ${kindLabel[editing.kind]}`}>
          <div className="flex flex-col gap-4">
            {!editingId && (
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-rdia-700">
                {KINDS.map((k) => (
                  <button key={k} type="button" onClick={() => setEditing({ ...editing, kind: k })} aria-pressed={editing.kind === k} className={`min-h-9 flex-1 rounded-md px-2 text-[12px] font-semibold transition-colors ${editing.kind === k ? "bg-or-500 text-rdia-900" : "text-gray-600 hover:bg-white/60 dark:text-rdia-200"}`}>
                    {kindLabel[k]}
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-gray-400 dark:text-rdia-400">{editing.kind === "dead" ? m.victims.prelim_hint : m.victims.fields_hint}</p>
            <IdentityFields value={editing} onChange={(next) => setEditing({ ...editing, ...next })} />
            {editing.kind === "dead" && (
              <div>
                <label className={labelCls}>{m.victims.death_at}</label>
                <input type="datetime-local" className={inputCls} value={editing.deathAt} onChange={(e) => setEditing({ ...editing, deathAt: e.target.value })} />
                <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.victims.death_at_hint}</p>
              </div>
            )}
            {editing.kind === "injured" && (
              <div>
                <label className={labelCls}>{m.victims.f_hospital}</label>
                <select className={inputCls} value={editing.hospitalId} onChange={(e) => setEditing({ ...editing, hospitalId: e.target.value })}>
                  <option value="">{m.victims.f_hospital_none}</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.nom} · {h.ville}</option>
                  ))}
                </select>
              </div>
            )}
            {editing.kind === "missing" && (
              <div>
                <label className={labelCls}>{m.victims.last_seen}</label>
                <input className={inputCls} value={editing.lastSeen} onChange={(e) => setEditing({ ...editing, lastSeen: e.target.value })} />
              </div>
            )}
            <div>
              <label className={labelCls}>{m.morgue.t_note}</label>
              <input className={inputCls} value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </div>
            {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="cible-tactile btn-secondaire text-sm" onClick={() => setEditing(null)}>{m.resp.cancel}</button>
              <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void saveVictim()}>{busy ? m.resp.saving : m.resp.save}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* --- affectation d'un décédé à une morgue ---------------------------------- */}
      {assigning && (
        <Modal open onClose={() => setAssigning(null)} title={`${m.victims.assign} — ${personName(assigning) ?? assigning.id}`}>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-gray-500 dark:text-rdia-300">{m.victims.assign_hint}</p>
            <div>
              <label className={labelCls}>{m.morgue.h_to}</label>
              <select className={inputCls} value={mid} onChange={(e) => setMid(e.target.value)}>
                {choix.map(({ site, km, free }) => (
                  <option key={site.id} value={site.id} disabled={free <= 0}>
                    {live.responders?.morgues?.includes(site.id) ? "★ " : ""}{site.nom} · {km !== null ? `${Math.round(km)} km · ` : ""}{free} {m.morgue.t_free}
                  </option>
                ))}
              </select>
              {choix.length === 0 && <p className="mt-1 text-[11px] text-danger-500">{tpl(m.victims.no_site, { n: 0 })}</p>}
            </div>
            {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="cible-tactile btn-secondaire text-sm" onClick={() => setAssigning(null)}>{m.resp.cancel}</button>
              <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy || !mid} onClick={() => void assign()}>{busy ? m.resp.saving : m.victims.assign}</button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
