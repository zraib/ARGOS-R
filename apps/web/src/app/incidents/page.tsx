"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, subTypeLabel, typeLabel, hazardLabel} from "@/lib/helpers";
import { canReportIncident } from "@/lib/roles";
import type { Incident, IncidentStatus, Severity, SubIncident, WeatherForecast } from "@/lib/types";
import { predictIncidentEvolution, type IncidentEvolution } from "@/lib/ai/risk/incidentEvolution";
import { IncidentEvolutionCard } from "@/components/incidents/IncidentEvolutionCard";
import { DeployedPosts } from "@/components/incidents/DeployedPosts";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { FAMILY_PICTOGRAM } from "@/lib/hazard/pictograms";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";
const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEVS: Severity[] = ["high", "medium", "low"];
const STATUSES: IncidentStatus[] = ["open", "prog", "closed"];

/** Coordonnées lisibles depuis [lng, lat]. */
const llTxt = (ll: [number, number]) =>
  `${ll[1].toFixed(3)}° ${ll[1] >= 0 ? "N" : "S"} · ${Math.abs(ll[0]).toFixed(3)}° ${ll[0] >= 0 ? "E" : "W"}`;

/** Descripteur d'un filtre de colonne — partagé entre l'en-tête du tableau et le bandeau mobile. */
interface FilterSpec {
  key: "type" | "sev" | "region" | "st";
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}

/**
 * Filtre de colonne façon Excel : chevron → cases à cocher (marquer/démarquer).
 * `align` ancre le panneau à droite quand la commande est près du bord de
 * l'écran — sinon le panneau déborde à 375 px.
 */
function ColumnFilter({
  label, options, selected, open, onToggleOpen, onToggle, onClear, clearLabel, align = "start",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onToggle: (v: string) => void;
  onClear: () => void;
  clearLabel: string;
  align?: "start" | "end";
}) {
  const activeF = selected.length > 0;
  return (
    <div className="relative inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={label}
        className={`cible-tactile flex shrink-0 items-center justify-center gap-0.5 rounded p-0.5 transition-colors ${activeF ? "text-or-500" : "text-gray-400 hover:text-or-500 dark:text-rdia-400"}`}
      >
        <Icon path={UI_ICONS.caretDown} size={13} strokeWidth={2.5} />
        {activeF && <span className="rounded-full bg-or-500 px-1 text-[9px] font-bold leading-none text-rdia-600">{selected.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggleOpen} aria-hidden="true" />
          <div className={`absolute top-full z-50 mt-1.5 max-h-64 min-w-[190px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-rdia-600 dark:bg-rdia-700 ${align === "end" ? "end-0" : "start-0"}`}>
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => onToggle(o.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-start text-sm font-medium normal-case text-gray-700 transition-colors hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600 lg:py-1.5 lg:text-xs">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${on ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"}`}>
                    {on && <Icon path={UI_ICONS.check} size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {activeF && (
              <button type="button" onClick={onClear} className="mt-1 w-full rounded-lg px-2 py-2.5 text-start text-xs font-semibold normal-case text-danger-500 transition-colors hover:bg-danger-500/10 lg:py-1.5 lg:text-[11px]">
                {clearLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function IncidentsPage() {
  const t = useDict();
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
  // Lignes dépliées : arborescence des sous-incidents sous l'incident parent.
  const [expanded, setExpanded] = useState<string[]>([]);
  // Ajout d'un sous-incident : modale SÉPARÉE (pas imbriquée dans la modale de détails).
  const [addSubFor, setAddSubFor] = useState<Incident | null>(null);
  const [busy, setBusy] = useState(false);
  // Changement de statut (confirmé par mot de passe) + proposition d'archivage.
  const [stChange, setStChange] = useState<{ inc: Incident; newSt: IncidentStatus } | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<Incident | null>(null);

  const activeList = useMemo(() => incidents.filter((i) => !i.archived), [incidents]);
  const archivedList = useMemo(() => incidents.filter((i) => i.archived), [incidents]);
  const base = tab === "active" ? activeList : archivedList;
  const regions = useMemo(() => [...new Set(base.map((i) => i.region))].sort(), [base]);
  // Types RÉELLEMENT présents dans la liste (pas tout le catalogue).
  const presentTypes = useMemo(() => [...new Set(base.map((i) => i.type))], [base]);
  const toggleIn = (set: (fn: (a: string[]) => string[]) => void) => (v: string) =>
    set((a) => (a.includes(v) ? a.filter((x) => x !== v) : [...a, v]));

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = base
      .filter((i) => !needle || `${i.titre}${i.region}${i.id}`.toLowerCase().includes(needle))
      .filter((i) => !fType.length || fType.includes(i.type))
      .filter((i) => !fSev.length || fSev.includes(i.sev))
      .filter((i) => !fRegion.length || fRegion.includes(i.region))
      .filter((i) => !fStatus.length || fStatus.includes(i.st));
    return [...r].sort((a, b) => {
      if (sortBy === "sev") return SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
      if (sortBy === "type") return typeLabel(a.type, incidentTypes, lang).localeCompare(typeLabel(b.type, incidentTypes, lang));
      return a.time < b.time ? 1 : a.time > b.time ? -1 : 0;
    });
  }, [base, q, fType, fSev, fRegion, fStatus, sortBy, incidentTypes, lang]);

  // Évolutions IA (version compacte, sans météo — affichée dans le tableau principal).
  // Calculée une fois à chaque rendu, O(1) par incident.
  const compactEvos = useMemo<Record<string, IncidentEvolution>>(() => {
    const out: Record<string, IncidentEvolution> = {};
    for (const inc of incidents) {
      try {
        out[inc.id] = predictIncidentEvolution({
          incident: inc,
          allIncidents: incidents,
          hospitals,
          units,
          dashStats,
          quakes,
          weather: null,
        });
      } catch {
        /* noop */
      }
    }
    return out;
  }, [incidents, hospitals, units, dashStats, quakes]);

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

  const toggleFilter = (k: "type" | "sev" | "region" | "st") => () => { setSortOpen(false); setOpenFilter((cur) => (cur === k ? null : k)); };
  const toggleExpand = (id: string) => setExpanded((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  // Boutons d'icône : 44 px au doigt sous lg, densité d'origine au-dessus.
  const iconBtn = "cible-tactile inline-flex items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600";
  const typeOptions = presentTypes.map((id) => ({ value: id, label: typeLabel(id, incidentTypes, lang) }));
  const sevOptions = SEVS.map((s) => ({ value: s, label: sevBadge(s, t).label }));
  const regionOptions = regions.map((r) => ({ value: r, label: r }));
  const statusOptions = STATUSES.map((s) => ({ value: s, label: stBadge(s, t).label }));
  const sortOptions: [typeof sortBy, string][] = [["time", t.sort_time], ["sev", t.sort_sev], ["type", t.flt_type]];
  const canEdit = canReportIncident(role);
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
      <button className={iconBtn} title={t.to_map} aria-label={t.to_map} onClick={() => toMap(i.id)}><Icon path={UI_ICONS.map} size={16} /></button>
      {canEdit && (
        i.archived
          ? <button className={iconBtn} title={t.act_unarchive} aria-label={t.act_unarchive} disabled={busy} onClick={() => void setArchived(i.id, false)}><Icon path={UI_ICONS.archive} size={15} /></button>
          : <button className={iconBtn} title={t.act_archive} aria-label={t.act_archive} disabled={busy} onClick={() => void setArchived(i.id, true)}><Icon path={UI_ICONS.archive} size={15} /></button>
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
        {canEdit && (
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
              const subCount = i.subIncidents?.length ?? 0;
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
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.time}</td>
                  <td className={TD}>
                    <div className="flex items-center justify-end gap-0.5">{rowActions(i)}</div>
                  </td>
                </tr>
                {/* Ligne dépliée : arborescence des sous-incidents (comme les détails sismiques). */}
                {isOpen && (
                  <tr className="border-b border-gray-100 bg-gray-50 dark:border-rdia-700/50 dark:bg-rdia-700/30">
                    <td colSpan={9} className="px-4 pb-3 pt-0">
                      <SubIncidentTree incident={i} onAddSub={() => setAddSubFor(i)} />
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
          const subCount = i.subIncidents?.length ?? 0;
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
                  <dd className="truncate font-mono text-gray-600 dark:text-rdia-200">{i.time}</dd>
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

              {isOpen && <SubIncidentTree incident={i} onAddSub={() => setAddSubFor(i)} />}
            </div>
          );
        })}
      </div>

      {/* Détails masqués tant que la modale d'ajout de sous-incident est ouverte : une seule modale à la fois (pas d'imbrication). */}
      {viewInc && !addSubFor && <DetailsModal incident={viewInc} onClose={() => setViewInc(null)} onMap={toMap} onEdit={(inc) => { openWizardEdit(inc); setViewInc(null); }} onAddSub={(inc) => setAddSubFor(inc)} />}
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

/** Ligne libellé / valeur. */
function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <div className="text-gray-800 dark:text-rdia-50">{value}</div>
    </div>
  );
}

/** Modale de détails enrichie (bilan humain, moyens, personnel, véhicules, sous-incidents + IA évolution). */
function DetailsModal({ incident: initial, onClose, onMap, onEdit, onAddSub }: { incident: Incident; onClose: () => void; onMap: (id: string) => void; onEdit: (inc: Incident) => void; onAddSub: (inc: Incident) => void }) {
  const router = useRouter();
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const allIncidents = useArgos((s) => s.incidents);
  const quakes = useArgos((s) => s.quakes);
  const dashStats = useArgos((s) => s.dashStats);
  // Lecture de la version VIVE de l'incident (mise à jour après ajout/retrait
  // d'un sous-incident) ; repli sur l'instantané passé en prop.
  const incident = useArgos((s) => s.incidents.find((i) => i.id === initial.id)) ?? initial;
  const engUnits = units.filter((u) => incident.responders?.units.includes(u.id));
  const engHosps = hospitals.filter((h) => incident.responders?.hospitals.includes(h.id));
  const personnel = engUnits.reduce((n, u) => n + u.eff, 0);
  const amb = engHosps.reduce((n, h) => n + h.amb, 0);
  const heli = engHosps.reduce((n, h) => n + h.heli, 0);
  const hasResp = engUnits.length > 0 || engHosps.length > 0;

  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [wxLoading, setWxLoading] = useState(false);
  const [wxTried, setWxTried] = useState(false);

  // Volet NRBC : catalogue tiré au besoin pour résoudre la substance déclarée.
  const nrbcSubstances = useArgos((s) => s.nrbcSubstances);
  const ensureNrbcSubstances = useArgos((s) => s.ensureNrbcSubstances);
  const showPlume = useArgos((s) => s.showPlume);
  const nrbcSubstanceId = incident.nrbc?.substanceId;
  useEffect(() => {
    if (nrbcSubstanceId) void ensureNrbcSubstances();
  }, [nrbcSubstanceId, ensureNrbcSubstances]);
  const nrbcSub = nrbcSubstanceId ? nrbcSubstances.find((s) => s.id === nrbcSubstanceId) : undefined;
  // Même défaut prudent que l'API : sans ampleur déclarée, le grand déversement.
  const nrbcDist = nrbcSub ? (incident.nrbc?.spill === "small" ? nrbcSub.small : nrbcSub.large) : undefined;

  // Chargement lazy de la météo pour l'incident (une seule fois à l'ouverture).
  if (!wxTried && incident?.ll) {
    setWxTried(true);
    setWxLoading(true);
    void api.getWeatherForecast(incident.ll[1], incident.ll[0])
      .then((res) => {
        if (res && res.data) setWeather(res.data as WeatherForecast);
      })
      .catch(() => { /* on reste sur weather=null, l'évolution fonctionne quand même */ })
      .finally(() => setWxLoading(false));
  }

  const evolution = useMemo<IncidentEvolution | null>(() => {
    if (!incident) return null;
    try {
      return predictIncidentEvolution({
        incident,
        allIncidents,
        hospitals,
        units,
        dashStats,
        quakes,
        weather: weather ?? null,
      });
    } catch {
      return null;
    }
  }, [incident, allIncidents, hospitals, units, dashStats, quakes, weather]);

  return (
    <Modal open title={`${incident.id} — ${incident.titre}`} onClose={onClose} size="xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3 dark:border-rdia-700/50">
          <button className="btn-primaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => router.push(`/incidents/${incident.id}/dashboard`)}><Icon path={NAV_ICONS.dashboard} size={14} /> {t.idash_open}</button>
          <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => onMap(incident.id)}><Icon path={UI_ICONS.map} size={14} /> {t.to_map}</button>
          <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => onEdit(incident)}><Icon path={UI_ICONS.edit} size={14} /> {t.act_edit}</button>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label={t.h_typev} value={typeLabel(incident.type, incidentTypes, lang)} />
          <Detail label={t.col_region} value={incident.region} />
          <Detail label={t.col_sev} value={<Badge type={sevBadge(incident.sev, t).type} label={sevBadge(incident.sev, t).label} />} />
          <Detail label={t.col_status} value={<Badge type={stBadge(incident.st, t).type} label={stBadge(incident.st, t).label} />} />
          <Detail label={t.col_time} value={incident.time} />
          <Detail label={t.f_coords} value={<span className="font-mono text-xs">{llTxt(incident.ll)}</span>} />
          {incident.adresse && <Detail label={t.f_addr} value={incident.adresse} />}
          {incident.casualties && (
            <Detail label={t.wz_casualties} value={`${incident.casualties.dead} ${t.wz_dead.toLowerCase()} · ${incident.casualties.injured} ${t.wz_injured.toLowerCase()} · ${incident.casualties.missing} ${t.wz_missing.toLowerCase()}`} />
          )}
          {hasResp && <Detail label={t.det_personnel} value={`${personnel}`} />}
          {hasResp && <Detail label={t.det_vehicles} value={`${amb} amb. · ${heli} héli.`} />}
        </div>
        {hasResp && (
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.det_responders}</div>
            <div className="flex flex-wrap gap-1.5">
              {engUnits.map((u) => (
                <span key={u.id} className="rounded-md bg-or-500/15 px-2 py-1 text-[11px] font-semibold text-or-600 dark:text-or-400">{u.nom} · {u.eff}</span>
              ))}
              {engHosps.map((h) => (
                <span key={h.id} className="rounded-md bg-blue-500/15 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">{h.nom}</span>
              ))}
            </div>
          </div>
        )}

        {/* === VOLET NRBC : substance, distances ERG, accès au panache === */}
        {incident.nrbc && (
          <div className="rounded-xl border-2 border-or-500/30 bg-or-500/5 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
                {/* Le pictogramme RÉGLEMENTAIRE plutôt qu'un glyphe maison :
                    c'est le symbole que porte le fût sur le terrain. */}
                <HazardIcon kind={FAMILY_PICTOGRAM[incident.nrbc.family]} size={18} label={hazardLabel(FAMILY_PICTOGRAM[incident.nrbc.family], t)} />
                {t.nrbc_title}
                <span className="rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold text-or-500">
                  {incident.nrbc.family} — {incident.nrbc.family === "N" ? t.nrbc_fam_n : incident.nrbc.family === "R" ? t.nrbc_fam_r : incident.nrbc.family === "B" ? t.nrbc_fam_b : t.nrbc_fam_c}
                </span>
              </div>
              {incident.nrbc.family === "C" && (
                <button
                  className="btn-primaire cible-tactile flex items-center gap-1.5 text-xs"
                  onClick={() => {
                    showPlume(incident.id);
                    onMap(incident.id);
                  }}
                >
                  <Icon path={UI_ICONS.nrbc} size={14} /> {t.nrbc_see_plume}
                </button>
              )}
            </div>
            {nrbcSub && nrbcDist ? (
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Detail
                  label={t.nrbc_substance}
                  value={
                    <span>
                      {nrbcSub.labels[lang]}{" "}
                      <span className="font-mono text-xs text-gray-500 dark:text-rdia-300">
                        UN {nrbcSub.un} · {t.nrbc_guide} {nrbcSub.ergGuide}
                      </span>
                    </span>
                  }
                />
                <Detail
                  label={t.nrbc_spill}
                  value={incident.nrbc.spill === "small" ? t.nrbc_spill_small : t.nrbc_spill_large}
                />
                <Detail label={t.nrbc_iso} value={`${nrbcDist.isolationM} m`} />
                <Detail
                  label={`${t.nrbc_protect_day} / ${t.nrbc_protect_night}`}
                  value={`${nrbcDist.protectDayKm} km / ${nrbcDist.protectNightKm} km`}
                />
                {!nrbcSub.ergVerified && (
                  <div className="text-[10px] font-semibold text-or-500 sm:col-span-2">{t.nrbc_unverified}</div>
                )}
              </div>
            ) : (
              incident.nrbc.family === "C" && (
                <div className="text-xs text-gray-500 dark:text-rdia-300">{t.nrbc_substance_none}</div>
              )
            )}
          </div>
        )}

        {/* === SECTION IA · PRÉDICTION D'ÉVOLUTION === */}
        <div className="mt-2">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
              <Icon path={UI_ICONS.sparkles} size={13} className="text-or-500" />
              Prédictions IA · Évolution incident
              {wxLoading && <span className="text-[10.5px] font-normal text-gray-400 dark:text-rdia-400">(chargement météo en cours…)</span>}
            </div>
            <div className="flex items-center gap-1 text-[10.5px] text-gray-400 dark:text-rdia-400">
              {weather ? <span className="inline-flex items-center gap-1"><Icon path={UI_ICONS.refresh} size={11} /> météo chargée ({weather.current.code})</span> : wxLoading ? null : <span>prédiction sans météo</span>}
              <span>· sismicité {quakes.length} évént. 72h</span>
            </div>
          </div>
          {evolution ? (
            <IncidentEvolutionCard ev={evolution} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white/60 p-3 text-xs text-gray-500 dark:border-rdia-700/50 dark:bg-rdia-800/30 dark:text-rdia-300">
              Calcul de l'évolution IA indisponible sur cet incident.
            </div>
          )}
        </div>

        {/* Qui conduit cette opération — et le geste pour l'armer (lot V-2). */}
        <DeployedPosts incidentId={incident.id} />

        <SubIncidentSection incident={incident} onAdd={() => onAddSub(incident)} />
      </div>
    </Modal>
  );
}

/**
 * Carte d'un sous-incident (gravité, type, précision, heure, bilan, moyens,
 * retrait). Partagée entre la modale de détails et l'arborescence de la liste.
 */
function SubIncidentCard({ incident, sub }: { incident: Incident; sub: SubIncident }) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const role = useArgos((s) => s.role);
  const subCatalog = useArgos((s) => s.subCatalog);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const canEdit = canReportIncident(role);
  const [busy, setBusy] = useState(false);

  const sb = sevBadge(sub.sev, t);
  const su = units.filter((u) => sub.responders?.units.includes(u.id));
  const sh = hospitals.filter((h) => sub.responders?.hospitals.includes(h.id));
  const meta: string[] = [];
  if (sub.casualties) meta.push(`${sub.casualties.dead} ${t.wz_dead.toLowerCase()} · ${sub.casualties.injured} ${t.wz_injured.toLowerCase()} · ${sub.casualties.missing} ${t.wz_missing.toLowerCase()}`);
  if (sub.ll) meta.push(llTxt(sub.ll));

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeSubIncident(incident.id, sub.id);
      await loadDomain();
      showToast(t.si_removed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 dark:border-rdia-600/50 dark:bg-rdia-700/40">
      {/* La ligne d'en-tête passe à la ligne : à 375 px gravité + type + note +
          heure ne tiennent pas côte à côte. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge type={sb.type} label={sb.label} />
        <span className="min-w-0 break-words text-sm font-medium text-gray-800 dark:text-rdia-50">{subTypeLabel(sub.type, subCatalog.types, lang)}</span>
        {sub.note && <span className="min-w-0 break-words text-xs text-gray-500 dark:text-rdia-300">· {sub.note}</span>}
        <span className="ms-auto font-mono text-[11px] text-gray-400 dark:text-rdia-400">{sub.time}</span>
        {canEdit && (
          <button
            onClick={() => void remove()}
            disabled={busy}
            className="cible-tactile inline-flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:text-danger-500 disabled:opacity-40"
            aria-label={t.si_removed}
          >
            <Icon path={UI_ICONS.close} size={13} strokeWidth={2.5} />
          </button>
        )}
      </div>
      {meta.length > 0 && (
        <div className="ps-1 font-mono text-[10px] text-gray-400 dark:text-rdia-400">{meta.join("   ")}</div>
      )}
      {(su.length > 0 || sh.length > 0) && (
        <div className="flex flex-wrap gap-1 ps-1">
          {su.map((u) => <span key={u.id} className="rounded bg-or-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-or-600 dark:text-or-400">{u.nom}</span>)}
          {sh.map((h) => <span key={h.id} className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">{h.nom}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * Arborescence des sous-incidents affichée sous la ligne de l'incident dans le
 * tableau (guide vertical + connecteurs horizontaux, feuille « ajouter »).
 */
function SubIncidentTree({ incident, onAddSub }: { incident: Incident; onAddSub: () => void }) {
  const t = useDict();
  const role = useArgos((s) => s.role);
  const canEdit = canReportIncident(role);
  const subs = incident.subIncidents ?? [];

  // Indentation réduite sous md : à 375 px chaque pixel d'indentation est pris
  // sur la largeur utile des cartes filles.
  return (
    <div className="ps-0 animate-fade-in md:ps-6">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
        <Icon path={UI_ICONS.branch} size={12} strokeWidth={2} />
        {t.si_title} ({subs.length})
      </div>
      <div className="ms-1.5 flex flex-col gap-2 border-s-2 border-or-500/30 ps-3 md:ps-4">
        {subs.map((s) => (
          <div key={s.id} className="relative min-w-0 max-w-3xl">
            <span aria-hidden="true" className="absolute -start-3 top-4 h-px w-2.5 bg-or-500/30 md:-start-4 md:w-3.5" />
            <SubIncidentCard incident={incident} sub={s} />
          </div>
        ))}
        {canEdit && (
          <div className="relative">
            <span aria-hidden="true" className="absolute -start-3 top-1/2 h-px w-2.5 bg-or-500/30 md:-start-4 md:w-3.5" />
            <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={onAddSub}>
              <Icon path={UI_ICONS.plus} size={13} /> {t.si_add}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Section « sous-incidents » de la modale de détails : liste en lecture seule + bouton d'ajout (ouvre une modale SÉPARÉE). */
function SubIncidentSection({ incident, onAdd }: { incident: Incident; onAdd: () => void }) {
  const t = useDict();
  const role = useArgos((s) => s.role);
  const canEdit = canReportIncident(role);
  const subs = incident.subIncidents ?? [];

  return (
    <div className="border-t border-gray-100 pt-3 dark:border-rdia-700/50">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
          {t.si_title} ({subs.length})
        </div>
        {canEdit && (
          <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={onAdd}>
            <Icon path={UI_ICONS.plus} size={13} /> {t.si_add}
          </button>
        )}
      </div>

      {subs.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-rdia-400">{t.si_none}</div>
      )}

      {subs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {subs.map((s) => <SubIncidentCard key={s.id} incident={incident} sub={s} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Modale SÉPARÉE d'ajout d'un sous-incident : assistant en 3 étapes (mêmes
 * rubriques qu'un incident principal). Rendue au niveau de la page, en frère de
 * la modale de détails — jamais imbriquée dedans.
 */
function SubIncidentWizard({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const subCatalog = useArgos((s) => s.subCatalog);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);

  // Sous-types suggérés pour le type d'incident parent, « Autre » toujours en fin.
  const suggested = subCatalog.byParent[incident.type] ?? [];
  const options = useMemo(() => {
    const ids = [...suggested, ...(suggested.includes("other") ? [] : ["other"])];
    return ids
      .map((id) => ({ value: id, label: subTypeLabel(id, subCatalog.types, lang) }))
      .filter((o) => o.label);
  }, [suggested, subCatalog.types, lang]);

  const [type, setType] = useState("");
  const [sev, setSev] = useState<Severity>("medium");
  const [note, setNote] = useState("");
  // Coordonnées pré-remplies avec celles de l'incident parent (modifiables).
  const [lat, setLat] = useState(incident.ll[1].toFixed(4));
  const [lng, setLng] = useState(incident.ll[0].toFixed(4));
  const [dead, setDead] = useState("");
  const [injured, setInjured] = useState("");
  const [missing, setMissing] = useState("");
  const [selUnits, setSelUnits] = useState<string[]>([]);
  const [selHosps, setSelHosps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(1); // 1 type/gravité · 2 localisation · 3 victimes & moyens

  const toggle = (setter: (fn: (a: string[]) => string[]) => void, id: string) =>
    setter((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const submit = async () => {
    if (!type || busy) return;
    setBusy(true);
    try {
      const latN = parseFloat(lat), lngN = parseFloat(lng);
      const d = parseInt(dead, 10) || 0, inj = parseInt(injured, 10) || 0, mis = parseInt(missing, 10) || 0;
      const hasCasualties = d > 0 || inj > 0 || mis > 0;
      const hasResp = selUnits.length > 0 || selHosps.length > 0;
      await api.addSubIncident(incident.id, {
        type,
        sev,
        note: note.trim() || undefined,
        ll: Number.isFinite(latN) && Number.isFinite(lngN) ? [lngN, latN] : undefined,
        casualties: hasCasualties ? { dead: d, injured: inj, missing: mis } : undefined,
        responders: hasResp ? { units: selUnits, hospitals: selHosps } : undefined,
      });
      await loadDomain();
      showToast(t.si_added);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // 16 px sur mobile : en dessous, iOS zoome au focus et décale toute la modale.
  const numCls = "input-champ text-base md:text-sm";
  const lblCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
  const chip = (on: boolean) =>
    `rounded-md px-2 py-2 text-xs font-medium transition-colors lg:py-1 lg:text-[11px] ${
      on ? "bg-or-500/15 text-or-600 dark:text-or-400" : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-700/50 dark:text-rdia-300"
    }`;

  return (
    <Modal open title={`${t.si_add} — ${incident.id}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        {/* Stepper */}
        <div className="flex items-center gap-2">
          {[t.si_type, t.wz3, t.wz4].map((label, i) => {
            const num = i + 1;
            const done = step > num;
            const cur = step === num;
            return (
              <div key={label} className="flex flex-1 items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${cur ? "bg-or-500 text-rdia-600" : done ? "bg-or-500/20 text-or-500" : "bg-gray-100 text-gray-400 dark:bg-rdia-600 dark:text-rdia-300"}`}>
                  {done ? <Icon path={UI_ICONS.check} size={12} strokeWidth={3} /> : num}
                </span>
                <span className={`hidden truncate text-xs font-medium sm:block ${cur ? "text-gray-800 dark:text-rdia-50" : "text-gray-400 dark:text-rdia-400"}`}>{label}</span>
                {num < 3 && <span className="h-px flex-1 bg-gray-200 dark:bg-rdia-600" />}
              </div>
            );
          })}
        </div>

        {/* Étape 1 — type & gravité + précision */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div>
              <label className={lblCls}>{t.si_type}</label>
              {/* Tuiles compactes : deux colonnes tiennent à 375 px, trois dès sm. */}
              <div className="grid max-h-[36dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setType(o.value)}
                    className={`rounded-xl border-2 p-3 text-start text-xs font-semibold leading-tight transition-all ${
                      type === o.value
                        ? "border-or-500 bg-or-500/10 text-or-500"
                        : "border-gray-200 text-gray-600 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-200"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.col_sev}</label>
              <div className="flex gap-2">
                {SEVS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSev(s)}
                    className={`flex-1 rounded-lg border-2 py-2 text-xs font-semibold transition-colors ${
                      sev === s ? "border-or-500 bg-or-500/10 text-or-500" : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
                    }`}
                  >
                    {sevBadge(s, t).label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.si_note}</label>
              <input className="input-champ text-base md:text-sm" placeholder={t.si_note} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        )}

        {/* Étape 2 — localisation (pré-remplie depuis l'incident parent) */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-gray-400 dark:text-rdia-400">{t.si_loc_hint}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lblCls}>{t.wz_lat}</label>
                <input className={numCls} type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div>
                <label className={lblCls}>{t.wz_lng}</label>
                <input className={numCls} type="number" step="0.0001" value={lng} onChange={(e) => setLng(e.target.value)} />
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-500 dark:bg-rdia-700/40 dark:text-rdia-300">
              {t.f_coords} : {lat || "—"}, {lng || "—"}
            </div>
          </div>
        )}

        {/* Étape 3 — victimes & moyens */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className={lblCls}>{t.wz_casualties} <span className="normal-case text-gray-300 dark:text-rdia-500">({t.si_optional})</span></label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={lblCls}>{t.wz_dead}</label>
                  <input className={numCls} type="number" min="0" value={dead} onChange={(e) => setDead(e.target.value)} />
                </div>
                <div>
                  <label className={lblCls}>{t.wz_injured}</label>
                  <input className={numCls} type="number" min="0" value={injured} onChange={(e) => setInjured(e.target.value)} />
                </div>
                <div>
                  <label className={lblCls}>{t.wz_missing}</label>
                  <input className={numCls} type="number" min="0" value={missing} onChange={(e) => setMissing(e.target.value)} />
                </div>
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.lg_units}</label>
              <div className="flex flex-wrap gap-1.5">
                {units.map((u) => (
                  <button key={u.id} type="button" className={chip(selUnits.includes(u.id))} onClick={() => toggle(setSelUnits, u.id)}>{u.nom}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={lblCls}>{t.lg_hosp}</label>
              <div className="flex flex-wrap gap-1.5">
                {hospitals.map((h) => (
                  <button key={h.id} type="button" className={chip(selHosps.includes(h.id))} onClick={() => toggle(setSelHosps, h.id)}>{h.nom}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation du wizard */}
        <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-4 dark:border-rdia-700/50">
          <button className="btn-secondaire cible-tactile text-sm md:text-xs" onClick={() => (step > 1 ? setStep(step - 1) : onClose())}>
            {step > 1 ? t.prev : t.no}
          </button>
          {step < 3 ? (
            <button className="btn-primaire cible-tactile text-sm disabled:opacity-50 md:text-xs" onClick={() => setStep(step + 1)} disabled={step === 1 && !type}>{t.next}</button>
          ) : (
            <button className="btn-primaire cible-tactile text-sm disabled:opacity-50 md:text-xs" onClick={submit} disabled={!type || busy}>{t.si_add}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Confirmation d'un changement de statut par mot de passe (step-up). */
function StatusConfirm({ inc, newSt, matricule, onClose, onDone }: { inc: Incident; newSt: IncidentStatus; matricule: string; onClose: () => void; onDone: (inc: Incident, newSt: IncidentStatus) => Promise<void> }) {
  const t = useDict();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!pass || busy) return;
    setBusy(true);
    setErr(false);
    try {
      // Vérification du mot de passe : re-connexion (ne modifie pas la session).
      const res = await api.login({ matricule, password: pass });
      if (res.error || !res.data) { setErr(true); return; }
      await api.updateIncident(inc.id, { st: newSt });
      await onDone(inc, newSt);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={t.st_change_title} onClose={onClose} size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600 dark:text-rdia-200">
          {inc.id} · <span className="font-semibold">{stBadge(inc.st, t).label} → {stBadge(newSt, t).label}</span>
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-or-500/10 px-3 py-2">
          <Icon path={UI_ICONS.shield} size={14} className="shrink-0 text-or-500" />
          <span className="text-[11px] font-semibold text-or-500">{t.st_change_hint}</span>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{t.st_change_pass}</label>
          <input type="password" className="input-champ text-base md:text-sm" value={pass} autoFocus onChange={(e) => { setPass(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
          {err && <p className="mt-1 text-xs font-semibold text-danger-500">{t.lg_badpass}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire cible-tactile text-sm" disabled={!pass || busy} onClick={() => void confirm()}>{busy ? "…" : t.confirm}</button>
        </div>
      </div>
    </Modal>
  );
}
