import { describe, expect, it } from "vitest";
import { FR_DICT } from "@/lib/i18n/translations.fr";
import { EN_DICT } from "@/lib/i18n/translations.en";
import { AR_DICT } from "@/lib/i18n/translations.ar";
import { FR_MODULES } from "@/lib/i18n/modules.fr";
import { EN_MODULES } from "@/lib/i18n/modules.en";
import { AR_MODULES } from "@/lib/i18n/modules.ar";

// ============================================================================
// i18n — les trois langues portent EXACTEMENT les mêmes clés.
//
// Une clé absente en arabe ne casse pas la compilation (les dictionnaires sont
// typés sur l'interface, mais une valeur vide passe) : elle affiche un blanc, ou
// du français, à un opérateur arabophone. C'est la seule garantie mécanique
// qu'aucune chaîne n'a été oubliée dans une langue.
// ============================================================================

function chemins(o: unknown, prefixe = ""): string[] {
  if (typeof o !== "object" || o === null) return [prefixe];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => chemins(v, prefixe ? `${prefixe}.${k}` : k));
}
function vides(o: unknown, prefixe = ""): string[] {
  if (typeof o === "string") return o.trim() === "" ? [prefixe] : [];
  if (typeof o !== "object" || o === null) return [];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => vides(v, prefixe ? `${prefixe}.${k}` : k));
}

describe("i18n — parité des dictionnaires", () => {
  it("cœur : FR, EN et AR ont le même jeu de clés", () => {
    const fr = chemins(FR_DICT).sort();
    expect(chemins(EN_DICT).sort()).toEqual(fr);
    expect(chemins(AR_DICT).sort()).toEqual(fr);
  });

  it("modules : FR, EN et AR ont le même jeu de clés (profondeur incluse)", () => {
    const fr = chemins(FR_MODULES).sort();
    expect(chemins(EN_MODULES).sort()).toEqual(fr);
    expect(chemins(AR_MODULES).sort()).toEqual(fr);
  });

  it("aucune chaîne vide dans aucune langue", () => {
    for (const d of [FR_DICT, EN_DICT, AR_DICT, FR_MODULES, EN_MODULES, AR_MODULES]) expect(vides(d)).toEqual([]);
  });

  it("l'arabe est bien de l'arabe pour les libellés de navigation", () => {
    // Une traduction « oubliée » se recopie souvent depuis le français. Les
    // libellés de menu sont ceux qu'un opérateur voit en premier.
    const arabe = /[؀-ۿ]/;
    // Les noms de PRODUIT ne se traduisent pas : ils s'écrivent en latin dans
    // les trois langues, comme une marque.
    const nomsDeProduit = /^(OPSnet|Hospinet|ARGOS|IRIS)$/;
    for (const [k, v] of Object.entries(AR_DICT)) {
      if (k.startsWith("nav_") && typeof v === "string" && !nomsDeProduit.test(v)) expect(v, k).toMatch(arabe);
    }
  });
});
