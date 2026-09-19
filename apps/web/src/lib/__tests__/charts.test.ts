import { describe, expect, it } from "vitest";
import { axisTicks } from "@/lib/charts";

describe("graduations d'axe", () => {
  it("reste distinctes quand le maximum est petit", () => {
    expect(axisTicks(1)).toEqual([1]);
    expect(axisTicks(2)).toEqual([1, 2]);
    expect(axisTicks(3)).toEqual([1, 2, 3]);
    expect(axisTicks(0)).toEqual([1]);
  });
  it("garde les quatre graduations quand le maximum le permet", () => {
    expect(axisTicks(40)).toEqual([10, 20, 30, 40]);
    expect(axisTicks(1043)).toEqual([261, 522, 782, 1043]);
  });
});
