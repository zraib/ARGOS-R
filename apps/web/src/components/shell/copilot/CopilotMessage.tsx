"use client";

import { Suspense, lazy } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS } from "@/lib/icons";
import { Pill } from "@/components/ui/Pill";
import { useDict, type AiMessage } from "@/lib/store";
import type { Incident } from "@/lib/types";
import { StatsGrid } from "./blocks/StatsGrid";
import { IncidentsBlock } from "./blocks/IncidentsBlock";
import { UnitsBlock } from "./blocks/UnitsBlock";
import { HospitalsBlock } from "./blocks/HospitalsBlock";
import { EquipmentBlock } from "./blocks/EquipmentBlock";
import { QuakesBlock } from "./blocks/QuakesBlock";
import { CrossBlock } from "./blocks/CrossBlock";
import { MapAction } from "./blocks/MapAction";
import { SuggestionChips } from "./blocks/SuggestionChips";
import type { MapFocusAction } from "./mapFocus";

// Le rendu Markdown (marked + sanitisation) n'est chargé qu'avec le premier message.
const CopilotMarkdown = lazy(() => import("@/components/shell/CopilotMarkdown"));

/** Un message du fil : bulle de l'opérateur, ou réponse avec ses blocs structurés. */
export function CopilotMessage({
  msg,
  incidents,
  busy,
  onAsk,
  onFocus,
}: {
  msg: AiMessage;
  incidents: Incident[];
  busy: boolean;
  onAsk: (query: string) => void;
  onFocus: (a: MapFocusAction) => void;
}) {
  const t = useDict();
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-2xl rounded-br-sm bg-rdia-600 px-3.5 py-2 text-sm text-white dark:bg-or-500 dark:text-rdia-900">
          {msg.text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-or-500/15 text-or-500">
          <Icon path={NAV_ICONS.assistant} size={13} />
        </div>
        {msg.provider && (
          <span className="font-mono text-[9px] text-gray-500 dark:text-rdia-400 max-w-[60%] truncate">
            {msg.provider}
          </span>
        )}
        {msg.deterministic && (
          <Pill tone="amber" label={t.cp_data_only} size="sm" />
        )}
        <span className="ms-auto font-mono text-[10px] text-gray-300 dark:text-rdia-500">{msg.at}</span>
        {msg.refused && <Pill tone="red" label={t.cp_refused} size="sm" />}
      </div>
      {msg.llmError && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400/90">
          ℹ️ Synthèse LLM indisponible : {msg.llmError}
        </div>
      )}
      <div className="rounded-2xl rounded-tl-sm bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-gray-100 dark:bg-rdia-800/70 dark:ring-rdia-700/60">
        <div className="ai-markdown prose prose-sm max-w-none text-sm leading-relaxed text-gray-800 dark:text-rdia-50 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-ol:my-1 prose-strong:text-gray-900 dark:prose-invert dark:prose-strong:text-rdia-0 prose-blockquote:text-rdia-600 dark:prose-blockquote:text-rdia-200 prose-blockquote:border-l-or-500 prose-table:my-2 prose-th:bg-gray-50 dark:prose-th:bg-rdia-700/40 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-gray-200 dark:prose-border-rdia-700">
          <Suspense fallback={<p className="whitespace-pre-wrap">{msg.text || ""}</p>}>
            <CopilotMarkdown>{msg.text || ""}</CopilotMarkdown>
          </Suspense>
        </div>

        {msg.stats?.items && msg.stats.items.length > 0 && <StatsGrid stats={msg.stats} />}
        {msg.incidents && msg.incidents.length > 0 && <IncidentsBlock rows={msg.incidents} />}
        {msg.units && msg.units.length > 0 && <UnitsBlock rows={msg.units} />}
        {msg.hospitals && msg.hospitals.length > 0 && <HospitalsBlock rows={msg.hospitals} />}
        {msg.equipment && msg.equipment.length > 0 && <EquipmentBlock rows={msg.equipment} />}
        {msg.quakes && msg.quakes.length > 0 && <QuakesBlock rows={msg.quakes} />}
        {msg.cross && <CrossBlock cross={msg.cross} />}
        <MapAction msg={msg} incidents={incidents} busy={busy} onFocus={onFocus} />
        <SuggestionChips msg={msg} incidents={incidents} busy={busy} onAsk={onAsk} onFocus={onFocus} />
      </div>
    </div>
  );
}
