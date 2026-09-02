"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { sevBadge, stBadge, typeLabel, hazardLabel} from "@/lib/helpers";
import type { Incident, WeatherForecast } from "@/lib/types";
import { predictIncidentEvolution, type IncidentEvolution } from "@/lib/ai/risk/incidentEvolution";
import { IncidentEvolutionCard } from "@/components/incidents/IncidentEvolutionCard";
import { DeployedPosts } from "@/components/incidents/DeployedPosts";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { FAMILY_PICTOGRAM } from "@/lib/hazard/pictograms";
import {
  llTxt,
  } from "@/app/incidents/_parts/shared";
import { Detail } from "@/app/incidents/_parts/Detail";
import { SubIncidentSection } from "@/app/incidents/_parts/SubIncidentSection";

/** Modale de détails enrichie (bilan humain, moyens, personnel, véhicules, sous-incidents + IA évolution). */
export function DetailsModal({ incident: initial, onClose, onMap, onEdit, onAddSub }: { incident: Incident; onClose: () => void; onMap: (id: string) => void; onEdit: (inc: Incident) => void; onAddSub: (inc: Incident) => void }) {
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
