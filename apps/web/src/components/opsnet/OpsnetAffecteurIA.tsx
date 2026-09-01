"use client";

import { useMemo, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import { Icon } from "@/components/ui/Icon";
import { UI_ICONS } from "@/lib/icons";
import { rankShelters, rankUnits, type ShelterRow, type UnitRow } from "@/lib/ai/opsnetAffecteur";

// ============================================================================
// OPSnet — affecteur
//
// DEUX BESOINS, PAS UN. « Engager » et « héberger » ne se ramènent pas l'un à
// l'autre : on cherche des unités par trajet, effectif et préparation ; des
// abris par trajet, places libres et approvisionnement. Un onglet commun avec
// des colonnes différentes tromperait sur ce qui est comparé.
//
// LE CLASSEMENT EST CALCULÉ, PAS DEVINÉ. Le score vient d'une fonction pure
// (`lib/ai/opsnetAffecteur.ts`) dont les sous-scores sont AFFICHÉS : un
// classement qu'on ne peut pas contredire n'est pas un outil d'aide à la
// décision, c'est un oracle. Le chef doit pouvoir voir pourquoi le deuxième est
// deuxième, et décider autrement.
//
// LE CUMUL PLUTÔT QUE LE VAINQUEUR. On n'envoie pas « la meilleure unité », on
// envoie autant d'unités qu'il en faut. Le rang auquel le besoin est couvert
// est l'information utile.
// ============================================================================

const CARTE = "rounded-xl border border-gray-200 bg-white p-3 dark:border-rdia-600 dark:bg-rdia-700";
const LABEL = "mb-1 block text-[11px] font-semibold text-gray-600 dark:text-rdia-200";
const CHAMP = "input-champ w-full text-sm";

type Mode = "engage" | "heberge";

export function OpsnetAffecteurIA() {
  const t = useDict();
  const units = useArgos((s) => s.units);
  const cities = useArgos((s) => s.cities);
  const shelters = useArgos((s) => s.catalog.shelters);
  const incidents = useArgos((s) => s.incidents);

  const [mode, setMode] = useState<Mode>("engage");
  const [lng, setLng] = useState("-8.24");
  const [lat, setLat] = useState("31.22");
  const [effectif, setEffectif] = useState(120);
  const [personnes, setPersonnes] = useState(250);
  const [rayon, setRayon] = useState(120);
  const [avecDeployees, setAvecDeployees] = useState(false);

  const ll = useMemo<[number, number]>(() => [Number(lng) || 0, Number(lat) || 0], [lng, lat]);
  const valide = Number.isFinite(Number(lng)) && Number.isFinite(Number(lat)) && lng.trim() !== "" && lat.trim() !== "";

  const rUnits = useMemo(
    () => (valide ? rankUnits({ ll, effectif, radiusKm: rayon, includeDeployed: avecDeployees }, units) : null),
    [valide, ll, effectif, rayon, avecDeployees, units],
  );
  const rShelters = useMemo(
    () => (valide ? rankShelters({ ll, personnes, radiusKm: rayon }, shelters, cities) : null),
    [valide, ll, personnes, rayon, shelters, cities],
  );

  /** Reprendre le point d'un incident en cours plutôt que le retaper. */
  const depuisIncident = (id: string) => {
    const inc = incidents.find((i) => i.id === id);
    if (!inc?.ll) return;
    setLng(String(inc.ll[0]));
    setLat(String(inc.ll[1]));
  };

  return (
    <section className="flex flex-col gap-3">
      {/* --- saisie du besoin --------------------------------------------- */}
      <div className={CARTE}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Icon path={UI_ICONS.sparkles} size={16} className="text-or-500" />
          <h2 className="text-sm font-bold text-gray-800 dark:text-rdia-50">{t.ops_affect_title}</h2>
          <div className="ms-auto flex overflow-hidden rounded-lg border border-gray-200 dark:border-rdia-600">
            {(["engage", "heberge"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`cible-tactile px-3 text-[12px] font-semibold transition-colors lg:min-h-0 lg:py-1.5 ${
                  mode === m ? "bg-or-500 text-rdia-600" : "text-gray-500 hover:text-or-500 dark:text-rdia-300"
                }`}
              >
                {m === "engage" ? t.ops_mode_engage : t.ops_mode_shelter}
              </button>
            ))}
          </div>
        </div>

        <p className="mb-3 text-[11.5px] leading-snug text-gray-500 dark:text-rdia-300">
          {mode === "engage" ? t.ops_affect_engage_help : t.ops_affect_shelter_help}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="ops-lng">
              {t.wz_lng}
            </label>
            <input id="ops-lng" className={CHAMP + " font-mono"} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className={LABEL} htmlFor="ops-lat">
              {t.wz_lat}
            </label>
            <input id="ops-lat" className={CHAMP + " font-mono"} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          </div>
          <div>
            <label className={LABEL} htmlFor="ops-besoin">
              {mode === "engage" ? t.ops_need_strength : t.ops_need_people}
            </label>
            <input
              id="ops-besoin"
              type="number"
              min={1}
              className={CHAMP + " tabular-nums"}
              value={mode === "engage" ? effectif : personnes}
              onChange={(e) => {
                const v = Math.max(1, Number(e.target.value) || 0);
                if (mode === "engage") setEffectif(v);
                else setPersonnes(v);
              }}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="ops-rayon">
              {t.ops_radius}
            </label>
            <input
              id="ops-rayon"
              type="number"
              min={0}
              className={CHAMP + " tabular-nums"}
              value={rayon}
              onChange={(e) => setRayon(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {incidents.length > 0 && (
            <label className="flex items-center gap-2 text-[11.5px] text-gray-600 dark:text-rdia-200">
              {t.ops_from_incident}
              <select
                className="input-champ cible-tactile text-[12px]"
                defaultValue=""
                onChange={(e) => depuisIncident(e.target.value)}
                aria-label={t.ops_from_incident}
              >
                <option value="">—</option>
                {incidents.filter((i) => !i.archived).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id} — {i.titre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "engage" && (
            <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-gray-600 dark:text-rdia-200">
              <input type="checkbox" checked={avecDeployees} onChange={(e) => setAvecDeployees(e.target.checked)} className="h-4 w-4 accent-or-500" />
              {t.ops_include_deployed}
            </label>
          )}
        </div>
      </div>

      {/* --- résultat ------------------------------------------------------ */}
      {!valide ? (
        <p className={`${CARTE} text-[12.5px] text-gray-500 dark:text-rdia-300`}>{t.ops_need_point}</p>
      ) : mode === "engage" ? (
        <ResultatUnites r={rUnits!} besoin={effectif} />
      ) : (
        <ResultatAbris r={rShelters!} besoin={personnes} />
      )}
    </section>
  );
}

// --- rendu du classement d'unités -------------------------------------------

function Couverture({ rang, besoin, unite }: { rang: number | null; besoin: number; unite: string }) {
  const t = useDict();
  return (
    <p
      className={`rounded-lg px-3 py-2 text-[12.5px] font-semibold ${
        rang === null ? "bg-danger-500/10 text-danger-400" : "bg-green-500/10 text-green-600"
      }`}
      // `role="status"` : le verdict change à chaque réglage, et c'est LUI que
      // l'on cherche — il doit être annoncé sans voler le focus.
      role="status"
    >
      {rang === null
        ? `${t.ops_not_covered} ${besoin.toLocaleString("fr-FR")} ${unite}.`
        : `${t.ops_covered_at} ${rang} ${rang > 1 ? t.ops_ranks : t.ops_rank} — ${besoin.toLocaleString("fr-FR")} ${unite}.`}
    </p>
  );
}

function BarreScore({ parts, labels }: { parts: number[]; labels: string[] }) {
  const couleurs = ["#e0b243", "#16a34a", "#3b82f6"];
  return (
    <span className="flex gap-0.5" role="img" aria-label={parts.map((p, i) => `${labels[i]} ${p}`).join(", ")}>
      {parts.map((p, i) => (
        <span key={labels[i]} className="relative h-1.5 w-8 overflow-hidden rounded-sm bg-gray-200 dark:bg-rdia-600" title={`${labels[i]} : ${p}`}>
          <span className="absolute inset-y-0 start-0 rounded-sm" style={{ width: `${Math.min(100, p)}%`, background: couleurs[i] }} />
        </span>
      ))}
    </span>
  );
}

function ResultatUnites({ r, besoin }: { r: ReturnType<typeof rankUnits>; besoin: number }) {
  const t = useDict();
  const labels = [t.ops_part_travel, t.ops_part_strength, t.ops_part_readiness];
  return (
    <div className={CARTE}>
      <Couverture rang={r.couvertAuRang} besoin={besoin} unite={t.ops_personnel} />
      {r.rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-gray-500 dark:text-rdia-300">{t.ops_no_candidate}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead className="text-gray-400 dark:text-rdia-400">
              <tr>
                <th className="py-1.5 text-start font-semibold">#</th>
                <th className="py-1.5 text-start font-semibold">{t.ops_unit}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_eta}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_distance}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_strength}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_cumulative}</th>
                <th className="py-1.5 text-start font-semibold ps-3">{t.ops_score}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-gray-700 dark:text-rdia-100">
              {r.rows.map((row: UnitRow, i) => (
                <tr
                  key={row.unit.id}
                  className={`border-t border-gray-100 dark:border-rdia-600 ${
                    r.couvertAuRang !== null && i < r.couvertAuRang ? "bg-or-500/5" : ""
                  }`}
                >
                  <td className="py-1.5 font-bold">{i + 1}</td>
                  <td className="py-1.5">
                    <span className="font-semibold">{row.unit.nom}</span>
                    <span className="ms-1.5 text-[11px] text-gray-500 dark:text-rdia-300">{row.unit.ville}</span>
                  </td>
                  <td className="py-1.5 text-end">{row.etaMin} min</td>
                  <td className="py-1.5 text-end">{row.km} km</td>
                  <td className="py-1.5 text-end">{row.unit.eff}</td>
                  <td className="py-1.5 text-end font-semibold">{r.cumul[i]}</td>
                  <td className="py-1.5 ps-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">{row.score}</span>
                      <BarreScore parts={[row.parts.travel, row.parts.strength, row.parts.readiness]} labels={labels} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Les écartées sont DITES, avec leur motif : une unité absente du
          classement sans explication passe pour une unité oubliée. */}
      {r.ecartes.length > 0 && (
        <p className="mt-2 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">
          {/* Accord au singulier : « 1 écarté », pas « 1 écartés ». */}
          {r.ecartes.length} {r.ecartes.length === 1 ? t.ops_excluded_one : t.ops_excluded} —{" "}
          {r.ecartes.length === 1 ? t.ops_excluded_why_one : t.ops_excluded_why}
        </p>
      )}
    </div>
  );
}

function ResultatAbris({ r, besoin }: { r: ReturnType<typeof rankShelters>; besoin: number }) {
  const t = useDict();
  const labels = [t.ops_part_travel, t.ops_part_capacity, t.ops_part_supplies];
  return (
    <div className={CARTE}>
      <Couverture rang={r.couvertAuRang} besoin={besoin} unite={t.ops_people} />
      {r.rows.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-gray-500 dark:text-rdia-300">{t.ops_no_candidate}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12px]">
            <thead className="text-gray-400 dark:text-rdia-400">
              <tr>
                <th className="py-1.5 text-start font-semibold">#</th>
                <th className="py-1.5 text-start font-semibold">{t.ops_shelter}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_eta}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_free}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_occupancy}</th>
                <th className="py-1.5 text-end font-semibold">{t.ops_cumulative}</th>
                <th className="py-1.5 text-start font-semibold ps-3">{t.ops_score}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-gray-700 dark:text-rdia-100">
              {r.rows.map((row: ShelterRow, i) => (
                <tr
                  key={row.shelter.id}
                  className={`border-t border-gray-100 dark:border-rdia-600 ${
                    r.couvertAuRang !== null && i < r.couvertAuRang ? "bg-or-500/5" : ""
                  }`}
                >
                  <td className="py-1.5 font-bold">{i + 1}</td>
                  <td className="py-1.5">
                    <span className="font-semibold">{row.shelter.nom}</span>
                    <span className="ms-1.5 text-[11px] text-gray-500 dark:text-rdia-300">{row.shelter.ville}</span>
                  </td>
                  {/* Une position inconnue est DITE, jamais convertie en tiret
                      muet : l'abri est classé sans trajet, et le chef doit le
                      savoir avant d'y envoyer une colonne. */}
                  <td className="py-1.5 text-end">
                    {row.etaMin === null ? (
                      <span className="text-[11px] font-semibold text-or-500">{t.ops_pos_unknown}</span>
                    ) : (
                      `${row.etaMin} min`
                    )}
                  </td>
                  <td className="py-1.5 text-end">{row.libres}</td>
                  <td className="py-1.5 text-end">{row.occPct}%</td>
                  <td className="py-1.5 text-end font-semibold">{r.cumul[i]}</td>
                  <td className="py-1.5 ps-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono font-bold">{row.score}</span>
                      <BarreScore parts={[row.parts.travel, row.parts.capacity, row.parts.supplies]} labels={labels} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2 flex flex-col gap-0.5 text-[11px] leading-snug text-gray-500 dark:text-rdia-300">
        {r.sansPosition > 0 && (
          <p>
            {r.sansPosition} {r.sansPosition === 1 ? t.ops_no_position_note_one : t.ops_no_position_note}
          </p>
        )}
        {r.ecartes.length > 0 && (
          <p>
            {r.ecartes.length} {r.ecartes.length === 1 ? t.ops_excluded_one : t.ops_excluded} —{" "}
            {r.ecartes.length === 1 ? t.ops_excluded_shelter_why_one : t.ops_excluded_shelter_why}
          </p>
        )}
      </div>
    </div>
  );
}
