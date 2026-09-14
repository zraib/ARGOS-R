"use client";

import { useDict } from "@/lib/store";
import type { ReceiptState } from "@/lib/comms/receipts";

/**
 * Les coches d'un de mes messages : une (envoyé), deux (remis), deux colorées
 * (lu). Le libellé porte l'état : la couleur ne le dit jamais seule.
 * `bubble` : posée sur la bulle dorée ; `list` : dans le fil du centre.
 */
export function Receipt({ state, tone = "list" }: { state: ReceiptState; tone?: "bubble" | "list" }) {
  const t = useDict();
  const label = state === "read" ? t.ch_read : state === "delivered" ? t.ch_delivered : t.ch_sent;
  const couleur =
    state === "read"
      ? tone === "bubble" ? "text-blue-700" : "text-blue-500"
      : tone === "bubble" ? "text-rdia-900/55" : "text-gray-400 dark:text-rdia-400";
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex shrink-0 items-center ${couleur}`}>
      <svg viewBox="0 0 24 24" width={15} height={12} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {state === "sent" ? (
          <path d="M5 12.5l4.5 4.5L18.5 8" />
        ) : (
          <>
            <path d="M2 12.5l4 4L14.5 8" />
            <path d="M9.5 16.5l1 1L21.5 8" />
          </>
        )}
      </svg>
    </span>
  );
}
