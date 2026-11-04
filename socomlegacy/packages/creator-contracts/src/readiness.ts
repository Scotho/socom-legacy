/**
 * FCW-11 declared map requirements, a browser adaptation with no original; design e8195c840.
 * This pure registry aggregates already-admitted reports. It neither runs checks nor grants permission to Play.
 * Trusted callers own map identity and evidence admission; nothing here discovers engine capabilities.
 */
import { checkReport, diagnostic, reportStatus, type CheckReport, type Diagnostic } from "./diagnostics.js";

export type ReadinessCapability =
  | "render" | "collision" | "spawn" | "reachability" | "navigation" | "objective" | "actor";

/** A declared check ID, never an authored entity ID or a revision-bound catalogue reference. */
export interface CapabilityRequirement {
  readonly id: string;
  readonly label: string;
  readonly capability: ReadinessCapability;
}

/** Trusted adapters declare role/count rules; the pure checker does not invent gameplay requirements. */
export interface ExperienceRequirement {
  readonly id: string;
  readonly label: string;
  readonly requires: readonly CapabilityRequirement[];
}

/** A trusted adapter binds this report to the named map and its admitted snapshot before calling the checker. */
export interface ReadinessObservation {
  readonly requirementId: string;
  readonly report: CheckReport;
}

export interface MapReadinessInput {
  /** Opaque label supplied by the trusted adapter; not authentication of external reports. */
  readonly mapId: string;
  /** A nonempty string or nonnegative safe integer; exact equality is required on admitted reports. */
  readonly revision: number | string;
  readonly observations: readonly ReadinessObservation[];
  /** Existing MapCheck adapted once; optional, but when supplied it must have the same revision. */
  readonly baseCheck?: CheckReport;
}

export interface ExperienceRequirementRegistry {
  register(spec: ExperienceRequirement): () => void;
  get(id: string): ExperienceRequirement | undefined;
  ids(): readonly string[];
  mapReadiness(input: MapReadinessInput, experienceId: string): CheckReport;
}

const CAPABILITIES: ReadonlySet<string> = new Set([
  "render", "collision", "spawn", "reachability", "navigation", "objective", "actor",
]);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validRevision = (value: unknown): value is string | number => nonempty(value)
  || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);

function copyDeclaration(spec: ExperienceRequirement): ExperienceRequirement {
  return { id: spec.id, label: spec.label, requires: spec.requires.map((r) => ({
    id: r.id, label: r.label, capability: r.capability,
  })) };
}

function declarationSnapshot(spec: ExperienceRequirement): ExperienceRequirement {
  if (!spec || !nonempty(spec.id) || !nonempty(spec.label)
    || !Array.isArray(spec.requires) || !spec.requires.length) {
    throw new Error("Readiness declarations need an ID, label and nonempty requirements.");
  }
  const ids = new Set<string>();
  for (const requirement of spec.requires) {
    if (!requirement || !nonempty(requirement.id) || !nonempty(requirement.label)
      || !CAPABILITIES.has(requirement.capability) || ids.has(requirement.id)) {
      throw new Error("Readiness requirements need unique IDs, labels and declared capabilities.");
    }
    ids.add(requirement.id);
  }
  return copyDeclaration(spec);
}

/** One instance is one declaration lifetime; disposers cannot affect later registrations with the same ID. */
export function createExperienceRequirementRegistry(): ExperienceRequirementRegistry {
  const declarations = new Map<string, ExperienceRequirement>();
  return {
    register(spec) {
      const owned = declarationSnapshot(spec);
      if (declarations.has(owned.id)) throw new Error(`Readiness experience ${owned.id} is already registered.`);
      declarations.set(owned.id, owned);
      return () => { if (declarations.get(owned.id) === owned) declarations.delete(owned.id); };
    },
    get(id) {
      const owned = declarations.get(id);
      return owned && copyDeclaration(owned);
    },
    ids: () => [...declarations.keys()],
    mapReadiness(input, experienceId) {
      const findings: Diagnostic[] = [];
      const revision = validRevision(input.revision) ? input.revision : undefined;
      const block = (code: string, field: string, text: string, expected?: string, actual?: string) => {
        findings.push(diagnostic({ source: "readiness", severity: "warning", status: "blocked", code,
          field, text, expected, actual, revision }));
      };
      if (revision === undefined) {
        block("readiness.SNAPSHOT_REQUIRED", "revision", "Supply the admitted map snapshot before checking readiness.",
          "a nonempty string or nonnegative safe integer", String(input.revision));
        return checkReport(findings);
      }
      const declaration = declarations.get(experienceId);
      if (!declaration) {
        block("readiness.EXPERIENCE_UNKNOWN", "experienceId", "Register the requested experience before checking readiness.",
          "a registered experience ID", experienceId);
        return checkReport(findings, { revision });
      }
      /** A report's own empty outcome matters just as much as its diagnostic rows. */
      const admit = (report: CheckReport, field: string, label: string) => {
        if (!validRevision(report.revision) || report.revision !== revision) {
          block("readiness.SNAPSHOT_MISMATCH", field, `${label} needs observations from the admitted map snapshot.`,
            String(revision), report.revision === undefined ? "missing" : String(report.revision));
          return;
        }
        const claimed = diagnostic({ source: "readiness", severity: "note", status: report.status,
          code: "readiness.OBSERVED", field, text: `${label}: ${report.status}.`, evidence: report.evidence, revision });
        const diagnosed = reportStatus(report.diagnostics);
        // Keep an empty report's literal skipped outcome; otherwise use the common worst-status precedence.
        const status = diagnosed === "pass" ? report.status
          : reportStatus([claimed, { ...claimed, status: diagnosed }]);
        findings.push(diagnostic({ ...claimed, severity: status === "fail" ? "error" : "note",
          status, text: `${label}: ${status}.` }));
        // Copy row coordinates as well as the containing list; caller mutation must not rewrite a returned report.
        for (const finding of report.diagnostics) findings.push(diagnostic(finding));
      };
      if (input.baseCheck) admit(input.baseCheck, "baseCheck", "Base map check");
      const observationsById = new Map<string, { report: CheckReport; count: number }>();
      for (const observation of input.observations) {
        const found = observationsById.get(observation.requirementId);
        if (found) found.count++;
        else observationsById.set(observation.requirementId, { report: observation.report, count: 1 });
      }
      for (const requirement of declaration.requires) {
        const field = `requires.${requirement.id}`;
        const observed = observationsById.get(requirement.id);
        if (!observed) {
          block("readiness.OBSERVATION_MISSING", field, `Supply the required ${requirement.label} observation.`,
            requirement.id, "missing");
        } else if (observed.count !== 1) {
          block("readiness.OBSERVATION_DUPLICATE", field, `Supply one unambiguous ${requirement.label} observation.`,
            "1", String(observed.count));
        } else {
          admit(observed.report, field, requirement.label);
        }
      }
      // Aggregate evidence is deliberately absent: each report/row keeps its own kind without promotion.
      return checkReport(findings, { revision });
    },
  };
}
