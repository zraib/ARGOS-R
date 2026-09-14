"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { deploymentOf } from "@/lib/responsibles";

/**
 * Un compte déployé sur une opération porte un raccourci devant son nom : la
 * carte se centre sur son poste s'il y est posé, sinon sur l'opération. Rien
 * n'est rendu pour un compte qui n'est déployé nulle part.
 */
export function DeployedShortcut({ matricule, tone = "light" }: { matricule: string; tone?: "light" | "dark" }) {
  const t = useDict();
  const router = useRouter();
  const responsables = useArgos((s) => s.responsables);
  const posts = useArgos((s) => s.posts);
  const incidents = useArgos((s) => s.incidents);
  const focusIncident = useArgos((s) => s.focusIncident);
  const setMapCenter = useArgos((s) => s.setMapCenter);
  const closeAll = useArgos((s) => s.closeAllChats);

  const dep = deploymentOf(responsables, matricule);
  if (!dep) return null;
  const libelle = tpl(t.cm_deployed_on, { id: dep.entityId });

  const aller = (e: MouseEvent<HTMLButtonElement>) => {
    // Le raccourci vit dans une ligne qui a ses propres gestes (double-clic) :
    // il ne les déclenche pas.
    e.stopPropagation();
    const m = matricule.toLowerCase();
    const poste = posts.find((p) => p.incidentId === dep.entityId && p.matricule?.toLowerCase() === m);
    const inc = incidents.find((i) => i.id === dep.entityId);
    if (poste) setMapCenter(poste.ll, 13, dep.nom);
    else if (inc) focusIncident(inc);
    closeAll();
    router.push("/map");
  };

  return (
    <button
      type="button"
      onClick={aller}
      title={libelle}
      aria-label={libelle}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
        tone === "dark" ? "text-or-300 hover:bg-white/10 hover:text-or-200" : "text-or-500 hover:bg-or-500/15 hover:text-or-600"
      }`}
    >
      <Icon path={UI_ICONS.target} size={14} strokeWidth={2} />
    </button>
  );
}
