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

  describe("messages — identité de l'auteur et unicité", () => {
    it("le serveur ne décide PAS que le message est « le mien »", () => {
      // `mine: true` stocké côté serveur revenait à dire à tous les postes que
      // chaque message est le leur : au rechargement, l'opérateur voyait la
      // conversation entière du côté de ses propres messages.
      const msg = comms.addMessage("c1", { who: "Cdt. H. Alami", author: "h.alami", initials: "HA", av: "bg-or-500", txt: "Reçu." });
      expect(msg.mine).toBeUndefined();
    });

    it("porte le matricule de son auteur, distinct du nom affiché", () => {
      const msg = comms.addMessage("c1", { who: "Cdt. H. Alami", author: "h.alami", initials: "HA", av: "bg-or-500", txt: "Reçu." });
      expect(msg.author).toBe("h.alami");
      expect(msg.who).toBe("Cdt. H. Alami");
    });

    it("deux messages de la MÊME milliseconde reçoivent deux identifiants", () => {
      // Identifiants identiques = messages confondus par le dédoublonnage du
      // flux temps réel : le second n'apparaîtrait jamais chez les autres.
      const a = comms.addMessage("c1", { who: "A", author: "a", initials: "A", av: "", txt: "un" });
      const b = comms.addMessage("c1", { who: "A", author: "a", initials: "A", av: "", txt: "deux" });
      const c = comms.addMessage("c1", { who: "A", author: "a", initials: "A", av: "", txt: "trois" });
      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
      expect(b.id).toBeGreaterThan(a.id);
      expect(c.id).toBeGreaterThan(b.id);
    });

    it("un message système n'est à personne", () => {
      comms.postSystem("INC-2623", "Unité U3 engagée.");
      const chan = comms.channelForIncident("INC-2623");
      const dernier = comms.all().messages[chan.id].at(-1);
      expect(dernier?.mine).toBe(false);
      expect(dernier?.author).toBeUndefined();
    });
  });

  describe("révision de la liste des participants", () => {
    it("un participant s'ajoute et se retire après coup", () => {
      const chan = comms.addChannel("g1", "coord", ["h.alami"]);
      expect(comms.addMembers(chan.id, ["y.tazi", "n.fassi"]).members).toEqual(["h.alami", "y.tazi", "n.fassi"]);
      expect(comms.removeMember(chan.id, "y.tazi").members).toEqual(["h.alami", "n.fassi"]);
    });

    it("ajouter deux fois le même compte ne le double pas", () => {
      const chan = comms.addChannel("g1", "coord", ["h.alami"]);
      comms.addMembers(chan.id, ["h.alami", " h.alami "]);
      expect(chan.members).toEqual(["h.alami"]);
    });

    it("retirer le dernier participant NE ROUVRE PAS le canal", () => {
      // Un canal vidé de ses membres reste restreint : le rouvrir à tous parce
      // que le dernier intervenant a été relevé exposerait la conversation au
      // moment précis où plus personne ne la surveille.
      const chan = comms.addChannel("g1", "coord", ["h.alami"]);
      comms.removeMember(chan.id, "h.alami");
      expect(chan.members).toEqual([]);
    });

    it("le premier participant REFERME un canal ouvert — le geste est explicite", () => {
      const chan = comms.addChannel("g1", "ouvert");
      expect(chan.members).toBeUndefined();
      expect(comms.addMembers(chan.id, ["h.alami"]).members).toEqual(["h.alami"]);
    });

    it("retirer d'un canal OUVERT est refusé : il n'a pas de liste", () => {
      const chan = comms.addChannel("g1", "ouvert");
      expect(() => comms.removeMember(chan.id, "h.alami")).toThrow();
    });

    it("retirer un compte absent de la liste ne change rien et ne casse pas", () => {
      const chan = comms.addChannel("g1", "coord", ["h.alami"]);
      expect(comms.removeMember(chan.id, "inconnu").members).toEqual(["h.alami"]);
    });

    it("le canal d'un incident se peuple et se dépeuple comme les autres", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      comms.addMembers(chan.id, ["h.alami", "y.tazi"]);
      expect(chan.members).toEqual(["h.alami", "y.tazi"]);
      comms.removeMember(chan.id, "h.alami");
      expect(chan.members).toEqual(["y.tazi"]);
    });

    it("refuse un canal inconnu, des deux côtés", () => {
      expect(() => comms.addMembers("c-fantome", ["h.alami"])).toThrow();
      expect(() => comms.removeMember("c-fantome", "h.alami")).toThrow();
    });
  });
});
