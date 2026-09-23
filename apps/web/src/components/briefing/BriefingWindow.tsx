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
// ============================================================================

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useArgos, useDict, useModules } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { tpl } from "@/lib/i18n/format";
import { typeLabel } from "@/lib/helpers";
import { briefingText, buildBriefing, type Briefing } from "@/lib/briefing";
import { refineBriefing, splitBriefingSections } from "@/lib/ai/llmBriefing";
import { predictIncidentEvolution } from "@/lib/ai/risk/incidentEvolution";
import type { Incident, WeatherForecast } from "@/lib/types";

const POS_KEY = "argos_briefing_pos";
const DEFAULT_W = 440;

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

  // La liste du compte, complétée de ce que la carte montre à tous (ADR 0020).
  const incidents = useMemo<Incident[]>(() => {
    const seen = new Set<string>();
    return [...scoped, ...mapIncidents].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
  }, [scoped, mapIncidents]);
  const mains = useMemo(() => incidents.filter((i) => !i.parentId && !i.archived), [incidents]);
  const root = incidentId ? incidents.find((i) => i.id === incidentId) : undefined;

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

  const labels = { situation: t.bf_situation, anticipation: t.bf_anticipation, objectives: t.bf_objectives, concept: t.bf_concept };

  // --- rédaction par l'IA -----------------------------------------------------
  const [ai, setAi] = useState<{ state: "idle" | "busy" | "done" | "fail"; text: string }>({ state: "idle", text: "" });
  const abort = useRef<AbortController | null>(null);
  const stopAi = () => {
    abort.current?.abort();
    abort.current = null;
  };
  // Changer d'incident, actualiser ou fermer : on revient au briefing calculé.
  useEffect(() => {
    stopAi();
    setAi({ state: "idle", text: "" });
  }, [root?.id, nonce, open]);
  useEffect(() => () => stopAi(), []);

  const runAi = async () => {
    if (!briefing) return;
    stopAi();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setAi({ state: "busy", text: "" });
    const res = await refineBriefing(briefingText(briefing, labels), aiSettings, {
      signal: ctrl.signal,
      onToken: (acc) => setAi({ state: "busy", text: acc }),
    });
    if (res.aborted) return;
    setAi(res.ok ? { state: "done", text: res.text } : { state: "fail", text: "" });
  };

  const copy = async () => {
    if (!briefing) return;
    const text = ai.state === "done" ? ai.text : briefingText(briefing, labels);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t.bf_copied);
    } catch {
      /* presse-papiers refusé : rien à faire */
    }
  };

  if (!open) return null;

  const aiSections = ai.text ? splitBriefingSections(ai.text) : null;
  const sections: { title: string; lines: string[] }[] = briefing
    ? [
        { title: t.bf_situation, lines: briefing.situation },
        { title: t.bf_anticipation, lines: briefing.anticipation },
        { title: t.bf_objectives, lines: briefing.objectives },
        { title: t.bf_concept, lines: briefing.concept },
      ]
    : [];
  const iconBtn = "cible-tactile flex h-8 w-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-or-300 disabled:opacity-40";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="briefing-titre"
      className={`fixed flex max-h-[75dvh] min-h-[220px] min-w-[300px] flex-col overflow-hidden rounded-xl border border-white/15 bg-rdia-800/95 text-white shadow-2xl backdrop-blur-md ${mapFull ? "z-[10002]" : "z-[80]"}`}
      style={{ left: pos.x, top: pos.y, width: `min(${DEFAULT_W}px, calc(100vw - 16px))`, resize: "both" }}
    >
      {/* Barre de titre : la poignée de déplacement. */}
      <div
        className="flex cursor-move select-none items-center gap-2 border-b border-white/10 bg-rdia-900/60 px-3 py-2"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        tabIndex={0}
        aria-label={t.bf_move}
        title={t.bf_move}
      >
        <Icon path={UI_ICONS.sparkles} size={15} className="shrink-0 text-or-400" />
        <h2 id="briefing-titre" className="min-w-0 flex-1 truncate text-[13px] font-bold uppercase tracking-wider">{t.bf_title}</h2>
        <button className={iconBtn} title={t.bf_refresh} aria-label={t.bf_refresh} onClick={() => setNonce((n) => n + 1)} disabled={!briefing}>
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
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <select
          aria-label={t.bf_pick}
          className="min-w-0 flex-1 rounded-md border border-white/15 bg-rdia-900/70 px-2 py-1.5 text-[12.5px] text-white"
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
          disabled={!briefing}
        >
          <Icon path={UI_ICONS.sparkles} size={13} />
          {ai.state === "busy" ? t.bf_ai_busy : t.bf_ai}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[12.5px] leading-relaxed">
        {!briefing ? (
          <p className="py-6 text-center text-white/60">{mains.length ? t.bf_pick : t.bf_none}</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
              <span className="font-semibold text-white/85">{briefing.incidentId} · {briefing.titre}</span>
              <span>{tpl(t.bf_scope, { c: briefing.scope.children, s: briefing.scope.subIncidents })}</span>
              <span>{tpl(t.bf_generated, { date: new Date(briefing.generatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) })}</span>
              <span className={ai.state === "done" ? "text-or-300" : ai.state === "fail" ? "text-danger-300" : ""}>
                {ai.state === "done" ? t.bf_ai_done : ai.state === "fail" ? t.bf_ai_fail : t.bf_data}
              </span>
              {ai.state === "done" && (
                <button className="underline decoration-dotted hover:text-or-300" onClick={() => setAi({ state: "idle", text: "" })}>{t.bf_back_data}</button>
              )}
            </div>
            {ai.text && (ai.state === "busy" || ai.state === "done") ? (
              aiSections ? (
                aiSections.map((s) => (
                  <section key={s.title} className="mb-3">
                    <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-or-300">{s.title}</h3>
                    <p className="whitespace-pre-wrap text-white/90">{s.body}</p>
                  </section>
                ))
              ) : (
                <p className="whitespace-pre-wrap text-white/90">{ai.text}</p>
              )
            ) : (
              sections.map((s) => (
                <section key={s.title} className="mb-3">
                  <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-or-300">{s.title}</h3>
                  <ul className="flex flex-col gap-1">
                    {s.lines.map((l, k) => (
                      <li key={k} className="flex gap-1.5 text-white/90">
                        <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-or-400" />
                        <span>{l}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
