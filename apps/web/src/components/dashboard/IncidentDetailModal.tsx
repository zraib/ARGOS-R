// ============================================================================
// Modale détaillée d'1 incident ARGOS (tableau de bord SA)
// ----------------------------------------------------------------------------
// Uniquement déclenchée par clic sur une ligne d'incident (SA panel) ou une
// barre du graphique « Répartition par type ». Affiche :
//   · En-tête (type · sévérité · statut · région · date · coordonnées)
//   · Titre + description si disponible
//   · Bilan humain (décès · blessés · disparus)
//   · Localisation (region · ville · adresse · lng/lat)
//   · Intervenants rattachés (unités · hôpitaux)
//   · Sous-incidents (aléas secondaires)
//   · Boutons action : « Voir sur la carte » (setIncidentFocus) + « Fermer »
// ============================================================================

"use client";

import { useMemo } from "react";
import { hospId } from "@/lib/hospitals";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Icon as IcoUI } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useArgos, useDict } from "@/lib/store";
import { sevBadge, stBadge, typeIcon, typeLabel } from "@/lib/helpers";
import { casualtyKind, formatIncidentTime } from "@/lib/derive";
import type { Incident, Lang, Severity, IncidentStatus, SubIncident, SubIncidentTypeDef } from "@/lib/types";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sevPill(sev: Severity, t: ReturnType<typeof useDict>) {
  const s = sevBadge(sev, t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        s.type === "high"
          ? "bg-danger-500/[0.10] text-danger-600 dark:text-danger-400"
          : s.type === "medium"
          ? "bg-or-500/[0.10] text-or-600 dark:text-or-400"
          : "bg-green-500/[0.10] text-green-700 dark:text-green-400",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          s.type === "high" ? "bg-danger-500" : s.type === "medium" ? "bg-or-500" : "bg-green-500",
        )}
      />
      {s.label}
    </span>
  );
}

function stPill(st: IncidentStatus, t: ReturnType<typeof useDict>) {
  const s = stBadge(st, t);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        s.type === "completed"
          ? "border-green-500/20 bg-green-500/[0.06] text-green-700 dark:text-green-400"
          : s.type === "active"
          ? "border-rdia-500/20 bg-rdia-500/[0.08] text-rdia-600 dark:text-rdia-300"
          : "border-or-500/20 bg-or-500/[0.06] text-or-600 dark:text-or-400",
      )}
    >
      {s.label}
    </span>
  );
}

interface Props {
  open: boolean;
  incident: Incident | null;
  onClose: () => void;
}

export function IncidentDetailModal({ open, incident, onClose }: Props) {
  const router = useRouter();
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const incidentTypes = useArgos((s) => s.incidentTypes) ?? [];
  const subCatalog = useArgos((s) => s.subCatalog) ?? [];
  const units = useArgos((s) => s.units) ?? [];
  const hospitals = useArgos((s) => s.hospitals) ?? [];
  const fieldHosps = useArgos((s) => s.fieldHosps) ?? [];
  const setIncidentFocus = useArgos((s) => s.focusIncident);

  const typeName = useMemo(
    () => (incident ? typeLabel(incident.type, incidentTypes, lang as Lang) : ""),
    [incident, incidentTypes, lang],
  );
  const typeIconPath = useMemo(
    () => (incident ? typeIcon(incident.type, incidentTypes) : UI_ICONS.alert),
    [incident, incidentTypes],
  );

  if (!incident) return null;

  const dead = incident.casualties?.dead ?? 0;
  const missing = incident.casualties?.missing ?? 0;
  const rescued = incident.casualties?.rescued ?? 0;
  const injuredRaw = incident.casualties?.injured ?? 0;
  const kind = casualtyKind(incident.type); // trauma | epidemic | hazmat

  // — Alias sémantiques (même logique que aggregateCasualties)
  // Règle : un nombre saisi "injured" sur un formulaire CBRN/NRBC/ÉPIDÉMIE
  // correspond sémantiquement pas à des "blessés" mais contaminés/infectés.
  // → S'il y a un champ explicite, on le prend. Sinon alias injured→sémantique
  const infectedExplicit = incident.casualties?.infected ?? 0;
  const contaminatedExplicit = incident.casualties?.contaminated ?? 0;
  const exposedExplicit = incident.casualties?.exposed ?? 0;

  let infected = infectedExplicit;
  let contaminated = contaminatedExplicit;
  let exposed = exposedExplicit;

  if (kind === "epidemic" && infected === 0 && injuredRaw > 0) {
    infected = injuredRaw;
  }
  if (kind === "hazmat") {
    if (contaminated === 0 && injuredRaw > 0) contaminated = injuredRaw;
    if (exposed === 0 && contaminated === 0 && injuredRaw > 0) exposed = injuredRaw;
  }

  // Victime sémantiquement "primaire" pour Total affiché & affichage KPI #2
  const semanticVictim =
    kind === "epidemic"
      ? infected
      : kind === "hazmat"
        ? contaminated > 0
          ? contaminated
          : exposed
        : injuredRaw;

  // — Build liste KPI humain (ordre Décès → primaire → autres >0 puis Disparus/Secourus)
  type KpiLine = { label: string; value: number; tint: "danger" | "or" | "rdia" | "purple" | "pink" | "indigo" | "green" | "blue" | "slate" };
  const kpis: KpiLine[] = [];
  const pushKpi = (label: string, value: number, tint: KpiLine["tint"]) => kpis.push({ label, value, tint });
  pushKpi("Décès", dead, "danger");

  if (kind === "epidemic") {
    if (infected > 0) pushKpi("Infectés", infected, "pink");
    if (injuredRaw > 0 && injuredRaw !== infected) pushKpi("Blessés", injuredRaw, "or");
  } else if (kind === "hazmat") {
    if (contaminated > 0) pushKpi("Contaminés", contaminated, "purple");
    if (exposed > 0 && exposed !== contaminated) pushKpi("Exposés", exposed, "indigo");
    if (injuredRaw > 0 && injuredRaw !== contaminated && injuredRaw !== exposed) pushKpi("Blessés", injuredRaw, "or");
  } else {
    if (injuredRaw > 0) pushKpi("Blessés", injuredRaw, "or");
  }

  if (missing > 0) pushKpi("Disparus", missing, "slate");
  if (rescued > 0) pushKpi("Secourus", rescued, "green");
  if (kpis.length < 4) pushKpi("Total", dead + semanticVictim + missing, "rdia");
  // Limiter 4 KPIs (grille md:grid-cols-4)
  const finalKpis = kpis.slice(0, 4);
  // Si le Total n'est pas le 4e slot on l'ajoute en 5 (on le force 5 ? Non — max 4 → on le remplace le 4 si le Total est dedans)
  // On préfère : si length>4 garder 4 indicateurs distincts, et on ajoute une ligne chips si besoin :
  // Total = dead + semanticVictim + missing (valeur affichée en grand (même si pas dans les 4)
  const totalValue = dead + semanticVictim + missing;

  const attachedUnits = (incident.responders?.units ?? [])
    .map((id) => (units ?? []).find((u) => u.id === id))
    .filter(Boolean) as NonNullable<(typeof units)[number]>[];
  const attachedHosps = (incident.responders?.hospitals ?? [])
    .map(
      (id) =>
        (hospitals ?? []).find((h) => h.id === id) ??
        (fieldHosps ?? []).find((h) => h.hid === id),
    )
    .filter(Boolean) as Array<NonNullable<(typeof hospitals)[number]> | NonNullable<(typeof fieldHosps)[number]>>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Incident · ${typeName}`}
    >
      <div className="flex flex-col gap-3 text-[12px] text-gray-800 dark:text-rdia-100">
        {/* ==== HEADER ==== */}
        <div className="flex flex-wrap items-start gap-2.5 rounded-xl border border-gray-200 bg-white/70 p-3 dark:border-rdia-600 dark:bg-rdia-700/70">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-rdia-600 dark:border-rdia-500 dark:bg-rdia-800 dark:text-rdia-200">
            <IcoUI path={typeIconPath} size={18} strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-gray-700 dark:border-rdia-600 dark:bg-rdia-800 dark:text-rdia-200">
                {typeName}
              </span>
              {sevPill(incident.sev, t)}
              {stPill(incident.st, t)}
            </div>
            <h2 className="truncate text-[14px] font-extrabold leading-tight text-gray-900 dark:text-white">
              {incident.titre}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 dark:text-rdia-300/90">
              <span className="inline-flex items-center gap-1">
                <IcoUI path={UI_ICONS.map} size={11} />
                {incident.region}
              </span>
              <span className="inline-flex items-center gap-1">
                <IcoUI path={UI_ICONS.clock} size={11} />
                {formatIncidentTime(incident)}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                [ {incident.ll[0].toFixed(4)} , {incident.ll[1].toFixed(4)} ]
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIncidentFocus({ ...incident });
              onClose();
              router.push("/map");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rdia-500/20 bg-rdia-50/80 px-2.5 py-1.5 text-[11px] font-bold text-rdia-700 transition hover:border-rdia-500/40 hover:bg-rdia-50 dark:bg-rdia-800 dark:text-rdia-200 dark:hover:bg-rdia-700"
          >
            <IcoUI path={UI_ICONS.map} size={12} />
            Voir sur la carte
          </button>
        </div>

        {/* ==== GRILLE 4 KPIs ==== */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {finalKpis.map((k, idx) => (
            <Kpi
              key={`${k.label}-${idx}`}
              label={k.label}
              value={String(k.value)}
              tint={k.tint}
            />
          ))}
          {finalKpis.length === 0 && (
            <Kpi label="Bilan" value="0" tint="rdia" />
          )}
        </div>
        {/* Complément si plus de 4 dimensions : Total affiché en ligne chips */}
        {kpis.length > 4 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white/60 p-2.5 dark:border-rdia-600 dark:bg-rdia-700/60">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-rdia-400">Total bilan humain</span>
            <span className="tabular-nums text-[13px] font-extrabold text-gray-900 dark:text-white">{totalValue}</span>
            {kpis.slice(4).map((k, idx) => (
              <span
                key={`${k.label}-extra-${idx}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  k.tint === "pink" && "border-pink-500/30 bg-pink-500/10 text-pink-700 dark:text-pink-300",
                  k.tint === "purple" && "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
                  k.tint === "indigo" && "border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
                  k.tint === "green" && "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
                  k.tint === "slate" && "border-gray-500/30 bg-gray-500/10 text-gray-700 dark:text-gray-300",
                  k.tint === "or" && "border-or-500/30 bg-or-500/10 text-or-600 dark:text-or-300",
                )}
              >
                {k.label} · {k.value}
              </span>
            ))}
          </div>
        )}

        {/* ==== GRILLE 2 colonnes : Localisation | Intervenants ==== */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Bloc title="Localisation">
            <Row label="Région" value={incident.region} />
            <Row label="Adresse" value={incident.adresse || "Non renseignée"} />
            <Row label="Coordonnées" value={`lng ${incident.ll[0].toFixed(4)} · lat ${incident.ll[1].toFixed(4)}`} mono />
            <Row label="Carte SVG" value={`x ${incident.x.toFixed(1)} · y ${incident.y.toFixed(1)}`} mono />
          </Bloc>
          <Bloc title="Intervenants rattachés">
            <Row label="Unités" value={`${attachedUnits.length} unité(s)`} />
            {attachedUnits.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-2">
                {attachedUnits.map((u) => (
                  <span
                    key={u.id}
                    className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-700 dark:border-rdia-600 dark:bg-rdia-800 dark:text-rdia-200"
                  >
                    {u.nom} · {u.ville}
                  </span>
                ))}
              </div>
            )}
            <Row label="Hôpitaux" value={`${attachedHosps.length} établissement(s)`} />
            {attachedHosps.length > 0 && (
              <div className="flex flex-wrap gap-1 pl-2">
                {attachedHosps.map((h) => (
                  <span
                    key={hospId(h)}
                    className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-700 dark:border-rdia-600 dark:bg-rdia-800 dark:text-rdia-200"
                  >
                    {h.nom}
                    {"ville" in h && h.ville ? ` · ${h.ville}` : ""}
                  </span>
                ))}
              </div>
            )}
          </Bloc>
        </div>

        {/* ==== Sous-incidents ==== */}
        {(incident.subIncidents?.length ?? 0) > 0 && (
          <Bloc
            title={`Sous-incidents · ${incident.subIncidents!.length}`}
            subtitle="aléas secondaires rattachés"
          >
            <div className="flex flex-col gap-1.5">
              {incident.subIncidents!.map((s) => (
                <SubIncidentRow
                  key={s.id}
                  sub={s}
                  types={(subCatalog as any)?.types ?? []}
                  lang={lang as Lang}
                  t={t}
                />
              ))}
            </div>
          </Bloc>
        )}

        {(incident.subIncidents?.length ?? 0) === 0 && (
          <Bloc title="Sous-incidents" subtitle="aléas secondaires rattachés">
            <Row label="État" value="Aucun sous-incident rattaché" />
          </Bloc>
        )}
      </div>
    </Modal>
  );
}

function Bloc({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-gray-200 bg-white/60 p-3 dark:border-rdia-600 dark:bg-rdia-700/60">
      <div className="flex items-end justify-between">
        <h3 className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-500 dark:text-rdia-400 leading-none">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[9.5px] text-gray-400 dark:text-rdia-400 leading-none">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({
  label, value, mono,
}: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-gray-100 py-1 last:border-none dark:border-rdia-600/60">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-500 dark:text-rdia-400 shrink-0">
        {label}
      </span>
      <span
        className={cn(
          "text-right text-[11.5px] font-semibold text-gray-800 dark:text-rdia-100 min-w-0 truncate",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Kpi({
  label, value, tint,
}: {
  label: string; value: string; tint: "rdia" | "or" | "danger" | "purple" | "pink" | "indigo" | "green" | "blue" | "slate";
}) {
  const palette: Record<string, { txt: string; bg: string }> = {
    rdia: {
      txt: "text-rdia-700 dark:text-rdia-300",
      bg: "bg-rdia-50/60 border-rdia-500/[0.14] dark:bg-rdia-500/5",
    },
    or: {
      txt: "text-or-600 dark:text-or-400",
      bg: "bg-or-50/60 border-or-500/[0.14] dark:bg-or-500/5",
    },
    danger: {
      txt: "text-danger-600 dark:text-danger-400",
      bg: "bg-danger-50/60 border-danger-500/[0.14] dark:bg-danger-500/5",
    },
    pink: {
      txt: "text-pink-700 dark:text-pink-300",
      bg: "bg-pink-50/60 border-pink-500/[0.14] dark:bg-pink-500/5",
    },
    purple: {
      txt: "text-purple-700 dark:text-purple-300",
      bg: "bg-purple-50/60 border-purple-500/[0.14] dark:bg-purple-500/5",
    },
    indigo: {
      txt: "text-indigo-700 dark:text-indigo-300",
      bg: "bg-indigo-50/60 border-indigo-500/[0.14] dark:bg-indigo-500/5",
    },
    green: {
      txt: "text-green-700 dark:text-green-400",
      bg: "bg-green-50/60 border-green-500/[0.14] dark:bg-green-500/5",
    },
    blue: {
      txt: "text-blue-700 dark:text-blue-300",
      bg: "bg-blue-50/60 border-blue-500/[0.14] dark:bg-blue-500/5",
    },
    slate: {
      txt: "text-slate-700 dark:text-slate-300",
      bg: "bg-slate-50/60 border-slate-500/[0.14] dark:bg-slate-500/5",
    },
  };
  const colors = palette[tint] ?? palette.rdia;
  return (
    <div className={cn("flex flex-col rounded-lg border px-2.5 py-2", colors.bg)}>
      <span className="text-[9.5px] font-bold uppercase tracking-wide text-gray-400 dark:text-rdia-400 leading-none">
        {label}
      </span>
      <div className={cn("mt-0.5 text-[17px] font-black tabular-nums leading-none", colors.txt)}>
        {value}
      </div>
    </div>
  );
}

function SubIncidentRow({
  sub, types, lang, t,
}: {
  sub: SubIncident; types: SubIncidentTypeDef[]; lang: Lang; t: ReturnType<typeof useDict>;
}) {
  const name =
    types.find((x) => x.id === sub.type)?.labels[lang] ??
    types.find((x) => x.id === sub.type)?.labels.fr ??
    sub.type;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white/70 px-2 py-1.5 dark:border-rdia-600 dark:bg-rdia-800/60">
      <div className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-rdia-600 dark:border-rdia-500 dark:bg-rdia-700 dark:text-rdia-200">
        <IcoUI path={UI_ICONS.branch} size={12} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11.5px] font-bold text-gray-800 dark:text-rdia-100">{name}</span>
          {sevPill(sub.sev, t)}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-rdia-400">
          <span className="inline-flex items-center gap-1">
            <IcoUI path={UI_ICONS.clock} size={9.5} />
            {formatIncidentTime(sub)}
          </span>
          {sub.note && <span className="min-w-0 truncate">· {sub.note}</span>}
          {sub.ll && (
            <span className="tabular-nums">[ {sub.ll[0].toFixed(3)} , {sub.ll[1].toFixed(3)} ]</span>
          )}
          {sub.casualties && (
            <span>
              · bilan : D{sub.casualties.dead} · B{sub.casualties.injured} · Ds{sub.casualties.missing}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
