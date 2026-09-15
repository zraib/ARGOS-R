"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { nearestSites } from "@/lib/morgue";
import type { MorgueSite, MortuaryRecord } from "@/lib/types";

/** Le corps part vers un autre site — du plus proche au plus loin, avec ses places libres ; la réception se confirme là-bas. */
export function TransferModal({
  record, sites, records, onClose, onDone,
}: {
  record: MortuaryRecord;
  sites: readonly MorgueSite[];
  records: readonly MortuaryRecord[];
  onClose: () => void;
  onDone: () => void;
}) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const origine = sites.find((s) => s.id === record.mid);
  const choix = nearestSites(origine?.ll, sites, records, { region: origine?.region }).filter((x) => x.site.id !== record.mid);
  const [toMid, setToMid] = useState(choix[0]?.site.id ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  const submit = async () => {
    if (!toMid) return;
    setBusy(true);
    try {
      const res = await api.transferBody(record.mid, record.id, { toMid, note: note.trim() || undefined });
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        setError(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
        return;
      }
      showToast(m.morgue.transferred);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${m.morgue.transfer_title} — ${record.reference}`}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{m.morgue.t_to}</label>
          <select className="input-champ text-base md:text-sm" value={toMid} onChange={(e) => setToMid(e.target.value)}>
            {choix.map(({ site, km, free }) => (
              <option key={site.id} value={site.id} disabled={free <= 0}>
                {site.nom} · {km !== null ? `${Math.round(km)} km · ` : ""}{free} {m.morgue.t_free}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{m.morgue.t_note}</label>
          <input className="input-champ text-base md:text-sm" placeholder={m.morgue.t_note_ph} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy || !toMid} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.morgue.transfer}
          </button>
        </div>
      </div>
    </Modal>
  );
}
