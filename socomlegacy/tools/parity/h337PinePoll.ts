/**
 * H337 / LATER 308's capture instrument, its pure half (a product-track instrument, an adaptation: a tool that reads
 * the original running under PCSX2, never part of the game; the entry is `./h337-pine-poll.ts`). What the capture
 * records and how it is judged: research 201 section 14, "The capture's prediction".
 *
 * **The wire** is PCSX2's PINE as the desktop's client speaks it (`desktop@be557831:tools_py/parity/pine.py:3`, `:29-35`,
 * `:92-101`): a message is a little-endian u32 length that counts itself, then commands back to back, each a u8 opcode
 * and its u32 guest address; the reply is a u32 length (counting itself), a u8 result (0 ok), then each command's data
 * in order (4 bytes for a read32, 8 for a read64). Read opcodes only: `READ8` 0, `READ16` 1, `READ32` 2, `READ64` 3
 * (`pine.py:8`); `encodeBatch` refuses every other opcode, so this instrument cannot write guest memory. The socket is
 * TCP on 127.0.0.1, port 28011 for instance A and 28012 for instance B (`pine.py:14`, `pcsx2_ctl.py:16`).
 * The instrument batches READ64 only, as the desktop's client does (`_batch_read64` and `read_block`, `pine.py:92-113`):
 * each 32-bit field is the low or high half of its 8-aligned double word (`read64Plan`). A batch of READ32 commands was
 * never run by the desktop against PCSX2, so it is not used (the H337 review, finding 6).
 *
 * **The fields** (r0001, the disc the console boots; research 201 section 14 cites each at its level):
 * - the third-person camera object: the word at `CAMERA_HOLDER` 0x415ff0 (desktop research 17's "global camera",
 *   `desktop@be557831:docs/research/17-ground-height.md:73`; `FUN_0029b5d0`'s object, whose method `FUN_002998f0`
 *   runs `FUN_00296f10` on it). Not `camera_ptr` 0x488de8 (`guest_addresses.py:247`): that word holds the scene's
 *   render camera, `*(scene + 0x128)` (D:L50901, D:L54815), which the camera object keeps at its `+0xb4` (D:L142851) --
 *   recorded here only to check that at run time (`renderCam`, `camB4`).
 * - `cam+0x2c` the eye before the pass and `cam+0x38` the re-placed target (`FUN_00296f10` D:L140730-140735), `cam+0xd8`
 *   the placed eye (`FUN_0029bc90` D:L143138-143140).
 * - the player actor: the word at `PLAYER_ACTOR` 0x408c58 (`guest_addresses.py:59`); its position at `+0x1c..+0x24`
 *   (`FUN_00296f10` reads the viewed actor's there, D:L140794-140796; desktop research 17 `:29`), and its look
 *   quaternion at `+0x1070` (`FUN_0029a950`; the header of `packages/viewer/src/playerCamera.ts`).
 * - the guest clock word 0x4365c0 (`guest_addresses.py:60`), raw: it tells samples of one frame from the next.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve, win32 } from 'node:path';
import { insideDir } from '../outputRefusal';

export type V3 = [number, number, number];
export type Quat = [number, number, number, number];

/** PINE's read opcodes (`desktop@be557831:tools_py/parity/pine.py:8`). The writes (4-7) and the rest are refused. */
export const PINE_READ8 = 0, PINE_READ16 = 1, PINE_READ32 = 2, PINE_READ64 = 3;
const READ_BYTES: Record<number, number> = { [PINE_READ8]: 1, [PINE_READ16]: 2, [PINE_READ32]: 4, [PINE_READ64]: 8 };
/** Instance A's PINE port (`pine.py:14`; instance B is 28012, `pcsx2_ctl.py:16`). */
export const PINE_PORT = 28011;
/** The one host this instrument talks to. */
export const PINE_HOST = '127.0.0.1';

/** r0001's addresses and offsets (the header). */
export const CAMERA_HOLDER = 0x415ff0;
export const CAMERA_PTR = 0x488de8;
export const PLAYER_ACTOR = 0x408c58;
export const GUEST_CLOCK = 0x4365c0;
export const CAM_EYE = 0x2c, CAM_TARGET = 0x38, CAM_EYE_PLACED = 0xd8, CAM_RENDER = 0xb4;
export const ACTOR_FEET = 0x1c, ACTOR_LOOK = 0x1070;

export interface PineRead { op: number; addr: number }

/** One PINE message carrying `reads` back to back. Throws on anything but a read, or an address outside 32 bits. */
export function encodeBatch(reads: readonly PineRead[]): Buffer {
  if (reads.length === 0) throw new Error('PINE: an empty batch');
  const out = Buffer.alloc(4 + reads.length * 5);
  out.writeUInt32LE(out.length, 0);
  reads.forEach((r, i) => {
    if (!(r.op in READ_BYTES)) throw new Error(`PINE: opcode ${r.op} is not a read; this instrument never writes guest memory`);
    if (!Number.isInteger(r.addr) || r.addr < 0 || r.addr > 0xffffffff) throw new Error(`PINE: address ${r.addr} out of range`);
    out.writeUInt8(r.op, 4 + i * 5);
    out.writeUInt32LE(r.addr, 5 + i * 5);
  });
  return out;
}

/** The reply's whole length once its first four bytes are in, else null. */
export function replyLength(buf: Buffer): number | null {
  return buf.length >= 4 ? buf.readUInt32LE(0) : null;
}

/** A reply's values in the reads' order: numbers for 8-32 bits, bigints for 64. Throws on a failed or short reply. */
export function decodeBatch(reply: Buffer, reads: readonly PineRead[]): (number | bigint)[] {
  const want = 5 + reads.reduce((n, r) => n + READ_BYTES[r.op]!, 0);
  if (reply.length < 5) throw new Error('PINE: a reply shorter than its header');
  const total = reply.readUInt32LE(0);
  if (reply.readUInt8(4) !== 0) throw new Error(`PINE: the batch failed (result ${reply.readUInt8(4)})`);
  if (total !== want || reply.length !== want) throw new Error(`PINE: a reply of ${reply.length} bytes (length word ${total}) for ${want}`);
  let at = 5;
  return reads.map((r) => {
    const n = READ_BYTES[r.op]!;
    const v = n === 8 ? reply.readBigUInt64LE(at) : n === 4 ? reply.readUInt32LE(at) : n === 2 ? reply.readUInt16LE(at) : reply.readUInt8(at);
    at += n;
    return v;
  });
}

/** A u32 read as the float it holds. */
export function f32(word: number): number {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(word >>> 0, 0);
  return b.readFloatLE(0);
}

/** Why `host` is refused, or null: 127.0.0.1 only (no name, no other loopback spelling, no remote host). */
export function hostRefusal(host: string): string | null {
  return host === PINE_HOST ? null : `refused: ${JSON.stringify(host)} -- this instrument talks to PCSX2 on ${PINE_HOST} only`;
}

/** The desktop's tree on the owner's host (CLAUDE.md, "The host lock is this host's"): refused even with `SOCOM_PC_ROOT` unset. */
export const DESKTOP_DEFAULT_ROOT = 'C:/Projects/socom_pc';

/**
 * The git work tree holding `path`, or null: the nearest folder at or above it with a `.git` entry (a folder in a clone,
 * a file in a linked worktree). The path need not exist.
 */
export function gitWorkTreeOf(path: string): string | null {
  for (let dir = resolve(path); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (dirname(dir) === dir) return null;
  }
}

/**
 * Why the trace may not be written at `out`, or null: never inside this repository (RS.R8: no capture of the original
 * in git, ignored or not), never in the desktop's tree (`pcRoot`, and its default path `DESKTOP_DEFAULT_ROOT`: read-only
 * ground truth), and never inside any other git work tree (the canonical clone, another worktree: `gitWorkTreeOf`).
 */
/** A drive-letter path (`C:/...`, `c:\\...`): a Windows path on every host. */
const DRIVE_PATH = /^[A-Za-z]:[\\/]/;

/**
 * `out` made absolute. A drive-letter path is a Windows path on every host: on POSIX, `resolve('C:/...')` reads it as
 * relative to the working directory, so a desktop path landed inside the repository and the wrong refusal answered
 * (B151's Linux seat box, 2026-10-27). It is resolved with `path.win32` there, and judged against Windows dirs only.
 */
export function outPathAbs(out: string): string {
  return DRIVE_PATH.test(out) ? win32.resolve(out) : resolve(out);
}

/** `abs` is `dir` or under it; a drive-letter path and a POSIX dir never contain each other. */
export function insideOutDir(dir: string, abs: string): boolean {
  const winDir = DRIVE_PATH.test(dir), winAbs = DRIVE_PATH.test(abs);
  if (winDir !== winAbs && !(process.platform === 'win32')) return false;
  if (!winDir && !winAbs) return insideDir(dir, abs);
  if (process.platform === 'win32') return insideDir(dir, abs);
  const r = win32.relative(win32.resolve(dir), win32.resolve(abs));   // case-insensitive, as the drive's file system
  return r === '' || (!win32.isAbsolute(r) && r.split(/[\\/]/)[0] !== '..');
}

export function outRefusal(out: string, repoRoot: string, pcRoot: string | null): string | null {
  const abs = outPathAbs(out);
  if (insideOutDir(repoRoot, abs)) return `refused: ${abs} is inside the repository (RS.R8): write the trace outside it`;
  if (pcRoot && insideOutDir(pcRoot, abs)) return `refused: ${abs} is in SOCOM_PC_ROOT's tree, the desktop's read-only ground truth`;
  if (insideOutDir(DESKTOP_DEFAULT_ROOT, abs)) return `refused: ${abs} is in the desktop's tree (${DESKTOP_DEFAULT_ROOT}), read-only ground truth`;
  const tree = gitWorkTreeOf(abs);
  if (tree) return `refused: ${abs} is inside the git work tree ${tree}: write the trace outside every work tree`;
  return null;
}

/** A guest pointer worth following (`desktop@be557831:tools_py/parity/cam_poll.py:86`: EE RAM's 32 MB past the first 1). */
export const isGuestPointer = (a: number): boolean => a >= 0x100000 && a < 0x2000000;

/** The first batch's words: the camera holder, the actor, the render camera pointer and the clock. */
export const POINTER_ADDRS: readonly number[] = [CAMERA_HOLDER, PLAYER_ACTOR, CAMERA_PTR, GUEST_CLOCK];

const words = (base: number, n: number): number[] => Array.from({ length: n }, (_, i) => base + 4 * i);

/** The second batch's words, off the two pointers: eye, target, placed eye, the render camera word, feet, look quaternion. */
export function fieldAddrs(cam: number, actor: number): number[] {
  return [
    ...words(cam + CAM_EYE, 3), ...words(cam + CAM_TARGET, 3), ...words(cam + CAM_EYE_PLACED, 3), ...words(cam + CAM_RENDER, 1),
    ...words(actor + ACTOR_FEET, 3), ...words(actor + ACTOR_LOOK, 4),
  ];
}

/**
 * The READ64 batch that covers 32-bit words at `addrs` (each 4-aligned): one read per 8-aligned double word, in first use
 * order, and `words`, which turns the batch's values back into the words in `addrs`' order (little-endian: the word at
 * the double word's address is its low half, the one 4 past it the high half).
 */
export function read64Plan(addrs: readonly number[]): { reads: PineRead[]; words: (values: readonly (number | bigint)[]) => number[] } {
  const at = new Map<number, number>();
  const reads: PineRead[] = [];
  const picks = addrs.map((a) => {
    if (!Number.isInteger(a) || a % 4 !== 0) throw new Error(`PINE: ${a} is not a 4-aligned word address`);
    const base = a - (a % 8);
    if (!at.has(base)) { at.set(base, reads.length); reads.push({ op: PINE_READ64, addr: base }); }
    return { i: at.get(base)!, high: a % 8 === 4 };
  });
  return {
    reads,
    words: (values) => {
      if (values.length !== reads.length) throw new Error(`PINE: ${values.length} values for ${reads.length} reads`);
      return picks.map(({ i, high }) => {
        const v = BigInt(values[i]!);
        return Number(high ? (v >> 32n) & 0xffffffffn : v & 0xffffffffn);
      });
    },
  };
}

/** One NDJSON line of the trace. */
export interface PollLine {
  t: number;
  eye: V3;
  target: V3;
  eyeSmoothed: V3;
  feet: V3;
  look: Quat;
  clockWord: number;
  cam: number;
  actor: number;
  renderCam: number;
  camB4: number;
}

/** A line from the two batches' words (`POINTER_ADDRS`'s and `fieldAddrs`'s orders). */
export function toLine(t: number, pointers: readonly number[], fields: readonly number[]): PollLine {
  const v = (i: number): V3 => [f32(fields[i]!), f32(fields[i + 1]!), f32(fields[i + 2]!)];
  return {
    t, eye: v(0), target: v(3), eyeSmoothed: v(6), camB4: fields[9]!, feet: v(10),
    look: [f32(fields[13]!), f32(fields[14]!), f32(fields[15]!), f32(fields[16]!)],
    cam: pointers[0]!, actor: pointers[1]!, renderCam: pointers[2]!, clockWord: pointers[3]!,
  };
}

/** The look quaternion's pitch, degrees (a turn about x: (sin(p/2), 0, 0, cos(p/2)); the dump's -0.0799 is -9.17). */
export const pitchOf = (q: Quat): number => (2 * Math.atan2(q[0], q[3]) * 180) / Math.PI;

/** How far the feet may wander and the pitch drift (degrees) within the held window. */
export const FEET_STILL = 0.05, PITCH_STILL = 0.05;
/** Two eyes this close are one position. The orbit is units wide (research 201 section 14); float noise is far under. */
export const CLUSTER_RADIUS = 0.05;
/** A cluster under this share of the window is a transient (a frame torn between two reads), not a position. */
export const CLUSTER_MIN_SHARE = 0.05;

/**
 * Under this many samples a game tick a still-looking eye may be an aliased orbit (an orbit sampled once per two ticks
 * shows one position), so it is not called still.
 */
export const MIN_SAMPLES_PER_TICK = 2;

export interface Cluster { mean: V3; count: number }
export interface Summary {
  lines: number;
  /** The trailing held window: the lines with the feet and the pitch where they ended. */
  window: number;
  feetMean: V3 | null;
  pitchMean: number | null;
  /**
   * The window's samples per game tick: its lines over the runs of one clock word (`clockWord`, the guest clock 0x4365c0;
   * a run is a stretch of samples between two of its steps). A tick the sampling skipped has no run, so this can only
   * over-state the rate: under `MIN_SAMPLES_PER_TICK` the window is undersampled for certain. Null when the clock never
   * stepped in the window (a paused game or a wrong word): the sampling is then unknown, and treated as undersampled.
   */
  samplesPerTick: number | null;
  eye: { mean: V3; spread: { x: number; z: number }; clusters: Cluster[]; transients: number } | null;
  /**
   * `still`: one position; `orbit`: two, alternating; `moving`: neither; `undersampled`: one position, but sampled too
   * slowly to rule out an orbit (`samplesPerTick`).
   */
  shape: 'empty' | 'still' | 'orbit' | 'moving' | 'undersampled';
  /** The distance a still eye may lie from the prediction and count as it: `tolerance`, plus the feet's offset from the stand when given. */
  tolerance: number | null;
  /** With a predicted `'target'` eye: whether the still eye is it. */
  atPrediction: boolean | null;
  reading: 'lastOutput' | 'target' | 'still, not at target' | 'undecided';
}

const mean = (vs: readonly V3[]): V3 => {
  const s = vs.reduce<V3>((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]);
  return [s[0] / vs.length, s[1] / vs.length, s[2] / vs.length];
};
const gap = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * What the trace says (research 201 section 14.1's table): over the trailing window where the feet and the pitch held,
 * the eye's distinct positions (`cam+0x2c`). Two that alternate is the orbit -- `'lastOutput'`. One, sampled at least
 * `MIN_SAMPLES_PER_TICK` a tick, is a still eye: at the port's `'target'` prediction (`expectEye`, within `tolerance`,
 * widened by the feet's offset from `expectFeet`, the stand the prediction was computed at, when given) it is
 * `'target'`; with no prediction given it is undecided until one is computed at the recorded feet.
 *
 * Anywhere else it is reported `'still, not at target'`, which is not yet a new candidate. A still eye away from the
 * `'target'` value can also come from:
 * - `'lastOutput'`'s fixed point: the lead's map is l -> c - l (c = L0 + 8 + W, research 201 section 14), whose fixed
 *   point is l = c/2. An approach that leaves the word at the midpoint gives a still eye, and the orbit's size depends on
 *   the approach (the 2.9-unit orbit at MP11's back stand is the replay's approach, not a fixed prediction);
 * - `FUN_0029a950`'s second branch (D:L142501-142529: the target's lead -5 n.y with no probe), which a live match may
 *   take;
 * - the original's lead-probe filter (LATER 341: `FUN_0029cbb0` casts in mode 0, bit 18 skipped and bit 19 hit, with
 *   `FUN_0029cd20`'s picker), which the port's `isCameraSurface` does not have;
 * - and only then another call rewriting the stack word (a new candidate).
 * The fold of the review that asked for this list: research 201 section 14.1.
 */
export function summarise(lines: readonly PollLine[], expectEye: V3 | null = null, tolerance = 0.05, expectFeet: V3 | null = null): Summary {
  const empty: Summary = {
    lines: lines.length, window: 0, feetMean: null, pitchMean: null, samplesPerTick: null, eye: null, shape: 'empty', tolerance: null,
    atPrediction: null, reading: 'undecided',
  };
  if (lines.length === 0) return empty;
  const last = lines[lines.length - 1]!;
  let from = lines.length - 1;
  while (from > 0) {
    const l = lines[from - 1]!;
    if (gap(l.feet, last.feet) > FEET_STILL || Math.abs(pitchOf(l.look) - pitchOf(last.look)) > PITCH_STILL) break;
    from--;
  }
  const held = lines.slice(from);
  const clusters: { sum: V3; count: number; mean: V3 }[] = [];
  const order: number[] = [];
  for (const l of held) {
    let k = clusters.findIndex((c) => gap(c.mean, l.eye) <= CLUSTER_RADIUS);
    if (k < 0) { clusters.push({ sum: [0, 0, 0], count: 0, mean: l.eye }); k = clusters.length - 1; }
    const c = clusters[k]!;
    c.sum = [c.sum[0] + l.eye[0], c.sum[1] + l.eye[1], c.sum[2] + l.eye[2]];
    c.count++;
    c.mean = [c.sum[0] / c.count, c.sum[1] / c.count, c.sum[2] / c.count];
    order.push(k);
  }
  const major = clusters.map((c, i) => ({ c, i })).filter(({ c }) => c.count >= CLUSTER_MIN_SHARE * held.length);
  const majorCount = major.reduce((n, { c }) => n + c.count, 0);
  const eyes = held.map((l) => l.eye);
  const xs = eyes.map((e) => e[0]), zs = eyes.map((e) => e[2]);
  // An orbit alternates: the held window's runs of one position change position often, never settling into one.
  const runs = order.filter((k, i) => i === 0 || k !== order[i - 1]).length;
  const clockRuns = held.filter((l, i) => i === 0 || l.clockWord !== held[i - 1]!.clockWord).length;
  const samplesPerTick = clockRuns > 1 ? held.length / clockRuns : null;
  let shape: Summary['shape'] = 'moving';
  if (major.length === 1 && major[0]!.c.count >= 0.9 * held.length) {
    shape = samplesPerTick !== null && samplesPerTick >= MIN_SAMPLES_PER_TICK ? 'still' : 'undersampled';
  } else if (major.length === 2 && majorCount >= 0.9 * held.length && Math.min(major[0]!.c.count, major[1]!.c.count) >= 0.2 * held.length && runs >= 4) shape = 'orbit';
  const feetMean = mean(held.map((l) => l.feet));
  const tol = expectEye ? tolerance + (expectFeet ? gap(feetMean, expectFeet) : 0) : null;
  const stillEye = shape === 'still' ? major[0]!.c.mean : null;
  const atPrediction = stillEye && expectEye && tol !== null ? gap(stillEye, expectEye) <= tol : null;
  const reading: Summary['reading'] = shape === 'orbit' ? 'lastOutput'
    : shape === 'still' && atPrediction !== null ? (atPrediction ? 'target' : 'still, not at target') : 'undecided';
  return {
    lines: lines.length, window: held.length, feetMean,
    pitchMean: held.reduce((n, l) => n + pitchOf(l.look), 0) / held.length, samplesPerTick,
    eye: {
      mean: mean(eyes), spread: { x: Math.max(...xs) - Math.min(...xs), z: Math.max(...zs) - Math.min(...zs) },
      clusters: major.map(({ c }) => ({ mean: c.mean, count: c.count })), transients: held.length - majorCount,
    },
    shape, tolerance: tol, atPrediction, reading,
  };
}

/** The repository's root: the trace is never written under it. */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

export interface PollArgs { seconds: number; out: string; port: number; host: string; expect: V3 | null; stand: V3 | null }

/** The command line, or the reason it is refused. */
export function parseArgs(argv: readonly string[], pcRoot: string | null = process.env.SOCOM_PC_ROOT ?? null): PollArgs | string {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const seconds = Number(get('--seconds') ?? 60);
  const out = get('--out');
  const port = Number(get('--port') ?? PINE_PORT);
  const host = get('--host') ?? PINE_HOST;
  const e = get('--expect'), st = get('--stand');
  const expect = e ? (e.split(',').map(Number) as V3) : null;
  const stand = st ? (st.split(',').map(Number) as V3) : null;
  const bad = (v: readonly number[] | null): boolean => !!v && (v.length !== 3 || v.some((x) => !Number.isFinite(x)));
  if (!out) return 'usage: --out <path outside every git work tree> [--seconds 60] [--port 28011] [--expect x,y,z [--stand x,y,z]]';
  if (!(seconds > 0 && seconds <= 3600)) return `--seconds ${get('--seconds')}: 0 < seconds <= 3600`;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return `--port ${get('--port')}: not a port`;
  if (bad(expect)) return `--expect ${e}: three numbers, x,y,z`;
  if (bad(stand)) return `--stand ${st}: three numbers, x,y,z`;
  const refused = hostRefusal(host) ?? outRefusal(out, REPO_ROOT, pcRoot);
  if (refused) return refused;
  if (existsSync(resolve(out))) return `refused: ${resolve(out)} exists -- a trace is never written over`;
  return { seconds, out: resolve(out), port, host, expect, stand };
}
