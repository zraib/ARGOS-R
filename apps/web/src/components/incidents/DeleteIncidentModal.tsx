"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useDict } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

import type { Incident } from "@/lib/types";

// ============================================================================
// Suppression définitive d'un incident (lot N-5)
//
// LE CODE DEMANDÉ EST LA RÉFÉRENCE DE L'INCIDENT LUI-MÊME. Ce n'est pas une
// formalité : un mot de passe ou un « oui » générique prouve seulement qu'on
// voulait supprimer QUELQUE CHOSE. Recopier « INC-2612 » prouve qu'on a lu ce
// qu'on supprime — c'est la seule barrière qui arrête la faute la plus probable
// ici, se tromper de ligne.
//
// La saisie est comparée à la casse près, sans normalisation : une référence
// est un identifiant, pas du texte libre.
//
// L'API reste l'autorité. `incidents:delete` n'est accordé à personne dans la
// matrice — seul le joker du Super Administrateur la détient ; cet écran ne
// fait que masquer un geste qui serait de toute façon refusé.
// ============================================================================

interface DeleteIncidentModalProps {
  incident: Incident;
  onCancel: () => void;
  /** Résout en message d'erreur, ou `null` si la suppression a abouti. */
  onConfirm: (id: string) => Promise<string | null>;
}

export function DeleteIncidentModal({ incident, onCancel, onConfirm }: DeleteIncidentModalProps) {
  const t = useDict();
  const [code, setCode] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const champId = useId();
  const aideId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Le focus va au champ, pas au bouton de suppression : on ne veut pas qu'une
  // frappe sur Entrée juste après l'ouverture déclenche quoi que ce soit.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const exact = code === incident.id;
  // Erreur affichée seulement quand l'opérateur a commencé à saisir : signaler
  // « code incorrect » sur un champ vide est un reproche, pas une aide.
  const invalide = touched && code.length > 0 && !exact;

  const supprimer = async () => {
    if (!exact || busy) return;
    setBusy(true);
    setErreur(null);
    const msg = await onConfirm(incident.id);
    if (msg) {
      setErreur(msg);
      setBusy(false);
      inputRef.current?.focus();
    }
    // En cas de succès le parent démonte la modale — pas de `setBusy(false)`
    // ici, qui rendrait le bouton cliquable une seconde fois pendant l'échange.
  };

  return (
    <Modal open title={t.del_title} onClose={busy ? () => {} : onCancel} size="sm">
      <div className="space-y-4">
        {/* Ce qui va disparaître, nommé. Un avertissement qui ne dit pas QUOI
            est supprimé n'apprend rien à celui qui hésite. */}
        <div className="flex gap-3 rounded-lg border border-danger-500/30 bg-danger-500/10 p-3">
          <Icon path={UI_ICONS.alert} size={18} className="mt-0.5 shrink-0 text-danger-400" />
          <div className="min-w-0 space-y-2">
            <p className="text-[13px] font-semibold leading-snug text-gray-800 dark:text-rdia-50">{t.del_warning}</p>
            <p className="font-mono text-[13px] font-bold text-danger-400">
              {incident.id} — <span className="font-sans font-semibold text-gray-700 dark:text-rdia-100">{incident.titre}</span>
            </p>
            {/* Les cascades RÉELLES, telles que le serveur les exécute. */}
            <ul className="space-y-0.5 text-[12px] leading-snug text-gray-600 dark:text-rdia-200">
              <li>· {t.del_casc_sub}</li>
              <li>· {t.del_casc_loops}</li>
              <li>· {t.del_casc_posts}</li>
              <li>· {t.del_casc_channel}</li>
            </ul>
          </div>
        </div>

        {/* --- le code ------------------------------------------------------ */}
        <div>
          <label htmlFor={champId} className="mb-1.5 block text-[12px] font-semibold text-gray-700 dark:text-rdia-100">
            {t.del_code_label}
          </label>
          <p id={aideId} className="mb-2 text-[12px] leading-snug text-gray-500 dark:text-rdia-300">
            {t.del_code_help}{" "}
            <code className="select-all rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] font-bold text-or-600 dark:bg-white/10 dark:text-or-300">
              {incident.id}
            </code>
          </p>
          <input
            ref={inputRef}
            id={champId}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={busy}
            // Une référence n'est ni un mot ni un nom : aucune correction
            // automatique ne doit la réécrire pendant la frappe.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={aideId}
            aria-invalid={invalide}
            placeholder={incident.id}
            className={`input-champ cible-tactile w-full font-mono tracking-wider ${
              invalide ? "border-danger-500/70" : exact ? "border-or-500/60" : ""
            }`}
          />
          {/* `role="alert"` : l'écart est annoncé au lecteur d'écran au moment
              où il apparaît, sans qu'il faille repasser sur le champ. */}
          {invalide && (
            <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-danger-400">
              <Icon path={UI_ICONS.alert} size={13} className="shrink-0" />
              {t.del_code_bad}
            </p>
          )}
        </div>

        {/* Échec côté serveur — refus de permission, incident déjà supprimé. */}
        {erreur && (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-400">
            {erreur}
          </p>
        )}

        {/* Le geste destructeur est à l'opposé de l'échappatoire, et n'est
            jamais le bouton primaire de la modale. */}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondaire cible-tactile text-sm" onClick={onCancel} disabled={busy}>
            {t.cancel}
          </button>
          <button
            onClick={() => void supprimer()}
            disabled={!exact || busy}
            className="cible-tactile inline-flex items-center gap-2 rounded-lg bg-danger-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-danger-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-danger-600"
          >
            {busy && (
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
              />
            )}
            {busy ? t.del_busy : t.del_confirm}
          </button>
        </div>
      </div>
    </Modal>
  );
}
