"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/ui/StatTile";
import { UI_ICONS } from "@/lib/icons";
import { DeployedPosts } from "@/components/incidents/DeployedPosts";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { FAMILY_PICTOGRAM } from "@/lib/hazard/pictograms";
import { subTypeLabel, typeLabel, hazardLabel} from "@/lib/helpers";

// ============================================================================
// Tableau de bord d'UNE opération (lot V-3)
//
// Le tableau de bord national répond à « comment va le pays ? ». Sur une
// opération en cours, ce n'est pas la question. Un OPCOM qui prend son poste
// veut savoir : quel est le bilan, qui est engagé, qu'est-ce qui est en vol,
// et que s'est-il passé depuis.
//
// TOUT VIENT DE L'API. L'agrégat est calculé côté serveur, et la route est
// gardée par la portée du compte (`canSeeIncident`) : reconstruire ces chiffres
// dans le navigateur aurait été plus simple, mais n'aurait rien gardé du tout —
// il aurait suffi d'un identifiant deviné.
//
// Un 404 n'est donc PAS une erreur technique ici : c'est une opération hors
// périmètre. On le dit dans ces termes, plutôt que d'afficher « introuvable »
// et de laisser l'officier croire à une panne.
// ============================================================================

interface Dash {
  incident: {
    id: string;
    nrbc?: { family: string };
    titre: string;
    type: string;
    region: string;
    sev: string;
    st: string;
    time: string;
    adresse?: string;
    desc?: string;
  };
  casualties: { dead: number; injured: number; missing: number; total: number };
  engagement: {
    units: { id: string; nom: string; eff: number; dispo: string; readiness: number }[];
    hospitals: { id: string; nom: string; lits: number; occ: number; reserved: number; libres: number; saturation: number }[];
    personnel: number;
    ambulances: number;
    helicopteres: number;
  };
  missions: {
    total: number;
    open: number;
    byState: Record<string, number>;
    byKind: Record<string, number>;
    latest: { id: string; kind: string; state: string; label: string; issuedAt: string }[];
  };
  subIncidents: { id: string; type: string; note?: string; time: string }[];
  timeline: { time: string; c: string; txt: string }[];
}

/** Panneau au même gabarit que les tuiles du tableau de bord national. */
function Tile({ title, icon, badge, className = "", children }: { title: string; icon: string; badge?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`carte flex min-h-0 flex-col ${className}`}>
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-rdia-700/50 sm:px-5">
        <h3 className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-rdia-600 dark:text-rdia-50">
          <Icon path={icon} size={14} className="shrink-0 text-or-500" />
          {title}
        </h3>
        {badge}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">{children}</div>
    </div>
  );
}

const SEV_TINT: Record<string, string> = {
  high: "bg-danger-500/15 text-danger-500",
  medium: "bg-or-500/15 text-or-600 dark:text-or-400",
  low: "bg-green-500/10 text-green-600",
};

export default function IncidentDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  // Les SOUS-types ont leur propre catalogue. Les libeller avec celui des
  // incidents ne rendait un intitulé que pour les rares clés présentes dans les
  // deux — les autres s'affichaient en identifiant brut (« road_cut »).
  const subCatalog = useArgos((s) => s.subCatalog);

  const [dash, setDash] = useState<Dash | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await api.getIncidentDashboard(id);
      if (!alive) return;
      // L'API renvoie 404 aussi bien pour « inconnu » que pour « hors portée » —
      // délibérément : distinguer les deux apprendrait qu'une opération existe.
      if (error || !data) setDenied(true);
      else setDash(data as unknown as Dash);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  if (denied) {
    return (
      <section className="flex flex-col items-center justify-center gap-3 py-20 text-center animate-fade-in">
        <Icon path={UI_ICONS.shield} size={32} className="text-gray-300 dark:text-rdia-600" />
        <p className="text-sm text-gray-500 dark:text-rdia-300">{t.idash_denied}</p>
        <button className="btn-secondaire cible-tactile text-xs" onClick={() => router.push("/incidents")}>
          {t.idash_back}
        </button>
      </section>
    );
  }

  if (!dash) {
    return <p className="py-20 text-center text-sm text-gray-400 dark:text-rdia-400">{t.idash_loading}</p>;
  }

  const i = dash.incident;
  const stateLabel: Record<string, string> = {
    issued: t.ms_state_issued,
    accepted: t.ms_state_accepted,
    in_progress: t.ms_state_progress,
    declined: t.ms_state_declined,
    completed: t.ms_state_completed,
    cancelled: t.ms_state_cancelled,
  };

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* --- en-tête : ce qu'est l'opération ---------------------------- */}
      <header className="carte flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-gray-400 dark:text-rdia-400">{i.id}</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${SEV_TINT[i.sev] ?? SEV_TINT.low}`}>
              {i.sev === "high" ? t.sev_high : i.sev === "medium" ? t.sev_med : t.sev_low}
            </span>
            <span className="rounded-md bg-rdia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rdia-500 dark:text-rdia-200">
              {typeLabel(i.type, incidentTypes, lang)}
            </span>
            {/* La nature du danger décide des distances d'isolement et de la
                tenue : elle appartient à l'en-tête, pas à un volet plus bas. */}
            {i.nrbc && <HazardIcon kind={FAMILY_PICTOGRAM[i.nrbc.family]} size={26} label={hazardLabel(FAMILY_PICTOGRAM[i.nrbc.family], t)} />}
          </div>
          <h1 className="truncate text-lg font-bold text-rdia-600 dark:text-rdia-50">{i.titre}</h1>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">
            {i.region}
            {i.adresse ? ` · ${i.adresse}` : ""} · {i.time}
          </p>
        </div>
        <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-xs" onClick={() => router.push("/incidents")}>
          <Icon path={UI_ICONS.arrowLeft} size={14} /> {t.idash_back}
        </button>
      </header>

      {/* --- les chiffres qui décident ---------------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label={t.wz_dead} value={dash.casualties.dead} icon={UI_ICONS.alert} tint="danger" />
        <StatTile label={t.wz_injured} value={dash.casualties.injured} icon={UI_ICONS.hospitals} tint="amber" />
        <StatTile label={t.wz_missing} value={dash.casualties.missing} icon={UI_ICONS.users} tint="gray" />
        <StatTile label={t.det_personnel} value={dash.engagement.personnel} icon={UI_ICONS.shield} tint="blue" />
        <StatTile
          label={t.idash_loops}
          value={dash.missions.total}
          icon={UI_ICONS.send}
          tint="or"
          sub={`${dash.missions.open} ${t.idash_open_count}`}
        />
      </div>

      {/* --- la prose : le seul récit de la fiche ------------------------ */}
      {i.desc && (
        <Tile title={t.idash_situation} icon={UI_ICONS.hash}>
          <p className="whitespace-pre-line text-xs leading-relaxed text-gray-700 dark:text-rdia-100">{i.desc}</p>
        </Tile>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- moyens engagés ------------------------------------------- */}
        <Tile
          title={t.idash_engagement}
          icon={UI_ICONS.shield}
          badge={
            <span className="shrink-0 text-[10.5px] text-gray-400 dark:text-rdia-400">
              {dash.engagement.ambulances} {t.lbl_amb.toLowerCase()} · {dash.engagement.helicopteres} {t.lbl_heli.toLowerCase()}
            </span>
          }
          className="min-h-[220px]"
        >
          {dash.engagement.units.length + dash.engagement.hospitals.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-rdia-300">—</p>
          ) : (
            <div className="flex flex-col gap-3">
              {dash.engagement.units.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    {t.idash_units}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {dash.engagement.units.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-900/40">
                        <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-100">{u.nom}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-gray-500 dark:text-rdia-300">
                          {u.eff} · {u.readiness}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dash.engagement.hospitals.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                    {t.idash_hospitals}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {dash.engagement.hospitals.map((h) => (
                      <li key={h.id} className="rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-900/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-100">{h.nom}</span>
                          <span className="shrink-0 text-[10.5px] tabular-nums text-gray-500 dark:text-rdia-300">
                            {h.libres} {t.idash_beds_free.toLowerCase()}
                            {/* Les lits réservés par une EVASAN acceptée ne sont
                                pas libres : les taire ferait viser deux
                                transferts sur le même lit. */}
                            {h.reserved > 0 ? ` · ${h.reserved} ${t.idash_reserved}` : ""}
                          </span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200 dark:bg-rdia-700">
                          <div
                            className={`h-full rounded-full ${h.saturation >= 90 ? "bg-danger-500" : h.saturation >= 70 ? "bg-or-500" : "bg-green-500"}`}
                            style={{ width: `${Math.min(100, h.saturation)}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Tile>

        {/* --- boucles opérationnelles ---------------------------------- */}
        <Tile
          title={t.idash_loops}
          icon={UI_ICONS.send}
          badge={
            dash.missions.total > 0 ? (
              <span className="shrink-0 rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold text-or-500">
                {dash.missions.open} {t.idash_open_count}
              </span>
            ) : undefined
          }
          className="min-h-[220px]"
        >
          {dash.missions.latest.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-rdia-300">{t.idash_loops_none}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {dash.missions.latest.map((ms) => (
                <li key={ms.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-900/40">
                  <div className="min-w-0">
                    <span className="mr-1.5 text-[10px] font-bold tracking-wider text-gray-400 dark:text-rdia-400">{ms.id}</span>
                    <span className="text-xs text-gray-800 dark:text-rdia-100">{ms.label}</span>
                  </div>
                  <span className="shrink-0 rounded-md bg-rdia-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rdia-500 dark:text-rdia-200">
                    {stateLabel[ms.state] ?? ms.state}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        {/* --- qui conduit (V-2) ---------------------------------------- */}
        <DeployedPosts incidentId={i.id} />

        {/* --- le fil de CETTE opération -------------------------------- */}
        <Tile title={t.idash_timeline} icon={UI_ICONS.hash} className="max-h-[340px]">
          {dash.timeline.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-rdia-300">{t.idash_timeline_none}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {dash.timeline.map((f, k) => (
                <li key={`${f.time}-${k}`} className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${f.c}`} />
                  <span className="shrink-0 text-[10.5px] tabular-nums text-gray-400 dark:text-rdia-400">{f.time}</span>
                  <span className="text-xs leading-snug text-gray-700 dark:text-rdia-100">{f.txt}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>

      {/* --- sous-incidents ------------------------------------------- */}
      {dash.subIncidents.length > 0 && (
        <Tile title={`${t.si_title} (${dash.subIncidents.length})`} icon={UI_ICONS.alert}>
          <ul className="flex flex-col gap-1">
            {dash.subIncidents.map((sub) => (
              <li key={sub.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-900/40">
                <span className="truncate text-xs text-gray-800 dark:text-rdia-100">
                  {subTypeLabel(sub.type, subCatalog.types, lang)}
                  {sub.note ? ` — ${sub.note}` : ""}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-gray-400 dark:text-rdia-400">{sub.time}</span>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </section>
  );
}
