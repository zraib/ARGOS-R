"use client";

import { useEffect, useRef, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Avatar } from "@/components/ui/Avatar";
import { UI_ICONS } from "@/lib/icons";
import { ROLE_ICONS } from "@/lib/roles";

/** Redimensionne un fichier image en data URL carrée (max 256 px) via canvas. */
function fileToDataUrl(file: File, max = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max;
        canvas.height = max;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Paramètres du profil : modifier le nom affiché, la photo de profil et le mot
 * de passe (tout via l'API, audité). L'identité de session est mise à jour.
 */
export default function ProfilPage() {
  const t = useDict();
  const m = useModules();
  const sessionUser = useArgos((s) => s.sessionUser);
  const role = useArgos((s) => s.role);
  const setProfile = useArgos((s) => s.setProfile);
  const showToast = useArgos((s) => s.showToast);

  const [nom, setNom] = useState(sessionUser?.nom ?? "");
  const [photo, setPhoto] = useState<string | undefined>(sessionUser?.photo);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busyPw, setBusyPw] = useState(false);

  // Rafraîchit l'identité depuis l'API au montage (photo non portée par le jeton).
  useEffect(() => {
    api.getProfile().then((r) => {
      const d = r.data as { nom?: string; photo?: string } | undefined;
      if (d) {
        if (d.nom) setNom(d.nom);
        setPhoto(d.photo);
        setProfile({ nom: d.nom, photo: d.photo ?? null });
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nom0 = sessionUser?.nom ?? "";
  const photo0 = sessionUser?.photo;
  const dirty = nom.trim() !== nom0 || photo !== photo0;
  const labelCls = "mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200";
  // 16 px sur mobile : en dessous, iOS zoome au focus et décale la page.
  const champCls = "input-champ text-base md:text-sm";
  // Bouton d'action : 44 px au doigt, densité d'origine au pointeur (≥ lg).
  const actionCls = "btn-primaire min-h-[44px] text-sm lg:min-h-0";

  const pickPhoto = async (file: File) => {
    try {
      const url = await fileToDataUrl(file);
      setPhoto(url);
    } catch {
      showToast(t.pr_photo_err);
    }
  };

  const saveProfile = async () => {
    if (!dirty || savingProfile) return;
    setSavingProfile(true);
    try {
      const patch: { nom?: string; photo?: string | null } = {};
      if (nom.trim() !== nom0) patch.nom = nom.trim();
      if (photo !== photo0) patch.photo = photo ?? null;
      const res = await api.updateProfile(patch);
      if (res.error) { showToast(t.lg_api_down); return; }
      const d = res.data as { nom?: string; photo?: string } | undefined;
      setProfile({ nom: d?.nom, photo: d?.photo ?? null });
      showToast(t.pr_profile_saved);
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (pass.length < 8) { setPwError(m.users.cp_weak); return; }
    if (pass !== confirm) { setPwError(m.users.cp_mismatch); return; }
    setBusyPw(true);
    try {
      const res = await api.changePassword(pass);
      if (res.error) { setPwError(t.lg_api_down); return; }
      setPass(""); setConfirm("");
      showToast(t.pr_saved);
    } finally {
      setBusyPw(false);
    }
  };

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 animate-fade-in">
      {/* Identité éditable : photo + nom affiché */}
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* L'avatar entier déclenche le sélecteur de fichier : la pastille
              d'appareil photo seule ferait une cible de 28 px, intenable au
              doigt. Un <span> à l'intérieur, jamais un bouton imbriqué. */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title={t.pr_photo}
            className="relative shrink-0 rounded-full"
          >
            <Avatar nom={nom || nom0} photo={photo} size={72} />
            <span className="absolute -bottom-1 -end-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-or-500 text-rdia-600 transition-colors hover:bg-or-400 dark:border-rdia-700">
              <Icon path={UI_ICONS.camera} size={13} />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickPhoto(f); e.target.value = ""; }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-xs text-gray-400 dark:text-rdia-300">{sessionUser?.matricule}</div>
            {/* Le libellé de rôle ne se coupe pas : à 375 px, « Retirer la photo »
                passe à la ligne plutôt que de pousser la pastille hors écran. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Pill tone="gold" label={m.roles[role]} />
              {photo && (
                <button className="py-1 text-[11px] font-semibold text-gray-400 hover:text-danger-500" onClick={() => setPhoto(undefined)}>
                  {t.pr_photo_remove}
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t.pr_name}</label>
          <input className={champCls} value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <div className="flex justify-end">
          <button className={actionCls} onClick={() => void saveProfile()} disabled={!dirty || savingProfile}>
            {savingProfile ? "…" : t.pr_submit}
          </button>
        </div>
      </div>

      {/* Rôles du compte */}
      <div className="carte flex flex-col gap-3 p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{t.pr_roles}</h3>
        <div className="flex flex-wrap gap-2">
          {(sessionUser?.roles ?? [role]).map((r) => (
            <span
              key={r}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                r === role
                  ? "border-or-500 bg-or-500/10 text-or-600 dark:text-or-400"
                  : "border-gray-200 text-gray-500 dark:border-rdia-600 dark:text-rdia-300"
              }`}
            >
              <Icon path={ROLE_ICONS[r]} size={13} className="shrink-0" />
              <span className="min-w-0">{m.roles[r]}</span>
              {r === role && <span className="shrink-0 text-[9px] uppercase tracking-wide">· {t.pr_active_role}</span>}
            </span>
          ))}
        </div>
      </div>

      {/* Changement de mot de passe */}
      <div className="carte flex flex-col gap-4 p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">
          <Icon path={UI_ICONS.key} size={15} className="shrink-0 text-or-500" />
          {m.users.cp_title}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>{m.users.cp_new}</label>
            <input type="password" className={champCls} value={pass} onChange={(e) => { setPass(e.target.value); setPwError(null); }} />
          </div>
          <div>
            <label className={labelCls}>{m.users.cp_confirm}</label>
            <input type="password" className={champCls} value={confirm} onChange={(e) => { setConfirm(e.target.value); setPwError(null); }} />
          </div>
        </div>
        {pwError && <p className="text-xs font-semibold text-danger-500">{pwError}</p>}
        <div className="flex justify-end">
          <button className={actionCls} onClick={() => void changePassword()} disabled={busyPw || !pass || !confirm}>
            {busyPw ? "…" : t.pr_pw_submit}
          </button>
        </div>
      </div>
    </section>
  );
}
