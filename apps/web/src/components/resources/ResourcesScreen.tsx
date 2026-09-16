"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill, type Tone } from "@/components/ui/Pill";
import { Modal } from "@/components/ui/Modal";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { useResponsibility } from "@/lib/responsibility";
import { corpsLabel } from "@/lib/corps";
import { ResourceForm, type EquipValues, type PersonValues, type SupplyValues, type TeamValues, type VehicleValues } from "@/components/resources/ResourceForm";
import {
  ownerParam, parseOwner, personName, personStatusLabel, supplyKindLabel, vehicleStateLabel,
  RESOURCE_KINDS, type OwnerResources, type Person, type ResourceKind, type ResourceOwner, type ResourceOwnerKind, type Supply, type Team, type Vehicle,
} from "@/lib/resources";
import type { EquipItem } from "@/lib/data/modules";

// ============================================================================
// Écran « Ressources » (ADR 0016) : les personnes, équipes, véhicules,
// logistique et équipements d'une entité — unité, hôpital ou abri.
//
// Un responsable arrive sur SON entité ; la conduite et les cellules
// choisissent l'entité. Ce que l'appelant peut y tenir est dit par l'API
// (`canManage`, selon le rôle, la portée et le mode de la station) : l'écran
// ne fait que masquer ce qui serait refusé.
// ============================================================================

type Row = Person | Team | Vehicle | Supply | EquipItem;

const STATUS_TONE: Record<Person["status"], Tone> = { present: "green", deployed: "amber", rest: "gray", absent: "red" };
const STATE_TONE: Record<Vehicle["state"], Tone> = { ok: "green", repair: "amber", oos: "red" };

export function ResourcesScreen({ fixedOwner }: { fixedOwner?: ResourceOwner }) {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const params = useSearchParams();
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const shelters = useArgos((s) => s.shelters);
  const showToast = useArgos((s) => s.showToast);
  const mine = useResponsibility();

  // L'entité : imposée (responsable), sinon lue dans l'URL, sinon la première unité.
  const own: ResourceOwner | null = useMemo(() => {
    if (fixedOwner) return fixedOwner;
    if (mine.kind && mine.entityId) return { kind: mine.kind === "equipment" ? "unit" : mine.kind === "morgue" ? "unit" : mine.kind, id: mine.entityId };
    return null;
  }, [fixedOwner, mine.kind, mine.entityId]);
  const locked = !!own && mine.kind !== null && mine.kind !== "morgue";
  const [owner, setOwner] = useState<ResourceOwner | null>(own ?? parseOwner(params.get("owner")) ?? (units[0] ? { kind: "unit", id: units[0].id } : null));
  useEffect(() => { if (own) setOwner(own); }, [own]);
  useEffect(() => { if (!owner && units[0]) setOwner({ kind: "unit", id: units[0].id }); }, [owner, units]);

  const [tab, setTab] = useState<ResourceKind>((params.get("tab") as ResourceKind | null) ?? "persons");
  const [data, setData] = useState<OwnerResources | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);

  const load = useCallback(async () => {
    if (!owner) return;
    const res = (await api.getResources(owner)) as { data?: unknown; error?: unknown };
    if (res.error) {
      setError((res.error as { message?: string }).message ?? m.resp.err_denied);
      setData(null);
      return;
    }
    setError(null);
    setData(res.data as OwnerResources);
  }, [owner, m.resp.err_denied]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!owner || locked) return;
    const q = new URLSearchParams(params.toString());
    q.set("owner", ownerParam(owner));
    q.set("tab", tab);
    router.replace(`?${q.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, tab, locked]);

  const rows: Row[] = data ? (data[tab] as Row[]) : [];
  const can = data?.canManage[tab] ?? false;
  const ownerLabel = data?.label ?? owner?.id ?? "";

  const fail = (res: { error?: unknown }): boolean => {
    if (!res.error) return false;
    const msg = (res.error as { message?: string | string[] }).message;
    showToast(Array.isArray(msg) ? msg.join(" · ") : (msg ?? m.resp.err_denied));
    return true;
  };
  const done = async (msg: string) => { showToast(msg); setAdding(false); setEditing(null); await load(); };

  const submitPerson = async (v: PersonValues) => {
    if (!owner) return;
    const body = { ...v, grade: v.grade || undefined, teamId: v.teamId || undefined, phone: v.phone || undefined, note: v.note || undefined };
    const res = editing ? await api.updatePerson(editing.id, { ...body, teamId: v.teamId ?? "" }) : await api.addPerson({ ...body, owner });
    if (!fail(res)) await done(t.rs_saved);
  };
  const submitTeam = async (v: TeamValues) => {
    if (!owner) return;
    const body = { ...v, mission: v.mission || undefined, leaderId: v.leaderId ?? "" };
    const res = editing ? await api.updateTeam(editing.id, body) : await api.addTeam({ ...body, leaderId: v.leaderId || undefined, owner });
    if (!fail(res)) await done(t.rs_saved);
  };
  const submitVehicle = async (v: VehicleValues) => {
    if (!owner) return;
    const body = { ...v, plate: v.plate ?? "", assignment: v.assignment || undefined, note: v.note || undefined };
    const res = editing ? await api.updateVehicle(editing.id, body) : await api.addVehicle({ ...body, owner });
    if (!fail(res)) await done(t.rs_saved);
  };
  const submitSupply = async (v: SupplyValues) => {
    if (!owner) return;
    const body = { ...v, note: v.note || undefined };
    const res = editing ? await api.updateSupply(editing.id, body) : await api.addSupply({ ...body, owner });
    if (!fail(res)) await done(t.rs_saved);
  };
  const submitEquip = async (v: EquipValues) => {
    if (!owner) return;
    const body = { ...v, type: v.type || undefined, serial: v.serial || undefined };
    const res = editing ? await api.updateOwnedEquip(editing.id, body) : await api.addOwnedEquip({ ...body, owner });
    if (!fail(res)) await done(t.rs_saved);
  };
  const remove = async () => {
    if (!removing) return;
    const id = removing.id;
    const res =
      tab === "persons" ? await api.removePerson(id)
      : tab === "teams" ? await api.removeTeam(id)
      : tab === "vehicles" ? await api.removeVehicle(id)
      : tab === "supplies" ? await api.removeSupply(id)
      : await api.removeOwnedEquip(id);
    setRemoving(null);
    if (!fail(res)) { showToast(t.rs_removed); await load(); }
  };

  const tabLabel: Record<ResourceKind, string> = { persons: t.rs_tab_persons, teams: t.rs_tab_teams, vehicles: t.rs_tab_vehicles, supplies: t.rs_tab_supplies, equipment: t.rs_tab_equipment };
  const addLabel: Record<ResourceKind, string> = { persons: t.rs_add_person, teams: t.rs_add_team, vehicles: t.rs_add_vehicle, supplies: t.rs_add_supply, equipment: t.rs_add_equip };
  const rowName = (r: Row): string =>
    "matricule" in r ? personName(r) : "memberIds" in r ? r.nom : "plate" in r ? `${r.type} ${r.plate}`.trim() : "unit" in r && "desig" in r ? r.desig : (r as Supply).label;
  const tabCls = (k: ResourceKind) =>
    `min-h-[44px] shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 ${tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"}`;
  const kinds: { kind: ResourceOwnerKind; label: string; items: { id: string; nom: string }[] }[] = [
    { kind: "unit", label: t.rs_owner_unit, items: units },
    { kind: "hospital", label: t.rs_owner_hospital, items: hospitals },
    { kind: "shelter", label: t.rs_owner_shelter, items: shelters },
  ];

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500"><Icon path={NAV_ICONS.resources} size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{t.rs_title}{ownerLabel ? ` — ${ownerLabel}` : ""}</h2>
            <p className="text-xs text-gray-500 dark:text-rdia-300">{t.rs_hint}</p>
          </div>
          {data && <Pill tone={data.mode === "operational" ? "green" : "amber"} label={data.mode === "demo" ? t.mode_demo : data.mode === "exercise" ? t.mode_exercise : t.mode_operational} />}
        </div>
        {!locked && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200">{t.rs_owner}</label>
              <select className="input-champ w-full text-base md:text-sm" value={owner?.kind ?? "unit"} onChange={(e) => { const kind = e.target.value as ResourceOwnerKind; const first = kinds.find((k) => k.kind === kind)?.items[0]; setOwner(first ? { kind, id: first.id } : null); }}>
                {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200">{t.rs_pick_owner}</label>
              <select className="input-champ w-full text-base md:text-sm" value={owner?.id ?? ""} onChange={(e) => owner && setOwner({ kind: owner.kind, id: e.target.value })}>
                {(kinds.find((k) => k.kind === owner?.kind)?.items ?? []).map((it) => <option key={it.id} value={it.id}>{it.nom}{"corps" in it && (it as { corps?: string }).corps ? ` · ${corpsLabel((it as { corps?: "far" }).corps, t)}` : ""}</option>)}
              </select>
            </div>
          </div>
        )}
        <div className="-mx-4 flex w-[calc(100%_+_2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
          {RESOURCE_KINDS.map((k) => (
            <button key={k} className={tabCls(k)} onClick={() => setTab(k)}>{tabLabel[k]} <span className="opacity-70">({data ? (data[k] as Row[]).length : "–"})</span></button>
          ))}
        </div>
      </div>

      {error && <p className="carte p-4 text-sm text-danger-500">{error}</p>}

      <div className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400 dark:text-rdia-400">{can ? "" : t.rs_readonly}</p>
          {can && (
            <button type="button" className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => setAdding(true)}>
              <Icon path={UI_ICONS.plus} size={13} /> {addLabel[tab]}
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400 dark:text-rdia-400">{t.rs_empty}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-rdia-700/50">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  {tab === "persons" && (() => { const p = r as Person; return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-rdia-50">
                        {personName(p)} <Pill tone={STATUS_TONE[p.status]} label={personStatusLabel(p.status, t)} size="sm" />
                      </div>
                      <div className="text-xs text-gray-500 dark:text-rdia-300">{p.matricule} · {p.fonction} · {corpsLabel(p.corps, t)}{p.teamId ? ` · ${data?.teams.find((x) => x.id === p.teamId)?.nom ?? p.teamId}` : ""}</div>
                    </>
                  ); })()}
                  {tab === "teams" && (() => { const tm = r as Team; return (
                    <>
                      <div className="text-sm font-semibold text-gray-800 dark:text-rdia-50">{tm.nom} <span className="text-xs font-normal text-gray-400 dark:text-rdia-400">· {tm.memberIds.length} {t.rs_members.toLowerCase()}</span></div>
                      <div className="text-xs text-gray-500 dark:text-rdia-300">{tm.mission ?? "—"}{tm.leaderId ? ` · ${t.rs_leader} : ${personName(data?.persons.find((p) => p.id === tm.leaderId) ?? { nom: tm.leaderId, prenom: "" })}` : ""}</div>
                    </>
                  ); })()}
                  {tab === "vehicles" && (() => { const v = r as Vehicle; return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-rdia-50">{v.type}{v.qty > 1 ? ` × ${v.qty}` : ""} <Pill tone={STATE_TONE[v.state]} label={vehicleStateLabel(v.state, t)} size="sm" /></div>
                      <div className="font-mono text-xs text-gray-500 dark:text-rdia-300">{v.plate || "—"}{v.assignment ? ` · ${v.assignment}` : ""}</div>
                    </>
                  ); })()}
                  {tab === "supplies" && (() => { const s = r as Supply; const low = s.threshold !== undefined && s.qty < s.threshold; return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-rdia-50">{s.label} <Pill tone={low ? "red" : "gray"} label={supplyKindLabel(s.kind, t)} size="sm" /></div>
                      <div className="text-xs text-gray-500 dark:text-rdia-300"><span className="font-mono tabular-nums">{s.qty} {s.unit}</span>{s.threshold !== undefined ? ` · ${t.rs_threshold} ${s.threshold}` : ""}</div>
                    </>
                  ); })()}
                  {tab === "equipment" && (() => { const e = r as EquipItem; return (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-800 dark:text-rdia-50">{e.desig} <Pill tone={STATE_TONE[e.cond]} label={{ ok: m.equip.cond_ok, repair: m.equip.cond_repair, oos: m.equip.cond_oos }[e.cond]} size="sm" /></div>
                      <div className="text-xs text-gray-500 dark:text-rdia-300">{e.cat}{e.type ? ` · ${e.type}` : ""}{e.serial ? ` · ${e.serial}` : ""} · <span className="font-mono tabular-nums">{e.stock}</span>{e.stock < e.threshold ? ` (${m.equip.low_stock})` : ""}</div>
                    </>
                  ); })()}
                </div>
                {can && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(r)} title={t.rs_edit} aria-label={`${t.rs_edit} — ${rowName(r)}`} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"><Icon path={UI_ICONS.edit} size={15} /></button>
                    <button type="button" onClick={() => setRemoving(r)} title={t.act_delete} aria-label={`${t.act_delete} — ${rowName(r)}`} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-danger-500/10 hover:text-danger-500 dark:hover:bg-rdia-600"><Icon path={UI_ICONS.trash} size={15} /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(adding || editing) && data && tab === "persons" && <ResourceForm kind="persons" initial={editing as Person | undefined} teams={data.teams} onSubmit={submitPerson} onClose={() => { setAdding(false); setEditing(null); }} />}
      {(adding || editing) && data && tab === "teams" && <ResourceForm kind="teams" initial={editing as Team | undefined} persons={data.persons} onSubmit={submitTeam} onClose={() => { setAdding(false); setEditing(null); }} />}
      {(adding || editing) && data && tab === "vehicles" && <ResourceForm kind="vehicles" initial={editing as Vehicle | undefined} onSubmit={submitVehicle} onClose={() => { setAdding(false); setEditing(null); }} />}
      {(adding || editing) && data && tab === "supplies" && <ResourceForm kind="supplies" initial={editing as Supply | undefined} onSubmit={submitSupply} onClose={() => { setAdding(false); setEditing(null); }} />}
      {(adding || editing) && data && tab === "equipment" && <ResourceForm kind="equipment" initial={editing as EquipItem | undefined} onSubmit={submitEquip} onClose={() => { setAdding(false); setEditing(null); }} />}

      {removing && (
        <Modal open title={t.act_delete} onClose={() => setRemoving(null)} size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-rdia-100">{t.rs_remove_confirm.replace("{name}", rowName(removing))}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondaire cible-tactile text-sm" onClick={() => setRemoving(null)}>{t.cancel}</button>
              <button type="button" className="cible-tactile rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white hover:bg-danger-500" onClick={() => void remove()}>{t.act_delete}</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
