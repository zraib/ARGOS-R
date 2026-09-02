import { describe, expect, it } from "vitest";
import { parseSseBlock } from "@/lib/realtime/stream";

// Le protocole SSE est découpé à la main (pour porter le jeton en en-tête) :
// l'analyseur doit être exact sur les formes réelles émises par Nest.
describe("parseSseBlock", () => {
  it("lit `event:` et `data:` d'un bloc Nest", () => {
    const e = parseSseBlock('event: message\nid: 1\ndata: {"kind":"message","channelId":"c1"}');
    expect(e).toEqual({ kind: "message", data: { kind: "message", channelId: "c1" } });
  });
  it("le type vaut « message » par défaut et les commentaires sont ignorés", () => {
    expect(parseSseBlock(': battement\ndata: {"a":1}')).toEqual({ kind: "message", data: { a: 1 } });
  });
  it("rend null sans `data:` ou avec un JSON illisible — jamais une donnée devinée", () => {
    expect(parseSseBlock("event: ping")).toBeNull();
    expect(parseSseBlock("data: {pas du json")).toBeNull();
  });
  it("recolle un `data:` multi-lignes", () => {
    expect(parseSseBlock('data: {"a":\ndata: 2}')).toEqual({ kind: "message", data: { a: 2 } });
  });
});
