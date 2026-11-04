/**
 * A scenario file (`tools/harness/scenarios/<name>.json`), plan section 2.1.
 *
 * The pad is a list of keyframes. A keyframe holds until the next one. An event-relative frame (`prompt+0`,
 * `climb+17`) resolves on the side that is playing, from that side's own readout (PH.R3). The expanded pad is
 * also a per-frame text log, one line a frame, so two scripts diff as text (the 2026-10-22 pass, folded into the
 * format here; PH-1's run that would record a live recomp log is not this slice).
 */
import { fieldSet, SchemaRefusal } from './schema';

export class ScenarioRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioRefusal';
  }
}

export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** `teleport` places the body. `walk-from-slot` needs the slot-8 savestate (H278) and is not run here. */
  how: 'teleport' | 'walk-from-slot';
}

export interface PadKeyframe {
  /** An absolute frame, or `<event>+<n>` / `<event>-<n>` (n = 0 written `+0`). */
  frame: number | string;
  /** Button word. Omitted: hold the previous keyframe's word. */
  b?: string;
  lx?: number;
  ly?: number;
  rx?: number;
  ry?: number;
}

export interface OutcomeSpec {
  id: string;
  /** Where the row is read, relative to an edge. `end` is the last aligned frame. */
  at: 'press' | 'before-press' | 'press+1' | 'end' | 'before-place';
  field: string;
  equals: string | number;
}

export interface Scenario {
  schema: 1;
  name: string;
  /**
   * `synthetic-flat` and `synthetic-crate` are recorder worlds with no disc (a browser adaptation).
   * Any other map is a disc map and the runner skips without fixtures.
   */
  map: string;
  revision: string;
  spawn: Spawn;
  seed: number | null;
  frameHz: number;
  pad: PadKeyframe[];
  events: Record<string, string>;
  stop: { after?: string; orFrames: number };
  fields: string;
  cites?: Record<string, string>;
  outcomes?: OutcomeSpec[];
}

export interface PadState {
  b: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

const NEUTRAL: PadState = { b: 0, lx: 128, ly: 128, rx: 128, ry: 128 };

const EVENT_EXPR = new Set([
  'traversal.prompt != null',
  'action == climb',
  'action == place',
  'action == none',
  'holding != null',
]);

const TOP_KEYS = new Set(['schema', 'name', 'map', 'revision', 'spawn', 'seed', 'frameHz', 'pad', 'events', 'stop', 'fields', 'cites', 'outcomes']);
const AT = new Set(['press', 'before-press', 'press+1', 'end', 'before-place']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function refuse(message: string): never {
  throw new ScenarioRefusal(message);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) refuse(`${what} must be a finite number`);
  return v;
}

function stick(v: unknown, what: string): number {
  const n = num(v, what);
  if (!Number.isInteger(n) || n < 0 || n > 255) refuse(`${what} must be an integer 0..255`);
  return n;
}

function buttonWord(v: string, what: string): number {
  if (!/^0x[0-9a-fA-F]{1,4}$/.test(v)) refuse(`${what} must be a hex button word (0x0000..0xffff)`);
  return Number.parseInt(v, 16);
}

/** `prompt+0`, `climb+17`, `climb-1`, or an absolute frame number. */
export function parseFrameRef(frame: number | string): { event: string | null; at: number } {
  if (typeof frame === 'number') {
    if (!Number.isInteger(frame) || frame < 0) refuse(`frame ${frame} must be an integer >= 0`);
    return { event: null, at: frame };
  }
  const m = /^([A-Za-z][A-Za-z0-9_]*)([+-])(\d+)$/.exec(frame);
  if (!m) refuse(`frame ${JSON.stringify(frame)} is not an absolute frame or <event>+<n>`);
  const delta = Number(m[3]);
  return { event: m[1]!, at: m[2] === '-' ? -delta : delta };
}

export function parseScenario(text: string): Scenario {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    refuse(`scenario JSON: ${(e as Error).message}`);
  }
  if (!isObject(raw)) refuse('scenario is not an object');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) refuse(`unknown scenario field ${k}`);
  if (raw.schema !== 1) refuse('scenario schema must be 1');
  if (typeof raw.name !== 'string' || !raw.name) refuse('scenario name is missing');
  if (typeof raw.map !== 'string' || !raw.map) refuse('scenario map is missing');
  if (typeof raw.revision !== 'string' || !raw.revision) refuse('scenario revision is missing');
  if (!isObject(raw.spawn)) refuse('scenario spawn is missing');
  for (const k of Object.keys(raw.spawn)) if (!['x', 'y', 'z', 'yaw', 'how'].includes(k)) refuse(`unknown spawn field ${k}`);
  const how = raw.spawn.how;
  if (how !== 'teleport' && how !== 'walk-from-slot') refuse('spawn.how must be teleport or walk-from-slot');
  const spawn: Spawn = {
    x: num(raw.spawn.x, 'spawn.x'), y: num(raw.spawn.y, 'spawn.y'), z: num(raw.spawn.z, 'spawn.z'),
    yaw: num(raw.spawn.yaw, 'spawn.yaw'), how,
  };
  if (raw.seed !== null && (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed))) refuse('seed must be null or a finite number');
  const frameHz = num(raw.frameHz, 'frameHz');
  if (!(frameHz > 0)) refuse('frameHz must be > 0');
  const events: Record<string, string> = {};
  if (raw.events !== undefined) {
    if (!isObject(raw.events)) refuse('events must be an object');
    for (const [name, expr] of Object.entries(raw.events)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) refuse(`event name ${name} is not an identifier`);
      if (typeof expr !== 'string' || !EVENT_EXPR.has(expr)) refuse(`event ${name} has an unknown expression ${JSON.stringify(expr)}`);
      events[name] = expr;
    }
  }
  if (!Array.isArray(raw.pad) || raw.pad.length === 0) refuse('pad must be a non-empty list of keyframes');
  const pad: PadKeyframe[] = raw.pad.map((row, i) => {
    if (!isObject(row)) refuse(`pad[${i}] is not an object`);
    for (const k of Object.keys(row)) if (!['frame', 'b', 'lx', 'ly', 'rx', 'ry'].includes(k)) refuse(`pad[${i}] has unknown field ${k}`);
    if (row.frame === undefined) refuse(`pad[${i}] has no frame`);
    const ref = parseFrameRef(row.frame as number | string);
    if (ref.event && !events[ref.event]) refuse(`pad[${i}] names event ${ref.event}, which is not in events`);
    const key: PadKeyframe = { frame: row.frame as number | string };
    if (row.b !== undefined) {
      if (typeof row.b !== 'string') refuse(`pad[${i}].b must be a hex string`);
      buttonWord(row.b, `pad[${i}].b`);
      key.b = row.b;
    }
    if (row.lx !== undefined) key.lx = stick(row.lx, `pad[${i}].lx`);
    if (row.ly !== undefined) key.ly = stick(row.ly, `pad[${i}].ly`);
    if (row.rx !== undefined) key.rx = stick(row.rx, `pad[${i}].rx`);
    if (row.ry !== undefined) key.ry = stick(row.ry, `pad[${i}].ry`);
    return key;
  });
  let prevAbs = -1;
  for (const key of pad) {
    const ref = parseFrameRef(key.frame);
    if (ref.event) continue;
    if (ref.at < prevAbs) refuse('absolute pad frames must be non-decreasing');
    prevAbs = ref.at;
  }
  if (!isObject(raw.stop)) refuse('stop is missing');
  for (const k of Object.keys(raw.stop)) if (!['after', 'orFrames'].includes(k)) refuse(`unknown stop field ${k}`);
  const orFrames = num(raw.stop.orFrames, 'stop.orFrames');
  if (!Number.isInteger(orFrames) || orFrames < 1) refuse('stop.orFrames must be an integer >= 1');
  let after: string | undefined;
  if (raw.stop.after !== undefined) {
    if (typeof raw.stop.after !== 'string' || !events[raw.stop.after]) refuse('stop.after must name an event');
    after = raw.stop.after;
  }
  if (typeof raw.fields !== 'string') refuse('fields must name a field set');
  try {
    fieldSet(raw.fields);
  } catch (e) {
    if (e instanceof SchemaRefusal) refuse(e.message);
    throw e;
  }
  let cites: Record<string, string> | undefined;
  if (raw.cites !== undefined) {
    if (!isObject(raw.cites)) refuse('cites must be an object');
    cites = {};
    for (const [k, v] of Object.entries(raw.cites)) {
      if (typeof v !== 'string' || !v) refuse(`cites.${k} must be a non-empty string`);
      cites[k] = v;
    }
  }
  let outcomes: OutcomeSpec[] | undefined;
  if (raw.outcomes !== undefined) {
    if (!Array.isArray(raw.outcomes)) refuse('outcomes must be a list');
    const set = fieldSet(raw.fields);
    outcomes = raw.outcomes.map((row, i) => {
      if (!isObject(row)) refuse(`outcomes[${i}] is not an object`);
      if (typeof row.id !== 'string' || !row.id) refuse(`outcomes[${i}].id is missing`);
      if (typeof row.at !== 'string' || !AT.has(row.at)) refuse(`outcomes[${i}].at is not a known place`);
      if (typeof row.field !== 'string' || !set.some((f) => f.name === row.field)) refuse(`outcomes[${i}].field is not in the field set`);
      if (typeof row.equals !== 'string' && typeof row.equals !== 'number') refuse(`outcomes[${i}].equals must be a string or a number`);
      return { id: row.id, at: row.at as OutcomeSpec['at'], field: row.field, equals: row.equals };
    });
  }
  return {
    schema: 1, name: raw.name, map: raw.map, revision: raw.revision, spawn, seed: raw.seed as number | null,
    frameHz, pad, events, stop: { ...(after ? { after } : {}), orFrames }, fields: raw.fields,
    ...(cites ? { cites } : {}), ...(outcomes ? { outcomes } : {}),
  };
}

/** The frame a keyframe falls on, once `fired` knows when each event happened, or null while the event is ahead. */
export function resolveKeyframe(frame: number | string, fired: Readonly<Record<string, number>>): number | null {
  const ref = parseFrameRef(frame);
  if (!ref.event) return ref.at;
  const at = fired[ref.event];
  if (at === undefined) return null;
  const n = at + ref.at;
  return n < 0 ? null : n;
}

/** The pad at `frame`, holding each resolved keyframe until the next. Unresolved event frames are ignored. */
export function padAt(scenario: Scenario, frame: number, fired: Readonly<Record<string, number>>): PadState {
  let state: PadState = { ...NEUTRAL };
  let best = -1;
  for (const key of scenario.pad) {
    const at = resolveKeyframe(key.frame, fired);
    if (at === null || at > frame || at < best) continue;
    // File order: a later keyframe on the same frame wins, because it is applied second.
    best = at;
    state = {
      b: key.b !== undefined ? buttonWord(key.b, 'b') : state.b,
      lx: key.lx ?? state.lx, ly: key.ly ?? state.ly, rx: key.rx ?? state.rx, ry: key.ry ?? state.ry,
    };
  }
  return state;
}

export function formatPadWord(b: number): string {
  return `0x${(b & 0xffff).toString(16).padStart(4, '0')}`;
}

/** One line a frame: `frame b lx ly rx ry`. A `#` line is a header, not a frame. */
export function formatPadLog(scenario: Scenario, frames: readonly PadState[]): string {
  const lines = [
    `# scenario ${scenario.name}`,
    '# one line a frame: frame b lx ly rx ry',
    ...frames.map((p, frame) => `${frame} ${formatPadWord(p.b)} ${p.lx} ${p.ly} ${p.rx} ${p.ry}`),
  ];
  return `${lines.join('\n')}\n`;
}

export interface LiveSignals {
  prompt: boolean;
  action: 'climb' | 'place' | 'none';
  holding: boolean;
}

/** Whether the event expression is true of this frame's readout. The expression was checked at parse. */
export function eventFires(expr: string, s: LiveSignals): boolean {
  switch (expr) {
    case 'traversal.prompt != null': return s.prompt;
    case 'action == climb': return s.action === 'climb';
    case 'action == place': return s.action === 'place';
    case 'action == none': return s.action === 'none';
    case 'holding != null': return s.holding;
    default: return false;
  }
}
