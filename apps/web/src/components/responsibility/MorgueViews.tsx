"use client";

// Vues « Ma responsabilité » pour la MORGUE : tableau de bord + registre DVI.
// Écriture via /morgues/:id[/records], routes cantonnées (@RequireScope("morgue")).
// Les invariants du parcours (identité obligatoire, dossier clos) sont tenus par
// l'API : l'écran les reflète pour éviter de proposer l'impossible.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill, type Tone } from "@/components/ui/Pill";
import { KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass } from "@/lib/responsibility";
import { Loading, useSupervision, RespHeader, Section } from "@/components/responsibility/Shared";

export interface MorgueSite {
  id: string; nom: string; ville: string; capacity: number; staff: number;
  statut: "op" | "partial" | "closed";
}

export const DVI_STATUSES = ["unidentified", "in_progress", "identified", "released"] as const;
export const DVI_SAMPLES = ["dna", "dental", "fingerprint"] as const;
export type DviStatus = (typeof DVI_STATUSES)[number];
export type DviSample = (typeof DVI_SAMPLES)[number];

export interface MortuaryRecord {
  id: string; mid: string; reference: string;
  incidentId?: string; foundAt?: string; sex?: "m" | "f" | "unknown"; ageRange?: string;
  status: DviStatus; samples: DviSample[];
  identifiedAs?: string; releasedTo?: string;
  admittedAt: string; updatedAt: string;
}

const STATUS_TONES: Record<DviStatus, Tone> = {
  unidentified: "red", in_progress: "amber", identified: "blue", released: "green",
};

/** Étapes atteignables — miroir de `dvi.rules.ts` côté API. */
const NEXT: Record<DviStatus, readonly DviStatus[]> = {
  unidentified: ["in_progress", "identified"],
  in_progress: ["identified", "unidentified"],
  identified: ["released", "in_progress"],
  released: [],
};

function useMorgue(mid: string) {
  const [site, setSite] = useState<MorgueSite | null>(null);
  const [records, setRecords] = useState<MortuaryRecord[]>([]);
  const load = useCallback(async () => {
    const [sites, recs] = await Promise.all([api.getMorgues(), api.getMortuaryRecords(mid)]);
    const list = (sites.data ?? []) as unknown as MorgueSite[];
    setSite(list.find((s) => s.id === mid) ?? null);
    setRecords((recs.data ?? []) as unknown as MortuaryRecord[]);
  }, [mid]);
  useEffect(() => {
    void load();
  }, [load]);
  return { site, records, reload: () => void load() };
}

// --- tableau de bord --------------------------------------------------------

export function MorgueDashboard({ mid }: { mid: string }) {
  const m = useModules();
  const supervised = useSupervision();
  const { site, records } = useMorgue(mid);
  if (!site) return <Loading />;

  const open = records.filter((r) => r.status !== "released");
  const byStatus = (s: DviStatus) => records.filter((r) => r.status === s).length;
  const pct = site.capacity > 0 ? Math.round((open.length / site.capacity) * 100) : 0;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader icon={KPI_ICONS.beds} title={site.nom} subtitle={site.ville} badge={m.resp.morgue_statut[site.statut]} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={m.resp.g_places_free} value={site.capacity - open.length} sub={`/ ${site.capacity}`} icon={KPI_ICONS.beds} tint={pct >= 90 ? "danger" : "green"} />
        <StatTile label={m.resp.g_unidentified} value={byStatus("unidentified")} icon={UI_ICONS.shield} tint={byStatus("unidentified") > 0 ? "danger" : "gray"} />
        <StatTile label={m.resp.g_in_progress} value={byStatus("in_progress")} icon={KPI_ICONS.incidents} tint="amber" />
        <StatTile label={m.resp.g_released} value={byStatus("released")} icon={KPI_ICONS.personnel} tint="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title={m.resp.g_occupancy}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700 dark:text-rdia-100">{m.resp.g_bodies_present}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{open.length} / {site.capacity} · {pct} %</span>
          </div>
          <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2.5" />
        </Section>

        <Section title={m.resp.g_progress}>
          {DVI_STATUSES.map((st) => {
            const n = byStatus(st);
            const share = records.length > 0 ? Math.round((n / records.length) * 100) : 0;
            return (
              <div key={st}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 dark:text-rdia-100">{m.resp.dvi_status[st]}</span>
                  <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{n} · {share} %</span>
                </div>
                <ProgressBar value={share} fill="bg-or-500" height="h-2" />
              </div>
            );
          })}
        </Section>
      </div>

      <Section title={m.resp.g_register} count={records.length}>
        {records.length === 0 && <Empty label={m.resp.g_no_record} />}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-gray-200 dark:border-rdia-600">
                <Th>{m.resp.g_reference}</Th><Th>{m.resp.g_status}</Th><Th>{m.resp.g_identity}</Th>
                <Th>{m.resp.g_samples}</Th><Th>{m.resp.g_found_at}</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-rdia-700/50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-rdia-100">{r.reference}</td>
                  <td className="px-3 py-2"><Pill tone={STATUS_TONES[r.status]} label={m.resp.dvi_status[r.status]} /></td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-rdia-100">{r.identifiedAs ?? "—"}</td>
                  <td className="px-3 py-2 text-[10px] text-gray-500 dark:text-rdia-300">
                    {r.samples.length > 0 ? r.samples.map((s) => m.resp.dvi_sample[s]).join(" · ") : "—"}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-gray-500 dark:text-rdia-300">{r.foundAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {!supervised && (
        <div className="flex justify-end">
          <Link href="/ma-responsabilite/gestion" className="btn-primaire flex items-center gap-1.5 text-sm">
            <Icon path={UI_ICONS.edit} size={14} />
            {m.resp.manage}
          </Link>
        </div>
      )}
    </section>
  );
}

// --- gestion ----------------------------------------------------------------

export function MorgueManagement({ mid }: { mid: string }) {
  const m = useModules();
  const { site, records, reload } = useMorgue(mid);
  const showToast = useArgos((s) => s.showToast);
  const [admitting, setAdmitting] = useState(false);
  const [editing, setEditing] = useState<MortuaryRecord | null>(null);
  if (!site) return <Loading />;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <RespHeader back icon={KPI_ICONS.beds} title={m.resp.manage_morgue} subtitle={`${site.nom} — ${site.ville}`} />

      <SiteForm site={site} onSaved={() => { showToast(m.resp.saved); reload(); }} />

      <div className="carte flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.g_register}</h3>
          <button className="btn-primaire flex items-center gap-1.5 text-xs" onClick={() => setAdmitting(true)}>
            <Icon path={UI_ICONS.plus} size={14} />
            {m.resp.g_admit}
          </button>
        </div>

        {records.length === 0 && <Empty label={m.resp.g_no_record} />}
        <div className="flex flex-col gap-2">
          {records.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
              <div className="min-w-0 flex-1" style={{ minWidth: 200 }}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-gray-800 dark:text-rdia-50">{r.reference}</span>
                  <Pill tone={STATUS_TONES[r.status]} label={m.resp.dvi_status[r.status]} />
                </div>
                <div className="mt-0.5 truncate text-[10px] text-gray-400 dark:text-rdia-400">
                  {r.identifiedAs ?? m.resp.g_unknown} · {r.foundAt ?? "—"}
                  {r.releasedTo ? ` · ${m.resp.g_released_to} ${r.releasedTo}` : ""}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-rdia-300" style={{ minWidth: 130 }}>
                {r.samples.length > 0 ? r.samples.map((s) => m.resp.dvi_sample[s]).join(" · ") : "—"}
              </div>
              <button
                title={r.status === "released" ? m.resp.g_closed : m.resp.edit}
                disabled={r.status === "released"}
                onClick={() => setEditing(r)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rdia-600"
              >
                <Icon path={UI_ICONS.edit} size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {admitting && <AdmitForm mid={mid} onClose={() => setAdmitting(false)} onDone={() => { setAdmitting(false); reload(); }} />}
      {editing && <RecordForm mid={mid} record={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />}
    </section>
  );
}

/** Capacité et effectif du site. */
function SiteForm({ site, onSaved }: { site: MorgueSite; onSaved: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const [form, setForm] = useState({ capacity: site.capacity, staff: site.staff, statut: site.statut });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.updateMorgue(site.id, form);
      if (res.error) { showToast(m.resp.err_denied); return; }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  return (
    <div className="carte flex flex-col gap-4 p-5">
      <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.resp.g_site_block}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{m.resp.g_capacity}</label>
          <input className="input-champ font-mono text-sm" type="number" min={0} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
        </div>
        <div>
          <label className={labelCls}>{m.resp.g_staff}</label>
          <input className="input-champ font-mono text-sm" type="number" min={0} value={form.staff} onChange={(e) => setForm((f) => ({ ...f, staff: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
        </div>
        <div>
          <label className={labelCls}>{m.resp.g_status}</label>
          <select className="input-champ text-sm" value={form.statut} onChange={(e) => setForm((f) => ({ ...f, statut: e.target.value as MorgueSite["statut"] }))}>
            {(["op", "partial", "closed"] as const).map((s) => <option key={s} value={s}>{m.resp.morgue_statut[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void save()}>
          {busy ? m.resp.saving : m.resp.save}
        </button>
      </div>
    </div>
  );
}

/** Admission d'un corps sous référence provisoire. */
function AdmitForm({ mid, onClose, onDone }: { mid: string; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const incidents = useArgos((s) => s.incidents);
  const [reference, setReference] = useState("");
  const [incidentId, setIncidentId] = useState("");
  const [foundAt, setFoundAt] = useState("");
  const [sex, setSex] = useState<"m" | "f" | "unknown">("unknown");
  const [ageRange, setAgeRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reference.trim()) { setError(m.resp.g_err_reference); return; }
    setBusy(true);
    try {
      const res = await api.admitBody(mid, {
        reference: reference.trim(),
        incidentId: incidentId || undefined,
        foundAt: foundAt.trim() || undefined,
        sex,
        ageRange: ageRange.trim() || undefined,
      });
      if (res.error) { showToast(m.resp.err_denied); return; }
      showToast(m.resp.g_admitted);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  return (
    <Modal open onClose={onClose} title={m.resp.g_admit}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.resp.g_reference}</label>
            <input className="input-champ font-mono text-sm" placeholder={m.resp.g_reference_ph} value={reference} onChange={(e) => { setReference(e.target.value); setError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.g_incident}</label>
            <select className="input-champ text-sm" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
              <option value="">{m.resp.g_incident_none}</option>
              {incidents.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.id} — {i.titre}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>{m.resp.g_found_at}</label>
            <input className="input-champ text-sm" placeholder={m.resp.g_found_at_ph} value={foundAt} onChange={(e) => setFoundAt(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{m.resp.g_sex}</label>
            <select className="input-champ text-sm" value={sex} onChange={(e) => setSex(e.target.value as "m" | "f" | "unknown")}>
              {(["unknown", "m", "f"] as const).map((s) => <option key={s} value={s}>{m.resp.dvi_sex[s]}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>{m.resp.g_age}</label>
            <input className="input-champ text-sm" placeholder="40-55" value={ageRange} onChange={(e) => setAgeRange(e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-rdia-400">{m.resp.g_admit_hint}</p>
        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.resp.g_admit_btn}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Évolution d'un dossier : étape, prélèvements, identité, restitution. */
function RecordForm({ mid, record, onClose, onDone }: { mid: string; record: MortuaryRecord; onClose: () => void; onDone: () => void }) {
  const m = useModules();
  const showToast = useArgos((s) => s.showToast);
  const [status, setStatus] = useState<DviStatus>(record.status);
  const [samples, setSamples] = useState<DviSample[]>(record.samples);
  const [identifiedAs, setIdentifiedAs] = useState(record.identifiedAs ?? "");
  const [releasedTo, setReleasedTo] = useState(record.releasedTo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleSample = (s: DviSample) =>
    setSamples((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const submit = async () => {
    // Miroir des invariants API — l'API reste l'autorité (409 sinon).
    if ((status === "identified" || status === "released") && !identifiedAs.trim()) { setError(m.resp.g_err_identity); return; }
    if (status === "released" && !releasedTo.trim()) { setError(m.resp.g_err_released); return; }
    setBusy(true);
    try {
      const res = await api.updateMortuaryRecord(mid, record.id, {
        status, samples,
        identifiedAs: identifiedAs.trim() || undefined,
        releasedTo: releasedTo.trim() || undefined,
      });
      // Lire le code AVANT de restreindre le type sur `res.error`.
      const code = res.response?.status;
      if (res.error || (code !== undefined && code >= 400)) {
        // 409 = invariant DVI refusé par le serveur ; 403 = hors périmètre.
        setError(code === 409 ? m.resp.g_err_transition : m.resp.err_denied);
        return;
      }
      showToast(m.resp.g_record_saved);
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const options: DviStatus[] = [record.status, ...NEXT[record.status]];
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <Modal open onClose={onClose} title={`${m.resp.g_record} ${record.reference}`}>
      <div className="flex flex-col gap-4">
        <div>
          <label className={labelCls}>{m.resp.g_status}</label>
          <select className="input-champ text-sm" value={status} onChange={(e) => { setStatus(e.target.value as DviStatus); setError(null); }}>
            {options.map((s) => <option key={s} value={s}>{m.resp.dvi_status[s]}</option>)}
          </select>
        </div>

        <div>
          <label className={labelCls}>{m.resp.g_samples}</label>
          <div className="flex flex-wrap gap-2">
            {DVI_SAMPLES.map((s) => {
              const on = samples.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSample(s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${on ? "border-or-500 bg-or-500/10 text-or-600 dark:text-or-400" : "border-gray-200 text-gray-500 hover:border-or-500/50 dark:border-rdia-600 dark:text-rdia-300"}`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-sm border ${on ? "border-or-500 bg-or-500 text-white" : "border-gray-300 dark:border-rdia-500"}`}>
                    {on && <Icon path={UI_ICONS.check} size={10} strokeWidth={3} />}
                  </span>
                  {m.resp.dvi_sample[s]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>{m.resp.g_identity}</label>
          <input className="input-champ text-sm" placeholder={m.resp.g_identity_ph} value={identifiedAs} onChange={(e) => { setIdentifiedAs(e.target.value); setError(null); }} />
        </div>

        {status === "released" && (
          <div>
            <label className={labelCls}>{m.resp.g_released_field}</label>
            <input className="input-champ text-sm" placeholder={m.resp.g_released_ph} value={releasedTo} onChange={(e) => { setReleasedTo(e.target.value); setError(null); }} />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-rdia-400">{m.resp.g_released_hint}</p>
          </div>
        )}

        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondaire text-sm" onClick={onClose}>{m.resp.cancel}</button>
          <button className="btn-primaire text-sm disabled:opacity-60" disabled={busy} onClick={() => void submit()}>
            {busy ? m.resp.saving : m.resp.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{children}</th>;
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">
      {label}
    </div>
  );
}
