"use client";

import { useEffect, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { UI_ICONS } from "@/lib/icons";
import { hazardLabel } from "@/lib/helpers";
import type { HazardKind } from "@/lib/hazard/pictograms";

// ============================================================================
// Bibliothèque des substances dangereuses (lot N-3)
//
// CE QUE CET ÉCRAN EST. La forme des données de CAMEO Chemicals (NOAA), remplie
// de ce qu'on peut honnêtement affirmer. ARGOS n'interroge aucun service tiers
// à l'exécution (ADR 0006) : ce n'est donc pas une copie de CAMEO, c'est un
// registre local que l'état-major complète, avec la provenance affichée en
// permanence.
//
// POURQUOI LA PROVENANCE EST EN TÊTE, ET NON EN NOTE DE BAS DE PAGE. Une
// bibliothèque dont on ignore ce qui a été vérifié se lit comme si tout l'était.
// Le bandeau dit combien de fiches ont été confrontées à CAMEO et combien de
// jeux de distances relevés sur l'ERG — aujourd'hui : peu. C'est exact, et le
// dire est la seule façon que ça change.
//
// DEUX PROVENANCES DISTINCTES, JAMAIS FONDUES. `sheetVerified` porte sur la
// FICHE (comportement, effets, réactivité) ; `ergVerified` sur les DISTANCES.
// Une fiche juste n'implique pas des distances justes.
// ============================================================================

interface Sheet {
  appearance: string;
  vaporDensity?: number;
  boilingPointC?: number;
  behaviour: string;
  health: string;
  fire: string;
  reactivity: string;
  ppe: string;
}

interface Substance {
  id: string;
  un: string;
  cas?: string;
  ergGuide: string;
  labels: { fr: string; ar: string; en: string };
  synonyms?: string[];
  hazardClass?: string;
  state: "gas" | "liquid";
  small?: { isolationM: number; protectDayKm: number; protectNightKm: number };
  large?: { isolationM: number; protectDayKm: number; protectNightKm: number };
  sheet?: Sheet;
  ergVerified: boolean;
  sheetVerified?: boolean;
}

interface Provenance {
  total: number;
  ergVerified: number;
  withErgDistances: number;
  sheetVerified: number;
  withSheet: number;
  /** Jeu SOUS LICENCE chargé par-dessus la bibliothèque livrée (lot N-3b). */
  origin: { source: string; retrievedAt: string; authorization: string } | null;
}

/** Classe ADR → pictogramme réglementaire (lot N-1). */
function pictogramFor(s: Substance): HazardKind {
  if (s.hazardClass === "7") return "radioactive";
  if (s.hazardClass === "6.2") return "biohazard";
  // 2.3, 6.1, 8, 3 : le danger dominant reste la toxicité ou la corrosion, que
  // la tête de mort porte. Le fût sert les contextes de stockage, pas la fiche.
  return "toxic";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <p className="text-xs leading-relaxed text-gray-700 dark:text-rdia-100">{value}</p>
    </div>
  );
}

export default function SubstancesPage() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);

  const [q, setQ] = useState("");
  const [list, setList] = useState<Substance[]>([]);
  const [prov, setProv] = useState<Provenance | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Recherche différée : la bibliothèque tient en mémoire côté serveur, mais
    // une requête par frappe reste du bruit sur un poste de commandement dont
    // la liaison peut être médiocre.
    const timer = setTimeout(() => {
      void (async () => {
        const { data } = await api.getChemLibrary(q.trim() || undefined);
        if (!alive || !data) return;
        const d = data as unknown as { substances: Substance[]; provenance: Provenance };
        setList(d.substances);
        setProv(d.provenance);
      })();
    }, 220);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const label = (s: Substance) => s.labels[lang] ?? s.labels.fr;

  return (
    <section className="flex flex-col gap-4 animate-fade-in">
      <header className="carte flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-bold text-rdia-600 dark:text-rdia-50">
            <Icon path={UI_ICONS.nrbc} size={18} className="text-or-500" />
            {t.cl_title}
          </h1>
          <span className="text-xs tabular-nums text-gray-500 dark:text-rdia-300">
            {list.length} {t.cl_count}
          </span>
        </div>

        <input
          className="input-champ text-base md:text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.cl_search}
          aria-label={t.cl_search}
        />

        {/* --- provenance : en tête, pas en note ------------------------- */}
        {prov && (
          <div className="rounded-lg border border-or-500/30 bg-or-500/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-or-600 dark:text-or-400">
              <Icon path={UI_ICONS.shield} size={12} />
              {t.cl_provenance}
            </div>
            {/* Deux lignes, deux sources : les fondre laisserait croire qu'une
                fiche vérifiée vaut distance vérifiée. */}
            <ul className="flex flex-col gap-0.5 text-[11.5px] leading-snug text-gray-600 dark:text-rdia-200">
              <li>
                {`${prov.withSheet}/${prov.total} fiches opérationnelles — ${prov.sheetVerified} confrontée${
                  prov.sheetVerified > 1 ? "s" : ""
                } à CAMEO Chemicals (NOAA).`}
              </li>
              <li>
                {`${prov.withErgDistances}/${prov.total} jeux de distances — ${prov.ergVerified} relevé${
                  prov.ergVerified > 1 ? "s" : ""
                } sur la table 1 de l'ERG 2024.`}
              </li>
              {/* Un jeu versé par l'état-major dit d'où il vient ET à quel
                  titre il est détenu : une bibliothèque enrichie dont on ignore
                  l'origine de l'enrichissement aurait l'air complète. */}
              {prov.origin && (
                <li className="mt-1 border-t border-or-500/20 pt-1">
                  {`Jeu versé : ${prov.origin.source} — relevé le ${prov.origin.retrievedAt}, détenu au titre : ${prov.origin.authorization}.`}
                </li>
              )}
            </ul>
          </div>
        )}
      </header>

      {list.length === 0 ? (
        <p className="carte p-8 text-center text-sm text-gray-500 dark:text-rdia-300">{t.cl_none}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => {
            const isOpen = openId === s.id;
            return (
              <article key={s.id} className={`carte flex flex-col p-3 ${isOpen ? "md:col-span-2 xl:col-span-3" : ""}`}>
                <button
                  className="flex items-start gap-3 text-start"
                  onClick={() => setOpenId(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                >
                  <HazardIcon kind={pictogramFor(s)} size={30} label={hazardLabel(pictogramFor(s), t)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-800 dark:text-rdia-50">{label(s)}</span>
                    <span className="mt-0.5 block text-[11px] tabular-nums text-gray-500 dark:text-rdia-300">
                      {t.cl_un} {s.un}
                      {s.cas ? ` · ${t.cl_cas} ${s.cas}` : ""} · {t.cl_guide} {s.ergGuide}
                    </span>
                  </span>
                  <Icon
                    path={UI_ICONS.chevronDown}
                    size={14}
                    className={`mt-1 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {/* --- l'état des distances, visible SANS ouvrir la fiche --- */}
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                </div>

                {isOpen && s.sheet && (
                  <div className="mt-3 border-t border-gray-100 pt-3 dark:border-rdia-700/50">
                    {!s.sheetVerified && (
                      <p className="mb-3 rounded-lg bg-or-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-or-600 dark:text-or-400">
                        {t.cl_sheet_unverified}
                      </p>
                    )}

                    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-gray-500 dark:text-rdia-300">
                      {s.sheet.vaporDensity !== undefined && (
                        <span className="tabular-nums">
                          {t.cl_vapor} {s.sheet.vaporDensity} —{" "}
                          {/* Ce seul chiffre décide du sens d'évacuation : il mérite
                              d'être traduit en conduite, pas laissé en nombre nu. */}
                          <span className={s.sheet.vaporDensity > 1 ? "font-semibold text-danger-500" : ""}>
                            {s.sheet.vaporDensity > 1 ? t.cl_heavier : t.cl_lighter}
                          </span>
                        </span>
                      )}
                      {s.sheet.boilingPointC !== undefined && (
                        <span className="tabular-nums">
                          {t.cl_boiling} {s.sheet.boilingPointC} °C
                        </span>
                      )}
                      {s.synonyms && s.synonyms.length > 0 && <span>{s.synonyms.join(" · ")}</span>}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <Field label={t.cl_appearance} value={s.sheet.appearance} />
                      <Field label={t.cl_behaviour} value={s.sheet.behaviour} />
                      <Field label={t.cl_health} value={s.sheet.health} />
                      <Field label={t.cl_fire} value={s.sheet.fire} />
                      <Field label={t.cl_reactivity} value={s.sheet.reactivity} />
                      <Field label={t.cl_ppe} value={s.sheet.ppe} />
                    </div>

                    {s.small && s.large && (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[420px] text-[11px] tabular-nums">
                          <thead className="text-gray-400 dark:text-rdia-400">
                            <tr className="text-start">
                              <th className="py-1 text-start font-semibold">ERG 2024</th>
                              <th className="py-1 text-end font-semibold">Isolement</th>
                              <th className="py-1 text-end font-semibold">Protection — jour</th>
                              <th className="py-1 text-end font-semibold">Protection — nuit</th>
                            </tr>
                          </thead>
                          <tbody className="text-gray-700 dark:text-rdia-100">
                            {([["Petit déversement", s.small], ["Grand déversement", s.large]] as const).map(([k, d]) => (
                              <tr key={k} className="border-t border-gray-100 dark:border-rdia-700/50">
                                <td className="py-1">{k}</td>
                                <td className="py-1 text-end">{d.isolationM} m</td>
                                <td className="py-1 text-end">{d.protectDayKm} km</td>
                                <td className="py-1 text-end">{d.protectNightKm} km</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
