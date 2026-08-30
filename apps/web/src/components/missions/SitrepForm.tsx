"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Compte rendu de situation — le BATTEMENT (ADR 0007, lot P3-b)
//
// L'état-major lisait des jauges, jamais des comptes rendus : impossible de
// savoir si le silence d'un abri voulait dire « rien à signaler » ou
// « débordé ».
//
// Le formulaire est volontairement MINUSCULE — trois champs, dont deux
// facultatifs — parce qu'un compte rendu long n'est pas rendu. Les chiffres de
// l'entité sont déjà connus de la plateforme : les redemander serait faire
// ressaisir ce qu'elle sait.
//
// La cadence attendue vient du niveau d'alerte national (N1 quotidien →
// N4 horaire) ; le retard s'affiche ici comme il s'affiche à l'état-major.
// ============================================================================

const STATES = ["nominal", "strained", "overwhelmed"] as const;

export function SitrepForm({
  entityKind,
  entityId,
}: {
  entityKind: "hospital" | "unit" | "shelter" | "morgue";
  entityId: string;
}) {
  const t = useDict();
  const publish = useArgos((s) => s.publishSitrep);
  const missing = useArgos((s) => s.sitrepMissing);
  const cadence = useArgos((s) => s.sitrepCadenceMin);
  const showToast = useArgos((s) => s.showToast);

  const [open, setOpen] = useState(false);
  const [state, setState] = useState<(typeof STATES)[number]>("nominal");
  const [needs, setNeeds] = useState("");
  const [nextPoint, setNextPoint] = useState("");
  const [busy, setBusy] = useState(false);

  /** Suis-je en retard ? Le signal est le même des deux côtés. */
  const late = useMemo(() => missing.find((m) => m.entityId === entityId), [missing, entityId]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await publish({
        entityKind,
        entityId,
        state,
        ...(needs.trim() ? { needs: needs.trim() } : {}),
        ...(nextPoint.trim() ? { nextPoint: nextPoint.trim() } : {}),
      });
      showToast(ok ? t.sit_sent : t.sit_failed);
      if (ok) {
        setOpen(false);
        setNeeds("");
        setNextPoint("");
      }
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  const fieldCls = "input-champ text-base md:text-sm";
  const cadenceLabel = cadence >= 1440 ? t.sit_daily : `${Math.round(cadence / 60)} h`;

  return (
    <div className="carte flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon path={UI_ICONS.legend} size={15} className={late ? "text-danger-500" : "text-or-500"} />
          <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.sit_title}</h3>
          <span className="text-[11px] text-gray-400 dark:text-rdia-400">{t.sit_every} {cadenceLabel}</span>
        </div>
        {late && (
          <span className="rounded-md bg-danger-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger-500">
            {late.lastAt === null ? t.sit_never : `${t.sit_late} ${Math.round(late.overdueMin / 60)} h`}
          </span>
        )}
        {!open && (
          <button className="btn-primaire cible-tactile text-xs" onClick={() => setOpen(true)}>
            {t.sit_publish}
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>{t.sit_state}</label>
            <div className="grid grid-cols-3 gap-2">
              {STATES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setState(v)}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
                    state === v
                      ? "border-or-500 bg-or-500/10 text-or-500"
                      : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                  }`}
                >
                  {v === "nominal" ? t.sit_nominal : v === "strained" ? t.sit_strained : t.sit_overwhelmed}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="sit-needs">{t.sit_needs}</label>
            <input id="sit-needs" className={fieldCls} value={needs} onChange={(e) => setNeeds(e.target.value)} placeholder={t.sit_needs} />
          </div>
          <div>
            <label className={labelCls} htmlFor="sit-next">{t.sit_next}</label>
            <input id="sit-next" className={fieldCls} value={nextPoint} onChange={(e) => setNextPoint(e.target.value)} placeholder={t.sit_next} />
          </div>
          <p className="text-[10.5px] text-gray-400 dark:text-rdia-400">{t.sit_immutable}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondaire cible-tactile text-xs" onClick={() => setOpen(false)}>{t.cancel}</button>
            <button className="btn-primaire cible-tactile text-xs" disabled={busy} onClick={submit}>{t.sit_send}</button>
          </div>
        </div>
      )}
    </div>
  );
}
