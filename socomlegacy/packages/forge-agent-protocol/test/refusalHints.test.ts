import { describe, expect, it } from "vitest";
import {
  LIMITS,
  REFUSAL_HINTS,
  admitRevision,
  authorizeRequest,
  parseRequest,
  teach,
  type AgentRequest,
} from "../src/index.js";

// AX-3 (C2, C3; a browser adaptation): `expectedRevision: "current"` and the refusal hints table.
const base = {
  version: 1,
  requestId: "r",
  sessionId: "s",
  targetId: "t",
  epoch: "e",
  operation: "forge.edit",
  args: {},
};
describe("expectedRevision: current (C2)", () => {
  it("parseRequest accepts the string current and nothing else non-numeric", () => {
    expect(parseRequest({ ...base, expectedRevision: "current" }).expectedRevision).toBe("current");
    expect(() => parseRequest({ ...base, expectedRevision: "latest" })).toThrow("INVALID_REVISION");
    expect(() => parseRequest({ ...base, expectedRevision: -1 })).toThrow("INVALID_REVISION");
  });
  it("authorizeRequest treats current as the capability's own revision", () => {
    const r = parseRequest({ ...base, expectedRevision: "current" });
    const c = { sessionId: "s", targetId: "t", epoch: "e", permissions: ["edit" as const], surface: "forge-editor" as const, revision: 7 };
    expect(authorizeRequest(r, c)).toBeUndefined();
    expect(authorizeRequest({ ...r, expectedRevision: 6 }, c)).toBe("REVISION_CONFLICT");
  });
  it("admitRevision resolves current to the revision given and leaves a number alone", () => {
    const r = parseRequest({ ...base, expectedRevision: "current" });
    expect(admitRevision(r, 12).expectedRevision).toBe(12);
    expect(admitRevision({ ...r, expectedRevision: 3 } as AgentRequest, 12).expectedRevision).toBe(3);
    expect(admitRevision({ ...r, expectedRevision: undefined } as AgentRequest, 12).expectedRevision).toBeUndefined();
  });
});
describe("REFUSAL_HINTS (C3)", () => {
  const parseCodes = [
    "CONTROL_TOO_LARGE",
    "RULES_TOO_LARGE",
    "INVALID_OBJECT",
    "UNSUPPORTED_VERSION",
    "INVALID_requestId",
    "INVALID_sessionId",
    "INVALID_targetId",
    "INVALID_epoch",
    "UNKNOWN_OPERATION",
    "MISSING_ARGS",
    "INVALID_REVISION",
    "REVISION_REQUIRED",
    "UNKNOWN_FIELD",
  ];
  const authorizeCodes = ["NOT_PAIRED", "STALE_EPOCH", "SURFACE_DENIED", "PERMISSION_DENIED", "REVISION_CONFLICT"];
  it.each([...parseCodes, ...authorizeCodes])("has one sentence for %s", (code) => {
    const hint = REFUSAL_HINTS[code];
    expect(typeof hint).toBe("string");
    expect(hint!.length).toBeGreaterThan(20);
    expect(hint!.length).toBeLessThan(400);
  });
  it("is frozen and names the rate from LIMITS", () => {
    expect(Object.isFrozen(REFUSAL_HINTS)).toBe(true);
    expect(REFUSAL_HINTS.RATE_LIMITED).toContain(String(LIMITS.commandsPerSecond));
    expect(REFUSAL_HINTS.RATE_LIMITED).toContain(String(LIMITS.commandBurst));
  });
  // AX-INT: the seams the wave-1 merge left -- each hint says what the code that gives it does.
  it("agrees with the page that gives each code", () => {
    // viewer agent/install.ts: a hidden tab's capture rejects CAPTURE_UNAVAILABLE, so PAGE_HIDDEN never promises one.
    expect(REFUSAL_HINTS.PAGE_HIDDEN).not.toMatch(/captures still work/);
    expect(REFUSAL_HINTS.CAPTURE_UNAVAILABLE).toMatch(/hidden/);
    // viewer agent/codes.ts (AX.R8): only an older page sends PAGE_PAUSED, and it ends the pairing.
    expect(REFUSAL_HINTS.PAGE_PAUSED).toMatch(/agent_pair/);
    // REVIEW-1 5: AX-16 gave target.capture size "small", the agent's own way out, before the player's window.
    expect(REFUSAL_HINTS.CAPTURE_TOO_LARGE).toMatch(/size: ?"small"/);
    expect(REFUSAL_HINTS.CAPTURE_TOO_LARGE).not.toMatch(/takes no size/);
    expect(REFUSAL_HINTS.CAPTURE_TOO_LARGE!.indexOf("small")).toBeLessThan(REFUSAL_HINTS.CAPTURE_TOO_LARGE!.indexOf("window"));
    // viewer forge/agent/api.ts: a full receipt store asks for a new target session.
    expect(REFUSAL_HINTS.RECEIPT_CAPACITY).toMatch(/agent_pair/);
    // viewer testroom/agent/target.ts: BUILD_LOCKED is "Stop Play before ...".
    expect(REFUSAL_HINTS.BUILD_LOCKED).toMatch(/Play/);
    // viewer agent/paging.ts: one item larger than a page is read narrower, not sent smaller.
    expect(REFUSAL_HINTS.ITEM_TOO_LARGE).toMatch(/narrower/);
    // forge-agent mcp.ts agent_capabilities {area}; the page's own codes (editorFacade, testroom target).
    for (const code of ["UNKNOWN_AREA", "EMPTY_SELECTION", "AMBIGUOUS_DESTINATION", "UNKNOWN_DESTINATION"])
      expect(REFUSAL_HINTS[code], code).toBeDefined();
  });
  // REVIEW-1 9: the page's own codes (the targets, the facade, the room) each teach their way out; the viewer's
  // agentRevisionCurrent test scans the page's sources for every emitted literal.
  it.each([
    ["MAP_ISSUES", /forge\.issues/],
    ["ABSENT_ASSET", /asset/],
    ["NO_HISTORY", /undo|redo/],
    ["NO_MAP", /map/],
    ["REQUIREMENTS_UNMET", /pack|requirement/],
    ["SAVE_REFUSED", /save/i],
    ["EMPTY_CLIPBOARD", /copy/],
    ["UNAVAILABLE", /agent_capabilities|player/],
    ["LOAD_FAILED", /map/],
    ["LOAD_TIMEOUT", /testroom\.read/],
    ["UNKNOWN_MAP", /list/],
    ["AMBIGUOUS_MAP", /data\.choices/],
    ["AMBIGUOUS_OBJECTIVE", /data|choose|one/i],
  ])("has a row for the page's %s", (code, says) => {
    expect(REFUSAL_HINTS[code], code).toMatch(says);
  });
  it("REVIEW-1 9: UNSUPPORTED_OPERATION names data.admitted; PERMISSION_DENIED is the grant's alone", () => {
    expect(REFUSAL_HINTS.UNSUPPORTED_OPERATION).toMatch(/data\.admitted/);
  });
  it("REVIEW-1 11: CONNECTION_CLOSED checks a receipt only while the same session is paired, else re-reads state", () => {
    expect(REFUSAL_HINTS.CONNECTION_CLOSED).toMatch(/request\.receipt/);
    expect(REFUSAL_HINTS.CONNECTION_CLOSED).toMatch(/same session/);
    expect(REFUSAL_HINTS.CONNECTION_CLOSED).toMatch(/read .*state|target\.status/);
  });
  it("teach fills a refusal's hint once, and the page revision for a revision refusal", () => {
    expect(teach({ requestId: "r", revision: 4, outcome: "refused", code: "REVISION_CONFLICT" })).toEqual({
      requestId: "r",
      revision: 4,
      outcome: "refused",
      code: "REVISION_CONFLICT",
      hint: REFUSAL_HINTS.REVISION_CONFLICT,
      retry: { revision: 4 },
    });
    expect(teach({ requestId: "r", revision: 4, outcome: "refused", code: "STALE_REVISION" }).retry).toEqual({ revision: 4 });
    expect(teach({ requestId: "r", revision: 0, outcome: "refused", code: "BUSY", hint: "mine" }).hint).toBe("mine");
    expect(teach({ requestId: "r", revision: 0, outcome: "ok" })).toEqual({ requestId: "r", revision: 0, outcome: "ok" });
    expect(teach({ requestId: "r", revision: 0, outcome: "unknown", code: "REQUEST_TIMEOUT" }).hint).toBe(REFUSAL_HINTS.REQUEST_TIMEOUT);
    // A code with no row still teaches something: the generic sentence.
    expect(teach({ requestId: "r", revision: 0, outcome: "refused", code: "NEVER_SEEN" }).hint).toBe(REFUSAL_HINTS.REFUSED);
  });
});
