"use client";

import { useEffect, useState } from "react";
import { useArgos, useDict } from "@/lib/store";
import type { AircraftRole } from "@/lib/types";

// ============================================================================
// ARGOS — panneau de suivi aérien (feux de forêt)
//
// L'opérateur saisit le code d'un aéronef ; seuls les appareils ainsi inscrits
// sont interrogés et affichés. On ne déverse jamais le trafic aérien général
// sur la carte de commandement.
// ============================================================================

const ROLES: readonly AircraftRole[] = ["waterbomber", "helicopter", "observation", "transport", "medevac"];

/** Au-delà, le contact est trop ancien : l'âge passe en ambre. */
const STALE_S = 45;

/** Secondes écoulées depuis le dernier contact réel (pas la position estimée). */
function ageOf(pos: { lastContact: string } | null): number {
  if (!pos) return 0;
  const at = Date.parse(pos.lastContact);
  return Number.isFinite(at) ? Math.max(0, Math.round((Date.now() - at) / 1000)) : 0;
}

/** Pastille d'état, alignée sur les couleurs de marqueur. */
const STATUS_DOT: Record<string, string> = {
  airborne: "bg-emerald-400",
  ground: "bg-amber-400",
  no_signal: "bg-white/30",
};

export function AircraftPanel() {
  const t = useDict();
  const aircraft = useArgos((s) => s.aircraft);
  const feed = useArgos((s) => s.aircraftFeed);
  const busy = useArgos((s) => s.aircraftBusy);
  const error = useArgos((s) => s.aircraftError);
  const addAircraft = useArgos((s) => s.addAircraft);
  const removeAircraft = useArgos((s) => s.removeAircraft);
  const select = useArgos((s) => s.select);

  // Fait vieillir l'âge affiché entre deux chargements : sans ce battement, un
  // « 3 s » resterait figé et laisserait croire à un contact perpétuellement frais.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<AircraftRole>("waterbomber");

  const submit = async () => {
    if (!code.trim() || busy) return;
    // À défaut de libellé, on affiche le code : un marqueur sans nom serait
    // inexploitable sur la carte.
    const ok = await addAircraft({ code, label: label.trim() || code.trim().toUpperCase(), role });
    if (ok) {
      setCode("");
      setLabel("");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Saisie : un seul champ obligatoire — le code.
          Champs à 16 px et 44 px de haut sous md : en deçà, iOS zoome tout seul
          à la mise au point et décale la carte sous le doigt. */}
      <div className="flex flex-col gap-1.5">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={t.acft_code_ph}
          aria-label={t.acft_code}
          className="input-champ h-11 text-base md:h-8 md:text-[13px]"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void submit()}
          placeholder={t.acft_label_ph}
          aria-label={t.acft_label}
          className="input-champ h-11 text-base md:h-8 md:text-[13px]"
        />
        <div className="flex gap-1.5">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AircraftRole)}
            aria-label={t.acft_role}
            className="input-champ h-11 min-w-0 flex-1 text-base md:h-8 md:text-[13px]"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t[`acft_role_${r}` as keyof typeof t] as string}
              </option>
            ))}
          </select>
          <button onClick={() => void submit()} disabled={busy || !code.trim()} className="btn-primaire h-11 shrink-0 px-3 text-[14px] disabled:opacity-40 md:h-8 md:text-[13px]">
            {t.acft_track}
          </button>
        </div>
        {error && <p className="text-[13px] text-danger-300 md:text-[12px]">{error}</p>}
      </div>

      {/* Liste des inscrits. Un appareil sans écho reste listé : son silence est
          lui-même une information. */}
      {aircraft.length === 0 ? (
        <p className="text-[13px] leading-snug text-white/45 md:text-[12px]">{t.acft_empty}</p>
      ) : (
        // Sous lg la liste vit dans la feuille du bas, qui défile déjà : lui
        // donner sa propre hauteur maximale ferait deux ascenseurs imbriqués.
        <div className="flex flex-col lg:max-h-[22vh] lg:overflow-y-auto">
          {aircraft.map((a) => (
            <div key={a.aircraft.id} className="flex items-center gap-1.5 border-t border-white/10 py-1 first:border-t-0">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[a.status]}`} aria-hidden />
              <button
                onClick={() => a.position && select("acft", a.aircraft.id)}
                className="min-h-11 min-w-0 flex-1 truncate text-start text-[14px] text-white/85 transition-colors hover:text-or-400 lg:min-h-0 lg:text-[13px]"
                title={`${a.aircraft.label} · ${a.aircraft.code}`}
              >
                {a.aircraft.label}
                <span className="ms-1 text-white/40">{a.aircraft.code}</span>
              </button>
              <span
                className={`shrink-0 text-[12px] tabular-nums lg:text-[11px] ${ageOf(a.position) > STALE_S ? "text-amber-300" : "text-white/50"}`}
                title={t.acft_last_contact}
              >
                {a.position && a.status !== "no_signal"
                  ? `${Math.round(a.position.altitude ?? 0)} m · ${ageOf(a.position)} s`
                  : t.acft_no_signal}
              </span>
              {/* Retrait de l'inscription : au doigt, la croix d'origine faisait
                  moins de 20 px — `cible-tactile` la porte à 44 px sous lg. */}
              <button
                onClick={() => void removeAircraft(a.aircraft.id)}
                disabled={busy}
                aria-label={`${t.acft_untrack} ${a.aircraft.label}`}
                className="cible-tactile flex shrink-0 items-center justify-center rounded-md px-1 text-[18px] leading-none text-white/40 transition-colors hover:text-danger-300 disabled:opacity-40 lg:text-[13px]"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Provenance de la donnée : un opérateur doit savoir s'il regarde un flux
          réel ou un exercice avant d'engager une décision. */}
      {feed && <p className="text-[12px] text-white/35 lg:text-[11px]">{t.acft_feed} : {feed}</p>}
    </div>
  );
}
