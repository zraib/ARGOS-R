"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, subTypeLabel, typeLabel } from "@/lib/helpers";
import { canReportIncident } from "@/lib/roles";
import type { Incident, IncidentStatus, Severity } from "@/lib/types";

const TH = "px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
const TD = "px-4 py-2.5";
const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEVS: Severity[] = ["high", "medium", "low"];
const STATUSES: IncidentStatus[] = ["open", "prog", "closed"];

/** Coordonnées lisibles depuis [lng, lat]. */
const llTxt = (ll: [number, number]) =>
  `${ll[1].toFixed(3)}° ${ll[1] >= 0 ? "N" : "S"} · ${Math.abs(ll[0]).toFixed(3)}° ${ll[0] >= 0 ? "E" : "W"}`;

/** Filtre de colonne façon Excel : chevron → cases à cocher (marquer/démarquer). */
function ColumnFilter({
  label, options, selected, open, onToggleOpen, onToggle, onClear, clearLabel,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  open: boolean;
  onToggleOpen: () => void;
  onToggle: (v: string) => void;
  onClear: () => void;
  clearLabel: string;
}) {
  const activeF = selected.length > 0;
  return (
    <div className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={label}
        className={`flex items-center gap-0.5 rounded p-0.5 transition-colors ${activeF ? "text-or-500" : "text-gray-400 hover:text-or-500 dark:text-rdia-400"}`}
      >
        <Icon path={UI_ICONS.caretDown} size={13} strokeWidth={2.5} />
        {activeF && <span className="rounded-full bg-or-500 px-1 text-[9px] font-bold leading-none text-rdia-600">{selected.length}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggleOpen} aria-hidden="true" />
          <div className="absolute start-0 top-full z-50 mt-1.5 max-h-64 min-w-[190px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-rdia-600 dark:bg-rdia-700">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button key={o.value} type="button" onClick={() => onToggle(o.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs font-medium normal-case text-gray-700 transition-colors hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600">
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${on ? "bg-or-500 text-white" : "border border-gray-300 dark:border-rdia-500"}`}>
                    {on && <Icon path={UI_ICONS.check} size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {activeF && (
              <button type="button" onClick={onClear} className="mt-1 w-full rounded-lg px-2 py-1.5 text-start text-[11px] font-semibold normal-case text-danger-500 transition-colors hover:bg-danger-500/10">
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
  const iconBtn = "rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600";
  const typeOptions = presentTypes.map((id) => ({ value: id, label: typeLabel(id, incidentTypes, lang) }));
  const sevOptions = SEVS.map((s) => ({ value: s, label: sevBadge(s, t).label }));
  const regionOptions = regions.map((r) => ({ value: r, label: r }));
  const statusOptions = STATUSES.map((s) => ({ value: s, label: stBadge(s, t).label }));
  const sortOptions: [typeof sortBy, string][] = [["time", t.sort_time], ["sev", t.sort_sev], ["type", t.flt_type]];
  const canEdit = canReportIncident(role);
  const tabBtn = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "bg-or-500 text-rdia-600" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"}`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Onglets Actifs / Archivés */}
      <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-rdia-800/60" style={{ width: "fit-content" }}>
        <button className={tabBtn(tab === "active")} onClick={() => setTab("active")}>{t.tab_active} ({activeList.length})</button>
        <button className={tabBtn(tab === "archived")} onClick={() => setTab("archived")}>{t.tab_archived} ({archivedList.length})</button>
      </div>

      {/* Barre : recherche + compteur + tri + déclaration */}
      <div className="flex flex-wrap items-center gap-2">
        <input className="input-champ max-w-[220px] text-sm" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="font-mono text-xs text-gray-400 dark:text-rdia-400">{rows.length} / {base.length}</span>
        <div className="flex-1" />
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
                  <button key={v} type="button" onClick={() => { setSortBy(v); setSortOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-rdia-100 dark:hover:bg-rdia-600">
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

      <div className="carte">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-rdia-600">
              <th className={TH}>{t.col_id}</th>
              <th className={TH}>{t.col_incident}</th>
              <th className={TH}><ColumnFilter label={t.h_typev} options={typeOptions} selected={fType} open={openFilter === "type"} onToggleOpen={toggleFilter("type")} onToggle={toggleIn(setFType)} onClear={() => setFType([])} clearLabel={t.flt_clear} /></th>
              <th className={TH}><ColumnFilter label={t.col_region} options={regionOptions} selected={fRegion} open={openFilter === "region"} onToggleOpen={toggleFilter("region")} onToggle={toggleIn(setFRegion)} onClear={() => setFRegion([])} clearLabel={t.flt_clear} /></th>
              <th className={TH}><ColumnFilter label={t.col_sev} options={sevOptions} selected={fSev} open={openFilter === "sev"} onToggleOpen={toggleFilter("sev")} onToggle={toggleIn(setFSev)} onClear={() => setFSev([])} clearLabel={t.flt_clear} /></th>
              <th className={TH}><ColumnFilter label={t.col_status} options={statusOptions} selected={fStatus} open={openFilter === "st"} onToggleOpen={toggleFilter("st")} onToggle={toggleIn(setFStatus)} onClear={() => setFStatus([])} clearLabel={t.flt_clear} /></th>
              <th className={TH}>{t.col_time}</th>
              <th className={`${TH} text-end`}>{t.col_actions}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const sb = sevBadge(i.sev, t);
              const st = stBadge(i.st, t);
              return (
                <tr key={i.id} className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-rdia-700/50 dark:hover:bg-rdia-700/30">
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.id}</td>
                  <td className={TD}>
                    <button className="text-start font-medium text-gray-800 hover:text-or-600 hover:underline dark:text-rdia-50" onClick={() => setViewInc(i)}>{i.titre}</button>
                  </td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{typeLabel(i.type, incidentTypes, lang)}</td>
                  <td className={`${TD} text-xs text-gray-600 dark:text-rdia-200`}>{i.region}</td>
                  <td className={TD}><Badge type={sb.type} label={sb.label} /></td>
                  <td className={TD}>
                    {canEdit && !i.archived ? (
                      <select
                        value={i.st}
                        onChange={(e) => { const ns = e.target.value as IncidentStatus; if (ns !== i.st) setStChange({ inc: i, newSt: ns }); }}
                        className="rounded-md border border-gray-200 bg-transparent px-1.5 py-1 text-xs font-semibold text-gray-700 dark:border-rdia-600 dark:text-rdia-100"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{stBadge(s, t).label}</option>)}
                      </select>
                    ) : (
                      <Badge type={st.type} label={st.label} />
                    )}
                  </td>
                  <td className={`${TD} font-mono text-xs text-gray-500 dark:text-rdia-300`}>{i.time}</td>
                  <td className={TD}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button className={iconBtn} title={t.act_view} aria-label={t.act_view} onClick={() => setViewInc(i)}><Icon path={UI_ICONS.eye} size={16} /></button>
                      {canEdit && <button className={iconBtn} title={t.act_edit} aria-label={t.act_edit} onClick={() => openWizardEdit(i)}><Icon path={UI_ICONS.edit} size={15} /></button>}
                      <button className={iconBtn} title={t.to_map} aria-label={t.to_map} onClick={() => toMap(i.id)}><Icon path={UI_ICONS.map} size={16} /></button>
                      {canEdit && (
                        i.archived
                          ? <button className={iconBtn} title={t.act_unarchive} aria-label={t.act_unarchive} disabled={busy} onClick={() => void setArchived(i.id, false)}><Icon path={UI_ICONS.archive} size={15} /></button>
                          : <button className={iconBtn} title={t.act_archive} aria-label={t.act_archive} disabled={busy} onClick={() => void setArchived(i.id, true)}><Icon path={UI_ICONS.archive} size={15} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
            <div className="flex justify-end gap-2">
              <button className="btn-secondaire text-sm" onClick={() => setArchivePrompt(null)}>{t.no}</button>
              <button className="btn-primaire text-sm" disabled={busy} onClick={async () => { const inc = archivePrompt; setArchivePrompt(null); await setArchived(inc.id, true); }}>{t.yes}</button>
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

/** Modale de détails enrichie (bilan humain, moyens, personnel, véhicules, sous-incidents). */
function DetailsModal({ incident: initial, onClose, onMap, onEdit, onAddSub }: { incident: Incident; onClose: () => void; onMap: (id: string) => void; onEdit: (inc: Incident) => void; onAddSub: (inc: Incident) => void }) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  // Lecture de la version VIVE de l'incident (mise à jour après ajout/retrait
  // d'un sous-incident) ; repli sur l'instantané passé en prop.
  const incident = useArgos((s) => s.incidents.find((i) => i.id === initial.id)) ?? initial;
  const engUnits = units.filter((u) => incident.responders?.units.includes(u.id));
  const engHosps = hospitals.filter((h) => incident.responders?.hospitals.includes(h.id));
  const personnel = engUnits.reduce((n, u) => n + u.eff, 0);
  const amb = engHosps.reduce((n, h) => n + h.amb, 0);
  const heli = engHosps.reduce((n, h) => n + h.heli, 0);
  const hasResp = engUnits.length > 0 || engHosps.length > 0;

  return (
    <Modal open title={`${incident.id} — ${incident.titre}`} onClose={onClose} size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1 border-b border-gray-100 pb-3 dark:border-rdia-700/50">
          <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={() => onMap(incident.id)}><Icon path={UI_ICONS.map} size={14} /> {t.to_map}</button>
          <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={() => onEdit(incident)}><Icon path={UI_ICONS.edit} size={14} /> {t.act_edit}</button>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
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
        <SubIncidentSection incident={incident} onAdd={() => onAddSub(incident)} />
      </div>
    </Modal>
  );
}

/** Section « sous-incidents » de la modale de détails : liste en lecture seule + bouton d'ajout (ouvre une modale SÉPARÉE). */
function SubIncidentSection({ incident, onAdd }: { incident: Incident; onAdd: () => void }) {
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

  const subs = incident.subIncidents ?? [];

  const remove = async (subId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeSubIncident(incident.id, subId);
      await loadDomain();
      showToast(t.si_removed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-gray-100 pt-3 dark:border-rdia-700/50">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
          {t.si_title} ({subs.length})
        </div>
        {canEdit && (
          <button className="btn-secondaire flex items-center gap-1.5 text-xs" onClick={onAdd}>
            <Icon path={UI_ICONS.plus} size={13} /> {t.si_add}
          </button>
        )}
      </div>

      {subs.length === 0 && (
        <div className="text-xs text-gray-400 dark:text-rdia-400">{t.si_none}</div>
      )}

      {subs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {subs.map((s) => {
            const sb = sevBadge(s.sev, t);
            const su = units.filter((u) => s.responders?.units.includes(u.id));
            const sh = hospitals.filter((h) => s.responders?.hospitals.includes(h.id));
            const meta: string[] = [];
            if (s.casualties) meta.push(`${s.casualties.dead} ${t.wz_dead.toLowerCase()} · ${s.casualties.injured} ${t.wz_injured.toLowerCase()} · ${s.casualties.missing} ${t.wz_missing.toLowerCase()}`);
            if (s.ll) meta.push(llTxt(s.ll));
            return (
              <div key={s.id} className="flex flex-col gap-1 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-700/40">
                <div className="flex items-center gap-2">
                  <Badge type={sb.type} label={sb.label} />
                  <span className="text-sm font-medium text-gray-800 dark:text-rdia-50">{subTypeLabel(s.type, subCatalog.types, lang)}</span>
                  {s.note && <span className="truncate text-xs text-gray-500 dark:text-rdia-300">· {s.note}</span>}
                  <span className="ms-auto font-mono text-[11px] text-gray-400 dark:text-rdia-400">{s.time}</span>
                  {canEdit && (
                    <button
                      onClick={() => remove(s.id)}
                      disabled={busy}
                      className="rounded-md p-1 text-gray-400 transition-colors hover:text-danger-500 disabled:opacity-40"
                      aria-label={t.flt_clear}
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
          })}
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

  const numCls = "input-champ text-sm";
  const lblCls = "mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400";
  const chip = (on: boolean) =>
    `rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
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
              <div className="grid max-h-[36vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
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
              <input className="input-champ text-sm" placeholder={t.si_note} value={note} onChange={(e) => setNote(e.target.value)} />
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
          <button className="btn-secondaire text-xs" onClick={() => (step > 1 ? setStep(step - 1) : onClose())}>
            {step > 1 ? t.prev : t.no}
          </button>
          {step < 3 ? (
            <button className="btn-primaire text-xs disabled:opacity-50" onClick={() => setStep(step + 1)} disabled={step === 1 && !type}>{t.next}</button>
          ) : (
            <button className="btn-primaire text-xs disabled:opacity-50" onClick={submit} disabled={!type || busy}>{t.si_add}</button>
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
          <input type="password" className="input-champ text-sm" value={pass} autoFocus onChange={(e) => { setPass(e.target.value); setErr(false); }} onKeyDown={(e) => { if (e.key === "Enter") void confirm(); }} />
          {err && <p className="mt-1 text-xs font-semibold text-danger-500">{t.lg_badpass}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{t.cancel}</button>
          <button className="btn-primaire text-sm" disabled={!pass || busy} onClick={() => void confirm()}>{busy ? "…" : t.confirm}</button>
        </div>
      </div>
    </Modal>
  );
}
