"use client";

import { useCallback, useEffect, useState } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { canDeployPosts, type Role } from "@/lib/roles";

// ============================================================================
// « Postes déployés » — l'état-major d'une opération, dans sa fiche (lot V-2)
//
// Jusqu'ici, savoir QUI conduisait une opération demandait d'ouvrir la gestion
// des utilisateurs et de lire les affectations une par une. La fiche d'incident
// ne le disait pas, alors que c'est la première question qu'on se pose en
// arrivant sur une opération en cours.
//
// Deux choses que cet écran rend visibles, et qui ne l'étaient pas :
//
//  • l'affectation COURANTE de chaque candidat. Déployer quelqu'un le retire de
//    l'opération qu'il servait ; le voir avant de cliquer évite de dégarnir un
//    autre théâtre sans s'en rendre compte.
//  • la conséquence du retrait. Un poste retiré ne voit plus AUCUNE opération
//    (doctrine V-1) — ce n'est pas un simple changement d'étiquette.
//
// Le masquage des boutons n'est PAS le contrôle d'accès : l'API refuse déjà
// (`incidents:update` + visibilité de l'incident). Ici on ne fait qu'éviter de
// proposer un geste voué au 403.
// ============================================================================

interface Post {
  matricule: string;
  nom: string;
  roles: string[];
  online: boolean;
}

interface Candidate extends Post {
  currentIncidentId: string | null;
}

export function DeployedPosts({ incidentId }: { incidentId: string }) {
  const t = useDict();
  const m = useModules();
  const role = useArgos((s) => s.role);
  const showToast = useArgos((s) => s.showToast);

  const [posts, setPosts] = useState<Post[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);

  const canDeploy = canDeployPosts(role);

  const load = useCallback(async () => {
    const { data } = await api.getDeployments(incidentId);
    setPosts((data as Post[] | undefined) ?? []);
    if (canDeploy) {
      const { data: cand } = await api.getDeployablePosts();
      setCandidates((cand as Candidate[] | undefined) ?? []);
    }
  }, [incidentId, canDeploy]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<{ error?: unknown }>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await fn();
      showToast(error ? t.dep_fail : okMsg);
      if (!error) await load();
    } finally {
      setBusy(false);
    }
  };

  const deployed = new Set(posts.map((p) => p.matricule));
  const selectable = candidates.filter((c) => !deployed.has(c.matricule));
  // Libellés déjà traduits dans le dictionnaire des modules — pas de seconde
  // table à tenir, et l'arabe suit sans effort.
  const roleLabel = (r: string) => m.roles[r as Role] ?? r;

  return (
    <div className="rounded-xl border border-gray-200 bg-white/60 p-3 dark:border-rdia-700/50 dark:bg-rdia-800/30">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-gray-500 dark:text-rdia-300/80">
          <Icon path={UI_ICONS.users} size={13} className="text-or-500" />
          {t.dep_title}
          {posts.length > 0 && (
            <span className="rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-bold text-or-500">{posts.length}</span>
          )}
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-rdia-300">{t.dep_none}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {posts.map((p) => (
            <li
              key={p.matricule}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-rdia-900/40"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.online ? "bg-green-500" : "bg-gray-300 dark:bg-rdia-600"}`}
                  aria-label={p.online ? undefined : t.dep_offline}
                />
                <span className="truncate text-xs font-semibold text-gray-800 dark:text-rdia-100">{p.nom}</span>
                <span className="truncate text-[10.5px] text-gray-500 dark:text-rdia-300">
                  {p.roles.map(roleLabel).join(" · ")}
                </span>
              </div>
              {canDeploy && (
                <button
                  className="cible-tactile rounded-md px-2 py-1 text-[11px] font-semibold text-danger-500 transition-colors hover:bg-danger-500/10 disabled:opacity-40"
                  disabled={busy}
                  onClick={() => act(() => api.withdrawPost(incidentId, p.matricule), t.dep_out)}
                >
                  {t.dep_withdraw}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canDeploy && (
        <div className="mt-2.5 border-t border-gray-200 pt-2.5 dark:border-rdia-700/50">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input-champ flex-1 text-base md:text-sm"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label={t.dep_pick}
            >
              <option value="">{t.dep_pick}</option>
              {selectable.map((c) => (
                <option key={c.matricule} value={c.matricule}>
                  {c.nom} — {c.roles.map(roleLabel).join(", ")}
                  {/* L'affectation courante figure DANS l'option : c'est le seul
                      moment où l'on peut encore renoncer sans dégarnir ailleurs. */}
                  {c.currentIncidentId ? ` (${t.dep_on} ${c.currentIncidentId})` : ` — ${t.dep_free}`}
                </option>
              ))}
            </select>
            <button
              className="btn-primaire cible-tactile text-xs"
              disabled={!pick || busy}
              onClick={() =>
                act(async () => {
                  const res = await api.deployPost(incidentId, pick);
                  if (!res.error) setPick("");
                  return res;
                }, t.dep_ok)
              }
            >
              {t.dep_add}
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-snug text-gray-400 dark:text-rdia-400">{t.dep_hint}</p>
        </div>
      )}
    </div>
  );
}
