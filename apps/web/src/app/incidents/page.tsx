"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel} from "@/lib/helpers";
import { isSuperAdmin } from "@/lib/roles";
import { compareIncidentDate, formatIncidentHour } from "@/lib/derive";
import type { Incident, IncidentStatus } from "@/lib/types";
import { predictIncidentEvolution, type IncidentEvolution } from "@/lib/ai/risk/incidentEvolution";
import { IncidentEvolutionCard } from "@/components/incidents/IncidentEvolutionCard";
import { VictimsModal } from "@/components/incidents/VictimsModal";
import { DeleteIncidentModal } from "@/components/incidents/DeleteIncidentModal";
import {
  TH,
  TD,
  SEV_ORDER,
  SEVS,
  STATUSES,
  FilterSpec,
} from "@/app/incidents/_parts/shared";
import { ColumnFilter } from "@/app/incidents/_parts/ColumnFilter";
import { DetailsModal } from "@/app/incidents/_parts/DetailsModal";
import { SubIncidentTree } from "@/app/incidents/_parts/SubIncidentTree";
import { SubIncidentWizard } from "@/app/incidents/_parts/SubIncidentWizard";
import { StatusConfirm } from "@/app/incidents/_parts/StatusConfirm";

export default function IncidentsPage() {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const incidents = useArgos((s) => s.incidents);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const quakes = useArgos((s) => s.quakes);
  const dashStats = useArgos((s) => s.dashStats);
  const lang = useArgos((s) => s.lang);
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);
  const openWizard = useArgos((s) => s.openWizard);
  const openWizardEdit = useArgos((s) => s.openWizardEdit);
  const select = useArgos((s) => s.select);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [fType, setFType] = useState<string[]>([]);
  const [fSev, setFSev] = useState<string[]>([]);
  const [fRegion, setFRegion] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [openFilter, setOpenFilter] = useState<"type" | "sev" | "region" | "st" | null>(null);
  const [sortBy, setSortBy] = useState<"time" | "sev" | "type">("time");
  const [sortOpen, setSortOpen] = useState(false);
  const [viewInc, setViewInc] = useState<Incident | null>(null);
  /** Le bilan des victimes à affiner (décédés, blessés, disparus) — une modale à part, par-dessus la liste. */
  const [victimsFor, setVictimsFor] = useState<Incident | null>(null);
  // Lignes dépliées : arborescence des sous-incidents sous l'incident parent.
  const [expanded, setExpanded] = useState<string[]>([]);
  // Ajout d'un sous-incident : modale SÉPARÉE (pas imbriquée dans la modale de détails).
  const [addSubFor, setAddSubFor] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  // Changement de statut (confirmé par mot de passe) + proposition d'archivage.
  const [stChange, setStChange] = useState<{ inc: Incident; newSt: IncidentStatus } | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<Incident | null>(null);
  // Suppression définitive : la modale porte le code de confirmation (N-5).
  const [deletePrompt, setDeletePrompt] = useState<Incident | null>(null);

  const activeList = useMemo(() => incidents.filter((i) => !i.archived), [incidents]);
  const archivedList = useMemo(() => incidents.filter((i) => i.archived), [incidents]);
  const base = tab === "active" ? activeList : archivedList;
  const regions = useMemo(() => [...new Set(base.map((i) => i.region))].sort(), [base]);
  // Types RÉELLEMENT présents dans la liste (pas tout le catalogue).
  const presentTypes = useMemo(() => [...new Set(base.map((i) => i.type))], [base]);
  const toggleIn = (set: (fn: (a: string[]) => string[]) => void) => (v: string) =>
    set((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]));

  // Les incidents RATTACHÉS ne font pas de ligne à eux : ils se présentent sous leur parent.
  const childrenOf = useMemo(() => {
    const m: Record<string, Incident[]> = {};
    for (const i of incidents) if (i.parentId) (m[i.parentId] ??= []).push(i);
    return m;
  }, [incidents]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = base
      .filter((i) => !i.parentId || !incidents.some((p) => p.id === i.parentId))
      .filter((i) => !needle || `${i.titre}${i.region}${i.id}`.toLowerCase().includes(needle))
      .filter((i) => !fType.length || fType.includes(i.type))
      .filter((i) => !fSev.length || fSev.includes(i.sev))
      .filter((i) => !fRegion.length || fRegion.includes(i.region))
      .filter((i) => !fStatus.length || fStatus.includes(i.st));
    return [...r].sort((a, b) => {
      if (sortBy === "sev") return SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
      if (sortBy === "type") return typeLabel(a.type, incidentTypes, lang).localeCompare(typeLabel(b.type, incidentTypes, lang));
      return compareIncidentDate(a, b);
    });
  }, [base, incidents, q, fType, fSev, fRegion, fStatus, sortBy, incidentTypes, lang]);

  // Évolutions IA (version compacte, sans météo — affichée dans le tableau principal).
  // Calculée une fois à chaque rendu, O(1) par incident.
  const compactEvos = useMemo<Record<string, IncidentEvolution>>(() => {
    const out: Record<string, IncidentEvolution> = {};
    const evoLabels = m.evolution;
    const partials = {
      factor_severity: evoLabels.factor_severity,
      factor_casualties: evoLabels.factor_casualties,
      factor_hospitals: evoLabels.factor_hospitals,
      factor_units: evoLabels.factor_units,
      factor_duration: evoLabels.factor_duration,
      factor_subincidents: evoLabels.factor_subincidents,
      factor_seismic: evoLabels.factor_seismic,
      factor_weather: evoLabels.factor_weather,
      scenario_critique: evoLabels.scenario_critique,
      scenario_eleve: evoLabels.scenario_eleve,
      scenario_modere: evoLabels.scenario_modere,
      scenario_faible: evoLabels.scenario_faible,
      drivers_prefix: evoLabels.drivers_prefix,
      act_sev_high: evoLabels.act_sev_high,
      act_sev_low: evoLabels.act_sev_low,
      act_cas_high: evoLabels.act_cas_high,
      act_cas_low: evoLabels.act_cas_low,
      act_hosp_high: evoLabels.act_hosp_high,
      act_hosp_med: evoLabels.act_hosp_med,
      act_hosp_low: evoLabels.act_hosp_low,
      act_unit_none: evoLabels.act_unit_none,
      act_unit_high: evoLabels.act_unit_high,
      act_unit_low: evoLabels.act_unit_low,
      act_dur_high: evoLabels.act_dur_high,
      act_dur_low: evoLabels.act_dur_low,
      act_sub_high: evoLabels.act_sub_high,
      act_sub_low: evoLabels.act_sub_low,
      act_seis_high: evoLabels.act_seis_high,
      act_seis_low: evoLabels.act_seis_low,
      act_wx_fire: evoLabels.act_wx_fire,
      act_wx_flood: evoLabels.act_wx_flood,
      act_wx_wind: evoLabels.act_wx_wind,
      act_wx_default: evoLabels.act_wx_default,
      act_fallback_1: evoLabels.act_fallback_1,
      act_fallback_2: evoLabels.act_fallback_2,
      act_fallback_3: evoLabels.act_fallback_3,
      act_critique_override: evoLabels.act_critique_override,
      act_eleve_override: evoLabels.act_eleve_override,
    };
    for (const inc of incidents) {
      try {
        out[inc.id] = predictIncidentEvolution(
          {
            incident: inc,
            allIncidents: incidents,
            hospitals,
            units,
            dashStats,
            quakes,
            weather: null,
          },
          partials,
        );
      } catch {
        /* noop */
      }
    }
    return out;
  }, [incidents, hospitals, units, dashStats, quakes, m.evolution]);

  const toMap = (id: string) => { select("inc", id); router.push("/map"); };
  const setArchived = async (id: string, archived: boolean) => {
    setBusy(true);
    try {
      await api.updateIncident(id, { archived });
      await loadDomain();
      showToast(t.toast_ok);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Suppression définitive. Rend le message d'erreur à afficher DANS la modale,
   * ou `null` en cas de succès : un refus doit rester sous les yeux, là où le
   * geste a été tenté — un bandeau fugace le ferait manquer.
   */
  const supprimerIncident = async (id: string): Promise<string | null> => {
    const { error, response } = await api.deleteIncident(id);
    // 403 nommé à part : « réservé au Super Administrateur » est actionnable,
    // « échec » ne l'est pas. Tout le reste retombe sur le message générique.
    if (error) return response.status === 403 ? t.del_denied : t.del_failed;
    setDeletePrompt(null);
    await loadDomain();
    showToast(t.del_done);
    return null;
  };

  const toggleFilter = (k: "type" | "sev" | "region" | "st") => () => { setSortOpen(false); setOpenFilter((cur) => (cur === k ? null : k)); };
  const toggleExpand = (id: string) => setExpanded((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  // Boutons d'icône : 44 px au doigt sous lg, densité d'origine au-dessus.
  const iconBtn = "cible-tactile inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600";
  const typeOptions = presentTypes.map((id) => ({ value: id, label: typeLabel(id, incidentTypes, lang) }));
  const sevOptions = SEVS.map((s) => ({ value: s, label: sevBadge(s, t).label }));
  const regionOptions = regions.map((r) => ({ value: r, label: r }));
  const statusOptions = STATUSES.map((s) => ({ value: s, label: stBadge(s, t).label }));
  const sortOptions: [typeof sortBy, string][] = [["time", t.sort_time], ["sev", t.sort_sev], ["type", t.flt_type]];
  // Qui déclare et modifie : la permission servie par l'API (matrice, mode,
  // fonctionnalités coupées) — plus une liste de rôles écrite ici. Qui a le
  // droit de déclarer un incident en déclare autant qu'il veut.
  const can = useArgos((s) => s.can);
  const canEdit = can("incidents:update") || isSuperAdmin(role);
  const canReport = can("incidents:create") || isSuperAdmin(role);
  const canNest = canReport && (can("subincidents:create") || isSuperAdmin(role));
  const openWizardNested = useArgos((s) => s.openWizardNested);
  // `incidents:delete` n'est accordé à personne dans la matrice : seul le
  // joker du Super Administrateur la détient.
  const canDelete = isSuperAdmin(role);
  const tabBtn = (on: boolean) => `min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${on ? "bg-or-500 text-rdia-600" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"}`;
  // Filtres décrits une seule fois : rendus dans l'en-tête du tableau (≥ md) et
  // dans le bandeau de puces au-dessus des cartes (< md).
  const filterSpecs: FilterSpec[] = [
    { key: "type", label: t.h_typev, options: typeOptions, selected: fType, onToggle: toggleIn(setFType), onClear: () => setFType([]) },
    { key: "region", label: t.col_region, options: regionOptions, selected: fRegion, onToggle: toggleIn(setFRegion), onClear: () => setFRegion([]) },
    { key: "sev", label: t.col_sev, options: sevOptions, selected: fSev, onToggle: toggleIn(setFSev), onClear: () => setFSev([]) },
    { key: "st", label: t.col_status, options: statusOptions, selected: fStatus, onToggle: toggleIn(setFStatus), onClear: () => setFStatus([]) },
  ];
  const spec = (k: FilterSpec["key"]): FilterSpec => filterSpecs.find((f) => f.key === k)!;

  // Actions et sélecteur de statut décrits une seule fois : la ligne du tableau
  // (≥ md) et la carte (< md) doivent proposer exactement les mêmes commandes.
  const rowActions = (i: Incident): ReactNode => (
    <>
      <button className={iconBtn} title={t.act_view} aria-label={t.act_view} onClick={() => setViewInc(i)}><Icon path={UI_ICONS.eye} size={16} /></button>
      {canEdit && <button className={iconBtn} title={t.act_edit} aria-label={t.act_edit} onClick={() => openWizardEdit(i)}><Icon path={UI_ICONS.edit} size={15} /></button>}
      {/* Rattacher un incident entier sous celui-ci (mêmes étapes) — sur toute ligne, pas seulement dans l'arborescence dépliée. */}
      {canNest && !i.parentId && !i.archived && i.st !== "closed" && (
        <button className={iconBtn} title={t.wiz_nested_add} aria-label={`${t.wiz_nested_add} — ${i.id}`} onClick={() => openWizardNested(i)}><Icon path={UI_ICONS.branch} size={15} /></button>
      )}
      <button className={iconBtn} title={t.to_map} aria-label={t.to_map} onClick={() => toMap(i.id)}><Icon path={UI_ICONS.map} size={16} /></button>
      {canEdit && (
        i.archived
          ? <button className={iconBtn} title={t.act_unarchive} aria-label={t.act_unarchive} disabled={busy} onClick={() => void setArchived(i.id, false)}><Icon path={UI_ICONS.archive} size={15} /></button>
          : <button className={iconBtn} title={t.act_archive} aria-label={t.act_archive} disabled={busy} onClick={() => void setArchived(i.id, true)}><Icon path={UI_ICONS.archive} size={15} /></button>
      )}
      {/* Suppression définitive — Super Administrateur seul. Séparée par un
          filet des actions réversibles : elle n'appartient pas à la même
          famille de gestes. L'API reste l'autorité. */}
      {canDelete && (
        <>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px self-center bg-gray-200 dark:bg-rdia-600" />
          <button
            className={`${iconBtn} hover:!text-danger-500`}
            title={t.act_delete}
            aria-label={`${t.act_delete} — ${i.id}`}
            disabled={busy}
            onClick={() => setDeletePrompt(i)}
          >
            <Icon path={UI_ICONS.trash} size={15} />
          </button>
        </>
      )}
    </>
  );
  const statusControl = (i: Incident): ReactNode => {
    const st = stBadge(i.st, t);
    if (!canEdit || i.archived) return <Badge type={st.type} label={st.label} />;
    return (
      <select
        value={i.st}
        aria-label={t.col_status}
        onChange={(e) => { const ns = e.target.value as IncidentStatus; if (ns !== i.st) setStChange({ inc: i, newSt: ns }); }}
        className="min-h-[44px] rounded-md border border-gray-200 bg-transparent px-1.5 py-1 text-base font-semibold text-gray-700 dark:border-rdia-600 dark:text-rdia-100 lg:min-h-0 lg:text-xs"
      >
        {STATUSES.map((s) => <option key={s} value={s}>{stBadge(s, t).label}</option>)}
      </select>
    );
  };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Onglets Actifs / Archivés */}
      <div className="flex w-fit max-w-full items-center gap-1 overflow-hidden rounded-xl bg-gray-100 p-1 dark:bg-rdia-800/60">
        <button className={tabBtn(tab === "active")} onClick={() => setTab("active")}>{t.tab_active} ({activeList.length})</button>
        <button className={tabBtn(tab === "archived")} onClick={() => setTab("archived")}>{t.tab_archived} ({archivedList.length})</button>
      </div>

      {/* Barre : recherche + compteur + tri + déclaration */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 16 px sur mobile : sous ce seuil iOS zoome au focus et décale la page. */}
        <input className="input-champ text-base sm:max-w-[220px] md:text-sm" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {base.length}</span>
        <div className="hidden flex-1 sm:block" />
        <div className="relative">
          <button type="button" onClick={() => { setOpenFilter(null); setSortOpen((o) => !o); }} className="btn-secondaire flex items-center gap-1.5 whitespace-nowrap text-sm">
            <Icon path={UI_ICONS.sliders} size={15} />
            {t.sort_by}
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} aria-hidden="true" />
              <div className="absolute end-0 top-full z-50 mt-1.5 min-w-[180px] rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-rdia-600 dark:bg-rdia-700">
                {sortOptions.map(([v, label]) => (
                  <button key={v} type="button" onClick={() => { setSortBy(v); setSortOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-start text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600 lg:py-1.5 lg:text-xs">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${sortBy === v ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"}`}>
                      {sortBy === v && <Icon path={UI_ICONS.check} size={10} strokeWidth={3} />}
                    </span>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {canReport && (
          <button className="btn-primaire flex items-center gap-1.5 whitespace-nowrap text-sm" onClick={() => openWizard()}>
            <Icon path={UI_ICONS.plus} size={15} />
            {t.report}
          </button>
        )}
      </div>

      {/* Sous md, les filtres de colonne n'ont plus d'en-tête où vivre : ils
          deviennent des puces. Deux par ligne, panneau ancré du côté opposé pour
          la seconde colonne — sinon il sort de l'écran à 375 px. */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {filterSpecs.map((f, idx) => (
          <div
            key={f.key}
            className={`flex min-w-0 items-center justify-between rounded-lg border px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider ${
              f.selected.length > 0
                ? "border-or-500 bg-or-500/10 text-or-600 dark:text-or-400"
                : "border-gray-200 text-gray-500 dark:border-rdia-600 dark:text-rdia-300"
            }`}
          >
            <ColumnFilter
              label={f.label}
              options={f.options}
              selected={f.selected}
              open={openFilter === f.key}
              onToggleOpen={toggleFilter(f.key)}
              onToggle={f.onToggle}
              onClear={f.onClear}
              clearLabel={t.flt_clear}
              align={idx % 2 === 1 ? "end" : "start"}
            />
          </div>
        ))}
      </div>

      {/* Tableau : à partir de md, la densité redevient lisible. */}
      <div className="carte hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-rdia-600">
              <th className={TH}>{t.col_id}</th>
              <th className={TH}>{t.col_incident}</th>
              {(["type", "region", "sev", "st"] as const).map((k) => {
                const f = spec(k);
                return (
                  <th key={k} className={TH}>
                    <ColumnFilter
                      label={f.label}
                      options={f.options}
                      selected={f.selected}
                      open={openFilter === k}
                      onToggleOpen={toggleFilter(k)}
                      onToggle={f.onToggle}
                      onClear={f.onClear}
                      clearLabel={t.flt_clear}
                    />
                  </th>
                );
              })}
              <th className={`${TH} whitespace-nowrap`}>{t.col_evo}</th>
              <th className={TH}>{t.col_time}</th>
              <th className={`${TH} text-end`}>{t.col_actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const sb = sevBadge(i.sev, t);
              const subCount = (i.subIncidents?.length ?? 0) + (childrenOf[i.id]?.length ?? 0);
              const isOpen = subCount > 0 && expanded.includes(i.id);
              return (
                <Fragment key={i.id}>
                <tr className={`border-b transition-colors dark:border-rdia-700/50 ${isOpen ? "border-transparent bg-gray-50 dark:bg-rdia-700/30" : "border-gray-100 hover:bg-gray-50 dark:hover:bg-rdia-700/30"}`}>
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.id}</td>
                  <td className={TD}>
                    {/* Nom : avec sous-incidents → déplie l'arborescence ; sinon → fiche détaillée. */}
                    <button
                      className="flex items-center gap-1.5 text-start font-medium text-gray-800 hover:text-or-600 dark:text-rdia-50"
                      aria-expanded={subCount > 0 ? isOpen : undefined}
                      onClick={() => (subCount > 0 ? toggleExpand(i.id) : setViewInc(i))}
                    >
                      {subCount > 0 ? (
                        <Icon
                          path={UI_ICONS.caretDown}
                          size={14}
                          strokeWidth={2.5}
                          className={`shrink-0 text-gray-400 transition-transform dark:text-rdia-400 ${isOpen ? "text-or-500 dark:text-or-400" : "-rotate-90 rtl:rotate-90"}`}
                        />
                      ) : (
                        <span className="w-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <span className={`hover:underline ${isOpen ? "text-or-600 dark:text-or-400" : ""}`}>{i.titre}</span>
                      {subCount > 0 && (
                        <span
                          title={t.si_title}
                          className="ms-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-or-600 dark:text-or-400"
                        >
                          <Icon path={UI_ICONS.branch} size={10} strokeWidth={2.5} />
                          {subCount}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{typeLabel(i.type, incidentTypes, lang)}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{i.region}</td>
                  <td className={TD}><Badge type={sb.type} label={sb.label} /></td>
                  <td className={TD}>{statusControl(i)}</td>
                  <td className={TD}>
                    {compactEvos[i.id] ? (
                      <button
                        type="button"
                        className="w-full text-start hover:underline"
                        title="Ouvrir la fiche détaillée · Prédictions IA Évolution"
                        onClick={() => setViewInc(i)}
                      >
                        <IncidentEvolutionCard ev={compactEvos[i.id]} compact />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-rdia-400">—</span>
                    )}
                  </td>
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{formatIncidentHour(i)}</td>
                  <td className={TD}>
                    <div className="flex items-center justify-end gap-0.5">{rowActions(i)}</div>
                  </td>
                </tr>
                {/* Ligne dépliée : arborescence des sous-incidents (comme les détails sismiques). */}
                {isOpen && (
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-rdia-700/50 dark:bg-rdia-700/30">
                    <td colSpan={9} className="px-4 pb-3 pt-0">
                      <SubIncidentTree incident={i} onAddSub={() => setAddSubFor(i)} children={childrenOf[i.id] ?? []} onOpen={(c) => setViewInc(c)} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sous md : une carte par incident — mêmes données, mêmes actions. */}
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((i) => {
          const sb = sevBadge(i.sev, t);
          const subCount = (i.subIncidents?.length ?? 0) + (childrenOf[i.id]?.length ?? 0);
          const isOpen = subCount > 0 && expanded.includes(i.id);
          return (
            <div key={i.id} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <button
                  className="flex min-w-0 flex-1 items-start gap-1.5 text-start text-sm font-medium text-gray-800 dark:text-rdia-50"
                  aria-expanded={subCount > 0 ? isOpen : undefined}
                  onClick={() => (subCount > 0 ? toggleExpand(i.id) : setViewInc(i))}
                >
                  {subCount > 0 ? (
                    <Icon
                      path={UI_ICONS.caretDown}
                      size={14}
                      strokeWidth={2.5}
                      className={`mt-0.5 shrink-0 text-gray-400 transition-transform dark:text-rdia-400 ${isOpen ? "text-or-500 dark:text-or-400" : "-rotate-90 rtl:rotate-90"}`}
                    />
                  ) : (
                    <span className="w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className={`min-w-0 break-words ${isOpen ? "text-or-600 dark:text-or-400" : ""}`}>{i.titre}</span>
                  {subCount > 0 && (
                    <span
                      title={t.si_title}
                      className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-or-600 dark:text-or-400"
                    >
                      <Icon path={UI_ICONS.branch} size={10} strokeWidth={2.5} />
                      {subCount}
                    </span>
                  )}
                </button>
                <Badge type={sb.type} label={sb.label} />
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.col_id}</dt>
                  <dd className="truncate font-mono text-gray-600 dark:text-rdia-200">{i.id}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.col_time}</dt>
                  <dd className="truncate font-mono text-gray-600 dark:text-rdia-200">{formatIncidentHour(i)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.h_typev}</dt>
                  <dd className="break-words text-gray-600 dark:text-rdia-200">{typeLabel(i.type, incidentTypes, lang)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.col_region}</dt>
                  <dd className="break-words text-gray-600 dark:text-rdia-200">{i.region}</dd>
                </div>
              </dl>
              {/* Prédiction d'évolution (branche IA) : même donnée que la colonne du tableau. */}
              {compactEvos[i.id] && (
                <button type="button" className="w-full text-start" onClick={() => setViewInc(i)}>
                  <IncidentEvolutionCard ev={compactEvos[i.id]} compact />
                </button>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-rdia-700/50">
                {statusControl(i)}
                <div className="flex items-center gap-0.5">{rowActions(i)}</div>
              </div>

              {isOpen && <SubIncidentTree incident={i} onAddSub={() => setAddSubFor(i)} children={childrenOf[i.id] ?? []} onOpen={(c) => setViewInc(c)} />}
            </div>
          );
        })}
      </div>

      {/* Détails masqués tant que la modale d'ajout de sous-incident est ouverte : une seule modale à la fois (pas d'imbrication). */}
      {victimsFor && <VictimsModal incident={victimsFor} onClose={() => setVictimsFor(null)} />}
      {viewInc && !addSubFor && !victimsFor && <DetailsModal incident={viewInc} onClose={() => setViewInc(null)} onMap={toMap} onVictims={(inc) => setVictimsFor(inc)} onEdit={(inc) => { openWizardEdit(inc); setViewInc(null); }} onAddSub={(inc) => setAddSubFor(inc)} />}
      {addSubFor && <SubIncidentWizard incident={addSubFor} onClose={() => setAddSubFor(null)} />}
      {stChange && (
        <StatusConfirm
          inc={stChange.inc}
          newSt={stChange.newSt}
          matricule={sessionUser?.matricule ?? ""}
          onClose={() => setStChange(null)}
          onDone={async (inc, newSt) => {
            await loadDomain();
            setStChange(null);
            if (newSt === "closed") setArchivePrompt(inc);
          }}
        />
      )}
      {deletePrompt && (
        <DeleteIncidentModal
          incident={deletePrompt}
          onCancel={() => setDeletePrompt(null)}
          onConfirm={supprimerIncident}
        />
      )}

      {archivePrompt && (
        <Modal open title={t.arch_title} onClose={() => setArchivePrompt(null)} size="sm">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600 dark:text-rdia-200">{t.arch_body}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-secondaire cible-tactile text-sm" onClick={() => setArchivePrompt(null)}>{t.no}</button>
              <button className="btn-primaire cible-tactile text-sm" disabled={busy} onClick={async () => { const inc = archivePrompt; setArchivePrompt(null); await setArchived(inc.id, true); }}>{t.yes}</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
