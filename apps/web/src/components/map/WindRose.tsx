"use client";

import { useEffect, useState } from "react";
import { useArgos, useDict } from "@/lib/store";

import { OVERLAY_STYLE } from "@/lib/map/overlay";

// ============================================================================
// Rose des vents flottante (lot N-5)
//
// POURQUOI ELLE EXISTE. En relief ou pendant la lecture animée, le panneau NRBC
// est le plus souvent replié — on regarde la carte, pas les réglages. Or c'est
// exactement le moment où la direction du vent explique ce qu'on voit bouger :
// sans elle, la dérive de la fumée est un mouvement sans cause lisible.
//
// C'est un AFFICHEUR, pas un contrôle : `pointer-events-none` pour qu'il ne
// vole jamais un clic à la carte qu'il recouvre.
// ============================================================================

/** Seuil ATP-45 sous lequel la direction du vent ne gouverne plus la nappe. */
const LOW_WIND_KMH = 10;

/** Rose française à 16 branches — l'ouest s'abrège O, jamais W. */
const CARDINALS_FR = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
] as const;

/** Rose anglaise — W et non O. L'arabe reprend l'abréviation latine, lisible partout. */
const CARDINALS_EN = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

function cardinal(deg: number, lang: string): string {
  const table = lang === "fr" ? CARDINALS_FR : CARDINALS_EN;
  return table[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

export function WindRose() {
  const t = useDict();
  const lang = useArgos((s) => s.lang);
  const plumeData = useArgos((s) => s.plumeData);
  const plumePlaying = useArgos((s) => s.plumePlaying);
  const plume3d = useArgos((s) => s.plume3d);
  const map3d = useArgos((s) => s.map3d);
  const plumeHour = useArgos((s) => s.plumeHour);

  // L'aiguille tourne par le PLUS COURT chemin. Sans accumulation d'angle, un
  // passage de 350° à 10° ferait faire un tour complet à l'envers — un vent qui
  // vire d'un cran donnerait à voir une saute de 340°.
  const [needle, setNeedle] = useState(0);
  const target = plumeData?.wind ? (plumeData.wind.fromDeg + 180) % 360 : 0;
  useEffect(() => {
    setNeedle((prev) => prev + (((target - prev) % 360) + 540) % 360 - 180);
  }, [target]);

  // Visible quand la vue est en relief — que ce soit le RELIEF DE LA CARTE
  // (bouton « 2D / 3D ») ou la NAPPE 3D du panache : ce sont deux commandes
  // distinctes et « la 3D » désigne indifféremment l'une ou l'autre — ou quand
  // la lecture animée tourne. Ce sont les trois moments où le panneau NRBC est
  // replié et où la dérive observée a besoin d'être expliquée.
  //
  // La condition exige aussi `plumeData.wind` : sans prévision de vent il n'y a
  // rien à afficher, et une rose à zéro se lirait comme un vent nul.
  if (!plumeData?.wind || !(map3d || plume3d || plumePlaying)) return null;

  const { speedKmh, fromDeg, isDay, time } = plumeData.wind;
  const faible = speedKmh < LOW_WIND_KMH;
  const rose = cardinal(fromDeg, lang);

  return (
    <div
      // `pointer-events-none` : la rose ne prend jamais un clic destiné à la carte.
      // `bottom-[88px]` et non `bottom-3` : le bouton flottant du Copilot occupe
      // le coin bas de fin (56 px + 24 px de marge) sur toutes les pages, et il
      // recouvrait la mention « vent faible ». La rose passe AU-DESSUS de lui
      // plutôt qu'à côté — le décalage vertical vaut dans les deux sens
      // d'écriture, un décalage latéral non.
      className="pointer-events-none absolute bottom-[88px] z-30 flex items-center gap-3 rounded-xl px-3 py-2.5 shadow-lg animate-fade-in"
      style={{ ...OVERLAY_STYLE, insetInlineEnd: 12 }}
      // Un seul libellé pour tout le bloc : lu d'un trait, la phrase a un sens.
      // Sans `aria-live` — la valeur change à chaque échéance et une annonce
      // continue couvrirait tout le reste.
      role="img"
      aria-label={`${t.nrbc_wind} ${speedKmh} ${t.wind_kmh}, ${t.wind_from} ${rose} ${fromDeg}°`}
    >
      {/* --- la rose ------------------------------------------------------ */}
      <div className="relative h-12 w-12 shrink-0" aria-hidden="true">
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <circle cx="24" cy="24" r="21" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          {/* Graduations : les quatre points cardinaux marqués plus long. */}
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i * 22.5 * Math.PI) / 180;
            const majeur = i % 4 === 0;
            const r1 = majeur ? 15 : 18;
            return (
              <line
                key={i}
                x1={24 + r1 * Math.sin(a)}
                y1={24 - r1 * Math.cos(a)}
                x2={24 + 20 * Math.sin(a)}
                y2={24 - 20 * Math.cos(a)}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={majeur ? 1.4 : 0.8}
              />
            );
          })}
          {/* Le nord de la rose, repère fixe qui donne son sens à l'aiguille. */}
          <text x="24" y="11" textAnchor="middle" fontSize="7" fontWeight="700" fill="rgba(255,255,255,0.55)">
            N
          </text>
          {/* L'aiguille pointe VERS où va le vent — c'est le sens de la dérive
              observée à l'écran, pas la convention météo d'où il vient. */}
          <g
            style={{
              transform: `rotate(${needle}deg)`,
              transformOrigin: "24px 24px",
              // 400 ms, décélération : la rotation doit se lire comme une
              // conséquence du changement d'échéance, pas comme un saut.
              transition: "transform 400ms cubic-bezier(0.2, 0.7, 0.3, 1)",
            }}
            className="motion-reduce:!transition-none"
          >
            <path
              d="M24 8 L29 26 L24 22.5 L19 26 Z"
              className={faible ? "fill-white/45" : "fill-or-400"}
            />
            <path d="M24 22.5 L24 38" stroke="currentColor" strokeWidth="1.6" className="text-white/30" />
          </g>
        </svg>
      </div>

      {/* --- la lecture chiffrée ------------------------------------------ */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1">
          {/* `tabular-nums` : le chiffre change à chaque échéance et la largeur
              doit rester constante, sinon tout le bloc tressaute. */}
          <span className="font-mono text-[22px] font-bold leading-none tabular-nums text-white">{speedKmh}</span>
          <span className="text-[11px] font-semibold text-white/55">{t.wind_kmh}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-none">
          <span className="font-bold text-or-300">{rose}</span>
          <span className="font-mono tabular-nums text-white/45">{fromDeg}°</span>
          <span className="text-white/25">·</span>
          <span className="text-white/45">{isDay ? t.nrbc_day : t.nrbc_night}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] leading-none text-white/40">
          <span className="font-mono tabular-nums">{time.slice(11, 16)} UTC</span>
          <span className="text-white/20">·</span>
          <span>{t.nrbc_hour} +{plumeHour}h</span>
        </div>
      </div>

      {/* Régime de vent faible : la doctrine change (nappe élargie, pas de
          direction dominante). Un texte, pas seulement une teinte d'aiguille —
          la couleur seule ne porte jamais une information. */}
      {faible && (
        <span className="shrink-0 self-start rounded-md bg-white/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
          {t.wind_low}
        </span>
      )}
    </div>
  );
}
