import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommsService } from "@/modules/domain/comms.service";

// ============================================================================
// Centre de communication — nommage des canaux et composition à la création
//
// Deux promesses tenues ici : le canal d'une opération porte le TITRE de
// l'opération, tel qu'il a été saisi (on la reconnaît dans la liste sans aller
// chercher à quoi « inc-2623 » correspond — ADR 0021), et créer un canal,
// c'est aussi y convoquer ses membres — en un seul geste, pas en deux.
// ============================================================================

describe("CommsService — canaux", () => {
  let comms: CommsService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({ providers: [CommsService] }).compile();
    comms = mod.get(CommsService);
  });

  describe("canal d'un incident", () => {
    it("porte le titre de l'incident, tel quel — ni sa référence, ni un identifiant", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      expect(chan.name).toBe("Crues de l'oued Ourika");
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
      expect(premier.name).toBe("Crues de l'oued Ourika");
    });

    it("deux incidents de même titre reçoivent deux canaux distincts, le second numéroté", () => {
      const a = comms.channelForIncident("INC-2701", "Feu de forêt");
      const b = comms.channelForIncident("INC-2702", "Feu de forêt");
      expect(a.name).toBe("Feu de forêt");
      expect(b.name).toBe("Feu de forêt (2702)");
      expect(a.id).not.toBe(b.id);
    });

    it("garde accents, majuscules et ponctuation — le nom se lit comme le titre", () => {
      expect(comms.channelForIncident("INC-2616", "Séisme M5.9 — province d'Al Haouz").name)
        .toBe("Séisme M5.9 — province d'Al Haouz");
    });

    it("sans titre exploitable, la référence sert de nom de repli", () => {
      expect(comms.channelForIncident("INC-2801", "   ").name).toBe("INC-2801");
      expect(comms.channelForIncident("INC-2802").name).toBe("INC-2802");
    });

    it("suit le titre de l'incident quand il change (ADR 0021)", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues");
      comms.renameIncidentChannel("INC-2623", "Crues de l'oued Ourika");
      expect(chan.name).toBe("Crues de l'oued Ourika");
      expect(chan.topic).toContain("Crues de l'oued Ourika");
      // Un titre vide ne renomme rien ; un incident sans canal non plus.
      comms.renameIncidentChannel("INC-2623", "   ");
      expect(chan.name).toBe("Crues de l'oued Ourika");
      expect(() => comms.renameIncidentChannel("INC-9999", "Fantôme")).not.toThrow();
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
  // --- traçabilité (ADR 0021) : archiver, exporter, importer -----------------

  describe("archivage d'un canal", () => {
    const msg = (author: string) => ({ who: author, author, initials: "XX", av: "", txt: "Reçu." });

    it("un canal archivé se lit encore mais ne s'écrit plus — jusqu'à sa réouverture", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues");
      comms.addMessage(chan.id, msg("h.alami"));
      comms.archiveChannel(chan.id, true, "m.zraib");
      expect(chan.archived).toBe(true);
      expect(chan.archivedBy).toBe("m.zraib");
      expect(chan.archivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Toujours servi, avec sa conversation.
      const vu = comms.all("h.alami");
      expect(vu.categories.flatMap((c) => c.chans).find((c) => c.id === chan.id)?.archived).toBe(true);
      expect(vu.messages[chan.id]).toHaveLength(1);
      expect(() => comms.addMessage(chan.id, msg("h.alami"))).toThrow(ForbiddenException);
      comms.archiveChannel(chan.id, false, "m.zraib");
      expect(chan.archived).toBeUndefined();
      expect(chan.archivedAt).toBeUndefined();
      expect(() => comms.addMessage(chan.id, msg("h.alami"))).not.toThrow();
    });

    it("le canal d'un incident s'archive avec lui et rouvre avec lui", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues");
      comms.archiveChannelForIncident("INC-2623", true, "m.zraib");
      expect(chan.archived).toBe(true);
      comms.archiveChannelForIncident("INC-2623", false, "m.zraib");
      expect(chan.archived).toBeUndefined();
      // Un incident sans canal : rien à faire, rien à casser.
      expect(() => comms.archiveChannelForIncident("INC-9999")).not.toThrow();
    });

    it("une conversation directe ne s'archive pas, un canal inconnu non plus", () => {
      const { channel } = comms.channelForDirect({ matricule: "h.alami", nom: "A" }, { matricule: "n.fassi", nom: "B" });
      expect(() => comms.archiveChannel(channel.id, true, "m.zraib")).toThrow(BadRequestException);
      expect(() => comms.archiveChannel("c-fantome", true, "m.zraib")).toThrow(NotFoundException);
    });
  });

  describe("export", () => {
    const msg = (author: string, txt: string) => ({ who: author, author, initials: "XX", av: "", txt });

    it("rend un document daté et signé, avec le canal, son groupe et ses messages horodatés", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      comms.addMembers(chan.id, ["h.alami"]);
      comms.addMessage(chan.id, msg("h.alami", "Reçu."));
      comms.postSystem("INC-2623", "Unité U3 engagée.");
      const doc = comms.exportChannels("m.zraib", [chan.id]);
      expect(doc.format).toBe("iris-comms/1");
      expect(doc.exportedBy).toBe("m.zraib");
      expect(doc.exportedAt).toMatch(/^\d{4}-/);
      expect(doc.channels).toHaveLength(1);
      const [ex] = doc.channels;
      expect(ex).toMatchObject({ id: chan.id, name: "Crues de l'oued Ourika", incidentId: "INC-2623", members: ["h.alami"] });
      expect(ex.category).toBeTruthy();
      expect(ex.messages.map((m) => m.txt)).toEqual(["Reçu.", "Unité U3 engagée."]);
      expect(ex.messages[0].author).toBe("h.alami");
      expect(ex.messages[0].at).toMatch(/^\d{4}-/);
    });

    it("sans liste, exporte tout le centre ; une conversation directe ne sort que pour ses membres", () => {
      const { channel } = comms.channelForDirect({ matricule: "h.alami", nom: "A" }, { matricule: "n.fassi", nom: "B" });
      const admin = comms.exportChannels("m.zraib");
      expect(admin.channels.length).toBeGreaterThan(1);
      expect(admin.channels.some((c) => c.id === channel.id)).toBe(false);
      const membre = comms.exportChannels("h.alami");
      expect(membre.channels.some((c) => c.id === channel.id && c.direct)).toBe(true);
      // Un canal demandé qui n'existe pas (ou qu'on ne peut pas voir) : 404, pas un document vide.
      expect(() => comms.exportChannels("m.zraib", ["c-fantome"])).toThrow(NotFoundException);
      expect(() => comms.exportChannels("m.zraib", [channel.id])).toThrow(NotFoundException);
    });
  });

  describe("import", () => {
    const msg = (author: string, txt: string) => ({ who: author, author, initials: "XX", av: "", txt });

    it("reprend les canaux d'un export en archives, dans « ARCHIVES IMPORTÉES », messages et auteurs compris", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues de l'oued Ourika");
      comms.addMessage(chan.id, msg("h.alami", "Reçu."));
      comms.addMessage(chan.id, msg("n.fassi", "Bien reçu."));
      const doc = comms.exportChannels("m.zraib", [chan.id]);

      const res = comms.importDocument(doc, "m.zraib");
      expect(res).toEqual({ channels: 1, messages: 2, skipped: 0 });
      const cat = comms.all().categories.find((c) => c.id === "g-import");
      expect(cat?.name).toBe("ARCHIVES IMPORTÉES");
      expect(cat?.chans).toHaveLength(1);
      const [repris] = cat!.chans;
      expect(repris.archived).toBe(true);
      expect(repris.name).toBe(`Crues de l'oued Ourika (${doc.exportedAt.slice(0, 10)})`);
      expect(repris.imported).toMatchObject({ from: doc.exportedAt, originalId: chan.id, by: "m.zraib" });
      // Rien n'est fusionné dans le canal d'origine, qui garde ses deux messages.
      expect(comms.all().messages[chan.id]).toHaveLength(2);
      const messages = comms.all().messages[repris.id];
      expect(messages.map((m) => m.txt)).toEqual(["Reçu.", "Bien reçu."]);
      expect(messages.map((m) => m.author)).toEqual(["h.alami", "n.fassi"]);
      expect(messages[0].at).toBe(doc.channels[0].messages[0].at);
      expect(messages.every((m) => m.mine === false)).toBe(true);
      // Sous de NOUVEAUX identifiants : ils ne se confondent pas avec ceux du centre.
      expect(new Set(messages.map((m) => m.id)).size).toBe(2);
      expect(() => comms.addMessage(repris.id, msg("h.alami", "encore"))).toThrow(ForbiddenException);
    });

    it("un canal déjà repris du même export est sauté ; un autre export du même canal se distingue", () => {
      const chan = comms.channelForIncident("INC-2623", "Crues");
      comms.addMessage(chan.id, msg("h.alami", "Reçu."));
      const doc = comms.exportChannels("m.zraib", [chan.id]);
      expect(comms.importDocument(doc, "m.zraib")).toEqual({ channels: 1, messages: 1, skipped: 0 });
      expect(comms.importDocument(doc, "m.zraib")).toEqual({ channels: 0, messages: 0, skipped: 1 });
      const autre = { ...doc, exportedAt: "2026-01-01T00:00:00.000Z" };
      expect(comms.importDocument(autre, "m.zraib")).toEqual({ channels: 1, messages: 1, skipped: 0 });
      const noms = comms.all().categories.find((c) => c.id === "g-import")!.chans.map((c) => c.name);
      expect(noms).toEqual([`Crues (${doc.exportedAt.slice(0, 10)})`, "Crues (2026-01-01)"]);
    });

    it("refuse un document qui n'est pas un export iris-comms/1", () => {
      expect(() => comms.importDocument({ format: "autre", channels: [] }, "m.zraib")).toThrow(BadRequestException);
      expect(() => comms.importDocument({ format: "iris-comms/1", channels: "non" as unknown as [] }, "m.zraib")).toThrow(BadRequestException);
    });

    it("une conversation directe importée reste réservée à ses deux correspondants", () => {
      const { channel } = comms.channelForDirect({ matricule: "h.alami", nom: "A" }, { matricule: "n.fassi", nom: "B" });
      comms.addMessage(channel.id, msg("h.alami", "Bonjour"));
      const doc = comms.exportChannels("h.alami", [channel.id]);
      comms.importDocument(doc, "m.zraib");
      // Servie à un correspondant ; sans lecteur, `all()` ne rend aucune conversation directe.
      const repris = comms.all("n.fassi").categories.find((c) => c.id === "g-import")!.chans[0];
      expect(repris.direct).toBe(true);
      expect(repris.members).toEqual(["h.alami", "n.fassi"]);
      const chez = (viewer: string) => comms.all(viewer).categories.flatMap((c) => c.chans).some((c) => c.id === repris.id);
      expect(chez("h.alami")).toBe(true);
      expect(chez("m.zraib")).toBe(false);
    });
  });

  describe("conversation directe", () => {
    const a = { matricule: "h.alami", nom: "Alami Hicham" };
    const b = { matricule: "w.casa", nom: "Bennani Karim" };
    const msg = (author: string) => ({ who: author, author, initials: "XX", av: "", txt: "Bonjour" });

    it("s'ouvre au premier contact, restreinte aux deux correspondants, dans un groupe dédié en fin de liste", () => {
      const { channel, created } = comms.channelForDirect(a, b);
      expect(created).toBe(true);
      expect(channel.direct).toBe(true);
      expect(channel.members).toEqual(["h.alami", "w.casa"]);
      expect(channel.id).toBe("dm-h.alami_w.casa");
      expect(channel.name).toBe("alami-hicham-bennani-karim");
      const cats = comms.all("h.alami").categories;
      expect(cats[cats.length - 1].id).toBe("g-direct");
    });

    it("porte, chez chacun, le nom de l'AUTRE correspondant", () => {
      const { channel } = comms.channelForDirect(a, b);
      const chez = (viewer: string) => comms.all(viewer).categories.flatMap((c) => c.chans).find((ch) => ch.id === channel.id);
      expect(chez("h.alami")?.name).toBe("Bennani Karim");
      expect(chez("W.CASA")?.name).toBe("Alami Hicham");
      expect(chez("h.alami")?.topic).toBe("Conversation directe");
    });

    it("reste idempotente, quel que soit le sens", () => {
      const first = comms.channelForDirect(a, b).channel;
      const again = comms.channelForDirect(b, a);
      expect(again.created).toBe(false);
      expect(again.channel).toBe(first);
    });

    it("ne sort du serveur que pour ses deux membres — messages compris", () => {
      const { channel } = comms.channelForDirect(a, b);
      comms.addMessage(channel.id, msg("h.alami"));
      const ids = (viewer?: string) => comms.all(viewer).categories.flatMap((c) => c.chans.map((ch) => ch.id));
      expect(ids("h.alami")).toContain(channel.id);
      expect(ids("W.CASA")).toContain(channel.id);
      expect(ids("p.casa")).not.toContain(channel.id);
      expect(ids()).not.toContain(channel.id);
      expect(comms.all("w.casa").messages[channel.id]).toHaveLength(1);
      expect(comms.all("p.casa").messages[channel.id]).toBeUndefined();
      // Le groupe dédié n'apparaît pas, vide, chez les autres.
      expect(comms.all("p.casa").categories.some((c) => c.id === "g-direct")).toBe(false);
    });

    it("refuse la parole à un tiers et toute modification de sa composition", () => {
      const { channel } = comms.channelForDirect(a, b);
      expect(() => comms.addMessage(channel.id, msg("p.casa"))).toThrow(ForbiddenException);
      expect(() => comms.addMembers(channel.id, ["p.casa"])).toThrow(BadRequestException);
      expect(() => comms.removeMember(channel.id, "w.casa")).toThrow(BadRequestException);
      expect(channel.members).toEqual(["h.alami", "w.casa"]);
    });

    it("se tient à deux : pas de conversation avec soi-même", () => {
      expect(() => comms.channelForDirect(a, { ...a })).toThrow(BadRequestException);
    });
  });
});
