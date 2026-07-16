export interface FlagsRepository {
  all(): Promise<Record<string, boolean>>;
  set(key: string, enabled: boolean): Promise<Record<string, boolean>>;
}

export const FLAGS_REPOSITORY = "FLAGS_REPOSITORY";

/** Flags par défaut (un par module pilotable, §6.15). */
export const DEFAULT_FLAGS: Record<string, boolean> = {
  incidents: true, map: true, dispatch: true, triage: true,
  equip: true, units: true, personnel: true, workorders: true,
  hospitals: true, ics: true, damage: true, shelters: true,
  orsec: true, plans: true, comms: true, reports: true, analytics: true,
  assistant: true,
};
