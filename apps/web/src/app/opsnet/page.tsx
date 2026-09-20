"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { StatTile } from "@/components/ui/StatTile";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { occBarClass } from "@/lib/helpers";
import { NAV_ICONS, KPI_ICONS, UI_ICONS } from "@/lib/icons";
import { AddUnitModal, AddShelterModal } from "@/components/org/AddEntityModals";
import { EditUnitModal, EditShelterModal } from "@/components/org/EditEntityModals";
import { canCreateUnit, canEditShelter, canEditUnit } from "@/lib/mode";
import { corpsLabel } from "@/lib/corps";
import { Loading } from "@/components/responsibility/Shared";
import { EtatAppro, EtatUnite } from "@/components/opsnet/OpsnetBits";
import { ShelterSheet, UnitSheet } from "@/components/opsnet/OpsnetSheets";
import {
  Anneau,
  Approvisionnement,
  Composition,
  DispoUnites,
  PreparationUnites,
  SaturationAbris,
} from "@/components/opsnet/OpsnetCharts";
import { OpsnetAffecteurIA } from "@/components/opsnet/OpsnetAffecteurIA";
import type { Shelter } from "@/lib/data/modules";
import type { Unit } from "@/lib/types";
import { DeleteEntityButton } from "@/components/org/DeleteEntityModal";

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
//
// LA PORTE DES MOYENS (ADR 0026). Cliquer une unité ou un abri, c'est y
// ENTRER : l'écran devient sa fiche (`?unit=` / `?shelter=`, pour que la
// carte et un lien y mènent) — ce qu'elle est, tous ses titulaires joignables,
// et ses moyens tenus sur place : personnes, équipes, véhicules, logistique,
// équipements. Un état-major ne gère plus une unité depuis trois écrans.
// ============================================================================

// L'affecteur n'est plus un onglet : c'est un OUTIL qu'on ouvre par-dessus
// l'écran, comme dans Hospinet. Un onglet en faisait une quatrième vue à
// parcourir ; une modale en fait un geste, et rend l'écran au dispositif dès
// qu'on la referme.
type Onglet = "vue" | "units" | "shelters";


/** Les paramètres d'URL (`?unit=`, `?shelter=`) exigent une frontière Suspense. */
export default function OpsnetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <OpsnetScreen />
    </Suspense>
  );
}

function OpsnetScreen() {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const params = useSearchParams();
  const units = useArgos((s) => s.units);
  const shelters = useArgos((s) => s.catalog.shelters);
  // Modifier (ADR 0019) : proposé à qui l'API l'accorde — l'administration,
  // l'OPCOM et les cellules hors opérationnel, chaque responsable sur le sien.
  const role = useArgos((s) => s.role);
  const appMode = useArgos((s) => s.appMode);
  const sessionUser = useArgos((s) => s.sessionUser);
  const editUnit = (u: Unit) => canEditUnit(role, appMode, sessionUser?.assignments?.unit === u.id);
  const can = useArgos((s) => s.can);
  const editShelter = (a: Shelter) => canEditShelter(role, sessionUser?.assignments?.shelter === a.id, can);
  // Ajouter : à qui l'API l'accorde (LOG / OPS des PC et Anim en direx, l'OPCOM et les cellules en classique…).
  const addUnit = canCreateUnit(role, appMode, can);
  const addShelter = role === "superadmin" || can("shelters:create");

  const [onglet, setOnglet] = useState<Onglet>("vue");
  const [ajoutUnite, setAjoutUnite] = useState(false);
  const [ajoutAbri, setAjoutAbri] = useState(false);
  // La fiche ouverte vit dans l'URL : la carte y mène (« Détails »), un lien se partage, « retour » la referme.
  const sheetUnit = params.get("unit");
  const sheetShelter = params.get("shelter");
  const openUnit = useCallback((id: string) => router.replace(`/opsnet?unit=${encodeURIComponent(id)}`, { scroll: false }), [router]);
  const openShelter = useCallback((id: string) => router.replace(`/opsnet?shelter=${encodeURIComponent(id)}`, { scroll: false }), [router]);
  const closeSheet = useCallback(() => router.replace("/opsnet", { scroll: false }), [router]);
  const [editU, setEditU] = useState<Unit | null>(null);
  const [editA, setEditA] = useState<Shelter | null>(null);
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

  // --- la fiche d'une unité ou d'un abri prend tout l'écran ---------------
  const unitOpen = sheetUnit ? units.find((u) => u.id === sheetUnit) : undefined;
  const shelterOpen = sheetShelter ? shelters.find((a) => a.id === sheetShelter) : undefined;
  if (unitOpen) return <UnitSheet key={unitOpen.id} unit={unitOpen} onBack={closeSheet} />;
  if (shelterOpen) return <ShelterSheet key={shelterOpen.id} shelter={shelterOpen} onBack={closeSheet} />;

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
          {addUnit && (
            <button className="btn-secondaire cible-tactile flex items-center gap-1.5 text-sm" onClick={() => setAjoutUnite(true)}>
              <Icon path={UI_ICONS.plus} size={15} />
              {t.ops_add_unit}
            </button>
          )}
          {addShelter && (
            <button className="btn-primaire cible-tactile flex items-center gap-1.5 text-sm" onClick={() => setAjoutAbri(true)}>
              <Icon path={UI_ICONS.plus} size={15} />
              {t.ops_add_shelter}
            </button>
          )}
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
                    {/* Le nom est une porte : cliquer, c'est entrer dans l'unité. */}
                    <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">
                      <button type="button" className="text-start hover:text-or-500 hover:underline" onClick={() => openUnit(u.id)}>{u.nom}</button>
                    </h3>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">{u.ville}</div>
                    {/* L'organe d'origine (ADR 0019) : le corps de l'unité — FAR, Gendarmerie, DGSN, DGPC, FA. */}
                    <div className="mt-0.5 text-[11px] font-semibold text-or-600 dark:text-or-400">{corpsLabel(u.corps ?? "far", t)}</div>
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
                <div className="flex gap-2">
                  <button className="btn-primaire min-h-[44px] flex-1 text-xs lg:min-h-0" onClick={() => openUnit(u.id)}>
                    {t.ops_enter}
                  </button>
                  {editUnit(u) && (
                    <button className="btn-secondaire min-h-[44px] flex-1 text-xs lg:min-h-0" onClick={() => setEditU(u)}>
                      {t.act_edit}
                    </button>
                  )}
                  <DeleteEntityButton kind="unit" id={u.id} name={u.nom} compact />
                </div>
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
                      <h3 className="break-words text-sm font-bold leading-snug text-rdia-600 dark:text-rdia-50">
                        <button type="button" className="text-start hover:text-or-500 hover:underline" onClick={() => openShelter(a.id)}>{a.nom}</button>
                      </h3>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-rdia-300">
                        {a.ville}
                        {a.kind === "tentes" && a.tents ? ` · ${a.tents} × ${a.perTent ?? "—"}` : a.building ? ` · ${m.shelters[`b_${a.building}` as const]}` : ""}
                      </div>
                      {/* L'organe d'origine (ADR 0019) : qui ouvre et tient l'abri. */}
                      {a.organ && <div className="mt-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">{m.shelters[`o_${a.organ}` as const]}</div>}
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
                  <div className="flex gap-2">
                    <button className="btn-primaire min-h-[44px] flex-1 text-xs lg:min-h-0" onClick={() => openShelter(a.id)}>
                      {t.ops_enter}
                    </button>
                    {editShelter(a) && (
                      <button className="btn-secondaire min-h-[44px] flex-1 text-xs lg:min-h-0" onClick={() => setEditA(a)}>
                        {t.act_edit}
                      </button>
                    )}
                    <DeleteEntityButton kind="shelter" id={a.id} name={a.nom} compact />
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* --- modales ------------------------------------------------------- */}
      <AddUnitModal open={ajoutUnite} onClose={() => setAjoutUnite(false)} />
      <AddShelterModal open={ajoutAbri} onClose={() => setAjoutAbri(false)} />
      {editU && <EditUnitModal unit={editU} onClose={() => setEditU(null)} />}
      {editA && <EditShelterModal shelter={editA} onClose={() => setEditA(null)} />}

      <Modal open={affecteurOpen} onClose={() => setAffecteurOpen(false)} size="2xl" title={`${t.af_launcher} · ${t.nav_opsnet}`}>
        <OpsnetAffecteurIA />
      </Modal>

    </section>
  );
}
