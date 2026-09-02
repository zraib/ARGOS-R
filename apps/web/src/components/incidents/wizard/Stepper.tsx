"use client";

// Quatre colonnes égales : espacement uniforme entre les étapes. Sous `sm` les
// libellés ne tiennent pas côte à côte (375 px ÷ 4 ≈ 85 px) : on ne garde que
// les pastilles numérotées, et le libellé de l'étape en cours est rappelé sur
// la ligne du dessous.
export function Stepper({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div>
      <div className="grid grid-cols-4">
        {steps.map((label, i) => {
          const num = i + 1;
          const done = step > num;
          const current = step === num;
          return (
            <div key={label} className="flex items-center justify-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done ? "bg-green-500 text-white" : current ? "bg-or-500 text-rdia-600" : "bg-gray-200 text-gray-500 dark:bg-rdia-600 dark:text-rdia-300"
                }`}
              >
                {num}
              </span>
              <span className={`hidden text-xs sm:inline ${current ? "font-bold text-or-500" : "text-gray-400 dark:text-rdia-400"}`}>{label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-center text-sm font-bold text-or-500 sm:hidden">{steps[step - 1]}</div>
    </div>
  );
}
