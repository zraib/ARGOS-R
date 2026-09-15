// ============================================================================
// ARGOS — service morgue : ce que l'écran calcule sur les sites et le registre
//
// Pur : places libres d'un site, sites les plus proches d'un point (pour
// adresser un décès au bon endroit), dernière étape de la chaîne de garde,
// distance à vol d'oiseau. Les invariants (référence unique, réception avant
// transfert, repli d'une unité vide) sont tenus par l'API : l'écran les
// reflète pour ne pas proposer l'impossible.
// ============================================================================

import type { CustodyEvent, IdMethod, MorgueSite, MortuaryRecord, PersonIdentity } from "@/lib/types";
import { fromLocalInput, identityBody, type IdentityDraft } from "@/lib/victims";

/** Corps présents ou annoncés sur un site — restitués exclus. */
export function presentBodies(site: MorgueSite, records: readonly MortuaryRecord[]): number {
  return records.filter((r) => r.mid === site.id && r.status !== "released").length;
}

/** Emplacements libres d'un site. */
export function freePlaces(site: MorgueSite, records: readonly MortuaryRecord[]): number {
  return site.capacity - presentBodies(site, records);
}

/** Distance à vol d'oiseau (km) entre deux points [lng, lat]. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** L'échelon d'un site tel qu'il se lit : régional, de ville, ou mobile. */
export type SiteLevel = "regional" | "city" | "mobile";
export function levelOf(site: MorgueSite): SiteLevel {
  if (site.kind === "mobile") return "mobile";
  return site.level === "regional" ? "regional" : "city";
}

/** Les sites dans l'ordre de lecture : régionaux, puis de ville, puis mobiles ; par région puis par nom. */
export function sortSites(sites: readonly MorgueSite[]): MorgueSite[] {
  const rang: Record<SiteLevel, number> = { regional: 0, city: 1, mobile: 2 };
  return [...sites].sort((a, b) => (a.region ?? "").localeCompare(b.region ?? "", "fr") || rang[levelOf(a)] - rang[levelOf(b)] || a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Les sites ouverts vers lesquels adresser un corps, dans l'ordre où la
 * doctrine les préfère : d'abord la morgue rattachée à l'établissement,
 * puis celles de la même région (la régionale avant les autres), puis les
 * autres — chaque groupe du plus proche au plus loin (les sites sans
 * position en dernier), avec leurs places libres.
 */
export function nearestSites(
  from: [number, number] | undefined,
  sites: readonly MorgueSite[],
  records: readonly MortuaryRecord[],
  prefer: { hospitalId?: string; region?: string } = {},
): { site: MorgueSite; km: number | null; free: number; attached: boolean }[] {
  const groupe = (s: MorgueSite) => (prefer.hospitalId && s.hospitalId === prefer.hospitalId ? 0 : prefer.region && s.region === prefer.region ? (levelOf(s) === "regional" ? 1 : 2) : 3);
  return sites
    .filter((s) => s.statut !== "closed" && s.statut !== "full" && !(s.kind === "mobile" && !s.deployment))
    .map((site) => ({ site, km: from && site.ll ? distanceKm(from, site.ll) : null, free: freePlaces(site, records), attached: !!prefer.hospitalId && site.hospitalId === prefer.hospitalId }))
    .sort((a, b) => groupe(a.site) - groupe(b.site) || (a.km ?? Infinity) - (b.km ?? Infinity));
}

/** Les morgues rattachées à un établissement (sa chambre mortuaire, l'institut qu'il abrite). */
export function sitesOfHospital(hospitalId: string, sites: readonly MorgueSite[]): MorgueSite[] {
  return sortSites(sites.filter((s) => s.hospitalId === hospitalId && !(s.kind === "mobile" && !s.deployment)));
}

/** La dernière étape de la chaîne de garde d'un dossier, ou `null` pour un dossier antérieur au registre de garde. */
export function lastCustody(rec: MortuaryRecord): CustodyEvent | null {
  return rec.custody && rec.custody.length > 0 ? rec.custody[rec.custody.length - 1] : null;
}

/** Ce que le registre montre en premier : les réceptions en attente, puis les non identifiés, puis le plus récent. */
export function sortRegistry(records: readonly MortuaryRecord[]): MortuaryRecord[] {
  const rang = (r: MortuaryRecord) => (r.pendingReceipt ? 0 : r.status === "unidentified" ? 1 : r.status === "released" ? 3 : 2);
  return [...records].sort((a, b) => rang(a) - rang(b) || (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

// --- identification progressive : ce qui change, et rien d'autre --------------

/** Le brouillon du formulaire d'identification / modification d'un dossier. */
export interface RecordDraft {
  identity: IdentityDraft;
  /** Valeurs des champs `datetime-local` (vides = non renseigné). */
  deathAt: string;
  identifiedAt: string;
  method: IdMethod | "";
  identifiedBy: string;
  note: string;
  /** Changement de statut demandé ; absent = inchangé. */
  status?: "in_progress" | "identified";
}

/** Ce que le formulaire peut envoyer (sans la signature). */
export type RecordPatch = Partial<PersonIdentity> & {
  deathAt?: string;
  identifiedAt?: string;
  idMethod?: IdMethod;
  identifiedBy?: string;
  note?: string;
  status?: "in_progress" | "identified";
};

const sameInstant = (a: string | undefined, b: string | undefined): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return new Date(a).getTime() === new Date(b).getTime();
};

/**
 * Le patch d'un dossier : uniquement les champs dont la valeur diffère de
 * celle du dossier. Un champ laissé tel quel ne part pas — l'historique du
 * dossier ne porte que ce qui a changé, et rien n'est imposé : vide reste
 * « non renseigné ».
 */
export function recordPatch(record: MortuaryRecord, d: RecordDraft): RecordPatch {
  const out: RecordPatch = {};
  const id = identityBody(d.identity);
  if ((id.lastName ?? "") !== (record.lastName ?? "")) out.lastName = id.lastName ?? "";
  if ((id.firstName ?? "") !== (record.firstName ?? "")) out.firstName = id.firstName ?? "";
  if ((id.cni ?? "") !== (record.cni ?? "")) out.cni = id.cni ?? "";
  if ((id.sex ?? "unknown") !== (record.sex ?? "unknown")) out.sex = id.sex;
  if (id.age !== record.age) out.age = id.age;
  const deathAt = fromLocalInput(d.deathAt);
  if (!sameInstant(deathAt, record.deathAt)) out.deathAt = deathAt ?? "";
  const identifiedAt = fromLocalInput(d.identifiedAt);
  if (!sameInstant(identifiedAt, record.identifiedAt)) out.identifiedAt = identifiedAt ?? "";
  if ((d.method || undefined) !== record.idMethod) out.idMethod = d.method || undefined;
  if (d.identifiedBy.trim() !== (record.identifiedBy ?? "")) out.identifiedBy = d.identifiedBy.trim();
  if (d.note.trim() !== (record.note ?? "")) out.note = d.note.trim();
  if (d.status && d.status !== record.status) out.status = d.status;
  // Les clés posées à `undefined` (effacement d'un mode) n'ont rien à dire au serveur.
  for (const k of Object.keys(out) as (keyof RecordPatch)[]) if (out[k] === undefined) delete out[k];
  return out;
}
