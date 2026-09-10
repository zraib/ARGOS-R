"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useArgos, useDict, useModules } from "@/lib/store";
import { nearestIncident } from "@/lib/posts";
import { postKindLabel } from "@/components/map/PostToolbox";

// ============================================================================
// Modale de pose d'un poste (lot #12) : le point est déjà choisi sur la carte,
// reste à dire POUR QUELLE opération — la plus proche est proposée — et, pour
// un abri ou un parc, QUELLE entité le poste représente.
// ============================================================================

const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
const fieldCls = "input-champ text-sm";

export function PlacePostModal() {
  const t = useDict();
  const m = useModules();
  const pending = useArgos((s) => s.pendingPost);
  const setPending = useArgos((s) => s.setPendingPost);
  const incidents = useArgos((s) => s.incidents);
  const shelters = useArgos((s) => s.shelters);
  const units = useArgos((s) => s.units);
  const createPost = useArgos((s) => s.createPost);
  const showToast = useArgos((s) => s.showToast);

  const [incidentId, setIncidentId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // À chaque nouveau point lâché : l'opération la plus proche, rien d'autre.
  useEffect(() => {
    if (!pending) return;
    setIncidentId(nearestIncident(pending.ll, incidents)?.id ?? "");
    setEntityId("");
    setLabel("");
  }, [pending, incidents]);

  if (!pending) return null;

  const actives = incidents.filter((i) => !i.archived);
  const needsEntity = pending.kind === "shelter" || pending.kind === "equipment";
  const entities =
    pending.kind === "shelter"
      ? shelters.map((s) => ({ id: s.id, nom: `${s.nom} · ${s.ville}` }))
      : pending.kind === "equipment"
        ? units.map((u) => ({ id: u.id, nom: `${u.nom} · ${u.ville}` }))
        : [];
  const canPlace = !!incidentId && (!needsEntity || !!entityId) && !busy;

  const submit = async () => {
    if (!canPlace) return;
    setBusy(true);
    try {
      await createPost(incidentId, { kind: pending.kind, ll: pending.ll, label: label.trim() || undefined, entityId: needsEntity ? entityId : undefined });
      showToast(t.post_placed);
      setPending(null);
    } catch (err: unknown) {
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${t.post_place_title} — ${postKindLabel(pending.kind, t, m)}`} onClose={() => setPending(null)} size="md">
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{t.post_incident}</label>
          {actives.length === 0 ? (
            <p className="text-xs text-danger-500">{t.post_no_incident}</p>
          ) : (
            <select className={fieldCls} value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">—</option>
              {actives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} · {i.titre}
                </option>
              ))}
            </select>
          )}
        </div>

        {needsEntity && (
          <div>
            <label className={labelCls}>{pending.kind === "shelter" ? t.post_entity_shelter : t.post_entity_equipment}</label>
            <select className={fieldCls} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              <option value="">—</option>
              {entities.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nom}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelCls}>{t.post_label}</label>
          <input className={fieldCls} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>

        <div>
          <label className={labelCls}>{t.post_coords}</label>
          <div className="input-champ font-mono text-sm text-gray-500 dark:text-rdia-300">
            {pending.ll[1].toFixed(5)}, {pending.ll[0].toFixed(5)}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3 dark:border-rdia-700/50">
          <button type="button" className="btn-secondaire text-sm" onClick={() => setPending(null)}>
            {t.cancel}
          </button>
          <button type="button" className="btn-primaire text-sm disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void submit()} disabled={!canPlace}>
            {busy ? "…" : t.post_place}
          </button>
        </div>
      </div>
    </Modal>
  );
}
