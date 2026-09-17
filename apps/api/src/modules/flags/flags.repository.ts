import { SWITCHABLE_MODULES } from "@/shared/permissions";

export interface FlagsRepository {
  all(): Promise<Record<string, boolean>>;
  set(key: string, enabled: boolean): Promise<Record<string, boolean>>;
}

export const FLAGS_REPOSITORY = "FLAGS_REPOSITORY";

/** Flags par défaut : un par module pilotable (§6.15, vocabulaire partagé `MODULE_KEYS` moins le cœur, ADR 0017), tous ouverts. */
export const DEFAULT_FLAGS: Record<string, boolean> = Object.fromEntries(SWITCHABLE_MODULES.map((k) => [k, true]));
