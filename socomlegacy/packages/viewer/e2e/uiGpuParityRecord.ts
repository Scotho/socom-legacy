import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { UiPlanBlendMode } from '../src/uiFramePlan';
import { UI_RASTER_CASE_MODES, caseRunKey, type UiRasterCase, type UiRasterMode, type UiRasterScale } from '../test/uiRasterCases';

/**
 * GM-11b (the GPU menus plan, row GM-11b; the parity contract, research 380 §1): the parity spec's instruments, in Node
 * -- which runs it walks, the env it reads, the differing-byte counter, the diff image and its PNG, the frame files
 * (RGBA and a header) GM-11c's tool reads, and the provisional bound's arithmetic (GM.R5). Product track, a test
 * instrument: it compares our GPU drawer with our own software drawer and decides no pixel of either. Held by
 * `test/uiGpuParityRecord.test.ts`.
 */

/** The row's scale: GM-11b is "the parity spec at scale 1"; GM-14a adds 2 and 4 (`S2U_UI_GPU_PARITY_SCALES`). */
export const UI_GPU_PARITY_SCALES: readonly UiRasterScale[] = Object.freeze([1] as const);
/** The row's two legs, the blend table's values (GM.R6): `exact` (every quad programmable) and `ff`. */
export const UI_GPU_PARITY_BLENDS: readonly UiPlanBlendMode[] = Object.freeze(['exact', 'ff'] as const);
/** Both frame modes of GM-03's cases (the transparent overlay's frame, P14/P22). */
export const UI_GPU_PARITY_MODES: readonly UiRasterMode[] = UI_RASTER_CASE_MODES;
/** The first token of a frame file's header line. */
export const UI_GPU_PARITY_FRAME_FORMAT = 's2u-ui-frame/1';

const ALL_SCALES: readonly UiRasterScale[] = [1, 2, 4];

/** The cases a run walks: GM-03's whole table in its order, or the keys `filter` names (comma-separated). */
export function parityCases(cases: readonly UiRasterCase[], filter = ''): UiRasterCase[] {
  const keys = filter.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  if (!keys.length) return [...cases];
  const unknown = keys.filter((k) => !cases.some((c) => c.key === k));
  if (unknown.length) throw Error(`S2U_UI_GPU_PARITY_CASES: no case ${unknown.join(', ')} in GM-03's table`);
  return cases.filter((c) => keys.includes(c.key));
}

/** One run: a case at a scale, a mode and a blend. `run` is the case's pin key (`caseRunKey`) and the blend. */
export interface UiGpuParityRun { key: string; scale: UiRasterScale; mode: UiRasterMode; blend: UiPlanBlendMode; run: string }

export function parityRuns(cases: readonly UiRasterCase[], scales: readonly UiRasterScale[]): UiGpuParityRun[] {
  const runs: UiGpuParityRun[] = [];
  for (const c of cases) for (const scale of scales) for (const mode of UI_GPU_PARITY_MODES) for (const blend of UI_GPU_PARITY_BLENDS) {
    runs.push({ key: c.key, scale, mode, blend, run: `${caseRunKey(c, scale, mode)}/${blend}` });
  }
  return runs;
}

/**
 * Whether a run's whole frame is held at 0 differing bytes: a case whose class is E or E* (GM-03's `gpu`) under the
 * `exact` blend. Elsewhere (a B case, or the `ff` leg, whose unorm blend is implementation-defined, P10-P12) only the
 * twin's exact class is held at 0 and the rest is B, measured.
 */
export function wholeFrameExact(c: UiRasterCase, blend: UiPlanBlendMode): boolean {
  return blend === 'exact' && (c.gpu === 'E' || c.gpu === 'E*');
}

export interface UiGpuParityEnvIn {
  S2U_UI_GPU_PARITY_OUT?: string | undefined;
  S2U_UI_GPU_PARITY_SCALES?: string | undefined;
  S2U_UI_GPU_PARITY_CASES?: string | undefined;
  S2U_UI_GPU_PARITY_BOUND?: string | undefined;
}
export interface UiGpuParityEnv { out: string; scales: UiRasterScale[]; cases: string; bound: string | null }

/** The default scratch directory's name, under the OS temp directory: outside the tree, so never committed. */
export const UI_GPU_PARITY_DEFAULT_DIR = 's2u-ui-gpu-parity';

/**
 * Whether `path` (resolved from the working directory) is `<web>/test-results` or inside it: Playwright's `outputDir`
 * for `playwright.config.ts`, which it empties at the start of every run (GM-11b review F1: a bound file there is gone
 * before the second leg reads it, and GM-11c's frames with it).
 */
function inTestResults(path: string, web: string): boolean {
  const fold = (p: string): string => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = relative(fold(resolve(web, 'test-results')), fold(resolve(path)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * The spec's env: `S2U_UI_GPU_PARITY_OUT` the scratch directory (default `<OS temp>/s2u-ui-gpu-parity`);
 * `S2U_UI_GPU_PARITY_SCALES` (default the row's 1; any of 1, 2, 4); `S2U_UI_GPU_PARITY_CASES` (case keys; default all);
 * `S2U_UI_GPU_PARITY_BOUND` an earlier run's `summary.jsonl` (the SwiftShader run's) to hold B against. An OUT or a
 * BOUND inside `<web>/test-results` is refused (Playwright empties it at each run's start; GM-11b review F1).
 */
export function parityEnv(env: UiGpuParityEnvIn, web: string, tmp: string = tmpdir()): UiGpuParityEnv {
  for (const name of ['S2U_UI_GPU_PARITY_OUT', 'S2U_UI_GPU_PARITY_BOUND'] as const) {
    const v = env[name];
    if (v && inTestResults(v, web)) {
      throw Error(`${name}: ${JSON.stringify(v)} is inside ${join(web, 'test-results')}, which Playwright empties at the start of every run; name a directory outside it`);
    }
  }
  const raw = (env.S2U_UI_GPU_PARITY_SCALES ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  const scales = raw.map((s) => {
    const n = Number(s);
    if (!ALL_SCALES.includes(n as UiRasterScale)) throw Error(`S2U_UI_GPU_PARITY_SCALES: ${JSON.stringify(s)} is not one of 1, 2, 4`);
    return n as UiRasterScale;
  });
  return {
    out: env.S2U_UI_GPU_PARITY_OUT || join(tmp, UI_GPU_PARITY_DEFAULT_DIR),
    scales: scales.length ? ALL_SCALES.filter((s) => scales.includes(s)) : [...UI_GPU_PARITY_SCALES],
    cases: env.S2U_UI_GPU_PARITY_CASES ?? '',
    bound: env.S2U_UI_GPU_PARITY_BOUND || null,
  };
}

/** Two frames' bytes compared: how many, how many differ, the pixels with any byte differing, the first that differs. */
export interface UiGpuByteDiff {
  bytes: number;
  differ: number;
  pixels: number;
  first: { index: number; x: number; y: number; channel: number; a: number; b: number } | null;
}

export function countDifferingBytes(a: ArrayLike<number>, b: ArrayLike<number>, width: number): UiGpuByteDiff {
  if (a.length !== b.length) throw Error(`countDifferingBytes: ${a.length} bytes against ${b.length}`);
  let differ = 0, pixels = 0, lastPixel = -1, first: UiGpuByteDiff['first'] = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    differ++;
    const p = i >> 2;
    if (p !== lastPixel) { pixels++; lastPixel = p; }
    if (!first) first = { index: i, x: p % width, y: Math.floor(p / width), channel: i & 3, a: a[i]!, b: b[i]! };
  }
  return { bytes: a.length, differ, pixels, first };
}

/**
 * The diff image of `a` (the GPU's frame) against `b` (the reference): a differing pixel red, its green 16 per unit of
 * its largest channel |Δ| (saturating); an equal pixel the reference's mean grey at a quarter, for where it lies.
 */
export function diffImage(a: ArrayLike<number>, b: ArrayLike<number>, width: number, height: number): Uint8ClampedArray {
  const n = width * height * 4;
  if (a.length !== n || b.length !== n) throw Error(`diffImage: ${a.length} and ${b.length} bytes for ${width} x ${height}`);
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i += 4) {
    let m = 0;
    for (let c = 0; c < 4; c++) m = Math.max(m, Math.abs(a[i + c]! - b[i + c]!));
    if (m > 0) { out[i] = 255; out[i + 1] = m * 16; out[i + 2] = 0; }
    else { const g = Math.round((b[i]! + b[i + 1]! + b[i + 2]!) / 3 / 4); out[i] = g; out[i + 1] = g; out[i + 2] = g; }
    out[i + 3] = 255;
  }
  return out;
}

/** A frame file's header: what GM-11c's tool needs to score it (the row: "dialog, scale, renderer"). */
export interface UiGpuFrameHeader {
  /** What was drawn: `case <key>` for GM-03's cases (a corpus frame names its dialog). */
  dialog: string;
  run: string;
  scale: number;
  mode: UiRasterMode;
  blend: UiPlanBlendMode;
  /** `gpu`: `GpuUiPresenter.readFrame()` (straight RGBA, P22's divide applied); `cpu`: the f64 CPU executor's frame. */
  which: 'gpu' | 'cpu';
  width: number;
  height: number;
  /** The WebGL renderer string (unmasked where the browser gives it). */
  renderer: string | null;
  /** The presenter's path for the frame: `gpu`, or `software` (L1, the software's bytes uploaded). */
  path: 'gpu' | 'software';
}

/** One JSON line (`format` first), a newline, then `width x height x 4` bytes, top row first. */
export function encodeFrameFile(header: UiGpuFrameHeader, rgba: ArrayLike<number>): Uint8Array {
  if (rgba.length !== header.width * header.height * 4) throw Error(`encodeFrameFile: ${rgba.length} bytes for ${header.width} x ${header.height}`);
  const head = new TextEncoder().encode(`${JSON.stringify({ format: UI_GPU_PARITY_FRAME_FORMAT, ...header })}\n`);
  const out = new Uint8Array(head.length + rgba.length);
  out.set(head, 0);
  out.set(rgba, head.length);
  return out;
}

export function decodeFrameFile(file: Uint8Array): { header: UiGpuFrameHeader & { format: string }; rgba: Uint8Array } {
  const nl = file.indexOf(10);
  if (nl < 0) throw Error('decodeFrameFile: no header line');
  const header = JSON.parse(new TextDecoder().decode(file.subarray(0, nl))) as UiGpuFrameHeader & { format: string };
  if (header.format !== UI_GPU_PARITY_FRAME_FORMAT) throw Error(`decodeFrameFile: format ${JSON.stringify(header.format)}`);
  const rgba = file.subarray(nl + 1);
  if (rgba.length !== header.width * header.height * 4) throw Error(`decodeFrameFile: ${rgba.length} bytes for ${header.width} x ${header.height}`);
  return { header, rgba };
}

/** A run key as a file name's stem: the path separators become `_`. */
export const frameFileStem = (run: string): string => run.replace(/[\\/]/g, '_');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** An RGBA image as a PNG (8 bits a channel, colour type 6, every row filter 0): for a person to look at. */
export function encodePng(width: number, height: number, rgba: ArrayLike<number>): Uint8Array {
  if (rgba.length !== width * height * 4) throw Error(`encodePng: ${rgba.length} bytes for ${width} x ${height}`);
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let i = 0; i < width * 4; i++) raw[row + 1 + i] = rgba[y * width * 4 + i]!;
  }
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** B statistics (research 380 §1, "B"): max |Δ| per channel (R, G, B, A), and pixels whose largest |Δ| is >= 1, 2, 3. */
export interface UiGpuBStats { maxAbs: [number, number, number, number]; atLeast: [number, number, number] }

/**
 * The provisional bound for a run (GM.R5): max(the f32 twin, SwiftShader), field by field -- the twin's statistics on
 * the run, and an earlier run's GPU statistics on the same run key (the SwiftShader run's summary), where one is given.
 */
export function provisionalBound(twin: UiGpuBStats, earlier?: UiGpuBStats | null): UiGpuBStats {
  if (!earlier) return { maxAbs: [...twin.maxAbs], atLeast: [...twin.atLeast] };
  return {
    maxAbs: twin.maxAbs.map((v, i) => Math.max(v, earlier.maxAbs[i]!)) as UiGpuBStats['maxAbs'],
    atLeast: twin.atLeast.map((v, i) => Math.max(v, earlier.atLeast[i]!)) as UiGpuBStats['atLeast'],
  };
}

/** Every field of `got` past `bound`, in words; empty when within. */
export function boundExcess(got: UiGpuBStats, bound: UiGpuBStats): string[] {
  const out: string[] = [];
  'RGBA'.split('').forEach((ch, i) => { if (got.maxAbs[i]! > bound.maxAbs[i]!) out.push(`max |Δ| ${ch} ${got.maxAbs[i]} > ${bound.maxAbs[i]}`); });
  got.atLeast.forEach((v, i) => { if (v > bound.atLeast[i]!) out.push(`pixels at |Δ| >= ${i + 1}: ${v} > ${bound.atLeast[i]}`); });
  return out;
}

const counts = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 0);

/**
 * An earlier run's `summary.jsonl`, by run key: each line's `gpu` statistics (the last line of a key wins; blank lines
 * pass). GM-11b review F2: a line it cannot read -- not JSON, no run key, or `gpu` without four channel maxima and three
 * counts -- is refused by its number, and so is a file with no run, never skipped into a looser bound.
 * GM-14a review F5: a line marked `l1AtLowerScale` (an L1 frame drawn at 1x under HD, GM.R9: the executor's statistics
 * at the shown scale describe a frame the GPU did not draw) names its run but gives **no bound** (null): such a run's
 * B is not held, and its numbers never widen another's.
 */
export function parseBoundLines(text: string): Map<string, UiGpuBStats | null> {
  const out = new Map<string, UiGpuBStats | null>();
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    let o: { run?: unknown; l1AtLowerScale?: unknown; gpu?: { maxAbs?: unknown; atLeast?: unknown } };
    try { o = JSON.parse(line) as typeof o; } catch { throw Error(`S2U_UI_GPU_PARITY_BOUND: line ${i + 1} is not JSON`); }
    if (typeof o?.run !== 'string' || !o.run) throw Error(`S2U_UI_GPU_PARITY_BOUND: line ${i + 1} names no run`);
    if (o.l1AtLowerScale === true) { out.set(o.run, null); return; }
    if (!o.gpu || !counts(o.gpu.maxAbs, 4) || !counts(o.gpu.atLeast, 3)) {
      throw Error(`S2U_UI_GPU_PARITY_BOUND: line ${i + 1} (${o.run}) has no gpu statistics (maxAbs: 4 counts, atLeast: 3)`);
    }
    out.set(o.run, { maxAbs: [...o.gpu.maxAbs] as UiGpuBStats['maxAbs'], atLeast: [...o.gpu.atLeast] as UiGpuBStats['atLeast'] });
  });
  if (!out.size) throw Error('S2U_UI_GPU_PARITY_BOUND: the file holds no run');
  return out;
}

/** GM-11b review F2: every run this run walks has a line in the bound file, or the file is refused, the missing named. */
export function requireBoundRuns(bound: ReadonlyMap<string, UiGpuBStats | null>, runs: readonly string[]): void {
  const missing = runs.filter((r) => !bound.has(r));
  if (missing.length) throw Error(`S2U_UI_GPU_PARITY_BOUND: ${missing.length} runs this run needs have no line: ${missing.join(', ')}`);
}

/** GM-14a review F2: the main leg's run whose bound line a cold-upload first frame drawn on the GPU takes (the HD default blend, `ff`). */
export const coldUploadBoundRun = (key: string, scale: UiRasterScale, mode: UiRasterMode): string => `${key}@${scale}x/${mode}/ff`;

/** GM-14a: what the cold-upload leg reads of one run (`UiGpuHarness.coldUploadRun`). */
export interface UiGpuColdUploadOutcome {
  path: 'gpu' | 'software'; why: readonly string[]; drawnAt: number | null;
  /** Bytes of the first frame differing from the L1 reference (meaningful on the software path only). */
  differ: number;
  /** A GPU first frame's statistics against the CPU executor through the twin's exact-class mask, and the twin's own; null on L1. */
  gpu: (UiGpuBStats & { exactDiffering: number }) | null;
  twin: UiGpuBStats | null;
  finalPath: 'gpu' | 'software';
  /**
   * GM-14a re-review (1): a transparent GPU first frame's exact-class pixels differing before its divide (`readPixels()`
   * against the software's `preDivide` frame, P14/P22, as the main leg's `pre`); null on an opaque frame or on L1.
   */
  preExactDiffering?: number | null;
}

/**
 * GM-14a review F2: the cold-upload leg's verdict on one run, empty when it holds. A first frame **drawn on the GPU** (a
 * case naming 0 or 1 texture: the first upload always goes) is held as the main leg holds a GPU frame -- the twin's
 * exact class 0 pixels (E/E*), and B within `bound` when one is given (max(twin, the earlier run's line)) -- never to
 * the software's bytes. A first frame **that fell back** (L1) is the software at 1x shown s x s: drawn at 1, 0 bytes; and
 * one that waited for its textures is on the GPU once they are up.
 */
export function coldUploadFailures(r: UiGpuColdUploadOutcome, bound: UiGpuBStats | null): string[] {
  const out: string[] = [];
  if (r.path === 'gpu') {
    if (!r.gpu) return ['a GPU first frame without its statistics'];
    if (r.gpu.exactDiffering !== 0) out.push(`E/E*: ${r.gpu.exactDiffering} pixels of the exact class differ`);
    if (r.preExactDiffering != null && r.preExactDiffering !== 0) out.push(`E/E* before the divide: ${r.preExactDiffering} pixels of the exact class differ`);
    if (bound) out.push(...boundExcess(r.gpu, bound).map((e) => `B: ${e}`));
    return out;
  }
  if (r.drawnAt !== 1) out.push(`L1 drawn at ${r.drawnAt}x, not 1x`);
  if (r.differ !== 0) out.push(`L1: ${r.differ} bytes differ from the software at 1x shown s x s`);
  if (r.why.some((w) => w.startsWith('textures uploading')) && r.finalPath !== 'gpu') out.push('still software after its textures went up');
  return out;
}
