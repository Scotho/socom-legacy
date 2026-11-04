/**
 * An `s2t` trace: one JSON object a line (plan section 2.2). The first line is the header. Each later line is
 * one game frame. Values are numbers and names; a line holds no disc bytes (RS.R8).
 *
 * `retail` is never true. A recomp or PCSX2 trace is an emulated reference, and the header says so (PH.R7, PH.R8).
 */
import { createHash } from 'node:crypto';
import { PAD_PLACE, PAD_X } from './schema';

export class TraceRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TraceRefusal';
  }
}

export type TraceSide = 'port' | 'recomp' | 'console';
export type ReferenceStanding = 'port' | 'recomp-only' | 'validated' | 'emulated-console';

export interface ReferenceLabel {
  emulated: true;
  retail: false;
  /** Said on every report. Never a retail console. */
  label: string;
  standing: ReferenceStanding;
  /** Required when standing is `validated` (a KNOWN citation). Absent otherwise. */
  known?: string;
}

export interface TraceHeader {
  schema: 1;
  kind: 'header';
  side: TraceSide;
  scenario: string;
  fieldSet: string;
  revision: string;
  mapHash: string | null;
  /** The port's commit, or the recomp exe sha256 and the desktop commit. */
  build: { commit?: string; exeSha256?: string; desktopCommit?: string };
  /** The `PS2X_*` environment on a recomp trace; the recorder's step note on a port trace. */
  env: Record<string, string>;
  reference: ReferenceLabel;
}

export interface TracePad {
  b: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
}

export interface TraceFrame {
  schema: 1;
  kind: 'frame';
  frame: number;
  /** True when the source row was torn or unwound: the comparator masks the frame. */
  masked: boolean;
  maskWhy?: string;
  pad: TracePad;
  /** Schema field name -> value. Null is a side with no reading. Absent is unknown. */
  fields: Record<string, number | string | null>;
}

export interface Trace {
  header: TraceHeader;
  frames: TraceFrame[];
}

export interface Manifest {
  schema: 1;
  scenario: string;
  scenarioSha256: string;
  side: TraceSide;
  traceFile: string;
  traceSha256: string;
  inputsFile: string;
  portCommit: string | null;
  mapHash: string | null;
  /** What this run is. A port run is not a retail capture. */
  note: string;
}

const SIDES = new Set(['port', 'recomp', 'console']);
const STANDING = new Set(['port', 'recomp-only', 'validated', 'emulated-console']);

export function sha256Text(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function referenceFor(side: TraceSide, standing?: ReferenceStanding, known?: string): ReferenceLabel {
  if (standing === 'validated' && !known) throw new TraceRefusal('a validated reference needs its KNOWN citation');
  if (side === 'port') {
    return {
      emulated: true, retail: false, standing: 'port',
      label: 'browser client (headless). A reference trace is an emulated Unzipped recompilation or a PCSX2 capture, not a retail console',
    };
  }
  if (side === 'console') {
    return {
      emulated: true, retail: false, standing: standing ?? 'emulated-console', ...(known ? { known } : {}),
      label: 'emulated reference (PCSX2), not a retail console',
    };
  }
  return {
    emulated: true, retail: false, standing: standing ?? 'recomp-only', ...(known ? { known } : {}),
    label: 'emulated reference (Unzipped recompilation), not a retail console',
  };
}

function padOf(v: unknown, where: string): TracePad {
  if (typeof v !== 'object' || v === null) throw new TraceRefusal(`${where} pad is missing`);
  const p = v as Record<string, unknown>;
  const n = (k: string): number => {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k] as number)) throw new TraceRefusal(`${where} pad.${k} is not a number`);
    return p[k] as number;
  };
  const b = n('b');
  if (!Number.isInteger(b) || b < 0 || b > 0xffff) throw new TraceRefusal(`${where} pad.b is not a 16-bit word`);
  for (const k of ['lx', 'ly', 'rx', 'ry']) {
    const s = n(k);
    if (!Number.isInteger(s) || s < 0 || s > 255) throw new TraceRefusal(`${where} pad.${k} is not 0..255`);
  }
  return { b, lx: n('lx'), ly: n('ly'), rx: n('rx'), ry: n('ry') };
}

function headerOf(v: unknown): TraceHeader {
  if (typeof v !== 'object' || v === null) throw new TraceRefusal('the header is not an object');
  const h = v as Record<string, unknown>;
  if (h.schema !== 1 || h.kind !== 'header') throw new TraceRefusal('the first line is not an s2t header');
  if (typeof h.side !== 'string' || !SIDES.has(h.side)) throw new TraceRefusal('header side must be port, recomp or console');
  if (typeof h.scenario !== 'string' || !h.scenario) throw new TraceRefusal('header scenario is missing');
  if (typeof h.fieldSet !== 'string' || !h.fieldSet) throw new TraceRefusal('header fieldSet is missing');
  if (typeof h.revision !== 'string' || !h.revision) throw new TraceRefusal('header revision is missing');
  if (h.mapHash !== null && typeof h.mapHash !== 'string') throw new TraceRefusal('header mapHash must be a string or null');
  if (typeof h.build !== 'object' || h.build === null) throw new TraceRefusal('header build is missing');
  if (typeof h.env !== 'object' || h.env === null || Array.isArray(h.env)) throw new TraceRefusal('header env must be an object');
  const env: Record<string, string> = {};
  for (const [k, val] of Object.entries(h.env as Record<string, unknown>)) {
    if (typeof val !== 'string') throw new TraceRefusal(`header env.${k} must be a string`);
    env[k] = val;
  }
  if (typeof h.reference !== 'object' || h.reference === null) throw new TraceRefusal('header reference is missing');
  const r = h.reference as Record<string, unknown>;
  if (r.retail !== false) throw new TraceRefusal('header reference.retail must be false: this harness does not label a retail console (PH.R8, H280)');
  if (r.emulated !== true) throw new TraceRefusal('header reference.emulated must be true');
  if (typeof r.label !== 'string' || !r.label.toLowerCase().includes('not a retail console')) {
    throw new TraceRefusal('header reference.label must say this is not a retail console');
  }
  if (typeof r.standing !== 'string' || !STANDING.has(r.standing)) throw new TraceRefusal('header reference.standing is not a known standing');
  if (r.standing === 'validated' && (typeof r.known !== 'string' || !r.known)) {
    throw new TraceRefusal('a validated reference needs its KNOWN citation');
  }
  if ((h.side === 'recomp' || h.side === 'console') && r.standing === 'port') {
    throw new TraceRefusal('a recomp or console trace is a reference, not the port');
  }
  const build = h.build as Record<string, unknown>;
  return {
    schema: 1, kind: 'header', side: h.side as TraceSide, scenario: h.scenario, fieldSet: h.fieldSet,
    revision: h.revision, mapHash: h.mapHash as string | null,
    build: {
      ...(typeof build.commit === 'string' ? { commit: build.commit } : {}),
      ...(typeof build.exeSha256 === 'string' ? { exeSha256: build.exeSha256 } : {}),
      ...(typeof build.desktopCommit === 'string' ? { desktopCommit: build.desktopCommit } : {}),
    },
    env,
    reference: {
      emulated: true, retail: false, label: r.label, standing: r.standing as ReferenceStanding,
      ...(typeof r.known === 'string' ? { known: r.known } : {}),
    },
  };
}

function frameOf(v: unknown, index: number): TraceFrame {
  if (typeof v !== 'object' || v === null) throw new TraceRefusal(`frame ${index} is not an object`);
  const f = v as Record<string, unknown>;
  if (f.schema !== 1 || f.kind !== 'frame') throw new TraceRefusal(`line ${index + 1} is not a frame`);
  if (typeof f.frame !== 'number' || !Number.isInteger(f.frame) || f.frame !== index) {
    throw new TraceRefusal(`frame ${index} is numbered ${String(f.frame)}`);
  }
  if (typeof f.masked !== 'boolean') throw new TraceRefusal(`frame ${index} masked must be a boolean`);
  if (typeof f.fields !== 'object' || f.fields === null || Array.isArray(f.fields)) throw new TraceRefusal(`frame ${index} fields is missing`);
  const fields: Record<string, number | string | null> = {};
  for (const [k, val] of Object.entries(f.fields as Record<string, unknown>)) {
    if (val !== null && typeof val !== 'number' && typeof val !== 'string') throw new TraceRefusal(`frame ${index} field ${k} is not a number, a string or null`);
    if (typeof val === 'number' && !Number.isFinite(val)) throw new TraceRefusal(`frame ${index} field ${k} is not finite`);
    fields[k] = val as number | string | null;
  }
  return {
    schema: 1, kind: 'frame', frame: index, masked: f.masked, pad: padOf(f.pad, `frame ${index}`), fields,
    ...(typeof f.maskWhy === 'string' ? { maskWhy: f.maskWhy } : {}),
  };
}

export function parseTrace(text: string): Trace {
  const lines = text.split('\n').filter((l) => l.length > 0);
  if (lines.length < 1) throw new TraceRefusal('the trace is empty');
  let header: TraceHeader;
  try {
    header = headerOf(JSON.parse(lines[0]!));
  } catch (e) {
    if (e instanceof TraceRefusal) throw e;
    throw new TraceRefusal(`header JSON: ${(e as Error).message}`);
  }
  const frames: TraceFrame[] = [];
  for (let i = 1; i < lines.length; i++) {
    try {
      frames.push(frameOf(JSON.parse(lines[i]!), i - 1));
    } catch (e) {
      if (e instanceof TraceRefusal) throw e;
      throw new TraceRefusal(`frame JSON at line ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { header, frames };
}

export function formatTrace(trace: Trace): string {
  const header = JSON.stringify(trace.header);
  const frames = trace.frames.map((f) => JSON.stringify(f));
  return `${[header, ...frames].join('\n')}\n`;
}

/** The first frame where X or the place bit is down (PH.R3), or null when the script presses neither. */
export function pressEdge(frames: readonly TraceFrame[], bits = PAD_X | PAD_PLACE): number | null {
  for (const f of frames) if ((f.pad.b & bits) !== 0) return f.frame;
  return null;
}

/**
 * The first frame whose sticks leave neutral (any axis more than `STICK_EDGE` from 128), or null: the alignment of a run
 * with no X or place press (review-ph-run 3; PH-1's holds).
 */
/** The instrument's alignment threshold (a stick counts as moved past this), not the game's deadzone. */
export const STICK_EDGE = 16;
export function stickEdge(frames: readonly TraceFrame[]): number | null {
  for (const f of frames) if ([f.pad.lx, f.pad.ly, f.pad.rx, f.pad.ry].some((v) => Math.abs(v - 128) > STICK_EDGE)) return f.frame;
  return null;
}

/** The first frame where the place bit is down, or null. */
export function placeEdge(frames: readonly TraceFrame[]): number | null {
  return pressEdge(frames, PAD_PLACE);
}

export function manifestOf(opt: {
  scenarioName: string;
  scenarioText: string;
  traceText: string;
  traceFile: string;
  inputsFile: string;
  portCommit: string | null;
  mapHash: string | null;
  note: string;
}): Manifest {
  return {
    schema: 1,
    scenario: opt.scenarioName,
    scenarioSha256: sha256Text(opt.scenarioText),
    side: 'port',
    traceFile: opt.traceFile,
    traceSha256: sha256Text(opt.traceText),
    inputsFile: opt.inputsFile,
    portCommit: opt.portCommit,
    mapHash: opt.mapHash,
    note: opt.note,
  };
}
