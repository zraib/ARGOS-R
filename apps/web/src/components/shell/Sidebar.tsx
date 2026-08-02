"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { NAV, HREF, navLabel, type GroupKey, type NavGroup, type NavItem } from "@/lib/nav";

export function Sidebar() {
  const t = useDict();
  const pathname = usePathname();
  const router = useRouter();
  const sbOpen = useArgos((s) => s.sbOpen);
  const dark = useArgos((s) => s.dark);
  const navGroups = useArgos((s) => s.navGroups);
  const toggleNavGroup = useArgos((s) => s.toggleNavGroup);
  const openNavGroup = useArgos((s) => s.openNavGroup);
  const incidents = useArgos((s) => s.incidents);
  const role = useArgos((s) => s.role);
  const flags = useArgos((s) => s.flags);
  const roleFeatures = useArgos((s) => s.roleFeatures);

  // Un module est visible s'il n'est pas coupé par un feature flag global et
  // s'il est autorisé pour le rôle actif (matrice rôle→fonctionnalités).
  const moduleVisible = (key: string) => flags[key] !== false && roleFeatures[role]?.[key] !== false;

  const collapsed = !sbOpen;
  const activeInc = incidents.filter((i) => i.st !== "closed").length;
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const inactiveCls = "text-gray-500 hover:bg-or-500/10 hover:text-or-500 dark:text-rdia-200 dark:hover:bg-or-500/5 dark:hover:text-or-300";
  const activeCls = "bg-or-500/15 text-or-500 dark:text-or-400";

  const groupChildActive = (g: NavGroup) => g.children.some((c) => isActive(c.href));

  const renderItem = (it: NavItem, child = false) => {
    const active = isActive(it.href);
    if (collapsed) {
      return (
        <Link
          key={it.key}
          href={it.href}
          title={navLabel(it.key, t)}
          className={`flex w-full items-center justify-center rounded-lg py-2.5 transition-colors ${active ? activeCls : inactiveCls}`}
        >
          <Icon path={it.icon} size={17} />
        </Link>
      );
    }
    if (child) {
      return (
        <Link
          key={it.key}
          href={it.href}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            active ? "text-or-500 dark:text-or-400" : "text-gray-500 hover:text-or-500 dark:text-rdia-200 dark:hover:text-or-300"
          }`}
          style={{ paddingInlineStart: 38 }}
        >
          <span className="flex-1 truncate text-start">{navLabel(it.key, t)}</span>
        </Link>
      );
    }
    return (
      <Link
        key={it.key}
        href={it.href}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${active ? activeCls : inactiveCls}`}
      >
        <Icon path={it.icon} size={17} className="shrink-0" />
        <span className="flex-1 truncate text-start">{navLabel(it.key, t)}</span>
        {it.key === "incidents" && activeInc > 0 && (
          <span className="rounded-full bg-danger-500 px-2 py-0.5 text-[10px] font-bold text-white">{activeInc}</span>
        )}
      </Link>
    );
  };

  const renderGroup = (g: NavGroup) => {
    if (collapsed) {
      return (
        <button
          key={g.key}
          title={navLabel(g.key, t)}
          onClick={() => {
            openNavGroup(g.key as GroupKey);
            router.push(g.children[0].href);
          }}
          className={`flex w-full items-center justify-center rounded-lg py-2.5 transition-colors ${groupChildActive(g) ? activeCls : inactiveCls}`}
        >
          <Icon path={g.icon} size={17} />
        </button>
      );
    }
    const open = navGroups[g.key];
    return (
      <div key={g.key}>
        <button
          onClick={() => toggleNavGroup(g.key)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
            !open && groupChildActive(g) ? activeCls : inactiveCls
          }`}
        >
          <Icon path={g.icon} size={17} className="shrink-0" />
          <span className="flex-1 truncate text-start">{navLabel(g.key, t)}</span>
          <Icon
            path={UI_ICONS.chevronRight}
            size={12}
            strokeWidth={2.2}
            className="shrink-0 transition-transform duration-150"
            style={{ transform: open ? "rotate(90deg)" : undefined }}
          />
        </button>
        {open && <div className="mt-0.5 flex flex-col gap-0.5">{g.children.map((c) => renderItem(c, true))}</div>}
      </div>
    );
  };

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden ${dark ? "text-rdia-50" : "bg-white text-rdia-600"}`}
      style={{
        width: sbOpen ? 256 : 64,
        backgroundColor: dark ? "rgb(15 45 26)" : undefined,
        transition: "width .2s ease, background-color .2s ease",
        borderInlineEnd: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "#E5E7EB"}`,
      }}
    >
      {/* Brand */}
      <div
        className={sbOpen ? "flex items-center gap-3 border-b px-4 py-4" : "flex items-center justify-center border-b py-4"}
        style={{ borderColor: dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" }}
      >
        <Image src="/argos-logo.png" alt="ARGOS" width={48} height={48} className={sbOpen ? "h-12 w-12 shrink-0" : "h-9 w-9 shrink-0"} style={{ objectFit: "contain" }} />
        {sbOpen && (
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight tracking-wide">{t.app}</div>
            <div className={`mt-0.5 text-[10px] uppercase tracking-wider ${dark ? "text-rdia-300" : "text-gray-400"}`}>{t.appSub}</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV.map((e) => {
          if (e.kind === "item") {
            if (e.roles && !e.roles.includes(role)) return null;
            if (!moduleVisible(e.key)) return null;
            return renderItem(e);
          }
          // Groupe : filtrer ses enfants (flags + rôle) ; masquer le groupe si vide.
          const children = e.children.filter((c) => moduleVisible(c.key));
          if (children.length === 0) return null;
          return renderGroup({ ...e, children });
        })}
      </nav>
      {/* Identité, thème, langue et déconnexion vivent dans l'en-tête
          (`Header`) — pas de doublon ici. */}
    </aside>
  );
}
