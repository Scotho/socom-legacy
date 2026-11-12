import { describe, expect, it } from "vitest";
import { OPERATION_MANUAL, OPERATIONS, REFUSAL_HINTS, validateSchema } from "../src/index";

/**
 * AX-13 (plan item 13, a browser adaptation): "point at it" -- the player's focus, read by an inspect operation on each
 * surface. Additive on the wire (AX.R8): two new read-only operations, nothing else changed.
 */
describe("AX-13: forge.focus and testroom.focus", () => {
  it("are inspect reads on their own surface, never mutations", () => {
    expect(OPERATIONS["forge.focus"]).toMatchObject({ permission: "inspect", surfaces: ["forge-editor"], mutation: false });
    expect(OPERATIONS["testroom.focus"]).toMatchObject({ permission: "inspect", surfaces: ["testroom-solo"], mutation: false });
  });

  it("each has a manual entry (C1): no arguments, an example that passes, and what it answers", () => {
    for (const name of ["forge.focus", "testroom.focus"]) {
      const entry = OPERATION_MANUAL[name]!;
      expect(entry, name).toBeDefined();
      expect(() => validateSchema(entry.example, entry.args), name).not.toThrow();
      expect(() => validateSchema({ extra: 1 }, entry.args), name).toThrow();
      expect(entry.returns, name).toBeTruthy();
    }
    expect(OPERATION_MANUAL["forge.focus"]!.area).toBe("forge");
    expect(OPERATION_MANUAL["testroom.focus"]!.area).toBe("testroom");
    // What the answer holds and how to use it: the clicked point, its time, the selection (refs for one revision), the camera.
    const forge = OPERATION_MANUAL["forge.focus"]!;
    for (const word of ["point", "pointAt", "selection", "camera", "revision"]) expect(forge.returns, word).toContain(word);
    expect(forge.description).toMatch(/one revision/);
    expect(forge.description).toMatch(/click/);
    const room = OPERATION_MANUAL["testroom.focus"]!;
    for (const word of ["feet", "look", "nearest"]) expect(room.returns, word).toContain(word);
  });

  it("refuses only with codes the hints already teach", () => {
    for (const code of ["SURFACE_DENIED", "NOT_READY", "UNSUPPORTED_OPERATION", "PERMISSION_REQUIRED"]) expect(REFUSAL_HINTS[code], code).toBeTruthy();
  });
});
