"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { HazardIcon } from "@/components/ui/HazardIcon";
import { UI_ICONS } from "@/lib/icons";
import { hazardLabel } from "@/lib/helpers";
import { useArgos, useDict } from "@/lib/store";
import { api } from "@/lib/api";
import { pictogramFor, type Substance } from "@/lib/nrbc/substance";

// ============================================================================
// Fiche d'une substance, en modale (lot N-5)
//
// POURQUOI UNE MODALE ET PLUS UN DÉPLIAGE. La carte dépliée poussait toutes les
// suivantes hors de l'écran : on perdait sa place dans la liste à chaque
// consultation, et la fiche elle-même — jusqu'à onze rubriques — se lisait dans
// une colonne étroite. La modale laisse la liste intacte derrière et donne à la
// fiche la largeur qu'elle demande.
//
// LA FICHE EST CHARGÉE À L'OUVERTURE, pas avec la liste : le référentiel
// complet pèse 22 Mo de texte, et une réponse de cette taille sur une liaison
// de campagne est inutilisable.
// ============================================================================

interface Props {
  /** Résumé déjà connu par la liste — affiché immédiatement, sans attendre. */
  summary: Substance;
  onClose: () => void;
}

/** Une rubrique rédactionnelle de la fiche. */
function Rubrique({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-lg bg-gray-50 p-3 dark:bg-rdia-800/40">
      <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-or-600 dark:text-or-400">{label}</h4>
      {/* `whitespace-pre-line` : les fiches CAMEO portent des retours à la ligne
          signifiants (listes de consignes) que le rendu écrasait en un pavé. */}
      <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-gray-700 dark:text-rdia-100">{value}</p>
    </section>
  );
}

/** Une propriété physique chiffrée. */
function Propriete({ label, value, alerte }: { label: string; value: string; alerte?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 px-2.5 py-2 dark:border-rdia-600">
      <div className="text-[9.5px] font-semibold uppercase tracking-wider text-gray-400 dark:text-rdia-400">{label}</div>
      <div className={`mt-0.5 font-mono text-[13px] font-bold tabular-nums ${alerte ? "text-danger-500" : "text-gray-800 dark:text-rdia-50"}`}>
        {value}
      </div>
    </div>
  );
}

export function SubstanceSheetModal({ summary, onClose }: Props) {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const [detail, setDetail] = useState<Substance | null>(null);
  const [echec, setEchec] = useState(false);

  useEffect(() => {
    let vivant = true;
    setDetail(null);
    setEchec(false);
    void (async () => {
      const { data, error } = await api.getSubstance(summary.id);
      if (!vivant) return;
      if (error || !data) setEchec(true);
      else setDetail(data as unknown as Substance);
    })();
    return () => {
      vivant = false;
    };
  }, [summary.id]);

  const s = detail ?? summary;
  const nom = s.labels[lang] || s.labels.fr;
  const picto = pictogramFor(s);
  const feuille = detail?.sheet;

  return (
    <Modal open title={nom} onClose={onClose} size="xl">
      <div className="space-y-4">
        {/* --- identité : ce qui est lu sur la citerne ---------------------- */}
        <header className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 dark:bg-rdia-800/40">
          <HazardIcon kind={picto} size={44} label={hazardLabel(picto, t)} />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-tight text-gray-900 dark:text-rdia-50">{nom}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11.5px] tabular-nums text-gray-600 dark:text-rdia-200">
              {/* La pastille ONU disparaît avec sa valeur : sept fiches CAMEO
                  sur dix n'ont pas de numéro ONU — toutes ne sont pas des
                  marchandises réglementées au transport. Une étiquette vide se
                  lirait comme une donnée perdue, et non comme une absence. */}
              {s.un && (
                <span className="rounded bg-or-500/15 px-1.5 py-0.5 font-bold text-or-600 dark:text-or-400">
                  {t.cl_un} {s.un}
                </span>
              )}
              <span>
                {t.cl_guide} {s.ergGuide}
              </span>
              {s.cas && (
                <span>
                  {t.cl_cas} {s.cas}
                </span>
              )}
              {/* L'ÉTAT PHYSIQUE N'EST PAS AFFICHÉ, ET C'EST DÉLIBÉRÉ. L'extraction
                  des fiches CAMEO (lot N-3d) inscrit `state: "liquid"` en dur
                  pour les 5 336 entrées, faute de colonne fiable dans la base —
                  et cette valeur écrase la nôtre à la fusion : le chlore, gaz
                  dans notre source, ressort « liquide ». Le champ est un
                  remplissage, pas une détermination. L'afficher reviendrait à
                  affirmer un état jamais établi, ce qui change la façon dont un
                  intervenant se représente le danger. Il ne pilote aucune
                  logique : le taire ne coûte rien, l'affirmer coûterait cher. */}
            </div>
            {/* Synonymes : c'est souvent sous l'un d'eux que la matière est
                nommée par l'exploitant du site, pas sous son nom réglementaire. */}
            {s.synonyms && s.synonyms.length > 0 && (
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">
                <span className="font-semibold">{t.cl_synonyms} </span>
                {s.synonyms.slice(0, 8).join(" · ")}
              </p>
            )}
          </div>
        </header>

        {/* --- distances ERG : la seule partie qui décide d'un périmètre ---- */}
        {s.small && s.large ? (
          <section>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-rdia-300">
                {t.cl_erg_table}
              </h4>
              {/* La provenance des distances est collée AU tableau, pas reléguée
                  en bas de fiche : c'est ce tableau qu'on recopie sur le terrain. */}
              {s.ergVerified ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-green-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">
                  <Icon path={UI_ICONS.check} size={10} />
                  {t.cl_erg_verified}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md bg-or-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-or-600 dark:text-or-400">
                  <Icon path={UI_ICONS.alert} size={10} />
                  {t.cl_erg_unverified}
                </span>
              )}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-100 dark:border-rdia-600">
              <table className="w-full min-w-[440px] text-[12px] tabular-nums">
                <thead className="bg-gray-50 text-gray-500 dark:bg-rdia-800/40 dark:text-rdia-300">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">{t.cl_spill}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.cl_isolation}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.cl_protect_day}</th>
                    <th className="px-3 py-2 text-end font-semibold">{t.cl_protect_night}</th>
                  </tr>
                </thead>
                <tbody className="text-gray-800 dark:text-rdia-50">
                  {([[t.cl_spill_small, s.small], [t.cl_spill_large, s.large]] as const).map(([k, d]) => (
                    <tr key={k} className="border-t border-gray-100 dark:border-rdia-600">
                      <td className="px-3 py-2 font-sans font-semibold">{k}</td>
                      <td className="px-3 py-2 text-end">{d.isolationM} m</td>
                      <td className="px-3 py-2 text-end">{d.protectDayKm} km</td>
                      <td className="px-3 py-2 text-end font-bold">{d.protectNightKm} km</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          // L'absence de distances est DITE. Une fiche muette sur ce point se
          // lirait comme une fiche sans danger particulier.
          <p className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] font-semibold text-gray-600 dark:border-rdia-600 dark:bg-rdia-800/40 dark:text-rdia-200">
            <Icon path={UI_ICONS.alert} size={14} className="shrink-0 text-gray-400" />
            {t.cl_erg_missing_long}
          </p>
        )}

        {/* --- corps de fiche ---------------------------------------------- */}
        {echec ? (
          <p role="alert" className="rounded-lg border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-[12px] font-semibold text-danger-400">
            {t.cl_sheet_failed}
          </p>
        ) : !detail ? (
          // Squelette plutôt qu'un tourniquet : la place de la fiche est déjà
          // réservée, la boîte ne saute pas quand elle arrive.
          <div className="space-y-2" aria-busy="true" aria-label={t.idash_loading}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 motion-reduce:animate-none dark:bg-rdia-800/40" />
            ))}
          </div>
        ) : !feuille ? (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-500 dark:bg-rdia-800/40 dark:text-rdia-300">
            {t.cl_sheet_none}
          </p>
        ) : (
          <>
            {!detail.sheetVerified && (
              <p className="flex items-center gap-2 rounded-lg bg-or-500/10 px-3 py-2 text-[11.5px] font-semibold text-or-600 dark:text-or-400">
                <Icon path={UI_ICONS.alert} size={13} className="shrink-0" />
                {t.cl_sheet_unverified}
              </p>
            )}

            {/* Propriétés physiques : peu nombreuses, très denses, elles
                méritent leur propre bande plutôt que d'être noyées en prose. */}
            {(feuille.vaporDensity !== undefined ||
              feuille.boilingPointC !== undefined ||
              feuille.idlhPpm !== undefined ||
              feuille.flashPointC !== undefined) && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {feuille.vaporDensity !== undefined && (
                  // Ce seul chiffre décide du sens d'évacuation : il est traduit
                  // en conduite, pas laissé en nombre nu.
                  <Propriete
                    label={t.cl_vapor}
                    value={`${feuille.vaporDensity} — ${feuille.vaporDensity > 1 ? t.cl_heavier : t.cl_lighter}`}
                    alerte={feuille.vaporDensity > 1}
                  />
                )}
                {feuille.idlhPpm !== undefined && <Propriete label={t.cl_idlh} value={`${feuille.idlhPpm} ppm`} alerte />}
                {feuille.boilingPointC !== undefined && (
                  <Propriete label={t.cl_boiling} value={`${feuille.boilingPointC} °C`} />
                )}
                {feuille.flashPointC !== undefined && <Propriete label={t.cl_flash} value={`${feuille.flashPointC} °C`} />}
              </div>
            )}

            {/* Ordre d'URGENCE, pas ordre du modèle de données : ce qui se lit
                en arrivant sur zone vient en premier. */}
            <div className="grid gap-2.5 lg:grid-cols-2">
              <Rubrique label={t.cl_health} value={feuille.health} />
              {feuille.firstAid && <Rubrique label={t.cl_first_aid} value={feuille.firstAid} />}
              {feuille.isolationAdvice && <Rubrique label={t.cl_isolation_advice} value={feuille.isolationAdvice} />}
              <Rubrique label={t.cl_ppe} value={feuille.ppe} />
              <Rubrique label={t.cl_fire} value={feuille.fire} />
              {feuille.fireFighting && <Rubrique label={t.cl_fire_fight} value={feuille.fireFighting} />}
              {feuille.nonFireResponse && <Rubrique label={t.cl_non_fire} value={feuille.nonFireResponse} />}
              {feuille.specialHazards && <Rubrique label={t.cl_special} value={feuille.specialHazards} />}
              <Rubrique label={t.cl_behaviour} value={feuille.behaviour} />
              <Rubrique label={t.cl_reactivity} value={feuille.reactivity} />
              <Rubrique label={t.cl_appearance} value={feuille.appearance} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
