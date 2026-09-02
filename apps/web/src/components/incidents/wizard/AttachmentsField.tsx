"use client";

import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { useDict } from "@/lib/store";
import { labelCls } from "./styles";

/** Pièces jointes : seuls les noms sont retenus dans le brouillon (le versement viendra avec MinIO). */
export function AttachmentsField({ files, onAdd }: { files: string[]; onAdd: (names: string[]) => void }) {
  const t = useDict();
  return (
    <div>
      <label className={labelCls}>{t.f_attach}</label>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-5 text-gray-400 transition-colors hover:border-or-500/50 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-400">
        <Icon path={UI_ICONS.upload} size={22} strokeWidth={1.6} />
        <span className="text-xs">{t.f_attach_hint}</span>
        <input type="file" className="hidden" multiple onChange={(e) => onAdd(Array.from(e.target.files ?? []).map((x) => x.name))} />
      </label>
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((name, i) => (
            <span key={`${name}-${i}`} className="rounded-md bg-or-500/15 px-2 py-1 text-[10px] font-semibold text-or-500">
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
