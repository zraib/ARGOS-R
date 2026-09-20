"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict, useModules } from "@/lib/store";
import { deployedOn, incidentChannelId, isOnlineAs, responsiblesOf, type ResponsibleKind } from "@/lib/responsibles";
import type { Responsible } from "@/lib/types";
import type { Role } from "@/lib/roles";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Les titulaires d'une entité et leur état de connexion, avec de quoi leur parler.
//
// Une seule carte pour la fiche d'une unité, d'un abri, d'un hôpital, d'une
// morgue et pour le panneau de sélection de la carte (ton sombre). Les noms
// viennent de « qui tient quoi », l'état de connexion du flux de présence —
// pas d'un drapeau stocké : un officier est en ligne quand son poste tient un
// flux ouvert, et il ne l'est plus dès que ce flux tombe.
//
// TOUS les comptes rattachés à l'entité y figurent (ADR 0026) — deux
// commandants sur une unité, un directeur et son adjoint — chacun avec son
// propre bouton : ce que l'état-major veut, c'est joindre QUELQU'UN de
// l'unité, pas le premier inscrit. Un poste déployé (OPCOM, TACOM, cellule)
// reste une ligne : il est identifié par (incident, rôle, compte).
//
// « Contacter » ouvre la conversation directe EN BULLE, sur l'écran où l'on
// est : un opérateur qui lit la carte, OPSnet ou Hospinet ne la quitte pas
// pour dire un mot au commandant. Le canal de l'opération, lui, reste dans
// le centre de communication — c'est un fil de conduite, pas un aparté.
// ============================================================================

export interface ResponsibleCardProps {
  /** Nature de l'entité — ou `incident` pour un poste déployé (OPCOM, TACOM, cellule) : `entityId` est alors l'incident. */
  kind: ResponsibleKind;
  entityId: string;
  /** Pour un poste déployé : le rôle qui tient le poste sur cet incident. */
  role?: Role;
  /** Pour un poste déployé : LE compte, quand plusieurs tiennent le même rôle sur l'opération. */
  matricule?: string;
  /** Incident sur lequel l'entité est engagée : ouvre aussi son canal. */
  incidentId?: string;
  /** `dark` : sur le panneau de la carte, texte clair sur fond sombre. */
  tone?: "light" | "dark";
  /** Sans titulaire, ne rien afficher plutôt qu'un « aucun » (hôpitaux civils). */
  hideIfNone?: boolean;
  className?: string;
  /**
   * Appelé une fois la bulle ouverte : une fiche affichée en MODALE se ferme
   * ici, sinon son voile recouvrirait la conversation qu'on vient d'ouvrir.
   */
  afterContact?: () => void;
}

export function ResponsibleCard({ kind, entityId, role, matricule, incidentId, tone = "light", hideIfNone = false, className = "", afterContact }: ResponsibleCardProps) {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const responsables = useArgos((s) => s.responsables);
  const online = useArgos((s) => s.rtOnline);
  const comCats = useArgos((s) => s.comCats);
  const sessionUser = useArgos((s) => s.sessionUser);
  const selectChannel = useArgos((s) => s.selectChannel);
  const setActive = useArgos((s) => s.rtSetActiveChannel);
  const startChatWith = useArgos((s) => s.startChatWith);
  const showToast = useArgos((s) => s.showToast);
  const [busy, setBusy] = useState<string | null>(null);

  // Un poste déployé se retrouve par (incident, rôle[, compte]) ; une entité
  // par (nature, identifiant) — et là, tous ses titulaires.
  const holders: Responsible[] =
    kind === "incident"
      ? deployedOn(responsables, entityId).filter((x) => (matricule ? x.matricule.toLowerCase() === matricule.toLowerCase() && x.role === role : x.role === role)).slice(0, 1)
      : responsiblesOf(responsables, kind, entityId);
  if (holders.length === 0 && hideIfNone) return null;

  const dark = tone === "dark";
  const kindLabel =
    kind === "incident"
      ? role
        ? m.roles[role]
        : ""
      : { unit: t.resp_kind_unit, hospital: t.resp_kind_hospital, shelter: t.resp_kind_shelter, morgue: t.resp_kind_morgue, equipment: t.resp_kind_equipment }[kind];
  const hasChannel = (id: string) => comCats.some((c) => c.chans.some((ch) => ch.id === id));
  const onIncident = incidentId ?? (kind === "incident" ? entityId : undefined);
  const incidentChannel = onIncident ? incidentChannelId(onIncident) : undefined;
  const isMe = (r: Responsible) => !!sessionUser && r.matricule.toLowerCase() === sessionUser.matricule.toLowerCase();

  const goTo = (id: string) => {
    selectChannel(id);
    setActive(id);
    router.push("/communication");
  };

  /** La conversation directe : ouverte (ou retrouvée) côté serveur, puis sa bulle, ici même. */
  const contact = async (r: Responsible) => {
    if (busy) return;
    setBusy(r.matricule);
    try {
      await startChatWith(r.matricule);
      afterContact?.();
    } catch (err: unknown) {
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const label = dark ? "text-white/60" : "text-gray-400 dark:text-rdia-400";
  const strong = dark ? "text-white" : "text-gray-800 dark:text-rdia-50";
  const muted = dark ? "text-white/70" : "text-gray-500 dark:text-rdia-300";
  const frame = dark ? "border-white/12" : "border-gray-200 bg-gray-50 dark:border-rdia-600 dark:bg-rdia-800/50";
  const divider = dark ? "border-white/10" : "border-gray-200 dark:border-rdia-600";

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${frame} ${className}`}>
      <div className={`flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider ${label}`}>
        <span>{kindLabel}</span>
        {/* Plusieurs titulaires : le compte se lit d'un coup d'œil, avant les noms. */}
        {holders.length > 1 && <span className="font-mono normal-case tracking-normal">{holders.length} {t.resp_holders}</span>}
      </div>
      {holders.length === 0 ? (
        <div className={`text-xs ${muted}`}>{t.resp_none}</div>
      ) : (
        holders.map((r, i) => {
          // En ligne SOUS le rôle qui tient la charge : un directeur connecté
          // comme TACOM n'est pas en ligne comme directeur.
          const en = isOnlineAs(online, r.matricule, r.role);
          return (
            <div key={`${r.matricule}:${r.role}`} className={`flex flex-col gap-2 ${i > 0 ? `border-t pt-2 ${divider}` : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`truncate text-sm font-semibold ${strong}`}>{r.grade ? `${r.grade} ${r.nom}` : r.nom}</div>
                  <div className={`truncate text-[11px] ${muted}`}>{m.roles[r.role]}</div>
                </div>
                {/* L'état se lit au point ET au mot : jamais à la couleur seule. */}
                <span className={`flex shrink-0 items-center gap-1.5 text-[11px] font-semibold ${en ? "text-green-600 dark:text-green-400" : muted}`}>
                  <span className={`h-2 w-2 rounded-full ${en ? "bg-green-500" : "bg-gray-400"}`} aria-hidden="true" />
                  {en ? t.cm_online : t.cm_offline}
                </span>
              </div>
              {!isMe(r) && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primaire flex items-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void contact(r)}
                    disabled={busy !== null}
                    aria-label={`${t.resp_contact} — ${r.nom}`}
                  >
                    <Icon path={UI_ICONS.hash} size={12} />
                    {busy === r.matricule ? t.resp_opening : t.resp_contact}
                  </button>
                  {i === 0 && incidentChannel && hasChannel(incidentChannel) && (
                    <button type="button" className="btn-secondaire text-xs" onClick={() => goTo(incidentChannel)}>
                      {t.resp_incident_channel}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
