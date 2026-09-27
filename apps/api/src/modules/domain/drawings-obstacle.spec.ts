import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DomainService } from "@/modules/domain/domain.service";
import { CreateDrawingDto, UpdateDrawingDto } from "@/modules/domain/dto";

// ============================================================================
// Croquis marqués « obstacle » (ADR 0039)
//
// Un croquis devient un obstacle que les itinéraires contournent : sa nature se
// pose à la création, se change, et se retire (`null`) pour redevenir un simple
// croquis. Le contrat n'accepte que les natures connues.
// ============================================================================

describe("croquis obstacles", () => {
  const d = new DomainService();

  it("la nature d'obstacle se pose, se change et se retire", () => {
    const c = d.createDrawing({ kind: "point", label: "Pont détruit", coords: [[-7.957, 31.316]], obstacle: "bridge" }, "m.zraib");
    expect(c.obstacle).toBe("bridge");
    expect(d.listDrawings().find((x) => x.id === c.id)?.obstacle).toBe("bridge");
    expect(d.updateDrawing(c.id, { obstacle: "impasse" }, "m.zraib")?.obstacle).toBe("impasse");
    const simple = d.updateDrawing(c.id, { obstacle: null }, "m.zraib");
    expect(simple).toBeDefined();
    expect("obstacle" in (simple as object)).toBe(false);
    d.deleteDrawing(c.id);
  });

  it("le contrat refuse une nature inconnue et accepte le retrait", async () => {
    const inconnue = plainToInstance(CreateDrawingDto, { kind: "point", label: "x", coords: [[0, 0]], obstacle: "char" });
    expect((await validate(inconnue)).some((e) => e.property === "obstacle")).toBe(true);
    const connue = plainToInstance(CreateDrawingDto, { kind: "polygon", label: "Zone inondée", coords: [[0, 0], [0, 1], [1, 1]], obstacle: "flooded" });
    expect(await validate(connue)).toEqual([]);
    const retrait = plainToInstance(UpdateDrawingDto, { obstacle: null });
    expect(await validate(retrait)).toEqual([]);
  });
});
