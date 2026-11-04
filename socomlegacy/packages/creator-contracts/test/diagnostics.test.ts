import { describe, expect, it } from "vitest";
import {
  CHECK_REPORT_SCHEMA,
  checkReport,
  diagnostic,
  DIAGNOSTIC_SCHEMA,
  fromLocalPackDiagnostic,
  fromLocalPackError,
  fromMapCheck,
  fromMapIssue,
  isReady,
  reportStatus,
} from "../src/index.js";

describe("one diagnostics model (browser adaptation)", () => {
  it("stamps schema and version on every diagnostic", () => {
    const d = diagnostic({ source: "pack", severity: "error", code: "pack.MEMBER_MISSING", text: "x", file: "a.json" });
    expect(d).toMatchObject({ schema: DIAGNOSTIC_SCHEMA, version: 1, source: "pack", file: "a.json" });
    expect(checkReport([d])).toMatchObject({ schema: CHECK_REPORT_SCHEMA, version: 1, status: "fail" });
  });

  it("never reports skipped, blocked or incomplete as pass", () => {
    const note = diagnostic({ source: "check", severity: "note", status: "skipped", code: "map.check-skipped", text: "n" });
    const blocked = diagnostic({ source: "readiness", severity: "warning", status: "blocked", code: "x.BLOCKED", text: "b" });
    const partial = diagnostic({ source: "pack", severity: "warning", status: "incomplete", code: "x.PARTIAL", text: "p" });
    expect(reportStatus([])).toBe("pass");
    expect(reportStatus([], false)).toBe("skipped");
    expect(reportStatus([note])).toBe("incomplete");
    expect(reportStatus([partial])).toBe("incomplete");
    expect(reportStatus([note, blocked])).toBe("blocked");
    const error = diagnostic({ source: "pack", severity: "error", code: "x.BAD", text: "e" });
    expect(reportStatus([blocked, error])).toBe("fail");
    for (const report of [checkReport([note]), checkReport([blocked]), checkReport([], { ran: false }), checkReport([error])]) {
      expect(isReady(report)).toBe(false);
    }
    expect(isReady(checkReport([]))).toBe(true);
    expect(isReady(checkReport([diagnostic({ source: "pack", severity: "warning", code: "x.W", text: "w" })]))).toBe(true);
  });

  it("adapts a forge MapIssue once: namespaced code, Jump position, error severity", () => {
    const at: [number, number, number] = [1, 2, 3];
    const d = fromMapIssue({ kind: "spawn-floor", text: "Spawn 2 is off the floor.", at }, 7);
    expect(d).toMatchObject({ source: "check", severity: "error", code: "map.spawn-floor", text: "Spawn 2 is off the floor.", at: [1, 2, 3], revision: 7 });
    expect(d.at).not.toBe(at);
    expect(fromMapIssue({ kind: "budget", text: "Too many polygons.", at: null }).at).toBeUndefined();
  });

  it("adapts a MapCheck: issues fail, notes become skipped and keep the report from pass", () => {
    const failed = fromMapCheck({ issues: [{ kind: "missing", text: "m", at: null }], notes: ["reach not walked"] });
    expect(failed.status).toBe("fail");
    expect(failed.diagnostics.map((d) => [d.code, d.severity, d.status])).toEqual([
      ["map.missing", "error", undefined],
      ["map.check-skipped", "note", "skipped"],
    ]);
    expect(fromMapCheck({ issues: [], notes: ["reach not walked"] }).status).toBe("incomplete");
    expect(fromMapCheck({ issues: [], notes: [] }).status).toBe("pass");
  });

  it("adapts a LocalPackDiagnostic and a LocalPackError code", () => {
    expect(fromLocalPackDiagnostic({ code: "MODELS_SKIPPED", count: 3 })).toMatchObject({
      source: "pack",
      severity: "warning",
      status: "incomplete",
      code: "local.MODELS_SKIPPED",
      actual: "3",
    });
    expect(fromLocalPackDiagnostic({ code: "SOMETHING_NEW", count: 1 }).text).toContain("SOMETHING_NEW");
    expect(fromLocalPackError({ code: "INVALID_PATH", message: "Use a relative path." })).toMatchObject({
      source: "pack",
      severity: "error",
      code: "local.INVALID_PATH",
      text: "Use a relative path.",
    });
  });
});
