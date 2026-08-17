// ============================================================================
// ARGOS — chargeur de langue à la demande
//
// Seul le français, langue par défaut, est lié statiquement (store). L'anglais
// et l'arabe n'arrivent qu'à la bascule, par import dynamique — chaque branche
// du switch devient un chunk séparé au build. Le store committe le dictionnaire
// ET la langue dans un même set() : dir="rtl" ne peut donc jamais s'appliquer
// avant l'arrivée des libellés arabes. Voir PERF_AUDIT.md § F-11.
// ============================================================================

import type { Lang } from "@/lib/types";
import type { Dict } from "@/lib/i18n/translations";
import type { ModulesDict } from "@/lib/i18n/modules";

export interface LangResources {
  dict: Dict;
  modules: ModulesDict;
}

/** Charge (ou relit du cache de modules) les ressources d'une langue. */
export async function loadLangResources(lang: Lang): Promise<LangResources> {
  switch (lang) {
    case "en": {
      const [t, m] = await Promise.all([
        import("@/lib/i18n/translations.en"),
        import("@/lib/i18n/modules.en"),
      ]);
      return { dict: t.EN_DICT, modules: m.EN_MODULES };
    }
    case "ar": {
      const [t, m] = await Promise.all([
        import("@/lib/i18n/translations.ar"),
        import("@/lib/i18n/modules.ar"),
      ]);
      return { dict: t.AR_DICT, modules: m.AR_MODULES };
    }
    default: {
      const [t, m] = await Promise.all([
        import("@/lib/i18n/translations.fr"),
        import("@/lib/i18n/modules.fr"),
      ]);
      return { dict: t.FR_DICT, modules: m.FR_MODULES };
    }
  }
}
