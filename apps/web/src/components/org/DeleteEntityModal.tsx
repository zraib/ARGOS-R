"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { isSuperAdmin } from "@/lib/roles";
import { canDeleteUnit } from "@/lib/mode";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Suppression définitive d'une entité — unité, abri, site mortuaire, hôpital,
// hôpital de campagne (ADR 0015, ADR 0030)
//
// Même barrière que pour un incident : recopier l'identifiant prouve qu'on a
// lu ce qu'on supprime. S'y ajoute ce que l'API dit : quand l'entité est
// RETENUE (engagée, occupée, avec des corps au registre, tenue par un compte),
// le serveur répond 409 avec la liste des garde-fous ; l'opérateur les lit,
// et choisit — en cochant qu'il passe outre — de forcer ou de renoncer.
//
// L'API reste l'autorité : le bouton n'est rendu qu'à qui détient la
// permission servie (`<entité>:delete` — le Super Administrateur et, au profil
// direx, ceux qui créent : ADR 0030) ou, pour une unité, la règle de mode ;
// ce n'est qu'un masque sur un refus de toute façon servi.
// ============================================================================

export type DeletableKind = "unit" | "shelter" | "morgue" | "hospital" | "field_hospital";

const REMOVE: Record<DeletableKind, (id: string, force: boolean) => ReturnType<typeof api.deleteUnit>> = {
  unit: (id, force) => api.deleteUnit(id, force),
  shelter: (id, force) => api.deleteShelter(id, force),
  morgue: (id, force) => api.deleteMorgue(id, force),
  hospital: (id, force) => api.deleteHospital(id, force),
  field_hospital: (id, force) => api.deleteFieldHospital(id, force),
};
/** Libellé du geste, par nature d'entité. */
const DEL_LABEL = (t: ReturnType<typeof useDict>): Record<DeletableKind, string> => ({
  unit: t.del_unit, shelter: t.del_shelter, morgue: t.del_morgue, hospital: t.del_hospital, field_hospital: t.del_field_hospital,
});
/** Permission servie qui ouvre le geste — l'unité suit, elle, la règle de mode (ADR 0016). */
const DEL_PERMISSION: Record<Exclude<DeletableKind, "unit">, string> = {
  shelter: "shelters:delete", morgue: "morgue:delete", hospital: "hospinet:delete", field_hospital: "hospinet:delete",
};

interface DeleteEntityModalProps {
  kind: DeletableKind;
  id: string;
  name: string;
  onCancel: () => void;
  /** Appelé après la suppression, la modale déjà refermée par le parent. */
  onDeleted: () => void;
}

export function DeleteEntityModal({ kind, id, name, onCancel, onDeleted }: DeleteEntityModalProps) {
  const t = useDict();
  const showToast = useArgos((s) => s.showToast);
  const loadDomain = useArgos((s) => s.loadDomain);
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [force, setForce] = useState(false);
  const champId = useId();
  const aideId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const exact = code === id;
  const invalide = touched && code.length > 0 && !exact;
  const titre = DEL_LABEL(t)[kind];

  const supprimer = async () => {
    if (!exact || busy || (blockers && !force)) return;
    setBusy(true);
    setErreur(null);
    const res = await REMOVE[kind](id, force);
    if (res.error) {
      const err = res.error as { statusCode?: number; message?: string | string[]; blockers?: string[] };
      if (err.statusCode === 409 && Array.isArray(err.blockers)) {
        // Retenue : on montre ce qui retient, et on laisse le choix de forcer.
        setBlockers(err.blockers);
        setForce(false);
      } else if (err.statusCode === 403) {
        setErreur(t.del_forbidden);
      } else {
        const m = err.message;
        setErreur(Array.isArray(m) ? m.join(" · ") : (m ?? t.del_failed));
      }
      setBusy(false);
      return;
    }
    showToast(t.del_entity_done.replace("{name}", name));
    void loadDomain({ ai: false });
    onDeleted();
  };

  return (
    <Modal open title={titre} onClose={busy ? () => {} : onCancel} size="sm">
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3">
          <Icon path={UI_ICONS.alert} size={18} className="mt-0.5 shrink-0 text-danger-400" />
          <div className="min-w-0 space-y-2">
            <p className="text-[13px] font-semibold leading-snug text-gray-800 dark:text-rdia-50">{t.del_confirm_title}</p>
            <p className="font-mono text-[13px] font-bold text-danger-400">
              {id} — <span className="font-sans font-semibold text-gray-700 dark:text-rdia-100">{name}</span>
            </p>
            <p className="text-[12px] leading-snug text-gray-600 dark:text-rdia-200">{t.del_confirm_body.replace("{name}", name)}</p>
          </div>
        </div>

        {/* Ce que le serveur a répondu : l'entité est retenue. */}
        {blockers && (
          <div className="space-y-2 rounded-lg border border-or-500/40 bg-or-500/10 p-3">
            <p className="text-[12px] font-semibold text-or-300">{t.del_blocked}</p>
            <ul className="space-y-0.5 text-[12px] leading-snug text-gray-600 dark:text-rdia-200">
              {blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
            <label className="flex cursor-pointer items-start gap-2 pt-1 text-[12px] leading-snug text-gray-700 dark:text-rdia-100">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} disabled={busy} className="mt-0.5" />
              <span>{t.del_confirm_force.replace("{blockers}", blockers.join(" ; "))}</span>
            </label>
          </div>
        )}

        <div>
          <label htmlFor={champId} className="mb-1.5 block text-[12px] font-semibold text-gray-700 dark:text-rdia-100">
            {t.del_code_label}
          </label>
          <p id={aideId} className="mb-2 text-[12px] leading-snug text-gray-500 dark:text-rdia-300">
            {t.del_code_help_entity}{" "}
            <code className="select-all rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] font-bold text-or-600 dark:bg-white/10 dark:text-or-300">{id}</code>
          </p>
          <input
            ref={inputRef}
            id={champId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={aideId}
            aria-invalid={invalide}
            placeholder={id}
            className={`input-champ cible-tactile w-full font-mono tracking-wider ${invalide ? "border-danger-500/70" : exact ? "border-or-500/60" : ""}`}
          />
          {invalide && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-danger-400">
              <Icon path={UI_ICONS.alert} size={13} className="shrink-0" />
              {t.del_code_bad_entity}
            </p>
          )}
        </div>

        {erreur && (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-400">
            {erreur}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          <button
            onClick={() => void supprimer()}
            disabled={!exact || busy || (blockers !== null && !force)}
            className="cible-tactile inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-danger-600"
          >
            {busy && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />}
            {busy ? t.del_busy : t.del_confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface DeleteEntityButtonProps {
  kind: DeletableKind;
  id: string;
  name: string;
  /** Après la suppression : fermer la fiche, rafraîchir la liste locale… */
  onDeleted?: () => void;
  className?: string;
  /** Bouton icône seul (listes denses) ; sinon icône + libellé. */
  compact?: boolean;
}

/** Le bouton de suppression, rendu à qui détient `<entité>:delete` (le Super Administrateur toujours), avec sa modale. */
export function DeleteEntityButton({ kind, id, name, onDeleted, className = "", compact = false }: DeleteEntityButtonProps) {
  const t = useDict();
  const role = useArgos((s) => s.role);
  const can = useArgos((s) => s.can);
  const appMode = useArgos((s) => s.appMode);
  const [open, setOpen] = useState(false);
  // Une unité se retire selon la règle de mode (ADR 0016) ; les autres entités, selon `<entité>:delete`.
  const allowed = kind === "unit" ? canDeleteUnit(role, appMode, can) : isSuperAdmin(role) || can(DEL_PERMISSION[kind]);
  if (!allowed) return null;
  const label = DEL_LABEL(t)[kind];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={`${label} — ${name}`}
        className={`cible-tactile inline-flex items-center gap-1.5 rounded-lg border border-danger-500/40 px-2.5 py-1.5 text-[12px] font-semibold text-danger-500 transition-colors hover:bg-danger-500/10 dark:text-danger-400 ${className}`}
      >
        <Icon path={UI_ICONS.trash} size={14} />
        {!compact && <span>{label}</span>}
      </button>
      {open && (
        <DeleteEntityModal
          kind={kind}
          id={id}
          name={name}
          onCancel={() => setOpen(false)}
          onDeleted={() => {
            setOpen(false);
            onDeleted?.();
          }}
        />
      )}
    </>
  );
}
