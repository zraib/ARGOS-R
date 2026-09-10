"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useArgos, useDict, useModules } from "@/lib/store";
import { incidentChannelId, isOnline, responsibleOf, type EntityKind } from "@/lib/responsibles";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";

// ============================================================================
// Le titulaire d'une entité et son état de connexion, avec de quoi lui parler.
//
// Une seule carte pour la fiche d'une unité, d'un abri, d'un hôpital et pour
// le panneau de sélection de la carte (ton sombre). Le nom vient de « qui
// tient quoi », l'état de connexion du flux de présence — pas d'un drapeau
// stocké : un officier est en ligne quand son poste tient un flux ouvert,
// et il ne l'est plus dès que ce flux tombe.
// ============================================================================

export interface ResponsibleCardProps {
  kind: EntityKind;
  entityId: string;
  /** Incident sur lequel l'entité est engagée : ouvre aussi son canal. */
  incidentId?: string;
  /** `dark` : sur le panneau de la carte, texte clair sur fond sombre. */
  tone?: "light" | "dark";
  /** Sans titulaire, ne rien afficher plutôt qu'un « aucun » (hôpitaux civils). */
  hideIfNone?: boolean;
  className?: string;
}

export function ResponsibleCard({ kind, entityId, incidentId, tone = "light", hideIfNone = false, className = "" }: ResponsibleCardProps) {
  const t = useDict();
  const m = useModules();
  const router = useRouter();
  const responsables = useArgos((s) => s.responsables);
  const online = useArgos((s) => s.rtOnline);
  const comCats = useArgos((s) => s.comCats);
  const sessionUser = useArgos((s) => s.sessionUser);
  const selectChannel = useArgos((s) => s.selectChannel);
  const setActive = useArgos((s) => s.rtSetActiveChannel);
  const loadDomain = useArgos((s) => s.loadDomain);
  const showToast = useArgos((s) => s.showToast);
  const [busy, setBusy] = useState(false);

  const r = responsibleOf(responsables, kind, entityId);
  if (!r && hideIfNone) return null;

  const dark = tone === "dark";
  const kindLabel = { unit: t.resp_kind_unit, hospital: t.resp_kind_hospital, shelter: t.resp_kind_shelter, morgue: t.resp_kind_morgue, equipment: t.resp_kind_equipment }[kind];
  const hasChannel = (id: string) => comCats.some((c) => c.chans.some((ch) => ch.id === id));
  const incidentChannel = incidentId ? incidentChannelId(incidentId) : undefined;
  const isMe = !!r && !!sessionUser && r.matricule.toLowerCase() === sessionUser.matricule.toLowerCase();

  const goTo = (id: string) => {
    selectChannel(id);
    setActive(id);
    router.push("/communication");
  };

  /** La conversation directe : ouverte (ou retrouvée) côté serveur, puis affichée. */
  const contact = async () => {
    if (!r || busy) return;
    setBusy(true);
    try {
      const res = await api.openDirectChannel(r.matricule);
      const chan = res.data as { id: string } | undefined;
      if (!chan?.id) throw new Error(res.error ? String((res.error as { message?: unknown }).message ?? res.error) : t.toast_fail);
      // Le canal vient peut-être de naître : la liste locale ne le connaît
      // pas encore, et l'événement temps réel n'est pas forcément arrivé.
      if (!hasChannel(chan.id)) await loadDomain({ ai: false });
      goTo(chan.id);
    } catch (err: unknown) {
      showToast(`${t.toast_fail} — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const en = !!r && isOnline(online, r.matricule);
  const label = dark ? "text-white/60" : "text-gray-400 dark:text-rdia-400";
  const strong = dark ? "text-white" : "text-gray-800 dark:text-rdia-50";
  const muted = dark ? "text-white/70" : "text-gray-500 dark:text-rdia-300";
  const frame = dark ? "border-white/12" : "border-gray-200 bg-gray-50 dark:border-rdia-600 dark:bg-rdia-800/50";

  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${frame} ${className}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider ${label}`}>{kindLabel}</div>
      {!r ? (
        <div className={`text-xs ${muted}`}>{t.resp_none}</div>
      ) : (
        <>
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
          {!isMe && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primaire flex items-center gap-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void contact()} disabled={busy}>
                <Icon path={UI_ICONS.hash} size={12} />
                {busy ? t.resp_opening : t.resp_contact}
              </button>
              {incidentChannel && hasChannel(incidentChannel) && (
                <button type="button" className="btn-secondaire text-xs" onClick={() => goTo(incidentChannel)}>
                  {t.resp_incident_channel}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
