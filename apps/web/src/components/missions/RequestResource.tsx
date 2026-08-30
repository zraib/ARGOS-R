"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { CAP_LABELS } from "@/lib/reco";

// ============================================================================
// « Demander un moyen » — le sens MONTANT de la file (ADR 0007, lot P2-a)
//
// Jusqu'ici la file du répartiteur était strictement descendante : elle était
// alimentée par des données de démonstration, et un hôpital saturé ou un abri
// à court d'eau n'avait aucun geste pour réclamer quoi que ce soit. Le champ
// `needs` d'un abri était un texte libre que personne ne consommait.
//
// La demande emprunte la MÊME boucle qu'un ordre — c'est tout l'intérêt d'un
// objet unique : le demandeur voit son état évoluer, la conduite l'accepte ou
// la refuse avec motif, et la trace est identique.
//
// Le catalogue de capacités est celui du moteur de recommandation
// (`lib/reco.ts`) : demander « eau » signifie exactement la même chose des deux
// côtés de la file, et la reco sait déjà classer les unités qui la portent.
// ============================================================================

const URGENCIES = ["low", "medium", "high"] as const;

export function RequestResource({ entityLabel }: { entityLabel: string }) {
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const busy = useArgos((s) => s.missionBusy);
  const request = useArgos((s) => s.requestResource);
  const outbox = useArgos((s) => s.missionOutbox);
  const showToast = useArgos((s) => s.showToast);

  const [open, setOpen] = useState(false);
  const [incidentId, setIncidentId] = useState("");
  const [capability, setCapability] = useState("");
  const [urgency, setUrgency] = useState<(typeof URGENCIES)[number]>("medium");
  const [note, setNote] = useState("");

  /** Incidents encore ouverts : on ne demande pas de renfort pour un incident clos. */
  const openIncidents = useMemo(() => incidents.filter((i) => !i.archived && i.st !== "closed"), [incidents]);

  /** Mes demandes en cours — le suivi promis par la boucle. */
  const mine = useMemo(() => outbox.filter((m) => m.kind === "resource_request"), [outbox]);

  const canSubmit = incidentId !== "" && capability !== "";

  const submit = async () => {
    if (!canSubmit || busy) return;
    const capLabel = CAP_LABELS[capability as keyof typeof CAP_LABELS] ?? capability;
    const ok = await request({
      incidentId,
      label: `${entityLabel} — ${capLabel}${note.trim() ? ` · ${note.trim()}` : ""}`,
      capability,
      urgency,
    });
    showToast(ok ? t.rq_sent : t.rq_failed);
    if (ok) {
      setOpen(false);
      setCapability("");
      setNote("");
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  // 16 px sur mobile : sous ce seuil iOS zoome au focus et décale la modale.
  const fieldCls = "input-champ text-base md:text-sm";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => setOpen(true)}>
          <Icon path={UI_ICONS.send} size={14} /> {t.rq_ask}
        </button>
        {mine.length > 0 && (
          <span className="text-[11px] text-gray-500 dark:text-rdia-300">
            {mine.length} {t.rq_pending}
          </span>
        )}
      </div>

      <Modal open={open} title={t.rq_title} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls} htmlFor="rq-inc">{t.rq_incident}</label>
            <select id="rq-inc" className={fieldCls} value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">—</option>
              {openIncidents.map((i) => (
                <option key={i.id} value={i.id}>{i.id} — {i.titre}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls} htmlFor="rq-cap">{t.rq_capability}</label>
            <select id="rq-cap" className={fieldCls} value={capability} onChange={(e) => setCapability(e.target.value)}>
              <option value="">—</option>
              {Object.entries(CAP_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t.rq_urgency}</label>
            <div className="grid grid-cols-3 gap-2">
              {URGENCIES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgency(u)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                    urgency === u
                      ? "border-or-500 bg-or-500/10 text-or-500"
                      : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                  }`}
                >
                  {u === "low" ? t.rq_low : u === "medium" ? t.rq_medium : t.rq_high}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="rq-note">{t.rq_note}</label>
            <input id="rq-note" className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.rq_note} />
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button className="btn-secondaire cible-tactile text-xs" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button className="btn-primaire cible-tactile text-xs" disabled={!canSubmit || busy} onClick={submit}>
              {t.rq_send}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
