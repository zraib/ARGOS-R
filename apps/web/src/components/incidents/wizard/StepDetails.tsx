"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict, type ArgosState } from "@/lib/store";
import type { WizardForm } from "@/lib/incidents/wizard";
import type { Lang } from "@/lib/types";
import { AttachmentsField } from "./AttachmentsField";
import { KeywordChips } from "./KeywordChips";
import { NrbcSection } from "./NrbcSection";
import { fieldCls, labelCls } from "./styles";
import type { DraftGeneration } from "./useDraftGeneration";
import type { WizardActions } from "./useWizardForm";

/**
 * Étape 2 — détails, en un seul chemin :
 *   1. les mots-clés, un par un ;
 *   2. UN bouton « Générer par IA » (« Régénérer » ensuite) ;
 *   3. tant que rien n'est généré, titre et description restent masqués ;
 *   4. générés, ils apparaissent, éditables, chacun avec sa paraphrase.
 */
export function StepDetails({
  form,
  actions,
  ai,
  lang,
  nrbcSubstances,
}: {
  form: WizardForm;
  actions: WizardActions;
  ai: DraftGeneration;
  lang: Lang;
  nrbcSubstances: ArgosState["nrbcSubstances"];
}) {
  const t = useDict();
  const regenBtn = "inline-flex items-center gap-1 rounded-md border border-or-500/30 bg-or-500/10 px-2 py-0.5 text-[10px] font-semibold text-or-700 transition-colors hover:bg-or-500/20 disabled:cursor-not-allowed disabled:opacity-40 dark:text-or-300";
  return (
    <div className="flex flex-col gap-4">
      <KeywordChips
        keywords={form.keywords}
        draft={form.keywordDraft}
        onDraft={(v) => actions.patch({ keywordDraft: v })}
        onKey={actions.onKeywordKey}
        onAdd={actions.addKeyword}
        onRemove={actions.removeKeyword}
      />

      <button
        type="button"
        onClick={() => void ai.runAiGenerate()}
        disabled={!form.type || form.keywords.length === 0 || ai.aiBusy}
        className="btn-primaire inline-flex items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon path={ai.aiBusy ? UI_ICONS.refresh : UI_ICONS.sparkles} size={15} className={ai.aiBusy ? "animate-spin" : ""} />
        {ai.aiBusy ? "…" : ai.aiGenerated ? t.f_ai_regenerate : t.f_ai_generate}
      </button>

      {ai.aiGenerated ? (
        <div className="flex flex-col gap-4 rounded-xl border border-or-500/15 bg-or-500/[0.03] p-3 dark:border-or-500/20 dark:bg-or-500/[0.05]">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-or-600 dark:text-or-300">
            <Icon path={UI_ICONS.sparkles} size={13} /> AI · {t.f_generated_hint}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className={labelCls}>{t.f_generated_title}</label>
              <button type="button" onClick={() => void ai.regenTitle()} disabled={ai.aiBusyT || ai.aiBusy} className={regenBtn}>
                <Icon path={ai.aiBusyT ? UI_ICONS.refresh : UI_ICONS.sparkles} size={11} className={ai.aiBusyT ? "animate-spin" : ""} />
                {ai.aiBusyT ? t.f_ai_busy_title : t.f_ai_regen_title}
              </button>
            </div>
            <input className={`${fieldCls} min-w-0`} value={form.title} onChange={(e) => actions.patch({ title: e.target.value })} placeholder="Titre de l'incident…" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className={labelCls}>{t.f_generated_desc}</label>
              <button type="button" onClick={() => void ai.regenDesc()} disabled={ai.aiBusyD || ai.aiBusy} className={regenBtn}>
                <Icon path={ai.aiBusyD ? UI_ICONS.refresh : UI_ICONS.sparkles} size={11} className={ai.aiBusyD ? "animate-spin" : ""} />
                {ai.aiBusyD ? t.f_ai_busy_desc : t.f_ai_regen_desc}
              </button>
            </div>
            <textarea className={fieldCls} rows={4} value={form.desc} onChange={(e) => actions.patch({ desc: e.target.value })} placeholder="Description de l'incident (2 lignes)…" />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:border-rdia-600/60 dark:bg-white/[0.02] dark:text-rdia-400">
          {t.f_ai_generate}
          {" → "}
          <span className="text-gray-500 dark:text-rdia-300">
            {t.f_title} + {t.f_desc}
          </span>
        </div>
      )}

      {form.type === "nrbc" && <NrbcSection form={form} lang={lang} substances={nrbcSubstances} onChange={actions.patch} />}

      <AttachmentsField files={form.files} onAdd={(names) => actions.update((f) => ({ files: [...f.files, ...names] }))} />
    </div>
  );
}
