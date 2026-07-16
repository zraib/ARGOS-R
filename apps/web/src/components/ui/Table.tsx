import type { ReactNode } from "react";

/** Table dans une carte avec ligne d'en-tête standard. Les lignes utilisent les classes exportées. */
export function Table({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="carte overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-rdia-600">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-start text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const TR = "border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-rdia-700/50 dark:hover:bg-rdia-700/30";
export const TD = "px-4 py-2.5";
export const TD_MUTED = "px-4 py-2.5 text-xs text-gray-600 dark:text-rdia-200";
export const TD_MONO = "px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-rdia-300";
export const TD_STRONG = "px-4 py-2.5 font-medium text-gray-800 dark:text-rdia-50";
