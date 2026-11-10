import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import type { UiPlanBlendMode } from '../src/uiFramePlan';
import { GPU_RASTER_TOLERANCE_ADAPTATION, checkTolerancePin, type UiGpuToleranceClass, type UiGpuTolerancePin } from '../src/uiGpuTolerance';
import { UI_GPU_BLEND_ADAPTATION, isSoftwareAdapter, uiGpuScaleKey } from '../src/uiGpuSwitch';
import { UI_RASTER_CASE_MODES, caseRunKey, type UiRasterCase, type UiRasterMode, type UiRasterScale } from '../test/uiRasterCases';
import type { UiGpuLoadingParams } from './uiGpuHarness';

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

/**
 * The cases a run walks: GM-03's whole table in its order, or the keys `filter` names (comma-separated). GM-30: a key
 * of the loading leg (`UI_GPU_LOADING_CASE_PREFIX`) is that leg's (`loadingParityCases`), not GM-03's; a filter that names
 * only those walks no GM-03 case.
 */
export function parityCases(cases: readonly UiRasterCase[], filter = ''): UiRasterCase[] {
  const named = filter.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  const keys = named.filter((k) => !k.startsWith(UI_GPU_LOADING_CASE_PREFIX));
  if (!named.length) return [...cases];
  if (!keys.length) return [];
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
export function wholeFrameExact(c: Pick<UiRasterCase, 'gpu'>, blend: UiPlanBlendMode): boolean {
  return blend === 'exact' && (c.gpu === 'E' || c.gpu === 'E*');
}

/** GM-30: the loading leg's case keys begin so (`loading.up`); `S2U_UI_GPU_PARITY_CASES` may name them beside GM-03's. */
export const UI_GPU_LOADING_CASE_PREFIX = 'loading.';

/**
 * GM-30 (GM-23's parity leg; the plan's row GM-30): one synthetic loading-panel frame -- `../e2e/uiGpuHarness.ts`
 * `loadingPanelInputs` makes it from `params` through the panel's own `loadingDrawList` -- with the class its rules give
 * (`gpu`, as GM-03's cases carry one: the weakest of `rules`', research 380 §2) and a name.
 */
export interface UiGpuLoadingCase extends UiGpuLoadingParams { name: string; rules: readonly string[]; gpu: 'E' | 'E*' | 'B' }

/**
 * GM-30: the loading leg's cases (a test instrument's table, not the game's values): the panel up (fader 0), the fader at
 * three values between and at its full 128 (MENUFADER's 0..128, research 125 §5), and quads at alpha 192 and 255 (over 128,
 * not clamped: P8), one with a colour that is not the identity. The rules (research 380 §2): the textured quads' coverage
 * at fractional corners, texel, bilinear filter, modulate, source blend and store (P3, P5, P6, P8, P10, P12); MENUFADER,
 * untextured, by the register the last bind left (P2, P9), a fractional fade between 0 and 128 (P13). Every case samples
 * bilinearly, so every case is B: the twin's exact class is held at 0 and the rest is B within the bound.
 */
export const UI_GPU_LOADING_CASES: readonly UiGpuLoadingCase[] = Object.freeze([
  { key: 'loading.up', name: 'the panel up: fader 0, the quads at alpha 128', fader: 0, alpha: 128, rgb: [128, 128, 128], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12'], gpu: 'B' },
  { key: 'loading.fade32', name: 'the fader at 32 over the panel', fader: 32, alpha: 128, rgb: [128, 128, 128], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12', 'P13'], gpu: 'B' },
  { key: 'loading.fade77', name: 'the fader at 77 (an odd value) over the panel', fader: 77, alpha: 128, rgb: [128, 128, 128], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12', 'P13'], gpu: 'B' },
  { key: 'loading.black', name: 'the fader at 128: the panel under full black', fader: 128, alpha: 128, rgb: [128, 128, 128], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12'], gpu: 'B' },
  { key: 'loading.alpha192', name: 'the picture, title and disc at alpha 192 (over 128, no clamp), fader 0', fader: 0, alpha: 192, rgb: [128, 128, 128], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12'], gpu: 'B' },
  { key: 'loading.alpha255', name: 'alpha 255 and a coloured modulate (200, 90, 40) under the fader at 50', fader: 50, alpha: 255, rgb: [200, 90, 40], rules: ['P2', 'P3', 'P5', 'P6', 'P8', 'P9', 'P10', 'P12', 'P13'], gpu: 'B' },
] as UiGpuLoadingCase[]);

/**
 * GM-30: the loading cases a run walks: all, or those `filter` names (comma-separated, beside GM-03's keys); a loading key
 * not in the table is refused; a filter naming none walks none.
 */
export function loadingParityCases(cases: readonly UiGpuLoadingCase[], filter = ''): UiGpuLoadingCase[] {
  const named = filter.split(',').map((k) => k.trim()).filter((k) => k.length > 0);
  if (!named.length) return [...cases];
  const keys = named.filter((k) => k.startsWith(UI_GPU_LOADING_CASE_PREFIX));
  const unknown = keys.filter((k) => !cases.some((c) => c.key === k));
  if (unknown.length) throw Error(`S2U_UI_GPU_PARITY_CASES: no loading case ${unknown.join(', ')}`);
  return cases.filter((c) => keys.includes(c.key));
}

/** GM-30: the loading leg's runs -- each case at each scale, opaque only (the panel's frame is opaque), under both blends. */
export function loadingParityRuns(cases: readonly UiGpuLoadingCase[], scales: readonly UiRasterScale[]): UiGpuParityRun[] {
  // The blend the landed table draws the loading screen with at each scale (GM.R5: `exact` at HD too since the flip's
  // 4070 evidence; `UI_GPU_BLEND_ADAPTATION.loading`), one run per case and scale: the leg tests what players draw.
  const runs: UiGpuParityRun[] = [];
  for (const c of cases) for (const scale of scales) {
    const blend = UI_GPU_BLEND_ADAPTATION.loading[uiGpuScaleKey(scale)];
    runs.push({ key: c.key, scale, mode: 'opaque', blend, run: `${c.key}@${scale}x/opaque/${blend}` });
  }
  return runs;
}

/** GM-30: what the verdict reads of one parity run (`UiGpuHarnessParity`, and Node's own count of its frames). */
export interface UiGpuParityOutcome {
  scale: number;
  path: 'gpu' | 'software'; why: readonly string[]; expectGpu: boolean; refusal: string | null;
  drawnAt: number | null;
  /** An L1 frame's bytes differing from the L1 reference; null on a GPU frame. */
  l1Differ: number | null;
  /** The page's count of the shown frame's differing bytes, and Node's of the frames it was handed. */
  pageDiffer: number; nodeDiffer: number;
  gpu: UiGpuBStats & { exactDiffering: number };
  /** A transparent frame before its divide (bytes differing, exact class differing); null on an opaque one. */
  pre: { differ: number; exactDiffering: number } | null;
}

/**
 * GM-30: one parity run's verdict, empty when it holds -- the main leg's acceptance (`./uiGpuParity.spec.ts`, GM-11b and
 * GM-14a) as one function: the page's and Node's counts agree; the path the plan owes (`expectGpu`: the GPU, else L1);
 * an L1 frame drawn at 1x and 0 bytes from its reference (and before its divide); and, unless L1 drew below the shown
 * scale, E/E* (the twin's exact class 0 pixels, before the divide too), the whole frame at 0 for an E or E* case under
 * `exact`, and B within `bound` when one is given.
 */
export function parityRunFailures(o: UiGpuParityOutcome, c: Pick<UiRasterCase, 'gpu'>, blend: UiPlanBlendMode, bound: UiGpuBStats | null): string[] {
  const out: string[] = [];
  if (o.pageDiffer !== o.nodeDiffer) out.push(`the page counts ${o.pageDiffer} differing bytes, Node ${o.nodeDiffer}`);
  if (o.expectGpu && o.path !== 'gpu') out.push(`drawn by the software, owed on the GPU (${o.why.join('; ')})`);
  if (!o.expectGpu && o.path !== 'software') out.push(`drawn on the GPU, owed L1 (${o.refusal})`);
  if (o.path === 'software') {
    if (o.drawnAt !== 1) out.push(`L1 drawn at ${o.drawnAt}x, not 1x`);
    if (o.l1Differ !== 0) out.push(`L1: ${o.l1Differ} bytes differ from the software at ${o.drawnAt}x shown s x s`);
    if (o.pre && o.pre.differ !== 0) out.push(`L1 before the divide: ${o.pre.differ} bytes differ`);
  }
  const l1Lower = o.path === 'software' && o.drawnAt !== null && o.drawnAt !== o.scale;
  if (l1Lower) return out;
  if (o.gpu.exactDiffering !== 0) out.push(`E/E*: ${o.gpu.exactDiffering} pixels of the exact class differ`);
  if (o.pre && o.pre.exactDiffering !== 0) out.push(`E/E* before the divide: ${o.pre.exactDiffering} pixels of the exact class differ`);
  if (wholeFrameExact(c, blend)) {
    if (o.nodeDiffer !== 0) out.push(`a ${c.gpu} case under exact: ${o.nodeDiffer} bytes of the whole frame differ`);
    if (o.pre && o.pre.differ !== 0) out.push(`a ${c.gpu} case under exact: ${o.pre.differ} bytes differ before the divide`);
  }
  if (bound) out.push(...boundExcess(o.gpu, bound).map((e) => `B: ${e}`));
  return out;
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

/**
 * GM-11b review F2: every run this run walks has a line in the bound file, or the file is refused, the missing named.
 * GM-27: `from` names the bound (the pin, `PINNED_BOUND_FROM`: a run it lacks is re-pinned by `tools/gm-pin-tolerance.ts`).
 */
export function requireBoundRuns(bound: ReadonlyMap<string, UiGpuBStats | null>, runs: readonly string[], from = 'S2U_UI_GPU_PARITY_BOUND'): void {
  const missing = runs.filter((r) => !bound.has(r));
  if (missing.length) throw Error(`${from}: ${missing.length} runs this run needs have no line: ${missing.join(', ')}`);
}

/** GM-27: the name a bound taken from the pin carries in the records and the spec's messages. */
export const PINNED_BOUND_FROM = 'GPU_RASTER_TOLERANCE_ADAPTATION';

/**
 * GM-27 (GM.R5; research 380 §1): one class of the pinned tolerance (`software` or `gpu`, review finding 1) as a bound by
 * run key, checked at load -- every key of both classes within rounding class (`checkTolerancePin`: max |Δ| at most 1 on
 * every channel, refused with the key named), and every run in `exactRuns` (an E or E* case under `exact`,
 * `wholeFrameExact`) all 0 in that class: the exact class is 0 bytes whatever the tolerance.
 */
export function pinnedBound(pin: UiGpuTolerancePin = GPU_RASTER_TOLERANCE_ADAPTATION, exactRuns: readonly string[] = [], cls: UiGpuToleranceClass = 'gpu'): Map<string, UiGpuBStats> {
  checkTolerancePin(pin);
  const out = new Map<string, UiGpuBStats>();
  for (const [run, r] of Object.entries(pin[cls])) {
    if (exactRuns.includes(run) && [...r.maxAbs, ...r.atLeast].some((v) => v !== 0)) {
      throw Error(`${PINNED_BOUND_FROM}: ${cls} ${run} is an E/E* run under exact, held at 0 bytes whatever the tolerance; the pin gives it ${JSON.stringify(r)}`);
    }
    out.set(run, { maxAbs: [...r.maxAbs] as UiGpuBStats['maxAbs'], atLeast: [...r.atLeast] as UiGpuBStats['atLeast'] });
  }
  return out;
}

/** GM-27: the parity spec's bound -- per class (the same map twice for a file), where it came from, and whether it is the pin. */
export interface UiGpuParityBound {
  from: string;
  pinned: boolean;
  software: ReadonlyMap<string, UiGpuBStats | null>;
  gpu: ReadonlyMap<string, UiGpuBStats | null>;
}

/**
 * GM-27: the parity spec's bound. With no `S2U_UI_GPU_PARITY_BOUND` (`path` null), the pinned tolerance, both classes
 * (`pinnedBound`); with one, that earlier run's `summary.jsonl` (`parseBoundLines`) for every renderer, as before.
 */
export function parityBound(path: string | null, read: (path: string) => string, exactRuns: readonly string[] = []): UiGpuParityBound {
  if (path === null) {
    return {
      from: PINNED_BOUND_FROM, pinned: true,
      software: pinnedBound(GPU_RASTER_TOLERANCE_ADAPTATION, exactRuns, 'software'), gpu: pinnedBound(GPU_RASTER_TOLERANCE_ADAPTATION, exactRuns, 'gpu'),
    };
  }
  const bound = parseBoundLines(read(path));
  return { from: path, pinned: false, software: bound, gpu: bound };
}

/**
 * GM-27 review finding 1: the class a run's renderer is held to -- the software rasterisers' (`isSoftwareAdapter`:
 * SwiftShader, llvmpipe, Microsoft Basic Render Driver) or the GPUs' (any other renderer, AMD and Intel included, or none).
 */
export function boundForRenderer(b: UiGpuParityBound, renderer: string | null | undefined): ReadonlyMap<string, UiGpuBStats | null> {
  return isSoftwareAdapter(renderer) ? b.software : b.gpu;
}

/**
 * The 4070 evidence run's finding 1 (GM-27 review finding 2 re-done): what a loading run's record says when the pin holds
 * no line for it -- the run is walked and judged on everything but B (E/E*, the L1 rules, the owed path), and its B
 * recorded unjudged, so a SwiftShader run made to serve as a bound file writes its loading lines.
 */
export const UI_GPU_LOADING_UNPINNED_NOTE = 'B unjudged: no pinned bound yet';

/**
 * GM-27 review finding 2: refuses, before any page opens, a bound missing one of GM-03's runs (both classes of a pin),
 * or -- a file given -- one of the loading leg's runs too, as GM-30 had it. Under the pin the loading leg is never
 * refused and never skipped (the 4070 run's finding 1): a loading run the pin lacks has its B unjudged
 * (`loadingRunBound`).
 */
export function requireParityBound(b: UiGpuParityBound, mainRuns: readonly string[], loadingRuns: readonly string[]): void {
  requireBoundRuns(b.software, mainRuns, b.from);
  requireBoundRuns(b.gpu, mainRuns, b.from);
  if (!b.pinned) requireBoundRuns(b.gpu, loadingRuns, b.from);
}

/**
 * The 4070 run's finding 1: one loading run's B bound on `renderer` -- a file's line (required by `requireParityBound`)
 * or the pin's, max'd with the twin's statistics (`provisionalBound`), as the main leg holds B; under the pin with no
 * line for the run, no bound (`bound` null: `parityRunFailures` judges no B) and the note `UI_GPU_LOADING_UNPINNED_NOTE`
 * for the record.
 */
export function loadingRunBound(b: UiGpuParityBound, renderer: string | null | undefined, run: string, twin: UiGpuBStats): { bound: UiGpuBStats | null; note: string | null } {
  const lines = boundForRenderer(b, renderer);
  if (b.pinned && !lines.has(run)) return { bound: null, note: UI_GPU_LOADING_UNPINNED_NOTE };
  return { bound: provisionalBound(twin, lines.get(run) ?? null), note: null };
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
