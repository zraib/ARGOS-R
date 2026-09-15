// ============================================================================
// ARGOS — bilan des victimes et fiches de corps : ce que l'écran calcule
//
// Pur : le nom affiché d'une personne (ou « non identifié »), l'âge ou « non
// identifié », l'heure du décès ou « non connue », une date-heure ISO ↔ la
// valeur d'un champ `datetime-local`, le libellé d'un mode d'identification.
// L'API reste l'autorité sur les invariants ; ici on ne fait que lire.
// ============================================================================

import type { IdMethod, IncidentVictim, MortuaryRecord, PersonIdentity, Sex, VictimKind } from "@/lib/types";

/** « Nom Prénom » quand l'un ou l'autre est connu, sinon `null`. */
export function personName(p: PersonIdentity): string | null {
  const s = [p.lastName?.trim(), p.firstName?.trim()].filter((x): x is string => !!x).join(" ");
  return s || null;
}

/** Une victime est-elle encore anonyme (aucun nom, aucune CNI) ? */
export function isAnonymous(p: PersonIdentity): boolean {
  return !personName(p) && !p.cni?.trim();
}

/** « 15/09 06:30 » d'un instant ISO, ou `null` s'il est absent ou illisible. */
export function whenShort(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** La valeur d'un champ `datetime-local` (heure locale, à la minute) pour un instant ISO ; « » s'il est absent. */
export function toLocalInput(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** L'instant ISO d'une valeur `datetime-local` ; `undefined` si elle est vide ou illisible. */
export function fromLocalInput(v: string): string | undefined {
  if (!v.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Les victimes nommées d'une nature, les décédés affectés en premier (ils ont un dossier à suivre). */
export function victimsOf(list: readonly IncidentVictim[], kind: VictimKind): IncidentVictim[] {
  return list.filter((v) => v.kind === kind).sort((a, b) => Number(!!b.recordId) - Number(!!a.recordId) || (a.createdAt < b.createdAt ? -1 : 1));
}

/** Ce que la préliminaire du terrain laisse à confirmer à la morgue : tout ce qui manque encore. */
export function missingFields(rec: MortuaryRecord): ("name" | "cni" | "sex" | "age" | "deathAt" | "method")[] {
  const out: ("name" | "cni" | "sex" | "age" | "deathAt" | "method")[] = [];
  if (!personName(rec)) out.push("name");
  if (!rec.cni?.trim()) out.push("cni");
  if (!rec.sex || rec.sex === "unknown") out.push("sex");
  if (rec.age === undefined) out.push("age");
  if (!rec.deathAt) out.push("deathAt");
  if (!rec.idMethod) out.push("method");
  return out;
}

export const SEXES: readonly Sex[] = ["unknown", "f", "m"];
export const ID_METHOD_ORDER: readonly IdMethod[] = ["fingerprint", "dna", "dental", "body_mark"];
