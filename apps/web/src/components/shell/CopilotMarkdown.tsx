"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ============================================================================
// ARGOS — rendu Markdown des réponses de l'assistant
//
// Module ISOLÉ à dessein. `react-markdown` et ses dépendances (micromark, hast,
// mdast) pèsent ~313 Ko : les importer depuis `Copilot.tsx`, monté sur chaque
// écran par la coquille, rattachait ce poids au bundle de TOUTES les routes —
// pour une modale fermée par défaut.
//
// Séparé ici, le module n'est chargé qu'au premier message de l'assistant,
// c'est-à-dire après ouverture du Copilot ET envoi d'une question. Voir
// PERF_AUDIT.md § F-01.
// ============================================================================

export default function CopilotMarkdown({ children }: { children: string }) {
  return (
    <div className="cp-md text-[13px] leading-relaxed text-gray-800 dark:text-rdia-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 ps-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 ps-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="marker:text-gray-400">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
          h1: ({ children }) => <h1 className="mb-2 mt-3 text-[15px] font-bold">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-3 text-[14px] font-bold">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-1.5 mt-2 text-[13px] font-semibold">{children}</h3>,
          code: ({ children }) => (
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-gray-800 dark:bg-rdia-800 dark:text-rdia-100">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-gray-100 dark:border-rdia-700">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500 dark:bg-rdia-700/40 dark:text-rdia-300">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-left font-semibold dark:border-rdia-700/50">
              {children}
            </th>
          ),
          tbody: ({ children }) => <tbody className="divide-y divide-gray-100 dark:divide-rdia-700/50">{children}</tbody>,
          tr: ({ children }) => <tr className="last:border-0">{children}</tr>,
          td: ({ children }) => (
            <td className="px-2.5 py-1.5 tabular-nums text-gray-700 dark:text-rdia-200">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
