// Aides de présentation partagées par les blocs du Copilot (gravité, niveaux).

export const SEV_COLORS: Record<string, string> = {
  faible: "text-emerald-500",
  moyenne: "text-amber-500",
  élevée: "text-or-500",
  élevÉe: "text-or-500",
  info: "text-blue-500",
  critique: "text-red-500",
};

export function sevBadge(sev?: string) {
  if (!sev) return "text-gray-500";
  const key = sev.toLowerCase();
  return SEV_COLORS[key] ?? "text-gray-500";
}

export function toneForLevel(v: number) {
  if (v < 0.33) return "text-emerald-500";
  if (v < 0.66) return "text-amber-500";
  return "text-red-500";
}
