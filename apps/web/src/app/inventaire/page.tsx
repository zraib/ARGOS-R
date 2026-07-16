"use client";

import { useMemo, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { type EquipCondition, type MovementType } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";
import { NAV_ICONS, KPI_ICONS } from "@/lib/icons";

const CONDITION: Record<EquipCondition, { tone: Tone; key: "cond_ok" | "cond_repair" | "cond_oos" }> = {
  ok: { tone: "green", key: "cond_ok" },
  repair: { tone: "gold", key: "cond_repair" },
  oos: { tone: "red", key: "cond_oos" },
};
const MOVE: Record<MovementType, Tone> = { in: "green", out: "amber", transfer: "blue" };

export default function InventairePage() {
  const catalog = useArgos((s) => s.catalog);
  const EQUIPMENT = catalog.equipment;
  const MOVEMENTS = catalog.movements;
  const m = useModules();
  const [tab, setTab] = useState<"catalog" | "movements">("catalog");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return EQUIPMENT.filter((e) => !n || `${e.desig}${e.cat}${e.unit}${e.id}`.toLowerCase().includes(n));
  }, [q, EQUIPMENT]);

  const refs = EQUIPMENT.length;
  const okCount = EQUIPMENT.filter((e) => e.cond === "ok").length;
  const alerts = EQUIPMENT.filter((e) => e.stock < e.threshold).length;

  const tabCls = (k: string) =>
    `rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.equip.kpi_refs} value={refs} icon={NAV_ICONS.res} tint="or" />
        <StatTile label={m.equip.kpi_ok} value={okCount} icon={KPI_ICONS.units} tint="green" />
        <StatTile label={m.equip.kpi_alerts} value={alerts} icon={KPI_ICONS.incidents} tint="danger" />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          <button className={tabCls("catalog")} onClick={() => setTab("catalog")}>{m.equip.tab_catalog}</button>
          <button className={tabCls("movements")} onClick={() => setTab("movements")}>{m.equip.tab_movements}</button>
        </div>
        {tab === "catalog" && (
          <>
            <input className="input-champ ml-auto max-w-xs text-sm" placeholder={m.common.search} value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length}</span>
          </>
        )}
      </div>

      {tab === "catalog" ? (
        <Table headers={[m.common.ref, m.equip.tab_catalog, m.common.unit, m.equip.col_stock, m.equip.col_threshold, m.common.status]}>
          {rows.map((e) => {
            const low = e.stock < e.threshold;
            const c = CONDITION[e.cond];
            return (
              <tr key={e.id} className={TR}>
                <td className={TD_MONO}>{e.id}</td>
                <td className={TD_STRONG}>
                  {e.desig}
                  <span className="ml-2 text-[10px] text-gray-400 dark:text-rdia-400">{e.cat}</span>
                </td>
                <td className={TD_MUTED}>{e.unit}</td>
                <td className={`${TD} font-mono text-xs tabular-nums ${low ? "font-bold text-danger-500" : "text-gray-600 dark:text-rdia-200"}`}>
                  {e.stock}
                  {low && <span className="ml-2"><Pill tone="red" label={m.equip.low_stock} /></span>}
                </td>
                <td className={TD_MONO}>{e.threshold}</td>
                <td className={TD}><Pill tone={c.tone} label={m.equip[c.key]} /></td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Table headers={[m.common.date, m.equip.col_type, m.equip.col_item, "Qté", m.equip.col_from, m.equip.col_to, m.common.author]}>
          {MOVEMENTS.map((mv) => (
            <tr key={mv.id} className={TR}>
              <td className={TD_MONO}>{mv.date}</td>
              <td className={TD}><Pill tone={MOVE[mv.type]} label={mv.type === "in" ? m.equip.mv_in : mv.type === "out" ? m.equip.mv_out : m.equip.mv_transfer} /></td>
              <td className={TD_STRONG}>{mv.item}</td>
              <td className={`${TD} font-mono text-xs tabular-nums text-gray-600 dark:text-rdia-200`}>{mv.qty}</td>
              <td className={TD_MUTED}>{mv.from}</td>
              <td className={TD_MUTED}>{mv.to}</td>
              <td className={TD_MUTED}>{mv.by}</td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
