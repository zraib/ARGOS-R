"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { corpsLabel, corpsShort } from "@/lib/corps";
import type { Destination, UnitAssignment, UnitCorps } from "@/lib/types";

// ============================================================================
// Unités affectées à l'opération (ADR 0016) — la section de la fiche incident
// où l'OPCOM affecte, où le TACOM et les cellules déploient.
//
// Ce que l'appelant peut faire est dit par l'API (`assignableCorps`,
// `canDeploy`) : l'écran ne fait que masquer ce qui serait refusé. Chaque
// membre de l'OPCOM ne voit dans le sélecteur que les unités de SON corps ;
// la destination ne se choisit que pour une unité des FAR — la gendarmerie
// et les unités civiles rejoignent le PCO.
// ============================================================================

interface Listing {
  assignments: UnitAssignment[];
  assignableCorps: readonly UnitCorps[] | "*";
  canDeploy: boolean;
}

export function UnitAssignments({ incidentId, closed }: { incidentId: string; closed?: boolean }) {
  const t = useDict();
  const units = useArgos((s) => s.units);
  const showToast = useArgos((s) => s.showToast);
  const loadDomain = useArgos((s) => s.loadDomain);
  const [listing, setListing] = useState<Listing | null>(null);
  const [pick, setPick] = useState("");
  const [destination, setDestination] = useState<Destination>("pct");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api.getAssignments(incidentId);
    setListing((res.data as unknown as Listing | undefined) ?? null);
  }, [incidentId]);
  useEffect(() => { void load(); }, [load]);

  const assignable = useMemo(() => {
    if (!listing) return [] as typeof units;
    const allowed = listing.assignableCorps;
    const n = search.trim().toLowerCase();
    return units.filter((u) => {
      const corps = u.corps ?? "far";
      if (allowed !== "*" && !allowed.includes(corps)) return false;
      if (u.assignment) return false; // déjà affectée quelque part
      return !n || `${u.nom} ${u.ville} ${u.id}`.toLowerCase().includes(n);
    });
  }, [units, listing, search]);
  const canAssign = !!listing && (listing.assignableCorps === "*" || listing.assignableCorps.length > 0) && !closed;
  const picked = units.find((u) => u.id === pick);
  const pickedFar = (picked?.corps ?? "far") === "far";

  const act = async (fn: () => Promise<{ error?: unknown }>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await fn();
      if (error) {
        const msg = (error as { message?: string | string[] }).message;
        showToast(Array.isArray(msg) ? msg.join(" · ") : (msg ?? t.as_failed));
      } else {
        showToast(okMsg);
        setPick("");
        await load();
        void loadDomain({ ai: false });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!listing) return null;
  const rows = listing.assignments;
  const byDest = (d: Destination) => rows.filter((a) => a.destination === d);

  return (
    <div className="rounded-xl border border-gray-200 bg-white/60 p-3 dark:border-rdia-700/50 dark:bg-rdia-800/30">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
          <Icon path={NAV_ICONS.units} size={13} className="text-or-500" />
          {t.as_title}
          {rows.length > 0 && <span className="rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold text-or-500">{rows.length}</span>}
        </div>
        {canAssign && listing.assignableCorps !== "*" && (
          <span className="text-[10.5px] text-gray-400 dark:text-rdia-400">{t.as_corps_hint.replace("{corps}", listing.assignableCorps.map((c) => corpsLabel(c, t)).join(", "))}</span>
        )}
      </div>
      <p className="mb-2 text-[11px] leading-snug text-gray-400 dark:text-rdia-400">{t.as_hint}</p>

      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-rdia-300">{t.as_none}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["pco", "pct"] as const).map((d) => (
            <div key={d} className="rounded-lg bg-gray-50 p-2 dark:bg-rdia-900/40">
              <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300">{d === "pco" ? t.as_pco : t.as_pct} <span className="font-normal opacity-70">({byDest(d).length})</span></div>
              {byDest(d).length === 0 && <p className="text-[11px] text-gray-400 dark:text-rdia-400">—</p>}
              <ul className="flex flex-col gap-1">
                {byDest(d).map((a) => {
                  const u = units.find((x) => x.id === a.unitId);
                  const deployed = !!a.deployedAt;
                  return (
                    <li key={a.unitId} className="flex flex-wrap items-center justify-between gap-1.5 rounded-md bg-white px-2 py-1 dark:bg-rdia-800/60">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-50">{u?.nom ?? a.unitId} <span className="font-normal text-gray-400 dark:text-rdia-400">· {corpsShort(u?.corps)}</span></div>
                        <div className="text-[10.5px] text-gray-400 dark:text-rdia-400">{t.as_by} {deployed ? a.deployedBy : a.by}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Pill tone={deployed ? "amber" : "gray"} label={deployed ? t.as_deployed : t.as_waiting} size="sm" />
                        {listing.canDeploy && !closed && (
                          <button type="button" disabled={busy} onClick={() => void act(() => (deployed ? api.withdrawUnit(incidentId, a.unitId) : api.deployUnit(incidentId, a.unitId)), deployed ? t.as_withdrawn_toast : t.as_deployed_toast)}
                            className={`cible-tactile rounded-md px-2 py-0.5 text-[11px] font-semibold ${deployed ? "text-gray-500 hover:text-danger-500 dark:text-rdia-300" : "bg-or-500 text-rdia-600 hover:bg-or-400"}`}>
                            {deployed ? t.as_withdraw : t.as_deploy}
                          </button>
                        )}
                        {canAssign && (
                          <button type="button" disabled={busy} title={t.as_remove} aria-label={`${t.as_remove} — ${u?.nom ?? a.unitId}`} onClick={() => void act(() => api.unassignUnit(incidentId, a.unitId), t.as_removed_toast)}
                            className="cible-tactile flex items-center justify-center rounded-md p-1 text-gray-400 hover:bg-danger-500/10 hover:text-danger-500">
                            <Icon path={UI_ICONS.close} size={12} />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {canAssign && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[10.5px] font-semibold text-gray-500 dark:text-rdia-300">{t.as_add}</label>
            <input className="input-champ mb-1 w-full text-base md:text-xs" placeholder={t.as_search} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input-champ w-full text-base md:text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{assignable.length === 0 ? t.as_no_unit : `${t.as_unit}…`}</option>
              {assignable.map((u) => <option key={u.id} value={u.id}>{u.nom} · {corpsShort(u.corps)} · {u.ville}</option>)}
            </select>
          </div>
          {picked && pickedFar && (
            <div>
              <label className="mb-1 block text-[10.5px] font-semibold text-gray-500 dark:text-rdia-300">{t.as_destination}</label>
              <select className="input-champ w-full text-base md:text-xs" value={destination} onChange={(e) => setDestination(e.target.value as Destination)}>
                <option value="pct">{t.as_pct}</option>
                <option value="pco">{t.as_pco}</option>
              </select>
            </div>
          )}
          <button type="button" className="btn-primaire cible-tactile text-xs" disabled={!picked || busy}
            onClick={() => picked && void act(() => api.assignUnit(incidentId, { unitId: picked.id, destination: pickedFar ? destination : "pco" }), t.as_assigned_toast)}>
            {t.as_add}
          </button>
        </div>
      )}
    </div>
  );
}
