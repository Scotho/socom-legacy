import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

/**
 * **The GPU trace instrument** (a test-only instrument, product track: it wraps the page's WebGL2 and WebGPU allocation
 * calls to count them and changes nothing the game does). Injected as an init script by `zz-gpu-trace.spec.ts`; built for
 * the Xbox context-loss investigation (`docs/research/396-xbox-gpu-memory-at-match-start.md`; its review's F7: the
 * note's numbers re-derivable from the repository).
 *
 * **The byte rule.** Each allocation's bytes are an ESTIMATE from its call's arguments, not a driver's figure:
 * - a texture: width x height x depth (layers) x the format's bytes per texel (`glTexelBytes`, `gpuTexelBytes`), summed
 *   over the levels it declares (`texStorage*`, `mipLevelCount`) or uploads (`texImage*` per level); `generateMipmap` on
 *   a texture whose levels were uploaded (`texImage*`) adds a third of its level 0 (every face's, for a cube), and on an
 *   immutable texture (`texStorage*`, its chain already counted) adds nothing; a WebGPU texture is multiplied by its
 *   `sampleCount`; a compressed upload counts its data's bytes;
 * - a renderbuffer: width x height x bytes per texel x samples;
 * - a buffer: its `bufferData` size or WebGPU `size`.
 * Driver padding, alignment, the swap chain, ANGLE's own copies and the browser's compositor are not counted, so the
 * figures are an estimate of what the page asks for (an unlisted format counts 4 bytes per texel), never a driver's. A
 * free (`delete*`, `destroy`) removes the record; a context that is lost keeps its records (the page's view, not the
 * driver's).
 *
 * **The tag.** Each record is tagged by the first page-source file on its stack (`gpuTraceTag`): a coarse grouping by file
 * name for reading a trace, not a claim of ownership; three.js's lazy uploads have no page frame and are tagged so.
 *
 * In the page: `window.__gpuTrace` holds `frames` (per animation frame: the live total, render targets, by tag, by
 * context, `performance.memory.usedJSHeapSize` where the browser gives it), `marks`, `allocs`, `live`, `contexts` and
 * `lost`; `window.__gpuTrace.mark(label)` adds a mark. `summarizeGpuTrace` turns a collected trace into a report.
 */

/** Bytes per texel of a WebGL2 internal format or (unsized) format, with its type where the format alone does not say. */
export function glTexelBytes(format: number, type?: number): number {
  // RGBA with FLOAT 16 bytes; RGBA with HALF_FLOAT (0x140B, OES 0x8D61) 8.
  if (format === 0x1908 && type === 0x1406) return 16;
  if (format === 0x1908 && (type === 0x140B || type === 0x8D61)) return 8;
  const table: Record<number, number> = {
    0x8058: 4, 0x8C43: 4, 0x881A: 8, 0x8814: 16, 0x8815: 12, 0x881B: 6, 0x8051: 3, 0x8C41: 3, 0x8229: 1, 0x822B: 2, 0x822D: 2, 0x822F: 4,
    0x822E: 4, 0x8230: 8, 0x88F0: 4, 0x81A6: 4, 0x8CAC: 4, 0x8CAD: 8, 0x81A5: 2, 0x8D48: 1, 0x8C3A: 4, 0x8C3D: 4,
    0x8D62: 2, 0x8056: 2, 0x8057: 2, 0x1908: 4, 0x1907: 3, 0x1906: 1, 0x1909: 1, 0x190A: 2, 0x1902: 4,
  };
  return table[format] ?? 4;
}

/** Bytes per texel of a WebGPU texture format (block-compressed formats: one byte per texel, BC1's half rounded up). */
export function gpuTexelBytes(format: string): number {
  const rgba = /rgba/.test(format), rg = !rgba && /^rg/.test(format);
  if (/32(float|uint|sint)/.test(format)) return rgba ? 16 : rg ? 8 : 4;
  if (/16(float|uint|sint|unorm|snorm)/.test(format)) return rgba ? 8 : rg ? 4 : 2;
  if (/^(r8|stencil8)/.test(format)) return 1;
  if (/^rg8/.test(format)) return 2;
  if (/^(bc[1-7]|etc2|eac|astc)/.test(format)) return 1;
  return 4;
}

/** The trace's coarse tag for a page-source file (null: no page frame on the stack). */
export function gpuTraceTag(file: string | null): string {
  if (file === null) return 'three (lazy, no page frame)';
  const f = file.toLowerCase();
  if (/charshadow/.test(f)) return 'shadow map';
  if (/uigpu|frontend|menu|native|dialog|rdr|raster|lobby|console\/|modern\/|launcher|font|glyph/.test(f)) return 'menu/lobby raster';
  if (/hud|reticle|compass|scoreboard/.test(f)) return 'hud';
  if (/loadmap|world|terrain|scene\/src|archive|map(net|load|page)?\.ts|detail|lightmap|sky/.test(f)) return 'map';
  if (/body|remoteplayers|ownbody|character|skin|model|loadout|equipment|weaponline|held/.test(f)) return 'player models';
  if (/particle|effect|fire|blast|smoke|grenade|tracer/.test(f)) return 'effects';
  if (/glow|post|fxaa|experimental|presentation|ps2frame|matchviewport|frametarget|renderer\.ts|matchrenderer/.test(f)) return 'render targets/post';
  return `other:${file}`;
}

export interface GpuTraceFrame { t: number; total: number; rt: number; byTag: Record<string, number>; byCtx: Record<string, number>; heap: number | null; n: number; ctxs: number }
export interface GpuTraceLive { ctx: string; kind: string; tag: string; file: string | null; bytes: number; w?: number; h?: number; rt: boolean }
export interface GpuTraceContext { t: number; type: string; name: string; w: number; h: number; antialias: boolean; alive: boolean; detachedAt?: number }
/** What `zz-gpu-trace.spec.ts` collects from the page. */
export interface GpuTrace {
  frames: GpuTraceFrame[]; marks: { t: number; label: string }[]; live: GpuTraceLive[];
  contexts: GpuTraceContext[]; lost: { t: number; name: string; msg: string }[];
}

/**
 * The page side. Standalone and serializable: everything it uses arrives as an argument (`gpuTraceScript`). Every hook
 * calls the original first and never throws into the page.
 */
export function installGpuTrace(texelGl: typeof glTexelBytes, texelGpu: typeof gpuTexelBytes, tagOfFile: typeof gpuTraceTag): void {
  type Rec = { key: string; ctx: string; kind: string; tag: string; file: string | null; bytes: number; w?: number; h?: number; rt: boolean; immutable?: boolean; levels?: Map<string, number> };
  type Ctx = { t: number; type: string; name: string; w: number; h: number; antialias: boolean; alive: boolean; detachedAt?: number };
  const g = globalThis as unknown as Record<string, unknown>;
  if (g['__gpuTrace']) return;
  const start = performance.now();
  const now = (): number => performance.now() - start;
  const T = {
    frames: [] as unknown[], marks: [] as { t: number; label: string }[], allocs: [] as unknown[], live: new Map<string, Rec>(),
    contexts: [] as Ctx[], lost: [] as { t: number; name: string; msg: string }[],
    // The canvases the page made a WebGL2 context on (the loss fault's targets), held weakly so the trace keeps none alive.
    glCanvases: [] as WeakRef<HTMLCanvasElement>[],
    mark: (label: string): void => { T.marks.push({ t: now(), label }); },
  };
  g['__gpuTrace'] = T;
  const tagOf = (): { tag: string; file: string | null } => {
    for (const line of (new Error().stack ?? '').split('\n').slice(2)) {
      const m = /\/src\/([\w/.-]+?\.ts)/.exec(line) ?? /\/packages\/([\w/.-]+?\.ts)/.exec(line);
      if (m) return { tag: tagOfFile(m[1]!), file: m[1]! };
    }
    return { tag: tagOfFile(null), file: null };
  };
  const ctxName = (canvas: unknown): string => {
    const c = canvas as HTMLCanvasElement | null;
    if (!c || typeof c.getAttribute !== 'function') return 'offscreen';
    const d = Object.keys(c.dataset ?? {}).join('+');
    return `${c.className || c.id || 'canvas'}${d ? `[${d}]` : ''}#${c.width}x${c.height}`;
  };
  const add = (r: Rec): void => { T.live.set(r.key, r); T.allocs.push({ t: now(), ctx: r.ctx, kind: r.kind, tag: r.tag, file: r.file, bytes: r.bytes, w: r.w, h: r.h }); };
  const free = (r: Rec): void => { T.live.delete(r.key); T.allocs.push({ t: now(), ctx: r.ctx, kind: `${r.kind}-free`, tag: r.tag, file: r.file, bytes: -r.bytes }); };
  let seq = 0;
  // Wrap a method: the original runs first and its result is returned; the hook's own failure is swallowed.
  const wrap = (proto: object, name: string, hook: (self: never, a: never[], r: unknown) => void): void => {
    const p = proto as Record<string, unknown>; const orig = p[name];
    if (typeof orig !== 'function') return;
    p[name] = function (this: never, ...a: never[]): unknown { const r = (orig as (...x: unknown[]) => unknown).apply(this, a); try { hook(this, a, r); } catch { /* never break the page */ } return r; };
  };

  // --- WebGL2: the bound texture, buffer and renderbuffer per context, then each allocation against what is bound.
  if (typeof WebGL2RenderingContext !== 'undefined') {
    type GlState = { unit: number; tex: Map<string, unknown>; buf: Map<number, unknown>; rb: unknown; name: string };
    const states = new WeakMap<object, GlState>();
    const S = (gl: WebGL2RenderingContext): GlState => {
      let s = states.get(gl);
      if (!s) { s = { unit: 0, tex: new Map(), buf: new Map(), rb: null, name: ctxName(gl.canvas) }; states.set(gl, s); }
      return s;
    };
    const texRec = new WeakMap<object, Rec>(), bufRec = new WeakMap<object, Rec>(), rbRec = new WeakMap<object, Rec>();
    const GL = WebGL2RenderingContext.prototype;
    const sum = (r: Rec): number => [...r.levels!.values()].reduce((x, y) => x + y, 0);
    wrap(GL, 'activeTexture', (gl: WebGL2RenderingContext, a: number[]) => { S(gl).unit = a[0]! - 0x84C0; });
    wrap(GL, 'bindTexture', (gl: WebGL2RenderingContext, a: unknown[]) => { S(gl).tex.set(`${S(gl).unit}:${a[0] as number}`, a[1]); });
    wrap(GL, 'bindBuffer', (gl: WebGL2RenderingContext, a: unknown[]) => { S(gl).buf.set(a[0] as number, a[1]); });
    wrap(GL, 'bindRenderbuffer', (gl: WebGL2RenderingContext, a: unknown[]) => { S(gl).rb = a[1]; });
    const texSet = (gl: WebGL2RenderingContext, target: number, level: number, bytes: number, w: number, h: number): Rec | undefined => {
      const s = S(gl); const bindTarget = target >= 0x8515 && target <= 0x851A ? 0x8513 : target;   // a cube face: the cube
      const tex = s.tex.get(`${s.unit}:${bindTarget}`) as object | null | undefined; if (!tex) return undefined;
      let r = texRec.get(tex);
      if (!r) { const tg = tagOf(); r = { key: `t${++seq}`, ctx: s.name, kind: 'texture', tag: tg.tag, file: tg.file, levels: new Map(), bytes: 0, w, h, rt: false }; texRec.set(tex, r); }
      r.levels!.set(`${target}:${level}`, bytes); r.bytes = sum(r); if (level === 0) { r.w = w; r.h = h; }
      if (!T.live.has(r.key)) add(r);
      return r;
    };
    wrap(GL, 'texImage2D', (gl: WebGL2RenderingContext, a: unknown[]) => {
      if (a.length >= 8) { texSet(gl, a[0] as number, a[1] as number, (a[3] as number) * (a[4] as number) * texelGl(a[2] as number, a[7] as number), a[3] as number, a[4] as number); return; }
      const src = a[5] as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | null;
      const w = src?.width ?? src?.videoWidth ?? 0, h = src?.height ?? src?.videoHeight ?? 0;
      texSet(gl, a[0] as number, a[1] as number, w * h * texelGl(a[2] as number, a[4] as number), w, h);
    });
    wrap(GL, 'texStorage2D', (gl: WebGL2RenderingContext, a: number[]) => {
      const [target, levels, fmt, w, h] = a as [number, number, number, number, number]; let b = 0;
      for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * texelGl(fmt);
      const r = texSet(gl, target, 0, b * (target === 0x8513 ? 6 : 1), w, h); if (r) r.immutable = true;   // the whole chain
    });
    wrap(GL, 'texStorage3D', (gl: WebGL2RenderingContext, a: number[]) => {
      const [target, levels, fmt, w, h, d] = a as [number, number, number, number, number, number]; let b = 0;
      for (let l = 0; l < levels; l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * d * texelGl(fmt);
      const r = texSet(gl, target, 0, b, w, h); if (r) r.immutable = true;   // the whole chain
    });
    wrap(GL, 'texImage3D', (gl: WebGL2RenderingContext, a: number[]) => { texSet(gl, a[0]!, a[1]!, a[3]! * a[4]! * a[5]! * texelGl(a[2]!, a[8]), a[3]!, a[4]!); });
    wrap(GL, 'compressedTexImage2D', (gl: WebGL2RenderingContext, a: unknown[]) => {
      const data = a[6] as { byteLength?: number } | undefined;
      texSet(gl, a[0] as number, a[1] as number, data?.byteLength ?? (a[3] as number) * (a[4] as number), a[3] as number, a[4] as number);
    });
    wrap(GL, 'generateMipmap', (gl: WebGL2RenderingContext, a: number[]) => {
      const s = S(gl); const tex = s.tex.get(`${s.unit}:${a[0]}`) as object | undefined; const r = tex && texRec.get(tex);
      if (!r || r.immutable) return;   // texStorage counted the chain already
      let level0 = 0; for (const [k, v] of r.levels!) if (k.endsWith(':0')) level0 += v;   // every face's level 0, for a cube
      r.levels!.set('mips', Math.round(level0 / 3)); r.bytes = sum(r);
    });
    wrap(GL, 'deleteTexture', (_gl: WebGL2RenderingContext, a: object[]) => { const r = a[0] && texRec.get(a[0]); if (r && T.live.has(r.key)) free(r); });
    wrap(GL, 'bufferData', (gl: WebGL2RenderingContext, a: unknown[]) => {
      const s = S(gl); const b = s.buf.get(a[0] as number) as object | undefined; if (!b) return;
      const bytes = typeof a[1] === 'number' ? a[1] : ((a[1] as { byteLength?: number } | null)?.byteLength ?? 0);
      let r = bufRec.get(b);
      if (!r) { const tg = tagOf(); r = { key: `b${++seq}`, ctx: s.name, kind: a[0] === 0x8893 ? 'index' : a[0] === 0x8A11 ? 'uniform' : 'vertex', tag: tg.tag, file: tg.file, bytes: 0, rt: false }; bufRec.set(b, r); }
      r.bytes = bytes; if (!T.live.has(r.key)) add(r);
    });
    wrap(GL, 'deleteBuffer', (_gl: WebGL2RenderingContext, a: object[]) => { const r = a[0] && bufRec.get(a[0]); if (r && T.live.has(r.key)) free(r); });
    const rbStore = (gl: WebGL2RenderingContext, fmt: number, w: number, h: number, samples: number): void => {
      const s = S(gl); const rb = s.rb as object | null; if (!rb) return;
      let r = rbRec.get(rb);
      if (!r) { const tg = tagOf(); r = { key: `r${++seq}`, ctx: s.name, kind: 'renderbuffer', tag: tg.tag, file: tg.file, bytes: 0, w, h, rt: true }; rbRec.set(rb, r); }
      r.bytes = w * h * texelGl(fmt) * Math.max(1, samples); r.w = w; r.h = h; if (!T.live.has(r.key)) add(r);
    };
    wrap(GL, 'renderbufferStorage', (gl: WebGL2RenderingContext, a: number[]) => { rbStore(gl, a[1]!, a[2]!, a[3]!, 1); });
    wrap(GL, 'renderbufferStorageMultisample', (gl: WebGL2RenderingContext, a: number[]) => { rbStore(gl, a[2]!, a[3]!, a[4]!, a[1]!); });
    wrap(GL, 'deleteRenderbuffer', (_gl: WebGL2RenderingContext, a: object[]) => { const r = a[0] && rbRec.get(a[0]); if (r && T.live.has(r.key)) free(r); });
    wrap(GL, 'framebufferTexture2D', (_gl: WebGL2RenderingContext, a: unknown[]) => { const r = a[3] ? texRec.get(a[3] as object) : undefined; if (r) r.rt = true; });
  }

  // --- WebGPU: each texture and buffer the device creates, freed by its destroy().
  const D = (globalThis as unknown as { GPUDevice?: { prototype: Record<string, unknown> } }).GPUDevice;
  if (D) {
    type Destroyable = { destroy(): void };
    const track = (obj: Destroyable, r: Rec): void => {
      add(r);
      const od = obj.destroy.bind(obj);
      obj.destroy = (): void => { if (T.live.has(r.key)) free(r); od(); };
    };
    const oT = D.prototype['createTexture'] as (d: unknown) => Destroyable;
    const oB = D.prototype['createBuffer'] as (d: unknown) => Destroyable;
    D.prototype['createTexture'] = function (this: unknown, desc: { size: number[] | { width: number; height?: number; depthOrArrayLayers?: number }; format: string; mipLevelCount?: number; sampleCount?: number; usage: number }): Destroyable {
      const tex = oT.call(this, desc);
      try {
        const sz = desc.size as { width?: number; height?: number; depthOrArrayLayers?: number } & number[];
        const w = sz.width ?? sz[0] ?? 1, h = sz.height ?? sz[1] ?? 1, d = sz.depthOrArrayLayers ?? sz[2] ?? 1;
        let b = 0; for (let l = 0; l < (desc.mipLevelCount ?? 1); l++) b += Math.max(1, w >> l) * Math.max(1, h >> l) * d * texelGpu(desc.format);
        const rt = (desc.usage & 0x10) !== 0;   // GPUTextureUsage.RENDER_ATTACHMENT
        const tg = tagOf();
        track(tex, { key: `g${++seq}`, ctx: 'webgpu', kind: rt ? 'gpu-texture(rt)' : 'gpu-texture', tag: tg.tag, file: tg.file, bytes: b * (desc.sampleCount ?? 1), w, h, rt });
      } catch { /* never break the page */ }
      return tex;
    };
    D.prototype['createBuffer'] = function (this: unknown, desc: { size: number }): Destroyable {
      const buf = oB.call(this, desc);
      try { const tg = tagOf(); track(buf, { key: `g${++seq}`, ctx: 'webgpu', kind: 'gpu-buffer', tag: tg.tag, file: tg.file, bytes: desc.size, rt: false }); } catch { /* never break the page */ }
      return buf;
    };
  }

  // --- contexts: creation, detachment and loss.
  const oGet = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, type: string, opts?: unknown) => unknown;
  const seen = new WeakSet<HTMLCanvasElement>();
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement, type: string, opts?: { antialias?: boolean }): unknown {
    const c = oGet.call(this, type, opts);
    try {
      if (c && !seen.has(this) && /webgl|webgpu/.test(String(type))) {
        seen.add(this);
        const rec: Ctx = { t: now(), type: String(type), name: ctxName(this), w: this.width, h: this.height, antialias: !!opts?.antialias, alive: true };
        T.contexts.push(rec);
        if (String(type) === 'webgl2') T.glCanvases.push(new WeakRef(this));
        this.addEventListener('webglcontextlost', (e) => { rec.alive = false; T.lost.push({ t: now(), name: rec.name, msg: (e as WebGLContextEvent).statusMessage ?? '' }); });
        const canvas = this; const check = (): void => { if (!canvas.isConnected) rec.detachedAt ??= now(); else setTimeout(check, 500); }; setTimeout(check, 500);
      }
    } catch { /* never break the page */ }
    return c;
  };

  // --- per animation frame: the live totals (the last 15 000 frames kept).
  const raf = requestAnimationFrame.bind(globalThis);
  const tick = (): void => {
    const byTag: Record<string, number> = {}, byCtx: Record<string, number> = {}; let total = 0, rt = 0;
    for (const r of T.live.values()) { total += r.bytes; byTag[r.tag] = (byTag[r.tag] ?? 0) + r.bytes; byCtx[r.ctx] = (byCtx[r.ctx] ?? 0) + r.bytes; if (r.rt) rt += r.bytes; }
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    T.frames.push({ t: Math.round(now()), total, rt, byTag, byCtx, heap: mem ? mem.usedJSHeapSize : null, n: T.live.size, ctxs: T.contexts.filter((c) => c.alive && c.detachedAt === undefined).length });
    if (T.frames.length > 20_000) T.frames.splice(0, 5_000);
    raf(tick);
  };
  raf(tick);
}

/** The init script: the page side with its three rules passed in. */
/**
 * A keepNames transform (tsx, esbuild) wraps named arrows in `__name(fn, "name")`, a helper defined at the module's top
 * that a function's toString() does not carry; the scripts define a pass-through one in their own block.
 */
const KEEP_NAMES_SHIM = 'const __name = (f) => f;';

export function gpuTraceScript(): string {
  return `{ ${KEEP_NAMES_SHIM} (${installGpuTrace.toString()})(${glTexelBytes.toString()}, ${gpuTexelBytes.toString()}, ${gpuTraceTag.toString()}); }`;
}

/**
 * The buffer-failure fault (c4's simulation of the field's WebGPU allocation failure, CreatePlacedResource with
 * DEVICE_REMOVED): once armed with `window.__armBufferFail(n)`, the next `n` `createBuffer` calls with
 * `mappedAtCreation` throw a RangeError; `window.__bufferFailLeft()` says how many are still to fire. Standalone.
 */
export function installBufferFail(): void {
  const D = (globalThis as unknown as { GPUDevice?: { prototype: Record<string, unknown> } }).GPUDevice;
  if (!D) return;
  const create = D.prototype['createBuffer'] as (d: unknown) => unknown;
  let armed = false, left = 0;
  const g = globalThis as unknown as Record<string, unknown>;
  g['__armBufferFail'] = (n = 3): void => { armed = true; left = n; };
  g['__bufferFailLeft'] = (): number => left;
  D.prototype['createBuffer'] = function (this: unknown, desc: { mappedAtCreation?: boolean } | undefined): unknown {
    if (armed && left > 0 && desc?.mappedAtCreation === true) {
      left--; if (left === 0) armed = false;
      throw new RangeError('bench: createBuffer failed (simulated CreatePlacedResource DEVICE_REMOVED)');
    }
    return create.call(this, desc);
  };
}

export function bufferFailScript(): string {
  return `{ ${KEEP_NAMES_SHIM} (${installBufferFail.toString()})(); }`;
}

const MB = (b: number): string => `${(b / 1048576).toFixed(1)} MB`;
const top = (o: Record<string, number>, k: number): string =>
  Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => `${n} ${MB(v)}`).join('; ');

/** A collected trace as report lines: the live bytes at each mark, the peak, the contexts and their losses, the heap. */
export function summarizeGpuTrace(trace: GpuTrace): string[] {
  const fr = trace.frames;
  if (fr.length === 0) return ['no frames recorded'];
  const nearest = (t: number): GpuTraceFrame => fr.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), fr[0]!);
  const peak = fr.reduce((a, b) => (b.total > a.total ? b : a), fr[0]!);
  const last = fr[fr.length - 1]!;
  const heaps = fr.map((f) => f.heap).filter((h): h is number => h !== null);
  const s = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
  const out = [
    `marks: ${trace.marks.map((m) => `${m.label}@${s(m.t)}=${MB(nearest(m.t).total)}`).join(', ')}`,
    `peak ${MB(peak.total)} at ${s(peak.t)} (render targets ${MB(peak.rt)}, ${peak.n} live objects); by tag: ${top(peak.byTag, 10)}; by context: ${top(peak.byCtx, 8)}`,
    `end ${MB(last.total)} at ${s(last.t)}; by tag: ${top(last.byTag, 10)}`,
    heaps.length ? `JS heap: min ${MB(Math.min(...heaps))}, max ${MB(Math.max(...heaps))}, end ${MB(heaps[heaps.length - 1]!)}` : 'JS heap: not given by the browser',
  ];
  for (const c of trace.contexts) out.push(`context ${c.type} ${c.name} aa=${c.antialias} created ${s(c.t)}${c.detachedAt !== undefined ? ` detached ${s(c.detachedAt)}` : ''}${c.alive ? '' : ' LOST'}`);
  for (const l of trace.lost) out.push(`lost ${l.name} at ${s(l.t)}${l.msg ? ` (${l.msg})` : ''}`);
  out.push(`biggest live: ${[...trace.live].sort((a, b) => b.bytes - a.bytes).slice(0, 8).map((r) => `${r.kind}:${r.tag}${r.w ? ` ${r.w}x${r.h}` : ''} ${MB(r.bytes)}`).join(' | ')}`);
  return out;
}

export type GpuTraceFault = 'none' | 'bufferfail' | 'webgl-loss';
export interface GpuTraceEnv {
  out: string; backend: 'xbox' | 'webgl2' | 'webgpu'; video: string | null; playSeconds: number; args: string[];
  fault: GpuTraceFault; exit: 'abort' | 'stop';
}

/**
 * The spec's switches, checked (`zz-gpu-trace.spec.ts`'s header names each). The output directory defaults to the
 * host's temporary folder and is never inside `<web>/test-results`, which Playwright empties at the start of every run
 * (the rule of `uiGpuMenuFramesRecord.ts`'s `menuFramesEnv`).
 */
export function gpuTraceEnv(env: Record<string, string | undefined>, web: string): GpuTraceEnv {
  const fold = (p: string): string => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  const out = resolve(web, env['S2U_GPU_TRACE_OUT']?.trim() || join(tmpdir(), 's2u-gpu-trace'));
  const rel = relative(fold(join(web, 'test-results')), fold(out));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw Error(`S2U_GPU_TRACE_OUT: ${JSON.stringify(out)} is inside ${join(web, 'test-results')}, which Playwright empties at the start of every run; name a directory outside it`);
  }
  const backend = env['S2U_GPU_TRACE_BACKEND']?.trim() || 'xbox';
  if (backend !== 'xbox' && backend !== 'webgl2' && backend !== 'webgpu') throw Error('S2U_GPU_TRACE_BACKEND must be xbox, webgl2 or webgpu');
  const video = env['S2U_GPU_TRACE_VIDEO']?.trim() || null;
  if (video !== null) { try { JSON.parse(video); } catch { throw Error('S2U_GPU_TRACE_VIDEO must be JSON, e.g. {"preset":"balanced","graphics":"webgpu"}'); } }
  const playSeconds = Number(env['S2U_GPU_TRACE_PLAY_S']?.trim() || 30);
  if (!Number.isFinite(playSeconds) || playSeconds <= 0 || playSeconds > 3600) throw Error('S2U_GPU_TRACE_PLAY_S must be a number of seconds, more than 0 and at most 3600');
  const fault = env['S2U_GPU_TRACE_FAULT']?.trim() || 'none';
  if (fault !== 'none' && fault !== 'bufferfail' && fault !== 'webgl-loss') throw Error('S2U_GPU_TRACE_FAULT must be none, bufferfail or webgl-loss');
  const exit = env['S2U_GPU_TRACE_EXIT']?.trim() || 'abort';
  if (exit !== 'abort' && exit !== 'stop') throw Error('S2U_GPU_TRACE_EXIT must be abort or stop');
  return { out, backend, video, playSeconds, args: (env['S2U_GPU_TRACE_ARGS'] ?? '').split(' ').filter(Boolean), fault, exit };
}
