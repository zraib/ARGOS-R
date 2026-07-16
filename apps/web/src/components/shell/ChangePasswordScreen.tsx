"use client";

import { useState, type KeyboardEvent } from "react";
import { useArgos, useModules } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { api } from "@/lib/api";

/**
 * Écran de premier login : l'utilisateur remplace son code temporaire par un
 * mot de passe personnel via l'API (`POST /auth/change-password`), ce qui active
 * son compte côté serveur.
 */
export function ChangePasswordScreen() {
  const m = useModules();
  const dark = useArgos((s) => s.dark);
  const sessionUser = useArgos((s) => s.sessionUser);
  const completePasswordChange = useArgos((s) => s.completePasswordChange);
  const showToast = useArgos((s) => s.showToast);

  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (pass.length < 8) {
      setError(m.users.cp_weak);
      return;
    }
    if (pass !== confirm) {
      setError(m.users.cp_mismatch);
      return;
    }
    setBusy(true);
    try {
      const res = await api.changePassword(pass);
      if (res.error) {
        setError(m.users.cp_weak);
        return;
      }
      completePasswordChange();
      showToast(m.users.cp_done);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") void submit();
  };

  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";

  return (
    <section
      className="flex h-screen w-full items-center justify-center p-6"
      style={{
        background: dark
          ? "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.6), transparent 60%), rgb(15 31 20)"
          : "radial-gradient(ellipse at 32% 45%, rgb(27 77 46 / 0.14), transparent 60%), rgb(243 244 246)",
      }}
    >
      <div className="carte flex w-full max-w-sm animate-fade-in-up flex-col gap-5 p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-or-500/15 text-or-500">
            <Icon path={UI_ICONS.key} size={22} />
          </div>
          <div className="text-lg font-bold text-rdia-600 dark:text-rdia-50">{m.users.cp_title}</div>
          <p className="text-xs text-gray-500 dark:text-rdia-300">{m.users.cp_hint}</p>
        </div>

        {sessionUser && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs text-gray-500 dark:bg-rdia-900/40 dark:text-rdia-200">
            <span className="font-semibold text-rdia-600 dark:text-rdia-50">{sessionUser.nom}</span>
            <span className="font-mono"> · {sessionUser.matricule}</span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className={labelCls}>{m.users.cp_new}</label>
            <input type="password" className="input-champ text-sm" value={pass} onChange={(e) => { setPass(e.target.value); setError(null); }} onKeyDown={onKey} autoFocus />
          </div>
          <div>
            <label className={labelCls}>{m.users.cp_confirm}</label>
            <input type="password" className="input-champ text-sm" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(null); }} onKeyDown={onKey} />
          </div>
        </div>

        {error && <p className="text-xs font-semibold text-danger-500">{error}</p>}

        <div className="flex flex-col gap-2">
          <button className="btn-primaire w-full text-sm" onClick={() => void submit()} disabled={busy}>{busy ? "…" : m.users.cp_submit}</button>
        </div>
      </div>
    </section>
  );
}
