import { describe, expect, it } from "vitest";
import {
  correspondentOf,
  directChannels,
  isOnline,
  lastMessageId,
  maxOpenWindows,
  orderConversations,
  unreadDirect,
  windowOffset,
  withOpened,
} from "@/lib/chat";
import type { Channel, CommCategory, CommMessage } from "@/lib/types";

const dm = (id: string, name: string, members: string[], extra: Partial<Channel> = {}): Channel => ({ id, name, kind: "text", members, direct: true, ...extra });
const msg = (id: number): CommMessage => ({ id, who: "x", initials: "X", av: "", time: "10:00", txt: "…" });

const cats: CommCategory[] = [
  { id: "g1", name: "OPS", chans: [{ id: "c1", name: "état-major", kind: "text" }] },
  {
    id: "g-direct",
    name: "DIRECT",
    chans: [
      dm("dm-a_moi", "Alami", ["a", "moi"]),
      dm("dm-b_moi", "Bennani", ["moi", "b"]),
      dm("dm-c_moi", "Chraibi", ["c", "moi"], { archived: true }),
    ],
  },
];

describe("conversations flottantes", () => {
  it("ne retient que les conversations directes vivantes", () => {
    expect(directChannels(cats).map((c) => c.id)).toEqual(["dm-a_moi", "dm-b_moi"]);
  });

  it("nomme le correspondant : l'AUTRE membre, quelle que soit la casse", () => {
    expect(correspondentOf(dm("x", "x", ["A.Alami", "moi"]), "MOI")).toBe("A.Alami");
    // Une conversation dont je ne suis pas membre n'a pas de correspondant pour moi.
    expect(correspondentOf(dm("x", "x", ["a", "b"]), "moi")).toBeUndefined();
  });

  it("la présence est la connexion", () => {
    const online = [{ matricule: "A", role: "tacom", sessions: 1, since: "" }];
    expect(isOnline("a", online)).toBe(true);
    expect(isOnline("b", online)).toBe(false);
    expect(isOnline(undefined, online)).toBe(false);
  });

  it("le dernier message ignore les brouillons (identifiants négatifs)", () => {
    expect(lastMessageId([msg(3), msg(-9), msg(7)])).toBe(7);
    expect(lastMessageId(undefined)).toBe(0);
  });

  it("ordonne : fenêtres ouvertes d'abord, puis la plus récemment active", () => {
    const chans = directChannels(cats).concat(dm("dm-d_moi", "Drissi", ["d", "moi"]));
    const msgs = { "dm-a_moi": [msg(2)], "dm-b_moi": [msg(10)], "dm-d_moi": [] };
    expect(orderConversations(chans, msgs, ["dm-d_moi"]).map((c) => c.id)).toEqual(["dm-d_moi", "dm-b_moi", "dm-a_moi"]);
    expect(orderConversations(chans, msgs, []).map((c) => c.id)).toEqual(["dm-b_moi", "dm-a_moi", "dm-d_moi"]);
  });

  it("compte les non-lus des seules conversations directes", () => {
    expect(unreadDirect(directChannels(cats), { "dm-a_moi": 2, "dm-b_moi": 1, c1: 40 })).toBe(3);
  });

  it("une fenêtre sur téléphone, sinon ce que la largeur permet entre les boutons et la réserve", () => {
    expect(maxOpenWindows(375)).toBe(1);
    // 1024 − 92 − 420 = 512 → une fenêtre de 332 px.
    expect(maxOpenWindows(1024)).toBe(1);
    // 1440 − 512 = 928 → deux fenêtres.
    expect(maxOpenWindows(1440)).toBe(2);
    // Jamais plus de quatre.
    expect(maxOpenWindows(4000)).toBe(4);
  });

  it("place les fenêtres à partir de la colonne des boutons, sans se chevaucher", () => {
    expect(windowOffset(0, 1440)).toBe(92);
    expect(windowOffset(1, 1440)).toBe(92 + 332);
    expect(windowOffset(0, 375)).toBe(84);
    // Sans Copilot, le bouton des conversations prend le coin : les fenêtres s'alignent sur la marge.
    expect(windowOffset(0, 1440, false)).toBe(24);
    expect(windowOffset(0, 375, false)).toBe(16);
    expect(maxOpenWindows(1024, false)).toBe(1);
  });


  it("ouvrir met en tête et ne garde que les plus récentes", () => {
    expect(withOpened(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    expect(withOpened(["a", "b"], "b", 3)).toEqual(["b", "a"]);
    expect(withOpened([], "a", 0)).toEqual(["a"]);
  });
});
