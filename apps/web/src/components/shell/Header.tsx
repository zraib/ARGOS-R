"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
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
    <span className="whitespace-nowrap font-mono text-sm tabular-nums text-gray-500 max-[1180px]:hidden dark:text-rdia-200">
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

export function Header() {
  const t = useDict();
  const pathname = usePathname();
  const toggleSidebar = useArgos((s) => s.toggleSidebar);
  const openWizard = useArgos((s) => s.openWizard);
  const ticker = useArgos((s) => s.feed[0]);

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6 dark:border-rdia-700 dark:bg-rdia-800">
      <button
        onClick={toggleSidebar}
        className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-or-500 dark:hover:bg-rdia-600"
        aria-label="Basculer la barre latérale"
      >
        <Icon path={UI_ICONS.sidebar} size={18} />
      </button>

      <h1 className="shrink-0 whitespace-nowrap text-lg font-bold text-rdia-600 dark:text-rdia-50">
        {screenTitle(pathname, t)}
      </h1>

      <div className="min-w-0 flex-1" />

      <div className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 max-[860px]:hidden dark:bg-rdia-900/40">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger-500" />
        <span className="truncate font-mono text-xs text-gray-600 dark:text-rdia-200">
          {ticker ? `${ticker.time} — ${ticker.txt}` : ""}
        </span>
      </div>

      <span className={`whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-bold max-[1040px]:hidden ${ALERT_STYLES[ALERT_LEVEL]}`}>
        {alertLabel(t)}
      </span>

      <Clock />

      <button className="btn-primaire whitespace-nowrap text-sm" onClick={openWizard}>
        {t.report}
      </button>
    </header>
  );
}
