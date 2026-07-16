"use client";

import { useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

/** Écran d'attente « Module en préparation » pour les écrans pas encore conçus. */
export function StubScreen({ title }: { title: string }) {
  const t = useDict();
  return (
    <section className="flex animate-fade-in items-center justify-center" style={{ minHeight: "60vh" }}>
      <div className="carte flex flex-col items-center gap-3 p-8 text-center" style={{ maxWidth: 420 }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-or-500/15 text-or-500">
          <Icon path={UI_ICONS.stub} size={22} />
        </div>
        <h2 className="text-base font-bold text-rdia-600 dark:text-rdia-50">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-rdia-300">{t.stub_msg}</p>
      </div>
    </section>
  );
}
