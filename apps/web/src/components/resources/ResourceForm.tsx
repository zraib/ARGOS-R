"use client";

import { useState } from "react";
import { useDict, useModules } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { corpsHasGrade, corpsLabel } from "@/lib/corps";
import {
  PERSON_CORPS, PERSON_STATUS, SUPPLY_KINDS, VEHICLE_STATES,
  personName, personStatusLabel, supplyKindLabel, vehicleStateLabel,
  type Person, type PersonCorps, type PersonStatus, type ResourceKind, type Supply, type SupplyKind, type Team, type Vehicle, type VehicleState,
} from "@/lib/resources";
import type { EquipItem } from "@/lib/data/modules";

// ============================================================================
// Le formulaire d'une ressource (ADR 0016) — une modale, cinq natures.
//
// Les champs suivent la doctrine : une personne d'un corps en uniforme porte
// un grade, le personnel civil une fonction ; une équipe se constitue des
// personnes de la même entité ; un véhicule s'inscrit un par un ou en flotte
// comptée ; la logistique se compte dans son unité (litres, rations, places,
// tentes). L'appelant reçoit les valeurs typées et parle à l'API.
// ============================================================================

const inputCls = "input-champ w-full text-base md:text-sm";
const labelCls = "mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200";

export type PersonValues = { corps: PersonCorps; grade?: string; nom: string; prenom: string; matricule: string; fonction: string; teamId?: string; status: PersonStatus; phone?: string; note?: string };
export type TeamValues = { nom: string; mission?: string; leaderId?: string; memberIds: string[] };
export type VehicleValues = { type: string; plate?: string; qty: number; state: VehicleState; assignment?: string; note?: string };
export type SupplyValues = { kind: SupplyKind; label: string; qty: number; unit: string; threshold?: number; note?: string };
export type EquipValues = { desig: string; cat: string; type?: string; serial?: string; teamId?: string; stock: number; threshold: number; cond: EquipItem["cond"] };

type Props =
  | { kind: "persons"; initial?: Person; teams: Team[]; onSubmit: (v: PersonValues) => Promise<void>; onClose: () => void }
  | { kind: "teams"; initial?: Team; persons: Person[]; onSubmit: (v: TeamValues) => Promise<void>; onClose: () => void }
  | { kind: "vehicles"; initial?: Vehicle; onSubmit: (v: VehicleValues) => Promise<void>; onClose: () => void }
  | { kind: "supplies"; initial?: Supply; onSubmit: (v: SupplyValues) => Promise<void>; onClose: () => void }
  | { kind: "equipment"; initial?: EquipItem; teams: Team[]; onSubmit: (v: EquipValues) => Promise<void>; onClose: () => void };

const SUPPLY_UNITS: Record<SupplyKind, string> = { fuel: "L", food: "rations", bedding: "places", camp: "tentes", other: "u." };

export function ResourceForm(props: Props) {
  const t = useDict();
  const m = useModules();
  const [busy, setBusy] = useState(false);
  const titles: Record<ResourceKind, string> = { persons: t.rs_add_person, teams: t.rs_add_team, vehicles: t.rs_add_vehicle, supplies: t.rs_add_supply, equipment: t.rs_add_equip };
  const title = props.initial ? `${t.rs_edit} — ${titles[props.kind]}` : titles[props.kind];

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={title} onClose={busy ? () => {} : props.onClose} size="md">
      {props.kind === "persons" && <PersonFields {...props} busy={busy} run={run} inputCls={inputCls} labelCls={labelCls} />}
      {props.kind === "teams" && <TeamFields {...props} busy={busy} run={run} inputCls={inputCls} labelCls={labelCls} />}
      {props.kind === "vehicles" && <VehicleFields {...props} busy={busy} run={run} inputCls={inputCls} labelCls={labelCls} />}
      {props.kind === "supplies" && <SupplyFields {...props} busy={busy} run={run} inputCls={inputCls} labelCls={labelCls} />}
      {props.kind === "equipment" && <EquipFields {...props} busy={busy} run={run} inputCls={inputCls} labelCls={labelCls} condLabels={{ ok: m.equip.cond_ok, repair: m.equip.cond_repair, oos: m.equip.cond_oos }} />}
    </Modal>
  );
}

type Common = { busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; inputCls: string; labelCls: string; onClose: () => void };

function Actions({ busy, canSubmit, onClose, onSubmit }: { busy: boolean; canSubmit: boolean; onClose: () => void; onSubmit: () => void }) {
  const t = useDict();
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button type="button" className="btn-secondaire cible-tactile text-sm" onClick={onClose} disabled={busy}>{t.cancel}</button>
      <button type="button" className="btn-primaire cible-tactile text-sm" onClick={onSubmit} disabled={!canSubmit || busy}>{busy ? "…" : t.rs_save}</button>
    </div>
  );
}

function PersonFields({ initial, teams, onSubmit, busy, run, inputCls, labelCls, onClose }: Extract<Props, { kind: "persons" }> & Common) {
  const t = useDict();
  const [v, setV] = useState<PersonValues>({
    corps: initial?.corps ?? "far", grade: initial?.grade ?? "", nom: initial?.nom ?? "", prenom: initial?.prenom ?? "", matricule: initial?.matricule ?? "",
    fonction: initial?.fonction ?? "", teamId: initial?.teamId ?? "", status: initial?.status ?? "present", phone: initial?.phone ?? "", note: initial?.note ?? "",
  });
  const set = <K extends keyof PersonValues>(k: K, val: PersonValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const canSubmit = !!(v.nom.trim() && v.prenom.trim() && v.matricule.trim() && v.fonction.trim());
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t.f_corps}</label>
          <select className={inputCls} value={v.corps} onChange={(e) => set("corps", e.target.value as PersonCorps)}>
            {PERSON_CORPS.map((c) => <option key={c} value={c}>{corpsLabel(c, t)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t.rs_grade}{corpsHasGrade(v.corps) ? "" : ` (${t.si_optional})`}</label>
          <input className={inputCls} value={v.grade} onChange={(e) => set("grade", e.target.value)} maxLength={60} />
        </div>
        <div><label className={labelCls}>{t.rs_nom}</label><input className={inputCls} value={v.nom} onChange={(e) => set("nom", e.target.value)} maxLength={80} /></div>
        <div><label className={labelCls}>{t.rs_prenom}</label><input className={inputCls} value={v.prenom} onChange={(e) => set("prenom", e.target.value)} maxLength={80} /></div>
        <div><label className={labelCls}>{t.rs_matricule}</label><input className={inputCls} value={v.matricule} onChange={(e) => set("matricule", e.target.value)} maxLength={40} autoCapitalize="off" /></div>
        <div><label className={labelCls}>{t.rs_fonction}</label><input className={inputCls} value={v.fonction} onChange={(e) => set("fonction", e.target.value)} maxLength={120} /></div>
        <div>
          <label className={labelCls}>{t.rs_team}</label>
          <select className={inputCls} value={v.teamId ?? ""} onChange={(e) => set("teamId", e.target.value)}>
            <option value="">{t.rs_no_team}</option>
            {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.nom}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t.rs_status}</label>
          <select className={inputCls} value={v.status} onChange={(e) => set("status", e.target.value as PersonStatus)}>
            {PERSON_STATUS.map((s) => <option key={s} value={s}>{personStatusLabel(s, t)}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>{t.rs_phone}</label><input className={inputCls} value={v.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} type="tel" /></div>
      </div>
      <div><label className={labelCls}>{t.rs_note}</label><input className={inputCls} value={v.note} onChange={(e) => set("note", e.target.value)} maxLength={300} /></div>
      <Actions busy={busy} canSubmit={canSubmit} onClose={onClose} onSubmit={() => void run(() => onSubmit(v))} />
    </div>
  );
}

function TeamFields({ initial, persons, onSubmit, busy, run, inputCls, labelCls, onClose }: Extract<Props, { kind: "teams" }> & Common) {
  const t = useDict();
  const [v, setV] = useState<TeamValues>({ nom: initial?.nom ?? "", mission: initial?.mission ?? "", leaderId: initial?.leaderId ?? "", memberIds: initial?.memberIds ?? [] });
  const toggle = (id: string) => setV((s) => ({ ...s, memberIds: s.memberIds.includes(id) ? s.memberIds.filter((x) => x !== id) : [...s.memberIds, id] }));
  return (
    <div className="flex flex-col gap-3">
      <div><label className={labelCls}>{t.rs_team_name}</label><input className={inputCls} value={v.nom} onChange={(e) => setV((s) => ({ ...s, nom: e.target.value }))} maxLength={80} /></div>
      <div><label className={labelCls}>{t.rs_mission}</label><input className={inputCls} value={v.mission} onChange={(e) => setV((s) => ({ ...s, mission: e.target.value }))} maxLength={200} /></div>
      <div>
        <label className={labelCls}>{t.rs_leader}</label>
        <select className={inputCls} value={v.leaderId ?? ""} onChange={(e) => setV((s) => ({ ...s, leaderId: e.target.value }))}>
          <option value="">—</option>
          {persons.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t.rs_members} ({v.memberIds.length})</label>
        <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-rdia-600">
          {persons.length === 0 && <p className="px-1 text-xs text-gray-400 dark:text-rdia-400">{t.rs_empty}</p>}
          {persons.map((p) => (
            <label key={p.id} className="flex min-h-9 cursor-pointer items-center gap-2 px-1 text-sm text-gray-700 dark:text-rdia-100">
              <input type="checkbox" checked={v.memberIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="truncate">{personName(p)} <span className="text-xs text-gray-400 dark:text-rdia-400">· {p.fonction}</span></span>
            </label>
          ))}
        </div>
      </div>
      <Actions busy={busy} canSubmit={!!v.nom.trim()} onClose={onClose} onSubmit={() => void run(() => onSubmit(v))} />
    </div>
  );
}

function VehicleFields({ initial, onSubmit, busy, run, inputCls, labelCls, onClose }: Extract<Props, { kind: "vehicles" }> & Common) {
  const t = useDict();
  const [v, setV] = useState<VehicleValues>({ type: initial?.type ?? "", plate: initial?.plate ?? "", qty: initial?.qty ?? 1, state: initial?.state ?? "ok", assignment: initial?.assignment ?? "", note: initial?.note ?? "" });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>{t.rs_vehicle_type}</label><input className={inputCls} value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))} maxLength={80} placeholder="Ambulance, VLTT, camion-citerne…" /></div>
        <div><label className={labelCls}>{t.rs_plate}</label><input className={inputCls} value={v.plate} onChange={(e) => setV((s) => ({ ...s, plate: e.target.value }))} maxLength={40} autoCapitalize="characters" /></div>
        <div><label className={labelCls}>{t.rs_qty}</label><input type="number" min={1} className={inputCls} value={v.qty} onChange={(e) => setV((s) => ({ ...s, qty: Math.max(1, Number(e.target.value) || 1) }))} /></div>
        <div>
          <label className={labelCls}>{t.rs_state}</label>
          <select className={inputCls} value={v.state} onChange={(e) => setV((s) => ({ ...s, state: e.target.value as VehicleState }))}>
            {VEHICLE_STATES.map((st) => <option key={st} value={st}>{vehicleStateLabel(st, t)}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>{t.rs_assignment}</label><input className={inputCls} value={v.assignment} onChange={(e) => setV((s) => ({ ...s, assignment: e.target.value }))} maxLength={120} /></div>
        <div><label className={labelCls}>{t.rs_note}</label><input className={inputCls} value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} maxLength={300} /></div>
      </div>
      <Actions busy={busy} canSubmit={!!v.type.trim()} onClose={onClose} onSubmit={() => void run(() => onSubmit(v))} />
    </div>
  );
}

function SupplyFields({ initial, onSubmit, busy, run, inputCls, labelCls, onClose }: Extract<Props, { kind: "supplies" }> & Common) {
  const t = useDict();
  const [v, setV] = useState<SupplyValues>({ kind: initial?.kind ?? "fuel", label: initial?.label ?? "", qty: initial?.qty ?? 0, unit: initial?.unit ?? SUPPLY_UNITS.fuel, threshold: initial?.threshold, note: initial?.note ?? "" });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>{t.rs_supply_kind}</label>
          <select className={inputCls} value={v.kind} onChange={(e) => { const kind = e.target.value as SupplyKind; setV((s) => ({ ...s, kind, unit: initial ? s.unit : SUPPLY_UNITS[kind] })); }}>
            {SUPPLY_KINDS.map((k) => <option key={k} value={k}>{supplyKindLabel(k, t)}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>{t.rs_label}</label><input className={inputCls} value={v.label} onChange={(e) => setV((s) => ({ ...s, label: e.target.value }))} maxLength={80} /></div>
        <div><label className={labelCls}>{t.rs_qty}</label><input type="number" min={0} className={inputCls} value={v.qty} onChange={(e) => setV((s) => ({ ...s, qty: Math.max(0, Number(e.target.value) || 0) }))} /></div>
        <div><label className={labelCls}>{t.rs_unit_of}</label><input className={inputCls} value={v.unit} onChange={(e) => setV((s) => ({ ...s, unit: e.target.value }))} maxLength={20} /></div>
        <div><label className={labelCls}>{t.rs_threshold}</label><input type="number" min={0} className={inputCls} value={v.threshold ?? ""} onChange={(e) => setV((s) => ({ ...s, threshold: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) }))} /></div>
        <div><label className={labelCls}>{t.rs_note}</label><input className={inputCls} value={v.note} onChange={(e) => setV((s) => ({ ...s, note: e.target.value }))} maxLength={300} /></div>
      </div>
      <Actions busy={busy} canSubmit={!!(v.label.trim() && v.unit.trim())} onClose={onClose} onSubmit={() => void run(() => onSubmit(v))} />
    </div>
  );
}

function EquipFields({ initial, teams, onSubmit, busy, run, inputCls, labelCls, onClose, condLabels }: Extract<Props, { kind: "equipment" }> & Common & { condLabels: Record<EquipItem["cond"], string> }) {
  const t = useDict();
  const [v, setV] = useState<EquipValues>({ desig: initial?.desig ?? "", cat: initial?.cat ?? "", type: initial?.type ?? "", serial: initial?.serial ?? "", teamId: initial?.teamId ?? "", stock: initial?.stock ?? 1, threshold: initial?.threshold ?? 0, cond: initial?.cond ?? "ok" });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label className={labelCls}>{t.h_desig}</label><input className={inputCls} value={v.desig} onChange={(e) => setV((s) => ({ ...s, desig: e.target.value }))} maxLength={120} /></div>
        <div><label className={labelCls}>{t.h_cat}</label><input className={inputCls} value={v.cat} onChange={(e) => setV((s) => ({ ...s, cat: e.target.value }))} maxLength={60} /></div>
        <div><label className={labelCls}>{t.rs_equip_type}</label><input className={inputCls} value={v.type} onChange={(e) => setV((s) => ({ ...s, type: e.target.value }))} maxLength={80} /></div>
        <div><label className={labelCls}>{t.rs_equip_serial}</label><input className={inputCls} value={v.serial} onChange={(e) => setV((s) => ({ ...s, serial: e.target.value }))} maxLength={60} /></div>
        {/* L'équipe du détenteur à laquelle l'article est affecté (ADR 0027) — la même liste que pour une personne. */}
        <div>
          <label className={labelCls}>{t.rs_team}</label>
          <select className={inputCls} value={v.teamId ?? ""} onChange={(e) => setV((s) => ({ ...s, teamId: e.target.value }))}>
            <option value="">{t.rs_no_team}</option>
            {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.nom}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>{t.h_qty}</label><input type="number" min={0} className={inputCls} value={v.stock} onChange={(e) => setV((s) => ({ ...s, stock: Math.max(0, Number(e.target.value) || 0) }))} /></div>
        <div><label className={labelCls}>{t.rs_threshold}</label><input type="number" min={0} className={inputCls} value={v.threshold} onChange={(e) => setV((s) => ({ ...s, threshold: Math.max(0, Number(e.target.value) || 0) }))} /></div>
        <div>
          <label className={labelCls}>{t.h_state}</label>
          <select className={inputCls} value={v.cond} onChange={(e) => setV((s) => ({ ...s, cond: e.target.value as EquipItem["cond"] }))}>
            {(["ok", "repair", "oos"] as const).map((c) => <option key={c} value={c}>{condLabels[c]}</option>)}
          </select>
        </div>
      </div>
      <Actions busy={busy} canSubmit={!!(v.desig.trim() && v.cat.trim())} onClose={onClose} onSubmit={() => void run(() => onSubmit(v))} />
    </div>
  );
}
