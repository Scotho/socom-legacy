import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { presentUiFrame, rasterizeUiDrawList, type RasterOptions, type UiCanvasTarget, type UiTextures } from './uiCompositorView';

/**
 * GM-09 (plan 2026-11-01-gpu-menus; product track, a browser adaptation that changes nothing drawn): the seam between
 * a menu surface (the front end, the in-match Settings overlay) and what puts its frame on the page. `CpuUiPresenter`
 * is today's software path behind it -- `rasterizeUiDrawList`, then `presentUiFrame` onto a 2D canvas -- byte for byte;
 * the WebGL2 presenter (GM-11a-1 on) is the other side of the same interface. The original is the specification of
 * every byte either draws; this module only routes the draw list.
 */

/**
 * A frame timing probe (`./uiGpuPerf` `UiPerfRenderProbe`): read three times a frame -- before, between, after. GM-16:
 * `guarded`, when the probe has it, is told the ms of each idle slice in which the GPU guard read or compared a frame
 * (`./uiGpuGuard`), so the frame ring names the frame after it and keeps it out of `lostSeconds` (GM.R11).
 */
export interface UiPresentProbe { now(): number; rendered(rasterMs: number, presentMs: number): void; guarded?(ms: number): void }

/** What one present drew: what it left undrawn (the compositor's own strings), and the frame's size. */
export interface UiPresented { undrawn: string[]; width: number; height: number }

export interface UiPresenter {
  /** Which path draws: `cpu` the software (today's); a GPU presenter names itself. */
  readonly kind: string;
  /** The draw list onto the presenter's surface, as `rasterizeUiDrawList` would draw it under `options`. */
  present(items: readonly UiDrawItem[], textures: UiTextures, options?: RasterOptions, probe?: UiPresentProbe | null): UiPresented;
  /**
   * The frame last presented, straight RGBA, top row first, at its scale; null before the first. A test aid, read on
   * demand: a fresh copy, which may cost a read-back of the surface (a spec reads it; the page never does).
   */
  readFrame(): Rgba | null;
  /** What the last present left undrawn (empty before the first). */
  undrawn(): readonly string[];
}

export interface CpuUiPresenterOptions {
  /** Told the frame's size before each put (the overlay's canvas follows its frame: HD-4). */
  fit?: (width: number, height: number) => void;
  /**
   * Keep the last frame for `readFrame` (a test's ask; GM-09 review F2). Off, nothing is held between presents -- as
   * before GM-09, the frame goes once it is put -- and `readFrame` reads the canvas back instead.
   */
  retain?: boolean;
}

/**
 * A canvas target `readFrame` can read back (a 2D context's `getImageData`): exact for an opaque frame; for a
 * transparent one, alpha exact and colour as the browser keeps a premultiplied canvas (the overlay's spec reads alpha).
 */
export interface UiReadableTarget extends UiCanvasTarget {
  getImageData?(sx: number, sy: number, sw: number, sh: number): { width: number; height: number; data: Uint8ClampedArray };
}

/** Today's software path: the raster in this thread, the frame `putImageData`'d onto a 2D canvas target. */
export class CpuUiPresenter implements UiPresenter {
  readonly kind = 'cpu';
  private frame: Rgba | null = null;
  // GM-16: the next present's frame, kept for one `takeFrame` (the shadow guard's reference).
  private keepNext = false;
  private kept: Rgba | null = null;
  private size: { width: number; height: number } | null = null;
  private left: readonly string[] = [];
  constructor(readonly target: UiReadableTarget, private readonly o: CpuUiPresenterOptions = {}) {}

  present(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions = {}, probe?: UiPresentProbe | null): UiPresented {
    // GM-09 review F5: `preDivide` is a comparison frame (GM-11b's P14/P22 legs, read off `rasterizeUiDrawList`), never
    // one to put on a page canvas, where its semi-transparent pixels would show darker.
    if (options.preDivide) throw new Error('CpuUiPresenter: preDivide is a read-only comparison frame (rasterizeUiDrawList), not one a page canvas shows');
    // The last frame (if retained) is let go first: at most one frame is held across the raster (2560 x 1792 at 4x is 18 MB).
    this.frame = null;
    const t0 = probe ? probe.now() : 0;
    const { frame, undrawn } = rasterizeUiDrawList(items, textures, options);
    const t1 = probe ? probe.now() : 0;
    this.o.fit?.(frame.width, frame.height);
    presentUiFrame(this.target, frame);
    probe?.rendered(t1 - t0, probe.now() - t1);
    if (this.o.retain) this.frame = frame;
    if (this.keepNext) { this.kept = frame; this.keepNext = false; }
    this.size = { width: frame.width, height: frame.height };
    this.left = undrawn;
    return { undrawn, width: frame.width, height: frame.height };
  }

  readFrame(): Rgba | null {
    if (this.frame) return this.frame;
    if (!this.size || !this.target.getImageData) return null;
    const img = this.target.getImageData(0, 0, this.size.width, this.size.height);
    return { width: img.width, height: img.height, data: img.data };
  }
  undrawn(): readonly string[] { return this.left; }

  /**
   * GM-16 (shadow mode, `./uiGpuPresenter`): keep the next present's frame -- the very frame put on the canvas, no copy
   * (the raster makes a new one each present) -- for one `takeFrame`. A browser adaptation of an instrument: what is put
   * on the canvas is unchanged.
   */
  retainNext(): void { this.keepNext = true; this.kept = null; }

  /** The frame `retainNext` kept, once (null when none was asked or it was taken). */
  takeFrame(): Rgba | null { const f = this.kept; this.kept = null; return f; }
}

/** Whether a render target is a presenter (handed in) or a 2D canvas target (wrapped in a `CpuUiPresenter`). */
export function isUiPresenter(t: UiCanvasTarget | UiPresenter): t is UiPresenter {
  return typeof (t as Partial<UiPresenter>).present === 'function';
}
