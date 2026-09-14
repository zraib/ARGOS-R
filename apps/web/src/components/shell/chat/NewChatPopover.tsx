"use client";

import { useEffect, useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import type { DirectoryEntry, PresenceUser } from "@/lib/types";

/** Nom lisible d'un compte d'après l'annuaire ; à défaut, son matricule. */
function nomDe(annuaire: readonly DirectoryEntry[], matricule: string): string {
  const u = annuaire.find((x) => x.matricule.toLowerCase() === matricule.toLowerCase());
  return u ? (u.grade ? `${u.grade} ${u.nom}` : u.nom) : matricule;
}

/**
 * Choisir un correspondant : ceux qui sont connectés MAINTENANT en premier —
 * une conversation à chaud se tient avec qui est là — puis l'annuaire, pour
 * laisser un mot à qui ne l'est pas.
 */
export function NewChatPopover({
  offset, bottom, mobile, limit, onClose,
}: {
  offset: number;
  bottom: number;
  mobile: boolean;
  limit: number;
  onClose: () => void;
}) {
  const t = useDict();
  const rtOnline = useArgos((s) => s.rtOnline);
  const sessionUser = useArgos((s) => s.sessionUser);
  const comDirectory = useArgos((s) => s.comDirectory);
  const loadCommsDirectory = useArgos((s) => s.loadCommsDirectory);
  const startChatWith = useArgos((s) => s.startChatWith);
  const showToast = useArgos((s) => s.showToast);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (comDirectory.length === 0) void loadCommsDirectory();
  }, [comDirectory.length, loadCommsDirectory]);

  const moi = sessionUser?.matricule.toLowerCase();
  const filtre = q.trim().toLowerCase();
  const { connectes, annuaire } = useMemo(() => {
    const correspond = (m: string) => !filtre || `${m} ${nomDe(comDirectory, m)}`.toLowerCase().includes(filtre);
    const connectes: PresenceUser[] = rtOnline.filter((u) => u.matricule.toLowerCase() !== moi && correspond(u.matricule));
    const enLigne = new Set(connectes.map((u) => u.matricule.toLowerCase()));
    const annuaire: DirectoryEntry[] = comDirectory.filter(
      (u) => u.matricule.toLowerCase() !== moi && !enLigne.has(u.matricule.toLowerCase()) && correspond(u.matricule),
    );
    return { connectes, annuaire };
  }, [rtOnline, comDirectory, moi, filtre]);

  const choisir = async (matricule: string) => {
    if (busy) return;
    setBusy(matricule);
    try {
      await startChatWith(matricule, limit);
      onClose();
    } catch (err: unknown) {
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const ligne = (matricule: string, sousTitre: string, online: boolean) => (
    <button
      key={matricule}
      type="button"
      onClick={() => void choisir(matricule)}
      disabled={busy !== null}
      className="flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-start transition-colors hover:bg-or-500/10 disabled:opacity-50"
    >
      <span className="relative shrink-0">
        <Avatar nom={nomDe(comDirectory, matricule)} size={30} />
        <span
          aria-hidden="true"
          className={`absolute h-2.5 w-2.5 rounded-full border-2 border-white dark:border-rdia-700 ${online ? "bg-green-500" : "bg-gray-400"}`}
          style={{ bottom: -1, insetInlineEnd: -1 }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-gray-800 dark:text-rdia-50">{nomDe(comDirectory, matricule)}</span>
        <span className="block truncate text-[11px] text-gray-400 dark:text-rdia-400">{sousTitre}</span>
      </span>
    </button>
  );

  return (
    <div
      role="dialog"
      aria-label={t.ch_new}
      className={`anim-fenetre-in fixed z-40 flex max-h-[min(420px,60dvh)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-rdia-600 dark:bg-rdia-700 ${
        mobile ? "inset-x-2" : "w-[300px]"
      }`}
      style={{ bottom, insetInlineEnd: mobile ? undefined : offset }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-rdia-600">
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300">{t.ch_new}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.cp_close}
          className="cible-tactile -me-1.5 flex shrink-0 items-center justify-center rounded-lg text-gray-400 hover:text-or-500 lg:min-h-0 lg:min-w-0 lg:p-1"
        >
          <Icon path={UI_ICONS.close} size={14} strokeWidth={2.2} />
        </button>
      </div>
      <div className="shrink-0 px-3 pt-2">
        <input
          className="input-champ w-full text-base md:text-sm"
          placeholder={t.ch_search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={!mobile}
          aria-label={t.ch_search}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {connectes.length > 0 && (
          <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-green-600">{t.ch_online_now}</div>
        )}
        {connectes.map((u) => ligne(u.matricule, u.role, true))}
        {annuaire.length > 0 && (
          <div className="px-3 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{t.ch_directory}</div>
        )}
        {annuaire.map((u) => ligne(u.matricule, u.matricule, false))}
        {connectes.length === 0 && annuaire.length === 0 && (
          <p className="px-3 py-5 text-center text-[12px] text-gray-400 dark:text-rdia-400">{t.ch_nobody}</p>
        )}
      </div>
    </div>
  );
}
