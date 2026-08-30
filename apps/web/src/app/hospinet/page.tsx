"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { UI_ICONS } from "@/lib/icons";
import { occBarClass } from "@/lib/helpers";
import { hospitalDetail } from "@/lib/derive";
import { AddHospitalModal } from "@/components/org/AddEntityModals";
import { Modal } from "@/components/ui/Modal";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { HospinetIAPanel } from "@/components/health/HospinetIAPanel";
import { HospinetAffecteurIA } from "@/components/health/HospinetAffecteurIA";
import { HOSPITAL_KINDS, hospKind, kindDef } from "@/lib/hospitals";
import type { HospitalKind } from "@/lib/types";

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
  const [affecteurOpen, setAffecteurOpen] = useState(false);
  // Filtres de la vue liste : le référentiel compte plus de cent
  // établissements — catégorie et recherche libre les rendent exploitables.
  const [kindFilter, setKindFilter] = useState<HospitalKind | "all">("all");
  const [query, setQuery] = useState("");

  const canManage = role === "superadmin" || role === "admin";
  const hosp = selHosp ? hospitals.find((h) => h.id === selHosp) : null;

  // Nombre d'établissements par catégorie (puces de filtre).
  const counts = useMemo(() => {
    const c: Partial<Record<HospitalKind, number>> = {};
    for (const h of hospitals) {
      const k = hospKind(h);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [hospitals]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hospitals.filter((h) => {
      if (kindFilter !== "all" && hospKind(h) !== kindFilter) return false;
      if (!q) return true;
      return [h.nom, h.ville, h.region, h.province, h.type].some((v) => v?.toLowerCase().includes(q));
    });
  }, [hospitals, kindFilter, query]);

  // ---- vue liste ----
  if (!hosp) {
    const chip = (active: boolean) =>
      `flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 ${
        active
          ? "border-or-500 bg-or-500/15 text-or-600 dark:text-or-400"
          : "border-gray-200 bg-white text-gray-600 hover:border-or-400 dark:border-rdia-600 dark:bg-rdia-700 dark:text-rdia-200"
      }`;

    return (
      <section className="flex flex-col gap-4 animate-fade-in">
        {/* Synthèse IA · panneau d'information globale */}
        <HospinetIAPanel />

        <div className="carte flex flex-col gap-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Le `min-w-[240px]` d'origine bloquait le rétrécissement : sous
                `sm` le champ prend toute la ligne, le reste passe dessous. */}
            <input
              className="input-champ basis-full text-base sm:min-w-[240px] sm:flex-1 sm:basis-auto md:text-sm"
              placeholder={t.hn_search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-rdia-300">
              {shown.length} / {hospitals.length} {t.hn_count}
            </span>
            {canManage && (
              <button className="btn-primaire ms-auto flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
                <Icon path={UI_ICONS.plus} size={15} />
                {t.add_hosp}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAffecteurOpen(true)}
              className="group inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-or-500 to-or-600 px-3.5 py-2 text-[12.5px] font-bold text-rdia-600 shadow-[0_4px_12px_-2px_rgba(234,140,14,0.45)] transition-all duration-200 hover:from-or-500 hover:to-or-500 hover:shadow-[0_6px_16px_-2px_rgba(234,140,14,0.6)] hover:scale-[1.02] active:scale-[0.98] sm:ms-auto lg:ms-0"
            >
              <Icon path={UI_ICONS.target} size={15} strokeWidth={2} />
              <span className="tracking-wide">Affecteur IA</span>
            </button>
          </div>
          {/* Sept puces de catégorie : bandeau défilable sous `sm` plutôt que
              quatre lignes de repli qui repoussent la liste hors de l'écran. */}
          <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
            <button className={chip(kindFilter === "all")} onClick={() => setKindFilter("all")}>
              {t.flt_all}
              <span className="tabular-nums opacity-60">{hospitals.length}</span>
            </button>
            {HOSPITAL_KINDS.filter((k) => (counts[k.kind] ?? 0) > 0).map((k) => (
              <button key={k.kind} className={chip(kindFilter === k.kind)} onClick={() => setKindFilter(k.kind)}>
                <HealthGlyph kind={k.kind} size={16} />
                {k.label}
                <span className="tabular-nums opacity-60">{counts[k.kind]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((h) => {
            const pct = Math.round((h.occ / h.lits) * 100);
            const kd = kindDef(hospKind(h));
            return (
              <div key={h.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-start gap-2.5">
                  <HealthGlyph kind={hospKind(h)} size={22} />
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{h.nom}</h3>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">
                      {h.ville}
                      {h.region ? ` · ${h.region}` : ""}
                    </div>
                    <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: kd.color, background: `${kd.color}1f` }}>
                      {h.type ?? kd.long}
                    </div>
                  </div>
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
                <button className="btn-secondaire min-h-[44px] w-full text-xs lg:min-h-0" onClick={() => { setTab("staff"); setSelHosp(h.id); }}>{t.view}</button>
              </div>
            );
          })}
        </div>
        <AddHospitalModal open={adding} onClose={() => setAdding(false)} />
        <Modal open={affecteurOpen} onClose={() => setAffecteurOpen(false)} size="2xl" title="Affecteur IA · Hospinet">
          <HospinetAffecteurIA />
        </Modal>
      </section>
    );
  }

  // ---- vue détail ----
  const { staffRows, beds, vehRows, fields } = hospitalDetail(hosp, fieldHosps, t);
  const tabs: [typeof tab, string][] = [["staff", t.med_staff], ["beds", t.beds], ["veh", t.vehicles], ["field", t.field]];

  const tabCls = (k: string) =>
    `min-h-[44px] shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors lg:min-h-0 ${
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
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        {/* Les quatre onglets passent sous le titre tant qu'il n'y a pas la
            place : côte à côte, ils réduisaient le nom à deux caractères. */}
        <div className="flex flex-wrap items-center gap-3">
          <button aria-label={t.back} title={t.back} className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600" onClick={() => setSelHosp(null)}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <HealthGlyph kind={hospKind(hosp)} size={26} />
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{hosp.nom}</h2>
            <div className="text-xs text-gray-500 dark:text-rdia-300">
              {hosp.type ?? kindDef(hospKind(hosp)).long} · {hosp.ville}
              {hosp.region ? ` · ${hosp.region}` : ""}
            </div>
          </div>
          <div className="-mx-4 flex w-[calc(100%_+_2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-x-visible sm:px-0 sm:pb-0">
            {tabs.map(([k, label]) => (
              <button key={k} className={tabCls(k)} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stat(t.beds_total, hosp.lits, "text-rdia-600 dark:text-rdia-50")}
          {stat(t.beds_occ, hosp.occ, "text-or-500")}
          {stat(t.beds_free, hosp.lits - hosp.occ, "text-green-600")}
          {stat(t.icu, `${hosp.rea - hosp.reaOcc} / ${hosp.rea}`, "text-danger-500")}
        </div>
      </div>

      {tab === "staff" && (
        <>
          {/* Tableau : à partir de `md`, la densité redevient lisible. */}
          <div className="carte hidden overflow-x-auto md:block">
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

          {/* Sous `md` : une carte par soignant — mêmes colonnes. */}
          <div className="flex flex-col gap-2 md:hidden">
            {staffRows.map((p, i) => (
              <div key={i} className="carte flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{p.nom}</span>
                  <span className="shrink-0"><Badge type={p.stType} label={p.stLabel} /></span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                  <Champ label={t.h_grade} value={p.grade} />
                  <Champ label={t.h_spec} value={p.spec} />
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "beds" && (
        <div className="carte flex flex-col gap-4 p-4 sm:p-5">
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
        <>
          {/* Tableau : à partir de `md`, la densité redevient lisible. */}
          <div className="carte hidden overflow-x-auto md:block">
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

          {/* Sous `md` : une carte par type de véhicule — mêmes colonnes. */}
          <div className="flex flex-col gap-2 md:hidden">
            {vehRows.map((v, i) => (
              <div key={i} className="carte flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-semibold text-gray-800 dark:text-rdia-50">{v.type}</span>
                  <span className={`shrink-0 ${etatBadge(v.maint)}`}>{v.etat}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                  <Champ label={t.h_qty} value={v.qty} mono />
                  <Champ label={t.h_assign} value={v.assign} />
                </dl>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "field" && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end">
            <button className="btn-primaire w-full text-sm sm:w-auto" onClick={() => { deployField(hosp); showToast(t.toast_field); }}>{t.deploy_field}</button>
          </div>
          {fields.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fields.map((f, i) => (
                <div key={i} className="carte flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <HealthGlyph kind={f.kind} size={20} />
                      <h3 className="min-w-0 break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{f.nom}</h3>
                    </div>
                    <span className="shrink-0"><Badge type={f.badgeType} label={f.badgeLabel} /></span>
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

/** Couple libellé/valeur d'une carte mobile (équivalent d'une cellule du tableau). */
function Champ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className={`break-words text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
