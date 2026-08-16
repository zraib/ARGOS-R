"use client";

// Vue « Ma responsabilité » pour le PARC D'ÉQUIPEMENT.
// Pas de tableau de bord dédié (non demandé) : les deux routes affichent la
// gestion, précédée d'un bandeau d'alerte sur les articles sous seuil.
// Écriture via /equipment-parks/:unitId/items, cantonnée (@RequireScope("equipment")).

import { useCallback, useEffect, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { StatTile } from "@/components/ui/StatTile";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill, type Tone } from "@/components/ui/Pill";
import { KPI_ICONS, NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { Loading, RespHeader } from "@/components/responsibility/Shared";

export interface EquipItem {
  id: string; desig: string; cat: string; unit: string; unitId: string;
  stock: number; threshold: number; cond: "ok" | "repair" | "oos";
}

export const EQUIP_CONDITIONS = ["ok", "repair", "oos"] as const;

const COND_TONES: Record<EquipItem["cond"], Tone> = { ok: "green", repair: "amber", oos: "red" };

export function EquipmentPark({ unitId }: { unitId: string }) {
  const m = useModules();
  const units = useArgos((s) => s.units);
  const showToast = useArgos((s) => s.showToast);
  const [items, setItems] = useState<EquipItem[] | null>(null);
  const [editing, setEditing] = useState<EquipItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDel, setConfirmDel] = useState<EquipItem | null>(null);

  const load = useCallback(async () => {
    const res = await api.getParkItems(unitId);
    setItems((res.data ?? []) as unknown as EquipItem[]);
  }, [unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!items) return <Loading />;

  const unit = units.find((u) => u.id === unitId);
  const belowThreshold = items.filter((i) => i.stock < i.threshold);
  const outOfService = items.filter((i) => i.cond === "oos");

  const remove = async (it: EquipItem) => {
    const res = await api.removeParkItem(unitId, it.id);
    if (res.error) { showToast(m.resp.err_denied); return; }
    showToast(m.resp.e_removed);
    setConfirmDel(null);
    void load();
  };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader icon={NAV_ICONS.res} title={m.resp.e_park} subtitle={unit ? `${unit.nom} — ${unit.ville}` : unitId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={m.resp.e_articles} value={items.length} icon={NAV_ICONS.res} tint="rdia" />
        <StatTile label={m.resp.e_below} value={belowThreshold.length} icon={KPI_ICONS.incidents} tint={belowThreshold.length > 0 ? "danger" : "green"} />
        <StatTile label={m.resp.e_oos} value={outOfService.length} icon={UI_ICONS.shield} tint={outOfService.length > 0 ? "amber" : "green"} />
      </div>

      <div className="carte flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.e_inventory}</h3>
          <button className="cible-tactile btn-primaire flex shrink-0 items-center gap-1.5 text-xs" onClick={() => setAdding(true)}>
            <Icon path={UI_ICONS.plus} size={14} />
            {m.resp.e_add}
          </button>
        </div>

        {items.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">
            {m.resp.e_empty}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const low = it.stock < it.threshold;
            return (
              // Les largeurs figées (200 px / 110 px) débordaient sous 375 px :
              // remplacées par des bases souples qui se replient.
              <div key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{it.id}</span>
                    <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-50">{it.desig}</span>
                    <Pill tone={COND_TONES[it.cond]} label={m.resp.equip_cond[it.cond]} />
                    {low && <Pill tone="red" label={m.resp.e_low} />}
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400">{it.cat}</div>
                </div>
                <div className="shrink-0 text-end">
                  <div className={`font-mono text-sm font-semibold ${low ? "text-danger-500" : "text-gray-700 dark:text-rdia-100"}`}>{it.stock}</div>
                  <div className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{m.resp.e_threshold} {it.threshold}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconBtn icon={UI_ICONS.edit} title={m.resp.edit} onClick={() => setEditing(it)} />
                  <IconBtn icon={UI_ICONS.trash} title={m.resp.delete} danger onClick={() => setConfirmDel(it)} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(adding || editing) && (
        <ItemForm
          unitId={unitId}
          item={editing ?? undefined}
          onClose={() => { setAdding(false); setEditing(null); }}
          onDone={() => { setAdding(false); setEditing(null); void load(); }}
        />
      )}

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title={m.resp.e_remove_title}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600 dark:text-rdia-200">
            {m.resp.e_remove_text} <strong>{confirmDel?.desig}</strong> ?
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="cible-tactile btn-secondaire text-sm" onClick={() => setConfirmDel(null)}>{m.resp.cancel}</button>
            <button
              className="cible-tactile rounded-lg bg-danger-500 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              onClick={() => confirmDel && void remove(confirmDel)}
            >
              {m.resp.delete}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function ItemForm({ unitId, item, onClose, onDone }: { unitId: string; item?: EquipItem; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const editing = !!item;
  const [desig, setDesig] = useState(item?.desig ?? "");
  const [cat, setCat] = useState(item?.cat ?? "");
  const [stock, setStock] = useState(item?.stock ?? 0);
  const [threshold, setThreshold] = useState(item?.threshold ?? 0);
  const [cond, setCond] = useState<EquipItem["cond"]>(item?.cond ?? "ok");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!desig.trim() || !cat.trim()) { setError(m.resp.e_err_fields); return; }
    setBusy(true);
    try {
      const body = { desig: desig.trim(), cat: cat.trim(), stock, threshold, cond };
      const res = editing && item
        ? await api.updateParkItem(unitId, item.id, body)
        : await api.addParkItem(unitId, body);
      if (res.error) { showToast(m.resp.err_denied); return; }
      showToast(editing ? m.resp.e_saved : m.resp.e_added);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  return (
    <Modal open onClose={onClose} title={editing ? m.resp.e_edit : m.resp.e_add}>
      <div className="flex flex-col gap-4">
        {/* Champs à 16 px sur mobile (pas de zoom iOS au focus) et ≥ 44 px de haut. */}
        <div>
          <label className={labelCls}>{m.resp.e_desig}</label>
          <input className="input-champ text-base md:text-sm" placeholder={m.resp.e_desig_ph} value={desig} onChange={(e) => { setDesig(e.target.value); setError(null); }} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.resp.e_category}</label>
            <input className="input-champ text-base md:text-sm" placeholder={m.resp.e_category_ph} value={cat} onChange={(e) => { setCat(e.target.value); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.e_condition}</label>
            <select className="input-champ text-base md:text-sm" value={cond} onChange={(e) => setCond(e.target.value as EquipItem["cond"])}>
              {EQUIP_CONDITIONS.map((c) => <option key={c} value={c}>{m.resp.equip_cond[c]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.e_stock}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={stock} onChange={(e) => setStock(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.e_threshold_field}</label>
            <input className="input-champ font-mono text-base md:text-sm" type="number" min={0} value={threshold} onChange={(e) => setThreshold(Math.max(0, parseInt(e.target.value, 10) || 0))} />
          </div>
        </div>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="cible-tactile btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="cible-tactile btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.resp.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function IconBtn({ icon, title, onClick, danger = false }: { icon: string; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`cible-tactile flex items-center justify-center rounded-lg p-1.5 transition-colors ${
        danger ? "text-gray-400 hover:bg-danger-500/10 hover:text-danger-500" : "text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
      }`}
    >
      <Icon path={icon} size={14} />
    </button>
  );
}
