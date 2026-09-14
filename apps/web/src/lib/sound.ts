"use client";

// ============================================================================
// ARGOS — signatures sonores générées en WebAudio
//
// Aucune ressource audio externe (souveraineté) : les tonalités sont
// synthétisées localement. Quatre signatures, distinctes à l'oreille pour que
// l'opérateur sache ce qui arrive SANS regarder l'écran :
//   - message reçu       → « pop » bref, deux notes montantes ;
//   - autre notification → trois notes descendantes, timbre triangulaire
//                          (incident déclaré dans sa région, demande d'aide) ;
//   - séisme MONDIAL     → double bip discret (simple notification) ;
//   - séisme NATIONAL    → sirène bitonale répétée, plus forte (alerte).
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

/**
 * Amorce le contexte au PREMIER geste de l'opérateur.
 *
 * Les navigateurs refusent tout son avant une interaction : sans amorçage, le
 * premier message reçu après le chargement de la page restait muet — et
 * c'est justement celui qu'on n'attendait pas. Idempotent, sans effet hors
 * navigateur.
 */
let amorce = false;
export function primeAudio(): void {
  if (amorce || typeof window === "undefined") return;
  amorce = true;
  const reveiller = () => {
    ensureCtx();
    window.removeEventListener("pointerdown", reveiller);
    window.removeEventListener("keydown", reveiller);
  };
  window.addEventListener("pointerdown", reveiller);
  window.addEventListener("keydown", reveiller);
}

/** Tonalité avec enveloppe attaque/extinction (pas de clic). */
function tone(c: AudioContext, t0: number, freq: number, dur: number, gain: number, type: OscillatorType = "sine"): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

/** Deux messages à moins de 1,2 s d'écart ne font qu'UN signal : une rafale ne doit pas crépiter. */
const MESSAGE_GAP_MS = 1_200;
let dernierMessageA = 0;

/**
 * Message reçu : « pop » bref à deux notes montantes.
 * Rend `false` si le signal a été retenu (rafale) ou si l'audio est indisponible.
 * `force` passe outre la retenue — le bouton « Écouter » du profil.
 */
export function playMessageTone(now = Date.now(), force = false): boolean {
  if (!force && now - dernierMessageA < MESSAGE_GAP_MS) return false;
  const c = ensureCtx();
  if (!c) return false;
  dernierMessageA = now;
  const t = c.currentTime;
  tone(c, t, 660, 0.07, 0.07);
  tone(c, t + 0.07, 990, 0.1, 0.06);
  return true;
}

/** Autre notification (alerte adressée) : trois notes descendantes, timbre distinct du message. */
export function playNotificationTone(): void {
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 880, 0.14, 0.07, "triangle");
  tone(c, t + 0.15, 740, 0.14, 0.07, "triangle");
  tone(c, t + 0.3, 620, 0.2, 0.07, "triangle");
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
