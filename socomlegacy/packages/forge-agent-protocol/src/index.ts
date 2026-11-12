import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION, LIMITS } from "./limits.js";
import { FORGE_PROBE_LIMITS } from "./forgeOperations.js";
export { LIMITS };
/**
 * AX-9 (a browser adaptation, no original): how long a paired page that left by `pagehide` (a reload) keeps its grant
 * resumable at the gateway -- the session's principal, permissions and client name, bound to a one-time resume ticket
 * the page holds in its tab (`sessionStorage`). The reloaded page's player re-binds it with one click inside the window;
 * after it, the grant is gone and the player connects afresh. The window is this adaptation's own choice.
 */
export const RESUME_LIMITS = Object.freeze({ resumeMs: 120000 });
import { buildManual } from "./manual.js";
export { assertJsonData, validateSchema, type JsonSchema } from "./schema.js";
/** The page's schema constructors (`text`, `point`, `refs`, `choice`, `objectOf`...), for a schema built beside the manual's. */
export * as JSON_SCHEMA from "./schema.js";
export { FORGE_EXAMPLES, FORGE_INPUT_OPERATIONS, FORGE_OPERATIONS, FORGE_PLAY_AXES, FORGE_PLAY_BUTTONS, FORGE_PROBE_EXAMPLES, FORGE_PROBE_LIMITS, RULES_INLINE_BYTES,
  type ForgeOperationName, type ForgePermission } from "./forgeOperations.js";
export { TESTROOM_INNER_OPERATIONS, TESTROOM_INPUT_OPERATIONS, TESTROOM_SETTINGS_OPERATIONS, type TestroomInnerOperation } from "./testroomOperations.js";
export { MANUAL_AREAS, MANUAL_AREA_DESCRIPTIONS, type ManualArea, type ManualEntry, type NestedManualEntry } from "./manual.js";
export { CAPTURE_ARGS_SCHEMA, CAPTURE_REFS_MAX_ADAPTATION, CAPTURE_SIZES, CAPTURE_SMALL_WIDTH_ADAPTATION, CAPTURE_VIEWS, CaptureRefusal,
  parseCaptureArgs, type CaptureArgs, type CaptureSize, type CaptureView } from "./capture.js";
/** Browser adaptation: a refusal with its machine code as .code (the page targets read it) and as its message. */
export class ProtocolError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProtocolError";
    this.code = code;
  }
}
export type Permission =
  | "inspect"
  | "edit"
  | "import"
  | "test"
  | "diagnose"
  | "capture";
export type Surface = "forge-editor" | "forge-play" | "testroom-solo";
export const PERMISSIONS: readonly Permission[] = [
  "inspect",
  "edit",
  "import",
  "test",
  "diagnose",
  "capture",
];
export const SURFACES: readonly Surface[] = [
  "forge-editor",
  "forge-play",
  "testroom-solo",
];
export interface Operation {
  permission: Permission;
  surfaces: readonly Surface[];
  mutation: boolean;
  description: string;
}
const op = (
  permission: Permission,
  surfaces: readonly Surface[],
  mutation: boolean,
  description: string,
): Operation => ({ permission, surfaces, mutation, description });
export const OPERATIONS: Readonly<Record<string, Operation>> = Object.freeze({
  "forge.read": op(
    "inspect",
    ["forge-editor"],
    false,
    "Read a bounded layout page",
  ),
  "forge.catalogue": op(
    "inspect",
    ["forge-editor"],
    false,
    "Read a bounded catalogue page",
  ),
  "forge.issues": op(
    "inspect",
    ["forge-editor"],
    false,
    "Read validation issues",
  ),
  "forge.assets": op("inspect", ["forge-editor"], false, "Query loaded prototype bounds, sources and actual hull roles with revision/filter-bound paging"),
  "forge.starters": op("inspect", ["forge-editor"], false, "Discover six authored starter experiences and requirements; select the actual loaded base first"),
  "forge.starter.preview": op("inspect", ["forge-editor"], false, "Read-only plan of a named starter on the current base; bounded args id and optional coverRef/crateRef/treeRefs/hostileType"),
  "forge.starter.apply": op("import", ["forge-editor"], true, "Validate and atomically import a named starter at expectedRevision as one undoable edit"),
  "forge.placement": op("diagnose", ["forge-editor"], false, "Inspect a proposed queried asset placement; sampled diagnostics never certify traversability"),
  // AX-17 (a browser adaptation): ground height, a ray's first hit or free floor, read off the placement check's collision.
  "forge.probe": op("diagnose", ["forge-editor"], false, "Probe ground height, a ray's first hit or free floor near a point; a diagnostic that never certifies traversability"),
  "forge.edit": op(
    "edit",
    ["forge-editor"],
    true,
    "Apply a typed atomic edit transaction",
  ),
  "forge.undo": op("edit", ["forge-editor"], true, "Undo one edit"),
  "forge.redo": op("edit", ["forge-editor"], true, "Redo one edit"),
  "forge.import.begin": op(
    "import",
    ["forge-editor"],
    true,
    "Stage a bounded record transfer",
  ),
  "forge.import.chunk": op(
    "import",
    ["forge-editor"],
    true,
    "Stage the next record chunk",
  ),
  "forge.import.finish": op(
    "import",
    ["forge-editor"],
    true,
    "Validate and atomically import",
  ),
  "forge.import.cancel": op(
    "import",
    ["forge-editor"],
    false,
    "Discard a staged transfer",
  ),
  "forge.export.begin": op(
    "inspect",
    ["forge-editor"],
    false,
    "Begin a bounded record export",
  ),
  "forge.export.chunk": op(
    "inspect",
    ["forge-editor"],
    false,
    "Read the next export chunk",
  ),
  "forge.check": op("diagnose", ["forge-editor"], false, "Run map diagnostics"),
  // FCW-32 (a browser adaptation, the Forge's own authoring instrument; docs/specs/2026-10-27-creator-rules-contract.md):
  // the layout's rules. Discover and read, check and export never write; a pack's import takes `import`; every rules and
  // entity write rides forge.edit (`edit`: rules.new/set, rules.rule.set/delete, rules.variable.set/delete,
  // rules.config.set, rules.clear, zone/marker/spawner.place), so a grant bounds what a session may write.
  "forge.rules": op("inspect", ["forge-editor"], false, "Discover and read rules: args section vocabulary, spec, modes or entities"),
  "forge.rules.check": op("diagnose", ["forge-editor"], false, "Validate the layout's rules: diagnostics name the bad event, action or field"),
  "forge.rules.export": op("inspect", ["forge-editor"], false, "Export the layout's rules as a v2 rules pack: its reference and files"),
  "forge.rules.import": op("import", ["forge-editor"], true, "Import a rules pack's files as the layout's rules, as one undoable edit at expectedRevision; the whole request (every member, JSON-escaped) must fit the control channel: past it, RULES_TOO_LARGE"),
  // FCW-32 round 2 (the review's F2): a scripted run of the layout's rules on the room's rule host; nothing is applied.
  "forge.rules.test": op("test", ["forge-editor"], false, "Run the layout's rules mode on the room's rule host over a scripted run: args seed, players, ticks"),
  "forge.play": op(
    "test",
    ["forge-editor"],
    true,
    "Start private loopback play",
  ),
  "forge.input": op("test", ["forge-play"], true, "Use allowlisted normal private Play inputs; args operation and arguments"),
  "play.stop": op("test", ["forge-play"], true, "Return to the editor"),
  "target.status": op("inspect", SURFACES, false, "Read target state"),
  "target.capture": op(
    "capture",
    SURFACES,
    false,
    "Capture only the game canvas",
  ),
  "scenario.start": op(
    "test",
    ["forge-play", "testroom-solo"],
    true,
    "Start a bounded named scenario",
  ),
  "scenario.status": op(
    "test",
    ["forge-play", "testroom-solo"],
    false,
    "Read scenario results",
  ),
  "scenario.cancel": op(
    "test",
    ["forge-play", "testroom-solo"],
    false,
    "Cancel a scenario",
  ),
  "request.receipt": op("inspect", SURFACES, false, "Read a request receipt"),
  "testroom.read": op(
    "inspect",
    ["testroom-solo"],
    false,
    "Read the solo room",
  ),
  "testroom.map": op("test", ["testroom-solo"], true, "Switch the solo map"),
  "testroom.teleport": op(
    "test",
    ["testroom-solo"],
    true,
    "Move to a named objective",
  ),
  "testroom.input": op(
    "test",
    ["testroom-solo"],
    true,
    "Run bounded normal input actions",
  ),
  "testroom.settings": op(
    "edit",
    ["testroom-solo"],
    true,
    "Change solo test instruments",
  ),
  "packs.list": op(
    "inspect",
    ["forge-editor", "testroom-solo"],
    false,
    "Read metadata for locally approved packs",
  ),
  "packs.import": op(
    "import",
    ["forge-editor", "testroom-solo"],
    true,
    "Import a locally approved staged pack",
  ),
  "packs.remove": op(
    "import",
    ["forge-editor", "testroom-solo"],
    true,
    "Remove a local pack",
  ),
  // R5-A (a browser adaptation, no original): the agent's cinematic camera. View only -- never the layout, the game's
  // camera or any simulation value; Build and the solo room only. Shot and stop take `edit`, the grant of the camera
  // controls already there (forge.edit's camera.pose/look/focus/objective, testroom.settings' camera.set), so a
  // test-only grant gains no Build camera mutation; status takes `inspect` (docs/specs/*-forge-camera-shot.md).
  "camera.shot": op("edit", ["forge-editor", "testroom-solo"], true, "Play one smooth camera shot: points [{at,look}] 2..64, seconds 1..120, optional hold 0..10 at the last point; the page drives it frame by frame and a second shot replaces it"),
  "camera.stop": op("edit", SURFACES, false, "End the running camera shot; answers the stopped shot id or null"),
  "camera.status": op("inspect", SURFACES, false, "Read the camera shot: its id, seconds elapsed and, once over, why it ended"),
  // AX-13 (plan item 13, a browser adaptation, no original): "point at it" -- the player's focus, read only. In Build the
  // world point under their last left click in the viewport, the selection and the camera; in the room their feet, look
  // and the nearest named objective. Additive (AX.R8): inspect, as target.status, so every pairing may read it.
  "forge.focus": op("inspect", ["forge-editor"], false, "Read the player's focus: the world point of their last left click in the viewport, the selection and the camera"),
  "testroom.focus": op("inspect", ["testroom-solo"], false, "Read the player's focus: their feet, look and the nearest named objective"),
});
/**
 * AX-1 (contract C1, ruling AX.R6; a browser adaptation): the operation manual -- each wire operation's argument schema,
 * an example and the inner operations it forwards -- and the page's schemas it is built from (`./manual.ts`).
 */
export const OPERATION_MANUAL = buildManual(OPERATIONS);
export interface AgentRequest {
  version: 1;
  requestId: string;
  sessionId: string;
  targetId: string;
  epoch: string;
  /**
   * AX-3 (C2, a browser adaptation): `"current"` is resolved by the page to its own revision at admission, in the same
   * synchronous step that checks it (`admitRevision`), so it never applies to a revision newer than the one read.
   */
  expectedRevision?: number | "current";
  operation: string;
  args: unknown;
}
/** A request after its target's admission: `expectedRevision` is a number or absent (`admitRevision`). */
export type AdmittedRequest = Omit<AgentRequest, "expectedRevision"> & { expectedRevision?: number };
/** AX-3 (C2): the page's admission of `expectedRevision: "current"` -- the revision it has just read; a number passes. */
export function admitRevision(request: AgentRequest, revision: number): AdmittedRequest {
  return request.expectedRevision === "current"
    ? { ...request, expectedRevision: revision }
    : (request as AdmittedRequest);
}
/** AX-3 (C3, a browser adaptation): what a refused agent may do next -- every field optional on the wire (AX.R8). */
export interface AgentRetry {
  operation?: string;
  permissions?: Permission[];
  revision?: number;
  surface?: Surface;
}
/**
 * AX-14 (a browser adaptation): a note the player wrote on the page for the agent -- plain text, never interpreted --
 * and when the gateway took it (ISO 8601).
 */
export interface AgentNote {
  text: string;
  at: string;
}
export interface AgentResult {
  requestId: string;
  revision: number;
  outcome: "ok" | "refused" | "unknown";
  code?: string;
  data?: unknown;
  /** AX-3 (C3): one sentence for the agent, saying what to do next (`REFUSAL_HINTS`). */
  hint?: string;
  retry?: AgentRetry;
  /** AX-14: the player's notes not yet delivered, delivered by riding this result (optional on the wire, AX.R8). */
  notes?: AgentNote[];
}
export interface TargetSnapshot {
  targetId: string;
  epoch: string;
  surface: Surface;
  build: string;
  map: string | null;
  revision: number;
}
export interface AgentTarget {
  read(): TargetSnapshot;
  dispatch(request: AgentRequest): Promise<AgentResult>;
  revoke(reason: string): void;
}
export interface MutationReceipt {
  requestId: string;
  digest: string;
  beforeRevision: number;
  afterRevision: number;
  result: AgentResult;
}
export interface Capability {
  sessionId: string;
  targetId: string;
  epoch: string;
  permissions: readonly Permission[];
  surface: Surface;
  revision?: number;
}
export type SignalFromPage =
  | { type: "surface"; surface: Surface }
  | { type: "approve"; pendingId: string; permissions: Permission[] }
  | {
      type: "answer";
      sessionId: string;
      targetId: string;
      epoch: string;
      sdp: string;
    }
  | {
      type: "ice";
      sessionId: string;
      targetId: string;
      epoch: string;
      candidate: unknown;
    }
  /**
   * AX-14 (a browser adaptation): a note for the agent, bound like the other session signals; `noteId` (the page's own
   * identifier, optional) names it in `note-delivered` and `note-refused`.
   */
  | {
      type: "note";
      sessionId: string;
      targetId: string;
      epoch: string;
      noteId?: string;
      text: string;
    }
  | { type: "revoke" }
  | ({ type: "diagnosis" } & Diagnosis)
  /** AX-9: the paired page is leaving (`pagehide`, a reload): keep its grant resumable for RESUME_LIMITS.resumeMs. */
  | { type: "pagehide" }
  /** AX-9: the reloaded page's player pressed Reconnect: re-bind the resumable grant this ticket names to this page. */
  | { type: "resume"; ticket: string };
/**
 * AX-12 (the connection doctor; a browser adaptation, AX.R8 additive): the one class a failed page connection is sorted
 * into -- the connection service did not answer (`service-unreachable`), refused the page's origin (`origin-refused`),
 * was at capacity or rate-limited (`service-busy`), the WebRTC route never opened (`route-failed`: ICE failed or the data
 * channel timed out), the versions differ (`version`), the invitation or session ran out (`expired`), the pairing was
 * ended from the other side (`revoked`), or none of these (`unknown`).
 */
export const DIAGNOSIS_CLASSES = [
  "service-unreachable",
  "origin-refused",
  "service-busy",
  "route-failed",
  "version",
  "expired",
  "revoked",
  "unknown",
] as const;
export type DiagnosisClass = (typeof DIAGNOSIS_CLASSES)[number];
/** AX-12: how many ICE candidates of each kind were seen -- counts only, never an address, a port or SDP. */
export interface RouteCandidates {
  host: number;
  srflx: number;
  relay: number;
}
/**
 * AX-12: what the page reports to the gateway (`{type: "diagnosis", ...}` on the signalling socket, sent before its
 * `revoke`) and what `agent_status` shows the agent: the class and, for a route, the candidates this page found
 * (`local`) and the gateway offered (`remote`).
 */
export interface Diagnosis {
  class: DiagnosisClass;
  local?: RouteCandidates;
  remote?: RouteCandidates;
}
/** AX-12: a candidate count's bound (the page and the gateway each cap a session's candidates far below it). */
const MAX_CANDIDATE_COUNT = 9999;
function routeCandidates(value: unknown): RouteCandidates {
  const o = object(value);
  const keys = Object.keys(o);
  if (keys.length !== 3 || !["host", "srflx", "relay"].every((k) => keys.includes(k)))
    throw new ProtocolError("INVALID_DIAGNOSIS");
  for (const k of keys) {
    const n = o[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_CANDIDATE_COUNT)
      throw new ProtocolError("INVALID_DIAGNOSIS");
  }
  return { host: o.host as number, srflx: o.srflx as number, relay: o.relay as number };
}
/**
 * AX-12: a diagnosis signal held to its shape -- `type`, a known `class`, optional `local`/`remote` counts, nothing
 * else (so no free text, address or SDP can ride it). Anything else throws INVALID_DIAGNOSIS.
 */
export function parseDiagnosis(value: unknown): Diagnosis {
  let o: Record<string, unknown>;
  try {
    o = object(value);
  } catch {
    throw new ProtocolError("INVALID_DIAGNOSIS");
  }
  if (Object.keys(o).some((k) => !["type", "class", "local", "remote"].includes(k)))
    throw new ProtocolError("INVALID_DIAGNOSIS");
  if (!DIAGNOSIS_CLASSES.includes(o.class as DiagnosisClass)) throw new ProtocolError("INVALID_DIAGNOSIS");
  let local: RouteCandidates | undefined, remote: RouteCandidates | undefined;
  try {
    if (o.local !== undefined) local = routeCandidates(o.local);
    if (o.remote !== undefined) remote = routeCandidates(o.remote);
  } catch {
    throw new ProtocolError("INVALID_DIAGNOSIS");
  }
  return { class: o.class as DiagnosisClass, ...(local ? { local } : {}), ...(remote ? { remote } : {}) };
}
/**
 * AX-12: the agent's next step for each class -- what `agent_status`'s `next` says when the page reported a diagnosis.
 * The person's words are the page's own (viewer `agent/codes.ts` `AGENT_DIAGNOSIS`).
 */
export const DIAGNOSIS_HINTS: Readonly<Record<DiagnosisClass, string>> = Object.freeze({
  "service-unreachable":
    "The page could not reach the connection service: ask the player whether the service is running and whether the page names this gateway, then for a fresh join link.",
  "origin-refused":
    "This gateway does not serve the page's origin: ask the player to open the page at an address this gateway allows, or to set the page's connection service to this gateway.",
  "service-busy":
    "The gateway was at capacity or rate-limited the page: wait a minute, then ask the player for a fresh join link.",
  "route-failed":
    "The direct WebRTC route between the page and the gateway did not open (ICE failed or the data channel timed out): the player's network may block it or need a TURN relay; ask the player to retry, and if it fails again, to try another network.",
  version:
    "The page and the gateway speak different protocol versions: ask the player to reload the page, then for a fresh join link.",
  expired: "The invitation or session ran out of time: ask the player for a fresh join link and call agent_pair with it.",
  revoked:
    "The pairing was ended by the agent, the player's page or the gateway: ask the player whether to connect again, and if so for a fresh join link.",
  unknown: "The page's connection failed for a reason it could not name: ask the player to retry and for a fresh join link.",
});
export type SignalToPage =
  | {
      type: "pending";
      pendingId: string;
      clientName: string;
      comparisonCode: string;
      permissions: Permission[];
      /**
       * AX-10 (a browser adaptation; additive, AX.R8): the pairing principal's registered OAuth client id, when the
       * gateway knows it -- the page matches a remembered agent by it before the self-reported name. An identifier;
       * an older gateway leaves it out and an older page ignores it.
       */
      gatewayClientId?: string;
    }
  | {
      type: "offer";
      sessionId: string;
      targetId: string;
      epoch: string;
      permissions: Permission[];
      sdp: string;
    }
  | {
      type: "ice";
      sessionId: string;
      targetId: string;
      epoch: string;
      candidate: unknown;
    }
  | { type: "revoked"; reason: string }
  /** AX-14: the agent has read these notes (they rode a result, or agent_notes). */
  | {
      type: "note-delivered";
      sessionId: string;
      targetId: string;
      epoch: string;
      noteIds: string[];
    }
  /** AX-14: the gateway did not take this note (its size, the rate or the queue); the pairing is unchanged. */
  | {
      type: "note-refused";
      sessionId: string;
      targetId: string;
      epoch: string;
      noteId: string;
      code: string;
    }
  /**
   * AX-9 (additive, AX.R8): the one-time ticket that resumes this session after a reload, issued with each offer. The
   * page keeps it in its tab only (`sessionStorage`), never in a URL or a log; the gateway holds only its hash.
   */
  | { type: "resume-ticket"; sessionId: string; ticket: string; clientName: string }
  /** AX-9: a `resume` was refused (RESUME_EXPIRED, RESUME_REFUSED, TARGET_BUSY, SURFACE_DENIED): connect afresh. */
  | { type: "resume-refused"; code: string };
/**
 * FCW-32 round-2 re-look F3 (a browser adaptation): the code a sender gives a request that does not fit the control channel
 * (`LIMITS.controlBytes`): the rules import is refused by name (`RULES_TOO_LARGE`, whose route is the layout's chunked
 * export), every other operation as `CONTROL_TOO_LARGE`.
 */
export function oversizeRefusal(operation: unknown): "RULES_TOO_LARGE" | "CONTROL_TOO_LARGE" {
  return operation === "forge.rules.import" ? "RULES_TOO_LARGE" : "CONTROL_TOO_LARGE";
}
export function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProtocolError("INVALID_OBJECT");
  return value as Record<string, unknown>;
}
export function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_.:-]+$/.test(value)
  );
}
export function parseRequest(
  value: unknown,
  operations: Readonly<Record<string, Operation>> = OPERATIONS,
): AgentRequest {
  if (bytes(value) > LIMITS.controlBytes)
    throw new ProtocolError(oversizeRefusal((value as { operation?: unknown } | null)?.operation));
  const r = object(value);
  if (r.version !== 1) throw new ProtocolError("UNSUPPORTED_VERSION");
  for (const k of ["requestId", "sessionId", "targetId", "epoch"])
    if (!identifier(r[k])) throw new ProtocolError("INVALID_" + k);
  if (
    typeof r.operation !== "string" ||
    !Object.hasOwn(operations, r.operation)
  )
    throw new ProtocolError("UNKNOWN_OPERATION");
  if (!Object.hasOwn(r, "args")) throw new ProtocolError("MISSING_ARGS");
  if (
    r.expectedRevision !== undefined &&
    r.expectedRevision !== "current" &&
    (!Number.isSafeInteger(r.expectedRevision) ||
      Number(r.expectedRevision) < 0)
  )
    throw new ProtocolError("INVALID_REVISION");
  if (operations[r.operation]!.mutation && r.expectedRevision === undefined)
    throw new ProtocolError("REVISION_REQUIRED");
  if (
    Object.keys(r).some(
      (k) =>
        ![
          "version",
          "requestId",
          "sessionId",
          "targetId",
          "epoch",
          "expectedRevision",
          "operation",
          "args",
        ].includes(k),
    )
  )
    throw new ProtocolError("UNKNOWN_FIELD");
  return r as unknown as AgentRequest;
}
/**
 * AX-3 (C3, a browser adaptation): one sentence per refusal code, written for the agent, saying what to do next. It
 * covers every code the gateway emits (sessions.ts, gateway.ts, mcp.ts, rtc.ts, `parseRequest`, `authorizeRequest`),
 * every code the page words for a person (viewer `agent/codes.ts` `AGENT_CODE_WORDS`), and (REVIEW-1 9) every code
 * literal the page targets, the room target, the Forge facade and its api emit -- the viewer's `agentRevisionCurrent`
 * test scans those sources and refuses a missing row. The person-facing words stay in the page; these are the agent's.
 */
const RE_PAIR = "ask the player for a fresh join link from the page and call agent_pair with it";
const READ_AGAIN = "read again (target.status), or pass expectedRevision:\"current\" to act on the revision the page holds at admission";
export const REFUSAL_HINTS: Readonly<Record<string, string>> = Object.freeze({
  // Pairing and session binding.
  NOT_PAIRED: `You have no paired session for this request: ${RE_PAIR}, then retry without sessionId/targetId/epoch.`,
  SESSION_AMBIGUOUS: "You hold more than one paired session: pass the targetId (or sessionId) of one listed in data.sessions.",
  STALE_EPOCH: "The page's pairing changed since you read its epoch: call agent_status and retry with its epoch, or omit epoch.",
  SESSION_EXPIRED: `The session expired (idle or absolute limit): ${RE_PAIR}.`,
  REVOKED: `The pairing was revoked while the request waited: call agent_status, and if no session is paired, ${RE_PAIR}.`,
  REPLACED: `Another agent's pairing replaced this one on the page: ${RE_PAIR} if the player wants you back.`,
  DECLINED: "The player declined the pairing: do not retry unless the player asks you to connect again.",
  USER_DISCONNECTED: `The player disconnected you from the page: ${RE_PAIR} only if the player asks.`,
  AGENT_DISCONNECTED: `You disconnected this session (agent_disconnect): ${RE_PAIR} to work on the page again.`,
  AUTHORIZATION_REVOKED: "Your guest authorization was revoked: sign in to the gateway again, then pair with a fresh join link.",
  PAGE_REVOKED: `The page ended the pairing (declined, closed or disconnected): ${RE_PAIR} if the player wants to continue.`,
  PAGE_DISCONNECTED: `The page left (closed, reloaded or lost its connection): ask the player to reopen it and ${RE_PAIR.replace("ask the player for", "copy")}.`,
  PAGE_CLOSED: `The page was closed: ask the player to reopen it, then ${RE_PAIR}.`,
  // AX.R8: only an older page sends PAGE_PAUSED, ending the pairing when its tab was hidden (viewer agent/codes.ts).
  PAGE_PAUSED: `An older page ended the pairing when its tab was hidden: ask the player to keep the tab in view, then ${RE_PAIR}.`,
  // AX-8 (AX.R4): a hidden tab keeps the pairing and pauses test work only; a capture needs the tab in view
  // (viewer agent/install.ts refuses it CAPTURE_UNAVAILABLE while hidden).
  PAGE_HIDDEN: "The player's browser tab is hidden, so tests, Play inputs, scenarios and camera shots are paused; the pairing is kept. Reads and edits still work; a capture needs the tab in view. Ask the player to bring the tab back into view, then send the request again.",
  PAGE_OFFLINE: "The page is not connected to the gateway: ask the player to reopen the page and copy a fresh join link.",
  // AX-9: a reload keeps the grant resumable for RESUME_LIMITS.resumeMs.
  PAGE_RELOADING: `The player's page is reloading; the pairing is held for ${RESUME_LIMITS.resumeMs / 1000} s while the player presses Reconnect on the reloaded page. Wait a few seconds, call agent_status until the session reads paired again, then retry without targetId and epoch (they change with the reload). If the session is gone, ${RE_PAIR}.`,
  RESUME_EXPIRED: `The reconnect window after the reload (${RESUME_LIMITS.resumeMs / 1000} s) had passed: ${RE_PAIR}.`,
  RESUME_REFUSED: `The page's reconnect ticket was unknown, used or from another page: ${RE_PAIR}.`,
  // REVIEW-1 11: receipts are per pairing and go with it, so a receipt is worth asking only while the same session holds.
  CONNECTION_CLOSED: `The page's connection closed: call agent_status. While the same session is still paired, check request.receipt with this requestId before repeating a mutation; if it is gone, ${RE_PAIR}, then read the page's state again (target.status, forge.read or testroom.read) before redoing a mutation, since its receipt went with the old pairing.`,
  CONNECTION_LOST: "The connection to the page dropped mid-request, so the outcome is unknown: call agent_status, then request.receipt with this requestId before repeating a mutation.",
  CONNECTION_BUSY: "The page is already connecting another agent: wait a few seconds and call agent_status, then retry.",
  GATEWAY_SHUTDOWN: "The gateway restarted: sign in again if asked, then pair with a fresh join link from the page.",
  INVITATION_EXPIRED: "The invitation expired or was already used: ask the player to copy a fresh join link from the page and call agent_pair with it.",
  INVALID_INVITATION: "That is not a join link or invitation: pass the whole link http(s)://<host>/join/<invitation> or the invitation alone.",
  INVALID_PAIR: "agent_pair's arguments are malformed: pass invitation, and optionally permissions (a non-empty subset of the six, no repeats) and clientName.",
  TARGET_BUSY: "That page is already pairing or paired with an agent: ask the player to disconnect it in the page first, then copy a fresh join link.",
  CAPACITY: "The gateway is at its session capacity: wait a minute and retry, or disconnect a session you no longer use.",
  ADDRESS_CAPACITY: "Your address holds the most sessions the gateway allows: agent_disconnect the sessions you no longer use, then retry.",
  INVALID_SESSION: "Pass the sessionId of one of your sessions as a string (agent_status lists them).",
  NO_PENDING: "No pairing is waiting for approval on that page: call agent_status, and pair again with a fresh join link if needed.",
  INVALID_GRANT: "The page's grant did not match the request: pair again with a fresh join link.",
  // Authority.
  SURFACE_DENIED: "The page is not on a surface that runs this operation: check retry.surface and agent_capabilities for what works there, or ask the player to switch the page.",
  UNSUPPORTED_SURFACE: "This page's surface does not support that operation: call agent_capabilities and choose one listed for the page's surface.",
  PERMISSION_DENIED: `This session lacks the permission that operation needs (retry.permissions): agent_disconnect, then ${RE_PAIR} and ask the player to allow that permission.`,
  PERMISSION_REQUIRED: `This session lacks a permission the operation needs (retry.permissions): agent_disconnect, then ${RE_PAIR} and ask the player to allow it.`,
  // Revisions.
  STALE_REVISION: `The page's revision moved past expectedRevision (retry.revision holds the current one when known): ${READ_AGAIN}.`,
  REVISION_CONFLICT: `The page's revision is not expectedRevision (retry.revision holds the current one when known): ${READ_AGAIN}.`,
  REVISION_REQUIRED: "This operation changes the page: pass expectedRevision (a number from target.status, or \"current\").",
  INVALID_REVISION: "expectedRevision must be a non-negative integer or the string \"current\".",
  // Request shape.
  UNSUPPORTED_VERSION: "This gateway speaks protocol version 1: send version: 1.",
  INVALID_OBJECT: "The request (or its args) must be a JSON object: check agent_capabilities for the operation's argument shape.",
  INVALID_requestId: "requestId must be 1-128 characters of letters, digits and _ . : - (or omit it and the gateway generates one).",
  INVALID_sessionId: "Use a session id from agent_status (letters, digits and _ . : -), or omit it to use your one paired session.",
  INVALID_targetId: "targetId must be one from agent_status (letters, digits and _ . : -), or omit it to use your one paired session.",
  INVALID_epoch: "epoch must be the one agent_status reports, or omit it to use your one paired session's.",
  UNKNOWN_OPERATION: "That operation is not in the catalogue: call agent_capabilities for the operation names.",
  UNSUPPORTED_OPERATION: "The page does not run that operation (or that inner operation) here: an inner operation's refusal lists what its wrapper admits in data.admitted; otherwise call agent_capabilities for what the page accepts.",
  UNSUPPORTED: "The page does not support that here: call agent_capabilities and choose a listed operation.",
  MISSING_ARGS: "Pass args (use {} when the operation takes none).",
  UNKNOWN_FIELD: "Remove fields the request does not define: version, requestId, sessionId, targetId, epoch, expectedRevision, operation, args.",
  INVALID_ARGUMENT: "The operation's args are malformed or out of bounds: call agent_capabilities for its argument schema and example, then retry.",
  INVALID_REFERENCE: "A ref in args is not current: refs live for one revision, so read the page again and use its fresh refs.",
  INVALID_LAYOUT: "The layout given is not valid: run forge.check or forge.issues and fix what they report.",
  INVALID_CURSOR: "The cursor is stale or malformed: read the first page again without a cursor.",
  INVALID_SECTION: "Name a section the operation lists: call agent_capabilities for the operation's sections.",
  UNKNOWN_AREA: "That is not an area of the manual: call agent_capabilities with one of data.valid (forge, forge-edit, play, testroom, camera, packs, session), or with no argument for the summary.",
  INVALID_RESULT: "The page returned a malformed result: read target.status, and check request.receipt before repeating a mutation.",
  INVALID_REQUEST: "The HTTP body was malformed or too large: send one JSON object within the control limit.",
  METHOD_NOT_ALLOWED: "This endpoint takes POST only: send the request as a POST.",
  // Limits and queueing.
  RATE_LIMITED: `Commands are limited to ${LIMITS.commandsPerSecond} per second (burst ${LIMITS.commandBurst}) per session: wait a second and retry.`,
  QUEUE_FULL: `The session already has ${LIMITS.queuedCommands} commands queued: wait for answers before sending more.`,
  QUEUE_TIMEOUT: "The request waited too long behind others and never reached the page: retry it once the queue drains.",
  REQUEST_TIMEOUT: "The page did not answer in time, so the outcome is unknown: call request.receipt with this requestId before repeating a mutation.",
  REQUEST_IN_FLIGHT: "A request with this requestId is still running: wait for its answer, or use a new requestId.",
  STOP_IN_FLIGHT: "A stop is already running: wait for its answer, then check status.",
  BUSY: "The page is busy with another action: wait a moment, read target.status, then retry.",
  BACKPRESSURE: "The page's channel is backed up: wait a moment, then retry.",
  REQUEST_ID_REUSED: "That requestId was already used with different arguments: use a new requestId (or omit it).",
  UNKNOWN_REQUEST: "No receipt is held for that requestId: it never reached the page, or the receipt was cleared.",
  RECEIPT_LIMIT: "The page holds no more receipts: continue with new requestIds; old receipts are gone.",
  RECEIPT_CAPACITY: `The page's receipt store for this session is full and takes no more mutations: agent_disconnect, then ${RE_PAIR} for a fresh session.`,
  LIMIT_EXCEEDED: "The request exceeds a bound: call agent_capabilities for the operation's limits and send less.",
  OUTPUT_TOO_LARGE: "The answer would not fit the channel: ask for a smaller page (a limit or cursor) or a narrower section.",
  CONTROL_TOO_LARGE: `The request exceeds ${LIMITS.controlBytes} bytes: send it in smaller pieces (an import transfer or several edits).`,
  RULES_TOO_LARGE: "The rules pack is too large to send inline: use the chunked route (forge.import.begin/chunk/finish) or a smaller pack.",
  DIAGNOSTICS_LIMIT: "Diagnostics were cut at their bound: fix the first issues reported and check again.",
  CATALOGUE_TRUNCATED: "The catalogue page was cut at its bound: follow nextCursor or filter the query.",
  // Page state.
  REFUSED: "The page refused the request: read target.status and agent_capabilities, then retry with what they allow.",
  LOCKED: "That is locked on the page right now: read target.status, and ask the player if it stays locked.",
  BUILD_LOCKED: "Building is locked while the room is in Play: ask the player to stop Play (or stop it with testroom.settings session.play {on: false} if they agree), then retry.",
  BLOCKED: "The page is blocked (a modal, a load or a warning): ask the player to clear it, then read target.status.",
  GAME_TYPE: "That does not apply to this map's game type: read target.status and choose an operation that fits.",
  NOT_FOUND: "The thing named was not found: read the page again (forge.read, forge.catalogue or testroom.read) for current names and refs.",
  NOT_READY: "The page is still loading: wait a moment and read target.status until ready is true.",
  PLAY_NOT_READY: "Play is still starting: wait a moment and read target.status before sending Play inputs.",
  PLAY_REFUSED: "Play could not start: run forge.check, fix what it reports, then call forge.play again.",
  PLAYING: "The page is in Play: call play.stop first, then retry the editor operation.",
  OUT_OF_BOUNDS: "A point is outside the map: read the map's bounds (forge.read metadata) and choose points inside it.",
  OUT_OF_RANGE: "A value is outside its range: call agent_capabilities for the argument's bounds.",
  // AX-17: forge.probe's bounds and the hull it reads.
  PROBE_TOO_LARGE: `The probe is past its bound (a free radius of at most ${FORGE_PROBE_LIMITS.radius} units, a ray of at most ${FORGE_PROBE_LIMITS.ray}): probe a smaller area, or split it into several probes.`,
  NO_GROUND: "The loaded base has no collision hull to read: open a map or blank base (target.status map), then retry.",
  CANCELLED: "The request was cancelled (by the player, a stop or a disconnect): read target.status before retrying.",
  ABORTED: "The action was aborted on the page: read target.status before retrying.",
  DISPOSED: `The page target was torn down: call agent_status, and ${RE_PAIR} if no session is paired.`,
  ACTION_FAILED: "The page action failed: read target.status and the result in data, then retry or choose another action.",
  APPLY_FAILED: "The change could not be applied: read data.result and forge.issues, fix the cause, then retry at the current revision.",
  ADMISSION_LOST: "The page changed while admitting the request: read target.status, then retry.",
  NOT_STAGED: "Nothing is staged under that id: stage it first (pick or upload the file), then retry.",
  DUPLICATE: "That already exists: read the page again and use the existing one, or choose another id or name.",
  // REVIEW-1 9: the Forge facade's own codes (viewer forge/agent/editorFacade.ts); its message is in data.message.
  MAP_ISSUES: "Play refuses while the layout has issues (data.message lists them): run forge.issues, fix each through forge.edit, then call forge.play again.",
  ABSENT_ASSET: "That asset, archive or character is not on this page: pass a row's asset field from forge.assets (not its ref), an archive from forge.catalogue, or a character the base carries.",
  NO_HISTORY: "There is nothing to undo or redo: read target.status (canUndo, canRedo) before asking again.",
  NO_MAP: "No map base is open and no archive was given: pass an archive from forge.catalogue, or ask the player to open a map base.",
  REQUIREMENTS_UNMET: "The layout's requirements are not met (data.message says which: missing packs, or a starter's diagnostics): add what it names (packs.list, packs.import) or choose other starter options, then retry.",
  SAVE_REFUSED: "The save was refused (data.message says why: a bad name, a save gone or changed elsewhere, or browser storage): fix the name or read forge.catalogue {section: \"saves\"} again, then retry.",
  EMPTY_CLIPBOARD: "Nothing is copied: copy placements first (selection.copy through forge.edit), then paste.",
  AMBIGUOUS_OBJECTIVE: "Several objectives match that name: choose one of the names data.message lists and retry.",
  // REVIEW-1 9: the solo room's own codes (viewer testroom/agent/target.ts).
  UNAVAILABLE: "This page does not offer that instrument (the room's Play toggle, for one): call agent_capabilities for what it takes, or ask the player.",
  UNKNOWN_MAP: "No catalogue map has that name: list the maps (testroom.map {list: true}) and pass one's name, archive or path.",
  AMBIGUOUS_MAP: "Several catalogue maps match that name: pass one of data.choices by its path.",
  LOAD_FAILED: "The room's map loader refused the map: list the maps (testroom.map {list: true}), choose another or retry once, then read testroom.read.",
  LOAD_TIMEOUT: "The map did not become ready in 30 seconds: poll testroom.read until ready is true and map.path is the one you asked for; load it again only if it never arrives.",
  // AX-14: the player's notes (the page meets these; an agent only reads notes).
  NOTE_TOO_LONG: `A note from the page is longer than ${LIMITS.noteChars} characters: the player shortens it; nothing for the agent to do.`,
  NOTE_RATE_LIMITED: `The page sent notes faster than one every ${LIMITS.noteIntervalMs} ms: the player waits a moment; nothing for the agent to do.`,
  NOTE_QUEUE_FULL: `${LIMITS.notesQueued} notes from the player are waiting: read them (agent_notes, or the notes on your next result).`,
  INVALID_NOTE: "A note from the page was empty or not plain text: the player writes it again; nothing for the agent to do.",
  EMPTY_SELECTION: "Nothing is selected: select placements first (selection.set {refs} through forge.edit), then retry.",
  AMBIGUOUS_DESTINATION: "Several destinations match that name: pick one of data.choices by its path and retry.",
  UNKNOWN_DESTINATION: "No destination has that name: pick one of data.choices and retry.",
  // Capture.
  CAPTURE_UNAVAILABLE: "The page could not picture its view (the tab hidden, nothing drawn yet, or no game canvas here): ask the player to bring the tab into view, then retry once.",
  CAPTURE_TIMEOUT: "The capture took too long: wait a moment and retry once.",
  CAPTURE_FAILED: "The capture failed: wait a moment and retry once; if it fails again, continue without it.",
  // REVIEW-1 5: AX-16's size "small" is the agent's own way out; the player's window is the last resort.
  CAPTURE_TOO_LARGE: `The picture is over the ${LIMITS.transferBytes}-byte transfer bound: retry with size: "small" first; if it is still too large, ask the player to make the window smaller, then retry.`,
  INVALID_IMAGE: "The page's image was malformed: retry the capture once.",
  IMAGE_DIGEST: "The image did not match its digest: retry the capture once.",
  INCOMPLETE_IMAGE: "The image arrived incomplete, so the outcome is unknown: retry the capture.",
  UNSOLICITED_IMAGE: "The page sent an image no request asked for: retry your capture.",
  // Local files and packs.
  INVALID_PACKAGE: "The pack is not a valid package: ask the player for a different pack file.",
  INVALID_PATH: "A path in the pack is not allowed: ask the player for a pack with plain relative paths.",
  DUPLICATE_PATH: "The pack repeats a path: ask the player for a pack with each path once.",
  UNSUPPORTED_FORMAT: "That file format is not supported: call agent_capabilities for the accepted formats.",
  LOCAL_FILES_UNAVAILABLE: "Local packs are not available on this page (no local folder or files chosen, or a browser without support): ask the player to choose a folder or add files, or continue without packs.",
  STORAGE_FAILED: "The browser's storage refused the write (it may be full): ask the player to free space, then retry.",
  DIGEST_MISMATCH: "The data did not match its digest: send it again from the start.",
  ITEM_TOO_LARGE: "One item alone is larger than a page of the answer: read a narrower section or a smaller selection.",
  MAP_IMPORT_FAILED: "The map could not be imported: ask the player for a different map pack.",
  MODELS_SKIPPED: "Some models were skipped: list the pack (packs.list) to see what loaded, and continue.",
  MAPS_SKIPPED: "Some maps were skipped: list the pack (packs.list) to see what loaded, and continue.",
  TEXTURES_KEPT_ORIGINAL: "Some textures kept the original: continue; nothing else is needed.",
  ARCHIVE_NOT_LOADED: "The map archive is not loaded: switch to a map that is loaded, or ask the player to load it.",
  // Transfers.
  TRANSFER_TOO_LARGE: `The transfer exceeds ${LIMITS.transferBytes} bytes: send a smaller one.`,
  TRANSFER_EXPIRED: "The transfer idled or ran too long and was dropped: begin it again.",
  TRANSFER_BUSY: "Another transfer is running: finish or cancel it first.",
  NO_TRANSFER: "No transfer is open under that id: begin one first.",
  CHUNK_ORDER: "Chunks must be sent in order from index 0: resend from the next expected index, or begin again.",
  CHUNK_TOO_LARGE: `A chunk exceeds ${LIMITS.chunkBytes} bytes or the declared size: send smaller chunks.`,
  INCOMPLETE: "The transfer is short of its declared size: send the remaining chunks, then finish.",
  FRAME_TOO_LARGE: "A frame exceeded the channel's bound: retry; if it persists, send smaller requests.",
  INVALID_FRAME: "A frame was malformed: retry the request.",
  INVALID_BASE64: "A chunk's data is not valid base64: encode it as standard base64 (A-Z a-z 0-9 + / with = padding) and resend it.",
  MESSAGE_SIZE_TOO_SMALL: "The channel's message size is too small: ask the player to use a current browser.",
  // Rules.
  INVALID_RULES: "The rules are not valid: run forge.rules.check and fix what it names.",
  NO_RULES: "The layout has no rules yet: create them with forge.edit rules.new first.",
  RULES_EXIST: "The layout already has rules: edit them, or clear them with forge.edit rules.clear first.",
  // Transport and signalling (the gateway and page; an agent sees them as revocation reasons).
  RTC_FAILED: `The direct connection to the page could not start: ${RE_PAIR}; if it fails again, the player's network may block it.`,
  RTC_TIMEOUT: `The direct connection to the page timed out: ${RE_PAIR}.`,
  RTC_DISCONNECTED: `The direct connection to the page dropped: ${RE_PAIR}.`,
  RTC_PROTOCOL_ERROR: `The page sent something the gateway could not read, so the pairing ended: ${RE_PAIR}.`,
  CHANNEL_CLOSED: "The channel to the page closed: call agent_status, then pair again if no session is paired.",
  CHANNEL_TIMEOUT: "The channel to the page did not open in time: pair again with a fresh join link.",
  CHANNEL_NOT_READY: "The channel to the page is still opening: wait a second and retry.",
  INVALID_MESSAGE: "The page's answer was malformed: read target.status, and check request.receipt before repeating a mutation.",
  ANSWER_REPLAY: "The page repeated its connection answer: pair again with a fresh join link.",
  UNSOLICITED_ICE: "The page signalled out of order: pair again with a fresh join link.",
  ICE_LIMIT: "The page sent too many connection candidates: pair again with a fresh join link.",
  SIGNAL_TOO_LARGE: "A page signal was too large: ask the player to reload the page and pair again.",
  SIGNAL_BINDING_DENIED: "A page signal named another session: ask the player to reload the page and pair again.",
  INVALID_SIGNAL: "The page sent an unknown signal: ask the player to reload the page and pair again.",
  // AX-12: a page's diagnosis signal the gateway could not read (its socket closes; agent_status keeps any earlier one).
  INVALID_DIAGNOSIS: "The page sent a malformed connection diagnosis: ask the player to reload the page and pair again.",
  INVALID_TARGET: "The page registered with malformed details: ask the player to reload the page.",
  ORIGIN_DENIED: "The page's origin is not one this gateway serves: use the gateway the page names.",
  HOST_DENIED: "The request's Host is not this gateway's: call the gateway at the address the page names.",
  PAGE_AUTH_DENIED: "The page's one-time ticket was refused: ask the player to reload the page.",
});
/**
 * AX-3 (C3): a result with its hint filled from `REFUSAL_HINTS` when it is not ok and has none (an unlisted code gets
 * the generic `REFUSED` sentence), and, for a revision refusal, `retry.revision` = the result's revision (the page's
 * current one). Ok results pass unchanged; a hint or retry already set is kept.
 */
export function teach(result: AgentResult): AgentResult {
  if (result.outcome === "ok" || result.code === undefined) return result;
  const out: AgentResult = result.hint ? result : { ...result, hint: REFUSAL_HINTS[result.code] ?? REFUSAL_HINTS.REFUSED };
  if (
    (result.code === "STALE_REVISION" || result.code === "REVISION_CONFLICT") &&
    out.retry?.revision === undefined
  )
    return { ...out, retry: { ...out.retry, revision: result.revision } };
  return out;
}
export function parseResult(value: unknown): AgentResult {
  if (bytes(value) > LIMITS.controlBytes) throw new ProtocolError("CONTROL_TOO_LARGE");
  const r = object(value);
  if (
    !identifier(r.requestId) ||
    !Number.isSafeInteger(r.revision) ||
    Number(r.revision) < 0 ||
    !["ok", "refused", "unknown"].includes(String(r.outcome)) ||
    (r.code !== undefined && typeof r.code !== "string")
  )
    throw new ProtocolError("INVALID_RESULT");
  return r as unknown as AgentResult;
}
export function authorizeRequest(
  r: AgentRequest,
  c: Capability,
  operations: Readonly<Record<string, Operation>> = OPERATIONS,
): string | undefined {
  if (r.targetId !== c.targetId || r.sessionId !== c.sessionId)
    return "NOT_PAIRED";
  if (r.epoch !== c.epoch) return "STALE_EPOCH";
  const o = operations[r.operation];
  if (!o) return "UNKNOWN_OPERATION";
  if (!o.surfaces.includes(c.surface)) return "SURFACE_DENIED";
  if (!c.permissions.includes(o.permission)) return "PERMISSION_DENIED";
  if (
    o.mutation &&
    c.revision !== undefined &&
    r.expectedRevision !== "current" &&
    r.expectedRevision !== c.revision
  )
    return "REVISION_CONFLICT";
  return undefined;
}
/** One transfer per instance, bounded before allocation; digest/schema checked by its consumer. */
export class ChunkAssembler {
  private state?: {
    id: string;
    size: number;
    parts: Uint8Array[];
    received: number;
    index: number;
    start: number;
    last: number;
  };
  constructor(private readonly now: () => number = Date.now) {}
  begin(id: string, size: number): void {
    // Browser adaptation: a held transfer past its idle or absolute bound is abandoned, not busy.
    if (this.state) {
      if (!this.expired(this.state)) throw new ProtocolError("TRANSFER_BUSY");
      this.cancel();
    }
    if (
      !identifier(id) ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > LIMITS.transferBytes
    )
      throw new ProtocolError("TRANSFER_TOO_LARGE");
    const now = this.now();
    this.state = {
      id,
      size,
      parts: [],
      received: 0,
      index: 0,
      start: now,
      last: now,
    };
  }
  private expired(s: { start: number; last: number }): boolean {
    const n = this.now();
    return (
      n - s.last > LIMITS.transferIdleMs ||
      n - s.start > LIMITS.transferAbsoluteMs
    );
  }
  private get(id: string) {
    const s = this.state;
    if (!s || s.id !== id) throw new ProtocolError("NO_TRANSFER");
    if (this.expired(s)) {
      this.cancel();
      throw new ProtocolError("TRANSFER_EXPIRED");
    }
    return s;
  }
  chunk(id: string, index: number, data: Uint8Array): void {
    const s = this.get(id);
    if (index !== s.index) throw new ProtocolError("CHUNK_ORDER");
    if (
      data.length === 0 ||
      data.length > LIMITS.chunkBytes ||
      s.received + data.length > s.size
    )
      throw new ProtocolError("CHUNK_TOO_LARGE");
    s.parts.push(data.slice());
    s.received += data.length;
    s.index++;
    s.last = this.now();
  }
  finish(id: string): Uint8Array {
    const s = this.get(id);
    if (s.received !== s.size) throw new ProtocolError("INCOMPLETE");
    const data = new Uint8Array(s.size);
    let offset = 0;
    for (const p of s.parts) {
      data.set(p, offset);
      offset += p.length;
    }
    this.cancel();
    return data;
  }
  cancel(): void {
    this.state = undefined;
  }
}

export function encodeBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function decodeBase64(
  text: string,
  maxBytes: number = LIMITS.chunkBytes,
): Uint8Array {
  if (
    text.length > Math.ceil(maxBytes / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      text,
    )
  )
    throw new ProtocolError("INVALID_BASE64");
  const binary = atob(text);
  if (binary.length > maxBytes) throw new ProtocolError("CHUNK_TOO_LARGE");
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
/** Framing is internal to the ordered RTC channel; individual wire messages never exceed its negotiated bound. */
export function encodeFrames(
  value: unknown,
  maxBytes: number = LIMITS.chunkBytes,
): string[] {
  const limit = Math.min(maxBytes, LIMITS.chunkBytes);
  if (!Number.isInteger(limit) || limit < 1024)
    throw new ProtocolError("MESSAGE_SIZE_TOO_SMALL");
  const text = JSON.stringify(value),
    data = new TextEncoder().encode(text);
  if (data.length > LIMITS.controlBytes) throw new ProtocolError("CONTROL_TOO_LARGE");
  if (data.length <= limit) return [text];
  const transferId = crypto.randomUUID(),
    size = data.length,
    chunkSize = Math.floor(((limit - 256) * 3) / 4),
    frames = [JSON.stringify({ type: "frame.begin", transferId, size })];
  let index = 0;
  for (let offset = 0; offset < data.length; offset += chunkSize)
    frames.push(
      JSON.stringify({
        type: "frame.chunk",
        transferId,
        index: index++,
        data: encodeBase64(data.subarray(offset, offset + chunkSize)),
      }),
    );
  frames.push(JSON.stringify({ type: "frame.end", transferId }));
  return frames;
}
export class FrameReceiver {
  private readonly assembler: ChunkAssembler;
  constructor(now: () => number = Date.now) {
    this.assembler = new ChunkAssembler(now);
  }
  push(text: string): unknown | undefined {
    if (
      typeof text !== "string" ||
      new TextEncoder().encode(text).length > LIMITS.chunkBytes
    )
      throw new ProtocolError("FRAME_TOO_LARGE");
    const value = JSON.parse(text),
      m = object(value);
    if (m.type === "frame.begin") {
      // The channel is ordered: a new frame set means the previous partial one was abandoned by its sender.
      this.assembler.cancel();
      if (
        !identifier(m.transferId) ||
        !Number.isSafeInteger(m.size) ||
        Number(m.size) > LIMITS.controlBytes
      )
        throw new ProtocolError("INVALID_FRAME");
      this.assembler.begin(m.transferId, Number(m.size));
      return;
    }
    if (m.type === "frame.chunk") {
      if (
        !identifier(m.transferId) ||
        !Number.isSafeInteger(m.index) ||
        typeof m.data !== "string"
      )
        throw new ProtocolError("INVALID_FRAME");
      this.assembler.chunk(m.transferId, Number(m.index), decodeBase64(m.data));
      return;
    }
    if (m.type === "frame.end") {
      if (!identifier(m.transferId)) throw new ProtocolError("INVALID_FRAME");
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          this.assembler.finish(m.transferId),
        ),
      );
    }
    return value;
  }
  clear(): void {
    this.assembler.cancel();
  }
}

export { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION };
export const CAMERA_OPERATIONS = ["camera.shot", "camera.stop", "camera.status"] as const;
/** Why a shot ended: manual camera input, a mode change, a map change, Stop, revoked access, a disconnect, or its end. */
export const CAMERA_SHOT_ENDED = ["manual", "mode", "map", "stopped", "revoked", "disconnected", "done"] as const;
export type CameraShotEnded = (typeof CAMERA_SHOT_ENDED)[number];
export type CameraVec3 = [number, number, number];
/** One point of a shot: where the camera stands (`at`) and the world point it looks at (`look`), in game units. */
export interface CameraShotPoint { at: CameraVec3; look: CameraVec3 }
export interface CameraShotSpec { points: CameraShotPoint[]; seconds: number; hold?: number }
/** `camera.shot`'s reply: the new shot, the layout revision it was admitted at, and the shot it replaced, if one ran. */
export interface CameraShotReceipt { shotId: string; revision: number; replaced?: string }
export interface CameraStopReceipt { stopped: string | null }
/** `camera.status`: the running shot (or the last one, with `ended`), seconds elapsed; `shot` null before any shot. */
export interface CameraShotStatus { shot: string | null; t: number; ended?: CameraShotEnded }

const cameraRefusal = (): never => { throw new ProtocolError("INVALID_ARGUMENT"); };
const bounded = (value: unknown, range: { min: number; max: number }): number =>
  typeof value === "number" && Number.isFinite(value) && value >= range.min && value <= range.max ? value : cameraRefusal();
const vec3 = (value: unknown): CameraVec3 =>
  Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === "number" && Number.isFinite(n))
    ? [value[0], value[1], value[2]] : cameraRefusal();
const only = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) cameraRefusal();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).some((k) => !keys.includes(k))) cameraRefusal();
  return r;
};
/** A shot's arguments, checked against the bounds above and copied; anything else refuses INVALID_ARGUMENT. */
export function parseCameraShot(value: unknown): CameraShotSpec {
  const r = only(value, ["points", "seconds", "hold"]);
  const points = r.points;
  if (!Array.isArray(points) || points.length < CAMERA_SHOT_POINTS_ADAPTATION.min || points.length > CAMERA_SHOT_POINTS_ADAPTATION.max)
    cameraRefusal();
  const spec: CameraShotSpec = {
    points: (points as unknown[]).map((p) => {
      const q = only(p, ["at", "look"]);
      if (!Object.hasOwn(q, "at") || !Object.hasOwn(q, "look")) cameraRefusal();
      return { at: vec3(q.at), look: vec3(q.look) };
    }),
    seconds: bounded(r.seconds, CAMERA_SHOT_SECONDS_ADAPTATION),
  };
  if (Object.hasOwn(r, "hold")) spec.hold = bounded(r.hold, CAMERA_SHOT_HOLD_ADAPTATION);
  return spec;
}
/** `camera.stop` and `camera.status` take an empty object. */
export function parseCameraEmpty(value: unknown): Record<string, never> {
  only(value, []);
  return {};
}
