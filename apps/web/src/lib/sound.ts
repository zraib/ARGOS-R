"use client";

// ============================================================================
// ARGOS — sons d'alerte générés en WebAudio
// Aucune ressource audio externe (souveraineté) : les tonalités sont
// synthétisées localement. Deux signatures sonores distinctes :
//   - séisme MONDIAL  → double bip discret (simple notification) ;
//   - séisme NATIONAL → sirène bitonale répétée, plus forte (alerte).
// ============================================================================

let ctx: AudioContext | null = null;

/** Contexte audio paresseux (repris s'il a été suspendu par le navigateur). */
function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Tonalité sinusoïdale avec enveloppe attaque/extinction (pas de clic). */
function tone(c: AudioContext, t0: number, freq: number, dur: number, gain: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Notification discrète (séisme mondial ≥ seuil app). */
export function playGlobalAlert(): void {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 880, 0.18, 0.06);
  tone(c, t + 0.24, 660, 0.22, 0.05);
}

/** Alerte nationale (séisme sur le territoire ≥ seuil SMS/e-mail). */
export function playNationalAlert(): void {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(c, t + i * 0.36, 1175, 0.16, 0.14);
    tone(c, t + i * 0.36 + 0.17, 880, 0.16, 0.14);
  }
}
