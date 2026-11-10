import { describe, expect, it } from "vitest";
import {
  FORGE_OPERATIONS,
  FORGE_PROBE_EXAMPLES,
  FORGE_PROBE_LIMITS,
  OPERATION_MANUAL,
  OPERATIONS,
  REFUSAL_HINTS,
  assertJsonData,
  validateSchema,
} from "../src/index";

/**
 * AX-17 (plan item 17; a browser adaptation, product track): `forge.probe`, the read-only spatial diagnostic -- its wire
 * operation, the page operation it runs, its manual entry with one example per kind, its bounds and its refusal's hint.
 */
describe("forge.probe in the protocol", () => {
  it("is a read-only diagnose operation of the Forge editor", () => {
    expect(OPERATIONS["forge.probe"]).toMatchObject({ permission: "diagnose", surfaces: ["forge-editor"], mutation: false });
    expect(OPERATIONS["forge.probe"]!.description).toMatch(/never certif/);
    const page = FORGE_OPERATIONS.find((o) => o.name === "world.probe");
    expect(page).toMatchObject({ permission: "diagnose", mutates: false });
  });

  it("has a manual entry that runs world.probe and passes an example of each kind", () => {
    const entry = OPERATION_MANUAL["forge.probe"]!;
    expect(entry.area).toBe("forge");
    expect(entry.runs).toEqual(["world.probe"]);
    expect(entry.description).toMatch(/never certif/);
    expect(entry.description).toMatch(/partial/);
    const kinds = [entry.example, ...(entry.examples ?? [])].map((e) => (e as { kind: string }).kind).sort();
    expect(kinds).toEqual(["free", "ground", "ray"]);
    for (const example of [entry.example, ...(entry.examples ?? [])]) {
      assertJsonData(example);
      expect(() => validateSchema(example, entry.args)).not.toThrow();
    }
    expect(Object.keys(FORGE_PROBE_EXAMPLES).sort()).toEqual(["free", "ground", "ray"]);
  });

  it("publishes its bounds and refuses an unknown kind by schema", () => {
    const args = OPERATION_MANUAL["forge.probe"]!.args;
    expect(() => validateSchema({ kind: "volume" }, args)).toThrow(/allowed/);
    expect(() => validateSchema({ kind: "free", near: [0, 0, 0], radius: 10, limit: FORGE_PROBE_LIMITS.candidates + 1 }, args)).toThrow();
    expect(FORGE_PROBE_LIMITS.radius).toBeGreaterThan(0);
    expect(FORGE_PROBE_LIMITS.samples).toBeGreaterThan(0);
    expect(FORGE_PROBE_LIMITS.budgetMs).toBeGreaterThan(0);
    expect(OPERATION_MANUAL["forge.probe"]!.description).toContain(String(FORGE_PROBE_LIMITS.radius));
  });

  it("teaches its refusals", () => {
    expect(REFUSAL_HINTS.PROBE_TOO_LARGE).toContain(String(FORGE_PROBE_LIMITS.radius));
    expect(REFUSAL_HINTS.NO_GROUND).toMatch(/hull|ground/);
  });
});
