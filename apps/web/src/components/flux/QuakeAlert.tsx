"use client";

// ============================================================================
// ARGOS — surveillance sismique + pop-up d'alerte à deux niveaux
// Sonde périodiquement le flux EMSC (via le store) tant que la couche séismes
// est active. Deux alertes distinctes (seuils réglés dans les Paramètres) :
//   - séisme NATIONAL ≥ seuil : alerte ROUGE pulsante + sirène bitonale ; les
//     autorités sont notifiées par SMS + e-mail CÔTÉ SERVEUR (indépendant du
//     navigateur) — la pop-up rappelle le nombre d'autorités configurées ;
//   - séisme MONDIAL ≥ seuil : notification dorée discrète + double bip.
// Monté dans la coquille (visible sur tout écran).
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArgos } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";
import { pointInMorocco } from "@/lib/map/morocco";
import { playGlobalAlert, playNationalAlert } from "@/lib/sound";
import { qLocalTime } from "@/lib/map/canvas/quakes";

const POLL_MS = 60_000; // 1 min

export function QuakeAlert() {
  const lang = useArgos((s) => s.lang);
  const f = FLUX[lang];
  const router = useRouter();
  const quakesOn = useArgos((s) => s.quakesOn);
  const loadQuakes = useArgos((s) => s.loadQuakes);
  const seisConfig = useArgos((s) => s.seisConfig);
  const loadSeisConfig = useArgos((s) => s.loadSeisConfig);
  const alert = useArgos((s) => s.quakeAlert);
  const dismiss = useArgos((s) => s.dismissQuakeAlert);
  const focusQuake = useArgos((s) => s.focusQuake);

  // Seuils d'alerte chargés une fois (l'enregistrement des Paramètres met à jour le store).
  useEffect(() => {
    if (!seisConfig) void loadSeisConfig();
  }, [seisConfig, loadSeisConfig]);

  // Sondage périodique du flux sismique (détection de nouveaux séismes).
  useEffect(() => {
    if (!quakesOn) return;
    void loadQuakes();
    const id = setInterval(() => void loadQuakes(), POLL_MS);
    return () => clearInterval(id);
  }, [quakesOn, loadQuakes]);

  const isMa = alert ? pointInMorocco(alert.lon, alert.lat) : false;

  // Signature sonore au déclenchement (une fois par alerte), si le poste
  // n'a pas coupé les notifications sonores — lu à l'instant, pas surveillé.
  useEffect(() => {
    if (!alert || !useArgos.getState().sounds.alerts) return;
    if (pointInMorocco(alert.lon, alert.lat)) playNationalAlert();
    else playGlobalAlert();
  }, [alert]);

  if (!alert) return null;
  const view = () => { focusQuake(alert); dismiss(); router.push("/map"); };
  const nContacts = seisConfig?.contacts.length ?? 0;

  return (
    // EN HAUT, centrée, sous l'en-tête : le bas de l'écran appartient aux
    // boutons flottants et aux conversations. Sous sm elle prend la largeur
    // (moins les marges) : figée à 320 px, elle ne laissait plus la place aux
    // deux boutons d'action à 375 px.
    <div className="fixed left-1/2 top-[4.25rem] z-[60] w-[min(92vw,22rem)] -translate-x-1/2 animate-fade-in lg:top-[4.75rem]">
      <div
        className={`rounded-2xl border bg-white shadow-2xl dark:bg-rdia-800 ${
          isMa ? "border-danger-500 ring-2 ring-danger-500/50 animate-pulse-ring" : "border-or-500/40"
        }`}
      >
        <div className="flex items-start gap-3 p-4">
          <span
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isMa ? "bg-danger-500 text-white" : "bg-or-500/15 text-or-500"
            }`}
          >
            {/* Halo pulsant : uniquement pour l'alerte nationale */}
            {isMa && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full bg-danger-500/50" />}
            <Icon path={NAV_ICONS.seismic} size={20} className="relative" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold text-white ${isMa ? "bg-danger-500" : "bg-or-500"}`}>
                M{alert.mag.toFixed(1)}
              </span>
              <span className={`text-sm font-bold ${isMa ? "text-danger-500" : "text-gray-800 dark:text-rdia-50"}`}>
                {isMa ? f.alert_ma_title : f.alert_title}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-600 dark:text-rdia-200">{alert.region}</p>
            {/* L'heure du séisme, en heure locale : une alerte sans heure ne se situe pas. */}
            <p className="font-mono text-[11px] tabular-nums text-gray-500 dark:text-rdia-300">
              {f.seis_local}: {qLocalTime(alert.time, lang)}
            </p>
            <p className="text-[12px] text-gray-400 dark:text-rdia-400">{isMa ? f.alert_ma_body : f.alert_body}</p>
            {/* Rappel de la notification serveur des autorités (SMS + e-mail) */}
            {isMa && (
              <p className={`mt-1 text-[12px] font-semibold ${nContacts > 0 ? "text-danger-500" : "text-or-500"}`}>
                {nContacts > 0 ? `${f.alert_ma_sent} ${nContacts}` : f.alert_ma_none}
              </p>
            )}
            {/* Les deux actions passent à la ligne plutôt que de déborder. */}
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="btn-primaire flex min-h-11 items-center gap-1.5 text-xs sm:min-h-0" onClick={view}>
                <Icon path={UI_ICONS.map} size={13} /> {f.alert_view}
              </button>
              <button className="btn-secondaire min-h-11 text-xs sm:min-h-0" onClick={dismiss}>{f.alert_dismiss}</button>
            </div>
          </div>
          <button onClick={dismiss} className="cible-tactile flex shrink-0 items-center justify-center rounded-md p-1 text-gray-400 transition-colors hover:text-danger-500" aria-label={f.alert_dismiss}>
            <Icon path={UI_ICONS.close} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
