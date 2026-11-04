/**
 * cps-frame-hash-2 (CPS.R9 (e)'s frame identity gate; product track, a dev instrument with no original): where two reads
 * of the same paused frame differ, so a determinism mismatch names its mover in one run. Pure and exact over the bytes
 * `./frameHash` `hashFrame` read (`{ keep: true }`): the differing bytes and pixels, their box, the first pixels in the
 * read's row order with both colours, the largest channel step, a coarse grid of where they fall, and the two frames and
 * their mask as binary PPMs (P6: a header and RGB bytes, opened by any image viewer; no image library). Imported by the
 * spec (`e2e/zz-frame-identity.spec.ts`, under Node) and so imports nothing.
 *
 * Coordinates are the read's: `x` the column, `y` the row as the bytes hold it -- WebGPU's copy top-down, WebGL2's
 * `readPixels` bottom-up (`./frameHash`); the caller names which in the message.
 */

/** One differing pixel, both colours in the read's channel order (RGBA, or BGRA from a `bgra8unorm` canvas format). */
export interface FrameDiffPixel { x: number; y: number; a: number[]; b: number[] }

/** The differing pixels' box, inclusive, in pixels. */
export interface FrameDiffBox { x0: number; y0: number; x1: number; y1: number; w: number; h: number }

/** The differing pixels counted by cell of a `cols` x `rows` grid over the frame (`counts[row][col]`). */
export interface FrameDiffGrid { cols: number; rows: number; cellW: number; cellH: number; counts: number[][] }

export interface FrameDiff {
  w: number;
  h: number;
  /** Bytes that differ (of `w * h * 4`). */
  bytes: number;
  /** Pixels with any channel different (of `w * h`). */
  pixels: number;
  bbox: FrameDiffBox | null;
  /** The first differing pixels in row order (8 by default). */
  first: FrameDiffPixel[];
  /** The largest step of one channel between the two. */
  maxDelta: number;
  grid: FrameDiffGrid;
}

/** The two reads compared (each `w` x `h` x 4 bytes, the same layout); `first` pixels listed, a `grid` x `grid` count. */
export function diffFrames(a: Uint8Array, b: Uint8Array, w: number, h: number, opts: { first?: number; grid?: number } = {}): FrameDiff {
  const size = w * h * 4;
  if (a.length !== size || b.length !== size) throw new Error(`frame diff: ${a.length} and ${b.length} bytes for ${w} x ${h} (${size} each)`);
  const firstMax = opts.first ?? 8;
  const g = Math.max(1, Math.floor(opts.grid ?? 8));
  const cellW = Math.ceil(w / g), cellH = Math.ceil(h / g);
  const cols = Math.ceil(w / cellW), rows = Math.ceil(h / cellH);
  const counts = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  let bytes = 0, pixels = 0, maxDelta = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  const first: FrameDiffPixel[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let n = 0;
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(a[i + c]! - b[i + c]!);
        if (d !== 0) { n++; if (d > maxDelta) maxDelta = d; }
      }
      if (n === 0) continue;
      bytes += n;
      pixels++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      counts[Math.floor(y / cellH)]![Math.floor(x / cellW)]!++;
      if (first.length < firstMax) first.push({ x, y, a: [...a.subarray(i, i + 4)], b: [...b.subarray(i, i + 4)] });
    }
  }
  return {
    w, h, bytes, pixels, maxDelta, first,
    bbox: pixels === 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    grid: { cols, rows, cellW, cellH, counts },
  };
}

/** One line for an error message: the counts, the box (`rows` names the read's row order), the first pixels. */
export function describeFrameDiff(d: FrameDiff, rows: string): string {
  if (d.pixels === 0 || !d.bbox) return 'no bytes differ';
  const b = d.bbox;
  const firsts = d.first.map((p) => `(${p.x},${p.y}) ${p.a.join(',')} -> ${p.b.join(',')}`).join('; ');
  return `${d.bytes} of ${d.w * d.h * 4} bytes differ (${d.pixels} of ${d.w * d.h} pixels), max channel step ${d.maxDelta}; `
    + `box x ${b.x0}..${b.x1}, y ${b.y0}..${b.y1} (${b.w} x ${b.h} px; ${rows}); first: ${firsts}`;
}

/** The PPM header for `w` x `h`. */
function ppmHeader(w: number, h: number): Uint8Array {
  return new TextEncoder().encode(`P6\n${w} ${h}\n255\n`);
}

/** A read frame as a binary PPM, top row first, RGB: `bgra` swaps a `bgra8unorm` read, `bottomUp` flips a WebGL2 read. */
export function framePpm(bytes: Uint8Array, w: number, h: number, o: { bgra: boolean; bottomUp: boolean }): Uint8Array {
  const head = ppmHeader(w, h);
  const out = new Uint8Array(head.length + w * h * 3);
  out.set(head);
  let k = head.length;
  for (let row = 0; row < h; row++) {
    const y = o.bottomUp ? h - 1 - row : row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[k++] = bytes[i + (o.bgra ? 2 : 0)]!;
      out[k++] = bytes[i + 1]!;
      out[k++] = bytes[i + (o.bgra ? 0 : 2)]!;
    }
  }
  return out;
}

/** The mismatch mask as a binary PPM, top row first: a differing pixel magenta, every other black. */
export function frameDiffPpm(a: Uint8Array, b: Uint8Array, w: number, h: number, o: { bottomUp: boolean }): Uint8Array {
  const head = ppmHeader(w, h);
  const out = new Uint8Array(head.length + w * h * 3);
  out.set(head);
  let k = head.length;
  for (let row = 0; row < h; row++) {
    const y = o.bottomUp ? h - 1 - row : row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const differs = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];
      out[k++] = differs ? 255 : 0;
      out[k++] = 0;
      out[k++] = differs ? 255 : 0;
    }
  }
  return out;
}

/** cps-frame-hash-5: moved here from `./frameHash` (which re-exports it), unchanged. */
/** FNV-1a 64's offset basis and prime, each as two 32-bit halves (0xcbf29ce484222325, 0x100000001b3). */
const OFFSET_HI = 0xcbf29ce4, OFFSET_LO = 0x84222325, PRIME_LO = 0x1b3;
const TWO_32 = 0x1_0000_0000;

/**
 * FNV-1a 64 of `bytes`, 16 lower-case hex digits. Each step: the low half takes the byte, then the 64-bit product by the
 * prime, `2^40 + 0x1b3`, mod 2^64 -- low' = lo * 0x1b3 mod 2^32, high' = hi * 0x1b3 + lo * 2^8 + the low product's carry,
 * mod 2^32; every product stays under 2^53, so doubles hold it exactly.
 */
export function fnv1a64(bytes: Uint8Array): string {
  let hi = OFFSET_HI, lo = OFFSET_LO;
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]!) >>> 0;
    const low = lo * PRIME_LO;
    const carry = Math.floor(low / TWO_32);
    hi = (hi * PRIME_LO + lo * 0x100 + carry) >>> 0;
    lo = low >>> 0;
  }
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * cps-frame-hash-5 (attempt 5 on the owner's PC, 2026-11-03, headless ANGLE D3D11): with every clock, the camera, the
 * bodies' poses and palettes held and the shadow and the effect lights switched off in turn, consecutive reads of one
 * paused frame still differed by one channel step in a few dozen pixels, with no period (AAAAAB, AAABAA, ABBBBB, AABBAC,
 * ABACAA): the GPU resolves near, coplanar or edge-shared geometry in hardware order, so single reads cannot be held
 * bit-equal on that host. The gate therefore takes several reads of a tick and hashes their per-channel majority, and
 * holds what is left over -- the flicker -- to a tolerance (`FLICKER_TOLERANCE_KIT`): a race moves tens of pixels, a real
 * change (a draw dropped, a material changed) hundreds.
 *
 * cps-frame-hash-6 (CPS.R11; attempts 7 and 8 on the owner's PC, tick 30000, sixteen bodies in view): where the bodies'
 * sub-meshes meet at equal depth the driver's race moves a few dozen edge pixels by up to 13 steps, with the camera, the
 * poses and the palettes one hash in every read. So the bound is a pixel count only, whatever the step (the step is kept
 * for the log and the report), and a comparison with the base also requires the same draws and bodies in view.
 */

/**
 * The per-channel majority of `reads` (each the same length): every byte the value most reads hold, a tie going to the
 * lowest value. One read is itself; two that differ take the lower byte.
 */
export function majorityFrame(reads: readonly Uint8Array[]): Uint8Array {
  if (reads.length === 0) throw new Error('frame majority: no reads');
  const n = reads[0]!.length;
  for (const r of reads) if (r.length !== n) throw new Error(`frame majority: reads of ${n} and ${r.length} bytes`);
  if (reads.length === 1) return reads[0]!.slice();
  const out = new Uint8Array(n);
  const k = reads.length;
  for (let i = 0; i < n; i++) {
    let best = reads[0]![i]!, bestCount = 0;
    for (let a = 0; a < k; a++) {
      const v = reads[a]![i]!;
      let c = 0;
      for (let b = 0; b < k; b++) if (reads[b]![i] === v) c++;
      if (c > bestCount || (c === bestCount && v < best)) { best = v; bestCount = c; }
    }
    out[i] = best;
  }
  return out;
}

/** What is left over around a majority: the pixels where any read differs from it, their share of the frame, the largest step. */
export interface FrameFlicker { pixels: number; share: number; maxDelta: number; bbox: FrameDiffBox | null }

/** The flicker of `reads` around `majority` (`w` x `h` x 4 bytes each). */
export function flickerOf(reads: readonly Uint8Array[], majority: Uint8Array, w: number, h: number): FrameFlicker {
  const size = w * h * 4;
  if (majority.length !== size || reads.some((r) => r.length !== size)) throw new Error(`frame flicker: reads not ${size} bytes for ${w} x ${h}`);
  let pixels = 0, maxDelta = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    let moved = false;
    for (const r of reads) {
      for (let c = 0; c < 4; c++) {
        const d = Math.abs(r[i + c]! - majority[i + c]!);
        if (d !== 0) { moved = true; if (d > maxDelta) maxDelta = d; }
      }
    }
    if (!moved) continue;
    pixels++;
    const x = p % w, y = (p - x) / w;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { pixels, share: pixels / (w * h), maxDelta, bbox: pixels === 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/**
 * The race's tolerance (a test-only choice from attempts 4 to 8: 2 to 162 of 518,400 pixels): at most `share` of the
 * frame's pixels (0.05 %, about 259 at 960 x 540), by any channel step (cps-frame-hash-6, CPS.R11: the bodies' edges
 * move by up to 13). The spec's `S2U_FRAME_FLICKER_MAX` (a percentage) replaces the share.
 */
export const FLICKER_TOLERANCE_KIT = { share: 0.0005 } as const;

/** Whether a difference -- a flicker, or two majorities' `diffFrames` -- is within the race's tolerance: its pixel count only. */
export function withinFlicker(d: { pixels: number }, w: number, h: number, tolerance: { share: number } = FLICKER_TOLERANCE_KIT): boolean {
  return d.pixels <= tolerance.share * w * h;
}

/** One tick as a run records it (`frame-identity.json`'s rows): the majority's hash, the draws, the bodies in view. */
export interface TickRecord { tick: number; hash: string; draws: number; inView?: readonly number[] }

/**
 * cps-frame-hash-7: how the head's draws must stand to the base's -- `equal` (the default), or `fewer` for a cull that
 * drops draws by design while the picture holds: at most the base's, never more (the spec's `S2U_FRAME_DRAWS`).
 */
export type DrawsRule = 'equal' | 'fewer';

/**
 * cps-frame-hash-6: a tick of this run against the base's -- the problems, none when it holds. The draws must be equal
 * (cps-frame-hash-7: or, under `fewer`, at most the base's) and the count of bodies in view equal (a cull that drops a
 * body from view is a change whatever the pixels); a majority hash that differs needs the two majorities' diff
 * (`diffFrames`, null when the base's image is missing) within the tolerance.
 */
export function tickAgainstBase(base: TickRecord, head: TickRecord, diff: { pixels: number; maxDelta: number } | null, w: number, h: number, tolerance: { share: number } = FLICKER_TOLERANCE_KIT, draws: DrawsRule = 'equal'): string[] {
  const out: string[] = [];
  if (draws === 'fewer') {
    if (head.draws > base.draws) out.push(`tick ${head.tick}: draws ${base.draws} before, ${head.draws} now (more than the base)`);
  } else if (base.draws !== head.draws) out.push(`tick ${head.tick}: draws ${base.draws} before, ${head.draws} now`);
  const seen = (r: TickRecord): string => (r.inView ? String(r.inView.length) : 'not recorded');
  if (!base.inView || !head.inView || base.inView.length !== head.inView.length) out.push(`tick ${head.tick}: bodies in view ${seen(base)} before, ${seen(head)} now`);
  if (base.hash !== head.hash) {
    if (!diff) out.push(`tick ${head.tick}: majority ${base.hash} before, ${head.hash} now, and no base image to diff`);
    else if (!withinFlicker(diff, w, h, tolerance)) {
      out.push(`tick ${head.tick}: majority ${base.hash} before, ${head.hash} now: ${diff.pixels} px differ (${((diff.pixels / (w * h)) * 100).toFixed(4)} % > ${(tolerance.share * 100).toFixed(4)} %), max step ${diff.maxDelta}`);
    }
  }
  return out;
}
