import { describe, expect, it } from "vitest";
import { authorizeRequest, OPERATIONS, oversizeRefusal, parseRequest, type Capability } from "../src/index.js";

/**
 * FCW-32 step 3 (a browser adaptation, the Forge's own authoring instrument): the rules verbs on the wire. Discover and
 * read take inspect, check takes diagnose, export takes inspect, a pack's import takes import; every rules and entity
 * write rides `forge.edit` (edit), so a session's grant bounds what it may write -- never more.
 */

const base = { version: 1, requestId: "r", sessionId: "s", targetId: "t", epoch: "e", args: {} };
const cap = (permissions: Capability["permissions"], surface: Capability["surface"] = "forge-editor"): Capability =>
  ({ sessionId: "s", targetId: "t", epoch: "e", revision: 4, surface, permissions });

describe("FCW-32 the rules verbs", () => {
  it("names each verb's permission, surface and mutation", () => {
    expect(OPERATIONS["forge.rules"]).toMatchObject({ permission: "inspect", surfaces: ["forge-editor"], mutation: false });
    expect(OPERATIONS["forge.rules.check"]).toMatchObject({ permission: "diagnose", surfaces: ["forge-editor"], mutation: false });
    expect(OPERATIONS["forge.rules.export"]).toMatchObject({ permission: "inspect", surfaces: ["forge-editor"], mutation: false });
    expect(OPERATIONS["forge.rules.import"]).toMatchObject({ permission: "import", surfaces: ["forge-editor"], mutation: true });
    // FCW-32 round 2 (F2): the scripted run of a mode's rules on the room's rule host takes test, as forge.play does
    expect(OPERATIONS["forge.rules.test"]).toMatchObject({ permission: "test", surfaces: ["forge-editor"], mutation: false });
    const run = parseRequest({ ...base, operation: "forge.rules.test", args: { ticks: [] } });
    expect(authorizeRequest(run, cap(["inspect", "diagnose"]))).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(run, cap(["test"]))).toBeUndefined();
  });

  it("refuses a write outside the session's scope", () => {
    const check = parseRequest({ ...base, operation: "forge.rules.check" });
    const write = parseRequest({ ...base, operation: "forge.edit", expectedRevision: 4, args: { operation: "rules.set", arguments: { spec: {} } } });
    const pack = parseRequest({ ...base, operation: "forge.rules.import", expectedRevision: 4, args: { files: [] } });
    const reader = cap(["inspect", "diagnose"]);
    expect(authorizeRequest(check, reader)).toBeUndefined();
    expect(authorizeRequest(parseRequest({ ...base, operation: "forge.rules", args: { section: "spec" } }), reader)).toBeUndefined();
    expect(authorizeRequest(write, reader)).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(pack, reader)).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(pack, cap(["edit"]))).toBe("PERMISSION_DENIED");
    expect(authorizeRequest(pack, cap(["import"]))).toBeUndefined();
    expect(authorizeRequest(write, cap(["edit"], "forge-play"))).toBe("SURFACE_DENIED");
    expect(() => parseRequest({ ...base, operation: "forge.rules.import", args: { files: [] } })).toThrow("REVISION_REQUIRED");
  });
});

describe("FCW-32 round-2 re-look F3: a request past the control channel is refused by name for the rules import", () => {
  it("names RULES_TOO_LARGE for forge.rules.import and the generic CONTROL_TOO_LARGE for every other operation", () => {
    expect(oversizeRefusal("forge.rules.import")).toBe("RULES_TOO_LARGE");
    expect(oversizeRefusal("forge.edit")).toBe("CONTROL_TOO_LARGE");
    expect(oversizeRefusal(undefined)).toBe("CONTROL_TOO_LARGE");
  });
  it("states the real bound in the operation's text: the whole request, JSON-escaped", () => {
    expect(OPERATIONS["forge.rules.import"]!.description).toMatch(/whole request/);
  });
  it("parseRequest itself names it: an oversized forge.rules.import is RULES_TOO_LARGE, any other operation CONTROL_TOO_LARGE", () => {
    const big = "x".repeat(70_000);   // past LIMITS.controlBytes (64 KiB): the gateway's sessions refuse here, before any sender
    expect(() => parseRequest({ ...base, operation: "forge.rules.import", expectedRevision: 4, args: { files: [{ path: "rules.json", text: big }] } }))
      .toThrow("RULES_TOO_LARGE");
    expect(() => parseRequest({ ...base, operation: "forge.edit", expectedRevision: 4, args: { operation: "rules.set", arguments: { note: big } } }))
      .toThrow("CONTROL_TOO_LARGE");
  });
});
