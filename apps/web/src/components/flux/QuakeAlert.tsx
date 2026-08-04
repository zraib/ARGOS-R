"use client";

// ============================================================================
// ARGOS — surveillance sismique globale + pop-up d'alerte
// Sonde périodiquement le flux EMSC (via le store) tant que la couche séismes
// est active. À l'apparition d'un nouveau séisme, affiche une alerte avec un
// bouton « voir sur la carte ». Monté dans la coquille (visible sur tout écran).
// ============================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useArgos } from "@/lib/store";
import { FLUX } from "@/lib/i18n/flux";
import { Icon } from "@/components/ui/Icon";
import { NAV_ICONS, UI_ICONS } from "@/lib/icons";

const POLL_MS = 60_000; // 1 min

export function QuakeAlert() {
  const lang = useArgos((s) => s.lang);
  const f = FLUX[lang];
  const router = useRouter();
  const quakesOn = useArgos((s) => s.quakesOn);
  const loadQuakes = useArgos((s) => s.loadQuakes);
  const alert = useArgos((s) => s.quakeAlert);
  const dismiss = useArgos((s) => s.dismissQuakeAlert);
  const focusQuake = useArgos((s) => s.focusQuake);

  // Sondage périodique du flux sismique (détection de nouveaux séismes).
  useEffect(() => {
    if (!quakesOn) return;
    void loadQuakes();
    const id = setInterval(() => void loadQuakes(), POLL_MS);
    return () => clearInterval(id);
  }, [quakesOn, loadQuakes]);

  if (!alert) return null;
  const view = () => { focusQuake(alert); dismiss(); router.push("/map"); };

  return (
    <div className="fixed bottom-4 end-4 z-[60] w-80 animate-fade-in">
      <div className="rounded-2xl border border-danger-500/40 bg-white shadow-2xl dark:bg-rdia-800">
        <div className="flex items-start gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-500/15 text-danger-500">
            <Icon path={NAV_ICONS.seismic} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-danger-500 px-1.5 py-0.5 text-xs font-bold text-white">M{alert.mag.toFixed(1)}</span>
              <span className="text-sm font-bold text-gray-800 dark:text-rdia-50">{f.alert_title}</span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-600 dark:text-rdia-200">{alert.region}</p>
            <p className="text-[11px] text-gray-400 dark:text-rdia-400">{f.alert_body}</p>
            <div className="mt-2 flex gap-2">
              <button className="btn-primaire flex items-center gap-1.5 text-xs" onClick={view}>
                <Icon path={UI_ICONS.map} size={13} /> {f.alert_view}
              </button>
              <button className="btn-secondaire text-xs" onClick={dismiss}>{f.alert_dismiss}</button>
            </div>
          </div>
          <button onClick={dismiss} className="rounded-md p-1 text-gray-400 transition-colors hover:text-danger-500" aria-label={f.alert_dismiss}>
            <Icon path={UI_ICONS.close} size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
