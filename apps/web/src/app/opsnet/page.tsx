"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { occBarClass } from "@/lib/helpers";
import { NAV_ICONS, KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { AddUnitModal, AddShelterModal } from "@/components/org/AddEntityModals";
import {
  Anneau,
  Approvisionnement,
  Composition,
  DispoUnites,
  PreparationUnites,
  SaturationAbris,
} from "@/components/opsnet/OpsnetCharts";
import { OpsnetAffecteurIA } from "@/components/opsnet/OpsnetAffecteurIA";
import { shelterPosition } from "@/lib/ai/opsnetAffecteur";
import type { Shelter } from "@/lib/data/modules";
import type { Unit } from "@/lib/types";

// ============================================================================
// OPSnet — réseau opérationnel (unités + abris)
//
// PENDANT D'HOSPINET, PAS SA COPIE. Hospinet tient le réseau de SOIN : des
// établissements, des lits, un plateau technique. OPSnet tient le réseau
// D'ACTION et D'ACCUEIL : les unités qu'on engage et les abris où l'on héberge.
// Les deux se lisent de la même façon — vue d'ensemble, graphes, affecteur,
// création — parce qu'un état-major ne doit pas réapprendre un écran par
// famille de moyens. Mais les grandeurs diffèrent, et les colonnes aussi : une
// unité a une préparation, pas un taux d'occupation ; un abri a un
// approvisionnement, pas une garde.
//
// CE QUE L'ÉCRAN NE FAIT PAS. Il n'affecte rien tout seul. L'affecteur CLASSE
// et montre pourquoi ; l'engagement reste un acte de commandement, tracé par le
// module de déploiement (lot V-2).
// ============================================================================

// L'affecteur n'est plus un onglet : c'est un OUTIL qu'on ouvre par-dessus
// l'écran, comme dans Hospinet. Un onglet en faisait une quatrième vue à
// parcourir ; une modale en fait un geste, et rend l'écran au dispositif dès
// qu'on la referme.
type Onglet = "vue" | "units" | "shelters";


export default function OpsnetPage() {
  const t = useDict();
  const units = useArgos((s) => s.units);
  const cities = useArgos((s) => s.cities);
  const shelters = useArgos((s) => s.catalog.shelters);

  const [onglet, setOnglet] = useState<Onglet>("vue");
  const [ajoutUnite, setAjoutUnite] = useState(false);
  const [ajoutAbri, setAjoutAbri] = useState(false);
  const [detailU, setDetailU] = useState<Unit | null>(null);
  const [detailA, setDetailA] = useState<Shelter | null>(null);
  const [affecteurOpen, setAffecteurOpen] = useState(false);
  const [q, setQ] = useState("");

  const kpi = useMemo(() => {
    const eff = units.reduce((s, u) => s + u.eff, 0);
    const dispoEff = units.filter((u) => u.dispo === "ready").reduce((s, u) => s + u.eff, 0);
    const cap = shelters.reduce((s, x) => s + x.capacity, 0);
    const occ = shelters.reduce((s, x) => s + x.occupants, 0);
    return {
      units: units.length,
      eff,
      dispoEff,
      // Part de l'effectif IMMÉDIATEMENT engageable — pas le nombre d'unités :
      // dix sections de dix hommes ne valent pas une brigade de cent.
      dispoPct: eff > 0 ? Math.round((100 * dispoEff) / eff) : 0,
      shelters: shelters.length,
      cap,
      occ,
      satPct: cap > 0 ? Math.round((100 * occ) / cap) : 0,
      critiques: shelters.filter((x) => x.supplies === "critical").length,
    };
  }, [units, shelters]);

  const filtre = q.trim().toLocaleLowerCase("fr");
  const unitesVues = useMemo(
    () => (filtre ? units.filter((u) => `${u.nom} ${u.ville} ${u.cmdt}`.toLocaleLowerCase("fr").includes(filtre)) : units),
    [units, filtre],
  );
  // Utilisé pour savoir vers quel onglet la recherche doit conduire.
  const unitesFiltrees = unitesVues;
  const abrisVus = useMemo(
    () => (filtre ? shelters.filter((s) => `${s.nom} ${s.ville}`.toLocaleLowerCase("fr").includes(filtre)) : shelters),
    [shelters, filtre],
  );

  const onglets: { k: Onglet; label: string }[] = [
    { k: "vue", label: t.ops_tab_overview },
    { k: "units", label: `${t.ops_tab_units} (${units.length})` },
    { k: "shelters", label: `${t.ops_tab_shelters} (${shelters.length})` },
  ];

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* --- bandeau de commandement -------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t.ops_kpi_units} value={kpi.units} icon={NAV_ICONS.units} tint="or" />
        <StatTile
          label={t.ops_kpi_available}
          value={`${kpi.dispoEff.toLocaleString("fr-FR")} / ${kpi.eff.toLocaleString("fr-FR")}`}
          icon={KPI_ICONS.personnel}
          tint="green"
        />
        <StatTile label={t.ops_kpi_shelters} value={kpi.shelters} icon={NAV_ICONS.shelters} tint="blue" />
        <StatTile
          label={t.ops_kpi_sheltered}
          value={`${kpi.occ.toLocaleString("fr-FR")} / ${kpi.cap.toLocaleString("fr-FR")}`}
          icon={KPI_ICONS.beds}
          tint={kpi.satPct >= 92 ? "danger" : kpi.satPct >= 75 ? "or" : "green"}
        />
      </div>

      {/* --- onglets + actions -------------------------------------------- */}
      <div className="carte flex flex-wrap items-center gap-2 p-2.5">
        <h1 className="flex items-center gap-2 pe-2 text-sm font-bold text-rdia-600 dark:text-rdia-50">
          <Icon path={NAV_ICONS.opsnet} size={17} className="text-or-500" />
          {t.ops_title}
        </h1>
        <div className="flex flex-wrap gap-1">
          {onglets.map((o) => (
            <button
              key={o.k}
              onClick={() => setOnglet(o.k)}
              aria-pressed={onglet === o.k}
              className={`cible-tactile shrink-0 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
                onglet === o.k
                  ? "bg-or-500 text-rdia-600"
                  : "bg-gray-100 text-gray-500 hover:text-or-500 dark:bg-rdia-600 dark:text-rdia-300"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/* La recherche ne s'affichait que sur les onglets de liste : à
              l'arrivée sur la vue d'ensemble, l'écran n'en montrait aucune.
              Elle est désormais toujours là, et taper bascule vers l'onglet
              qui porte des résultats — chercher sans voir où l'on cherche
              n'apprend rien. */}
          <input
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              if (v.trim() && onglet === "vue") setOnglet(unitesFiltrees.length ? "units" : "shelters");
            }}
            placeholder={t.ops_search}
            aria-label={t.ops_search}
            type="search"
            className="input-champ cible-tactile w-[220px] text-sm"
          />
          <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-sm" onClick={() => setAjoutUnite(true)}>
            <Icon path={UI_ICONS.plus} size={15} />
            {t.ops_add_unit}
          </button>
          <button className="btn-primaire cible-tactile flex items-center gap-1.5 text-sm" onClick={() => setAjoutAbri(true)}>
            <Icon path={UI_ICONS.plus} size={15} />
            {t.ops_add_shelter}
          </button>
          <button type="button" onClick={() => setAffecteurOpen(true)} className="btn-affecteur cible-tactile">
            <Icon path={UI_ICONS.target} size={15} strokeWidth={2} />
            <span className="tracking-wide">{t.af_launcher}</span>
          </button>
        </div>
      </div>

      {/* --- vue d'ensemble ----------------------------------------------- */}
      {onglet === "vue" && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Anneau
            pct={100 - kpi.dispoPct}
            label={t.ops_engagement_rate}
            sous={`${kpi.dispoPct}% ${t.ops_available_now}`}
          />
          <DispoUnites units={units} />
          <PreparationUnites units={units} />
          <Anneau pct={kpi.satPct} label={t.ops_shelter_saturation} sous={`${(kpi.cap - kpi.occ).toLocaleString("fr-FR")} ${t.ops_places_left}`} />
          <SaturationAbris shelters={shelters} />
          <Approvisionnement shelters={shelters} />
          <div className="lg:col-span-2">
            <Composition shelters={shelters} />
          </div>
          {kpi.critiques > 0 && (
            // L'alerte est un ÉNONCÉ, pas une pastille : « 1 abri en rupture »
            // se lit et se transmet ; un point rouge ne se transmet pas.
            <p className="flex items-start gap-2 rounded-xl border border-danger-500/30 bg-danger-500/10 p-3 text-[12.5px] font-semibold leading-snug text-danger-400">
              <Icon path={UI_ICONS.alert} size={15} className="mt-0.5 shrink-0" />
              {kpi.critiques} {kpi.critiques > 1 ? t.ops_critical_many : t.ops_critical_one}
            </p>
          )}
        </div>
      )}

      {/* --- unités : une tuile par unité, comme les établissements d'Hospinet --- */}
      {onglet === "units" && (
        unitesVues.length === 0 ? (
          <p className="carte p-8 text-center text-sm text-gray-500 dark:text-rdia-300">{t.ops_no_units}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {unitesVues.map((u) => (
              <div key={u.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
                    <Icon path={NAV_ICONS.units} size={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{u.nom}</h3>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{u.ville}</div>
                    <div className="mt-1"><EtatUnite dispo={u.dispo} /></div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                    <span>{t.ops_readiness}</span>
                    <span className="font-mono">{u.readiness} %</span>
                  </div>
                  {/* Une préparation ÉLEVÉE est bonne : la barre se lit donc à
                      l'envers d'un taux d'occupation, d'où le complément. */}
                  <ProgressBar value={u.readiness} fill={occBarClass(100 - u.readiness)} />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-rdia-300">{t.ops_strength}</span>
                  <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{u.eff}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="shrink-0 text-gray-500 dark:text-rdia-300">{t.ops_commander}</span>
                  <span className="min-w-0 truncate font-semibold text-gray-800 dark:text-rdia-50">{u.cmdt}</span>
                </div>
                <button className="btn-secondaire min-h-[44px] w-full text-xs lg:min-h-0" onClick={() => setDetailU(u)}>
                  {t.act_view}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* --- abris : même tuile, grandeurs d'un lieu d'hébergement ---------- */}
      {onglet === "shelters" && (
        abrisVus.length === 0 ? (
          <p className="carte p-8 text-center text-sm text-gray-500 dark:text-rdia-300">{t.ops_no_shelters}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {abrisVus.map((a) => {
              const pct = Math.round((100 * a.occupants) / Math.max(1, a.capacity));
              return (
                <div key={a.id} className="carte flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
                      <Icon path={NAV_ICONS.shelters} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">{a.nom}</h3>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{a.ville}</div>
                      <div className="mt-1"><EtatAppro niveau={a.supplies} /></div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400 dark:text-rdia-400">
                      <span>{t.ops_occupancy}</span>
                      <span className="font-mono">{pct} %</span>
                    </div>
                    <ProgressBar value={pct} fill={occBarClass(pct)} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-rdia-300">{t.ops_occupants}</span>
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">
                      {a.occupants} / {a.capacity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 dark:text-rdia-300">{t.ops_staff}</span>
                    <span className="font-semibold tabular-nums text-gray-800 dark:text-rdia-50">{a.staff}</span>
                  </div>
                  <button className="btn-secondaire min-h-[44px] w-full text-xs lg:min-h-0" onClick={() => setDetailA(a)}>
                    {t.act_view}
                  </button>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* --- modales ------------------------------------------------------- */}
      <AddUnitModal open={ajoutUnite} onClose={() => setAjoutUnite(false)} />
      <AddShelterModal open={ajoutAbri} onClose={() => setAjoutAbri(false)} />

      <Modal open={affecteurOpen} onClose={() => setAffecteurOpen(false)} size="2xl" title={`${t.af_launcher} · ${t.nav_opsnet}`}>
        <OpsnetAffecteurIA />
      </Modal>

      {detailU && (
        <Modal open title={detailU.nom} onClose={() => setDetailU(null)} size="md">
          <dl className="grid grid-cols-2 gap-3">
            <Champ label={t.lbl_city} value={detailU.ville} />
            <Champ label={t.ops_commander} value={detailU.cmdt} />
            <Champ label={t.ops_strength} value={String(detailU.eff)} />
            <Champ label={t.ops_readiness} value={`${detailU.readiness}%`} />
            <Champ label={t.ops_status} value={t[`ops_${detailU.dispo}` as const]} />
            <Champ label={t.wz_lat} value={`${detailU.ll[1].toFixed(4)}, ${detailU.ll[0].toFixed(4)}`} mono />
          </dl>
        </Modal>
      )}

      {detailA && (
        <Modal open title={detailA.nom} onClose={() => setDetailA(null)} size="md">
          <dl className="grid grid-cols-2 gap-3">
            <Champ label={t.lbl_city} value={detailA.ville} />
            <Champ label={t.ops_capacity} value={String(detailA.capacity)} />
            <Champ label={t.ops_occupants} value={String(detailA.occupants)} />
            <Champ label={t.ops_staff} value={String(detailA.staff)} />
            <Champ label={t.ops_adults} value={String(detailA.adults)} />
            <Champ label={t.ops_children} value={String(detailA.children)} />
            <Champ label={t.ops_elderly} value={String(detailA.elderly)} />
            <Champ label={t.ops_needs} value={detailA.needs} />
            {/* La position vient de la COMMUNE, pas de l'abri : le dire évite
                qu'un point sur une carte passe pour une adresse. */}
            <div className="col-span-2">
              <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                {t.ops_position}
              </dt>
              <dd className="text-xs leading-relaxed text-gray-700 dark:text-rdia-100">
                {(() => {
                  const ll = shelterPosition(detailA, cities);
                  return ll ? `${t.ops_pos_from_city} ${ll[1].toFixed(3)}, ${ll[0].toFixed(3)}` : t.ops_pos_unresolved;
                })()}
              </dd>
            </div>
          </dl>
        </Modal>
      )}
    </section>
  );
}

// --- petits rendus -----------------------------------------------------------

function EtatUnite({ dispo }: { dispo: Unit["dispo"] }) {
  const t = useDict();
  // La couleur ne porte jamais seule : l'état est écrit.
  const style: Record<Unit["dispo"], string> = {
    ready: "bg-green-500/12 text-green-600",
    standby: "bg-or-500/15 text-or-600 dark:text-or-400",
    deployed: "bg-blue-500/12 text-blue-500",
  };
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${style[dispo]}`}>
      {t[`ops_${dispo}` as const]}
    </span>
  );
}

function EtatAppro({ niveau }: { niveau: Shelter["supplies"] }) {
  const m = useModules();
  const style: Record<Shelter["supplies"], string> = {
    ok: "bg-green-500/12 text-green-600",
    low: "bg-or-500/15 text-or-600 dark:text-or-400",
    critical: "bg-danger-500/15 text-danger-500",
  };
  const label: Record<Shelter["supplies"], string> = { ok: m.shelters.sup_ok, low: m.shelters.sup_low, critical: m.shelters.sup_critical };
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${style[niveau]}`}>{label[niveau]}</span>;
}

function Champ({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
        {label}
      </dt>
      <dd className={`text-xs text-gray-700 dark:text-rdia-100 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</dd>
    </div>
  );
}
