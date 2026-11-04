/**
 * FCW-11 synthetic unit tests, against source design e8195c840.
 * These unit cases exercise pure reporting; runtime and map evidence remain separate acceptance work.
 * These invented fixture requirements exercise reporting only; they certify no map, actor or gameplay profile.
 */
import { describe, expect, it } from "vitest";
import {
  CHECK_REPORT_SCHEMA, diagnostic, fromMapCheck,
  type CheckReport, type CheckStatus, type Diagnostic, type EvidenceKind,
} from "../src/diagnostics.js";
import {
  createExperienceRequirementRegistry,
  type CapabilityRequirement, type ExperienceRequirement, type MapReadinessInput,
  type ReadinessCapability, type ReadinessObservation,
} from "../src/readiness.js";

const SNAPSHOT = "synthetic-generation-4";
const ALL: readonly ReadinessCapability[] = [
  "render", "collision", "spawn", "reachability", "navigation", "objective", "actor",
];
const requirement = (capability: ReadinessCapability): CapabilityRequirement => ({
  id: `fixture.${capability}`, label: `Synthetic ${capability} check`, capability,
});
const profile = (capabilities: readonly ReadinessCapability[] = ALL): ExperienceRequirement => ({
  id: "fixture.experience", label: "Synthetic reporting fixture", requires: capabilities.map(requirement),
});
function report(
  status: CheckStatus = "pass",
  options: { revision?: number | string; diagnostics?: readonly Diagnostic[]; evidence?: EvidenceKind } = {},
): CheckReport {
  return {
    schema: CHECK_REPORT_SCHEMA, version: 1, status, diagnostics: [], evidence: "validation", revision: SNAPSHOT,
    ...options,
  };
}
const observation = (capability: ReadinessCapability, result: CheckReport = report()): ReadinessObservation => ({
  requirementId: `fixture.${capability}`, report: result,
});
function input(observations: readonly ReadinessObservation[], baseCheck?: CheckReport): MapReadinessInput {
  return { mapId: "synthetic-map", revision: SNAPSHOT, observations, ...(baseCheck ? { baseCheck } : {}) };
}
function registered(capabilities: readonly ReadinessCapability[] = ALL) {
  const registry = createExperienceRequirementRegistry();
  registry.register(profile(capabilities));
  return registry;
}
function blockedFinding(result: CheckReport, field?: string): Diagnostic {
  expect(result.status).toBe("blocked");
  const found = result.diagnostics.find((d) => d.source === "readiness" && d.status === "blocked"
    && (field === undefined || d.field === field));
  expect(found, "a blocked result needs an actionable readiness finding").toBeDefined();
  expect(found?.code).toMatch(/^readiness\./);
  expect(found?.text.length).toBeGreaterThan(0);
  return found!;
}

describe("FCW-11 declared requirements (synthetic unit cases)", () => {
  it("passes only the explicitly satisfied selected requirements", () => {
    const result = registered().mapReadiness(input(ALL.map((capability) => observation(capability))), "fixture.experience");
    expect(result).toMatchObject({ schema: "s2u.creator/check-report", version: 1, status: "pass", revision: SNAPSHOT });
    expect(result.diagnostics.every((d) => d.severity !== "error" && (!d.status || d.status === "pass"))).toBe(true);
  });

  it.each(ALL)("blocks an unobserved required %s capability independently", (missing) => {
    const observations = ALL.filter((c) => c !== missing).map((c) => observation(c));
    const finding = blockedFinding(registered().mapReadiness(input(observations), "fixture.experience"));
    expect(finding.field).toContain(`fixture.${missing}`);
    expect(finding.revision).toBe(SNAPSHOT);
  });

  it("does not infer collision or navigation from a render observation", () => {
    const result = registered(["render", "collision", "navigation"])
      .mapReadiness(input([observation("render")]), "fixture.experience");
    expect(result.status).toBe("blocked");
    expect(result.diagnostics.some((d) => d.field?.includes("fixture.collision"))).toBe(true);
    expect(result.diagnostics.some((d) => d.field?.includes("fixture.navigation"))).toBe(true);
  });

  it("does not turn an unrelated passing observation into the missing required observation", () => {
    blockedFinding(registered(["actor"]).mapReadiness(input([observation("render")]), "fixture.experience"));
  });

  it("does not impose unrelated capabilities on the chosen profile", () => {
    const result = registered(["render"]).mapReadiness(input([
      observation("render"), observation("navigation", report("fail")),
    ]), "fixture.experience");
    expect(result.status).toBe("pass");
  });

  it("keeps separate declared checks even when they share a capability", () => {
    const registry = createExperienceRequirementRegistry();
    registry.register({ id: "fixture.roles", label: "Two synthetic objective checks", requires: [
      { id: "fixture.objective-a", label: "Synthetic role A", capability: "objective" },
      { id: "fixture.objective-b", label: "Synthetic role B", capability: "objective" },
    ] });
    const first = { requirementId: "fixture.objective-a", report: report() };
    blockedFinding(registry.mapReadiness(input([first]), "fixture.roles"));
    const second = { requirementId: "fixture.objective-b", report: report() };
    expect(registry.mapReadiness(input([first, second]), "fixture.roles").status).toBe("pass");
  });

  it("blocks an unknown experience instead of falling back to a permissive profile", () => {
    blockedFinding(registered().mapReadiness(input(ALL.map((c) => observation(c))), "fixture.absent"));
  });

  it("refuses duplicate observations instead of selecting the convenient result", () => {
    const observations = [observation("collision"), observation("collision")];
    const result = registered(["collision"]).mapReadiness(input(observations), "fixture.experience");
    blockedFinding(result, "requires.fixture.collision");
  });

  it("an empty passing base map check cannot stand in for an actor observation", () => {
    const baseCheck = fromMapCheck({ issues: [], notes: [] }, SNAPSHOT);
    blockedFinding(registered(["actor"]).mapReadiness(input([], baseCheck), "fixture.experience"));
  });

  it("an absent optional base check adds no independent requirement", () => {
    expect(registered(["render"]).mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
  });
});

describe("required report status and evidence", () => {
  it.each([
    ["fail", "fail"], ["blocked", "blocked"], ["skipped", "incomplete"], ["incomplete", "incomplete"],
  ] as const)("keeps an empty required %s report non-ready as %s", (status, expected) => {
    const result = registered(["collision"])
      .mapReadiness(input([observation("collision", report(status))]), "fixture.experience");
    expect(result.status).toBe(expected);
    expect(result.diagnostics.some((d) => d.source === "readiness" && d.field?.includes("fixture.collision")
      && d.status === status)).toBe(true);
  });

  it.each([
    ["error", undefined, "fail"], ["warning", "blocked", "blocked"],
    ["note", "skipped", "incomplete"], ["warning", "incomplete", "incomplete"],
  ] as const)("reconciles claimed pass with %s/%s diagnostics", (severity, status, expected) => {
    const finding = diagnostic({ source: "check", code: "fixture.CONTRADICTION", text: "Synthetic finding", severity, status });
    const result = registered(["render"])
      .mapReadiness(input([observation("render", report("pass", { diagnostics: [finding] }))]), "fixture.experience");
    expect(result.status).toBe(expected);
  });

  it("reports the reconciled failure on the requirement outcome row", () => {
    const finding = diagnostic({ source: "check", severity: "error", code: "fixture.CURRENT_FAILURE",
      text: "Synthetic current failure", revision: SNAPSHOT });
    const result = registered(["render"]).mapReadiness(input([
      observation("render", report("pass", { diagnostics: [finding] })),
    ]), "fixture.experience");
    expect(result.status).toBe("fail");
    expect(result.diagnostics.find((d) => d.source === "readiness" && d.code === "readiness.OBSERVED"
      && d.field === "requires.fixture.render")).toMatchObject({ status: "fail", revision: SNAPSHOT });
    expect(result.diagnostics).toContainEqual(finding);
  });

  it("a current observed failure outranks a blocked requirement", () => {
    const result = registered(["render", "collision"]).mapReadiness(input([
      observation("render", report("fail")), observation("collision", report("blocked")),
    ]), "fixture.experience");
    expect(result.status).toBe("fail");
  });

  it("preserves a benign warning without turning it into failure", () => {
    const warning = diagnostic({ source: "check", severity: "warning", code: "fixture.NOTE", text: "Synthetic nonblocking warning" });
    const result = registered(["render"])
      .mapReadiness(input([observation("render", report("pass", { diagnostics: [warning] }))]), "fixture.experience");
    expect(result.status).toBe("pass");
    expect(result.diagnostics).toContainEqual(warning);
  });

  it("includes the existing MapCheck adaptation exactly once", () => {
    const baseCheck = fromMapCheck({
      issues: [{ kind: "spawn-floor", text: "Synthetic off-floor spawn", at: [1, 2, 3] }], notes: [],
    }, SNAPSHOT);
    const result = registered(["render"]).mapReadiness(input([observation("render")], baseCheck), "fixture.experience");
    expect(result.status).toBe("fail");
    expect(result.diagnostics.filter((d) => d.code === "map.spawn-floor")).toEqual([
      expect.objectContaining({ source: "check", at: [1, 2, 3], revision: SNAPSHOT }),
    ]);
  });

  it("retains a skipped bounded map reach check instead of reporting full readiness", () => {
    const baseCheck = fromMapCheck({ issues: [], notes: ["Synthetic reach check did not run"] }, SNAPSHOT);
    const result = registered(["render"]).mapReadiness(input([observation("render")], baseCheck), "fixture.experience");
    expect(result.status).toBe("incomplete");
    expect(result.diagnostics.filter((d) => d.code === "map.check-skipped")).toHaveLength(1);
  });

  it.each([
    ["blocked", "blocked"], ["skipped", "incomplete"], ["incomplete", "incomplete"], ["fail", "fail"],
  ] as const)("retains an empty base report's %s status", (status, expected) => {
    const result = registered(["render"])
      .mapReadiness(input([observation("render")], report(status)), "fixture.experience");
    expect(result.status).toBe(expected);
  });

  it("preserves provenance and stable authored IDs in current findings", () => {
    const finding = diagnostic({
      source: "placement", severity: "warning", code: "fixture.TRUNCATED", status: "incomplete",
      text: "Synthetic inspection stopped", id: "authored-prop-7", at: [1, 2, 3], file: "fixture.json",
      field: "placements[0]", expected: "complete inspection", actual: "partial", hint: "Supply the remaining observations",
      evidence: "unit-test", reference: "synthetic-fixture", revision: SNAPSHOT,
    });
    const result = registered(["collision"]).mapReadiness(input([
      observation("collision", report("incomplete", { diagnostics: [finding], evidence: "unit-test" })),
    ]), "fixture.experience");
    expect(result.status).toBe("incomplete");
    expect(result.diagnostics).toContainEqual(finding);
    expect(result.diagnostics.filter((d) => d.code === "fixture.TRUNCATED")).toHaveLength(1);
    expect(result.diagnostics.some((d) => d.evidence === "rendered-browser-run"
      || d.evidence === "physical-playtest" || d.evidence === "capture-comparison")).toBe(false);
  });

  it("keeps mixed synthetic evidence on rows without inventing aggregate evidence", () => {
    const result = registered(["render", "collision"]).mapReadiness(input([
      observation("render", report("pass", { evidence: "validation" })),
      observation("collision", report("pass", { evidence: "unit-test" })),
    ]), "fixture.experience");
    expect(result.status).toBe("pass");
    expect(result.evidence).toBeUndefined();
    expect(result.diagnostics.some((d) => d.field?.includes("fixture.render") && d.evidence === "validation")).toBe(true);
    expect(result.diagnostics.some((d) => d.field?.includes("fixture.collision") && d.evidence === "unit-test")).toBe(true);
  });
});

describe("admitted snapshot freshness", () => {
  it.each([0, 4, "0", SNAPSHOT] as const)("accepts the exact admitted snapshot %s", (revision) => {
    const current = { ...input([observation("render", report("pass", { revision }))]), revision };
    const result = registered(["render"]).mapReadiness(current, "fixture.experience");
    expect(result.status).toBe("pass");
    expect(result.revision).toBe(revision);
  });

  it.each([undefined, null, "", -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, true])(
    "blocks an absent or invalid input snapshot %s", (revision) => {
      const current = { ...input([observation("render")]), revision } as unknown as MapReadinessInput;
      blockedFinding(registered(["render"]).mapReadiness(current, "fixture.experience"));
    },
  );

  it.each([undefined, "older-generation", 4])("does not inherit the input stamp for observation revision %s", (revision) => {
    const current = input([observation("render", report("pass", { revision }))]);
    const finding = blockedFinding(registered(["render"]).mapReadiness(current, "fixture.experience"));
    expect(finding.field).toContain("fixture.render");
    expect(finding.expected).toBe(SNAPSHOT);
    expect(finding.actual).toBeDefined();
    expect(finding.revision).toBe(SNAPSHOT);
  });

  it("does not coerce a string snapshot into the numeric snapshot", () => {
    const current = { ...input([observation("render", report("pass", { revision: "0" }))]), revision: 0 };
    blockedFinding(registered(["render"]).mapReadiness(current, "fixture.experience"));
  });

  it.each([undefined, "older-generation"])("blocks an unstamped or stale base check (%s)", (revision) => {
    const finding = blockedFinding(registered(["render"])
      .mapReadiness(input([observation("render")], report("pass", { revision })), "fixture.experience"));
    expect(finding.field).toContain("baseCheck");
    expect(finding.expected).toBe(SNAPSHOT);
    expect(finding.actual).toBeDefined();
  });

  it("keeps stale failures historical instead of making them current failures", () => {
    const historical = diagnostic({ source: "check", severity: "error", code: "fixture.OLD_FAILURE",
      text: "Historical synthetic collision failure", id: "old-entity", revision: "older-generation" });
    const stale = report("fail", { revision: "older-generation", diagnostics: [historical] });
    const result = registered(["collision"]).mapReadiness(input([observation("collision", stale)]), "fixture.experience");
    blockedFinding(result);
    expect(result.diagnostics.some((d) => d.code === "fixture.OLD_FAILURE" || d.id === "old-entity")).toBe(false);
    expect(stale.diagnostics).toEqual([historical]);
  });

  it("does not promote stale base findings to current map findings", () => {
    const stale = fromMapCheck({ issues: [{ kind: "missing", text: "Historical missing prop", at: null }], notes: [] }, "old");
    const result = registered(["render"]).mapReadiness(input([observation("render")], stale), "fixture.experience");
    blockedFinding(result);
    expect(result.diagnostics.some((d) => d.code === "map.missing")).toBe(false);
  });
});

describe("experience registration owns declaration lifetime only", () => {
  it("uses explicitly registered declarations and removes them on disposal", () => {
    const registry = createExperienceRequirementRegistry();
    const dispose = registry.register(profile(["render"]));
    expect(registry.ids()).toEqual(["fixture.experience"]);
    expect(registry.get("fixture.experience")).toEqual(profile(["render"]));
    expect(registry.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
    dispose();
    expect(registry.get("fixture.experience")).toBeUndefined();
    blockedFinding(registry.mapReadiness(input([observation("render")]), "fixture.experience"));
  });

  it.each([
    { name: "empty profile ID", spec: { ...profile(["render"]), id: "" } },
    { name: "empty requirements", spec: { ...profile(), requires: [] } },
    { name: "duplicate requirement IDs", spec: { ...profile(), requires: [requirement("render"), requirement("render")] } },
    { name: "unknown capability", spec: { ...profile(), requires: [{ id: "fixture.unknown", label: "Unknown", capability: "not-declared" }] } },
  ])("rejects $name without disturbing an existing declaration", ({ spec }) => {
    const registry = registered(["render"]);
    const invalid = { ...spec, id: spec.id ? "fixture.invalid" : spec.id } as unknown as ExperienceRequirement;
    expect(() => registry.register(invalid)).toThrow();
    expect(registry.ids()).toEqual(["fixture.experience"]);
    expect(registry.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
  });

  it("rejects a duplicate profile ID instead of replacing its requirements", () => {
    const registry = registered(["render"]);
    expect(() => registry.register(profile(["actor"]))).toThrow();
    expect(registry.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
  });

  it("an idempotent old disposer cannot remove a later registration", () => {
    const registry = createExperienceRequirementRegistry();
    const disposeOld = registry.register(profile(["render"]));
    disposeOld();
    registry.register(profile(["collision"]));
    disposeOld();
    disposeOld();
    expect(registry.mapReadiness(input([observation("collision")]), "fixture.experience").status).toBe("pass");
    blockedFinding(registry.mapReadiness(input([observation("render")]), "fixture.experience"));
  });

  it("registries do not share declarations", () => {
    const first = registered(["render"]), second = createExperienceRequirementRegistry();
    expect(first.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
    expect(second.ids()).toEqual([]);
    blockedFinding(second.mapReadiness(input([observation("render")]), "fixture.experience"));
  });

  it("snapshots the registered declaration instead of retaining caller mutation", () => {
    const declared = { id: "fixture.experience", label: "Original", requires: [{ id: "fixture.render", label: "Render", capability: "render" as ReadinessCapability }] };
    const registry = createExperienceRequirementRegistry();
    registry.register(declared);
    declared.id = "fixture.changed";
    declared.requires[0]!.id = "fixture.actor";
    declared.requires[0]!.capability = "actor";
    declared.requires.length = 0;
    expect(registry.ids()).toEqual(["fixture.experience"]);
    expect(registry.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
  });

  it("inspection results cannot mutate the declaration used by checking", () => {
    const registry = registered(["render"]);
    const declared = registry.get("fixture.experience");
    expect(declared).toBeDefined();
    if (!declared) return;
    const returnedRequirement = declared.requires[0];
    expect(returnedRequirement).toBeDefined();
    if (!returnedRequirement) return;
    try { (returnedRequirement as { id: string }).id = "fixture.actor"; } catch { /* A frozen object is also valid. */ }
    try { (returnedRequirement as { capability: ReadinessCapability }).capability = "actor"; } catch { /* A frozen object is also valid. */ }
    try { (declared.requires as CapabilityRequirement[]).length = 0; } catch { /* A frozen snapshot is also valid. */ }
    try { (registry.ids() as string[]).length = 0; } catch { /* A frozen ID list is also valid. */ }
    expect(registry.ids()).toEqual(["fixture.experience"]);
    expect(registry.get("fixture.experience")?.requires).toEqual([
      expect.objectContaining({ id: "fixture.render", capability: "render" }),
    ]);
    blockedFinding(registry.mapReadiness(input([]), "fixture.experience"));
    blockedFinding(registry.mapReadiness(input([observation("actor")]), "fixture.experience"));
    expect(registry.mapReadiness(input([observation("render")]), "fixture.experience").status).toBe("pass");
  });

  it("does not mutate inputs or retain observation objects between checks", () => {
    const finding = diagnostic({ source: "check", severity: "warning", code: "fixture.CURRENT", text: "Synthetic current finding",
      at: [1, 2, 3], evidence: "unit-test", revision: SNAPSHOT });
    const observed = report("pass", { diagnostics: [finding], evidence: "unit-test" });
    const current = input([observation("render", observed)]);
    const before = JSON.stringify(current), registry = registered(["render"]);
    const first = registry.mapReadiness(current, "fixture.experience");
    expect(first.status).toBe("pass");
    expect(JSON.stringify(current)).toBe(before);
    (finding.at as unknown as number[])[0] = 99;
    expect(first.diagnostics.find((d) => d.code === "fixture.CURRENT")?.at).toEqual([1, 2, 3]);
    const next = registry.mapReadiness(input([]), "fixture.experience");
    blockedFinding(next);
    expect(next.diagnostics.some((d) => d.code === "fixture.CURRENT")).toBe(false);
  });
});

describe("large admitted adapter reports", () => {
  it("returns all current diagnostics without an engine argument-count ceiling", () => {
    // Synthetic reporting volume, not map/rendered evidence or a new admission bound.
    // A variadic append of these rows throws before returning any CheckReport.
    const count = 150_000;
    const diagnostics = Array.from({ length: count }, (_, index) => diagnostic({
      source: "check", severity: "note", code: "fixture.LARGE_REPORT", text: "Synthetic adapter finding",
      id: `synthetic-entity-${index}`, field: `synthetic[${index}]`, at: [1, 2, 3],
      evidence: "unit-test", reference: "synthetic-volume-fixture", revision: SNAPSHOT,
    }));
    const registry = registered(["render"]);
    let result: CheckReport | undefined;
    expect(() => {
      result = registry.mapReadiness(input([
        observation("render", report("pass", { diagnostics, evidence: "unit-test" })),
      ]), "fixture.experience");
    }).not.toThrow();
    expect(result).toBeDefined();
    if (!result) throw new Error("The admitted report was not returned.");
    expect(result.status).toBe("pass");
    expect(result.revision).toBe(SNAPSHOT);
    expect(result.diagnostics).toHaveLength(count + 1); // One requirement outcome plus every adapter row.
    expect(result.diagnostics[1]).toEqual(diagnostics[0]);
    expect(result.diagnostics[count]).toEqual(diagnostics[count - 1]);
    expect(result.diagnostics[count]).toMatchObject({
      source: "check", id: "synthetic-entity-149999", field: "synthetic[149999]", at: [1, 2, 3],
      evidence: "unit-test", reference: "synthetic-volume-fixture", revision: SNAPSHOT,
    });
    expect(result.diagnostics[count]).not.toBe(diagnostics[count - 1]);
    expect(diagnostics).toHaveLength(count);
  });
});
