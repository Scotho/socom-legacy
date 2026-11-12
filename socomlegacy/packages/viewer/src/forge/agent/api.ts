import { assertJsonData, FORGE_OPERATIONS, RULES_INLINE_BYTES, validateSchema } from '@s2u/forge-agent-protocol';
import type { HistoryActor } from '../history';
import type { LayoutRecord } from '../record';
import type { ForgeRulesDraft } from '../rulesAuthoring';
import type { OperationRegistry } from '../shell/operations';
import type { MapIssue } from '../validate';
import { FORGE_PLAY_OPERATIONS, type ForgePlayState } from './play';
import { parseCameraShot,
  type CameraShotReceipt, type CameraShotSpec } from '@s2u/forge-agent-protocol';
import { shotAdmission, type ShotBounds, type ShotDriver, type ShotEnded } from '../camera/driver';

/**
 * FUI-1 (the review's UX-2; a browser adaptation): the snapshot's catalogue, issues and view, typed as the page builds them
 * (`./editorFacade` `agentSnapshot`, LATER 422), so a panel reads what the agent reads. A section the facade did not fill -- a blocked or
 * disposed read answers `{}` -- is `ForgeAgentUnread`: its discriminating field is absent.
 */
export type ForgeAgentUnread<Field extends string> = { readonly [field: string]: unknown } & { readonly [K in Field]?: undefined };
export interface ForgeAgentCatalogue {
  archives: { stem: string; label: string; campaign: boolean }[];
  /** The palette archive's props (`../library` `PaletteEntry`). */
  palette: { asset: string; model: string; placed: number }[];
  characters: { side: 'seal' | 'terrorist'; type: number; label: string }[];
  absent: string[];
  paletteArchive: string;
  chosen: string | null;
  npcChoice: { side: 'seal' | 'terrorist'; type: number } | null;
  favourites: string[];
  filter: 'all' | 'favs' | 'characters';
  query: string;
  loading: boolean;
  baseReady: boolean;
  basePlacements: { key: string; model: string; at: number[] }[];
  hidden: string[];
  /** The base map's own bomb start and its MPBOMB actions, as the disc's map carries them (`../../loadMap`). */
  objectives: { bombStart: [number, number, number] | null; bombSites: unknown[] };
}
/** The editor's switches the view carries (`../page` `VIEW_TOGGLES`). */
export type ForgeAgentViewToggle = 'wireframe' | 'untextured' | 'collision' | 'grid' | 'spawns' | 'fog' | 'shadows' | 'detail' | 'billboards'
  | 'alternate' | 'blendgraded' | 'engineorder' | 'ps2';
export type ForgeAgentView = Record<ForgeAgentViewToggle, boolean> & {
  revision: number;
  snap: boolean;
  gridStep: number;
  turnStep: number;
  tool: 'select' | 'place' | 'spawnA' | 'spawnB' | 'respawnA' | 'respawnB' | 'flare' | 'npc' | 'hostage' | 'zone' | 'point' | 'view' | 'turret' | 'door' | 'gate' | 'barrier' | 'ladder' | 'bomb' | 'siteSeal' | 'siteTerrorist' | 'switch' | 'ambient';
  gizmo: string;
  camera: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** The private scenario's status (`./play` `status`), null when none ran. */
  scenario: unknown;
  saves: { id: string; name: string; savedAt: number }[];
  /** The layout revision the issues were checked at; null when unchecked since. */
  issuesRevision: number | null;
  notes: string[];
};

/** Browser adaptation: a narrow, JSON-only editor boundary. Refs live for ONE revision, never across edits. */
export interface ForgeAgentSnapshot {
  ready: boolean;
  mode: 'forge-editor' | 'forge-play' | 'blocked';
  revision: number;
  layout: LayoutRecord | null;
  selection: string[];
  refs: unknown[];
  catalogue: ForgeAgentCatalogue | ForgeAgentUnread<'archives'>;
  issues: MapIssue[];
  view: ForgeAgentView | ForgeAgentUnread<'tool'>;
  canUndo: boolean;
  canRedo: boolean;
  /** Read-only private match observations; null before its actual mount is ready or after it ends. */
  play?: ForgePlayState | null;
  /** FCW-32: the layout's rules (`../rulesAuthoring`), which its record has no field for; null or absent when none. */
  rules?: ForgeRulesDraft | null;
}
/**
 * Browser adaptation: the cheap status a connection reads per request and per capture chunk -- no layout, catalogue or
 * refs built or cloned. `revision` is the layout's (the one an edit carries); `viewRevision` the camera's, palette's and tool's.
 */
export interface ForgeAgentStatus { ready: boolean; mode: ForgeAgentSnapshot['mode']; revision: number; viewRevision: number; name: string; map: string | null }
/**
 * AX-13 (plan item 13, a browser adaptation): the player's focus, `forge.focus`'s answer -- the world point (game units)
 * under their last left click in the viewport and its time (null before any, after a click on nothing, or after a new
 * base), the selection's refs (valid for `revision` only, the manual's rule) and the fly camera's pose.
 */
export interface ForgeAgentFocus {
  point: [number, number, number] | null;
  pointAt: number | null;
  selection: string[];
  camera: { x: number; y: number; z: number; yaw: number; pitch: number };
  revision: number;
}
export interface ForgeAgentActionResult { ok: boolean; code?: string; message?: string; revision: number; data?: unknown }
export interface ForgeAgentExecuteOptions {
  signal?: AbortSignal;
  /**
   * FUI-6 (a browser adaptation): who asks. Absent, the paired agent (its `sessionId` when the connection gives one); the
   * page's panels call as the person (`../page` `ctx.forge`). It names the history step, and changes no refusal or receipt.
   */
  actor?: HistoryActor;
  sessionId?: string;
}
export interface ForgeAgentApi {
  read(): ForgeAgentSnapshot;
  /** Browser adaptation: readiness, surface and revisions without a snapshot (see ForgeAgentStatus). */
  status(): ForgeAgentStatus;
  execute(operation: string, args: unknown, expectedRevision?: number, requestId?: string, options?: ForgeAgentExecuteOptions): Promise<ForgeAgentActionResult>;
  subscribe(listener: (snapshot: ForgeAgentSnapshot) => void): () => void;
  /** Re-pair boundary: invalidate admitted work and clear receipts belonging to the old connection. */
  resetSession(): void;
  /** Local pack/storage writes completed outside this facade: refresh caches and invalidate revision-scoped reads. */
  refreshExternalState(): void;
  dispose(): void;
  /** R5-B (a browser adaptation): an agent camera shot is running now (the agent chip's "Camera shot"). */
  shotRunning?(): boolean;
  /**
   * R5-B: the chip's "Stop camera" and the pad's Circle -- the running shot ended `stopped` at once, outside the
   * request queue; answers its id, or null when none ran. R6: a transport's revoke ends it `revoked` (its `reason`).
   */
  stopShot?(reason?: ShotEnded): string | null;
  /** AX-13: the player's focus (`ForgeAgentFocus`); null while the target is blocked or disposed. */
  focus?(): ForgeAgentFocus | null;
  /**
   * AX-16 (a browser adaptation): the base map's world box (the facade's `mapBounds`), which `target.capture`'s `top`
   * frames when nothing is placed; null with no base or on a page that cannot read it.
   */
  mapBounds?(): ShotBounds | null;
}
export class ForgeAgentError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface ForgeAgentPrepared {
  /** Commit synchronously, or call guard again immediately before every asynchronous commit. */
  commit(): unknown | Promise<unknown>;
  dispose(): void;
}
export interface ForgeAgentFacade {
  snapshot(): ForgeAgentSnapshot;
  /** Optional cheap status; without it the status is taken from `snapshot()` (uncloned). */
  status?(): ForgeAgentStatus;
  prepare(operation: string, args: Record<string, unknown>, guard: () => void, signal?: AbortSignal): Promise<ForgeAgentPrepared>;
  subscribe?(listener: () => void): () => void;
  cancel?(reason: string): void;
  refreshExternalState?(): void;
  /**
   * FUI-6: the page's operation registry (`../shell/operations`). An operation it holds (the layout edits) is staged
   * through it, not `prepare`: the same entry the page's own handlers run, one history step naming the actor.
   */
  operations?: OperationRegistry;
  /**
   * R5-A (a browser adaptation): the agent's cinematic camera driver (`../camera/driver`), constructed by the page with
   * its fly-camera setter and driven by its frame loop (round 5b). Absent or null: `camera.shot`, `camera.stop` and
   * `camera.status` refuse UNSUPPORTED.
   */
  shotDriver?: ShotDriver | null;
  /**
   * R5-A: the loaded map's world box a shot is checked against (OUT_OF_BOUNDS); null while no base is loaded
   * (NOT_READY). Only the page can read it, so it is the page's to give; absent or null, `camera.shot` refuses UNSUPPORTED.
   */
  mapBounds?: (() => ShotBounds | null) | null;
  /** AX-13: the player's focus, read synchronously (no queue, no guard: it changes nothing). */
  focus?(): ForgeAgentFocus;
}

/**
 * AX-1 (contract C1, ruling AX.R6): the dispatch allowlist and its schemas live in `@s2u/forge-agent-protocol`
 * (`FORGE_OPERATIONS`), the one source the gateway's manual publishes before pairing; this module validates against it.
 * This is the complete dispatch allowlist; no property names, global hooks or server-backed commands pass through.
 */
export const FORGE_AGENT_OPERATIONS = FORGE_OPERATIONS;
export { RULES_INLINE_BYTES };
/** The protocol's validator and strict JSON admission (moved from here, AX-1), under this module's old names. */
const validate = validateSchema, json = assertJsonData;
export type ForgeAgentOperationName = (typeof FORGE_AGENT_OPERATIONS)[number]['name'];
export function validateForgeAgentArguments(operation: string, args: unknown): void {
  const def = FORGE_AGENT_OPERATIONS.find((o) => o.name === operation);
  if (!def) throw new ForgeAgentError('UNKNOWN_OPERATION', operation);
  json(args); validate(args, def.inputSchema);
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** R5-A: the camera shot's operations, answered by the facade itself through the page's driver (never `prepare`). */
const CAMERA_SHOT_OPERATIONS: readonly string[] = ['camera.shot', 'camera.stop', 'camera.status'];
/** The agent's own explicit camera commands: each ends a running shot (`stopped`) before it sets the camera. */
const CAMERA_SET_OPERATIONS: readonly string[] = ['camera.pose', 'camera.look', 'camera.focus', 'camera.objective'];
/**
 * R8-4 (a browser adaptation): the stop lane's operation this facade answers itself -- the gateway's and the connection's
 * stop lanes pass camera.stop without waiting, so it is never chained on the serial queue behind a slow operation either.
 * The driver's stop is synchronous and idempotent (`../camera/driver` `stop`), safe beside a running operation; a
 * camera.shot admitted before a stop is refused CANCELLED rather than started after it.
 */
const STOP_LANE_OPERATIONS: readonly string[] = ['camera.stop'];

export function createForgeAgentApi(facade: ForgeAgentFacade, receiptLimit = 4096): ForgeAgentApi {
  let disposed = false;
  let shots = 0;
  /** R8-4: the camera.stops performed; a camera.shot admitted before one never starts after it. */
  let stops = 0;
  let generation = 0;
  let sessionAbort = new AbortController();
  let queue = Promise.resolve();
  const listeners = new Set<(snapshot: ForgeAgentSnapshot) => void>();
  const receipts = new Map<string, { digest: string; result: ForgeAgentActionResult }>();
  const read = (): ForgeAgentSnapshot => {
    const s = facade.snapshot();
    if (disposed || s.mode === 'blocked') return { ready: false, mode: 'blocked', revision: s.revision, layout: null,
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false };
    return clone(s);
  };
  const statusOf = (): ForgeAgentStatus => {
    if (facade.status) return facade.status();
    const s = facade.snapshot();
    const viewRevision = (s.view as { revision?: unknown } | null)?.revision;
    return { ready: s.ready, mode: s.mode, revision: s.revision, viewRevision: typeof viewRevision === 'number' ? viewRevision : 0,
      name: s.layout?.name ?? 'Forge', map: s.layout?.base ?? null };
  };
  const status = (): ForgeAgentStatus => {
    const s = statusOf();
    return disposed || s.mode === 'blocked' ? { ready: false, mode: 'blocked', revision: s.revision, viewRevision: s.viewRevision, name: 'Forge', map: null } : s;
  };
  const notify = (): void => { for (const listener of listeners) { try { listener(read()); } catch { /* one observer cannot break an edit */ } } };
  const unsubscribe = facade.subscribe?.(notify);
  const failure = (code: string, message: string): ForgeAgentActionResult => ({ ok: false, code, message, revision: statusOf().revision });
  async function run(operation: string, args: unknown, expectedRevision: number | undefined, requestId: string | undefined,
    admittedGeneration: number, signal: AbortSignal | undefined, sessionSignal: AbortSignal, actor: HistoryActor, admittedStops: number): Promise<ForgeAgentActionResult> {
    if (disposed) return failure('DISPOSED', 'The editor target has closed');
    const cancelled = (): boolean => admittedGeneration !== generation || sessionSignal.aborted || !!signal?.aborted;
    if (cancelled()) return failure('CANCELLED', 'The request or its connection was cancelled');
    const def = FORGE_AGENT_OPERATIONS.find((o) => o.name === operation);
    if (!def) return failure('UNKNOWN_OPERATION', 'No such Forge operation');
    try { json(args); validate(args, def.inputSchema); if (JSON.stringify(args).length > 2 * 1024 * 1024) throw new Error('Arguments exceed 2 MiB'); }
    catch (e) { return failure('INVALID_ARGUMENT', String(e)); }
    const parsed = clone(args) as Record<string, unknown>;
    const digest = JSON.stringify([operation, parsed, expectedRevision]);
    if (requestId !== undefined && (!requestId || requestId.length > 160)) return failure('INVALID_ARGUMENT', 'Invalid request ID');
    const old = requestId ? receipts.get(requestId) : undefined;
    if (statusOf().mode === 'blocked') return failure('BLOCKED', 'A live server lobby or match blocks this target');
    if (old) return old.digest === digest ? clone(old.result) : failure('REQUEST_ID_REUSED', 'Request ID already belongs to different arguments');
    // The guards compare the LAYOUT revision only: a camera, palette or tool change never makes a read or a write stale.
    const initial = statusOf();
    const guard = (): void => {
      if (disposed) throw new ForgeAgentError('DISPOSED', 'The editor target has closed');
      if (cancelled()) throw new ForgeAgentError('CANCELLED', 'The request or its connection was cancelled');
      const s = statusOf();
      if (s.mode === 'blocked') throw new ForgeAgentError('BLOCKED', 'A live server lobby or match blocks this target');
      if (def.mutates && (!Number.isSafeInteger(expectedRevision) || expectedRevision !== s.revision)) throw new ForgeAgentError('STALE_REVISION', 'Read the editor again before writing');
      if (!def.mutates && s.revision !== initial.revision) throw new ForgeAgentError('STALE_REVISION', 'The editor changed during this read');
      if (!s.ready && !['request.receipt', 'camera.stop', 'camera.status'].includes(operation)) throw new ForgeAgentError('NOT_READY', 'The editor is loading');
      if (s.mode === 'forge-play' && !['play.stop', 'walk.stop', 'layout.read', 'layout.export', 'catalogue.read', 'issues.read', 'request.receipt', 'camera.stop', 'camera.status', ...FORGE_PLAY_OPERATIONS].includes(operation)) throw new ForgeAgentError('PLAYING', 'Stop offline play before editing');
    };
    /** R5-A: the camera shot, staged here (Build only by the guard above: Walk and Play refuse PLAYING, a lobby BLOCKED). */
    const cameraShot = (): ForgeAgentPrepared => {
      const driver = facade.shotDriver ?? null;
      if (!driver) throw new ForgeAgentError('UNSUPPORTED', 'The camera shot is not available on this page');
      if (operation === 'camera.status') { const status = driver.status(); return { commit: () => status, dispose: () => undefined }; }
      if (operation === 'camera.stop') return { commit: () => { stops++; return { stopped: driver.stop('stopped') }; }, dispose: () => undefined };
      let spec: CameraShotSpec;
      try { spec = parseCameraShot(parsed); } catch { throw new ForgeAgentError('INVALID_ARGUMENT', 'Not a camera shot within its bounds'); }
      if (!facade.mapBounds) throw new ForgeAgentError('UNSUPPORTED', 'The camera shot is not available on this page');
      const bounds = facade.mapBounds();
      if (!bounds) throw new ForgeAgentError('NOT_READY', 'No map is loaded to frame a shot in');
      // R5-B: the page's check with the map's scale (it catches a look on its own point), then ONE walk of the path
      // for the box (OUT_OF_BOUNDS) and the fly camera's pitch limit (OUT_OF_RANGE).
      const finding = driver.check(spec);
      if (finding) throw new ForgeAgentError('INVALID_ARGUMENT', finding);
      const refusal = shotAdmission(spec, bounds, driver.sample);
      if (refusal) throw new ForgeAgentError(refusal.code, refusal.message);
      return { dispose: () => undefined, commit: () => {
        if (stops !== admittedStops) throw new ForgeAgentError('CANCELLED', 'A camera.stop sent after this shot ended it');
        const shotId = `shot-${++shots}`;
        const replaced = driver.start(spec, shotId);
        const receipt: CameraShotReceipt = { shotId, revision: statusOf().revision, ...(replaced ? { replaced } : {}) };
        return receipt;
      } };
    };
    let prepared: ForgeAgentPrepared | undefined;
    let result: ForgeAgentActionResult;
    try {
      guard();
      if (def.mutates && receipts.size >= receiptLimit) throw new ForgeAgentError('RECEIPT_CAPACITY', 'Receipt store is full; start a new target session');
      if (operation === 'request.receipt') {
        const receipt = receipts.get(parsed['requestId'] as string);
        return receipt ? clone(receipt.result) : failure('UNKNOWN_REQUEST', 'No receipt exists in this target epoch');
      }
      // Stop waiting promptly on disconnect; if I/O eventually finishes, dispose its unmounted objects exactly once.
      prepared = await new Promise<ForgeAgentPrepared>((resolve, reject) => {
        let finished = false;
        const clean = (): void => { signal?.removeEventListener('abort', abort); sessionSignal.removeEventListener('abort', abort); };
        const abort = (): void => {
          if (finished) return;
          finished = true; clean();
          try { guard(); } catch (e) { reject(e); }
        };
        signal?.addEventListener('abort', abort, { once: true });
        sessionSignal.addEventListener('abort', abort, { once: true });
        if (cancelled()) { abort(); return; }
        // FUI-6: a registered layout edit is the registry's entry (its guard is this one, then the revision's).
        const registered = facade.operations?.get(operation) ? facade.operations : null;
        const staging = CAMERA_SHOT_OPERATIONS.includes(operation)
          ? Promise.resolve().then(cameraShot)
          : registered
          ? registered.prepare(operation, parsed, { actor, guard, ...(expectedRevision === undefined ? {} : { expectedRevision }),
            ...(requestId ? { requestId } : {}), ...(signal ? { signal } : {}) })
          : facade.prepare(operation, parsed, guard, signal);
        staging.then((staged) => {
          if (finished) { staged.dispose(); return; }
          finished = true; clean(); resolve(staged);
        }, (e: unknown) => { if (!finished) { finished = true; clean(); reject(e); } });
      });
      guard();
      if (CAMERA_SET_OPERATIONS.includes(operation)) facade.shotDriver?.stop('stopped');
      const data = await prepared.commit();
      result = { ok: true, revision: statusOf().revision, ...(data === undefined ? {} : { data: clone(data) }) };
    } catch (e) { result = failure(e instanceof ForgeAgentError ? e.code : 'REFUSED', e instanceof Error ? e.message : String(e)); }
    finally { prepared?.dispose(); }
    if (def.mutates && requestId && admittedGeneration === generation && receipts.size < receiptLimit) receipts.set(requestId, { digest, result: clone(result) });
    notify();
    return result;
  }
  return { read, status, execute: (operation, args, revision, id, options) => {
    // Copy at admission: a caller cannot alter a queued payload.
    let input: unknown;
    try { json(args); input = clone(args); } catch (e) { return Promise.resolve(failure('INVALID_ARGUMENT', String(e))); }
    const admittedGeneration = generation, signal = options?.signal, sessionSignal = sessionAbort.signal;
    const actor: HistoryActor = options?.actor ?? { kind: 'agent', sessionId: options?.sessionId || null };
    const admittedStops = stops;
    // R8-4: the stop lane runs at once, beside whatever the queue is running; everything else is chained in order.
    if (STOP_LANE_OPERATIONS.includes(operation)) return run(operation, input, revision, id, admittedGeneration, signal, sessionSignal, actor, admittedStops);
    const task = queue.then(() => run(operation, input, revision, id, admittedGeneration, signal, sessionSignal, actor, admittedStops));
    queue = task.then(() => undefined, () => undefined);
    return task;
  }, subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  // R5-A: a re-pairing (every close of the connection: a disconnect or a revocation) and the target's disposal end a
  // running shot; the page may stop it first with the closer reason (`revoked`), and the driver keeps the first.
  resetSession: () => { generation++; sessionAbort.abort(); sessionAbort = new AbortController(); facade.shotDriver?.stop('disconnected'); facade.cancel?.('connection reset'); receipts.clear(); },
  refreshExternalState: () => { if (!disposed) { facade.refreshExternalState?.(); notify(); } },
  shotRunning: () => facade.shotDriver?.active() === true,
  stopShot: (reason = 'stopped') => facade.shotDriver?.stop(reason) ?? null,
  ...(facade.focus ? { focus: () => (disposed || statusOf().mode === 'blocked' ? null : clone(facade.focus!())) } : {}),
  mapBounds: () => (disposed ? null : facade.mapBounds?.() ?? null),
  dispose: () => { disposed = true; generation++; sessionAbort.abort(); facade.shotDriver?.stop('disconnected'); facade.cancel?.('target disposed'); unsubscribe?.(); listeners.clear(); receipts.clear(); } };
}
