"use client";

import { useState } from "react";
import { useArgos, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import {
  canManageUsers,
  isSuperAdmin,
  } from "@/lib/roles";
import {
  Tab,
  } from "@/app/utilisateurs/_parts/shared";
import { TabButton } from "@/app/utilisateurs/_parts/TabButton";
import { UsersTab } from "@/app/utilisateurs/_parts/UsersTab";
import { RolesTab } from "@/app/utilisateurs/_parts/RolesTab";

export default function UtilisateursPage() {
  const m = useModules();
  const role = useArgos((s) => s.role);
  const sessionUser = useArgos((s) => s.sessionUser);

  const [tab, setTab] = useState<Tab>("users");

  // Accès refusé (défense en profondeur — l'API refuse aussi sans la permission).
  if (!canManageUsers(role)) {
    return (
      <section className="flex min-h-[60dvh] animate-fade-in items-center justify-center">
        <div className="carte flex w-full max-w-[420px] flex-col items-center gap-3 p-6 text-center sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-500/10 text-danger-500">
            <Icon path={UI_ICONS.shield} size={22} />
          </div>
          <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{m.users.title}</h2>
          <p className="text-sm text-gray-500 dark:text-rdia-300">{m.settings.reserved}</p>
        </div>
      </section>
    );
  }

  return (
    // Sous `lg` la page se laisse défiler par <main> : figer sa hauteur
    // enfermerait la liste dans un second ascenseur, illisible au doigt.
    <section className="flex w-full flex-col gap-4 animate-fade-in lg:h-full">
      <div className="carte flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-or-500/15 text-or-500">
          <Icon path={UI_ICONS.users} size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-rdia-600 dark:text-rdia-50">{m.users.title}</h2>
          <p className="text-xs text-gray-500 dark:text-rdia-300">{m.users.subtitle}</p>
        </div>
        <span className="rounded-md bg-or-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-or-500">
          {m.roles[role]}
        </span>
      </div>

      <div className="flex w-fit max-w-full gap-1 overflow-hidden rounded-lg bg-gray-100 p-1 dark:bg-rdia-800/60">
        <TabButton active={tab === "users"} onClick={() => setTab("users")} label={m.users.tab_users} />
        {isSuperAdmin(role) && (
          <TabButton active={tab === "roles"} onClick={() => setTab("roles")} label={m.users.tab_roles} />
        )}
      </div>

      {tab === "users" ? (
        <UsersTab creatorRole={role} currentMatricule={sessionUser?.matricule ?? null} />
      ) : (
        <RolesTab />
      )}
    </section>
  );
}
