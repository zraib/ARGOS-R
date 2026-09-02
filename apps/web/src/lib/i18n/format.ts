// Remplit un gabarit de dictionnaire : « {n} lits · {p}% » + { n: 12, p: 40 }.
// Les clés absentes restent telles quelles, pour être VUES plutôt que masquées.
export function tpl(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);
}
