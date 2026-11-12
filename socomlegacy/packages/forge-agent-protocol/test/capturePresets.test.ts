import { describe, expect, it } from "vitest";
import {
  CAPTURE_ARGS_SCHEMA,
  CAPTURE_VIEWS,
  OPERATION_MANUAL,
  parseCaptureArgs,
  validateSchema,
} from "../src/index";

/** AX-16 (plan item 16; a browser adaptation): target.capture's presets on the wire and in the manual (C1). */
describe("target.capture presets", () => {
  it("keeps {} the capture it always was (view current, the canvas's own size)", () => {
    expect(parseCaptureArgs({})).toEqual({ view: "current" });
  });

  it("parses each view with its own fields", () => {
    expect(parseCaptureArgs({ view: "top", size: "small" })).toEqual({ view: "top", size: "small" });
    expect(parseCaptureArgs({ view: "refs", refs: ["piece:0", "spawn:1"] })).toEqual({ view: "refs", refs: ["piece:0", "spawn:1"] });
    expect(parseCaptureArgs({ view: "named", name: "view:0" })).toEqual({ view: "named", name: "view:0" });
  });

  it.each([
    [{ view: "side" }],
    [{ view: "refs" }],
    [{ view: "refs", refs: [] }],
    [{ view: "refs", refs: ["piece:0", "piece:0"] }],
    [{ view: "top", refs: ["piece:0"] }],
    [{ view: "named" }],
    [{ view: "current", name: "view:0" }],
    [{ size: "large" }],
    [{ zoom: 2 }],
    [null],
  ])("refuses %j INVALID_ARGUMENT with a hint", (args) => {
    let caught: unknown;
    try { parseCaptureArgs(args); } catch (error) { caught = error; }
    expect(caught).toMatchObject({ code: "INVALID_ARGUMENT" });
    expect((caught as { hint: string }).hint).toMatch(/view/);
  });

  it("publishes the schema the page holds, with an example per view (the manual drift)", () => {
    const entry = OPERATION_MANUAL["target.capture"]!;
    expect(entry.args).toBe(CAPTURE_ARGS_SCHEMA);
    expect(Object.keys(entry.args.properties ?? {}).sort()).toEqual(["name", "refs", "size", "view"]);
    expect(() => parseCaptureArgs(entry.example)).not.toThrow();
    for (const view of CAPTURE_VIEWS) expect(entry.description, view).toContain(`"${view}"`);
    const examples = entry.examples ?? [];
    expect(examples.map((e) => (e as { view?: string }).view ?? "current").sort()).toEqual([...CAPTURE_VIEWS].sort());
    for (const example of examples) { expect(() => validateSchema(example, entry.args)).not.toThrow(); expect(() => parseCaptureArgs(example)).not.toThrow(); }
    expect(entry.description).toMatch(/one revision/);
    expect(entry.description).toMatch(/restor/);
  });
});
