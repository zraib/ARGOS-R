"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { UI_ICONS } from "@/lib/icons";
import { hazardLabel } from "@/lib/helpers";
import { SubstanceSheetModal } from "@/components/substances/SubstanceSheetModal";
import {
  ALPHABET,
  pictogramFor,
  type LibraryResponse,
  type Provenance,
  type Substance,
} from "@/lib/nrbc/substance";

// ============================================================================
// Bibliothèque des substances dangereuses (lot N-3, refondue en N-5)
//
// CE QUE CET ÉCRAN EST. La forme des données de CAMEO Chemicals (NOAA), remplie
// de ce qu'on peut honnêtement affirmer. ARGOS n'interroge aucun service tiers
// à l'exécution (ADR 0006) : ce n'est pas une copie de CAMEO, c'est un registre
// local que l'état-major complète, avec la provenance affichée en permanence.
//
// POURQUOI LA PROVENANCE EST EN TÊTE, ET NON EN NOTE DE BAS DE PAGE. Une
// bibliothèque dont on ignore ce qui a été vérifié se lit comme si tout l'était.
//
// CE QUE LA REFONTE CHANGE. Cinq mille trois cent trente-six entrées ne se
// parcourent pas : on y accède. Trois chemins, un seul écran :
//   • la RECHERCHE, qui propose au fil de la frappe (nom, synonyme, ONU, CAS) ;
//   • l'INDEX A–Z, qui donne un rayon quand on ne sait pas quoi taper ;
//   • la FICHE EN MODALE, qui laisse la liste intacte derrière elle.
//
// Le plafond de résultats est désormais SERVEUR : la bibliothèque entière pèse
// 2,2 Mo de résumés, intransportable à chaque frappe sur une liaison de campagne.
// ============================================================================

/** Résultats rendus par page. Le compte réel voyage à part (`matched`). */
const PAGE = 120;

/** Suggestions proposées au fil de la frappe, dans la liste déroulante. */
const SUGGESTIONS = 8;

/**
 * Recherches récentes — en `sessionStorage`, JAMAIS en `localStorage`.
 * Sur un poste de commandement partagé, la liste des matières consultées dit ce
 * qui est en cours de traitement. Elle meurt avec l'onglet, comme la session.
 */
const RECENTES_KEY = "argos.substances.recent";
const RECENTES_MAX = 6;

function lireRecentes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(RECENTES_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENTES_MAX) : [];
  } catch {
    return [];
  }
}

function ecrireRecentes(v: string[]): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RECENTES_KEY, JSON.stringify(v.slice(0, RECENTES_MAX)));
  } catch {
    // Mode privé, quota plein : la commodité disparaît, la recherche demeure.
  }
}

export default function SubstancesPage() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);

  const [q, setQ] = useState("");
  const [lettre, setLettre] = useState<string | null>(null);
  const [list, setList] = useState<Substance[]>([]);
  const [matched, setMatched] = useState(0);
  const [index, setIndex] = useState<Record<string, number>>({});
  const [prov, setProv] = useState<Provenance | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouverte, setOuverte] = useState<Substance | null>(null);
  const [recentes, setRecentes] = useState<string[]>([]);

  // --- la liste déroulante de la recherche ---------------------------------
  const [deroule, setDeroule] = useState(false);
  const [curseur, setCurseur] = useState(-1);
  const champRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const listeId = useId();
  const champId = useId();

  useEffect(() => setRecentes(lireRecentes()), []);

  const nom = useCallback((s: Substance) => s.labels[lang] || s.labels.fr, [lang]);
  /** Accord du dénombrement — « 1 substance », pas « 1 substances ». */
  const compte = useCallback((n: number) => `${n} ${n === 1 ? t.cl_count_one : t.cl_count}`, [t]);

  // --- chargement ----------------------------------------------------------
  useEffect(() => {
    let vivant = true;
    setChargement(true);
    // Recherche différée : une requête par frappe reste du bruit sur un poste
    // de commandement dont la liaison peut être médiocre.
    const timer = setTimeout(() => {
      void (async () => {
        const { data } = await api.getChemLibrary({
          q: q.trim() || undefined,
          letter: lettre ?? undefined,
          limit: PAGE,
          lang,
        });
        if (!vivant) return;
        const d = data as unknown as LibraryResponse | undefined;
        if (d) {
          setList(d.substances);
          setMatched(d.matched);
          setIndex(d.index);
          setProv(d.provenance);
        }
        setChargement(false);
      })();
    }, 220);
    return () => {
      vivant = false;
      clearTimeout(timer);
    };
  }, [q, lettre, lang]);

  // Suggestions = la tête des résultats courants. Elles ne sont pas inventées :
  // ce sont les entrées que la recherche ramène réellement.
  const suggestions = useMemo(() => (q.trim() ? list.slice(0, SUGGESTIONS) : []), [q, list]);
  const propositions = q.trim() ? suggestions.length : recentes.length;

  // Fermeture au clic hors de la zone de recherche.
  useEffect(() => {
    if (!deroule) return;
    const hors = (e: MouseEvent) => {
      if (!zoneRef.current?.contains(e.target as Node)) setDeroule(false);
    };
    document.addEventListener("mousedown", hors);
    return () => document.removeEventListener("mousedown", hors);
  }, [deroule]);

  const memoriser = (terme: string) => {
    const v = terme.trim();
    if (!v) return;
    const suivant = [v, ...recentes.filter((x) => x !== v)].slice(0, RECENTES_MAX);
    setRecentes(suivant);
    ecrireRecentes(suivant);
  };

  const ouvrir = (s: Substance) => {
    setDeroule(false);
    memoriser(nom(s));
    setOuverte(s);
  };

  /** Navigation au clavier dans la liste déroulante — ↑ ↓ Entrée Échap. */
  const auClavier = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setDeroule(false);
      setCurseur(-1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (propositions === 0) return;
      e.preventDefault();
      setDeroule(true);
      setCurseur((c) => {
        const n = e.key === "ArrowDown" ? c + 1 : c - 1;
        return ((n % propositions) + propositions) % propositions;
      });
      return;
    }
    if (e.key === "Enter") {
      if (!deroule || curseur < 0) return;
      e.preventDefault();
      if (q.trim()) {
        const s = suggestions[curseur];
        if (s) ouvrir(s);
      } else {
        const terme = recentes[curseur];
        if (terme) {
          setQ(terme);
          setDeroule(false);
        }
      }
      setCurseur(-1);
    }
  };

  const effacer = () => {
    setQ("");
    setCurseur(-1);
    champRef.current?.focus();
  };

  const chip = (actif: boolean) =>
    `cible-tactile inline-flex min-w-[36px] items-center justify-center rounded-lg px-2 text-[12px] font-bold tabular-nums transition-colors lg:min-h-0 lg:py-1.5 ${
      actif
        ? "bg-or-500 text-rdia-600"
        : "bg-gray-100 text-gray-600 hover:bg-or-500/20 hover:text-or-600 dark:bg-rdia-700 dark:text-rdia-200 dark:hover:text-or-400"
    }`;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      {/* ================= en-tête : titre, recherche, provenance ========== */}
      <header className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-rdia-600 dark:text-rdia-50">
            <Icon path={UI_ICONS.nrbc} size={18} className="text-or-500" />
            {t.cl_title}
          </h1>
          {/* `aria-live` sur le COMPTE seulement : c'est le retour dont on a
              besoin après une frappe, et il tient en trois mots. */}
          <span aria-live="polite" className="text-xs tabular-nums text-gray-500 dark:text-rdia-300">
            {chargement ? t.idash_loading : compte(matched)}
          </span>
        </div>

        {/* --- la recherche, en combobox ---------------------------------- */}
        <div ref={zoneRef} className="relative">
          <label htmlFor={champId} className="sr-only">
            {t.cl_search}
          </label>
          <div className="relative">
            <Icon
              path={UI_ICONS.search}
              size={16}
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-gray-400"
              style={{ insetInlineStart: 12 }}
            />
            <input
              ref={champRef}
              id={champId}
              // `text-base` sous md : en dessous de 16 px, iOS zoome à la mise
              // au point et déforme la page entière.
              className="input-champ cible-tactile w-full text-base md:text-sm"
              style={{ paddingInlineStart: 36, paddingInlineEnd: q ? 40 : 12 }}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setDeroule(true);
                setCurseur(-1);
              }}
              onFocus={() => setDeroule(true)}
              onKeyDown={auClavier}
              placeholder={t.cl_search}
              type="search"
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={deroule && propositions > 0}
              aria-controls={listeId}
              aria-autocomplete="list"
              aria-activedescendant={curseur >= 0 ? `${listeId}-${curseur}` : undefined}
            />
            {q && (
              <button
                onClick={effacer}
                aria-label={t.flt_clear}
                className="absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-or-500"
                style={{ insetInlineEnd: 6 }}
              >
                <Icon path={UI_ICONS.close} size={14} />
              </button>
            )}
          </div>

          {/* Liste déroulante : suggestions au fil de la frappe, recherches
              récentes quand le champ est vide. */}
          {deroule && propositions > 0 && (
            <ul
              id={listeId}
              role="listbox"
              aria-label={t.cl_suggestions}
              className="absolute inset-x-0 top-full z-30 mt-1 max-h-[320px] overflow-y-auto overscroll-contain rounded-xl border border-gray-100 bg-white py-1 shadow-2xl dark:border-rdia-600 dark:bg-rdia-700"
            >
              {!q.trim() && (
                <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-rdia-400">
                  {t.cl_recent}
                </li>
              )}
              {q.trim()
                ? suggestions.map((s, i) => (
                    <li key={s.id} id={`${listeId}-${i}`} role="option" aria-selected={i === curseur}>
                      <button
                        onClick={() => ouvrir(s)}
                        onMouseEnter={() => setCurseur(i)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-start transition-colors ${
                          i === curseur ? "bg-or-500/15" : "hover:bg-gray-50 dark:hover:bg-rdia-600/50"
                        }`}
                      >
                        <HazardIcon kind={pictogramFor(s)} size={22} label="" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-gray-800 dark:text-rdia-50">
                            {nom(s)}
                          </span>
                          <span className="block truncate font-mono text-[10.5px] tabular-nums text-gray-500 dark:text-rdia-300">
                            {s.un ? `${t.cl_un} ${s.un} · ` : ""}
                            {t.cl_guide} {s.ergGuide}
                          </span>
                        </span>
                        {/* La disponibilité des distances se voit AVANT
                            l'ouverture : c'est ce qu'on vient chercher. */}
                        {s.small && s.large && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              s.ergVerified ? "bg-green-500/12 text-green-600" : "bg-or-500/15 text-or-600 dark:text-or-400"
                            }`}
                          >
                            {t.cl_erg_short}
                          </span>
                        )}
                      </button>
                    </li>
                  ))
                : recentes.map((terme, i) => (
                    <li key={terme} id={`${listeId}-${i}`} role="option" aria-selected={i === curseur}>
                      <button
                        onClick={() => {
                          setQ(terme);
                          setDeroule(false);
                        }}
                        onMouseEnter={() => setCurseur(i)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-start text-[13px] text-gray-700 transition-colors dark:text-rdia-100 ${
                          i === curseur ? "bg-or-500/15" : "hover:bg-gray-50 dark:hover:bg-rdia-600/50"
                        }`}
                      >
                        <Icon path={UI_ICONS.clock} size={14} className="shrink-0 text-gray-400" />
                        <span className="min-w-0 flex-1 truncate">{terme}</span>
                      </button>
                    </li>
                  ))}
            </ul>
          )}
        </div>

        {/* --- index alphabétique ----------------------------------------- */}
        <nav aria-label={t.cl_index} className="flex flex-wrap items-center gap-1">
          <button onClick={() => setLettre(null)} className={chip(lettre === null)} aria-pressed={lettre === null}>
            {t.flt_all}
          </button>
          {ALPHABET.map((l) => {
            const n = index[l] ?? 0;
            return (
              <button
                key={l}
                onClick={() => setLettre(lettre === l ? null : l)}
                // Un rayon vide est désactivé plutôt que masqué : l'alphabet
                // garde sa forme, et l'absence est une information.
                disabled={n === 0}
                aria-pressed={lettre === l}
                aria-label={`${l} — ${compte(n)}`}
                title={compte(n)}
                className={`${chip(lettre === l)} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-gray-100 dark:disabled:hover:bg-rdia-700`}
              >
                {l}
              </button>
            );
          })}
        </nav>

        {/* --- provenance : en tête, pas en note --------------------------- */}
        {prov && (
          <div className="rounded-lg border border-or-500/30 bg-or-500/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-or-600 dark:text-or-400">
              <Icon path={UI_ICONS.shield} size={12} />
              {t.cl_provenance}
            </div>
            {/* Deux lignes, deux sources : les fondre laisserait croire qu'une
                fiche vérifiée vaut distance vérifiée. */}
            <ul className="flex flex-col gap-0.5 text-[11.5px] leading-snug text-gray-600 dark:text-rdia-200">
              <li>{`${prov.withSheet}/${prov.total} ${t.cl_prov_sheets} ${prov.sheetVerified} ${t.cl_prov_sheets_ok}`}</li>
              <li>{`${prov.withErgDistances}/${prov.total} ${t.cl_prov_erg} ${prov.ergVerified} ${t.cl_prov_erg_ok}`}</li>
              {/* Un jeu versé par l'état-major dit d'où il vient ET à quel titre
                  il est détenu : une bibliothèque enrichie dont on ignore
                  l'origine de l'enrichissement aurait l'air complète.
                  Le NOMBRE de jeux reste toujours visible — c'est lui qui porte
                  l'aveu ; seul le titre de détention, long de plusieurs lignes,
                  se replie, faute de quoi il repousse les résultats hors de
                  l'écran à chaque consultation. */}
              {prov.origins && prov.origins.length > 0 && (
                <li className="mt-1 border-t border-or-500/20 pt-1">
                  <details className="group">
                    <summary className="cible-tactile inline-flex cursor-pointer list-none items-center gap-1.5 font-semibold text-or-600 dark:text-or-400">
                      <Icon
                        path={UI_ICONS.chevronRight}
                        size={11}
                        className="shrink-0 transition-transform group-open:rotate-90 rtl:-scale-x-100"
                      />
                      {`${prov.origins.length} ${t.cl_prov_origins}`}
                    </summary>
                    <ul className="mt-1 flex flex-col gap-1.5 ps-4">
                      {prov.origins.map((o) => (
                        <li key={o.source}>
                          <span className="font-semibold">{o.source}</span>
                          {` — ${o.retrievedAt} · ${o.count} · ${o.authorization}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )}
            </ul>
          </div>
        )}
      </header>

      {/* ================= résultats ====================================== */}
      {chargement && list.length === 0 ? (
        // Squelettes : la grille garde sa place, la page ne saute pas quand les
        // résultats arrivent.
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="carte h-[92px] animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      ) : list.length === 0 ? (
        // Jamais un écran vide : ce qui a été cherché, et par quoi reprendre.
        <div className="carte flex flex-col items-center gap-3 p-8 text-center">
          <Icon path={UI_ICONS.search} size={28} className="text-gray-300 dark:text-rdia-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-rdia-100">
            {t.cl_none} {q.trim() && <span className="font-mono">« {q.trim()} »</span>}
          </p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-gray-500 dark:text-rdia-300">{t.cl_none_hint}</p>
          {(q || lettre) && (
            <button
              className="btn-secondaire cible-tactile text-sm"
              onClick={() => {
                setQ("");
                setLettre(null);
              }}
            >
              {t.flt_clear}
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const picto = pictogramFor(s);
            return (
              <article key={s.id} className="carte overflow-hidden">
                {/* La carte ENTIÈRE est le bouton : viser un chevron de 14 px au
                    doigt est une exigence de précision inutile. */}
                <button
                  onClick={() => ouvrir(s)}
                  className="flex w-full items-start gap-3 p-3 text-start transition-colors hover:bg-or-500/5 focus-visible:bg-or-500/5"
                  aria-label={s.un ? `${nom(s)} — ${t.cl_un} ${s.un}` : nom(s)}
                >
                  <HazardIcon kind={picto} size={30} label={hazardLabel(picto, t)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-800 dark:text-rdia-50">{nom(s)}</span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] tabular-nums text-gray-500 dark:text-rdia-300">
                      {s.un ? `${t.cl_un} ${s.un} · ` : ""}
                      {s.cas ? `${t.cl_cas} ${s.cas} · ` : ""}
                      {t.cl_guide} {s.ergGuide}
                    </span>
                    {/* --- l'état des distances, visible SANS ouvrir la fiche - */}
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {!s.small || !s.large ? (
                        <span className="rounded-md bg-gray-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-rdia-300">
                          {t.cl_erg_missing}
                        </span>
                      ) : s.ergVerified ? (
                        <span className="rounded-md bg-green-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                          {t.cl_erg_verified}
                        </span>
                      ) : (
                        <span className="rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-or-600 dark:text-or-400">
                          {t.cl_erg_unverified}
                        </span>
                      )}
                    </span>
                  </span>
                  <Icon path={UI_ICONS.chevronRight} size={14} className="mt-1 shrink-0 text-gray-300 dark:text-rdia-500" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* PLAFOND. Il est dit, avec le compte réel : une liste tronquée en
          silence se lit comme une liste complète. */}
      {matched > list.length && (
        <p className="text-center text-xs text-gray-500 dark:text-rdia-300">
          {`${list.length} / ${matched} — ${t.cl_capped}`}
        </p>
      )}

      {ouverte && <SubstanceSheetModal summary={ouverte} onClose={() => setOuverte(null)} />}
    </section>
  );
}
