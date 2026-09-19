"use client";

import { useMemo, useState } from "react";
import { useArgos, useModules, useDict } from "@/lib/store";
import { KIND_LABEL, type QueueItem, type Urgency } from "@/lib/data/dispatch";
import { recommend, needFromIncident, capsFor, CAP_LABELS, DEFAULT_WEIGHTS, type Need, type Suggestion, type Weights } from "@/lib/reco";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { Pill, type Tone } from "@/components/ui/Pill";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TR, TD, TD_MUTED, TD_MONO, TD_STRONG } from "@/components/ui/Table";
import { dispoBadge } from "@/lib/helpers";
import { NAV_ICONS, KPI_ICONS } from "@/lib/icons";

const URGENCY: Record<Urgency, Tone> = { urgent: "red", high: "amber", medium: "gold" };

/** Barre de score horizontale 0–100 avec dégradé de couleur. */
function ScoreBar({ value }: { value: number }) {
  const color = value >= 70 ? "bg-green-500" : value >= 45 ? "bg-or-500" : "bg-gray-400 dark:bg-rdia-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export default function RepartitionPage() {
  const units = useArgos((s) => s.units);
  const m = useModules();
  const t = useDict();
  const incidents = useArgos((s) => s.incidents);
  const engagements = useArgos((s) => s.engagements);
  const movements = useArgos((s) => s.movements);
  const seededQueue = useArgos((s) => s.queue);
  const resourceRequests = useArgos((s) => s.resourceRequests);
  /**
   * La file du répartiteur, DANS LES DEUX SENS (lot P2-a).
   *
   * Aux besoins de démonstration s'ajoutent les demandes réellement émises
   * depuis le terrain — hôpital saturé, abri à court d'eau. Elles arrivent au
   * MÊME endroit : un répartiteur n'a pas deux files à surveiller.
   */
  const queue = useMemo(() => {
    const fromField: QueueItem[] = resourceRequests.map((m) => {
      const urg = typeof m.payload.urgency === "string" ? m.payload.urgency : "medium";
      const inc = incidents.find((i) => i.id === m.incidentId);
      return {
        id: m.id,
        kind: "logistics",
        label: m.label,
        incidentId: m.incidentId,
        target: inc?.ll ?? [-7.6, 31.9],
        type: inc?.type ?? "industrial",
        // La reco ne connaît que 4 niveaux ; « high » d'une demande devient
        // « urgent » côté file pour ne pas la faire disparaître sous les
        // besoins seedés.
        urgency: urg === "high" ? "urgent" : urg === "low" ? "medium" : "high",
      } as QueueItem;
    });
    return [...fromField, ...seededQueue];
  }, [resourceRequests, seededQueue, incidents]);
  const engageUnit = useArgos((s) => s.engageUnit);
  const relieveUnit = useArgos((s) => s.relieveUnit);
  const resolveQueueItem = useArgos((s) => s.resolveQueueItem);
  const showToast = useArgos((s) => s.showToast);

  const activeIncidents = useMemo(() => incidents.filter((i) => i.st !== "closed"), [incidents]);
  const [sel, setSel] = useState<{ kind: "incident" | "queue"; id: string }>({ kind: "incident", id: activeIncidents[0]?.id ?? "" });

  // état de la modale de confirmation
  const [confirm, setConfirm] = useState<null | { s: Suggestion; via: "manual" | "reco"; queueId?: string }>(null);
  const [reason, setReason] = useState("");

  // mode simulation « et si ? » : poids du score explorables (§6.17)
  const [simOpen, setSimOpen] = useState(false);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const WKEYS: (keyof Weights)[] = ["travel", "capability", "readiness", "availability"];
  const isSim = WKEYS.some((k) => Math.abs(weights[k] - DEFAULT_WEIGHTS[k]) > 0.001);
  const wSum = WKEYS.reduce((a, k) => a + weights[k], 0) || 1;

  const engagedIds = useMemo(() => new Set(engagements.map((e) => e.unitId)), [engagements]);

  const need: Need | null = useMemo(() => {
    if (sel.kind === "incident") {
      const inc = incidents.find((i) => i.id === sel.id);
      return inc ? needFromIncident(inc) : null;
    }
    const q = queue.find((x) => x.id === sel.id);
    return q ? { target: q.target, type: q.type, label: q.label } : null;
  }, [sel, incidents, queue]);

  const selectedIncidentId = sel.kind === "incident" ? sel.id : queue.find((q) => q.id === sel.id)?.incidentId ?? "";

  const suggestions = useMemo(
    () => (need ? recommend(need, units, { engagedUnitIds: engagedIds, weights }) : []),
    [need, engagedIds, weights],
  );
  const best = suggestions.find((s) => !s.excluded);

  const openConfirm = (s: Suggestion, via: "manual" | "reco", queueId?: string) => {
    setReason(via === "reco" ? `Recommandation appliquée — score ${s.score}/100, ETA ${s.etaMin} ${m.dispatch.min}` : "");
    setConfirm({ s, via, queueId });
  };
  const doEngage = () => {
    if (!confirm || !reason.trim()) return;
    engageUnit(confirm.s.unit.id, selectedIncidentId || "—", reason.trim(), confirm.via, confirm.s.score);
    if (confirm.queueId) resolveQueueItem(confirm.queueId);
    showToast(`${confirm.s.unit.id} — ${m.dispatch.engaged.toLowerCase()} · ${selectedIncidentId}`);
    setConfirm(null);
    setReason("");
  };

  const engagementFor = (unitId: string) => engagements.find((e) => e.unitId === unitId);
  const requiredCaps = need ? capsFor(need.type) : [];

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* Bandeau de situation — les tuiles KPI tiennent à deux par ligne sur téléphone. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatTile label={m.dispatch.strip_ops} value={activeIncidents.length} icon={KPI_ICONS.incidents} tint="danger" />
        <StatTile label={m.dispatch.strip_units} value={engagements.length} icon={KPI_ICONS.units} tint="or" />
        {/* Les unités VISIBLES non engagées : un engagement peut viser une unité hors de vue (autre mode, autre portée), jamais un compte négatif. */}
        <StatTile label={m.dispatch.strip_available} value={units.filter((u) => !engagementFor(u.id)).length} icon={NAV_ICONS.res} tint="green" />
        <StatTile label={m.dispatch.strip_movements} value={movements.filter((x) => x.progress < 100).length} icon={NAV_ICONS.map} tint="blue" />
        <StatTile label={m.dispatch.strip_queue} value={queue.length} icon={NAV_ICONS.dispatch} tint="amber" />
      </div>

      {/* Sélecteur de besoin */}
      <div className="carte p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.dispatch.need}</span>
          <button
            onClick={() => setSimOpen((v) => !v)}
            className={`cible-tactile flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              simOpen || isSim ? "border-or-500 text-or-500" : "border-gray-200 text-gray-500 hover:text-or-500 dark:border-rdia-600 dark:text-rdia-300"
            }`}
          >
            <Icon path={NAV_ICONS.analytics} size={13} />
            {m.dispatch.sim}
            {isSim && <span className="h-1.5 w-1.5 rounded-full bg-or-500" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeIncidents.map((i) => {
            const active = sel.kind === "incident" && sel.id === i.id;
            return (
              <button
                key={i.id}
                onClick={() => setSel({ kind: "incident", id: i.id })}
                className={`rounded-lg border px-3 py-2 text-start text-xs transition-colors ${
                  active ? "border-or-500 bg-or-500/10" : "border-gray-200 hover:border-or-500/40 dark:border-rdia-600"
                }`}
              >
                <span className="font-mono text-[10px] text-gray-400 dark:text-rdia-400">{i.id}</span>
                <div className="max-w-[220px] truncate font-semibold text-gray-800 dark:text-rdia-50">{i.titre}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode simulation « et si ? » — poids du score explorables */}
      {simOpen && (
        <div className="carte flex flex-col gap-3 p-4" style={{ borderInlineStart: "3px solid #C9A84C" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.dispatch.weights_title}</h3>
                {isSim && <Pill tone="gold" label={m.dispatch.sim_active} />}
              </div>
              <p className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400">{m.dispatch.sim_hint}</p>
            </div>
            <button
              className="cible-tactile shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:text-or-500 disabled:opacity-40 dark:border-rdia-600 dark:text-rdia-300"
              onClick={() => setWeights(DEFAULT_WEIGHTS)}
              disabled={!isSim}
            >
              {m.dispatch.sim_reset}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {WKEYS.map((k) => {
              const label = { travel: m.dispatch.b_travel, capability: m.dispatch.b_cap, readiness: m.dispatch.b_readiness, availability: m.dispatch.b_avail }[k];
              const share = Math.round((weights[k] / wSum) * 100);
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-gray-600 dark:text-rdia-200">{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(weights[k] * 100)}
                    onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) / 100 }))}
                    className="h-1.5 flex-1 cursor-pointer accent-or-500"
                  />
                  <span className="w-10 shrink-0 text-end font-mono text-xs font-bold tabular-nums text-or-500">{share}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Tableau des unités (classées par recommandation) */}
        <div className="lg:col-span-2">
          <div className="carte overflow-hidden">
            {/* `flex-wrap` : la liste des capacités requises passe sous le titre
                sur téléphone au lieu de le comprimer. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-200 px-3 py-3 sm:px-4 dark:border-rdia-600">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.dispatch.units_board}</h3>
                {isSim && <Pill tone="gold" label={m.dispatch.sim_active} />}
              </div>
              {need && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-gray-400 dark:text-rdia-400">{m.dispatch.caps_required}:</span>
                  {requiredCaps.map((c) => (
                    <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500 dark:bg-rdia-600 dark:text-rdia-200">{CAP_LABELS[c]}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-rdia-700/50">
              {suggestions.map((s, i) => {
                const eng = engagementFor(s.unit.id);
                const b = dispoBadge(s.unit.dispo, t);
                // Le bouton d'action : rendu seulement s'il existe, pour éviter
                // une ligne repliée vide sur les unités exclues.
                const action = eng ? (
                  <button className="cible-tactile rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-danger-500 hover:text-danger-500 dark:border-rdia-600 dark:text-rdia-300" onClick={() => relieveUnit(s.unit.id)}>
                    {m.dispatch.relieve}
                  </button>
                ) : !s.excluded ? (
                  <button className="cible-tactile btn-primaire text-xs" onClick={() => openConfirm(s, "manual")}>{m.dispatch.engage}</button>
                ) : null;
                return (
                  // Sous `sm`, la ligne se replie : identité + score sur la
                  // première ligne, action sur la seconde. Densité d'origine ensuite.
                  <div key={s.unit.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:px-4 ${s.excluded ? "opacity-50" : ""}`}>
                    <div className="w-5 shrink-0 text-center font-mono text-xs text-gray-400 dark:text-rdia-400">{i + 1}</div>
                    <div className="min-w-0 flex-1 basis-40">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-rdia-50">{s.unit.nom}</span>
                        {!s.excluded && best?.unit.id === s.unit.id && <Pill tone="gold" label={m.dispatch.best} />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-400 dark:text-rdia-400">
                        <span>{s.unit.ville}</span>
                        <Badge type={b.type} label={b.label} />
                        {/* Les colonnes ETA et correspondance n'existent pas sous
                            `sm`/`md` : on replie leur valeur ici pour ne rien perdre. */}
                        {!s.excluded && (
                          <>
                            <span className="font-mono tabular-nums sm:hidden">{m.dispatch.eta} {s.etaMin} {m.dispatch.min}</span>
                            <span className="font-mono tabular-nums md:hidden">{m.dispatch.match} {s.capMatched}/{s.capRequired}</span>
                          </>
                        )}
                        {s.excluded && <Pill tone="gray" label={`${m.dispatch.excluded} · ${s.exclusionReason}`} />}
                      </div>
                    </div>
                    {!s.excluded && (
                      <>
                        <div className="hidden w-16 shrink-0 text-center sm:block">
                          <div className="font-mono text-sm font-bold tabular-nums text-rdia-600 dark:text-rdia-50">{s.etaMin}</div>
                          <div className="text-[9px] uppercase text-gray-400 dark:text-rdia-400">{m.dispatch.eta} {m.dispatch.min}</div>
                        </div>
                        <div className="hidden w-14 shrink-0 text-center md:block">
                          <div className="font-mono text-sm font-bold tabular-nums text-rdia-600 dark:text-rdia-50">{s.capMatched}/{s.capRequired}</div>
                          <div className="text-[9px] uppercase text-gray-400 dark:text-rdia-400">{m.dispatch.match}</div>
                        </div>
                        <div className="w-24 shrink-0">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[9px] uppercase text-gray-400 dark:text-rdia-400">{m.dispatch.score}</span>
                            <span className="font-mono text-xs font-bold text-or-500">{s.score}</span>
                          </div>
                          <ScoreBar value={s.score} />
                        </div>
                      </>
                    )}
                    {action && <div className="w-full shrink-0 text-end sm:w-24">{action}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recommandation mise en avant + file de dispatching */}
        <div className="flex flex-col gap-4">
          {best && (
            <div className="carte flex flex-col gap-3 p-4" style={{ borderTop: "3px solid #C9A84C" }}>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.dispatch.reco_title}</h3>
                  <Pill tone="gold" label={m.dispatch.best} />
                </div>
                <p className="mt-0.5 text-[10px] text-gray-400 dark:text-rdia-400">{m.dispatch.reco_hint}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-800 dark:text-rdia-50">{best.unit.nom}</span>
                  <span className="font-mono text-lg font-bold text-or-500">{best.score}</span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {[
                    { label: m.dispatch.b_travel, v: best.breakdown.travel, extra: `${best.etaMin} ${m.dispatch.min}` },
                    { label: m.dispatch.b_cap, v: best.breakdown.capability, extra: `${best.capMatched}/${best.capRequired}` },
                    { label: m.dispatch.b_readiness, v: best.breakdown.readiness, extra: `${best.unit.readiness}%` },
                    { label: m.dispatch.b_avail, v: best.breakdown.availability },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center gap-2 text-[10px]">
                      <span className="w-24 shrink-0 text-gray-500 dark:text-rdia-300">{r.label}</span>
                      <div className="flex-1"><ScoreBar value={r.v} /></div>
                      <span className="w-12 shrink-0 text-end font-mono text-gray-400 dark:text-rdia-400">{r.extra ?? `${r.v}`}</span>
                    </div>
                  ))}
                </div>
              </div>
              {!engagementFor(best.unit.id) && (
                <button className="btn-primaire w-full text-sm" onClick={() => openConfirm(best, "reco")}>{m.dispatch.apply}</button>
              )}
            </div>
          )}

          <div className="carte flex flex-col p-4">
            <h3 className="mb-2 text-sm font-semibold text-rdia-600 dark:text-rdia-50">{m.dispatch.queue_title}</h3>
            <div className="flex flex-col gap-2">
              {queue.map((q: QueueItem) => (
                <div key={q.id} className="flex items-start gap-2 rounded-lg border border-gray-100 p-2.5 dark:border-rdia-700/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Pill tone={URGENCY[q.urgency]} label={q.urgency === "urgent" ? m.dispatch.urg_urgent : q.urgency === "high" ? m.dispatch.urg_high : m.dispatch.urg_medium} />
                      <span className="text-[10px] text-gray-400 dark:text-rdia-400">{KIND_LABEL[q.kind]}</span>
                    </div>
                    <div className="mt-1 text-xs font-medium leading-snug text-gray-700 dark:text-rdia-100">{q.label}</div>
                  </div>
                  <button className="cible-tactile btn-secondaire shrink-0 text-[11px]" onClick={() => setSel({ kind: "queue", id: q.id })}>{m.dispatch.treat}</button>
                </div>
              ))}
              {queue.length === 0 && <div className="py-4 text-center text-xs text-gray-400 dark:text-rdia-400">{m.common.none}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Mouvements de transport */}
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{m.dispatch.strip_movements}</h3>

        {/* Tableau : à partir de md, la densité de 8 colonnes redevient lisible. */}
        <div className="hidden md:block">
          <Table headers={[m.common.ref, m.dispatch.mv_mission, m.dispatch.mv_vehicles, m.dispatch.mv_dest, m.dispatch.mv_cargo, m.dispatch.mv_progress, m.dispatch.eta, m.dispatch.mv_delay]}>
            {movements.map((mv) => (
              <tr key={mv.id} className={TR}>
                <td className={TD_MONO}>{mv.id}</td>
                <td className={TD_STRONG}>{mv.mission}</td>
                <td className={TD_MUTED}>{mv.vehicles}</td>
                <td className={TD_MUTED}>{mv.origin} → {mv.destination}</td>
                <td className={TD_MUTED}>{mv.cargo}</td>
                <td className={TD}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
                      <div className="h-full rounded-full bg-or-500" style={{ width: `${mv.progress}%` }} />
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-gray-400 dark:text-rdia-400">{mv.progress}%</span>
                  </div>
                </td>
                <td className={`${TD} font-mono text-xs tabular-nums text-gray-600 dark:text-rdia-200`}>{mv.etaMin} {m.dispatch.min}</td>
                <td className={TD}>{mv.delayMin > 0 ? <Pill tone="red" label={`${m.dispatch.mv_delay} +${mv.delayMin}′`} /> : <Pill tone="green" label={m.dispatch.mv_ontime} />}</td>
              </tr>
            ))}
          </Table>
        </div>

        {/* Sous md : une carte par mouvement — mêmes données que le tableau. */}
        <div className="flex flex-col gap-2 md:hidden">
          {movements.map((mv) => (
            <div key={mv.id} className="carte flex flex-col gap-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-gray-500 dark:text-rdia-300">{mv.id}</div>
                  <div className="text-sm font-medium text-gray-800 dark:text-rdia-50">{mv.mission}</div>
                </div>
                <div className="shrink-0">
                  {mv.delayMin > 0 ? <Pill tone="red" label={`${m.dispatch.mv_delay} +${mv.delayMin}′`} /> : <Pill tone="green" label={m.dispatch.mv_ontime} />}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <div className="min-w-0">
                  <dt className="text-[11px] text-gray-400 dark:text-rdia-400">{m.dispatch.mv_vehicles}</dt>
                  <dd className="truncate text-gray-700 dark:text-rdia-100">{mv.vehicles}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] text-gray-400 dark:text-rdia-400">{m.dispatch.eta}</dt>
                  <dd className="font-mono tabular-nums text-gray-700 dark:text-rdia-100">{mv.etaMin} {m.dispatch.min}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-[11px] text-gray-400 dark:text-rdia-400">{m.dispatch.mv_dest}</dt>
                  <dd className="text-gray-700 dark:text-rdia-100">{mv.origin} → {mv.destination}</dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-[11px] text-gray-400 dark:text-rdia-400">{m.dispatch.mv_cargo}</dt>
                  <dd className="text-gray-700 dark:text-rdia-100">{mv.cargo}</dd>
                </div>
              </dl>
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400 dark:text-rdia-400">
                  <span>{m.dispatch.mv_progress}</span>
                  <span className="font-mono tabular-nums">{mv.progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-rdia-600">
                  <div className="h-full rounded-full bg-or-500" style={{ width: `${mv.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation d'engagement */}
      <Modal open={!!confirm} title={m.dispatch.confirm_engage} onClose={() => setConfirm(null)} size="sm">
        {confirm && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-rdia-800/50">
              <div className="font-semibold text-gray-800 dark:text-rdia-50">{confirm.s.unit.nom}</div>
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-rdia-300">
                <span>→ {selectedIncidentId}</span>
                <span className="font-mono">{m.dispatch.eta} {confirm.s.etaMin} {m.dispatch.min} · {m.dispatch.score} {confirm.s.score}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-rdia-200">{m.dispatch.reason}</label>
              {/* 16 px sur mobile : sous ce seuil iOS zoome au focus et décale la page. */}
              <textarea className="input-champ text-base md:text-sm" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={m.dispatch.reason_ph} autoFocus />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-rdia-400">{m.dispatch.audit_note}</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondaire text-sm" onClick={() => setConfirm(null)}>{t.cancel}</button>
              <button className="btn-primaire text-sm" onClick={doEngage} disabled={!reason.trim()}>{m.dispatch.confirm}</button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
