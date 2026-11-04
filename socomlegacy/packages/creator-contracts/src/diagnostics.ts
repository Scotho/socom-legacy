/**
 * The one creator diagnostics model (FUI-5's `Diagnostic` and `CheckReport`, extended once by FCW-05), a browser
 * adaptation with no original. Map checks, local pack results and pack validation all report in this shape, so one
 * viewer shows them. A check that was skipped, blocked or incomplete is never `pass` (`reportStatus`).
 *
 * The adapters take the minimal shapes of `viewer/src/forge/validate.ts` (`MapIssue`, `MapCheck`) and
 * `viewer/src/agent/localPacks.ts` (`LocalPackDiagnostic`, `LocalPackError`), redeclared here: importing them would
 * pull the viewer (three, the scene, the DOM) into this package and make a cycle once the viewer imports it.
 */

export const DIAGNOSTIC_SCHEMA = "s2u.creator/diagnostic" as const;
export const DIAGNOSTIC_VERSION = 1 as const;
export const CHECK_REPORT_SCHEMA = "s2u.creator/check-report" as const;
export const CHECK_REPORT_VERSION = 1 as const;

export type DiagnosticSource = "check" | "placement" | "pack" | "readiness" | "mission" | "job";
export type DiagnosticSeverity = "error" | "warning" | "note";
export type CheckStatus = "pass" | "fail" | "skipped" | "blocked" | "incomplete";
/** The evidence kinds kept apart in a report (AGENTS.md, "The truth rule"), plus a pack's own static validation. */
export type EvidenceKind =
  | "validation"
  | "unit-test"
  | "dev-disc-test"
  | "rendered-browser-run"
  | "physical-playtest"
  | "capture-comparison"
  | "source-inspection";

export interface Diagnostic {
  readonly schema: typeof DIAGNOSTIC_SCHEMA;
  readonly version: typeof DIAGNOSTIC_VERSION;
  readonly source: DiagnosticSource;
  readonly severity: DiagnosticSeverity;
  /** A check's own outcome when it did not simply run: `skipped`, `blocked` or `incomplete`. */
  readonly status?: CheckStatus;
  /** Namespaced: `pack.MEMBER_MISSING`, `map.spawn-floor`, `local.MODELS_SKIPPED`. */
  readonly code: string;
  readonly text: string;
  /** Where Jump looks. */
  readonly at?: readonly [number, number, number];
  /** A stable authored ID (never a revision ref). */
  readonly id?: string;
  readonly file?: string;
  readonly field?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly hint?: string;
  readonly evidence?: EvidenceKind;
  readonly reference?: string;
  readonly revision?: number | string;
}
/** A pack validation diagnostic: the one model, from the `pack` source. */
export type PackDiagnostic = Diagnostic & { readonly source: "pack" };
export type DiagnosticInput = Omit<Diagnostic, "schema" | "version">;

export interface CheckReport {
  readonly schema: typeof CHECK_REPORT_SCHEMA;
  readonly version: typeof CHECK_REPORT_VERSION;
  readonly status: CheckStatus;
  readonly diagnostics: readonly Diagnostic[];
  readonly evidence?: EvidenceKind;
  readonly revision?: number | string;
}

/** A diagnostic stamped with the schema and its version; undefined fields are left out. */
export function diagnostic(fields: DiagnosticInput): Diagnostic {
  const out: Record<string, unknown> = { schema: DIAGNOSTIC_SCHEMA, version: DIAGNOSTIC_VERSION };
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) out[k] = k === "at" ? [...(v as readonly number[])] : v;
  return out as unknown as Diagnostic;
}

/**
 * The status of a set of findings: an error fails; otherwise a blocked check blocks; a check that never ran is
 * skipped; a skipped or incomplete part makes the whole incomplete; only then pass. Warnings do not stop a pass.
 */
export function reportStatus(diagnostics: readonly Diagnostic[], ran = true): CheckStatus {
  if (diagnostics.some((d) => d.severity === "error" || d.status === "fail")) return "fail";
  if (diagnostics.some((d) => d.status === "blocked")) return "blocked";
  if (!ran) return "skipped";
  if (diagnostics.some((d) => d.status === "skipped" || d.status === "incomplete")) return "incomplete";
  return "pass";
}

export function checkReport(
  diagnostics: readonly Diagnostic[],
  options: { ran?: boolean; evidence?: EvidenceKind; revision?: number | string } = {},
): CheckReport {
  const report: Record<string, unknown> = {
    schema: CHECK_REPORT_SCHEMA,
    version: CHECK_REPORT_VERSION,
    status: reportStatus(diagnostics, options.ran ?? true),
    diagnostics: [...diagnostics],
  };
  if (options.evidence !== undefined) report.evidence = options.evidence;
  if (options.revision !== undefined) report.revision = options.revision;
  return report as unknown as CheckReport;
}

/** Ready means pass, nothing else: skipped, blocked, incomplete and fail are not ready. */
export const isReady = (report: CheckReport): boolean => report.status === "pass";

/** `viewer/src/forge/validate.ts` `MapIssue`, structurally. */
export interface MapIssueShape {
  readonly kind: string;
  readonly text: string;
  readonly at: readonly [number, number, number] | null;
}
/** `viewer/src/forge/validate.ts` `MapCheck`, structurally. */
export interface MapCheckShape {
  readonly issues: readonly MapIssueShape[];
  readonly notes: readonly string[];
}
/** `viewer/src/agent/localPacks.ts` `LocalPackDiagnostic`, structurally. */
export interface LocalPackDiagnosticShape {
  readonly code: string;
  readonly count: number;
}

/** A map check problem: an error at its point (Jump), coded `map.<kind>`. */
export function fromMapIssue(issue: MapIssueShape, revision?: number | string): Diagnostic {
  return diagnostic({ source: "check", severity: "error", code: `map.${issue.kind}`, text: issue.text, at: issue.at ?? undefined, revision });
}

/** A map check note: a part that was skipped and said, never a pass. */
export function fromMapNote(note: string, revision?: number | string): Diagnostic {
  return diagnostic({ source: "check", severity: "note", status: "skipped", code: "map.check-skipped", text: note, revision });
}

export function fromMapCheck(check: MapCheckShape, revision?: number | string): CheckReport {
  return checkReport([...check.issues.map((i) => fromMapIssue(i, revision)), ...check.notes.map((n) => fromMapNote(n, revision))], { revision });
}

const LOCAL_TEXT: Readonly<Record<string, string>> = {
  CATALOGUE_TRUNCATED: "The pack list was cut short; the rest are not shown.",
  MODELS_SKIPPED: "Some models in the pack were not applied.",
  TEXTURES_KEPT_ORIGINAL: "Some textures kept the original's look.",
  MAPS_SKIPPED: "Some maps in the pack were not applied.",
};

/** A local pack result's partial outcome: a warning that keeps the report incomplete; its count is `actual`. */
export function fromLocalPackDiagnostic(d: LocalPackDiagnosticShape): Diagnostic {
  const text = LOCAL_TEXT[d.code] ?? `The local pack reported ${d.code}.`;
  return diagnostic({ source: "pack", severity: "warning", status: "incomplete", code: `local.${d.code}`, text, actual: String(d.count) });
}

/** A local pack refusal (`LocalPackError` / `LocalFileError`: `.code` and the message), as an error. */
export function fromLocalPackError(error: { readonly code: string; readonly message: string }): Diagnostic {
  return diagnostic({ source: "pack", severity: "error", code: `local.${error.code}`, text: error.message });
}
