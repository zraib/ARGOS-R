// Classes partagées par les étapes de l'assistant. 16 px sur mobile : sous ce
// seuil iOS zoome automatiquement au focus et décale toute la modale ; la
// densité d'origine (14 px) revient à partir de md.
export const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
export const fieldCls = "input-champ text-base md:text-sm";
export const sectionCls = "mb-2 text-xs font-bold uppercase tracking-wide text-rdia-500 dark:text-rdia-300";
export const choiceCls = (selected: boolean) =>
  `rounded-lg border-2 px-2 py-2 text-xs font-semibold transition-colors ${
    selected ? "border-or-500 bg-or-500/10 text-or-500" : "border-gray-200 text-gray-500 hover:border-or-500/40 dark:border-rdia-600 dark:text-rdia-300"
  }`;
