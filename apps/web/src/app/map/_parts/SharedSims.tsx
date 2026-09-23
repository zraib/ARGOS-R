"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Le PARTAGE d'une simulation (ADR 0029), commun au feu et à la crue.
//
// « Partager sur toutes les cartes » publie le SCÉNARIO — nature, point de
// départ, réglages ; chaque poste le rejoue chez lui. Dessous, les simulations
// que les autres ont publiées : les reprendre d'un geste, et les retirer
// (l'auteur ou le Super Administrateur) — retirée, elle disparaît de toutes
// les cartes, calcul compris.
// ============================================================================

export function SharedSims({ kind, canShare }: { kind: "fire" | "flood"; canShare: boolean }) {
  const t = useDict();
  const sims = useArgos((s) => s.sharedSims).filter((s) => s.kind === kind);
  const adopted = useArgos((s) => s.adoptedSim)[kind];
  const busy = useArgos((s) => s.simShareBusy);
  const share = useArgos((s) => s.shareSimulation);
  const adopt = useArgos((s) => s.adoptSimulation);
  const remove = useArgos((s) => s.removeSharedSimulation);
  const sessionUser = useArgos((s) => s.sessionUser);
  const role = useArgos((s) => s.role);
  const [nom, setNom] = useState("");

  const mien = (by: string) => !!sessionUser && by.toLowerCase() === sessionUser.matricule.toLowerCase();
  const effacable = (by: string) => role === "superadmin" || mien(by);

  return (
    <div className="flex flex-col gap-2 border-t border-white/12 pt-2">
      {canShare && (
        <div className="flex gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder={t.sim_share}
            aria-label={t.sim_share}
            maxLength={120}
            className="min-w-0 flex-1 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[13px] text-white placeholder:text-white/40"
          />
          <button
            type="button"
            className="btn-secondaire min-h-11 shrink-0 px-2.5 text-[12.5px] lg:min-h-0"
            onClick={() => void share(kind, nom).then(() => setNom(""))}
            disabled={busy}
            title={t.sim_share}
          >
            <Icon path={UI_ICONS.share} size={14} />
          </button>
        </div>
      )}

      <div className="text-[12px] font-bold uppercase tracking-wider text-white/50">{t.sim_shared_list}</div>
      {sims.length === 0 ? (
        <p className="text-[12px] text-white/50">{t.sim_shared_none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sims.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-white">{s.label}</span>
                <span className="block truncate text-[11px] text-white/55">
                  {t.sim_shared_by.replace("{who}", s.createdBy)}
                  {adopted === s.id ? ` · ${t.sim_running_shared}` : ""}
                </span>
              </span>
              {adopted !== s.id && (
                <button type="button" className="shrink-0 rounded-md bg-white/10 px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-white/20" onClick={() => void adopt(s.id)}>
                  {t.sim_adopt}
                </button>
              )}
              {effacable(s.createdBy) && (
                <button
                  type="button"
                  className="shrink-0 rounded-md px-1.5 py-1 text-danger-300 hover:bg-danger-500/20"
                  onClick={() => void remove(s.id)}
                  title={t.act_delete}
                  aria-label={`${t.act_delete} — ${s.label}`}
                >
                  <Icon path={UI_ICONS.trash} size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
