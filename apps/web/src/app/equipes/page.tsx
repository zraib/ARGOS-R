"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UI_ICONS } from "@/lib/icons";
import { dispoBadge } from "@/lib/helpers";
import { unitDetail } from "@/lib/derive";
import { AddUnitModal } from "@/components/org/AddEntityModals";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";
const etatBadge = (maint: boolean) =>
  `rounded-md px-2 py-0.5 text-[10px] font-bold ${maint ? "bg-or-500/15 text-or-500" : "bg-green-500/10 text-green-600"}`;

export default function EquipesPage() {
  const t = useDict();
  const units = useArgos((s) => s.units);
  const role = useArgos((s) => s.role);
  const selUnit = useArgos((s) => s.selUnit);
  const setSelUnit = useArgos((s) => s.setSelUnit);
  const [tab, setTab] = useState<"pers" | "equip" | "veh">("pers");
  const [adding, setAdding] = useState(false);

  const canManage = role === "superadmin" || role === "admin";
  const unit = selUnit ? units.find((u) => u.id === selUnit) : null;

  // ---- vue liste ----
  if (!unit) {
    return (
      <section className="flex flex-col gap-4 animate-fade-in">
        {canManage && (
          <div className="flex justify-end">
            <button className="btn-primaire flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
              <Icon path={UI_ICONS.plus} size={15} />
              {t.add_unit}
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => {
            const b = dispoBadge(u.dispo, t);
            return (
              <div key={u.id} className="carte flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{u.nom}</h3>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{u.ville}</div>
                  </div>
                  <Badge type={b.type} label={b.label} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.commander}</span>
                  <span className="font-semibold text-gray-800 dark:text-rdia-50">{u.cmdt}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.effectif}</span>
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{u.eff}</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                    <span>{t.readiness}</span>
                    <span className="font-mono">{u.readiness} %</span>
                  </div>
                  <ProgressBar value={u.readiness} />
                </div>
                <button className="btn-secondaire w-full text-xs" onClick={() => { setTab("pers"); setSelUnit(u.id); }}>{t.view}</button>
              </div>
            );
          })}
        </div>
        <AddUnitModal open={adding} onClose={() => setAdding(false)} />
      </section>
    );
  }

  // ---- vue détail ----
  const b = dispoBadge(unit.dispo, t);
  const { pers, equip, vehs } = unitDetail(unit);
  const tabs: [typeof tab, string][] = [["pers", t.personnel], ["equip", t.equipment], ["veh", t.vehicles]];
  const tabCls = (k: string) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" onClick={() => setSelUnit(null)}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{unit.nom}</h2>
            <div className="text-xs text-gray-500 dark:text-rdia-300">{unit.ville} · {unit.cmdt}</div>
          </div>
          <Badge type={b.type} label={b.label} />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.effectif}</div>
            <div className="text-xl font-bold tabular-nums text-rdia-600 dark:text-rdia-50">{unit.eff}</div>
          </div>
          <div className="min-w-[160px] flex-1">
            <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
              <span>{t.readiness}</span>
              <span className="font-mono">{unit.readiness} %</span>
            </div>
            <ProgressBar value={unit.readiness} height="h-2" />
          </div>
          <div className="flex gap-2">
            {tabs.map(([k, label]) => (
              <button key={k} className={tabCls(k)} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="carte overflow-x-auto">
        {tab === "pers" && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-rdia-600"><th className={TH}>{t.h_grade}</th><th className={TH}>{t.h_name}</th><th className={TH}>{t.h_role}</th><th className={TH}>{t.h_status}</th></tr></thead>
            <tbody>
              {pers.map((p, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className={`${TD} text-xs text-gray-500 dark:text-rdia-300`}>{p.grade}</td>
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{p.nom}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{p.fonction}</td>
                  <td className={TD}><Badge type={p.stType} label={p.stLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "equip" && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-rdia-600"><th className={TH}>{t.h_desig}</th><th className={TH}>{t.h_cat}</th><th className={TH}>{t.h_qty}</th><th className={TH}>{t.h_state}</th></tr></thead>
            <tbody>
              {equip.map((e, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{e.desig}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{e.cat}</td>
                  <td className={`${TD} font-mono text-xs tabular-nums text-gray-600 dark:text-rdia-200`}>{e.qty}</td>
                  <td className={TD}><span className={etatBadge(e.maint)}>{e.etat}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "veh" && (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-rdia-600"><th className={TH}>{t.h_typev}</th><th className={TH}>{t.h_plate}</th><th className={TH}>{t.h_assign}</th><th className={TH}>{t.h_state}</th></tr></thead>
            <tbody>
              {vehs.map((v, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{v.type}</td>
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{v.plate}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{v.assign}</td>
                  <td className={TD}><span className={etatBadge(v.maint)}>{v.etat}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
