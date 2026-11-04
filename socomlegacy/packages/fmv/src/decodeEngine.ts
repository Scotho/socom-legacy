/**
 * The MPEG-2 decoder as the core drives it (PLAT-19b; research 120 §2): libmpeg2 0.5.1 compiled to WebAssembly by
 * `packages/fmv/wasm/build.sh`, behind `glue.c`'s API (research 98 §7.1) -- feed bytes, take pictures in display order
 * as three planes with their tags, flush at the end, reset for the next movie.
 *
 * Pure (W9.R6): the WebAssembly instance enters as a parameter -- the viewer's worker compiles and instantiates the
 * module and passes its exports to `wasmMpeg2Engine`; nothing here fetches, compiles or names a browser global. The
 * tests drive the core through the same `Mpeg2Engine` with a fake decoder.
 */

/** What `next` answers (`s2u_fmv_next`): 1 a picture is ready, 0 bytes are needed (or, after a flush, the end), -1 an invalid stream state. */
export type EngineState = 1 | 0 | -1;

/** A displayed picture: the decoder's own planes, valid until the next `next`. */
export interface EnginePicture {
  width: number;
  height: number;
  chromaWidth: number;
  chromaHeight: number;
  /** The planes, Y `width` wide and Cb, Cr `chromaWidth` wide, row after row. */
  y: Uint8Array;
  cb: Uint8Array;
  cr: Uint8Array;
  /** The coding type: 1 I, 2 P, 3 B, 4 D. */
  type: number;
  temporalReference: number;
  /** The tag of the feed its picture start code arrived in (`mpeg2_tag_picture`), or null when untagged. */
  tag: number | null;
}

/** The decoder the core drives. One movie at a time; `reset` starts the next one on the same instance. */
export interface Mpeg2Engine {
  /** Forget the stream: the next bytes begin a new one (a second movie, or the same from its start). */
  reset(): void;
  /**
   * Hand the decoder `bytes` (copied into its own buffer). Only after `next` has answered 0. `tag`: the next picture
   * whose start code is in these bytes carries it. Throws when the decoder cannot take them (no memory).
   */
  feed(bytes: Uint8Array, tag?: number | null): void;
  next(): EngineState;
  /** The end of the input: complete the last picture and release the held reference (`s2u_fmv_flush`). */
  flush(): void;
  /** The picture `next` answered 1 for. */
  picture(): EnginePicture;
  /** Invalid stream states seen since the last reset. */
  invalid(): number;
  close(): void;
}

/** `glue.c`'s exports; pointers are byte offsets into `memory`. */
export interface Mpeg2GlueExports {
  memory: WebAssembly.Memory;
  _initialize?: () => void;
  s2u_fmv_open(): number;
  s2u_fmv_buffer(h: number, size: number): number;
  s2u_fmv_feed(h: number, size: number): number | undefined;
  s2u_fmv_feed_tagged(h: number, size: number, tag: number): number | undefined;
  s2u_fmv_tag(h: number): number;
  s2u_fmv_tagged(h: number): number;
  s2u_fmv_next(h: number): number;
  s2u_fmv_flush(h: number): number | undefined;
  /** Since PLAT-19b's glue (research 120 §2); an older build is reset by closing and reopening its handle. */
  s2u_fmv_reset?: (h: number) => void;
  s2u_fmv_plane(h: number, k: number): number;
  s2u_fmv_index(h: number): number;
  s2u_fmv_type(h: number): number;
  s2u_fmv_temporal_reference(h: number): number;
  s2u_fmv_invalid(h: number): number;
  s2u_fmv_width(h: number): number;
  s2u_fmv_height(h: number): number;
  s2u_fmv_chroma_width(h: number): number;
  s2u_fmv_chroma_height(h: number): number;
  s2u_fmv_release(): number;
  s2u_fmv_close(h: number): void;
}

/** The release `MPEG2_RELEASE` encodes (`MPEG2_VERSION(0, 5, 1)`), which `wasmMpeg2Engine` requires. */
export const LIBMPEG2_RELEASE = (0 << 16) | (5 << 8) | 1;

/**
 * Stubs for a standalone emscripten module's imports (`WebAssembly.Module.imports(module)`): the build's one import is
 * `env.emscripten_notify_memory_growth`, a notification nothing needs (research 98 §7.1). Each stub returns 0.
 */
export function mpeg2ImportStubs(imports: readonly { module: string; name: string; kind: string }[]): Record<string, Record<string, () => number>> {
  const out: Record<string, Record<string, () => number>> = {};
  for (const i of imports) {
    if (i.kind !== 'function') throw new Error(`libmpeg2.wasm: unexpected import ${i.module}.${i.name} (${i.kind})`);
    (out[i.module] ??= {})[i.name] = () => 0;
  }
  return out;
}

/** The engine over an instantiated `libmpeg2.wasm` (`instance.exports`). */
export function wasmMpeg2Engine(exports: unknown): Mpeg2Engine {
  const g = exports as Mpeg2GlueExports;
  for (const name of ['memory', 's2u_fmv_open', 's2u_fmv_feed_tagged', 's2u_fmv_next', 's2u_fmv_release'] as const) {
    if (!g[name]) throw new Error(`libmpeg2.wasm: no export ${name} (rebuild with packages/fmv/wasm/build.sh)`);
  }
  g._initialize?.();
  const release = g.s2u_fmv_release();
  if (release !== LIBMPEG2_RELEASE) throw new Error(`libmpeg2.wasm: release 0x${release.toString(16)}, not 0.5.1`);
  let h = g.s2u_fmv_open();
  if (!h) throw new Error('libmpeg2.wasm: s2u_fmv_open failed (no memory)');
  const view = (ptr: number, n: number): Uint8Array => new Uint8Array(g.memory.buffer, ptr, n);
  return {
    reset() {
      if (g.s2u_fmv_reset) { g.s2u_fmv_reset(h); return; }
      g.s2u_fmv_close(h);
      h = g.s2u_fmv_open();
      if (!h) throw new Error('libmpeg2.wasm: s2u_fmv_open failed (no memory)');
    },
    feed(bytes, tag) {
      if (bytes.length === 0) return;
      const p = g.s2u_fmv_buffer(h, bytes.length);
      if (!p) throw new Error(`libmpeg2.wasm: no memory for a ${bytes.length}-byte feed`);
      view(p, bytes.length).set(bytes);   // the memory may have grown: a fresh view of it
      const r = tag === undefined || tag === null ? g.s2u_fmv_feed(h, bytes.length) : g.s2u_fmv_feed_tagged(h, bytes.length, tag >>> 0);
      if (typeof r === 'number' && r < 0) throw new Error(`libmpeg2.wasm: the feed of ${bytes.length} bytes was refused`);
    },
    next: () => g.s2u_fmv_next(h) as EngineState,
    flush() {
      const r = g.s2u_fmv_flush(h);
      if (typeof r === 'number' && r < 0) throw new Error('libmpeg2.wasm: no memory for the flush');
    },
    picture() {
      const width = g.s2u_fmv_width(h), height = g.s2u_fmv_height(h);
      const chromaWidth = g.s2u_fmv_chroma_width(h), chromaHeight = g.s2u_fmv_chroma_height(h);
      return {
        width, height, chromaWidth, chromaHeight,
        y: view(g.s2u_fmv_plane(h, 0), width * height),
        cb: view(g.s2u_fmv_plane(h, 1), chromaWidth * chromaHeight),
        cr: view(g.s2u_fmv_plane(h, 2), chromaWidth * chromaHeight),
        type: g.s2u_fmv_type(h),
        temporalReference: g.s2u_fmv_temporal_reference(h),
        tag: g.s2u_fmv_tagged(h) ? g.s2u_fmv_tag(h) >>> 0 : null,
      };
    },
    invalid: () => g.s2u_fmv_invalid(h),
    close() {
      if (h) g.s2u_fmv_close(h);
      h = 0;
    },
  };
}
