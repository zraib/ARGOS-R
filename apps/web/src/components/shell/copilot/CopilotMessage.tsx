"use client";

import { Suspense, lazy, useCallback, useMemo } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { Pill } from "@/components/ui/Pill";
import { useDict, type AiMessage, useModules, useArgos } from "@/lib/store";
import type { Incident, Lang } from "@/lib/types";
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
import {
  buildPdfReport,
  isReportableMessage,
  triggerDownloadPdf,
  type PdfLabels,
} from "@/lib/ai/copilot/pdf";

// Le rendu Markdown (marked + sanitisation) n'est chargé qu'avec le premier message.
const CopilotMarkdown = lazy(() => import("@/components/shell/CopilotMarkdown"));

function findPreviousUserMessage(currentId: string): AiMessage | undefined {
  const log = useArgos.getState().aiLog;
  let i = log.findIndex(m => m.id === currentId);
  while (i > 0) {
    i--;
    if (log[i].role === "user") return log[i];
  }
  return undefined;
}

const LOCALE_BY_LANG: Record<Lang, string> = {
  fr: "fr-FR",
  en: "en-GB",
  ar: "ar-MA",
};

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
  const m = useModules();
  const showToast = useArgos(s => s.showToast);
  const sessionUser = useArgos(s => s.sessionUser);
  const lang = useArgos(s => s.lang);
  const canExport = useMemo(() => isReportableMessage(msg), [msg]);

  const onExportPdf = useCallback(() => {
    if (!canExport) return;
    const userMsg = findPreviousUserMessage(msg.id);
    try {
      showToast(t.cp_pdf_generating);
      // —— Debug anti « ?? » : loggue les premiers codepoints du markdown si
      //    on voit des caractères de contrôle en début de texte.
      if (process.env.NODE_ENV !== "production") {
        const prefix = (msg.text ?? "").slice(0, 10);
        const cps = [...prefix].map(c => {
          const n = c.codePointAt(0) ?? 0;
          return `U+${n.toString(16).toUpperCase().padStart(4, "0")}`;
        });
        console.debug("[PDF Export] premiers caractères msg.text :", cps, "→", JSON.stringify(prefix));
        if (userMsg?.text) {
          const cp2 = [...userMsg.text.slice(0, 10)].map(c => {
            const n = c.codePointAt(0) ?? 0;
            return `U+${n.toString(16).toUpperCase().padStart(4, "0")}`;
          });
          console.debug("[PDF Export] premiers caractères requête user :", cp2);
        }
      }
      const labels: PdfLabels = {
        kv: m.pdf.kv,
        footer: m.pdf.footer,
        fallback: m.pdf.fallback,
        intent: m.pdf.intent,
        kpi: m.pdf.kpi,
        tables: m.pdf.tables,
        locale: LOCALE_BY_LANG[lang],
      };
      const report = buildPdfReport(msg, userMsg?.text, {
        operatorName: sessionUser?.nom ?? labels.fallback.operator,
        labels,
      });
      triggerDownloadPdf(report);
      showToast(t.cp_pdf_download);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "erreur inattendue";
      showToast(`${t.cp_pdf_failed} : ${detail}`);
    }
  }, [canExport, msg, t, m, lang, showToast, sessionUser]);

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
        {canExport && (
          <button
            type="button"
            onClick={onExportPdf}
            title={t.cp_pdf_export}
            className="ml-1 inline-flex h-6 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-[10px] font-medium text-gray-600 shadow-sm transition hover:border-or-500/60 hover:bg-or-500/5 hover:text-or-600 dark:border-rdia-700/60 dark:bg-rdia-800/70 dark:text-rdia-300 dark:hover:border-or-500/60 dark:hover:bg-or-500/10 dark:hover:text-or-300"
          >
            <Icon path={UI_ICONS.download} size={11} />
            {t.cp_pdf_export}
          </button>
        )}
        <span className="ms-auto font-mono text-[10px] text-gray-300 dark:text-rdia-500">{msg.at}</span>
        {msg.refused && <Pill tone="red" label={t.cp_refused} size="sm" />}
      </div>
      {msg.llmError && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:text-amber-400/90">
          ℹ️ {t.cp_error_friendly}
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
