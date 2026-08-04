import { ConflictException, Injectable } from "@nestjs/common";
import { loadDevState, saveDevState } from "@/common/dev-store";

// ============================================================================
// ARGOS — catalogue des types d'incident (paramétrable)
// Le type d'incident est une DONNÉE, pas une énumération figée : la plateforme
// peut en enregistrer de nouveaux à mesure qu'elle grandit (POST, Super Admin).
// Chaque type porte ses libellés FR/AR/EN et son icône (tracé SVG 24×24) — le
// frontend ne code plus aucun type en dur.
// ============================================================================

export interface IncidentTypeDef {
  id: string;
  labels: { fr: string; ar: string; en: string };
  /** Tracé SVG (icône en trait, viewBox 24×24) */
  icon: string;
  /** Type fourni d'origine (non supprimable) */
  builtin?: boolean;
}

const SEED_TYPES: IncidentTypeDef[] = [
  { id: "earthquake", builtin: true, labels: { fr: "Séisme", ar: "زلزال", en: "Earthquake" }, icon: "M2 14h4l2-6 3 10 3-13 2 9h6" },
  { id: "flood", builtin: true, labels: { fr: "Inondation", ar: "فيضان", en: "Flood" }, icon: "M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" },
  { id: "wildfire", builtin: true, labels: { fr: "Feu de forêt", ar: "حريق غابة", en: "Wildfire" }, icon: "M12 2c1 4 5 6 5 11a5 5 0 01-10 0c0-2 .5-3.5 2-5 0 2 1 3 2 3 0-3-1-6 1-9z" },
  { id: "landslide", builtin: true, labels: { fr: "Glissement de terrain", ar: "انزلاق تربة", en: "Landslide" }, icon: "M3 20h18L14 6l-4 7-2-3z M7 8l2-4" },
  { id: "epidemic", builtin: true, labels: { fr: "Épidémie", ar: "وباء", en: "Epidemic" }, icon: "M12 8a4 4 0 100 8 4 4 0 000-8z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M19.1 4.9L17 7 M7 17l-2.1 2.1" },
  { id: "industrial", builtin: true, labels: { fr: "Accident industriel", ar: "حادث صناعي", en: "Industrial accident" }, icon: "M2 20h20 M4 20V9l5 4V9l5 4V4h6v16" },
  { id: "tsunami", builtin: true, labels: { fr: "Tsunami / raz-de-marée", ar: "تسونامي", en: "Tsunami" }, icon: "M3 12c0-5 3-8 7-8 3 0 5 2 5 4 0 2-1.5 3-3 3 1 1 3 1 5-1 M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0 M2 21c2-2 4-2 6 0s4 2 6 0 4-2 6 0" },
  { id: "storm", builtin: true, labels: { fr: "Tempête / vents violents", ar: "عاصفة", en: "Severe storm" }, icon: "M17.5 16a4.5 4.5 0 000-9 6 6 0 00-11.5 2A4 4 0 007 16h10.5z M13 10l-3 5h4l-3 5" },
  { id: "coldwave", builtin: true, labels: { fr: "Vague de froid / neige", ar: "موجة برد وثلوج", en: "Cold wave / snow" }, icon: "M12 2v20 M4 7l16 10 M20 7L4 17 M9 4l3 3 3-3 M9 20l3-3 3 3 M2 12h20" },
  { id: "drought", builtin: true, labels: { fr: "Sécheresse", ar: "جفاف", en: "Drought" }, icon: "M12 3v2 M5.6 5.6L7 7 M18.4 5.6L17 7 M8 12a4 4 0 018 0z M2 16h20 M6 16l-1 5 M12 16v5 M18 16l1 5" },
  { id: "building_collapse", builtin: true, labels: { fr: "Effondrement de bâtiment", ar: "انهيار مبنى", en: "Building collapse" }, icon: "M3 21h18 M5 21V8l5-4 4 3v14 M14 10l5 2v9 M9 12l2 2-2 2" },
  { id: "road_accident", builtin: true, labels: { fr: "Accident routier majeur", ar: "حادث سير كبير", en: "Major road accident" }, icon: "M2 17h20 M4 17l2-5h6l2 5 M14 17l2-4h4l1 4 M7 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M17 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M12 3l2 2-2 2" },
  { id: "maritime", builtin: true, labels: { fr: "Accident maritime", ar: "حادث بحري", en: "Maritime accident" }, icon: "M4 18c2-2 4-2 6 0s4 2 6 0 M6 15l-2-5h16l-2 5 M12 10V4 M12 4l5 3h-5" },
  { id: "nrbc", builtin: true, labels: { fr: "Incident NRBC / chimique", ar: "حادث كيميائي", en: "CBRN / chemical incident" }, icon: "M10 3h4 M12 3v6l5 8a3 3 0 01-3 4H10a3 3 0 01-3-4l5-8z M9 14h6" },
];

@Injectable()
export class IncidentTypesService {
  private readonly types: IncidentTypeDef[] = [...SEED_TYPES];

  constructor() {
    // Persistance dev : réinjecte les types PERSONNALISÉS (non builtin) créés
    // depuis les Paramètres, pour qu'ils survivent aux redémarrages. On fusionne
    // sur le seed (les types fournis restent toujours présents). Voir common/dev-store.
    const custom = loadDevState<IncidentTypeDef[]>("incident-types", []);
    for (const t of custom) {
      if (!this.types.some((x) => x.id === t.id)) this.types.push({ ...t, builtin: false });
    }
  }

  /** Persiste uniquement les types personnalisés (le seed est reconstruit au boot). */
  private persist(): void {
    saveDevState("incident-types", this.types.filter((t) => !t.builtin));
  }

  list(): IncidentTypeDef[] {
    return this.types;
  }

  isValid(id: string): boolean {
    return this.types.some((t) => t.id === id);
  }

  /** Enregistre un nouveau type (Super Admin) — id en slug, libellés trilingues. */
  register(input: { id: string; labels: { fr: string; ar: string; en: string }; icon?: string }): IncidentTypeDef {
    const id = input.id.trim().toLowerCase().replace(/\s+/g, "_");
    if (this.types.some((t) => t.id === id)) throw new ConflictException(`Type déjà enregistré : ${id}`);
    const def: IncidentTypeDef = {
      id,
      labels: input.labels,
      // Icône par défaut : triangle d'alerte.
      icon: input.icon?.trim() || "M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    };
    this.types.push(def);
    this.persist();
    return def;
  }
}
