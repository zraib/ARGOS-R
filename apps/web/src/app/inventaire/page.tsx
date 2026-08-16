"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
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
  const t = useDict();
  const [tab, setTab] = useState<"catalog" | "movements">("catalog");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return EQUIPMENT.filter((e) => !n || `${e.desig}${e.cat}${e.unit}${e.id}`.toLowerCase().includes(n));
  }, [q, EQUIPMENT]);

  const refs = EQUIPMENT.length;
  const okCount = EQUIPMENT.filter((e) => e.cond === "ok").length;
  const alerts = EQUIPMENT.filter((e) => e.stock < e.threshold).length;

  // `cible-tactile` : 44 px au doigt sous `lg`, densité d'origine au-dessus.
  const tabCls = (k: string) =>
    `cible-tactile rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
      tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.equip.kpi_refs} value={refs} icon={NAV_ICONS.res} tint="or" />
        <StatTile label={m.equip.kpi_ok} value={okCount} icon={KPI_ICONS.units} tint="green" />
        <StatTile label={m.equip.kpi_alerts} value={alerts} icon={KPI_ICONS.incidents} tint="danger" />
      </div>

      {/* Barre d'outils : les onglets restent sur une ligne, la recherche passe
          en dessous sur téléphone plutôt que d'écraser tout le reste. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex gap-2">
          <button className={tabCls("catalog")} onClick={() => setTab("catalog")}>{m.equip.tab_catalog}</button>
          <button className={tabCls("movements")} onClick={() => setTab("movements")}>{m.equip.tab_movements}</button>
        </div>
        {tab === "catalog" && (
          <div className="flex w-full min-w-0 items-center gap-2 sm:ms-auto sm:w-auto">
            {/* 16 px sur mobile : sous cette taille, iOS zoome à la mise au point. */}
            <input
              className="input-champ min-h-[44px] w-full min-w-0 text-base sm:max-w-xs md:min-h-0 md:text-sm"
              placeholder={m.common.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="shrink-0 font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length}</span>
          </div>
        )}
      </div>

      {tab === "catalog" ? (
        <>
          {/* Tableau : à partir de `md`, la densité redevient lisible. */}
          <div className="hidden md:block">
            <Table headers={[m.common.ref, m.equip.tab_catalog, m.common.unit, m.equip.col_stock, m.equip.col_threshold, m.common.status]}>
              {rows.map((e) => {
                const low = e.stock < e.threshold;
                const c = CONDITION[e.cond];
                return (
                  <tr key={e.id} className={TR}>
                    <td className={TD_MONO}>{e.id}</td>
                    <td className={TD_STRONG}>
                      {e.desig}
                      <span className="ms-2 text-[10px] text-gray-400 dark:text-rdia-400">{e.cat}</span>
                    </td>
                    <td className={TD_MUTED}>{e.unit}</td>
                    <td className={`${TD} font-mono text-xs tabular-nums ${low ? "font-bold text-danger-500" : "text-gray-600 dark:text-rdia-200"}`}>
                      {e.stock}
                      {low && <span className="ms-2"><Pill tone="red" label={m.equip.low_stock} /></span>}
                    </td>
                    <td className={TD_MONO}>{e.threshold}</td>
                    <td className={TD}><Pill tone={c.tone} label={m.equip[c.key]} /></td>
                  </tr>
                );
              })}
            </Table>
          </div>

          {/* Sous `md` : une carte par référence — mêmes colonnes, rien de perdu. */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((e) => {
              const low = e.stock < e.threshold;
              const c = CONDITION[e.cond];
              return (
                <div key={e.id} className="carte flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{e.desig}</div>
                      <div className="text-[11px] text-gray-400 dark:text-rdia-400">{e.cat}</div>
                    </div>
                    <span className="shrink-0"><Pill tone={c.tone} label={m.equip[c.key]} /></span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                    <Champ label={m.common.ref} value={e.id} mono />
                    <Champ label={m.common.unit} value={e.unit} />
                    <Champ
                      label={m.equip.col_stock}
                      value={String(e.stock)}
                      mono
                      danger={low}
                      apres={low ? <Pill tone="red" label={m.equip.low_stock} size="sm" /> : null}
                    />
                    <Champ label={m.equip.col_threshold} value={String(e.threshold)} mono />
                  </dl>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Tableau : à partir de `md`, la densité redevient lisible. */}
          <div className="hidden md:block">
            <Table headers={[m.common.date, m.equip.col_type, m.equip.col_item, t.h_qty, m.equip.col_from, m.equip.col_to, m.common.author]}>
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
          </div>

          {/* Sous `md` : une carte par mouvement. */}
          <div className="flex flex-col gap-2 md:hidden">
            {MOVEMENTS.map((mv) => (
              <div key={mv.id} className="carte flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{mv.item}</span>
                  <span className="shrink-0">
                    <Pill tone={MOVE[mv.type]} label={mv.type === "in" ? m.equip.mv_in : mv.type === "out" ? m.equip.mv_out : m.equip.mv_transfer} />
                  </span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                  <Champ label={m.common.date} value={mv.date} mono />
                  <Champ label={t.h_qty} value={String(mv.qty)} mono />
                  <Champ label={m.equip.col_from} value={mv.from} />
                  <Champ label={m.equip.col_to} value={mv.to} />
                  <Champ label={m.common.author} value={mv.by} />
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Couple libellé/valeur d'une carte mobile (équivalent d'une cellule du tableau). */
function Champ({
  label,
  value,
  mono,
  danger,
  apres,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
  apres?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className={`flex flex-wrap items-center gap-1.5 break-words ${mono ? "font-mono tabular-nums " : ""}${danger ? "font-bold text-danger-500" : "text-gray-700 dark:text-rdia-100"}`}>
        {value}
        {apres}
      </dd>
    </div>
  );
}
