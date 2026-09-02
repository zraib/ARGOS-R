"use client";

import { useState } from "react";
import { useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { stBadge} from "@/lib/helpers";
import type { Incident, IncidentStatus } from "@/lib/types";


/** Confirmation d'un changement de statut par mot de passe (step-up). */
export function StatusConfirm({ inc, newSt, matricule, onClose, onDone }: { inc: Incident; newSt: IncidentStatus; matricule: string; onClose: () => void; onDone: (inc: Incident, newSt: IncidentStatus) => Promise<void> }) {
  const t = useDict();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!pass || busy) return;
    setBusy(true);
    setErr(false);
    try {
      // Vérification du mot de passe : re-connexion (ne modifie pas la session).
      const res = await api.login({ matricule, password: pass });
      if (res.error || !res.data) { setErr(true); return; }
      await api.updateIncident(inc.id, { st: newSt });
      await onDone(inc, newSt);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t.st_change_title} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600 dark:text-rdia-200">
          {inc.id} · <span className="font-semibold">{stBadge(inc.st, t).label} → {stBadge(newSt, t).label}</span>
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-or-500/10 px-3 py-2">
          <Icon path={UI_ICONS.shield} size={14} className="shrink-0 text-or-500" />
          <span className="text-[11px] font-semibold text-or-500">{t.st_change_hint}</span>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.st_change_pass}</label>
          <input type="password" className="input-champ text-base md:text-sm" value={pass} autoFocus onChange={(e) => { setPass(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
          {err && <p className="mt-1 text-xs font-semibold text-danger-500">{t.lg_badpass}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire cible-tactile text-sm" disabled={!pass || busy} onClick={() => void confirm()}>{busy ? "…" : t.confirm}</button>
        </div>
      </div>
    </Modal>
  );
}
