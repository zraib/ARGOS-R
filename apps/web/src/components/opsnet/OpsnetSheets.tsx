"use client";

import { useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { occBarClass } from "@/lib/helpers";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { corpsLabel } from "@/lib/corps";
import { canEditShelter, canEditUnit } from "@/lib/mode";
import { shelterPosition } from "@/lib/ai/opsnetAffecteur";
import { EditUnitModal, EditShelterModal } from "@/components/org/EditEntityModals";
import { DeleteEntityButton } from "@/components/org/DeleteEntityModal";
import { ResponsibleCard } from "@/components/responsibility/ResponsibleCard";
import { ResourcesScreen } from "@/components/resources/ResourcesScreen";
import { EtatAppro, EtatUnite } from "@/components/opsnet/OpsnetBits";
import type { Shelter } from "@/lib/data/modules";
import type { Unit } from "@/lib/types";

// ============================================================================
// OPSnet — la fiche d'une unité et celle d'un abri : ON ENTRE DANS L'ENTITÉ.
//
// Cliquer une unité dans OPSnet ne montre plus une modale de sept champs :
// l'écran devient la fiche de l'unité (ADR 0026) — ce qu'elle est, qui la
// tient et comment le joindre, puis SES MOYENS, tenus ici même : personnes,
// équipes, véhicules, logistique, équipements (ADR 0016, `ResourcesScreen`
// embarqué). Ce que l'appelant peut y écrire reste dit par l'API
// (`canManage`) ; la fiche ne fait que masquer ce qui serait refusé.
// Un abri a la même fiche, avec ses grandeurs d'hébergement.
// ============================================================================

const stat = (label: string, value: string, mono = false) => (
  <div>
    <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</dt>
    <dd className={`text-sm font-semibold text-gray-800 dark:text-rdia-50 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
  </div>
);

const BACK_CLS =
  "cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-700";
const EDIT_CLS =
  "cible-tactile inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold text-gray-600 transition-colors hover:border-or-400 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-200";

export function UnitSheet({ unit, onBack }: { unit: Unit; onBack: () => void }) {
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const role = useArgos((s) => s.role);
  const appMode = useArgos((s) => s.appMode);
  const sessionUser = useArgos((s) => s.sessionUser);
  const [editing, setEditing] = useState(false);
  const editable = canEditUnit(role, appMode, sessionUser?.assignments?.unit === unit.id);
  // L'opération où l'unité est engagée : son canal s'ouvre depuis la carte des titulaires.
  const incidentId = incidents.find((i) => i.responders?.units?.includes(unit.id))?.id;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" aria-label={t.back} title={t.back} className={BACK_CLS} onClick={onBack}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
            <Icon path={NAV_ICONS.units} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{unit.nom}</h2>
            <div className="text-xs text-gray-500 dark:text-rdia-300">
              {corpsLabel(unit.corps ?? "far", t)} · {unit.ville}
            </div>
          </div>
          <EtatUnite dispo={unit.dispo} />
          {editable && (
            <button type="button" onClick={() => setEditing(true)} title={t.ops_edit_unit} aria-label={`${t.ops_edit_unit} — ${unit.nom}`} className={EDIT_CLS}>
              <Icon path={UI_ICONS.edit} size={14} />
              <span className="hidden sm:inline">{t.act_edit}</span>
            </button>
          )}
          <DeleteEntityButton kind="unit" id={unit.id} name={unit.nom} compact onDeleted={onBack} />
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {stat(t.ops_commander, unit.cmdt)}
          {stat(t.ops_strength, String(unit.eff))}
          <div>
            <dt className="mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
              <span>{t.ops_readiness}</span>
              <span className="font-mono normal-case">{unit.readiness} %</span>
            </dt>
            {/* Une préparation ÉLEVÉE est bonne : la barre se lit à l'envers d'un taux d'occupation. */}
            <dd className="pt-1.5"><ProgressBar value={unit.readiness} fill={occBarClass(100 - unit.readiness)} /></dd>
          </div>
          {stat(t.ops_status, t[`ops_${unit.dispo}` as const])}
          {stat(t.ops_position, `${unit.ll[1].toFixed(4)}, ${unit.ll[0].toFixed(4)}`, true)}
        </dl>

        {/* Qui tient l'unité — tous ses titulaires, en ligne ou non, chacun joignable ; et le canal de l'opération où elle est engagée. */}
        <ResponsibleCard kind="unit" entityId={unit.id} incidentId={incidentId} />
      </div>

      {/* Les moyens de l'unité, tenus ici : personnes, équipes, véhicules, logistique, équipements. */}
      <ResourcesScreen fixedOwner={{ kind: "unit", id: unit.id }} embedded />

      {editing && <EditUnitModal unit={unit} onClose={() => setEditing(false)} />}
    </section>
  );
}

export function ShelterSheet({ shelter, onBack }: { shelter: Shelter; onBack: () => void }) {
  const t = useDict();
  const m = useModules();
  const cities = useArgos((s) => s.cities);
  const posts = useArgos((s) => s.posts);
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);
  const can = useArgos((s) => s.can);
  const [editing, setEditing] = useState(false);
  const editable = canEditShelter(role, sessionUser?.assignments?.shelter === shelter.id, can);
  const pct = Math.round((100 * shelter.occupants) / Math.max(1, shelter.capacity));
  // La position vient de la COMMUNE, pas de l'abri : le dire évite qu'un point sur une carte passe pour une adresse.
  const ll = shelterPosition(shelter, cities);
  // L'abri posé sur une opération : son canal s'ouvre depuis la carte des titulaires.
  const incidentId = posts.find((p) => p.kind === "shelter" && p.entityId === shelter.id)?.incidentId;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" aria-label={t.back} title={t.back} className={BACK_CLS} onClick={onBack}>
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            <Icon path={NAV_ICONS.shelters} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-base font-bold leading-tight text-rdia-600 dark:text-rdia-50">{shelter.nom}</h2>
            <div className="text-xs text-gray-500 dark:text-rdia-300">
              {shelter.ville}
              {shelter.kind === "tentes" && shelter.tents ? ` · ${shelter.tents} × ${shelter.perTent ?? "—"}` : shelter.building ? ` · ${m.shelters[`b_${shelter.building}` as const]}` : ""}
              {shelter.organ ? ` · ${m.shelters[`o_${shelter.organ}` as const]}` : ""}
            </div>
          </div>
          <EtatAppro niveau={shelter.supplies} />
          {editable && (
            <button type="button" onClick={() => setEditing(true)} title={t.ops_edit_shelter} aria-label={`${t.ops_edit_shelter} — ${shelter.nom}`} className={EDIT_CLS}>
              <Icon path={UI_ICONS.edit} size={14} />
              <span className="hidden sm:inline">{t.act_edit}</span>
            </button>
          )}
          <DeleteEntityButton kind="shelter" id={shelter.id} name={shelter.nom} compact onDeleted={onBack} />
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <div>
            <dt className="mb-0.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
              <span>{t.ops_occupancy}</span>
              <span className="font-mono normal-case">{pct} %</span>
            </dt>
            <dd className="pt-1.5"><ProgressBar value={pct} fill={occBarClass(pct)} /></dd>
          </div>
          {stat(t.ops_occupants, `${shelter.occupants} / ${shelter.capacity}`, true)}
          {stat(t.ops_staff, String(shelter.staff))}
          {stat(t.ops_needs, shelter.needs || "—")}
          {stat(t.ops_adults, String(shelter.adults))}
          {stat(t.ops_children, String(shelter.children))}
          {stat(t.ops_elderly, String(shelter.elderly))}
          {stat(t.ops_position, ll ? `${t.ops_pos_from_city} ${ll[1].toFixed(3)}, ${ll[0].toFixed(3)}` : t.ops_pos_unresolved)}
        </dl>

        <ResponsibleCard kind="shelter" entityId={shelter.id} incidentId={incidentId} />
      </div>

      <ResourcesScreen fixedOwner={{ kind: "shelter", id: shelter.id }} embedded />

      {editing && <EditShelterModal shelter={shelter} onClose={() => setEditing(false)} />}
    </section>
  );
}
