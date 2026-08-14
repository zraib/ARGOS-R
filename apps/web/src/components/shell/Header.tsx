"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { Avatar } from "@/components/ui/Avatar";
import { LanguageMenu } from "@/components/shell/LanguageMenu";
import { UI_ICONS } from "@/lib/icons";
import { ROLE_ICONS, type Role } from "@/lib/roles";
import { ALERT_LEVEL } from "@/lib/config";
import { screenTitle } from "@/lib/nav";
import type { Dict } from "@/lib/i18n/translations";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Horloge HH:MM:SS, isolée pour que son tick d'1 s ne re-rende pas l'en-tête. */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="whitespace-nowrap font-mono text-sm tabular-nums text-gray-500 dark:text-rdia-200">
      {now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--"}
    </span>
  );
}

const ALERT_STYLES: Record<number, string> = {
  1: "bg-green-500/10 text-green-600",
  2: "bg-or-500/15 text-or-500",
  3: "bg-or-500/20 text-or-500",
  4: "bg-danger-500/15 text-danger-500",
};

function alertLabel(t: Dict) {
  return { 1: t.lvl1, 2: t.lvl2, 3: t.lvl3, 4: t.lvl4 }[ALERT_LEVEL];
}

/**
 * Bloc utilisateur du header : avatar (initiales), nom + rôle, menu déroulant
 * (Paramètres du profil, Se déconnecter). Fermé au clic extérieur / Échap.
 */
function UserMenu() {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const sessionUser = useArgos((s) => s.sessionUser);
  const role = useArgos((s) => s.role);
  const logout = useArgos((s) => s.logout);
  const switchRole = useArgos((s) => s.switchRole);
  const showToast = useArgos((s) => s.showToast);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const nom = sessionUser?.nom ?? "—";
  const roles = sessionUser?.roles ?? [];

  // Bascule de rôle À CHAUD (comptes multi-rôles) : nouveau jeton via l'API,
  // contexte rechargé — sans déconnexion.
  const doSwitch = async (r: Role) => {
    if (switching || r === role) return;
    setSwitching(true);
    try {
      const ok = await switchRole(r);
      if (ok) {
        showToast(m.users.role_switched + m.roles[r]);
        setOpen(false);
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-rdia-700/60"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar nom={nom} photo={sessionUser?.photo} size={36} />
        <span className="min-w-0 text-start max-[980px]:hidden">
          <span className="block max-w-[160px] truncate text-xs font-semibold text-rdia-600 dark:text-rdia-50">{nom}</span>
          <span className="block text-[10px] text-gray-400 dark:text-rdia-300">{m.roles[role]}</span>
        </span>
        <Icon
          path={UI_ICONS.chevronRight}
          size={12}
          strokeWidth={2.2}
          className="shrink-0 text-gray-400 transition-transform duration-150 dark:text-rdia-300"
          style={{ transform: open ? "rotate(-90deg)" : "rotate(90deg)" }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl dark:border-rdia-600 dark:bg-rdia-700"
          style={{ insetInlineEnd: 0 }}
        >
          <div className="border-b border-gray-100 px-4 py-2.5 dark:border-rdia-600">
            <div className="truncate text-xs font-semibold text-rdia-600 dark:text-rdia-50">{nom}</div>
            <div className="truncate font-mono text-[10px] text-gray-400 dark:text-rdia-300">{sessionUser?.matricule}</div>
          </div>
          {/* Bascule de rôle (uniquement pour les comptes multi-rôles) */}
          {roles.length > 1 && (
            <div className="border-b border-gray-100 py-1 dark:border-rdia-600">
              <div className="px-4 pb-0.5 pt-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                {m.users.switch_role}
              </div>
              {roles.map((r) => (
                <button
                  key={r}
                  role="menuitem"
                  disabled={switching || r === role}
                  onClick={() => void doSwitch(r)}
                  className={`flex w-full items-center gap-2.5 px-4 py-1.5 text-xs font-medium transition-colors ${
                    r === role
                      ? "cursor-default text-or-600 dark:text-or-400"
                      : "text-gray-600 hover:bg-or-500/10 hover:text-or-600 disabled:opacity-50 dark:text-rdia-100 dark:hover:text-or-400"
                  }`}
                >
                  <Icon path={ROLE_ICONS[r]} size={14} className={r === role ? "text-or-500" : "text-gray-400 dark:text-rdia-300"} />
                  <span className="flex-1 truncate text-start">{m.roles[r]}</span>
                  {r === role && <Icon path={UI_ICONS.check} size={12} strokeWidth={3} className="text-or-500" />}
                </button>
              ))}
            </div>
          )}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-or-500/10 hover:text-or-600 dark:text-rdia-100 dark:hover:text-or-400"
            onClick={() => { setOpen(false); router.push("/profil"); }}
          >
            <Icon path={UI_ICONS.users} size={14} />
            {t.pr_settings}
          </button>
          <button
            role="menuitem"
            className="flex w-full items-center gap-2.5 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-danger-500/10 hover:text-danger-500 dark:text-rdia-100"
            onClick={() => { setOpen(false); logout(); }}
          >
            <Icon path={UI_ICONS.logout} size={14} />
            {t.logout}
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const t = useDict();
  const m = useModules();
  const pathname = usePathname();
  const dark = useArgos((s) => s.dark);
  const toggleTheme = useArgos((s) => s.toggleTheme);
  const toggleSidebar = useArgos((s) => s.toggleSidebar);
  const ticker = useArgos((s) => s.feed[0]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 dark:border-rdia-700 dark:bg-rdia-800">
      {/* Gauche : bascule barre latérale + titre de l'écran */}
      <div className="flex shrink-0 items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
          aria-label="Basculer la barre latérale"
        >
          <Icon path={UI_ICONS.sidebar} size={18} />
        </button>
        <h1 className="max-w-[240px] truncate text-lg font-bold text-rdia-600 dark:text-rdia-50">
          {screenTitle(pathname, t)}
        </h1>
      </div>

      {/* Centre : fil des événements + niveau d'alerte + horloge (centré, sans chevauchement) */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3 max-[980px]:hidden">
        <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 max-[1240px]:hidden dark:bg-rdia-900/40">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger-500" />
          <span className="max-w-[260px] truncate font-mono text-xs text-gray-600 dark:text-rdia-200">
            {ticker ? `${ticker.time} — ${ticker.txt}` : ""}
          </span>
        </div>
        <span className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-bold ${ALERT_STYLES[ALERT_LEVEL]}`}>
          {alertLabel(t)}
        </span>
        <Clock />
      </div>

      {/* Droite : langue (globe) + thème + menu utilisateur */}
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <LanguageMenu />
        <button
          onClick={toggleTheme}
          title="Mode clair / sombre"
          className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:text-rdia-200 dark:hover:bg-rdia-700/60 dark:hover:text-or-400"
        >
          <Icon path={dark ? UI_ICONS.sun : UI_ICONS.moon} size={18} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
