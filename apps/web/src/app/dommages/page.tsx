"use client";

import { useArgos, useModules } from "@/lib/store";
import { type Habitability } from "@/lib/data/modules";
import { StatTile } from "@/components/ui/StatTile";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";
import { ChartCard, type ChartDatum } from "@/components/charts/ChartCard";
import { NAV_ICONS, KPI_ICONS } from "@/lib/icons";

const GRADE_TONE: Record<number, Tone> = { 1: "green", 2: "blue", 3: "amber", 4: "red", 5: "red" };
const GRADE_KEY = ["g1", "g2", "g3", "g4", "g5"] as const;
const GRADE_COLOR = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#B91C1C"];
const HAB: Record<Habitability, { tone: Tone; key: "hab_ok" | "hab_restricted" | "hab_no" }> = {
  ok: { tone: "green", key: "hab_ok" },
  restricted: { tone: "amber", key: "hab_restricted" },
  no: { tone: "red", key: "hab_no" },
};

export default function DommagesPage() {
  const catalog = useArgos((s) => s.catalog);
  const DAMAGE = catalog.damage;
  const m = useModules();
  const total = DAMAGE.length;
  const uninhabitable = DAMAGE.filter((d) => d.habitability === "no").length;
  const zones = new Set(DAMAGE.map((d) => d.zone)).size;

  const byGrade: ChartDatum[] = [1, 2, 3, 4, 5].map((g) => ({
    label: m.damage[GRADE_KEY[g - 1]].split("·")[0].trim(),
    value: DAMAGE.filter((d) => d.grade === g).length,
    couleur: GRADE_COLOR[g - 1],
  }));

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatTile label={m.damage.kpi_assessments} value={total} icon={NAV_ICONS.damage} tint="or" />
        <StatTile label={m.damage.kpi_uninhabitable} value={uninhabitable} icon={KPI_ICONS.incidents} tint="danger" />
        <StatTile label={m.damage.kpi_zones} value={zones} icon={NAV_ICONS.map} tint="blue" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ChartCard titre={m.damage.by_grade} type="column3d" data={byGrade} />
        </div>
        <div className="lg:col-span-2">
          <Table headers={[m.common.ref, m.damage.col_building, m.common.zone, m.damage.col_grade, m.damage.col_habitability, m.damage.col_assessor]}>
            {DAMAGE.map((d) => {
              const h = HAB[d.habitability];
              return (
                <tr key={d.id} className={TR}>
                  <td className={TD_MONO}>{d.id}</td>
                  <td className={TD_STRONG}>{d.building}</td>
                  <td className={TD_MUTED}>{d.zone}</td>
                  <td className={TD}><Pill tone={GRADE_TONE[d.grade]} label={m.damage[GRADE_KEY[d.grade - 1]]} /></td>
                  <td className={TD}><Pill tone={h.tone} label={m.damage[h.key]} /></td>
                  <td className={TD_MUTED}>{d.assessor}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      </div>
    </section>
  );
}
