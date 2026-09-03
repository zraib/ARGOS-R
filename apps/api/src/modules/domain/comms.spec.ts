import { Test } from "@nestjs/testing";
import { CommsService } from "@/modules/domain/comms.service";

// ============================================================================
// Centre de communication — nommage des canaux et composition à la création
//
// Deux promesses tenues ici : le canal d'une opération porte le TITRE de
// l'opération (on la reconnaît dans la liste sans aller chercher à quoi
// « inc-2623 » correspond), et créer un canal, c'est aussi y convoquer ses
// membres — en un seul geste, pas en deux.
// ============================================================================

describe("CommsService — canaux", () => {
  let comms: CommsService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({ providers: [CommsService] }).compile();
    comms = mod.get(CommsService);
  });

  describe("canal d'un incident", () => {
    it("porte le titre de l'incident, pas sa référence", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      expect(chan.name).toBe("crues-de-l-oued-ourika");
      // La référence reste lisible dans le sujet, elle n'est pas perdue.
      expect(chan.topic).toContain("INC-2623");
      expect(chan.topic).toContain("Crues de l'oued Ourika");
    });

    it("garde un identifiant technique dérivé de la référence — la cascade le retrouve", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      expect(chan.id).toBe("c-inc-2623");
      expect(comms.findChannel("c-inc-2623")).toBe(chan);
    });

    it("reste idempotent, et un rappel sans titre ne renomme rien", () => {
      const premier = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      expect(comms.channelForIncident("INC-2623")).toBe(premier);
      expect(premier.name).toBe("crues-de-l-oued-ourika");
    });

    it("deux incidents de même titre reçoivent deux canaux distincts", () => {
      const a = comms.channelForIncident("INC-2701", "Feu de forêt");
      const b = comms.channelForIncident("INC-2702", "Feu de forêt");
      expect(a.name).toBe("feu-de-forêt");
      expect(b.name).toBe("feu-de-forêt-2702");
      expect(a.id).not.toBe(b.id);
    });

    it("garde les lettres accentuées — le nom se lit en français", () => {
      expect(comms.channelForIncident("INC-2616", "Séisme M5.9 — province d'Al Haouz").name)
        .toBe("séisme-m5-9-province-d-al-haouz");
    });

    it("sans titre exploitable, la référence sert de nom de repli", () => {
      expect(comms.channelForIncident("INC-2801", "   ").name).toBe("inc-2801");
      expect(comms.channelForIncident("INC-2802", "!!! ???").name).toBe("inc-2802");
    });

    it("naît restreint : il se peuplera des intervenants engagés", () => {
      expect(comms.channelForIncident("INC-2623", "Crues").members).toEqual([]);
    });
  });

  describe("création d'un canal de discussion", () => {
    it("convoque ses membres dans le même geste", () => {
      const chan = comms.addChannel("g1", "Point logistique", ["h.alami", "n.fassi"]);
      expect(chan.name).toBe("point-logistique");
      expect(chan.members).toEqual(["h.alami", "n.fassi"]);
    });

    it("dédoublonne et ignore les matricules vides", () => {
      const chan = comms.addChannel("g1", "coord", ["h.alami", " h.alami ", "", "  "]);
      expect(chan.members).toEqual(["h.alami"]);
    });

    it("sans membre, le canal reste OUVERT — pas restreint et vide", () => {
      expect(comms.addChannel("g1", "ouvert-a-tous").members).toBeUndefined();
      expect(comms.addChannel("g1", "ouvert-aussi", []).members).toBeUndefined();
    });

    it("refuse un nom qui ne laisse aucun caractère utilisable", () => {
      expect(() => comms.addChannel("g1", "   ")).toThrow();
      expect(() => comms.addChannel("g1", "!!!")).toThrow();
    });

    it("refuse un groupe inconnu", () => {
      expect(() => comms.addChannel("groupe-fantome", "essai")).toThrow();
    });
  });
});
