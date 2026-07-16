"use client";

import { useArgos, useModules } from "@/lib/store";
import { type WoPriority, type WoStatus } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { Pill, type Tone } from "@/components/ui/Pill";
import { KPI_ICONS, NAV_ICONS } from "@/lib/icons";

const PRIORITY: Record<WoPriority, { tone: Tone; key: "pr_low" | "pr_medium" | "pr_high" | "pr_urgent" }> = {
  urgent: { tone: "red", key: "pr_urgent" },
  high: { tone: "amber", key: "pr_high" },
  medium: { tone: "gold", key: "pr_medium" },
  low: { tone: "gray", key: "pr_low" },
};

const COLUMNS: { key: WoStatus; labelKey: "st_requested" | "st_approved" | "st_assigned" | "st_inprogress" | "st_done" | "st_verified"; dot: string }[] = [
  { key: "requested", labelKey: "st_requested", dot: "#9CA3AF" },
  { key: "approved", labelKey: "st_approved", dot: "#3B82F6" },
  { key: "assigned", labelKey: "st_assigned", dot: "#8B5CF6" },
  { key: "inprogress", labelKey: "st_inprogress", dot: "#C9A84C" },
  { key: "done", labelKey: "st_done", dot: "#10B981" },
  { key: "verified", labelKey: "st_verified", dot: "#059669" },
];

export default function WorkOrdersPage() {
  const catalog = useArgos((s) => s.catalog);
  const WORK_ORDERS = catalog.workOrders;
  const m = useModules();
  const open = WORK_ORDERS.filter((w) => w.status !== "verified" && w.status !== "done").length;
  const progress = WORK_ORDERS.filter((w) => w.status === "inprogress").length;
  const overdue = WORK_ORDERS.filter((w) => w.priority === "urgent" && w.status !== "verified").length;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.workorders.kpi_open} value={open} icon={NAV_ICONS.plans} tint="or" />
        <StatTile label={m.workorders.kpi_progress} value={progress} icon={KPI_ICONS.units} tint="blue" />
        <StatTile label={m.workorders.kpi_overdue} value={overdue} icon={KPI_ICONS.incidents} tint="danger" />
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4" style={{ minWidth: 1100 }}>
          {COLUMNS.map((col) => {
            const items = WORK_ORDERS.filter((w) => w.status === col.key);
            return (
              <div key={col.key} className="flex w-[220px] shrink-0 flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.dot }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-200">{m.workorders[col.labelKey]}</span>
                  <span className="ml-auto font-mono text-[10px] text-gray-400 dark:text-rdia-400">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((w) => {
                    const p = PRIORITY[w.priority];
                    return (
                      <div key={w.id} className="carte flex flex-col gap-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{w.id}</span>
                          <Pill tone={p.tone} label={m.workorders[p.key]} />
                        </div>
                        <div className="text-xs font-semibold leading-snug text-gray-800 dark:text-rdia-50">{w.subject}</div>
                        <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-rdia-300">
                          <span>{w.unit}</span>
                          <span className="font-mono">{w.sla}</span>
                        </div>
                        <div className="truncate text-[10px] text-gray-400 dark:text-rdia-400">{w.assignee}</div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[10px] text-gray-300 dark:border-rdia-700 dark:text-rdia-400">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
