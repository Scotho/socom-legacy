/** Browser adaptation: policy limits and typed page authority, never simulation rules. */
export const LIMITS = Object.freeze({
  controlBytes: 65536,
  chunkBytes: 16384,
  transferBytes: 2097152,
  transferIdleMs: 30000,
  transferAbsoluteMs: 120000,
  invitationMs: 300000,
  sessionIdleMs: 1800000,
  sessionAbsoluteMs: 28800000,
  queuedCommands: 8,
  commandsPerSecond: 4,
  commandBurst: 8,
  requestMs: 30000,
  receipts: 4096,
  scenarioMs: 60000,
});
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
});
export interface AgentRequest {
  version: 1;
  requestId: string;
  sessionId: string;
  targetId: string;
  epoch: string;
  expectedRevision?: number;
  operation: string;
  args: unknown;
}
export interface AgentResult {
  requestId: string;
  revision: number;
  outcome: "ok" | "refused" | "unknown";
  code?: string;
  data?: unknown;
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
  | { type: "revoke" };
export type SignalToPage =
  | {
      type: "pending";
      pendingId: string;
      clientName: string;
      comparisonCode: string;
      permissions: Permission[];
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
  | { type: "revoked"; reason: string };
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

/**
 * R5-A (a browser adaptation, no original): the agent's cinematic camera shot. The agent submits a shot ONCE -- its
 * points and its duration -- and the page plays it frame by frame (no per-command teleport loop); manual camera input, a
 * mode or map change, Stop, a revocation or a disconnect end it. The bounds are this adaptation's own choices, not the
 * game's (docs/specs/2026-10-25-forge-camera-shot.md); the page refuses a point off its map as OUT_OF_BOUNDS.
 */
export const CAMERA_SHOT_POINTS_ADAPTATION = Object.freeze({ min: 2, max: 64 });
/** Seconds of motion from the first point to the last. */
export const CAMERA_SHOT_SECONDS_ADAPTATION = Object.freeze({ min: 1, max: 120 });
/** Seconds held at the last point once the motion is done. */
export const CAMERA_SHOT_HOLD_ADAPTATION = Object.freeze({ min: 0, max: 10 });
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
