// ============================================================================
// ARGOS — règles du service morgue : références, chaîne de garde, places
//
// Fichier PUR, comme `dvi.rules.ts` : ce que la doctrine de gestion des
// corps après catastrophe (INTERPOL DVI, manuel de terrain OMS / OPS / CICR)
// impose et qu'aucun écran ne doit contourner — une référence unique jamais
// réattribuée, chaque transfert de responsabilité daté et signé, une
// réception confirmée par le site qui reçoit avant tout nouveau mouvement,
// un dossier restitué qui ne bouge plus.
// ============================================================================

import type { CustodyEvent, CustodyStep, MorgueSite, MorgueStatus, MorgueType, MortuaryRecord, PersonIdentity } from "@/modules/domain/domain.types";

/** La prochaine référence d'un site : son code, l'année, un numéro d'ordre à trois chiffres jamais réattribué. */
export function nextReference(code: string, year: number, existing: readonly string[]): string {
  const prefix = `${code}-${year}-`;
  let n = 1;
  for (const r of existing) {
    if (!r.startsWith(prefix)) continue;
    const k = parseInt(r.slice(prefix.length), 10);
    if (Number.isFinite(k) && k >= n) n = k + 1;
  }
  return `${prefix}${String(n).padStart(3, "0")}`;
}

/** Une étape de la chaîne de garde, datée maintenant. */
export function custodyEvent(step: CustodyStep, by: string, opts: { from?: string; to?: string; note?: string } = {}, at = new Date().toISOString()): CustodyEvent {
  const e: CustodyEvent = { at, step, by };
  if (opts.from) e.from = opts.from;
  if (opts.to) e.to = opts.to;
  if (opts.note?.trim()) e.note = opts.note.trim();
  return e;
}

/** Message d'erreur métier, ou `null` si le site peut confirmer la réception. */
export function checkReceive(rec: MortuaryRecord): string | null {
  if (!rec.pendingReceipt) return `Dossier ${rec.reference} : aucun transfert en attente de réception.`;
  return null;
}

/** Message d'erreur métier, ou `null` si le corps peut partir de `from` vers `to`. */
export function checkTransfer(rec: MortuaryRecord, from: MorgueSite, to: MorgueSite | undefined): string | null {
  if (!to) return "Site de destination introuvable.";
  if (to.id === from.id) return "Le site de destination est celui d'origine.";
  if (to.statut === "closed") return `Site ${to.nom} fermé : il ne reçoit pas.`;
  if (rec.status === "released") return `Dossier ${rec.reference} clos (corps restitué) : il ne se transfère plus.`;
  if (rec.pendingReceipt) return `Dossier ${rec.reference} : confirmez d'abord la réception avant un nouveau transfert.`;
  return null;
}

/** Message d'erreur métier, ou `null` si le site peut accueillir un corps de plus. */
export function checkCapacity(site: MorgueSite, records: readonly MortuaryRecord[]): string | null {
  if (site.statut === "closed") return `Site ${site.nom} fermé : il ne reçoit pas.`;
  if (freePlaces(site, records) <= 0) return `Site ${site.nom} plein (${site.capacity} emplacements) : déployez une morgue mobile ou transférez.`;
  return null;
}

/** Emplacements libres d'un site : sa capacité moins les corps présents ou annoncés, restitués exclus. */
export function freePlaces(site: MorgueSite, records: readonly MortuaryRecord[]): number {
  return site.capacity - records.filter((r) => r.mid === site.id && r.status !== "released").length;
}

/** Le statut tel qu'il se lit : un site ouvert dont la capacité est atteinte est « plein ». */
export function siteStatus(site: MorgueSite, records: readonly MortuaryRecord[]): MorgueStatus {
  if (site.statut === "closed") return "closed";
  return freePlaces(site, records) <= 0 ? "full" : site.statut === "full" ? "op" : site.statut;
}

/** La nature d'un site quand elle n'est pas dite : hospitalière si rattachée, camion si mobile, temporaire sinon. */
export function defaultMorgueType(site: Pick<MorgueSite, "kind" | "hospitalId">): MorgueType {
  if (site.kind === "mobile") return "truck";
  return site.hospitalId ? "hospital" : "temporary";
}

/** « Nom Prénom » quand l'un ou l'autre est connu, sinon `undefined` — ce que la règle DVI lit comme identité confirmée. */
export function displayName(id: PersonIdentity): string | undefined {
  const s = [id.lastName?.trim(), id.firstName?.trim()].filter((x): x is string => !!x).join(" ");
  return s || undefined;
}
