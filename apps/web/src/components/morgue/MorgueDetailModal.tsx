"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Pill, type Tone } from "@/components/ui/Pill";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { loadBarClass } from "@/lib/responsibility";
import { levelOf, presentBodies, sortRegistry } from "@/lib/morgue";
import { personName, whenShort } from "@/lib/victims";
import { STATUS_TONES } from "@/components/responsibility/MorgueViews";
import { IdentifyModal } from "@/components/morgue/IdentifyModal";
import { RecordDetailModal } from "@/components/morgue/RecordDetailModal";
import { TransferModal } from "@/components/morgue/TransferModal";
import { ResponsibleCard } from "@/components/responsibility/ResponsibleCard";
import type { MorgueSite, MorgueStatus, MortuaryRecord } from "@/lib/types";

// ============================================================================
// La fiche complète d'une morgue : nom, identifiant, type (champ mortuaire,
// morgue temporaire, morgue hospitalière, camion réfrigéré), statut
// (opérationnel, non opérationnel, plein — à capacité atteinte), capacité
// totale, localisation (région, province, ville, position), rattachement ;
// puis ses corps, chacun avec sa fiche de présentation et l'heure du décès
// si elle est connue, sinon « non connue ». Les actions du site sont là :
// réceptionner, identifier, transférer, voir la chaîne de garde.
// ============================================================================

export const MORGUE_STATUS_TONE: Record<MorgueStatus, Tone> = { op: "green", partial: "amber", closed: "gray", full: "red" };

export function MorgueDetailModal({
  site, records, onClose, onChanged,
}: {
  site: MorgueSite;
  records: readonly MortuaryRecord[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const m = useModules();
  const router = useRouter();
  const role = useArgos((s) => s.role);
  const hospitals = useArgos((s) => s.hospitals);
  const morgues = useArgos((s) => s.morgues);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const showToast = useArgos((s) => s.showToast);
  const [detail, setDetail] = useState<MortuaryRecord | null>(null);
  const [identifying, setIdentifying] = useState<MortuaryRecord | null>(null);
  const [transferring, setTransferring] = useState<MortuaryRecord | null>(null);

  const canWrite = role === "superadmin" || role === "admin" || role === "resp_morgue";
  const corps = sortRegistry(records.filter((r) => r.mid === site.id));
  const presents = presentBodies(site, records);
  const pct = site.capacity > 0 ? Math.round((presents / site.capacity) * 100) : 0;
  const echelon = levelOf(site);
  const hosp = site.hospitalId ? hospitals.find((h) => h.id === site.hospitalId) : undefined;
  const statutLabel = m.resp.morgue_statut[site.statut] ?? site.statut;
  const typeLabel = site.type ? m.morgue.types[site.type] : echelon === "mobile" ? m.morgue.types.truck : m.morgue.types.temporary;

  const receptionner = async (r: MortuaryRecord) => {
    const res = await api.receiveBody(site.id, r.id);
    const code = res.response?.status;
    if (res.error || (code !== undefined && code >= 400)) {
      showToast(code === 409 ? `${m.morgue.err_conflict} ${(res.error as { message?: string } | undefined)?.message ?? ""}` : m.morgue.err_denied);
      return;
    }
    showToast(m.morgue.received);
    onChanged();
  };

  const champ = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
      <dd className="truncate text-[13px] text-gray-800 dark:text-rdia-50">{value}</dd>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={site.nom} size="xl">
      <div className="flex flex-col gap-4">
        {/* --- la fiche du site ----------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={MORGUE_STATUS_TONE[site.statut]} label={statutLabel} size="sm" />
          <Pill tone={echelon === "mobile" ? "amber" : echelon === "regional" ? "gold" : "gray"} label={echelon === "mobile" ? m.morgue.level_mobile : echelon === "regional" ? m.morgue.level_regional : m.morgue.level_city} size="sm" />
          <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{site.id}</span>
          {site.ll && (
            <button type="button" onClick={() => { setMapCenter(site.ll!, 12, site.nom); router.push("/map"); }} className="ms-auto cible-tactile flex items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-or-500 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-200">
              <Icon path={NAV_ICONS.map} size={12} />
              {m.morgue.map}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {champ(m.morgue.f_type, typeLabel)}
          {champ(m.morgue.f_capacity, `${site.capacity} · ${presents} ${m.morgue.f_present}`)}
          {champ(m.resp.g_staff, String(site.staff))}
          {champ(m.morgue.f_location, [site.ville, site.province && site.province !== site.ville ? site.province : null, site.region].filter(Boolean).join(" · "))}
          {champ(m.morgue.f_position, site.ll ? `${site.ll[1].toFixed(4)}, ${site.ll[0].toFixed(4)}` : "—")}
          {champ(m.morgue.attached, hosp ? hosp.nom : m.morgue.not_attached)}
          {site.deployment && champ(m.morgue.d_site, `${site.deployment.site}${site.deployment.incidentId ? ` · ${site.deployment.incidentId}` : ""}`)}
          {site.code && champ(m.morgue.f_code, site.code)}
        </dl>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-gray-700 dark:text-rdia-100">{m.morgue.present}</span>
            <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{presents} / {site.capacity} · {pct} %</span>
          </div>
          <ProgressBar value={pct} fill={loadBarClass(pct)} height="h-2" />
          {site.statut === "full" && <p className="mt-1 text-[11px] font-semibold text-danger-500">{m.morgue.full_hint}</p>}
        </div>
        {/* Qui tient le site — son responsable, en ligne ou non, joignable. Sans responsable affecté, la carte le dit. */}
        <ResponsibleCard kind="morgue" entityId={site.id} />

        {/* --- les corps : une fiche de présentation par dossier ------------------ */}
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.morgue.bodies}</h3>
          <span className="font-mono text-[11px] text-gray-400 dark:text-rdia-400">{corps.length}</span>
        </div>
        {corps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-[11px] text-gray-400 dark:border-rdia-700 dark:text-rdia-400">{m.morgue.no_record}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {corps.map((r) => {
              const nom = personName(r) ?? r.identifiedAs ?? m.victims.unidentified;
              return (
                <li key={r.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-gray-100 p-3 dark:border-rdia-700/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-xs font-semibold text-gray-800 dark:text-rdia-50">{r.reference}</span>
                      <Pill tone={STATUS_TONES[r.status]} label={m.resp.dvi_status[r.status]} size="sm" />
                      {r.pendingReceipt && <Pill tone="amber" label={m.morgue.pending_badge} size="sm" />}
                    </div>
                    <div className={`mt-0.5 text-[13px] ${personName(r) || r.identifiedAs ? "font-semibold text-gray-800 dark:text-rdia-50" : "italic text-gray-500 dark:text-rdia-300"}`}>{nom}</div>
                    <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600 sm:grid-cols-4 dark:text-rdia-200">
                      <div><dt className="text-gray-400 dark:text-rdia-400">{m.victims.death_at}</dt><dd>{whenShort(r.deathAt) ?? m.victims.time_unknown}</dd></div>
                      <div><dt className="text-gray-400 dark:text-rdia-400">{m.resp.g_sex}</dt><dd>{m.resp.dvi_sex[r.sex ?? "unknown"]}</dd></div>
                      <div><dt className="text-gray-400 dark:text-rdia-400">{m.victims.f_age}</dt><dd>{r.age !== undefined ? `${r.age} ${m.victims.years}` : r.ageRange ?? m.victims.age_unknown}</dd></div>
                      <div><dt className="text-gray-400 dark:text-rdia-400">{m.victims.f_cni}</dt><dd className="font-mono">{r.cni ?? "—"}</dd></div>
                      <div className="col-span-2"><dt className="text-gray-400 dark:text-rdia-400">{m.morgue.col_origin}</dt><dd className="truncate">{r.origin ? (r.origin.kind === "hospital" ? `${m.morgue.origin_hospital} · ${r.origin.label}` : `${m.morgue.origin_field}${r.origin.label ? ` · ${r.origin.label}` : ""}`) : (r.foundAt ?? "—")}{r.incidentId ? ` · ${r.incidentId}` : ""}</dd></div>
                      <div className="col-span-2"><dt className="text-gray-400 dark:text-rdia-400">{m.morgue.id_method}</dt><dd>{r.idMethod ? `${m.morgue.id_methods[r.idMethod]} · ${whenShort(r.identifiedAt) ?? ""} · ${r.identifiedBy ?? ""}` : m.morgue.id_none}</dd></div>
                    </dl>
                    {r.note && <div className="mt-0.5 text-[11px] italic text-gray-400 dark:text-rdia-400">{r.note}</div>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <button type="button" title={m.morgue.detail} aria-label={`${m.morgue.detail} — ${r.reference}`} onClick={() => setDetail(r)} className="cible-tactile flex items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
                      <Icon path={UI_ICONS.info} size={15} />
                    </button>
                    {canWrite && r.pendingReceipt && (
                      <button type="button" onClick={() => void receptionner(r)} className="cible-tactile rounded-lg bg-or-500 px-2 py-1 text-[11px] font-bold text-rdia-900 hover:bg-or-400">{m.morgue.receive}</button>
                    )}
                    {canWrite && !r.pendingReceipt && r.status !== "released" && (
                      <button type="button" onClick={() => setIdentifying(r)} className="cible-tactile rounded-lg border border-or-500 px-2 py-1 text-[11px] font-semibold text-or-600 hover:bg-or-500/10 dark:text-or-400">{m.morgue.identify}</button>
                    )}
                    {canWrite && !r.pendingReceipt && r.status !== "released" && (
                      <button type="button" onClick={() => setTransferring(r)} className="cible-tactile rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:border-or-500 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-200">{m.morgue.transfer}</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {detail && <RecordDetailModal record={detail} sites={morgues} onClose={() => setDetail(null)} />}
      {identifying && <IdentifyModal record={identifying} onClose={() => setIdentifying(null)} onDone={() => { setIdentifying(null); onChanged(); }} />}
      {transferring && <TransferModal record={transferring} sites={morgues} records={records} onClose={() => setTransferring(null)} onDone={() => { setTransferring(null); onChanged(); }} />}
    </Modal>
  );
}
