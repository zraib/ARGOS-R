"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { personName, personStatusLabel, vehicleStateLabel, type OwnerResources } from "@/lib/resources";
import { corpsShort } from "@/lib/corps";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UI_ICONS } from "@/lib/icons";
import { dispoBadge } from "@/lib/helpers";
import { unitDetail } from "@/lib/derive";
import { AddUnitModal } from "@/components/org/AddEntityModals";
import { DeleteEntityButton } from "@/components/org/DeleteEntityModal";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";
const etatBadge = (maint: boolean) =>
  `rounded-md px-2 py-0.5 text-[10px] font-bold ${maint ? "bg-or-500/15 text-or-500" : "bg-green-500/10 text-green-600"}`;

export default function EquipesPage() {
  const t = useDict();
  const m = useModules();
  const units = useArgos((s) => s.units);
  const role = useArgos((s) => s.role);
  const selUnit = useArgos((s) => s.selUnit);
  const setSelUnit = useArgos((s) => s.setSelUnit);
  const dataProfile = useArgos((s) => s.dataProfile);
  const park = useArgos((s) => s.catalog.equipment);
  const [tab, setTab] = useState<"pers" | "equip" | "veh">("pers");
  const [adding, setAdding] = useState(false);
  // Les ressources RÉELLES de l'unité (ADR 0016) : personnes et véhicules
  // inscrits au registre ; en démonstration, le roster d'exemple les remplace
  // tant que rien n'est inscrit.
  const [resources, setResources] = useState<OwnerResources | null>(null);
  useEffect(() => {
    if (!selUnit) { setResources(null); return; }
    let live = true;
    api.getResources({ kind: "unit", id: selUnit }).then((res) => {
      if (live) setResources((res.data as unknown as OwnerResources | undefined) ?? null);
    }).catch(() => { if (live) setResources(null); });
    return () => { live = false; };
  }, [selUnit]);

  const canManage = role === "superadmin" || role === "admin";
  const unit = selUnit ? units.find((u) => u.id === selUnit) : null;

  // ---- vue liste ----
  if (!unit) {
    return (
      <section className="flex flex-col gap-4 animate-fade-in">
        {canManage && (
          <div className="flex justify-end">
            <button className="btn-primaire flex w-full items-center justify-center gap-1.5 text-sm sm:w-auto" onClick={() => setAdding(true)}>
              <Icon path={UI_ICONS.plus} size={15} />
              {t.add_unit}
            </button>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => {
            const b = dispoBadge(u.dispo, t);
            return (
              <div key={u.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{u.nom}</h3>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{u.ville}</div>
                  </div>
                  <span className="shrink-0"><Badge type={b.type} label={b.label} /></span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="shrink-0 text-gray-500 dark:text-rdia-300">{t.commander}</span>
                  <span className="min-w-0 break-words text-end font-semibold text-gray-800 dark:text-rdia-50">{u.cmdt}</span>
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
                <button className="btn-secondaire min-h-[44px] w-full text-xs lg:min-h-0" onClick={() => { setTab("pers"); setSelUnit(u.id); }}>{t.view}</button>
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
  const fake = unitDetail(unit, {
    demo: dataProfile === "demo",
    park,
    condLabels: { ok: m.equip.cond_ok, repair: m.equip.cond_repair, oos: m.equip.cond_oos },
  });
  const realPers = (resources?.persons ?? []).map((p) => ({
    grade: p.grade ?? corpsShort(p.corps === "civil" ? undefined : p.corps),
    nom: personName({ nom: p.nom, prenom: p.prenom }),
    fonction: p.fonction,
    stType: p.status === "present" ? ("active" as const) : p.status === "deployed" ? ("medium" as const) : ("on_hold" as const),
    stLabel: personStatusLabel(p.status, t),
  }));
  const realVehs = (resources?.vehicles ?? []).map((v) => ({
    type: v.qty > 1 ? `${v.type} × ${v.qty}` : v.type,
    plate: v.plate || "—",
    assign: v.assignment ?? unit.ville,
    etat: vehicleStateLabel(v.state, t),
    maint: v.state !== "ok",
  }));
  const pers = realPers.length > 0 ? realPers : fake.pers;
  const vehs = realVehs.length > 0 ? realVehs : fake.vehs;
  const equip = fake.equip;
  const tabs: [typeof tab, string][] = [["pers", t.personnel], ["equip", t.equipment], ["veh", t.vehicles]];
  const tabCls = (k: string) =>
    `min-h-[44px] shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 ${
      tab === k ? "bg-or-500 text-rdia-600" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <button aria-label={t.back} title={t.back} className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" onClick={() => setSelUnit(null)}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{unit.nom}</h2>
            <div className="break-words text-xs text-gray-500 dark:text-rdia-300">{unit.ville} · {unit.cmdt}</div>
          </div>
          <span className="shrink-0"><Badge type={b.type} label={b.label} /></span>
          <Link href={`/ressources?owner=unit:${unit.id}&tab=persons`} className="btn-secondaire cible-tactile text-xs">{t.rs_title}</Link>
          <DeleteEntityButton kind="unit" id={unit.id} name={unit.nom} compact onDeleted={() => setSelUnit(null)} />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.effectif}</div>
            <div className="text-xl font-bold tabular-nums text-rdia-600 dark:text-rdia-50">{unit.eff}</div>
          </div>
          {/* La jauge ne réclame plus 160 px : sous `sm` elle prend la ligne. */}
          <div className="min-w-0 flex-1 basis-full sm:min-w-[160px] sm:basis-auto">
            <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
              <span>{t.readiness}</span>
              <span className="font-mono">{unit.readiness} %</span>
            </div>
            <ProgressBar value={unit.readiness} height="h-2" />
          </div>
          {/* Bandeau défilable sous `sm` : trois onglets côte à côte débordent. */}
          <div className="-mx-4 flex w-[calc(100%_+_2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:overflow-x-visible sm:px-0 sm:pb-0">
            {tabs.map(([k, label]) => (
              <button key={k} className={tabCls(k)} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Tableaux : à partir de `md`, quatre colonnes redeviennent lisibles. */}
      <div className="carte hidden overflow-x-auto md:block">
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

      {/* Sous `md` : une carte par ligne — mêmes colonnes, aucune donnée perdue. */}
      <div className="flex flex-col gap-2 md:hidden">
        {tab === "pers" && pers.map((p, i) => (
          <div key={i} className="carte flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{p.nom}</span>
              <span className="shrink-0"><Badge type={p.stType} label={p.stLabel} /></span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <Champ label={t.h_grade} value={p.grade} />
              <Champ label={t.h_role} value={p.fonction} />
            </dl>
          </div>
        ))}
        {tab === "equip" && equip.map((e, i) => (
          <div key={i} className="carte flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{e.desig}</span>
              <span className={`shrink-0 ${etatBadge(e.maint)}`}>{e.etat}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <Champ label={t.h_cat} value={e.cat} />
              <Champ label={t.h_qty} value={e.qty} mono />
            </dl>
          </div>
        ))}
        {tab === "veh" && vehs.map((v, i) => (
          <div key={i} className="carte flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{v.type}</span>
              <span className={`shrink-0 ${etatBadge(v.maint)}`}>{v.etat}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <Champ label={t.h_plate} value={v.plate} mono />
              <Champ label={t.h_assign} value={v.assign} />
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Couple libellé/valeur d'une carte mobile (équivalent d'une cellule du tableau). */
function Champ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className={`break-words text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
