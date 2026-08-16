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
  return <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>;
}
