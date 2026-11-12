import { describe, expect, it } from "vitest";
import {
  FORGE_INPUT_OPERATIONS,
  FORGE_OPERATIONS,
  MANUAL_AREAS,
  OPERATION_MANUAL,
  OPERATIONS,
  TESTROOM_INNER_OPERATIONS,
  assertJsonData,
  validateSchema,
} from "../src/index";

/** AX-1 (contract C1, ruling AX.R6; a browser adaptation): the operation manual is whole, its examples pass. */
describe("OPERATION_MANUAL", () => {
  it("has exactly one entry per wire operation, with the wire's permission, surfaces and mutation", () => {
    expect(Object.keys(OPERATION_MANUAL).sort()).toEqual(Object.keys(OPERATIONS).sort());
    for (const [name, operation] of Object.entries(OPERATIONS)) {
      const entry = OPERATION_MANUAL[name]!;
      expect(entry.permission, name).toBe(operation.permission);
      expect(entry.surfaces, name).toEqual(operation.surfaces);
      expect(entry.mutation, name).toBe(operation.mutation);
      expect(MANUAL_AREAS, name).toContain(entry.area);
      expect(entry.description.length, name).toBeGreaterThan(20);
      expect(entry.summary.length, name).toBeLessThanOrEqual(64);
    }
  });

  it("validates every example, wire and nested, against its own schema", () => {
    const failures: string[] = [];
    for (const [name, entry] of Object.entries(OPERATION_MANUAL)) {
      try { assertJsonData(entry.example); validateSchema(entry.example, entry.args); }
      catch (e) { failures.push(`${name}: ${String(e)}`); }
      for (const [inner, nested] of Object.entries(entry.nested ?? {})) {
        try { assertJsonData(nested.example); validateSchema(nested.example, nested.args); }
        catch (e) { failures.push(`${name} > ${inner}: ${String(e)}`); }
        expect(nested.description.length, inner).toBeGreaterThan(5);
      }
    }
    expect(failures).toEqual([]);
  });

  it("validates each wrapper's example as its nested operation's call", () => {
    for (const name of ["forge.edit", "forge.input", "testroom.input", "testroom.settings"]) {
      const entry = OPERATION_MANUAL[name]!;
      const example = entry.example as { operation: string; arguments: unknown };
      const nested = entry.nested?.[example.operation];
      expect(nested, name).toBeDefined();
      expect(() => validateSchema(example.arguments, nested!.args), name).not.toThrow();
    }
  });

  it("nests every edit-permission Forge operation under forge.edit and the input lanes under forge.input", () => {
    const edits = FORGE_OPERATIONS.filter((o) => o.permission === "edit").map((o) => o.name).sort();
    expect(Object.keys(OPERATION_MANUAL["forge.edit"]!.nested ?? {}).sort()).toEqual(edits);
    expect(Object.keys(OPERATION_MANUAL["forge.input"]!.nested ?? {}).sort()).toEqual([...FORGE_INPUT_OPERATIONS].sort());
    for (const def of FORGE_OPERATIONS) {
      const nested = OPERATION_MANUAL["forge.edit"]!.nested?.[def.name] ?? OPERATION_MANUAL["forge.input"]!.nested?.[def.name];
      // One schema: the nested entry holds the page's own schema object, not a copy.
      if (nested) expect(nested.args, def.name).toBe(def.inputSchema);
    }
  });

  it("nests the test room's inner operations under the wire operations that reach them", () => {
    const reached = new Set<string>();
    for (const entry of Object.values(OPERATION_MANUAL))
      if (entry.surfaces.includes("testroom-solo")) for (const inner of Object.keys(entry.nested ?? {})) reached.add(inner);
    for (const entry of Object.values(OPERATION_MANUAL))
      if (entry.surfaces.includes("testroom-solo")) for (const inner of entry.runs ?? []) reached.add(inner);
    expect([...reached].filter((n) => !Object.hasOwn(TESTROOM_INNER_OPERATIONS, n))).toEqual([]);
    expect(Object.keys(TESTROOM_INNER_OPERATIONS).filter((n) => !reached.has(n))).toEqual([]);
  });

  it("says where it takes placement refs that refs live for one revision", () => {
    // A placement ref (`piece:0`, `spawn:1`, from forge.read section refs) is renumbered by edits; placement.check's `ref`
    // is an asset ref from forge.assets and piece.hide's `keys` are base placement keys, neither revision-scoped.
    const takesRefs = (name: string, args: { properties?: Record<string, unknown> }): boolean =>
      Object.hasOwn(args.properties ?? {}, "refs") || ["camera.focus", "placement.set"].includes(name);
    for (const [name, entry] of Object.entries(OPERATION_MANUAL))
      for (const [inner, nested] of Object.entries(entry.nested ?? {}))
        if (takesRefs(inner, nested.args)) expect(nested.description, `${name} > ${inner}`).toMatch(/one revision/);
    expect(OPERATION_MANUAL["forge.edit"]!.description).toMatch(/one revision/);
    expect(OPERATION_MANUAL["forge.read"]!.description).toMatch(/one revision/);
  });
});

describe("validateSchema", () => {
  const schema = FORGE_OPERATIONS.find((o) => o.name === "piece.move")!.inputSchema;
  it("accepts a call within its schema and refuses an unknown field, a missing field and a short point", () => {
    expect(() => validateSchema({ refs: ["piece:0"], delta: [1, 0, 0] }, schema)).not.toThrow();
    expect(() => validateSchema({ refs: ["piece:0"], delta: [1, 0, 0], extra: 1 }, schema)).toThrow(/unknown/);
    expect(() => validateSchema({ refs: ["piece:0"] }, schema)).toThrow(/required/);
    expect(() => validateSchema({ refs: ["piece:0"], delta: [1, 0] }, schema)).toThrow(/bounded array/);
  });
  it("holds a string's minLength (the test room's own schemas carry one)", () => {
    expect(() => validateSchema("", { type: "string", minLength: 1 })).toThrow(/bounded string/);
  });
});

/** REVIEW-1 10, 11, 14: what the manual says agrees with the code it describes. */
describe("REVIEW-1: the manual agrees with the code", () => {
  it("10: a nested entry's permission is its wrapping wire operation's (the grant the gateway checks)", () => {
    for (const [name, entry] of Object.entries(OPERATION_MANUAL))
      for (const [inner, nested] of Object.entries(entry.nested ?? {}))
        expect(nested.permission, `${name} ${inner}`).toBe(OPERATIONS[name]!.permission);
    expect(OPERATION_MANUAL["testroom.settings"]!.nested!["camera.set"]!.permission).toBe("edit");
  });
  it("10: camera.pose and camera.set take degrees (viewer camera.ts Pose): their examples and descriptions say so", () => {
    const pose = OPERATION_MANUAL["forge.edit"]!.nested!["camera.pose"]!;
    const set = OPERATION_MANUAL["testroom.settings"]!.nested!["camera.set"]!;
    for (const [name, entry] of [["camera.pose", pose], ["camera.set", set]] as const) {
      const example = entry.example as { pitch: number };
      expect(Math.abs(example.pitch), name).toBeGreaterThanOrEqual(10);
      expect(Math.abs(example.pitch), name).toBeLessThanOrEqual(89);
      expect(entry.description, name).toMatch(/degrees/);
    }
    expect(OPERATION_MANUAL["testroom.focus"]!.description).toMatch(/degrees/);
    expect(OPERATION_MANUAL["testroom.focus"]!.description).not.toMatch(/radians/);
  });
  it("11: piece.place takes a forge.assets row's asset field, not its ref", () => {
    expect(OPERATION_MANUAL["forge.edit"]!.nested!["piece.place"]!.description).toMatch(/asset field, not its ref/);
  });
  it("14: target.capture says its presets move the camera and put it back, and end a running shot, under capture alone", () => {
    const text = OPERATION_MANUAL["target.capture"]!.description;
    expect(text).toMatch(/moves? the camera/);
    expect(text).toMatch(/puts? it back/);
    expect(text).toMatch(/running camera shot ends/);
    expect(text).toMatch(/capture permission alone/);
  });
});
