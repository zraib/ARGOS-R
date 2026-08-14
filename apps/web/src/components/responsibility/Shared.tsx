"use client";

// Briques partagées par les écrans « Ma responsabilité » (tableau de bord et
// gestion) : états d'exception et types communs aux natures d'entité.

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { Tone } from "@/components/ui/Pill";
import type { ResponsibilityKind } from "@/lib/roles";

/**
 * Mode SUPERVISION : le tableau de bord est consulté par un superviseur (le
 * superadmin depuis /responsabilites), pas par le responsable de l'entité.
 * On masque alors le badge « Ma responsabilité » et les liens « Gérer », qui
 * pointent vers l'entité AFFECTÉE — impasse pour un compte non rattaché.
 */
const SupervisionContext = createContext(false);

export const SupervisionProvider = SupervisionContext.Provider;

/** Le tableau de bord courant est-il affiché en supervision ? */
export function useSupervision(): boolean {
  return useContext(SupervisionContext);
}

/** Service de soins tel que servi par l'API (/hospitals/:id/wards). */
export interface Ward {
  id: string;
  hid: string;
  nom: string;
  lits: number;
  occ: number;
  statut: "open" | "saturated" | "closed";
  chef?: string;
}

export const WARD_STATUSES = ["open", "saturated", "closed"] as const;

/** Teinte de pastille par statut de service. */
export const WARD_TONES: Record<Ward["statut"], Tone> = {
  open: "green",
  saturated: "amber",
  closed: "gray",
};

/** Entité pas encore chargée (premier rendu / requête en vol). */
export function Loading() {
  const m = useModules();
  return (
    <section className="animate-fade-in">
      <div className="carte p-6 text-sm text-gray-500 dark:text-rdia-300">{m.resp.loading}</div>
    </section>
  );
}

/** Bandeau commun aux écrans de responsabilité. */
export function RespHeader({
  icon, title, subtitle, badge, back = false,
}: { icon: string; title: string; subtitle: string; badge?: string; back?: boolean }) {
  const m = useModules();
  const supervised = useSupervision();
  return (
    <div className="carte flex flex-wrap items-center gap-3 p-4">
      {back ? (
        <Link href="/ma-responsabilite" className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600">
          <Icon path={UI_ICONS.arrowLeft} size={16} strokeWidth={2} />
        </Link>
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={icon} size={20} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-bold text-rdia-600 dark:text-rdia-50">{title}</h2>
        <p className="truncate text-xs text-gray-500 dark:text-rdia-300">{subtitle}</p>
      </div>
      {badge && (
        <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
          {badge}
        </span>
      )}
      {!back && !supervised && (
        <span className="rounded-md bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:bg-rdia-800/60 dark:text-rdia-300">
          {m.resp.my_responsibility}
        </span>
      )}
    </div>
  );
}

/** Carte de section avec titre et compteur optionnel. */
export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="carte flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{title}</h3>
        {count !== undefined && <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Notice({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="flex animate-fade-in items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="carte flex flex-col items-center gap-3 p-8 text-center" style={{ maxWidth: 460 }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-or-500/15 text-or-500">
          <Icon path={icon} size={22} />
        </div>
        <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-rdia-300">{text}</p>
      </div>
    </section>
  );
}

/**
 * Le rôle actif n'est pas un rôle de responsable, ou aucune entité ne lui est
 * affectée (compte à corriger par l'administrateur — l'API refuserait de toute
 * façon toute action).
 */
export function NoResponsibility({ unassigned = false }: { unassigned?: boolean }) {
  const m = useModules();
  return (
    <Notice
      icon={UI_ICONS.shield}
      title={unassigned ? m.resp.unassigned_title : m.resp.none_title}
      text={unassigned ? m.resp.unassigned_text : m.resp.none_text}
    />
  );
}

/** Nature de responsabilité dont le module n'est pas encore livré. */
export function PendingModule({ kind, entityId }: { kind: ResponsibilityKind; entityId: string }) {
  const m = useModules();
  return (
    <Notice
      icon={UI_ICONS.shield}
      title={m.users.responsibility[kind]}
      text={`${m.resp.pending_text} (${entityId})`}
    />
  );
}
