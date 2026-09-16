"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { StatTile } from "@/components/ui/StatTile";
import { occBarClass } from "@/lib/helpers";
import { hospitalDetail } from "@/lib/derive";
import { DeleteEntityButton } from "@/components/org/DeleteEntityModal";
import { AddHospitalModal } from "@/components/org/AddEntityModals";
import { ResponsibleCard } from "@/components/responsibility/ResponsibleCard";
import { Modal } from "@/components/ui/Modal";
import { HealthGlyph } from "@/components/health/HealthGlyph";
import { HospinetIAPanel } from "@/components/health/HospinetIAPanel";
import { HospinetAffecteurIA } from "@/components/health/HospinetAffecteurIA";
import { HOSPITAL_KINDS, hospKind, kindDef } from "@/lib/hospitals";
import { HospitalDeathModal } from "@/components/morgue/HospitalDeathModal";
import { freePlaces, nearestSites, sitesOfHospital } from "@/lib/morgue";
import { api } from "@/lib/api";
import type { HospitalKind, MortuaryRecord } from "@/lib/types";

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
  const dataProfile = useArgos((s) => s.dataProfile);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const deployField = useArgos((s) => s.deployFieldHospital);
  const showToast = useArgos((s) => s.showToast);
  const [tab, setTab] = useState<"staff" | "beds" | "veh" | "field">("staff");
  // Onglets de la vue LISTE, repris de la disposition d'OPSnet : un bandeau
  // de commandement toujours visible, puis une seule barre qui porte le titre,
  // les onglets et les actions. Auparavant la synthèse et la liste
  // s'empilaient, et il fallait dérouler tout le panneau IA pour atteindre
  // les établissements.
  const [vue, setVue] = useState<"apercu" | "etabs">("apercu");
  const [adding, setAdding] = useState(false);
  const [affecteurOpen, setAffecteurOpen] = useState(false);
  // Filtres de la vue liste : le référentiel compte plus de cent
  // établissements — catégorie et recherche libre les rendent exploitables.
  const [kindFilter, setKindFilter] = useState<HospitalKind | "all">("all");
  const [query, setQuery] = useState("");

  const canManage = role === "superadmin" || role === "admin";
  const hosp = selHosp ? hospitals.find((h) => h.id === selHosp) : null;
  // Décès en établissement → site mortuaire : qui peut écrire sur Hospinet
  // le déclare ; les transferts annoncés par cet établissement s'affichent
  // jusqu'à leur réception (registre du service morgue).
  const m = useModules();
  const morgues = useArgos((s) => s.morgues);
  const [deathOpen, setDeathOpen] = useState(false);
  const [registry, setRegistry] = useState<MortuaryRecord[]>([]);
  const canDeclare = role === "superadmin" || role === "admin" || role === "greencell" || role === "resp_hospital";
  const hospId = hosp?.id ?? null;
  const nbSites = morgues.length;
  useEffect(() => {
    if (!hospId || nbSites === 0) return;
    let vivant = true;
    void api.getMortuaryRegistry().then((res) => {
      if (vivant && Array.isArray(res.data)) setRegistry(res.data as unknown as MortuaryRecord[]);
    });
    return () => {
      vivant = false;
    };
  }, [hospId, nbSites, deathOpen]);
  const transfertsEnCours = hosp ? registry.filter((r) => r.origin?.kind === "hospital" && r.origin.id === hosp.id && r.pendingReceipt) : [];
  // La morgue suit la logique de l'hôpital : celle(s) rattachée(s) à l'établissement, sinon la plus indiquée de sa région.
  const morguesRattachees = hosp ? sitesOfHospital(hosp.id, morgues) : [];
  const morgueIndiquee = hosp && morguesRattachees.length === 0 ? nearestSites(hosp.ll, morgues, registry, { region: hosp.region })[0]?.site : undefined;

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

    const litsTot = hospitals.reduce((n, h) => n + h.lits, 0);
    const litsOcc = hospitals.reduce((n, h) => n + h.occ, 0);
    const litsLibres = hospitals.reduce((n, h) => n + Math.max(0, h.lits - h.occ - (h.reserved ?? 0)), 0);
    const reaTot = hospitals.reduce((n, h) => n + h.rea, 0);
    const reaLibres = hospitals.reduce((n, h) => n + Math.max(0, h.rea - h.reaOcc), 0);
    const occPct = litsTot > 0 ? Math.round((100 * litsOcc) / litsTot) : 0;

    const onglets: { k: typeof vue; label: string }[] = [
      { k: "apercu", label: t.hn_tab_overview },
      { k: "etabs", label: `${t.hn_facilities} (${hospitals.length})` },
    ];

    return (
      <section className="flex flex-col gap-4 animate-fade-in">
        {/* --- bandeau de commandement -------------------------------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label={t.hn_facilities} value={hospitals.length} icon={NAV_ICONS.hospitals} tint="or" />
          <StatTile
            label={t.beds_free}
            value={`${litsLibres.toLocaleString("fr-FR")} / ${litsTot.toLocaleString("fr-FR")}`}
            icon={UI_ICONS.beds}
            tint="green"
          />
          <StatTile label={t.icu} value={`${reaLibres} / ${reaTot}`} icon={UI_ICONS.alert} tint="danger" />
          <StatTile
            label={t.occupancy}
            value={`${occPct} %`}
            icon={UI_ICONS.activity}
            tint={occPct >= 92 ? "danger" : occPct >= 75 ? "or" : "green"}
          />
        </div>

        {/* --- onglets + actions -------------------------------------------- */}
        <div className="carte flex flex-wrap items-center gap-2 p-2.5">
          <h1 className="flex items-center gap-2 pe-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">
            <Icon path={NAV_ICONS.hospitals} size={17} className="text-or-500" />
            {t.hn_title}
          </h1>
          <div className="flex flex-wrap gap-1">
            {onglets.map((o) => (
              <button
                key={o.k}
                onClick={() => setVue(o.k)}
                aria-pressed={vue === o.k}
                className={`cible-tactile shrink-0 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
                  vue === o.k
                    ? "bg-or-500 text-rdia-600"
                    : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {/* Toujours visible : la recherche n'apparaissait que sur l'onglet
                des établissements, donc jamais à l'arrivée sur l'écran. Taper
                y conduit. */}
            <input
              className="input-champ cible-tactile w-[220px] text-sm"
              placeholder={t.hn_search}
              aria-label={t.hn_search}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim()) setVue("etabs");
              }}
            />
            {vue === "etabs" && (
              <span className="text-xs font-semibold tabular-nums text-gray-500 dark:text-rdia-300">
                {shown.length} / {hospitals.length} {t.hn_count}
              </span>
            )}
            {canManage && (
              <button className="btn-primaire cible-tactile flex items-center gap-1.5 text-sm" onClick={() => setAdding(true)}>
                <Icon path={UI_ICONS.plus} size={15} />
                {t.add_hosp}
              </button>
            )}
            <button type="button" onClick={() => setAffecteurOpen(true)} className="btn-affecteur cible-tactile">
              <Icon path={UI_ICONS.target} size={15} strokeWidth={2} />
              <span className="tracking-wide">{t.af_launcher}</span>
            </button>
          </div>
        </div>

        {/* --- vue d'ensemble : la synthèse IA du réseau --------------------- */}
        {vue === "apercu" && <HospinetIAPanel />}

        {/* --- établissements : filtres de catégorie puis cartes ------------- */}
        {vue === "etabs" && (
          <>
            {/* Sept puces de catégorie : bandeau défilable sous `sm` plutôt que
                quatre lignes de repli qui repoussent la liste hors de l'écran. */}
            <div className="carte -mx-0 flex items-center gap-2 overflow-x-auto p-2.5 sm:flex-wrap sm:overflow-x-visible">
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
                      {/* Libres = armés − occupés − RÉSERVÉS : une EVASAN acceptée
                          mais pas encore arrivée tient déjà son lit (P2-b). */}
                      <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">
                        {h.lits - h.occ - (h.reserved ?? 0)}
                        {(h.reserved ?? 0) > 0 && (
                          <span className="ms-1.5 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                            {h.reserved} {t.beds_reserved}
                          </span>
                        )}
                      </span>
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
          </>
        )}

        <AddHospitalModal open={adding} onClose={() => setAdding(false)} />
        <Modal open={affecteurOpen} onClose={() => setAffecteurOpen(false)} size="2xl" title={`${t.af_launcher} · ${t.nav_hosp}`}>
          <HospinetAffecteurIA />
        </Modal>
      </section>
    );
  }

  // ---- vue détail ----
  const { staffRows, beds, vehRows, fields } = hospitalDetail(hosp, fieldHosps, t, { demo: dataProfile === "demo" });
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
          <DeleteEntityButton kind="hospital" id={hosp.id} name={hosp.nom} compact onDeleted={() => setSelHosp(null)} />
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
        {/* Le directeur et son état de connexion — seuls les établissements
            militaires ont un responsable désigné ; sans lui, rien n'est dit. */}
        <ResponsibleCard kind="hospital" entityId={hosp.id} hideIfNone />
        {/* Décès en établissement : le corps part vers un site mortuaire,
            réception à confirmer là-bas — la traçabilité commence ici. */}
        {morgues.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-rdia-700/60">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-gray-600 dark:text-rdia-200">
              <span className="flex items-center gap-1 font-semibold text-rdia-600 dark:text-rdia-50">
                <Icon path={NAV_ICONS.morgue} size={13} className="text-or-500" />
                {m.morgue.hosp_block}
              </span>
              {morguesRattachees.length > 0
                ? morguesRattachees.map((s) => (
                    <span key={s.id}>
                      {s.nom} · {s.level === "regional" ? m.morgue.level_regional : m.morgue.level_city} · {Math.max(0, freePlaces(s, registry))} / {s.capacity} {m.morgue.t_free}
                    </span>
                  ))
                : morgueIndiquee
                  ? <span>{m.morgue.hosp_none} — {m.morgue.hosp_nearest} {morgueIndiquee.nom} ({morgueIndiquee.ville})</span>
                  : <span>{m.morgue.hosp_none}</span>}
              <Link href="/morgue" className="text-[11px] font-semibold text-or-500 hover:underline">{m.morgue.open_service}</Link>
            </div>
          </div>
        )}
        {morgues.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-rdia-700/60">
            {canDeclare && (
              <button type="button" onClick={() => setDeathOpen(true)} className="cible-tactile btn-secondaire flex items-center gap-1.5 text-sm">
                <Icon path={NAV_ICONS.morgue} size={14} />
                {m.morgue.h_death}
              </button>
            )}
            <span className="text-[11.5px] text-gray-500 dark:text-rdia-300">
              {transfertsEnCours.length === 0
                ? m.morgue.h_none
                : transfertsEnCours.map((r) => `${r.reference} — ${m.morgue.h_pending} ${morgues.find((s) => s.id === r.mid)?.nom ?? r.mid}`).join(" · ")}
            </span>
          </div>
        )}
        {deathOpen && (
          <HospitalDeathModal hospital={hosp} sites={morgues} records={registry} onClose={() => setDeathOpen(false)} onDone={() => setDeathOpen(false)} />
        )}
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
