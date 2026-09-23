import { describe, expect, it } from "vitest";
import { morgueMarkerHTML, shelterMarkerHTML, unitMarkerHTML } from "@/lib/map/markers";
import type { Unit } from "@/lib/types";

// Les quatre familles de la carte doivent se DISTINGUER (ADR 0029) : le
// bouclier de l'unité, la tente de l'abri, la plaque du site mortuaire, la
// plaque sur roues de la morgue mobile. Un test de forme, pas de style.
const unite = (corps: Unit["corps"]): Unit =>
  ({ id: "U1", nom: "1er Groupement", ville: "Rabat", corps, cmdt: "Col. Y. B.", eff: 100, dispo: "ready", readiness: 90, x: 0, y: 0, ll: [-6.84, 34.02] }) as Unit;

describe("glyphes de la carte", () => {
  it("l'unité porte un bouclier, teinté par son corps", () => {
    const far = unitMarkerHTML(unite("far"), false);
    expect(far).toContain("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
    expect(far).toContain("#C9A84C");
    expect(unitMarkerHTML(unite("dgpc"), false)).toContain("#EA580C");
    // Le nom et l'organe restent écrits sous le symbole.
    expect(far).toContain("1er Groupement");
  });

  it("l'abri porte une tente, de la couleur de son remplissage, et son nom au survol", () => {
    const html = shelterMarkerHTML("Complexe sportif", "Amizmiz", "#15803d", false);
    expect(html).toContain("M12 3L2 21h20L12 3z");
    expect(html).toContain("#15803d");
    expect(html).toContain('title="Complexe sportif · Amizmiz"');
  });

  it("le site mortuaire porte une plaque ; la morgue MOBILE la porte sur des roues", () => {
    const fixe = morgueMarkerHTML("Institut médico-légal", false, "#334155", false);
    const mobile = morgueMarkerHTML("Morgue mobile n° 1", true, "#d97706", false);
    expect(fixe).toContain("M3 21h18 M5 21V11h14v10");
    expect(mobile).toContain("circle");
    expect(mobile).not.toContain("M3 21h18 M5 21V11h14v10");
    expect(mobile).toContain("#d97706");
  });

  it("un nom porteur de guillemets ne casse pas l'attribut", () => {
    expect(shelterMarkerHTML('Abri "Al Amal"', "Rabat", "#15803d", false)).toContain("&quot;Al Amal&quot;");
  });

  it("le marqueur sélectionné porte l'anneau d'or", () => {
    expect(shelterMarkerHTML("Abri", "Rabat", "#15803d", true)).toContain("#C9A84C");
    expect(morgueMarkerHTML("Site", false, "#334155", true)).toContain("#C9A84C");
  });
});
