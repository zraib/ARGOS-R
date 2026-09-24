"use client";

// ============================================================================
// ARGOS — fenêtre flottante du briefing (ADR 0032)
//
// Une fenêtre, pas une modale : elle se déplace librement (par sa barre de
// titre), se redimensionne (coin bas-droit), et laisse la carte vivre autour
// d'elle — on zoome, on sélectionne, on dessine pendant qu'elle est ouverte.
// En plein écran de la carte, elle passe au-dessus (`mapFull`).
//
// Le briefing est CALCULÉ sur les données à l'ouverture (instantané) ; l'IA
// peut ensuite le rédiger, au fil de l'eau et dans un délai court — sans
// modèle joignable, le briefing calculé reste.
//
// Il se CORRIGE aussi à la main (ADR 0037) : ceux qui tiennent le journal de
// conduite reprennent chaque rubrique — depuis le calcul, la rédaction de l'IA
// ou la dernière version corrigée — et l'enregistrent sur l'incident
// principal. Tous les postes lisent alors cette version, signée et datée, et
// peuvent toujours voir le calcul à jour à côté ; « Revenir au briefing
// calculé » la retire.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api, apiErrorMessage } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { typeLabel } from "@/lib/helpers";
import { briefingHeader, briefingSections, briefingText, buildBriefing, sectionsText, type Briefing } from "@/lib/briefing";
import { aiBriefingSections, refineBriefing, splitBriefingSections } from "@/lib/ai/llmBriefing";
import { predictIncidentEvolution } from "@/lib/ai/risk/incidentEvolution";
import { BRIEFING_SECTIONS, BRIEFING_SECTION_MAX, BRIEFING_TAKEN_MAX, type BriefingSection, type Incident, type WeatherForecast } from "@/lib/types";

const POS_KEY = "argos_briefing_pos";
const DEFAULT_W = 440;

/** Longueur maximale d'une rubrique corrigée — la même que l'API. */
const maxOf = (k: BriefingSection) => (k === "taken" ? BRIEFING_TAKEN_MAX : BRIEFING_SECTION_MAX);

type Pos = { x: number; y: number };

function loadPos(): Pos | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    const p = raw ? (JSON.parse(raw) as Pos) : null;
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
  } catch {
    return null;
  }
}

/** Garde au moins la barre de titre dans l'écran. */
function clamp(p: Pos, w: number): Pos {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  return { x: Math.min(Math.max(p.x, 8 - w + 120), vw - 120), y: Math.min(Math.max(p.y, 8), vh - 48) };
}

export default function BriefingWindow() {
  const t = useDict();
  const m = useModules();
  const lang = useArgos((s) => s.lang);
  const open = useArgos((s) => s.briefingOpen);
  const incidentId = useArgos((s) => s.briefingIncident);
  const openBriefing = useArgos((s) => s.openBriefing);
  const close = useArgos((s) => s.closeBriefing);
  const mapFull = useArgos((s) => s.mapFull);
  const showToast = useArgos((s) => s.showToast);
  const aiSettings = useArgos((s) => s.aiSettings);
  const setOperatorBusy = useArgos((s) => s.setAiOperatorBusy);
  const scoped = useArgos((s) => s.incidents);
  const mapIncidents = useArgos((s) => s.mapIncidents);
  const units = useArgos((s) => s.units);
  const hospitals = useArgos((s) => s.hospitals);
  const fieldHosps = useArgos((s) => s.fieldHosps);
  const posts = useArgos((s) => s.posts);
  const subCatalog = useArgos((s) => s.subCatalog);
  const incidentTypes = useArgos((s) => s.incidentTypes);
  const dashStats = useArgos((s) => s.dashStats);
  const quakes = useArgos((s) => s.quakes);
  const can = useArgos((s) => s.can);
  const loadDomain = useArgos((s) => s.loadDomain);

  // La liste du compte, complétée de ce que la carte montre à tous (ADR 0020).
  const incidents = useMemo<Incident[]>(() => {
    const seen = new Set<string>();
    return [...scoped, ...mapIncidents].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [scoped, mapIncidents]);
  const mains = useMemo(() => incidents.filter((i) => !i.parentId && !i.archived), [incidents]);
  const root = incidentId ? incidents.find((i) => i.id === incidentId) : undefined;
  // La version corrigée à la main, portée par l'incident principal (ADR 0037).
  const saved = root?.briefing;
  // La corrigent ceux qui tiennent le journal de conduite, sur un incident de leur liste :
  // l'écran masque ce que l'API refuserait.
  const canEdit = !!root && can("actions_log:update") && scoped.some((i) => i.id === root.id);

  // --- position, déplacement ------------------------------------------------
  const [pos, setPos] = useState<Pos>(() => {
    const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
    return clamp(loadPos() ?? { x: vw - DEFAULT_W - 24, y: 88 }, DEFAULT_W);
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, select, a")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPos(clamp({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy }, DEFAULT_W));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* position non mémorisée : sans conséquence */
    }
  };
  // Déplacement au clavier depuis la barre de titre (flèches, Maj = pas de 40 px).
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    setPos((p) => clamp({ x: p.x + d[0], y: p.y + d[1] }, DEFAULT_W));
  };

  // --- météo de l'incident (une fois par incident) --------------------------
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setWeather(null);
    if (!open || !root) return;
    let vivant = true;
    void api
      .getWeatherForecast(root.ll[1], root.ll[0])
      .then((res) => {
        if (vivant && res?.data) setWeather(res.data as WeatherForecast);
      })
      .catch(() => {
        /* sans météo, le briefing se fait quand même */
      });
    return () => {
      vivant = false;
    };
  }, [open, root?.id, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- le briefing calculé ----------------------------------------------------
  const briefing = useMemo<Briefing | null>(() => {
    if (!root) return null;
    let evolution = null;
    try {
      evolution = predictIncidentEvolution({ incident: root, allIncidents: incidents, hospitals, units, dashStats, quakes, weather }, m.evolution);
    } catch {
      evolution = null;
    }
    return buildBriefing({
      root, incidents, units, hospitals, fieldHosps, posts, subCatalog, evolution, weather,
      typeLabel: (ty) => typeLabel(ty, incidentTypes, lang),
    });
    // `nonce` : « Actualiser » recalcule sur les données du moment.
  }, [root, incidents, units, hospitals, fieldHosps, posts, subCatalog, weather, incidentTypes, lang, dashStats, quakes, m.evolution, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const labels = { situation: t.bf_situation, taken: t.al_title, anticipation: t.bf_anticipation, objectives: t.bf_objectives, concept: t.bf_concept, actions: t.bf_actions };

  // --- rédaction par l'IA -----------------------------------------------------
  const [ai, setAi] = useState<{ state: "idle" | "busy" | "done" | "fail"; text: string }>({ state: "idle", text: "" });
  // Version montrée quand une correction existe : elle, ou le calcul à jour.
  const [view, setView] = useState<"manual" | "computed">("manual");
  // Rubriques en cours de correction ; `null` hors édition.
  const [edit, setEdit] = useState<Record<BriefingSection, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const stopAi = () => {
    abort.current?.abort();
    abort.current = null;
  };
  // Changer d'incident, actualiser ou fermer : on revient au briefing de l'incident
  // (sa version corrigée s'il en a une), édition abandonnée.
  useEffect(() => {
    stopAi();
    setAi({ state: "idle", text: "" });
    setEdit(null);
    setView("manual");
    setConfirmReset(false);
  }, [root?.id, nonce, open]);
  useEffect(() => () => stopAi(), []);

  // La version montrée : la correction enregistrée (tant qu'on ne regarde pas le
  // calcul à jour), sinon le calcul. L'IA rédige et « Copier » copie celle-là.
  const showingManual = !!saved && view === "manual";
  const shownText = (): string => {
    if (!briefing) return "";
    return showingManual && saved ? sectionsText(briefingHeader(briefing), saved.sections, labels) : briefingText(briefing, labels);
  };

  const runAi = async () => {
    if (!briefing) return;
    stopAi();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAi({ state: "busy", text: "" });
    // Priorité à l'opérateur, comme le copilote : le modèle local sert une
    // requête à la fois — les calculs IA de fond (analyse de situation,
    // prédictions) sont annulés et reprendront ensuite ; sans cela le briefing
    // attendait derrière eux et dépassait son délai.
    setOperatorBusy(true);
    try {
      const res = await refineBriefing(shownText(), aiSettings, {
        signal: ctrl.signal,
        onToken: (acc) => setAi({ state: "busy", text: acc }),
      });
      if (res.aborted) return;
      setAi(res.ok ? { state: "done", text: res.text } : { state: "fail", text: "" });
    } finally {
      setOperatorBusy(false);
    }
  };

  const copy = async () => {
    if (!briefing) return;
    const text = ai.state === "done" ? ai.text : shownText();
    try {
      await navigator.clipboard.writeText(text);
      showToast(t.bf_copied);
    } catch {
      /* presse-papiers refusé : rien à faire */
    }
  };

  // Corriger : on part de ce qui est lu — la rédaction de l'IA, la version
  // corrigée, ou le calcul.
  const startEdit = () => {
    if (!briefing) return;
    const fromAi = ai.state === "done" ? aiBriefingSections(ai.text) : null;
    stopAi();
    setConfirmReset(false);
    setEdit(fromAi ?? (showingManual && saved ? { ...saved.sections } : briefingSections(briefing)));
  };
  const save = async () => {
    if (!root || !edit) return;
    const trop = BRIEFING_SECTIONS.find((k) => edit[k].length > maxOf(k));
    if (trop) {
      showToast(`${labels[trop]} — ${tpl(t.bf_too_long, { n: maxOf(trop) })}`);
      return;
    }
    setSaving(true);
    try {
      const res = await api.saveIncidentBriefing(root.id, edit);
      if (res.error) {
        showToast(`${t.toast_fail} — ${apiErrorMessage(res.error)}`);
        return;
      }
      await loadDomain({ ai: false });
      setAi({ state: "idle", text: "" });
      setEdit(null);
      setView("manual");
      showToast(t.bf_saved);
    } finally {
      setSaving(false);
    }
  };
  // Deux temps : on ne retire pas une correction d'un seul clic.
  const reset = async () => {
    if (!root) return;
    if (!confirmReset) return setConfirmReset(true);
    setSaving(true);
    try {
      const res = await api.clearIncidentBriefing(root.id);
      if (res.error) {
        showToast(`${t.toast_fail} — ${apiErrorMessage(res.error)}`);
        return;
      }
      await loadDomain({ ai: false });
      showToast(t.bf_reset_done);
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  };
  const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  if (!open) return null;

  const aiSections = ai.text ? splitBriefingSections(ai.text) : null;
  const sections: { title: string; lines: string[]; numbered?: boolean }[] = briefing
    ? [
        { title: t.bf_situation, lines: briefing.situation },
        // Actions entreprises (ADR 0034) : le journal de l'incident et de ses rattachés, dans l'ordre.
        { title: t.al_title, lines: briefing.taken },
        { title: t.bf_anticipation, lines: briefing.anticipation },
        { title: t.bf_objectives, lines: briefing.objectives },
        { title: t.bf_concept, lines: briefing.concept },
        // Actions à entreprendre (ADR 0034) : numérotées, par ordre de priorité.
        { title: t.bf_actions, lines: briefing.actions, numbered: true },
      ]
    : [];
  // Les couleurs suivent le thème de l'application (ADR 0034) : la palette de
  // la modale — blanc en clair, rdia en sombre — et l'or de la marque.
  const iconBtn =
    "cible-tactile flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-or-600 disabled:opacity-40 dark:text-rdia-200 dark:hover:bg-rdia-600 dark:hover:text-or-300";
  const rubrique = "mb-1 text-[11px] font-bold uppercase tracking-wider text-or-600 dark:text-or-300";
  const texte = "text-gray-800 dark:text-rdia-50";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="briefing-titre"
      className={`fixed flex max-h-[75dvh] min-h-[220px] min-w-[300px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white/95 text-gray-900 shadow-2xl backdrop-blur-md dark:border-rdia-600 dark:bg-rdia-700/95 dark:text-rdia-50 ${mapFull ? "z-[10002]" : "z-[80]"}`}
      style={{ left: pos.x, top: pos.y, width: `min(${DEFAULT_W}px, calc(100vw - 16px))`, resize: "both" }}
    >
      {/* Barre de titre : la poignée de déplacement. */}
      <div
        className="flex cursor-move select-none items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-rdia-600 dark:bg-rdia-800/70"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        tabIndex={0}
        aria-label={t.bf_move}
        title={t.bf_move}
      >
        <Icon path={UI_ICONS.sparkles} size={15} className="shrink-0 text-or-500 dark:text-or-400" />
        <h2 id="briefing-titre" className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wider text-rdia-600 dark:text-rdia-50">{t.bf_title}</h2>
        {canEdit && (
          <button className={iconBtn} title={t.bf_edit} aria-label={t.bf_edit} onClick={startEdit} disabled={!briefing || !!edit || ai.state === "busy"}>
            <Icon path={UI_ICONS.edit} size={14} />
          </button>
        )}
        <button className={iconBtn} title={t.bf_refresh} aria-label={t.bf_refresh} onClick={() => setNonce((n) => n + 1)} disabled={!briefing || !!edit}>
          <Icon path={UI_ICONS.refresh} size={14} />
        </button>
        <button className={iconBtn} title={t.bf_copy} aria-label={t.bf_copy} onClick={() => void copy()} disabled={!briefing}>
          <Icon path={UI_ICONS.copy} size={14} />
        </button>
        <button className={iconBtn} title={t.bf_close} aria-label={t.bf_close} onClick={close}>
          <Icon path={UI_ICONS.close} size={14} />
        </button>
      </div>

      {/* Choix de l'incident principal. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2 dark:border-rdia-600">
        <select
          aria-label={t.bf_pick}
          className="input-champ min-w-0 flex-1 py-1.5 text-[12.5px]"
          value={root?.id ?? ""}
          onChange={(e) => openBriefing(e.target.value || null)}
        >
          <option value="">{mains.length ? `— ${t.bf_pick} —` : t.bf_none}</option>
          {mains.map((i) => (
            <option key={i.id} value={i.id}>
              {i.id} · {i.titre}
            </option>
          ))}
        </select>
        <button
          className="flex items-center gap-1.5 rounded-md bg-or-500 px-2.5 py-1.5 text-[12px] font-bold text-rdia-900 transition-colors hover:bg-or-400 disabled:opacity-40"
          onClick={() => {
            if (ai.state !== "busy") return void runAi();
            // Interrompre : le briefing calculé revient.
            stopAi();
            setAi({ state: "idle", text: "" });
          }}
          disabled={!briefing || !!edit}
        >
          <Icon path={UI_ICONS.sparkles} size={13} />
          {ai.state === "busy" ? t.bf_ai_busy : t.bf_ai}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[12.5px] leading-relaxed">
        {!briefing ? (
          <p className="py-6 text-center text-gray-500 dark:text-rdia-300">{mains.length ? t.bf_pick : t.bf_none}</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-rdia-300">
              <span className="font-semibold text-gray-800 dark:text-rdia-50">{briefing.incidentId} · {briefing.titre}</span>
              <span>{tpl(t.bf_scope, { c: briefing.scope.children, s: briefing.scope.subIncidents })}</span>
              <span>{tpl(t.bf_generated, { date: new Date(briefing.generatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}</span>
              {edit ? (
                <span className="font-semibold text-or-600 dark:text-or-300">{t.bf_edit}</span>
              ) : (
                <span className={ai.state === "fail" ? "text-danger-600 dark:text-danger-300" : ai.state === "done" || (showingManual && ai.state !== "busy") ? "text-or-600 dark:text-or-300" : ""}>
                  {ai.state === "done"
                    ? t.bf_ai_done
                    : ai.state === "fail"
                      ? t.bf_ai_fail
                      : showingManual && saved && ai.state !== "busy"
                        ? tpl(t.bf_manual, { by: saved.by, date: quand(saved.at) })
                        : t.bf_data}
                </span>
              )}
              {ai.state === "done" && !edit && (
                <button className="underline decoration-dotted hover:text-or-600 dark:hover:text-or-300" onClick={() => setAi({ state: "idle", text: "" })}>{showingManual ? t.bf_show_manual : t.bf_back_data}</button>
              )}
              {/* Une correction existe : on peut toujours regarder le calcul à jour à côté. */}
              {saved && !edit && ai.state !== "busy" && ai.state !== "done" && (
                <button className="underline decoration-dotted hover:text-or-600 dark:hover:text-or-300" onClick={() => setView(showingManual ? "computed" : "manual")}>
                  {showingManual ? t.bf_show_computed : t.bf_show_manual}
                </button>
              )}
              {saved && showingManual && canEdit && !edit && ai.state !== "busy" && ai.state !== "done" && (
                <button
                  className={`underline decoration-dotted ${confirmReset ? "font-semibold text-danger-600 dark:text-danger-300" : "hover:text-danger-600 dark:hover:text-danger-300"}`}
                  onClick={() => void reset()}
                  onBlur={() => setConfirmReset(false)}
                  disabled={saving}
                >
                  {confirmReset ? t.bf_reset_confirm : t.bf_reset}
                </button>
              )}
            </div>
            {edit ? (
              // Échap ne quitte pas le plein écran de la carte depuis une rubrique en cours de frappe.
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.stopPropagation();
                }}
              >
                <p className="text-[11px] text-gray-500 dark:text-rdia-300">{t.bf_edit_hint}</p>
                {BRIEFING_SECTIONS.map((k) => (
                  <label key={k} className="flex flex-col gap-1">
                    <span className={rubrique}>{labels[k]}</span>
                    <textarea
                      className="input-champ resize-y py-1.5 text-[12.5px] leading-relaxed"
                      rows={Math.min(10, Math.max(3, edit[k].split("\n").length + 1))}
                      maxLength={maxOf(k)}
                      value={edit[k]}
                      onChange={(e) => setEdit({ ...edit, [k]: e.target.value })}
                    />
                  </label>
                ))}
                <div className="sticky bottom-0 -mx-3 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-3 py-2 dark:border-rdia-600 dark:bg-rdia-700/95">
                  <button type="button" className="btn-secondaire text-sm" onClick={() => setEdit(null)} disabled={saving}>{t.cancel}</button>
                  <button type="submit" className="btn-primaire text-sm" disabled={saving}>{saving ? t.bf_saving : t.bf_save}</button>
                </div>
              </form>
            ) : ai.text && (ai.state === "busy" || ai.state === "done") ? (
              aiSections ? (
                aiSections.map((s) => (
                  <section key={s.title} className="mb-3">
                    <h3 className={rubrique}>{s.title}</h3>
                    <p className={`whitespace-pre-wrap ${texte}`}>{s.body}</p>
                  </section>
                ))
              ) : (
                <p className={`whitespace-pre-wrap ${texte}`}>{ai.text}</p>
              )
            ) : showingManual && saved ? (
              // La version corrigée à la main : le texte tel qu'enregistré, rubrique par rubrique.
              BRIEFING_SECTIONS.map((k) => (
                <section key={k} className="mb-3">
                  <h3 className={rubrique}>{labels[k]}</h3>
                  <p className={`whitespace-pre-wrap ${texte}`}>{saved.sections[k] || "—"}</p>
                </section>
              ))
            ) : (
              sections.map((s) => (
                <section key={s.title} className="mb-3">
                  <h3 className={rubrique}>{s.title}</h3>
                  {s.numbered ? (
                    <ol className="flex flex-col gap-1">
                      {s.lines.map((l, k) => (
                        <li key={k} className={`flex gap-1.5 ${texte}`}>
                          <span className="w-5 shrink-0 text-end font-mono text-[11px] font-bold text-or-600 dark:text-or-300">{k + 1}.</span>
                          <span>{l}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {s.lines.map((l, k) => (
                        <li key={k} className={`flex gap-1.5 ${texte}`}>
                          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-or-500 dark:bg-or-400" />
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
