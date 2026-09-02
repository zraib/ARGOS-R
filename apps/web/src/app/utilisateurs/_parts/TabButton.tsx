"use client";



export function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-11 rounded-md px-3 py-2.5 text-xs font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
        active ? "bg-white text-or-600 shadow-sm dark:bg-rdia-600 dark:text-or-400" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
      }`}
    >
      {label}
    </button>
  );
}
