import { describe, expect, it } from "vitest";
import { applyReceipt, lastForeignId, receiptState } from "@/lib/comms/receipts";
import type { CommMessage } from "@/lib/types";

const msg = (id: number, mine: boolean, extra: Partial<CommMessage> = {}): CommMessage => ({ id, who: "x", initials: "X", av: "", time: "10:00", txt: "…", mine, ...extra });

describe("accusés d'une conversation directe", () => {
  it("lit l'état d'un message pour le correspondant d'en face, quelle que soit la casse", () => {
    expect(receiptState(msg(1, true), "h.alami")).toBe("sent");
    expect(receiptState(msg(1, true, { deliveredBy: ["H.Alami"] }), "h.alami")).toBe("delivered");
    expect(receiptState(msg(1, true, { deliveredBy: ["h.alami"], readBy: ["h.alami"] }), "h.alami")).toBe("read");
    // Sans correspondant connu, rien de plus qu'« envoyé ».
    expect(receiptState(msg(1, true, { readBy: ["h.alami"] }), undefined)).toBe("sent");
  });

  it("applique un accusé aux SEULS messages à moi, jusqu'à l'identifiant donné ; lire implique avoir reçu", () => {
    const liste = [msg(1, true), msg(2, false), msg(3, true), msg(-4, true)];
    const maj = applyReceipt(liste, "h.alami", "read", 2);
    expect(receiptState(maj[0], "h.alami")).toBe("read");
    expect(maj[1]).toBe(liste[1]);
    expect(maj[2]).toBe(liste[2]);
    // Le brouillon (identifiant négatif) n'est jamais marqué.
    expect(maj[3]).toBe(liste[3]);
  });

  it("rend la même liste quand rien ne change, et n'ajoute pas deux fois le même compte", () => {
    const liste = [msg(1, true, { deliveredBy: ["h.alami"] })];
    expect(applyReceipt(liste, "h.alami", "delivered", 1)).toBe(liste);
    const lu = applyReceipt(applyReceipt(liste, "h.alami", "read", 1), "h.alami", "read", 1);
    expect(lu[0].readBy).toEqual(["h.alami"]);
    expect(lu[0].deliveredBy).toEqual(["h.alami"]);
  });

  it("trouve le dernier message de l'autre — jusqu'où accuser lecture", () => {
    expect(lastForeignId([msg(5, false), msg(9, true), msg(7, false), msg(-3, false)])).toBe(7);
    expect(lastForeignId([msg(9, true)])).toBe(0);
  });
});
