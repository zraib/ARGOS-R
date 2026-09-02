"use client";



// Row label/value inside overlay (theme-aware)
export function Row({
  label,
  val,
  tint,
}: {
  label: string;
  val: string;
  tint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="text-[12px] font-medium text-gray-500 dark:text-rdia-300">{label}</div>
      <div className={`tabular-nums font-bold ${tint}`}>{val}</div>
    </div>
  );
}
