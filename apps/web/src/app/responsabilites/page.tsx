"use client";

// ============================================================================
// Supervision des responsabilités — vue du Super Administrateur
//
// Le superadmin n'a AUCUNE entité affectée : il n'a donc pas de « Ma
// responsabilité », mais doit pouvoir consulter le tableau de bord de chaque
// responsable. Cet écran liste les entités par nature et ouvre EXACTEMENT le
// même tableau de bord que celui du responsable concerné — aucune vue
// parallèle à maintenir.
//
// L'accès reste gouverné par l'API : le superadmin détient toutes les
// permissions, et le ScopeGuard ne cantonne que les rôles rattachés.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS, NAV_ICONS, KPI_ICONS } from "@/lib/icons";
import { isSuperAdmin } from "@/lib/roles";
import type { ResponsibilityKind } from "@/lib/roles";
import { SupervisionProvider } from "@/components/responsibility/Shared";
import { HospitalDashboard } from "@/components/responsibility/HospitalViews";
import { UnitDashboard } from "@/components/responsibility/UnitViews";
import { ShelterDashboard, type Shelter } from "@/components/responsibility/ShelterViews";
import { MorgueDashboard, type MorgueSite } from "@/components/responsibility/MorgueViews";
import { EquipmentPark } from "@/components/responsibility/EquipmentViews";

/** Entité supervisable, réduite à ce qu'il faut pour la lister. */
interface Entity {
  id: string;
  nom: string;
  sub: string;
}

const KIND_ICONS: Record<ResponsibilityKind, string> = {
  hospital: NAV_ICONS.hospitals,
  unit: NAV_ICONS.units,
  shelter: NAV_ICONS.shelters,
  morgue: KPI_ICONS.beds,
  equipment: NAV_ICONS.res,
};

const KINDS: ResponsibilityKind[] = ["hospital", "unit", "shelter", "morgue", "equipment"];

export default function SupervisionPage() {
  const m = useModules();
  const role = useArgos((s) => s.role);
  const hospitals = useArgos((s) => s.hospitals);
  const units = useArgos((s) => s.units);

  const [kind, setKind] = useState<ResponsibilityKind>("hospital");
  const [selected, setSelected] = useState<string | null>(null);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [morgues, setMorgues] = useState<MorgueSite[]>([]);

  // Abris et sites mortuaires ne sont pas dans le store : chargés à la demande.
  const loadExtra = useCallback(async () => {
    const [sh, mo] = await Promise.all([api.getShelters(), api.getMorgues()]);
    setShelters((sh.data ?? []) as unknown as Shelter[]);
    setMorgues((mo.data ?? []) as unknown as MorgueSite[]);
  }, []);

  useEffect(() => {
    void loadExtra();
  }, [loadExtra]);

  const entities = useMemo<Entity[]>(() => {
    switch (kind) {
      case "hospital":
        // Seuls les établissements militaires ont un responsable désigné.
        return hospitals
          .filter((h) => (h.kind ?? "mil") === "mil")
          .map((h) => ({ id: h.id, nom: h.nom, sub: `${h.ville} · ${h.lits - h.occ} / ${h.lits} lits libres` }));
      case "unit":
        return units.map((u) => ({ id: u.id, nom: u.nom, sub: `${u.ville} · ${u.eff} personnels · ${u.readiness} %` }));
      case "shelter":
        return shelters.map((s) => ({ id: s.id, nom: s.nom, sub: `${s.ville} · ${s.occupants} / ${s.capacity} hébergés` }));
      case "morgue":
        return morgues.map((s) => ({ id: s.id, nom: s.nom, sub: `${s.ville} · ${s.capacity} emplacements` }));
      case "equipment":
        // Un parc par unité détentrice.
        return units.map((u) => ({ id: u.id, nom: `${m.resp.e_park} — ${u.nom}`, sub: u.ville }));
    }
  }, [kind, hospitals, units, shelters, morgues, m]);

  // Défense en profondeur : l'API refuse déjà ce que ce rôle ne peut pas lire.
  if (!isSuperAdmin(role)) {
    return (
      // `dvh` et carte fluide : à 375 px, une largeur figée déborderait.
      <section className="flex min-h-[60dvh] animate-fade-in items-center justify-center">
        <div className="carte flex w-full max-w-[420px] flex-col items-center gap-3 p-5 text-center sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10 text-danger-500">
            <Icon path={UI_ICONS.shield} size={22} />
          </div>
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{m.sup.title}</h2>
          <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
      </section>
    );
  }

  // --- entité ouverte : on rend le tableau de bord DU responsable ----------
  if (selected) {
    return (
      <section className="flex flex-col gap-3 animate-fade-in">
        <div className="carte flex flex-wrap items-center gap-3 p-3">
          <button
            onClick={() => setSelected(null)}
            className="cible-tactile flex shrink-0 items-center justify-center rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
            title={m.sup.back}
          >
            {/* La flèche de retour suit le sens de lecture (RTL en arabe). */}
            <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} className="rtl:rotate-180" />
          </button>
          <span className="text-xs font-semibold text-gray-500 dark:text-rdia-300">{m.sup.viewing}</span>
          <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
            {m.users.responsibility[kind]}
          </span>
        </div>
        <SupervisionProvider value={true}>
          <Selected kind={kind} id={selected} />
        </SupervisionProvider>
      </section>
    );
  }

  // --- liste des entités par nature ---------------------------------------
  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <div className="carte flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={UI_ICONS.shield} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.sup.title}</h2>
          <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{m.sup.subtitle}</p>
        </div>
      </div>

      {/* Sélecteur de nature : replié en plusieurs lignes sur téléphone, avec
          des cibles de 44 px. */}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => {
          const on = k === kind;
          return (
            <button
              key={k}
              onClick={() => { setKind(k); setSelected(null); }}
              className={`cible-tactile inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-or-500 bg-or-500/10 text-or-600 dark:text-or-400"
                  : "border-gray-200 text-gray-500 hover:border-or-500/50 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300"
              }`}
            >
              <Icon path={KIND_ICONS[k]} size={14} />
              {m.users.responsibility[k]}
            </button>
          );
        })}
      </div>

      {entities.length === 0 && (
        <div className="carte p-6 text-center text-[11px] text-gray-400 dark:text-rdia-400">{m.sup.empty}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entities.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelected(e.id)}
            className="carte flex items-center gap-3 p-4 text-start transition-colors hover:border-or-500/60"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
              <Icon path={KIND_ICONS[kind]} size={17} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-rdia-600 dark:text-rdia-50">{e.nom}</div>
              <div className="truncate text-[11px] text-gray-500 dark:text-rdia-300">{e.sub}</div>
            </div>
            {/* Le chevron d'ouverture suit le sens de lecture (RTL en arabe). */}
            <Icon path={UI_ICONS.chevronRight} size={15} className="shrink-0 rtl:rotate-180" />
          </button>
        ))}
      </div>
    </section>
  );
}

/** Rend le tableau de bord de la nature choisie — le MÊME que le responsable. */
function Selected({ kind, id }: { kind: ResponsibilityKind; id: string }) {
  switch (kind) {
    case "hospital": return <HospitalDashboard hid={id} />;
    case "unit": return <UnitDashboard uid={id} />;
    case "shelter": return <ShelterDashboard sid={id} />;
    case "morgue": return <MorgueDashboard mid={id} />;
    case "equipment": return <EquipmentPark unitId={id} />;
  }
}
