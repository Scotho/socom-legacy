import type { Rgba } from '@s2u/gs';

/**
 * GM-13 (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-13; research 380 §5): the menus' GPU texture cache. PRODUCT
 * TRACK, a browser adaptation: it decides when a bitmap's bytes reach the GPU and how long they stay, never which bytes
 * a frame samples -- a texture holds its image's bytes exactly (`RGBA8UI`, top row first, unflipped, not premultiplied,
 * no colour conversion: the backend's unpack state), and the planner and the programs decide every pixel. Held by
 * `test/uiGpuTextures.test.ts` on the fake WebGL2 (unit test); a real GPU's uploads and memory are the box's (GM-11b).
 *
 * - **Stable keys.** A bitmap is keyed by its content, `name|w x h|fnv1a64` of its bytes, memoised per image object (a
 *   `WeakMap`), so a bitmap decoded again (new objects, the same bytes: a page's banks read anew) uploads nothing again.
 *   GM-29: `frontEndAssets.ts` no longer clears its decode cache at a bank's arrival, and its prefetch seeds the memo
 *   with the decode worker's hash of the same bytes (`seedUiGpuTextureKey`), so a cold dialog's first GPU frame hashes
 *   nothing it was handed by the prefetch. An HD image is keyed by the pack's own key (`UiGpuHdKeys.gpuKeyOf`:
 *   `hd|<pack>|<sha256 of the source>`, `hdKeyOf`'s), so a 64 MiB replacement is never hashed here.
 * - **No cached image rewritten in place** (GM-12a review F4, GM-11a-2 review F4). The memo checks each image at every
 *   use against its key's probes (`UI_GPU_TEXTURE_PROBES` bytes spread over it, its first and last among them, and the
 *   data array's identity): a rewrite they see keys the image anew (counted, `uiGpuKeyCounts.rewritten`), so the
 *   presenter's dirty check and this cache see new bytes and upload them once. A rewrite between the probes is not
 *   seen, so the rule stands: no producer rewrites a bitmap it has handed out (none does today: `loadingPanel.ts`,
 *   `uiCompositorView.ts` and the banks write fresh buffers), and `'full'` verification (every byte at every use) is
 *   there for a run that checks it over the corpus.
 * - **Residency**: a texture a frame did not use stays until `HD_UI_RESIDENCY_ADAPTATION` drawn frames have passed
 *   without it (a dialog switch back and forth uploads nothing), or until the VRAM cap needs its bytes. One frame is
 *   one tick of the clock: a `stage` and the `begin` of the draw that follows it are the same frame (GM-13 review F1:
 *   they were counted twice, halving the residency); a `stage` with no draw after it (the frame drawn L1) is a frame.
 * - **VRAM LRU**: past `HD_UI_VRAM_BYTES_ADAPTATION`, the least recently used textures the frame does not use are
 *   deleted first; a frame's own are never (a frame alone past the cap is drawn whole and counted, `overVram`).
 * - **The per-frame upload budget** (`stage`): at most `HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION` uploaded in one frame
 *   -- the first upload always goes, so a texture larger than the budget goes up alone; what is left is reported and the
 *   presenter draws that frame on the software (L1) until it is up (GM.R12's spreading; GM-13b moves the decode).
 * - **Re-created after a loss**: `abandon` drops every handle with no GL call; the next context's cache uploads again
 *   from the memoised keys (no rehash), under the budget.
 * - **The pack's `version`** (`HdMenuTextures.version`, an answer arrived): a texture of a name the frame now draws
 *   under another key is freed at once ("new version: one upload, the old freed"); a new pack (`pack`) or HD off frees
 *   every texture of the old pack at once.
 */

/** No original; bounds the browser's GPU memory for the menus' textures: 256 MiB to start (the plan's), then measured. */
export const HD_UI_VRAM_BYTES_ADAPTATION = 256 * 1024 * 1024;
/**
 * No original; bounds the browser's work in one frame: the texture bytes uploaded in one frame before the rest wait for
 * the next (that frame on the software). 32 MiB -- two 4x full-frame backgrounds (2048 x 2048 x 4) -- a start value,
 * measured on the box (GM-13b's cold-switch perf run), never tuned by feel.
 */
export const HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION = 32 * 1024 * 1024;
/**
 * No original; bounds the browser's GPU memory over time: the drawn frames a texture stays resident without a frame
 * using it (1800: 30 s of frames drawn at 60 Hz; a still menu draws none, GM-12a's dirty check). A start value.
 */
export const HD_UI_RESIDENCY_ADAPTATION = 1800;
/**
 * UI_GPU_OVERSIZE_ROUTE_ADAPTATION: no original; bounds the browser's GPU on a frame that samples an image past the
 * device's `MAX_TEXTURE_SIZE` (GM-14b, case 15; the capability floor is 4096, `UI_GPU_MIN_MAX_TEXTURE_SIZE`, and the HD
 * pack may name images up to `HD_LIMITS.outputEdge`, 8192 a side: a 4x replacement of a source at `HD_LIMITS.sourceEdge`
 * is 4096 and fits, a larger ratio or a placement composite may not). Such a frame is **L1 at its fallback scale**
 * (`plan.fallback`: 1x under HD, the original frame, GM.R9 and GM.R19; the shown scale only under dev sampling, which a
 * plan already leaves L1): the software draws it with no HD lookup, the backend shows it `s x s`, and no texture past the
 * limit is made or sent. It is not drawn from a downscaled copy or from the 1x bitmap on the GPU: either would put on
 * the canvas a picture the reference at the shown scale (the software with the pack's image) does not draw -- outside the
 * B bound, and a guard trip -- while the L1 frame is the 1x software's byte for byte, which the parity spec holds. A frame
 * on the route is counted on the read-out (`window.__uiGpu.refusals.counts`) under `reason`, one key whatever image or
 * limit, so a run shows how often it happens; the refusal itself is `reason` followed by `: ` and each image's detail
 * (`uiGpuOversizeRefusal`: its name, the HD pack's key where one names it, its size, the limit), which the read-out's
 * `refusals.last.why` keeps (GM-14b review F2), so a run that fires the route says which image did. Decides when the GPU
 * draws, never a byte of the frame.
 */
export const UI_GPU_OVERSIZE_ROUTE_ADAPTATION = Object.freeze({
  route: 'frame-fallback',
  reason: 'an image past MAX_TEXTURE_SIZE: the frame L1 at its fallback scale (UI_GPU_OVERSIZE_ROUTE_ADAPTATION, GM-14b)',
} as const);

/** One planned texture's size and kind, as `uiGpuOversized` reads it. */
export interface UiGpuSizedTexture { readonly name: string; readonly width: number; readonly height: number; readonly hd: boolean }

/** GM-14b: the planned textures past `max` on either side, in the plan's order -- the frames `UI_GPU_OVERSIZE_ROUTE_ADAPTATION` routes. */
export function uiGpuOversized(textures: readonly UiGpuSizedTexture[], max: number): UiGpuSizedTexture[] {
  return textures.filter((t) => t.width > max || t.height > max).map(({ name, width, height, hd }) => ({ name, width, height, hd }));
}

/**
 * GM-14b review F2: the route's refusal -- `UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason`, then `: ` and each oversized
 * image's detail (`<name> (<HD key|bitmap>, <w> x <h>) past MAX_TEXTURE_SIZE <max>`, joined by `; `). `key` gives an HD
 * image's pack key (`UiGpuHdKeys.gpuKeyOf`), or null.
 */
export function uiGpuOversizeRefusal(oversized: readonly UiGpuSizedTexture[], max: number, key: (i: number) => string | null = () => null): string {
  const detail = oversized.map((t, i) => {
    const k = key(i);
    return `${t.name} (${t.hd ? `HD${k ? ` ${k}` : ''}` : 'bitmap'}, ${t.width} x ${t.height}) past MAX_TEXTURE_SIZE ${max}`;
  });
  return `${UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason}: ${detail.join('; ')}`;
}

/**
 * GM-14b review F2: the key a refusal is counted under on the read-out (`UiGpuSwitch.refused`): the route's one reason
 * for any refusal of the large-image route, whatever its detail; every other refusal as it stands.
 */
export function uiGpuRefusalKey(why: string): string {
  return why.startsWith(`${UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason}: `) ? UI_GPU_OVERSIZE_ROUTE_ADAPTATION.reason : why;
}

/** The bytes of an image each use re-reads to tell a rewrite (spread evenly, first and last included). */
export const UI_GPU_TEXTURE_PROBES = 256;

/** How an image is checked against its memoised key: its probes (every frame) or its whole bytes (a test's pin). */
export type UiGpuTextureVerify = 'probe' | 'full';

/** FNV-1a, 64-bit, over the bytes, as 16 hex digits (offset 0xcbf29ce484222325, prime 0x100000001b3). */
export function fnv1a64(bytes: ArrayLike<number>): string {
  let lo = 0x84222325 | 0, hi = 0xcbf29ce4 | 0;
  for (let i = 0, n = bytes.length; i < n; i++) {
    lo ^= bytes[i]!;
    // (hi:lo) * (2^40 + 0x1b3) mod 2^64, in 32-bit integer steps: lo * 0x1b3's high word from its 16-bit halves.
    const p0 = (lo & 0xffff) * 0x1b3, p1 = (lo >>> 16) * 0x1b3;
    hi = (Math.imul(hi, 0x1b3) + ((p1 + (p0 >>> 16)) >>> 16) + (lo << 8)) | 0;
    lo = Math.imul(lo, 0x1b3);
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

interface Memo { hash: string; data: Rgba['data']; width: number; height: number; probes: Uint8Array }
const MEMO = new WeakMap<Rgba, Memo>();
/** The memo's work, for tests and the perf record: images hashed, and images found rewritten since they were keyed. */
export const uiGpuKeyCounts = { hashed: 0, rewritten: 0 };

const probeAt = (n: number, k: number): number => (n <= UI_GPU_TEXTURE_PROBES ? k : Math.floor((k * (n - 1)) / (UI_GPU_TEXTURE_PROBES - 1)));
function probesOf(data: Rgba['data']): Uint8Array {
  const n = data.length, m = Math.min(n, UI_GPU_TEXTURE_PROBES), out = new Uint8Array(m);
  for (let k = 0; k < m; k++) out[k] = data[probeAt(n, k)]!;
  return out;
}
function probesHold(m: Memo, data: Rgba['data']): boolean {
  const n = data.length;
  for (let k = 0; k < m.probes.length; k++) if (data[probeAt(n, k)] !== m.probes[k]) return false;
  return true;
}

/** An image's content hash, memoised per object and checked at each use (`verify`). */
function contentHash(image: Rgba, verify: UiGpuTextureVerify): string {
  const m = MEMO.get(image);
  const same = m !== undefined && m.data === image.data && m.width === image.width && m.height === image.height;
  if (same && verify === 'probe' && probesHold(m, image.data)) return m.hash;
  const hash = fnv1a64(image.data);
  uiGpuKeyCounts.hashed++;
  if (same && hash === m.hash) return hash;
  if (m) uiGpuKeyCounts.rewritten++;
  MEMO.set(image, { hash, data: image.data, width: image.width, height: image.height, probes: probesOf(image.data) });
  return hash;
}

/**
 * GM-29: `image`'s content hash computed elsewhere -- the front end's decode worker (`./frontEndTextureBank`'s decode), the same
 * `fnv1a64` over the same bytes -- kept as the memo, so its first key reads it without hashing on the page's main thread.
 * The memo's checks are unchanged: its probes are taken here, from the image as it stands, and every later use checks
 * them (`verify`) as for a hash made here. An image already memoised keeps its memo. PRODUCT TRACK, a browser
 * adaptation (when a hash is made, never what it is).
 */
export function seedUiGpuTextureKey(image: Rgba, hash: string): void {
  if (MEMO.has(image)) return;
  MEMO.set(image, { hash, data: image.data, width: image.width, height: image.height, probes: probesOf(image.data) });
}

/** A bitmap's content key: `name|w x h|fnv1a64`. */
export function uiGpuTextureKey(name: string, image: Rgba, verify: UiGpuTextureVerify = 'probe'): string {
  return `${name}|${image.width}x${image.height}|${contentHash(image, verify)}`;
}

/**
 * The HD lookup's keys (`HdMenuTextures` is one): `pack` names the pack in use (a new one each time the pack is turned
 * on), `version` moves when an answer changes, and `gpuKeyOf` gives a kept replacement's key (`hd|<pack>|<sha256>`), null
 * for an image it does not hold.
 */
export interface UiGpuHdKeys { readonly pack: number; readonly version: number; gpuKeyOf(image: Rgba): string | null }

/** What the cache is asked for: a plan texture's name, whether it is the HD replacement, and its pixels. */
export interface UiGpuTextureRef { name: string; hd: boolean; image: Rgba }

/** The GL the cache drives: the backend's texture storage (NEAREST, CLAMP, immutable) and its unpack state. */
export interface UiGpuTextureHost {
  gl: WebGL2RenderingContext;
  storage(format: number, width: number, height: number): WebGLTexture;
  unpackState(): void;
}

export interface UiGpuTextureOptions {
  vramBytes?: number;
  uploadBytesPerFrame?: number;
  residencyFrames?: number;
  verify?: UiGpuTextureVerify;
}

export interface UiGpuTextureStats {
  resident: number;
  residentBytes: number;
  peakBytes: number;
  uploads: number;
  uploadedBytes: number;
  /** Bytes a draw uploaded past the per-frame budget (a draw without `stage`, as tests and the harness do). */
  unbudgetedBytes: number;
  evictions: number;
  expired: number;
  superseded: number;
  /** Frames whose own textures alone were past the VRAM cap. */
  overVram: number;
}

interface Entry { key: string; name: string; texture: WebGLTexture; bytes: number; lastUsed: number; pack: number | null }

export class UiGpuTextureCache {
  private entries = new Map<string, Entry>();
  private tick = 0;
  private hd: UiGpuHdKeys | null = null;
  private seenPack: number | null = null;
  private seenVersion: number | null = null;
  private gone: 'abandoned' | 'disposed' | null = null;
  /** A `stage` has counted the frame its draw's `begin` belongs to (GM-13 review F1). */
  private staged = false;
  private readonly vram: number;
  private readonly budget: number;
  private readonly residency: number;
  private readonly verify: UiGpuTextureVerify;
  private counts: Omit<UiGpuTextureStats, 'resident' | 'residentBytes'> = {
    peakBytes: 0, uploads: 0, uploadedBytes: 0, unbudgetedBytes: 0, evictions: 0, expired: 0, superseded: 0, overVram: 0,
  };
  private bytes = 0;

  constructor(private readonly host: UiGpuTextureHost, o: UiGpuTextureOptions = {}) {
    this.vram = o.vramBytes ?? HD_UI_VRAM_BYTES_ADAPTATION;
    this.budget = o.uploadBytesPerFrame ?? HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION;
    this.residency = o.residencyFrames ?? HD_UI_RESIDENCY_ADAPTATION;
    this.verify = o.verify ?? 'probe';
  }

  get stats(): UiGpuTextureStats { return { ...this.counts, resident: this.entries.size, residentBytes: this.bytes }; }

  /** Whether a key's texture is on the GPU now. */
  resident(key: string): boolean { return this.entries.has(key); }

  /** The HD lookup whose keys name HD images (null: HD off). */
  setHd(hd: UiGpuHdKeys | null): void { this.hd = hd; }

  /** GM-14b review F2: an HD image's pack key, where the HD lookup keeps it (never a content hash); null otherwise. */
  hdKeyOf(image: Rgba): string | null { return this.hd ? this.hd.gpuKeyOf(image) : null; }

  /** A texture's key (the HD lookup's for a replacement it keeps, else the content key). */
  keyOf(t: UiGpuTextureRef): string {
    if (t.hd && this.hd) { const k = this.hd.gpuKeyOf(t.image); if (k !== null) return k; }
    return uiGpuTextureKey(t.name, t.image, this.verify);
  }

  keysOf(ts: readonly UiGpuTextureRef[]): string[] { return ts.map((t) => this.keyOf(t)); }

  /**
   * One frame's budgeted uploads, ahead of its draw: the frame's missing textures uploaded in its order while the bytes
   * stay within the per-frame budget (the first always goes). `pending`: the bytes still to upload (the frame waits).
   */
  stage(ts: readonly UiGpuTextureRef[], known?: readonly string[]): { uploaded: number; pending: number } {
    const keys = this.frame(ts, known, true);
    this.staged = true;
    let uploaded = 0, pending = 0;
    const done = new Set<string>();
    ts.forEach((t, i) => {
      const key = keys[i]!;
      if (done.has(key)) return;
      done.add(key);
      if (this.entries.has(key)) { this.touch(key); return; }
      const bytes = t.image.width * t.image.height * 4;
      if (uploaded === 0 || uploaded + bytes <= this.budget) { this.upload(t, key); uploaded += bytes; } else pending += bytes;
    });
    this.evict(new Set(keys));
    return { uploaded, pending };
  }

  /** A draw's start: the frame's keys (`known`: as the caller just computed them), the pack's changes applied. */
  begin(ts: readonly UiGpuTextureRef[], known?: readonly string[]): string[] {
    const counted = this.staged;
    this.staged = false;
    return this.frame(ts, known, !counted);
  }

  /** The frame's texture for `t` under `key`: resident, or uploaded now (past the budget when no `stage` ran: counted). */
  texture(t: UiGpuTextureRef, key: string): WebGLTexture {
    this.live();
    const e = this.entries.get(key);
    if (e) { this.touch(key); return e.texture; }
    const made = this.upload(t, key);
    this.counts.unbudgetedBytes += made.bytes;
    return made.texture;
  }

  /** A draw's end: residency and the VRAM cap applied, the frame's own textures kept. */
  end(keys: readonly string[]): void { this.evict(new Set(keys)); }

  /** After a loss: every handle dropped with no GL call (the lost context's objects are gone); the cache refuses work. */
  abandon(): void { this.entries.clear(); this.bytes = 0; this.gone = 'abandoned'; }

  /** Every texture deleted; the cache refuses work after. */
  dispose(): void {
    if (this.gone) return;
    for (const e of this.entries.values()) this.host.gl.deleteTexture(e.texture);
    this.entries.clear(); this.bytes = 0; this.gone = 'disposed';
  }

  private live(): void { if (this.gone) throw new Error(`UiGpuTextureCache: ${this.gone}`); }

  /** A frame's keys, and the pack's changes since the last frame: a new pack's old textures, a new answer's superseded ones. */
  private frame(ts: readonly UiGpuTextureRef[], known: readonly string[] | undefined, count: boolean): string[] {
    this.live();
    if (count) this.tick++;
    const keys = known && known.length === ts.length ? known.slice() : this.keysOf(ts);
    const pack = this.hd?.pack ?? null, version = this.hd?.version ?? null;
    if (pack !== this.seenPack) for (const e of [...this.entries.values()]) if (e.pack !== null && e.pack !== pack) this.free(e, 'superseded');
    if (pack !== this.seenPack || version !== this.seenVersion) {
      const now = new Set(keys), names = new Set(ts.map((t) => t.name));
      for (const e of [...this.entries.values()]) if (names.has(e.name) && !now.has(e.key)) this.free(e, 'superseded');
    }
    this.seenPack = pack; this.seenVersion = version;
    return keys;
  }

  private upload(t: UiGpuTextureRef, key: string): Entry {
    const gl = this.host.gl, { width: w, height: h, data } = t.image;
    if (data.length !== w * h * 4) throw new Error(`UiGpuTextureCache: a bitmap of ${data.length} bytes for ${w} x ${h}`);
    const texture = this.host.storage(gl.RGBA8UI, w, h);
    this.host.unpackState();
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.length));
    const pack = t.hd && this.hd && key.startsWith('hd|') ? this.hd.pack : null;
    const e: Entry = { key, name: t.name, texture, bytes: data.length, lastUsed: this.tick, pack };
    this.entries.set(key, e);
    this.bytes += e.bytes;
    this.counts.uploads++; this.counts.uploadedBytes += e.bytes;
    this.counts.peakBytes = Math.max(this.counts.peakBytes, this.bytes);
    return e;
  }

  /** Used this frame: most recent (the map's order is the LRU order). */
  private touch(key: string): void {
    const e = this.entries.get(key)!;
    e.lastUsed = this.tick;
    this.entries.delete(key); this.entries.set(key, e);
  }

  private free(e: Entry, why: 'evictions' | 'expired' | 'superseded'): void {
    this.host.gl.deleteTexture(e.texture);
    this.entries.delete(e.key);
    this.bytes -= e.bytes;
    this.counts[why]++;
  }

  private evict(keep: Set<string>): void {
    for (const e of [...this.entries.values()]) if (!keep.has(e.key) && this.tick - e.lastUsed > this.residency) this.free(e, 'expired');
    if (this.bytes <= this.vram) return;
    for (const e of [...this.entries.values()]) {
      if (this.bytes <= this.vram) return;
      if (!keep.has(e.key)) this.free(e, 'evictions');
    }
    if (this.bytes > this.vram) this.counts.overVram++;
  }
}
