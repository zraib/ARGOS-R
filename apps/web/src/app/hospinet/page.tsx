"use client";

import { useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UI_ICONS } from "@/lib/icons";
import { occBarClass } from "@/lib/helpers";
import { hospitalDetail } from "@/lib/derive";
import { AddHospitalModal } from "@/components/org/AddEntityModals";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";
const etatBadge = (maint: boolean) =>
  `rounded-md px-2 py-0.5 text-[10px] font-bold ${maint ? "bg-or-500/15 text-or-500" : "bg-green-500/10 text-green-600"}`;

export default function HospinetPage() {
  const t = useDict();
  const hospitals = useArgos((s) => s.hospitals);
  const role = useArgos((s) => s.role);
  const selHosp = useArgos((s) => s.selHosp);
  const setSelHosp = useArgos((s) => s.setSelHosp);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const deployField = useArgos((s) => s.deployFieldHospital);
  const showToast = useArgos((s) => s.showToast);
  const [tab, setTab] = useState<"staff" | "beds" | "veh" | "field">("staff");
  const [adding, setAdding] = useState(false);

  const canManage = role === "superadmin" || role === "admin";
  const hosp = selHosp ? hospitals.find((h) => h.id === selHosp) : null;

  // ---- vue liste ----
  if (!hosp) {
    return (
      <section className="flex flex-col gap-4 animate-fade-in">
        {canManage && (
          <div className="flex justify-end">
            <button className="btn-primaire flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
              <Icon path={UI_ICONS.plus} size={15} />
              {t.add_hosp}
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {hospitals.map((h) => {
            const pct = Math.round((h.occ / h.lits) * 100);
            return (
              <div key={h.id} className="carte flex flex-col gap-3 p-5">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{h.nom}</h3>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{h.ville}</div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                    <span>{t.occupancy}</span>
                    <span className="font-mono">{pct} %</span>
                  </div>
                  <ProgressBar value={pct} fill={occBarClass(pct)} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.beds_free}</span>
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{h.lits - h.occ}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.icu}</span>
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{h.rea - h.reaOcc} / {h.rea}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.staff}</span>
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{h.staff}</span>
                </div>
                <button className="btn-secondaire w-full text-xs" onClick={() => { setTab("staff"); setSelHosp(h.id); }}>{t.view}</button>
              </div>
            );
          })}
        </div>
        <AddHospitalModal open={adding} onClose={() => setAdding(false)} />
      </section>
    );
  }

  // ---- vue détail ----
  const { staffRows, beds, vehRows, fields } = hospitalDetail(hosp, fieldHosps, t);
  const tabs: [typeof tab, string][] = [["staff", t.med_staff], ["beds", t.beds], ["veh", t.vehicles], ["field", t.field]];
  const tabCls = (k: string) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;
  const stat = (label: string, value: string | number, color: string) => (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/50">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <button className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" onClick={() => setSelHosp(null)}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{hosp.nom}</h2>
            <div className="text-xs text-gray-500 dark:text-rdia-300">{hosp.ville}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map(([k, label]) => (
              <button key={k} className={tabCls(k)} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stat(t.beds_total, hosp.lits, "text-rdia-600 dark:text-rdia-50")}
          {stat(t.beds_occ, hosp.occ, "text-or-500")}
          {stat(t.beds_free, hosp.lits - hosp.occ, "text-green-600")}
          {stat(t.icu, `${hosp.rea - hosp.reaOcc} / ${hosp.rea}`, "text-danger-500")}
        </div>
      </div>

      {tab === "staff" && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-rdia-600"><th className={TH}>{t.h_grade}</th><th className={TH}>{t.h_name}</th><th className={TH}>{t.h_spec}</th><th className={TH}>{t.h_status}</th></tr></thead>
            <tbody>
              {staffRows.map((p, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className={`${TD} text-xs text-gray-500 dark:text-rdia-300`}>{p.grade}</td>
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{p.nom}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{p.spec}</td>
                  <td className={TD}><Badge type={p.stType} label={p.stLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "beds" && (
        <div className="carte flex flex-col gap-4 p-5">
          {beds.map((b, i) => (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-700 dark:text-rdia-100">{b.name}</span>
                <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{b.occ} / {b.total} · {b.pct}</span>
              </div>
              <ProgressBar value={b.pctNum} fill={b.barCls} height="h-2" />
            </div>
          ))}
        </div>
      )}

      {tab === "veh" && (
        <div className="carte overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 dark:border-rdia-600"><th className={TH}>{t.h_typev}</th><th className={TH}>{t.h_qty}</th><th className={TH}>{t.h_assign}</th><th className={TH}>{t.h_state}</th></tr></thead>
            <tbody>
              {vehRows.map((v, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className={`${TD} font-medium text-gray-800 dark:text-rdia-50`}>{v.type}</td>
                  <td className={`${TD} font-mono text-xs tabular-nums text-gray-600 dark:text-rdia-200`}>{v.qty}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{v.assign}</td>
                  <td className={TD}><span className={etatBadge(v.maint)}>{v.etat}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "field" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button className="btn-primaire text-sm" onClick={() => { deployField(hosp); showToast(t.toast_field); }}>{t.deploy_field}</button>
          </div>
          {fields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((f, i) => (
                <div key={i} className="carte flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{f.nom}</h3>
                    <Badge type={f.badgeType} label={f.badgeLabel} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-rdia-300">{t.capacity}</span>
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{f.cap} {t.beds.toLowerCase()}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-rdia-300">{t.since}</span>
                    <span className="font-semibold text-gray-800 dark:text-rdia-50">{f.depuis}</span>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                      <span>{t.occupancy}</span>
                      <span className="font-mono">{f.pct}</span>
                    </div>
                    <ProgressBar value={f.pctNum} fill={f.barCls} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
