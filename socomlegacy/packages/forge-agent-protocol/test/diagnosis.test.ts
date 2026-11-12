import { describe, expect, it } from "vitest";
import {
  DIAGNOSIS_CLASSES,
  DIAGNOSIS_HINTS,
  REFUSAL_HINTS,
  parseDiagnosis,
} from "../src/index.js";

// AX-12 (a browser adaptation): the page's diagnosis of a failed connection, an additive page-to-gateway signal.
const ADDRESS = /\b\d{1,3}(\.\d{1,3}){3}\b|[0-9a-f]{1,4}(:[0-9a-f]{0,4}){3,}|candidate:|a=|sdp|token/i;
describe("AX-12: the diagnosis signal", () => {
  it("names the eight classes, each with one hint for the agent and no address in it", () => {
    expect([...DIAGNOSIS_CLASSES]).toEqual([
      "service-unreachable",
      "origin-refused",
      "service-busy",
      "route-failed",
      "version",
      "expired",
      "revoked",
      "unknown",
    ]);
    for (const c of DIAGNOSIS_CLASSES) {
      expect(typeof DIAGNOSIS_HINTS[c]).toBe("string");
      expect(DIAGNOSIS_HINTS[c]).not.toMatch(ADDRESS);
    }
    expect(Object.isFrozen(DIAGNOSIS_HINTS)).toBe(true);
    expect(typeof REFUSAL_HINTS.INVALID_DIAGNOSIS).toBe("string");
  });
  it("parses a class and, for a route, the candidate counts only", () => {
    expect(parseDiagnosis({ type: "diagnosis", class: "service-busy" })).toEqual({ class: "service-busy" });
    expect(
      parseDiagnosis({
        type: "diagnosis",
        class: "route-failed",
        local: { host: 2, srflx: 1, relay: 0 },
        remote: { host: 1, srflx: 0, relay: 0 },
      }),
    ).toEqual({
      class: "route-failed",
      local: { host: 2, srflx: 1, relay: 0 },
      remote: { host: 1, srflx: 0, relay: 0 },
    });
  });
  it.each([
    [{ type: "diagnosis" }],
    [{ type: "diagnosis", class: "down" }],
    [{ type: "diagnosis", class: "route-failed", local: { host: -1, srflx: 0, relay: 0 } }],
    [{ type: "diagnosis", class: "route-failed", local: { host: 1.5, srflx: 0, relay: 0 } }],
    [{ type: "diagnosis", class: "route-failed", local: { host: 1, srflx: 0, relay: 0, address: "192.0.2.1" } }],
    [{ type: "diagnosis", class: "route-failed", local: { host: 1, srflx: 0 } }],
    [{ type: "diagnosis", class: "route-failed", detail: "192.0.2.1" }],
    [{ type: "diagnosis", class: "unknown", local: { host: 100000, srflx: 0, relay: 0 } }],
    [null],
  ])("refuses a malformed or address-carrying diagnosis %j", (value) => {
    expect(() => parseDiagnosis(value)).toThrow("INVALID_DIAGNOSIS");
  });
});
