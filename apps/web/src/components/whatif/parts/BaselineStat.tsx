"use client";



// ============================================================================
// Sous-composants UI
// ============================================================================
export function BaselineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5 dark:border-rdia-600 dark:bg-rdia-800/40">
      <div className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-rdia-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] font-semibold text-gray-800 dark:text-rdia-100">
        {value}
      </div>
    </div>
  );
}
