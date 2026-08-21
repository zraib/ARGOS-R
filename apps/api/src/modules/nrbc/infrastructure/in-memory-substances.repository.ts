import { Injectable } from "@nestjs/common";
import type { Substance } from "@/modules/nrbc/nrbc.types";
import type { SubstanceCatalog } from "@/modules/nrbc/ports/substance-catalog.port";

// ============================================================================
// ARGOS — catalogue de substances en mémoire (adaptateur de développement)
//
// Source des distances : table 1 de l'ERG 2024 (« Initial isolation and
// protective action distances »), PHMSA / Transports Canada / SCT.
//
// DISCIPLINE DES DONNÉES (doctrine d'honnêteté du projet) :
// - chlore et ammoniac : relevés le 21/08/2026 sur les fiches CAMEO Chemicals
//   (NOAA) alignées ERG 2024 → `ergVerified: true` ;
// - les autres substances : ordres de grandeur d'éditions antérieures de
//   l'ERG → `ergVerified: false`, et l'interface l'affiche. À confirmer sur
//   la table 1 de l'ERG 2024 avant tout emploi opérationnel.
//
// « Grand déversement » : les valeurs retenues sont le PIRE CAS de la ligne
// (wagon / semi-remorque), pas la citerne routière moyenne — un état-major
// planifie sur l'enveloppe, pas sur l'optimisme.
// ============================================================================

const SUBSTANCES: Substance[] = [
  {
    id: "chlorine",
    un: "1017",
    ergGuide: "124",
    labels: { fr: "Chlore", ar: "الكلور", en: "Chlorine" },
    state: "gas",
    small: { isolationM: 61, protectDayKm: 0.32, protectNightKm: 1.45 },
    large: { isolationM: 914, protectDayKm: 9.65, protectNightKm: 11.27 },
    ergVerified: true,
  },
  {
    id: "ammonia",
    un: "1005",
    ergGuide: "125",
    labels: { fr: "Ammoniac anhydre", ar: "الأمونيا اللامائية", en: "Anhydrous ammonia" },
    state: "gas",
    small: { isolationM: 30, protectDayKm: 0.16, protectNightKm: 0.16 },
    large: { isolationM: 305, protectDayKm: 4.18, protectNightKm: 4.18 },
    ergVerified: true,
  },
  {
    id: "sulfur-dioxide",
    un: "1079",
    ergGuide: "125",
    labels: { fr: "Dioxyde de soufre", ar: "ثاني أكسيد الكبريت", en: "Sulfur dioxide" },
    state: "gas",
    small: { isolationM: 100, protectDayKm: 0.7, protectNightKm: 3.1 },
    large: { isolationM: 500, protectDayKm: 4.8, protectNightKm: 9.9 },
    ergVerified: false,
  },
  {
    id: "hydrogen-sulfide",
    un: "1053",
    ergGuide: "117",
    labels: { fr: "Sulfure d'hydrogène", ar: "كبريتيد الهيدروجين", en: "Hydrogen sulfide" },
    state: "gas",
    small: { isolationM: 30, protectDayKm: 0.2, protectNightKm: 0.9 },
    large: { isolationM: 300, protectDayKm: 1.9, protectNightKm: 4.1 },
    ergVerified: false,
  },
  {
    id: "phosgene",
    un: "1076",
    ergGuide: "125",
    labels: { fr: "Phosgène", ar: "الفوسجين", en: "Phosgene" },
    state: "gas",
    small: { isolationM: 100, protectDayKm: 0.6, protectNightKm: 2.5 },
    large: { isolationM: 500, protectDayKm: 4.5, protectNightKm: 10.2 },
    ergVerified: false,
  },
  {
    id: "hydrogen-cyanide",
    un: "1051",
    ergGuide: "117",
    labels: { fr: "Cyanure d'hydrogène", ar: "سيانيد الهيدروجين", en: "Hydrogen cyanide" },
    state: "liquid",
    small: { isolationM: 60, protectDayKm: 0.3, protectNightKm: 1.1 },
    large: { isolationM: 300, protectDayKm: 1.7, protectNightKm: 4.2 },
    ergVerified: false,
  },
  {
    id: "hydrogen-fluoride",
    un: "1052",
    ergGuide: "125",
    labels: { fr: "Fluorure d'hydrogène anhydre", ar: "فلوريد الهيدروجين", en: "Hydrogen fluoride" },
    state: "liquid",
    small: { isolationM: 30, protectDayKm: 0.2, protectNightKm: 0.8 },
    large: { isolationM: 300, protectDayKm: 1.7, protectNightKm: 3.7 },
    ergVerified: false,
  },
  {
    id: "hydrogen-chloride",
    un: "1050",
    ergGuide: "125",
    labels: { fr: "Chlorure d'hydrogène anhydre", ar: "كلوريد الهيدروجين", en: "Hydrogen chloride" },
    state: "gas",
    small: { isolationM: 30, protectDayKm: 0.1, protectNightKm: 0.6 },
    large: { isolationM: 300, protectDayKm: 1.7, protectNightKm: 4.4 },
    ergVerified: false,
  },
  {
    id: "ethylene-oxide",
    un: "1040",
    ergGuide: "119",
    labels: { fr: "Oxyde d'éthylène", ar: "أكسيد الإيثيلين", en: "Ethylene oxide" },
    state: "gas",
    small: { isolationM: 30, protectDayKm: 0.1, protectNightKm: 0.2 },
    large: { isolationM: 150, protectDayKm: 0.8, protectNightKm: 2.3 },
    ergVerified: false,
  },
  {
    id: "bromine",
    un: "1744",
    ergGuide: "154",
    labels: { fr: "Brome", ar: "البروم", en: "Bromine" },
    state: "liquid",
    small: { isolationM: 60, protectDayKm: 0.4, protectNightKm: 1.5 },
    large: { isolationM: 300, protectDayKm: 2.4, protectNightKm: 5.0 },
    ergVerified: false,
  },
  {
    id: "nitric-acid-fuming",
    un: "2032",
    ergGuide: "157",
    labels: { fr: "Acide nitrique fumant", ar: "حمض النيتريك المدخن", en: "Nitric acid, fuming" },
    state: "liquid",
    small: { isolationM: 30, protectDayKm: 0.1, protectNightKm: 0.4 },
    large: { isolationM: 150, protectDayKm: 0.9, protectNightKm: 2.3 },
    ergVerified: false,
  },
];

@Injectable()
export class InMemorySubstancesRepository implements SubstanceCatalog {
  private readonly substances = SUBSTANCES;

  async list(): Promise<Substance[]> {
    return this.substances;
  }

  async findById(id: string): Promise<Substance | null> {
    return this.substances.find((s) => s.id === id) ?? null;
  }
}
