import { noInput, type Input } from '../../gamepad';
import type { Pose } from '../../camera';
import type { LocalPackOptions } from '../../agent/localPacks';
import { CAMERA_SHOT_HOLD_ADAPTATION, CAMERA_SHOT_POINTS_ADAPTATION, CAMERA_SHOT_SECONDS_ADAPTATION, parseCameraShot,
  type CameraShotReceipt } from '@s2u/forge-agent-protocol';
import { shotAdmission, type ShotBounds, type ShotDriver, type ShotEnded } from '../../forge/camera/driver';

/** Browser adaptation: an allowlisted developer instrument. All game decisions stay in the normal input lanes. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface AgentMapInfo { archive: string; path: string; name: string }
export interface Destination { name: string; path: string; team: number | null; kind: string; feet: [number, number, number] }
export interface AgentMap extends AgentMapInfo {
  actions: readonly { node: string; path: string; type: string; team: number | null; at: readonly [number, number, number] }[];
  destinations: readonly Destination[];
}
export interface SoloHostState {
  scope: 'testroom' | 'other' | 'unknown';
  online: boolean | null;
  replay: boolean | null;
  visible: boolean;
  ready: boolean;
  /** False (or unknown) during Play: developer edits are build-only even in the solo loopback. */
  building: boolean | null;
  map: AgentMap | null;
  name: string;
  pose: Pose | null;
  feet: [number, number, number] | null;
  equipment: Json;
  action: Json;
  plant: Json;
}
export interface SoloSnapshot {
  ready: boolean;
  mode: 'testroom-solo' | 'blocked';
  buildAllowed: boolean;
  revision: number;
  map: AgentMapInfo | null;
  name: string;
  pose: Pose | null;
  feet: [number, number, number] | null;
  equipment: Json;
  objectives: Destination[];
  action: Json;
  plant: Json;
}
/** Refusal codes are the agent protocol's UPPER_SNAKE spellings (REVISION_CONFLICT, SURFACE_DENIED, INVALID_ARGUMENT, ...). */
export interface SoloResult { ok: boolean; code?: string; message?: string; revision: number; data?: Json }
export interface SoloTestroomDeps {
  localPacks?: LocalPackOptions;
  state(): SoloHostState;
  maps(): readonly AgentMapInfo[];
  /** Starts the actual loader. Completion is observed from frame(), never from an artificial delay. */
  loadMap(path: string): void;
  teleport(feet: [number, number, number], yaw?: number): boolean;
  setCamera(pose: Partial<Pose>): boolean;
  equip(item: 'rifle' | 'pistol' | 1 | 2 | 3): boolean;
  play?(on: boolean): void;
  armoryKey?(code: string): boolean;
  /**
   * Called with what the agent itself held, immediately, including between rendered frames: its held action and trigger
   * are cancelled; a human's own held action, trigger or stick never is (LATER 435, as the Forge Play port).
   */
  release(held: { action: boolean; fire: boolean }): void;
  now(): number;
  /**
   * R5-A (a browser adaptation): the agent's cinematic camera driver (`../../forge/camera/driver`), built by the install
   * code with the room's fly-camera setter (round 5b). This target drives it from `frame()` -- the install code never
   * calls its `frame` -- and ends it on Play (`mode`), a map change (`map`), the agent's own camera.set/teleport
   * (`stopped`), `revoke` (`revoked`), a fresh pairing or disposal (`disconnected`). The install code calls
   * `stop('manual')` on the person's camera input. Absent or null: camera.shot/stop/status refuse UNSUPPORTED.
   */
  shotDriver?: ShotDriver | null;
  /** R5-A: the loaded map's world box a shot is checked against; null while none is loaded. Absent: UNSUPPORTED. */
  mapBounds?: (() => ShotBounds | null) | null;
}
const axes = ['moveX', 'moveY', 'lookX', 'lookY'] as const;
const buttons = ['jump', 'crouch', 'prone', 'stance', 'fire', 'reload', 'action', 'swap1', 'swap2'] as const;
const inputProperties = Object.fromEntries([...axes.map((key) => [key, { type: 'number', minimum: -1, maximum: 1 }]), ...buttons.map((key) => [key, { type: 'boolean' }])]);
const objectSchema = (properties: object, required: readonly string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const stringSchema = { type: 'string', minLength: 1, maxLength: 256 };
const feetSchema = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const observationFields = ['map', 'feet', 'pose', 'equipment', 'action', 'plant', 'plant.state', 'plant.carrier', 'action.prompt', 'action.playerMode', 'action.playing'] as const;
const schemas = {
  'testroom.read': objectSchema({}), 'map.list': objectSchema({}),
  'map.load': objectSchema({ map: stringSchema, reload: { type: 'boolean' }, wait: { type: 'boolean', default: true } }, ['map']),
  teleport: objectSchema({ map: stringSchema, destination: stringSchema, feet: feetSchema, yaw: { type: 'number' } }),
  'camera.set': objectSchema(Object.fromEntries(['x', 'y', 'z', 'yaw', 'pitch'].map((k) => [k, { type: 'number' }]))),
  'input.set': objectSchema(inputProperties), 'input.release': objectSchema({}),
  'equipment.equip': objectSchema({ item: { enum: ['rifle', 'pistol', 1, 2, 3] } }, ['item']),
  'session.play': objectSchema({ on: { type: 'boolean' } }, ['on']),
  'armory.key': objectSchema({ code: { enum: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'] } }, ['code']),
  'action.press': objectSchema({}), 'action.hold': objectSchema({}), 'action.release': objectSchema({}), 'action.cancel': objectSchema({}),
  'scenario.start': objectSchema({ steps: { type: 'array', minItems: 1, maxItems: 32, items: objectSchema({ operation: stringSchema, args: { type: 'object' }, seconds: { type: 'number', minimum: 0, maximum: 60 } }, ['operation']) } }, ['steps']),
  'scenario.status': objectSchema({}), 'scenario.cancel': objectSchema({}),
  // R5-A (a browser adaptation): the cinematic camera, Build only, view only.
  'camera.shot': objectSchema({
    points: { type: 'array', minItems: CAMERA_SHOT_POINTS_ADAPTATION.min, maxItems: CAMERA_SHOT_POINTS_ADAPTATION.max,
      items: objectSchema({ at: feetSchema, look: feetSchema }, ['at', 'look']) },
    seconds: { type: 'number', minimum: CAMERA_SHOT_SECONDS_ADAPTATION.min, maximum: CAMERA_SHOT_SECONDS_ADAPTATION.max },
    hold: { type: 'number', minimum: CAMERA_SHOT_HOLD_ADAPTATION.min, maximum: CAMERA_SHOT_HOLD_ADAPTATION.max },
  }, ['points', 'seconds']),
  'camera.stop': objectSchema({}), 'camera.status': objectSchema({}),
} as const;
/** Read-only (and stop, which is never stale): no receipt, no revision needed. */
const UNRECEIPTED = ['testroom.read', 'map.list', 'scenario.status', 'camera.stop', 'camera.status'];
export type SoloOperation = keyof typeof schemas;
/** The transport can publish these concrete schemas without gaining access to any other viewer methods. */
export const SOLO_TESTROOM_OPERATIONS = Object.freeze(Object.entries(schemas).map(([name, inputSchema]) => Object.freeze({
  name: name as SoloOperation, inputSchema, mutates: !UNRECEIPTED.includes(name),
  adaptation: 'solo test-room developer instrument',
  description: name === 'input.set' ? 'Set normal pad lanes. Positive moveY is forward; buttons persist until released, cancelled or 30 seconds wall time.'
    : name === 'scenario.start' ? 'Run at most 32 steps on rendered frames, 60 seconds simulation and 30 seconds wall. Steps use input.set/release, action.press/hold/release/cancel, equipment.equip, teleport without map, camera.set, wait or observe. Each step has operation, optional args and seconds (duration, or observation timeout). Observe args are field and equals; fields: map,feet,pose,equipment,action,plant,plant.state,plant.carrier,action.prompt,action.playerMode,action.playing. Results report actual observations; completion alone does not prove a plant.'
    : name === 'teleport' ? 'Move the solo walker to explicit finite feet or a loaded map destination. Optional map waits for its actual load. Ambiguous bombsites return choices with actual names/team.'
    : name === 'map.load' ? 'Start an actual catalog map load. wait defaults to true; wait:false returns accepted/pending and desiredMap immediately. Poll testroom.read until ready and map.path matches desiredMap.path before issuing a separate teleport. Acceptance does not mean the map is ready.'
    : name === 'camera.set' ? 'Set the existing fly camera only. For on-foot positioning use teleport, which also moves the solo room body.'
    : name === 'session.play' ? 'Use the test-room Play toggle. Finish any resulting ARMORY with normal armory.key inputs.'
    : name === 'camera.shot' ? 'Play one smooth fly-camera shot in Build, submitted once: points [{at, look}] (2..64, inside the map), seconds 1..120, optional hold 0..10 at the last point. The room drives it on rendered frames; a second shot replaces it; the person\'s camera input, Play, a map change, camera.set, teleport or camera.stop end it.'
    : name === 'camera.stop' ? 'End the running camera shot; answers the stopped shot id or null.'
    : name === 'camera.status' ? 'Read the camera shot: its id, seconds elapsed and, once over, why it ended (manual, mode, map, stopped, revoked, disconnected or done).'
    : `Solo test-room ${name}. All normal game gates and outcomes remain authoritative.`,
})));
export interface SoloTestroomTarget {
  readonly localPacks?: LocalPackOptions;
  readonly operations: typeof SOLO_TESTROOM_OPERATIONS;
  read(): SoloSnapshot;
  execute(operation: string, args: unknown, expectedRevision?: number, requestId?: string, options?: { signal?: AbortSignal }): Promise<SoloResult>;
  subscribe(listener: (snapshot: SoloSnapshot) => void): () => void;
  cancel(reason?: string): void;
  revoke(reason?: string): void;
  /** Explicit fresh pairing only: drops old receipts and revocation, never bypasses live mode guards. */
  resetSession(): void;
  /** Refresh externally committed instrument metadata without resetting jobs, held input or duplicate receipts. */
  refreshExternalState(): void;
  dispose(): void;
  /** Called by the real rendered frame; never advances the simulation itself. */
  frame(dt: number): void;
  /**
   * R6 (the round 5b review): the shot's seams alone -- a running shot ended for the room's access (`revoked` /
   * `disconnected`), Play (`mode`) or a new map (`map`), exactly as the frame's own checks end it, without driving a frame.
   * The room's frame calls it before its takeover test, so entering Play or a map load is never read as `manual`.
   */
  shotSeams(): void;
  /** R6: end the running camera shot for `reason` (default `stopped`); answers its id, or null when none ran. */
  stopShot?(reason?: ShotEnded): string | null;
  /** A bounded contribution to the same mergeInput/playerLanes stream as the human pad. */
  input(): Input;
}
interface Step { operation: string; args: Record<string, Json>; seconds: number }
interface Job {
  jobId: string; state: 'running' | 'completed' | 'failed' | 'cancelled';
  step: number; elapsed: number; stepElapsed: number; started: boolean;
  steps: Step[]; results: Json[]; observations: Json[]; message: string | null;
  wallStart: number;
}
/** Browser adaptation: with nothing else changed, subscribers still hear once a second (the connection's idle-expiry clock). */
export const SOLO_NOTIFY_HEARTBEAT_MS = 1000;
const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const record = (v: unknown): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 256;
const point = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(finite);
/** JSON output has no live references, prototypes, NaN or undefined. */
export function soloJson(value: unknown): Json { return JSON.parse(JSON.stringify(value ?? null)) as Json; }
function safeJson(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return typeof value !== 'string' || value.length <= 4096;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 128 && value.every((v) => safeJson(v, depth + 1));
  return record(value) && Object.keys(value).length <= 32 && Object.entries(value).every(([k, v]) => !['__proto__', 'constructor', 'prototype'].includes(k) && safeJson(v, depth + 1));
}
const scenarioOperations = ['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'teleport', 'camera.set', 'observe', 'wait'];
function validSteps(value: Json | undefined): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32) return false;
  let duration = 0;
  for (const step of value) {
    if (!record(step) || Object.keys(step).some((key) => !['operation', 'args', 'seconds'].includes(key))) return false;
    if (!text(step.operation) || !scenarioOperations.includes(step.operation)) return false;
    if (own(step, 'seconds') && (!finite(step.seconds) || step.seconds < 0 || step.seconds > 60)) return false;
    const args = step.args ?? {};
    if (!record(args) || !validate(step.operation, args)) return false;
    if (step.operation === 'teleport' && own(args, 'map')) return false;
    duration += (step.seconds as number | undefined) ?? 0;
  }
  return duration <= 60;
}
function validate(operation: string, args: Record<string, Json>): boolean {
  const keys = Object.keys(args);
  const only = (allowed: readonly string[]) => keys.every((k) => allowed.includes(k));
  switch (operation) {
    case 'testroom.read': case 'map.list': case 'input.release': case 'action.press': case 'action.hold': case 'action.release': case 'action.cancel': case 'scenario.status': case 'scenario.cancel': return keys.length === 0;
    case 'map.load': return only(['map', 'reload', 'wait']) && text(args.map) && (!own(args, 'reload') || typeof args.reload === 'boolean') && (!own(args, 'wait') || typeof args.wait === 'boolean');
    case 'teleport': return only(['map', 'feet', 'destination', 'yaw']) && (!own(args, 'map') || text(args.map)) && (!own(args, 'yaw') || finite(args.yaw)) && ((point(args.feet) && !own(args, 'destination')) || (text(args.destination) && !own(args, 'feet')));
    case 'camera.set': return keys.length > 0 && only(['x', 'y', 'z', 'yaw', 'pitch']) && keys.every((k) => finite(args[k]));
    case 'input.set': return keys.length > 0 && only([...axes, ...buttons]) && keys.every((k) => (axes as readonly string[]).includes(k) ? finite(args[k]) && Math.abs(args[k] as number) <= 1 : typeof args[k] === 'boolean');
    case 'equipment.equip': return only(['item']) && ['rifle', 'pistol', 1, 2, 3].includes(args.item as string | number);
    case 'session.play': return only(['on']) && typeof args.on === 'boolean';
    case 'armory.key': return only(['code']) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'].includes(args.code as string);
    case 'observe': return only(['field', 'equals']) && (observationFields as readonly string[]).includes(args.field as string) && own(args, 'equals');
    case 'wait': return keys.length === 0;
    case 'scenario.start': return only(['steps']) && validSteps(args.steps);
    case 'camera.shot': try { parseCameraShot(args); return true; } catch { return false; }
    case 'camera.stop': case 'camera.status': return keys.length === 0;
    default: return false;
  }
}
function destinations(map: AgentMap | null): Destination[] {
  if (!map) return [];
  return [...map.actions.filter((a) => a.type.toUpperCase() === 'MPBOMB').map((a): Destination => ({ name: a.node, path: a.path, team: a.team, kind: 'bombsite', feet: [...a.at] })), ...map.destinations];
}

function configurationFields(value: Json, keys: readonly string[]): Json {
  return record(value) ? Object.fromEntries(keys.filter((key) => own(value, key)).map((key) => [key, value[key]!])) : {};
}
/** Browser adaptation: revisions protect edits and control configuration, not the simulation's running clock.
 * Play telemetry remains in every snapshot; motion, ammunition, swap interpolation and plant progress must not
 * invalidate a normal input command during its network trip. Build camera changes are human edits and do conflict. */
function configurationSignature(snapshot: SoloSnapshot, host: SoloHostState, shooting = false): string {
  const equipment = record(snapshot.equipment) ? snapshot.equipment : {};
  return JSON.stringify({
    ready: snapshot.ready, mode: snapshot.mode, buildAllowed: snapshot.buildAllowed,
    scope: host.scope, online: host.online, replay: host.replay, visible: host.visible,
    map: snapshot.map, name: snapshot.name, objectives: snapshot.objectives,
    player: configurationFields(snapshot.action, ['playerMode', 'playing', 'dead', 'locked']),
    equipment: {
      slots: equipment.slots ?? null, held: equipment.held ?? null,
      kit: configurationFields(equipment.kit ?? null, ['item']),
      armory: configurationFields(equipment.armory ?? null, ['ready', 'open', 'screen', 'column', 'committed', 'row', 'kits', 'valves', 'taking', 'profile']),
    },
    // R5-A: a running agent shot's own motion is not a human edit; it settles once, when the shot ends.
    buildPose: host.building === true ? { pose: shooting ? 'agent camera shot' : snapshot.pose, feet: snapshot.feet } : null,
  });
}

export function createSoloTestroomTarget(deps: SoloTestroomDeps): SoloTestroomTarget {
  let revision = 0, previous = '', revoked = '', disposed = false, epoch = 0, held = noInput(), jobNumber = 0;
  let job: Job | null = null;
  let shots = 0, shotMap: string | null = null;
  // Browser adaptation: one host read per rendered frame, shared by input(), frame() and the reads its subscribers make.
  let frames = 0, framing = false, notifiedKey = '', notifiedAt = -Infinity;
  let cached: { frame: number; value: SoloHostState } | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let jobExpiry: ReturnType<typeof setTimeout> | undefined;
  let loadWait: { path: string; resolve: (result: SoloResult) => void; timer: ReturnType<typeof setTimeout>; epoch: number } | null = null;
  const listeners = new Set<(snapshot: SoloSnapshot) => void>();
  const receipts = new Map<string, { signature: string; result: Promise<SoloResult> }>();
  const allowed = (state: SoloHostState) => !disposed && !revoked && state.scope === 'testroom' && state.online === false && state.replay === false && state.visible;
  function release(): void {
    const active = Object.values(held).some((v) => v !== 0 && v !== false);
    const was = { action: held.action === true, fire: held.fire === true };
    held = noInput();
    if (expiry !== undefined) clearTimeout(expiry);
    expiry = undefined;
    if (active) deps.release(was);
  }
  function cancel(reason = 'cancelled'): void {
    epoch++;
    release();
    if (job?.state === 'running') { job.state = 'cancelled'; job.message = reason; }
    if (jobExpiry !== undefined) clearTimeout(jobExpiry);
    jobExpiry = undefined;
    if (loadWait) { const pending = loadWait; loadWait = null; clearTimeout(pending.timer); pending.resolve(result(false, 'CANCELLED', reason)); }
  }
  function state(reuse = false): SoloHostState {
    if (reuse && cached && cached.frame === frames) return cached.value;
    let value: SoloHostState;
    try { value = deps.state(); } catch {
      value = { scope: 'unknown', online: null, replay: null, ready: false, building: null, visible: false, map: null, name: '', pose: null, feet: null, equipment: null, action: null, plant: null };
    }
    cached = { frame: frames, value };
    if (!allowed(value)) cancel(revoked || 'Solo test-room access is blocked');
    else if (!value.ready) release();
    return value;
  }
  /** The live snapshot with its revision settled; read() and notify() copy it once. */
  function snapshotOf(reuse: boolean): SoloSnapshot {
    const value = state(reuse);
    const snapshot: SoloSnapshot = {
      ready: allowed(value) && value.ready, mode: allowed(value) ? 'testroom-solo' : 'blocked', revision,
      buildAllowed: allowed(value) && value.building === true,
      map: value.map && { archive: value.map.archive, path: value.map.path, name: value.map.name },
      name: value.name, pose: value.pose, feet: value.feet, equipment: value.equipment,
      objectives: destinations(value.map), action: value.action, plant: value.plant,
    };
    const signature = configurationSignature(snapshot, value, !!deps.shotDriver?.active());
    if (signature !== previous) { previous = signature; snapshot.revision = ++revision; }
    return snapshot;
  }
  function read(): SoloSnapshot { return soloJson(snapshotOf(framing)) as unknown as SoloSnapshot; }
  const keyOf = (s: SoloSnapshot): string => JSON.stringify([s.revision, s.ready, s.mode, job?.jobId ?? null, job?.state ?? null, job?.step ?? null, loadWait?.path ?? null]);
  const result = (ok: boolean, code?: string, message?: string, data?: unknown): SoloResult => ({ ok, revision, ...(code ? { code } : {}), ...(message ? { message } : {}), ...(data === undefined ? {} : { data: soloJson(data) }) });
  /** Browser adaptation: a frame tells subscribers only of a revision, readiness, mode, job or load change (or the
   * heartbeat); explicit events always do. Nobody subscribed: no snapshot, signature or copy work at all. */
  function notify(force = true): void {
    if (!listeners.size) return;
    const snapshot = snapshotOf(framing), key = keyOf(snapshot), at = deps.now();
    if (!force && key === notifiedKey && at - notifiedAt < SOLO_NOTIFY_HEARTBEAT_MS) return;
    notifiedKey = key; notifiedAt = at;
    const copy = soloJson(snapshot) as unknown as SoloSnapshot;
    for (const fn of listeners) { try { fn(copy); } catch { /* A transport observer cannot stop the frame. */ } }
  }
  function armExpiry(): void {
    if (expiry !== undefined) clearTimeout(expiry);
    expiry = setTimeout(() => { cancel('30 second wall limit'); notify(); }, 30_000);
  }
  /** R5-A: end a running shot (a no-op when none runs; the driver keeps the first reason). */
  function endShot(reason: ShotEnded): void { if (deps.shotDriver?.active()) { deps.shotDriver.stop(reason); cached = null; } }
  /** R5-A (review): a shot's start or stop moves the revision once; settle it before the reply names it, whether or
   * not anyone is subscribed (notify() alone settles only for a subscriber). */
  function settleShot(): void { cached = null; snapshotOf(framing); notify(); }
  /** R6: a running shot ended for access, Play or a new map; true when it still runs (the frame may drive it). */
  function shotStands(current: SoloHostState): boolean {
    const driver = deps.shotDriver;
    if (!driver?.active()) return false;
    if (!allowed(current)) endShot(revoked ? 'revoked' : disposed ? 'disconnected' : 'mode');
    else if (current.building !== true) endShot('mode');
    else if (!current.ready || (current.map?.path ?? null) !== shotMap) endShot('map');
    else return true;
    return false;
  }
  /** R5-A: one rendered frame of the shot, or its end when the room left Build, the map changed or access closed. */
  function driveShot(current: SoloHostState, dt: number): void {
    const driver = deps.shotDriver;
    if (!driver || !shotStands(current)) return;
    driver.frame(finite(dt) && dt >= 0 ? dt : 0); cached = null;
  }
  function cameraShot(operation: string, args: Record<string, Json>): SoloResult {
    const driver = deps.shotDriver;
    if (!driver) return result(false, 'UNSUPPORTED', 'The camera shot is not available in this room');
    if (operation === 'camera.status') return result(true, undefined, undefined, driver.status());
    const current = state();
    if (!allowed(current)) return result(false, 'SURFACE_DENIED', revoked || 'Only a visible solo test room permits developer actions');
    if (operation === 'camera.stop') { const stopped = driver.stop('stopped'); settleShot(); return result(true, undefined, undefined, { stopped }); }
    if (current.building !== true) return result(false, 'BUILD_LOCKED', 'Stop Play before framing a camera shot');
    if (!current.ready) return result(false, 'NOT_READY', 'The current map is not ready');
    if (!deps.mapBounds) return result(false, 'UNSUPPORTED', 'The camera shot is not available in this room');
    const bounds = deps.mapBounds();
    if (!bounds) return result(false, 'NOT_READY', 'No map is loaded to frame a shot in');
    const spec = parseCameraShot(args);
    // R5-B: the install code's check with the room's scale, then one walk for the box and the pitch limit.
    const finding = driver.check(spec);
    if (finding) return result(false, 'INVALID_ARGUMENT', finding);
    const refusal = shotAdmission(spec, bounds, driver.sample);
    if (refusal) return result(false, refusal.code, refusal.message);
    const shotId = `solo-shot-${++shots}`;
    const replaced = driver.start(spec, shotId);
    shotMap = current.map?.path ?? null;
    settleShot();
    const receipt: CameraShotReceipt = { shotId, revision, ...(replaced ? { replaced } : {}) };
    return result(true, undefined, undefined, receipt);
  }
  function mutate(operation: string, args: Record<string, Json>): SoloResult {
    const current = state();
    if (!allowed(current)) return result(false, 'SURFACE_DENIED', revoked || 'Only a visible solo test room permits developer actions');
    if (['teleport', 'camera.set'].includes(operation) && current.building !== true) return result(false, 'BUILD_LOCKED', 'Stop Play before editing the test room');
    if (!current.ready) return result(false, 'NOT_READY', 'The current map and input lanes are not ready');
    // R5-A: the agent placing the camera or the walker itself takes over from a running shot.
    if (operation === 'teleport' || operation === 'camera.set') endShot('stopped');
    switch (operation) {
      case 'teleport': {
        let feet = args.feet as [number, number, number] | undefined;
        if (!feet) {
          const all = destinations(current.map), name = normalize(args.destination as string);
          const choices = all.filter((d) => normalize(d.name) === name || normalize(d.path) === name || (['bombsite', 'bomb site', 'bomb sites'].includes(name) && d.kind === 'bombsite'));
          if (choices.length !== 1) return result(false, choices.length > 1 ? 'AMBIGUOUS_DESTINATION' : 'UNKNOWN_DESTINATION', 'Choose an actual destination name or path', { choices: choices.length ? choices : all });
          feet = choices[0]!.feet;
        }
        if (!deps.teleport(feet, args.yaw as number | undefined)) return result(false, 'REFUSED', 'The current walker or solo room refused teleport');
        break;
      }
      case 'camera.set': if (!deps.setCamera(args as Partial<Pose>)) return result(false, 'REFUSED', 'Camera positioning requires the existing fly mode'); break;
      case 'equipment.equip': if (!deps.equip(args.item as 'rifle' | 'pistol' | 1 | 2 | 3)) return result(false, 'REFUSED', 'The normal equipment selection gate refused'); break;
      case 'session.play': if (!deps.play) return result(false, 'UNAVAILABLE'); release(); deps.play(args.on as boolean); break;
      case 'armory.key': if (!deps.armoryKey?.(args.code as string)) return result(false, 'REFUSED', 'The ARMORY did not take this menu key'); break;
      case 'input.set': held = { ...held, ...args } as Input; if (job?.state !== 'running') armExpiry(); break;
      case 'action.press': case 'action.hold': held.action = true; if (job?.state !== 'running') armExpiry(); break;
      case 'action.release': held.action = false; break;
      case 'action.cancel': case 'input.release': release(); break;
      default: return result(false, 'UNKNOWN_OPERATION');
    }
    cached = null; revision++; notify();
    return result(true, undefined, undefined, { accepted: true });
  }
  function loadMap(mapName: string, reload = false, wait = true): Promise<SoloResult> {
    if (loadWait || job?.state === 'running') return Promise.resolve(result(false, 'BUSY', 'A load or scenario is already active'));
    const matches = deps.maps().filter((map) => [map.name, map.archive, map.path].some((key) => normalize(key) === normalize(mapName)));
    if (matches.length !== 1) return Promise.resolve(result(false, matches.length ? 'AMBIGUOUS_MAP' : 'UNKNOWN_MAP', 'Select an actual map catalog entry', { choices: matches }));
    const map = matches[0]!;
    const host = state();
    if (!reload && host.ready && host.map?.path === map.path) return Promise.resolve(result(true, undefined, undefined, wait ? map : { accepted: true, pending: false, desiredMap: map }));
    release();
    // Browser adaptation: acceptance finishes this request; actual loader readiness remains observable in read().
    // No timer or continuation may teleport later on behalf of a nonblocking map request.
    if (!wait) {
      try {
        deps.loadMap(map.path); cached = null; revision++; notify();
        return Promise.resolve(result(true, undefined, undefined, { accepted: true, pending: true, desiredMap: map }));
      } catch { return Promise.resolve(result(false, 'LOAD_FAILED', 'The map loader refused')); }
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => { if (!loadWait) return; const pending = loadWait; loadWait = null; pending.resolve(result(false, 'LOAD_TIMEOUT', 'The actual map did not become ready within 30 seconds')); }, 30_000);
      loadWait = { path: map.path, resolve, timer, epoch };
      try { deps.loadMap(map.path); cached = null; revision++; notify(); } catch { clearTimeout(timer); loadWait = null; resolve(result(false, 'LOAD_FAILED', 'The map loader refused')); }
    });
  }
  function jobView(): Json { return soloJson(job && { jobId: job.jobId, state: job.state, step: job.step, elapsed: job.elapsed, results: job.results, observations: job.observations, message: job.message }); }
  async function run(operation: string, args: Record<string, Json>): Promise<SoloResult> {
    if (operation === 'testroom.read') return result(true, undefined, undefined, read());
    if (operation === 'scenario.status') return result(true, undefined, undefined, jobView());
    if (operation === 'camera.shot' || operation === 'camera.stop' || operation === 'camera.status') return cameraShot(operation, args);
    const current = state();
    if (!allowed(current)) return result(false, 'SURFACE_DENIED', revoked || 'Only a visible solo test room permits developer actions');
    if (['map.load', 'teleport', 'camera.set'].includes(operation) && current.building !== true) return result(false, 'BUILD_LOCKED', 'Stop Play before editing the test room');
    if (operation === 'map.list') return result(true, undefined, undefined, deps.maps());
    if (operation === 'scenario.cancel') { cancel('scenario cancelled'); notify(); return result(true, undefined, undefined, jobView()); }
    if (operation === 'map.load') return loadMap(args.map as string, args.reload === true, args.wait !== false);
    if (operation === 'teleport' && own(args, 'map')) {
      const before = epoch, loaded = await loadMap(args.map as string);
      if (!loaded.ok) return loaded;
      if (before !== epoch) return result(false, 'CANCELLED');
      if (!allowed(state())) return result(false, 'SURFACE_DENIED');
    }
    if (operation === 'scenario.start') {
      if (!current.ready) return result(false, 'NOT_READY');
      if (loadWait || job?.state === 'running') return result(false, 'BUSY', 'Only one scenario can run');
      release();
      job = { jobId: `solo-${++jobNumber}`, state: 'running', step: 0, elapsed: 0, stepElapsed: 0, started: false, wallStart: deps.now(), steps: (args.steps as Record<string, Json>[]).map((s) => ({ operation: s.operation as string, args: (s.args ?? {}) as Record<string, Json>, seconds: (s.seconds as number) ?? 0 })), results: [], observations: [], message: null };
      jobExpiry = setTimeout(() => { cancel('30 second wall limit'); notify(); }, 30_000);
      revision++; notify();
      return result(true, undefined, undefined, { jobId: job.jobId });
    }
    if (job?.state === 'running' && operation !== 'input.release' && operation !== 'action.cancel') return result(false, 'BUSY', 'Cancel the active scenario before taking manual control');
    if (operation === 'input.release' || operation === 'action.cancel') cancel('manual input release');
    return mutate(operation, args);
  }
  const api: SoloTestroomTarget = {
    localPacks: deps.localPacks,
    operations: SOLO_TESTROOM_OPERATIONS, read,
    execute(operation, args, expectedRevision, requestId, options) {
      read();
      if (options?.signal?.aborted) return Promise.resolve(result(false, 'CANCELLED'));
      if (!own(schemas, operation)) return Promise.resolve(result(false, 'UNKNOWN_OPERATION'));
      if (!safeJson(args) || !record(args) || JSON.stringify(args).length > 16_384 || !validate(operation, args) || (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) || (requestId !== undefined && (!text(requestId) || requestId.length > 128))) return Promise.resolve(result(false, 'INVALID_ARGUMENT'));
      const signature = JSON.stringify([operation, args, expectedRevision]);
      const keepReceipt = !UNRECEIPTED.includes(operation);
      if (requestId && keepReceipt) {
        const receipt = receipts.get(requestId);
        if (receipt) return receipt.signature === signature ? receipt.result : Promise.resolve(result(false, 'REQUEST_ID_REUSED'));
      }
      if (expectedRevision !== undefined && revision !== expectedRevision) return Promise.resolve(result(false, 'REVISION_CONFLICT', 'Read the current revision before retrying'));
      if (requestId && keepReceipt && receipts.size >= 256) return Promise.resolve(result(false, 'RECEIPT_LIMIT', 'Reconnect before sending more mutations'));
      // Admission is synchronous through the first await; duplicate requests reuse the same pending promise.
      const onAbort = () => { cancel('request aborted'); notify(); };
      options?.signal?.addEventListener('abort', onAbort, { once: true });
      const answer = run(operation, soloJson(args) as Record<string, Json>).catch(() => { cancel('operation failed'); return result(false, 'ACTION_FAILED', 'The actual viewer operation failed'); }).finally(() => options?.signal?.removeEventListener('abort', onAbort));
      if (requestId && keepReceipt) receipts.set(requestId, { signature, result: answer });
      return answer;
    },
    subscribe(fn) {
      const first = listeners.size === 0; listeners.add(fn);
      const snapshot = snapshotOf(framing);
      if (first) { notifiedKey = keyOf(snapshot); notifiedAt = deps.now(); }
      fn(soloJson(snapshot) as unknown as SoloSnapshot); return () => listeners.delete(fn);
    },
    cancel(reason) { cancel(reason); notify(); },
    revoke(reason = 'access revoked') { endShot('revoked'); revoked = reason; cancel(reason); notify(); },
    resetSession() { endShot('disconnected'); cancel('fresh session'); if (!disposed) revoked = ''; receipts.clear(); notify(); },
    refreshExternalState() { if (!disposed) { revision++; notify(); } },
    dispose() { if (disposed) return; endShot('disconnected'); disposed = true; cancel('disposed'); listeners.clear(); receipts.clear(); },
    input() { const current = state(true); return allowed(current) && current.ready ? { ...held } : noInput(); },
    frame(dt) {
      frames++; framing = true;
      try { advance(dt); } finally { framing = false; }
    },
    shotSeams() { if (deps.shotDriver?.active()) shotStands(state()); },
    stopShot(reason = 'stopped') { const id = deps.shotDriver?.stop(reason) ?? null; if (id) cached = null; return id; },
  };
  /** One rendered frame's work; frame() brackets it so a throwing lane never leaves the per-frame cache on. */
  function advance(dt: number): void {
    const current = state();
    driveShot(current, dt);
    if (!allowed(current)) { notify(false); return; }
    if (loadWait && current.ready && current.map?.path === loadWait.path) {
      const pending = loadWait; loadWait = null; clearTimeout(pending.timer);
      pending.resolve(pending.epoch === epoch ? result(true, undefined, undefined, current.map && { path: current.map.path, archive: current.map.archive, name: current.map.name }) : result(false, 'CANCELLED'));
    }
    if (job?.state === 'running') {
      if (!current.ready) { cancel('map or input lanes became unavailable'); notify(false); return; }
      const elapsed = finite(dt) && dt >= 0 ? dt : 0;
      job.elapsed += elapsed;
      if (job.elapsed > 60 || deps.now() - job.wallStart >= 30_000) { job.state = 'failed'; job.message = 'Scenario time limit'; release(); }
      else {
        const step = job.steps[job.step]!;
        const wasStarted = job.started;
        if (!job.started) {
          job.started = true; job.stepElapsed = 0;
          if (step.operation !== 'observe' && step.operation !== 'wait') {
            const answer = mutate(step.operation, step.args); job.results.push(soloJson({ step: job.step, operation: step.operation, result: answer }));
            if (!answer.ok) { job.state = 'failed'; job.message = answer.code ?? 'step refused'; release(); }
          }
        }
        if (job.state === 'running') {
          if (wasStarted) job.stepElapsed += elapsed;
          const snapshot = step.operation === 'observe' ? read() : null;
          const field = step.args.field as string;
          const parent = snapshot && field.includes('.') ? snapshot[field.split('.')[0] as keyof SoloSnapshot] : null;
          const observed = snapshot ? soloJson(field.includes('.') ? record(parent) ? parent[field.split('.')[1]!] : null : snapshot[field as keyof SoloSnapshot]) : null;
          const matched = step.operation === 'observe' && JSON.stringify(observed) === JSON.stringify(step.args.equals);
          if (matched || (wasStarted || !['input.set', 'action.press', 'action.hold'].includes(step.operation)) && job.stepElapsed >= step.seconds) {
            revision++;      // an explicit scenario step settled; its running clock is only telemetry
            if (step.operation === 'observe') job.observations.push(soloJson({ step: job.step, field: step.args.field, expected: step.args.equals, observed, matched }));
            if (step.operation === 'observe' && !matched) { job.state = 'failed'; job.message = 'Expected observation was not seen'; release(); }
            else { job.step++; job.started = false; if (job.step >= job.steps.length) { job.state = 'completed'; release(); } }
          }
        }
      }
    }
    if (job?.state !== 'running' && jobExpiry !== undefined) { clearTimeout(jobExpiry); jobExpiry = undefined; }
    notify(false);
  }
  return api;
}
