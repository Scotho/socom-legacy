import type { Rgba } from '@s2u/gs';
import type { UiDrawItem } from '@s2u/ui';
import { rasterizeUiDrawList, type RasterOptions, type UiTextures } from './uiCompositorView';
import { planFrame, type UiFramePlan, type UiPlanBlendMode, type UiPlanStep } from './uiFramePlan';
import {
  UI_GPU_GUARD_SAMPLE_ADAPTATION, UI_GPU_GUARD_TRIP_ADAPTATION, UiGpuGuard, uiGpuIdle, type UiGpuGuardBound, type UiGpuGuardRecord, type UiGpuIdle,
} from './uiGpuGuard';
import type { UiGpuHdKeys, UiGpuTextureOptions } from './uiGpuTextures';
import type { UiPresenter, UiPresented, UiPresentProbe } from './uiPresenter';
import {
  UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION, UI_GPU_DRAWN_STEPS, UI_GPU_GL, UiGpuBackend, readUiGpuCaps, type UiGpuCanvas, type UiGpuReadback,
} from './uiGpuWebgl2';
import {
  uiGpuCapability, type UiGpuCapabilityReason, type UiGpuCaps, type UiGpuKillReason, type UiGpuLevel, type UiGpuMode, type UiGpuSurface,
} from './uiGpuSwitch';

/**
 * GM-11a-1 (the GPU menus plan, "Architecture"; research 380 §2): the GPU side of the `UiPresenter` seam (GM-09). Each
 * frame is planned (`planFrame`, the pure planner the CPU executor proves byte-equal to the software, GM-06a/b) and
 * drawn on the WebGL2 base (`./uiGpuWebgl2`) when the base draws every step the plan holds; any other frame is **L1**,
 * a labelled browser adaptation: the software draws it (`rasterizeUiDrawList`) and its bytes are uploaded to the same
 * frame target and presented the same way, the reason named in `last.why`. GM-14a (GM.R9): under HD the software draws
 * an L1 frame at `plan.fallback.scale` -- 1x, the original frame (`UI_GPU_FRAME_FALLBACK_SCALE_ADAPTATION`; the shown
 * scale under dev sampling, `UI_GPU_DEV_SAMPLING_FALLBACK_ADAPTATION`) -- and the backend shows it at the plan's size,
 * each pixel `s x s` (`UiGpuBackend.uploadFrame` at a scale); `last.drawnAt` says at which.
 *
 * The backend draws the plan's `clear` steps (P15, GM-11a-1) and its copies and quads (GM-11a-2; `UiGpuBackend.draw`,
 * the programs in `uiGpuShaders.ts`), its movie pictures (GM-11a-3, `uiGpuMovie.ts`) and its models' passes and
 * triangles (GM-15a, `uiGpuModels.ts`); a frame whose plan the software keeps (a software verdict: a model triangle on
 * the programmable path until GM-26, a model vertex at `invW <= 0` or not finite) is L1 -- never black, never a guess --
 * as is a frame `UiGpuBackend.refusal` names (a texture past `MAX_TEXTURE_SIZE`, a movie picture whose buffer is
 * released, a model number past f32).
 * No rule of the game is decided here; the planner, the programs and the software decide every byte. On a fake GL whose
 * programs run the f32 twin's arithmetic, `test/uiGpuWebgl2.test.ts` holds every GM-03 case through this presenter: a
 * frame drawn on the GPU equal to the twin (`executeFramePlanOnTwin`) and to the software on the twin's exact class, an
 * L1 frame equal to the software.
 *
 * Nothing changes for players: only the front end's GPU surface constructs it (GM-12b, `./uiGpuFront`), behind the
 * switch, which keeps every surface `off`.
 *
 * GM-16: `drawOffscreen` is shadow mode's draw -- the same plan drawn into the frame target (an offscreen framebuffer)
 * and never presented, so the canvas keeps what it had and the page shows the software's frame (`UiGpuSurfacePresenter`).
 */

/** The plan steps the backend draws on the GPU (GM-11a-1: clears; GM-11a-2: copies and quads; GM-11a-3: the movie; GM-15a: the models' pass and triangles). */
export const UI_GPU_BASE_STEPS: ReadonlySet<UiPlanStep['kind']> = UI_GPU_DRAWN_STEPS;

/**
 * The blend table's value for a surface (GM.R6, `UI_GPU_BLEND_ADAPTATION`): one value, or (GM-12b) the switch's answer
 * asked at each frame's scale -- `UiGpuSwitch.blend(surface, scale)`, so HD's `ff`, scale 1's `exact`, the dev URL and a
 * session escalation (GM.R5) each reach the next frame. Absent, the planner's default.
 */
export type UiGpuBlendChoice = UiPlanBlendMode | ((scale: number) => UiPlanBlendMode | undefined);

export interface GpuUiPresenterOptions {
  /** The blend table's value for the surface at its scale (GM.R6, `UI_GPU_BLEND_ADAPTATION`); absent, the planner's default. */
  blend?: UiGpuBlendChoice;
}

/**
 * What the last present did: `gpu` (the plan's steps on the GPU) or `software` (L1, uploaded), and why. GM-12a:
 * `unchanged` when the dirty check found the frame on the canvas already (nothing drawn or presented).
 */
export interface GpuPresentRecord {
  path: 'gpu' | 'software'; why: string[]; hash: string; unchanged?: boolean;
  /** GM-14a: an L1 frame's scale as the software drew it (`plan.fallback.scale`); absent on a GPU frame. */
  drawnAt?: number;
}

/**
 * GM-14a (GM.R9): the options an L1 frame is drawn with at `scale` -- the frame's own at its shown scale; at a lower
 * scale (1x under HD) without the HD lookup and the quad cache, which are the HD scale's (as the loss fallback drops
 * them, `uiGpuLossFallbackOptions`).
 */
export function uiGpuFrameFallbackOptions(options: RasterOptions, scale: number): RasterOptions {
  if ((options.scale ?? 1) === scale) return options;
  const rest: RasterOptions = { ...options };
  delete rest.hd;
  delete rest.quadCache;
  return { ...rest, scale };
}

/**
 * GM-14a: a frame with each pixel repeated `s x s`, rows top first -- what the backend's NEAREST blit of an L1 frame
 * at 1x shows under HD (`UiGpuBackend.uploadFrame` at a scale). The reference the tests and the parity spec compare an
 * L1 frame with (and GM-14c's guard at the shown scale); never on a player's frame path. `s` 1 gives the frame back.
 */
export function upscaleFrameNearest(frame: Rgba, s: number): Rgba {
  if (s === 1) return frame;
  if (!(Number.isInteger(s) && s > 1)) throw new Error(`upscaleFrameNearest: scale ${s}`);
  const { width: w, height: h, data } = frame, W = w * s, out = new Uint8ClampedArray(W * h * s * 4);
  if (data.length !== w * h * 4) throw new Error(`upscaleFrameNearest: ${data.length} bytes for ${w} x ${h}`);
  const aligned = data.byteOffset % 4 === 0 ? data : data.slice();
  const src = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h), dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h; y++) {
    const row = y * s * W;
    for (let x = 0; x < w; x++) { const v = src[y * w + x]!; for (let k = 0; k < s; k++) dst[row + x * s + k] = v; }
    for (let k = 1; k < s; k++) dst.copyWithin(row + k * W, row, row + W);
  }
  return { width: W, height: h * s, data: out };
}

export class GpuUiPresenter implements UiPresenter {
  readonly kind = 'gpu';
  private left: readonly string[] = [];
  private drawn = false;
  private record: GpuPresentRecord | null = null;
  // GM-12a: the frame on the canvas, drawn on the GPU -- its plan's hash and its textures' content keys (GM-13) -- for the
  // dirty check.
  private onCanvas: { hash: string; keys: readonly string[] } | null = null;
  private attempting: string | null = null;

  constructor(readonly backend: UiGpuBackend, private readonly o: GpuUiPresenterOptions = {}) {}

  /** The last present's path and reasons; null before the first. */
  get last(): GpuPresentRecord | null { return this.record; }

  /** GM-12a: the hash of the plan the last present was drawing (set before its first GL call), for a failure's log line. */
  get attempt(): string | null { return this.attempting; }

  /** GM-12a: the next frame is drawn whatever its hash (the canvas may no longer hold the last one). */
  invalidate(): void { this.onCanvas = null; }

  /** The frame's plan under the blend table's value at its scale. */
  private planOf(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions): UiFramePlan {
    return planFrame(items, textures, {
      scale: options.scale, transparent: options.transparent === true, hd: options.hd, movie: options.movie, uiSampling: options.uiSampling,
      blend: typeof this.o.blend === 'function' ? this.o.blend(options.scale ?? 1) : this.o.blend,
    });
  }

  /**
   * GM-16 (shadow mode; GM.R11): the frame drawn on the GPU into the frame target and **not presented** -- no blit, the
   * canvas untouched -- for the guard to read back (`UiGpuBackend.beginReadback`). `drawn` false, with the reason, where
   * `present` would draw the frame L1 (a software verdict, a refusal, textures still uploading): nothing is drawn then,
   * and there is nothing of the GPU's to compare. The next `present` draws whatever its hash (the target changed).
   */
  drawOffscreen(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions = {}): { drawn: boolean; plan: UiFramePlan; why: string[] } {
    if (options.preDivide) throw new Error('GpuUiPresenter: preDivide is a read-only comparison frame (rasterizeUiDrawList), not one a page canvas shows');
    const plan = this.planOf(items, textures, options);
    this.attempting = plan.hash;
    let refused = this.backend.refusal(plan);
    const keys = refused === null ? this.backend.textureKeys(plan) : [];
    if (refused === null) {
      const { pending } = this.backend.stageTextures(plan, keys);
      if (pending > 0) refused = `textures uploading: ${pending} bytes wait for the next frame (HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION)`;
    }
    this.onCanvas = null;
    if (refused !== null) return { drawn: false, plan, why: plan.verdict === 'software' ? plan.why.slice() : [refused] };
    this.backend.draw(plan, keys);
    return { drawn: true, plan, why: [] };
  }

  present(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions = {}, probe?: UiPresentProbe | null): UiPresented {
    // As `CpuUiPresenter` (GM-09 review F5): `preDivide` is a comparison frame, never one a page canvas shows.
    if (options.preDivide) throw new Error('GpuUiPresenter: preDivide is a read-only comparison frame (rasterizeUiDrawList), not one a page canvas shows');
    const transparent = options.transparent === true;
    const t0 = probe ? probe.now() : 0;
    const plan = this.planOf(items, textures, options);
    const { width, height } = plan.target;
    this.attempting = plan.hash;
    let refused = this.backend.refusal(plan);
    let undrawn: string[];
    // GM-12a, the dirty check by plan hash: a frame whose plan hashes as the one on the canvas and reads the same texture
    // contents is neither drawn nor presented -- a drawing buffer nobody writes keeps its last presented frame (WebGL 1.0
    // §2.2). Contents are not in the plan's hash; GM-13's content keys carry them (GM-12a review F4: an image rewritten in
    // place keys anew, so the frame is drawn). A movie frame (`volatile`: its pixels are not hashed) is always drawn. A
    // browser adaptation: it changes when the GPU works, never a byte.
    const keys = refused === null ? this.backend.textureKeys(plan) : [];
    const kept = this.onCanvas;
    if (refused === null && !plan.volatile && kept && kept.hash === plan.hash && kept.keys.length === keys.length && kept.keys.every((k, i) => k === keys[i])) {
      this.record = { path: 'gpu', why: [], hash: plan.hash, unchanged: true };
      probe?.rendered((probe ? probe.now() : 0) - t0, 0);
      this.left = plan.undrawn.slice();
      return { undrawn: this.left.slice(), width, height };
    }
    this.onCanvas = null;
    // GM-13: the frame's missing textures go up within one frame's budget; a frame whose textures are not all up yet is
    // the software's (L1, named) while the rest go up over the next frames (GM.R12's spreading).
    if (refused === null) {
      const { pending } = this.backend.stageTextures(plan, keys);
      if (pending > 0) refused = `textures uploading: ${pending} bytes wait for the next frame (HD_UI_UPLOAD_BYTES_PER_FRAME_ADAPTATION)`;
    }
    if (refused === null) {
      this.backend.draw(plan, keys);
      undrawn = plan.undrawn.slice();
      this.record = { path: 'gpu', why: [], hash: plan.hash };
    } else {
      // L1: the software's frame, before its divide on a transparent surface (the GPU holds a frame premultiplied). GM-14a
      // (GM.R9): at the plan's fallback scale -- 1x under HD, the shown scale under dev sampling -- shown at the plan's size.
      const at = plan.fallback.scale;
      const { frame, undrawn: left } = rasterizeUiDrawList(items, textures, { ...uiGpuFrameFallbackOptions(options, at), preDivide: transparent });
      this.backend.uploadFrame(frame, transparent, plan.target.scale / at);
      undrawn = left;
      const why = plan.verdict === 'software' ? plan.why.slice() : [refused];
      this.record = { path: 'software', why, hash: plan.hash, drawnAt: at };
    }
    const t1 = probe ? probe.now() : 0;
    this.backend.present();
    if (refused === null) this.onCanvas = { hash: plan.hash, keys };
    probe?.rendered(t1 - t0, probe.now() - t1);
    this.drawn = true;
    this.left = undrawn;
    return { undrawn, width, height };
  }

  /** The frame last presented, straight RGBA, top row first (a transparent one divided as the software divides, P22). */
  readFrame(): Rgba | null {
    if (!this.drawn) return null;
    const frame = this.backend.readPixels();
    if (this.backend.transparent) divideTransparentFrame(frame.data);
    return frame;
  }

  undrawn(): readonly string[] { return this.left; }

  dispose(): void { this.backend.dispose(); }
}

/**
 * P22: a transparent frame's premultiplied RGB divided back to straight, in place, as the software hands it to
 * `putImageData` -- the same arithmetic on the same clamped bytes as `rasterizeUiDrawList`'s tail
 * (`uiCompositorView.ts`, "The software pass accumulates premultiplied RGB over black"); a pixel at alpha 0 or 255 is
 * left as it is. Held equal to it by `test/uiGpuWebgl2.test.ts` over cases 4, 17 and 19 and every (alpha, value) pair.
 */
export function divideTransparentFrame(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]! / 255;
    if (a > 0 && a < 1) { data[i] = data[i]! / a; data[i + 1] = data[i + 1]! / a; data[i + 2] = data[i + 2]! / a; }
  }
}

// ---- GM-12a: the surface's lifecycle and loss ------------------------------------------------------------------------

/**
 * UI_GPU_LOSS_FALLBACK_ADAPTATION: no original; bounds the browser's software frame while the GPU is lost (fallback L2,
 * L3; the plan's ladder, GM.R9, GM.R12): the software draws the frame at scale 1 -- the original frame, byte for byte
 * -- with no HD lookup and no quad cache (both belong to the HD scale), so a lost GPU never puts the 65-87 ms 4x
 * software path (a Node microbench, GM.R9) on the player's frame. The canvas's CSS box shows it at the same size. The
 * owner's question O2 (H375) asks whether the HD menus may drop to 1x so; the default meanwhile is yes.
 */
export const UI_GPU_LOSS_FALLBACK_ADAPTATION = Object.freeze({ scale: 1 } as const);

/**
 * UI_GPU_LOSS_LIMIT_ADAPTATION: no original; bounds the browser's retries of a failing GPU context (fallback L3, the
 * plan's "3 in 5 minutes"): this many losses (a context lost, or a GL error inside a present, GM.R13) within the window
 * end the GPU path for the session -- the switch's session kill (`loss-limit`), which outranks even a URL `on`.
 */
export const UI_GPU_LOSS_LIMIT_ADAPTATION = Object.freeze({ losses: 3, windowMs: 5 * 60 * 1000 } as const);

/**
 * UI_GPU_RESTORE_WAIT_MS_ADAPTATION: no original; bounds the browser's wait for a lost context to come back. A browser
 * restores a context whose loss event was default-prevented when its GPU process is back (WebGL 1.0 §5.15.3); one that
 * never comes back (a blocked GPU, a driver gone) would leave the surface waiting for ever, so after this many
 * milliseconds without `webglcontextrestored` the surface stops waiting and stays on the software for the session
 * (the switch's session kill, `restore-timeout`). Frames meanwhile are L2 (never black). Five seconds is a product-track
 * choice with no measurement behind it yet: `e2e/uiGpuLoss.spec.ts` records real restore times (GM-11b's box).
 */
export const UI_GPU_RESTORE_WAIT_MS_ADAPTATION = 5000;

/** The options of a software frame drawn while the GPU is lost: `UI_GPU_LOSS_FALLBACK_ADAPTATION` over the frame's own. */
export function uiGpuLossFallbackOptions(options: RasterOptions): RasterOptions {
  const rest: RasterOptions = { ...options };
  delete rest.hd;
  delete rest.quadCache;
  return { ...rest, scale: UI_GPU_LOSS_FALLBACK_ADAPTATION.scale };
}

/** The canvas a GPU surface draws onto: a WebGL2 canvas that dispatches the context events. */
export interface UiGpuSurfaceCanvas extends UiGpuCanvas {
  addEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (e: Event) => void): void;
  removeEventListener(type: 'webglcontextlost' | 'webglcontextrestored', listener: (e: Event) => void): void;
}

/** What a surface tells the page's switch (`UiGpuSwitch`): the session kill, the ladder's counts, the live contexts. */
export interface UiGpuSurfaceHost {
  kill(reason: UiGpuKillReason, surface?: UiGpuSurface): void;
  count(level: UiGpuLevel): void;
  adjustContexts(delta: number): void;
  /** GM-16: the switch's answer for the surface at a frame's scale; `shadow` makes the frame a shadow frame. Absent: never. */
  resolve?(surface: UiGpuSurface, scale: number): { readonly mode: UiGpuMode };
  /** GM-16: a guard trip escalates the surface to `exact` for the session (GM.R5, GM.R6; the switch's `blend`). */
  escalateBlend?(surface: UiGpuSurface): void;
  /** GM-16: each guard record (the read-out's, `window.__uiGpu.guard`). */
  guarded?(record: UiGpuGuardRecord): void;
  /**
   * GM-16c: an L1 frame's reasons (the present record's `why`: the plan's software verdict or the backend's refusal), for
   * the read-out's `refusals` (`window.__uiGpu`; a test instrument, nothing of the game). Told after the frame is counted.
   */
  refused?(surface: UiGpuSurface, why: readonly string[]): void;
}

/** A software presenter that can keep the frame it puts (`CpuUiPresenter.retainNext` / `takeFrame`): the shadow's reference. */
interface UiRetainingPresenter { retainNext?(): void; takeFrame?(): Rgba | null }

/** The surface's clock: the page's `performance.now` and timers (a test's own). */
export interface UiGpuSurfaceClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface UiGpuSurfaceOptions {
  /** The GPU canvas (`#front-end-gpu`, the overlay's own canvas). */
  canvas: UiGpuSurfaceCanvas;
  /** The software presenter the surface falls back to (the 2D canvas's `CpuUiPresenter`; L2-L4 and while linking). */
  software: UiPresenter;
  /** A transparent surface (the Settings overlay; P14, P22). */
  transparent: boolean;
  /** The surface's name for the switch's session kill. */
  surface: UiGpuSurface;
  clock: UiGpuSurfaceClock;
  /** The page's switch (`pageUiGpuSwitch()`); absent, nothing is counted or killed outside the surface (a test). */
  host?: UiGpuSurfaceHost;
  /** The blend table's value for the surface (GM.R6), or the switch's answer at each frame's scale (GM-12b). */
  blend?: UiGpuBlendChoice;
  /** `?uiGpuAllowSoftwareAdapter=1` (the switch's URL): a software adapter passes the gate. */
  allowSoftwareAdapter?: boolean;
  /** Which canvas the page should show, said when it changes (the swap itself is GM-12b's, at a tick boundary). */
  shown?: (canvas: 'gpu' | 'software') => void;
  /** A failure's line (the console on the page). */
  log?: (line: string) => void;
  /**
   * GM-14a (GM-13 review F3): the page's HD lookup (`HdMenus.keys()`, an `HdMenuTextures`), asked at every frame and
   * set on the backend -- the one built at create and every one built after a restore or a rebuild -- so an HD image is
   * keyed by the pack's key (`hd|<pack>|<sha256>`), never hashed on the main thread; null with HD off.
   */
  hdKeys?: () => UiGpuHdKeys | null;
  /** GM-14a (GM-13 review F3): the texture cache's budgets for every backend the surface builds; absent, the adaptations'. */
  textures?: UiGpuTextureOptions;
  /** GM-16: the guard's idle scheduler (`requestIdleCallback`, `uiGpuIdle`); a test's own. */
  idle?: UiGpuIdle;
  /**
   * GM-16: the B bound the guard judges against (GM.R5); absent or null -- as on the page until GM-11b's provisional and
   * GM-27's pinned tolerance (research 380 §1) land -- B is recorded, not judged (the exact class always is).
   */
  guardBound?: UiGpuGuardBound | null;
  /** GM-16: overrides of `UI_GPU_GUARD_SAMPLE_ADAPTATION` (a test's). */
  guardSample?: Partial<typeof UI_GPU_GUARD_SAMPLE_ADAPTATION>;
}

/**
 * The lifecycle's states: `unmade` (no context asked yet), `compiling` (a context, its programs linking), `ready` (every
 * program linked: frames on the GPU), `lost` (the context lost, the restore awaited), `released` (let go at the match's
 * `leave`), `dead` (the loss limit or the restore wait: the software for the session, L3), `unavailable` (no WebGL2 or
 * a capability missing: today's path, L4), `disposed` (the page stopped).
 */
export type UiGpuSurfaceState = 'unmade' | 'compiling' | 'ready' | 'lost' | 'released' | 'dead' | 'unavailable' | 'disposed';

/** The surface's counters (a test and playtest instrument; the switch's `window.__uiGpu` counts the levels too). */
export interface UiGpuSurfaceStats {
  /**
   * Frames by what drew them: L0 the GPU, L1 the software uploaded (a plan the GPU refuses), L2 the software after a
   * loss, L3 the software after the session kill, L4 today's path (no GPU); `waiting` today's path while a link runs
   * that follows no loss (the first, or the re-create after `returned`) or while released; `unchanged` the L0 frames the
   * dirty check kept; GM-16: `shadow` the frames shown by the software in shadow mode (the GPU's drawn offscreen beside).
   */
  frames: Record<UiGpuLevel | 'waiting' | 'unchanged' | 'shadow', number>;
  /** Losses counted (context losses and GL errors). */
  losses: number;
  /** Each restore's time to the first frame on the GPU, ms: from the loss, and from the restore (its event, or the rebuild after a GL error). */
  restores: { sinceLoss: number; sinceRestored: number }[];
  caps: UiGpuCaps | null;
  unavailable: UiGpuCapabilityReason | null;
}

type LoseExt = { loseContext(): void; restoreContext(): void };

/**
 * GM-12a (the plan's row GM-12a, "The fallback ladder", GM.R9, GM.R12, GM.R13; research 380 §5): one menu surface's GPU
 * drawer with its lifecycle -- a PRODUCT-TRACK browser adaptation that decides which drawer makes a frame and never a
 * byte of it (the GPU frame is `GpuUiPresenter`'s, the software frame `software`'s, both held to the original elsewhere).
 * - **Synchronous create** (`create`, or the first `present`): the WebGL2 context asked in the call; the capability
 *   checks (`uiGpuCapability`: WebGL2, not a software adapter by `UNMASKED_RENDERER_WEBGL` -- `readUiGpuCaps` --,
 *   `MAX_TEXTURE_SIZE`) at once; a failure is **L4**, the context let go (`WEBGL_lose_context`), today's path.
 * - **`KHR_parallel_shader_compile`**: every program's link begun at create and asked about only once the extension says
 *   it completed (no stall); without it the link status is read at the first poll. **`ready` only when every program
 *   linked**; until then frames are today's path at the shown scale (`waiting`). A link that fails is L4 (`program-link`).
 * - **Loss** (`webglcontextlost`, its default prevented so the browser may restore it; or `isContextLost()` seen by a
 *   present first): the GPU objects let go without a GL call, frames **L2**: the software at 1x
 *   (`UI_GPU_LOSS_FALLBACK_ADAPTATION`), never black. **Restore in place** (`webglcontextrestored`): a new backend on the
 *   same context, its links begun, the GPU back once linked; the time recorded (`stats.restores`).
 *   `UI_GPU_RESTORE_WAIT_MS_ADAPTATION` without a restore, or `UI_GPU_LOSS_LIMIT_ADAPTATION`'s losses in its window,
 *   kill the session (**L3**: the switch's session kill; L2's software for the rest of it).
 * - **A GL error is a loss** (GM.R13): a throw inside the GPU present is logged with the plan's hash, counted toward the
 *   limit, that frame drawn by the software at 1x, and the backend rebuilt in place on the live context.
 * - **`release`** (the match's `leave`): the textures and programs deleted and the context let go (`loseContext`; not a
 *   loss); **`returned`** lets the next present ask for it back (`restoreContext`) -- lazily, behind the return fade,
 *   the software showing until `ready`. **`dispose`** (the page's `stop()`/`close()`): everything let go, for good.
 * - Live contexts are counted on the switch (`window.__uiGpu.contexts`).
 * - **GM-16: shadow mode** (the switch's `shadow` at the frame's scale, `host.resolve`; GM.R11): the frame the page shows
 *   is the software's -- `software.present` at the shown scale, today's bytes on the 2D canvas -- and the same draw list
 *   is drawn on the GPU into the frame target only (`GpuUiPresenter.drawOffscreen`: never presented, the GPU canvas
 *   untouched and in standby). A frame the guard samples (`UiGpuGuard.wants`) has its read-back begun in the frame (a
 *   pack buffer and a fence, `UiGpuBackend.beginReadback`) and the shown frame kept as the reference (no copy); the
 *   compare runs in idle callbacks (`./uiGpuGuard`). A trip escalates the surface to `exact` for the session (the next
 *   frames planned so, the switch told); a trip at `exact`, or `UI_GPU_GUARD_TRIP_ADAPTATION.killAt` trips, is the
 *   session kill (`guard-trip`: today's path, `./uiGpuFront`). Losses in shadow count toward the loss limit as on `on`.
 * Nothing changes for players: nothing makes a surface while the switch keeps every surface `off` (GM-12b's `./uiGpuFront`).
 */
export class UiGpuSurfacePresenter implements UiPresenter {
  readonly kind = 'gpu-surface';
  private st: UiGpuSurfaceState = 'unmade';
  private gl: WebGL2RenderingContext | null = null;
  private backend: UiGpuBackend | null = null;
  private gpu: GpuUiPresenter | null = null;
  private loseExt: LoseExt | null = null;
  private completion: number | null = null;
  private counted = false;
  private listening = false;
  private releasing = false;     // a loss event we asked for (release, dispose, unavailable): not counted
  private wantBack = false;      // `returned` said, the re-create not asked yet
  private asked = false;         // `restoreContext` asked, its event awaited
  private lossTimes: number[] = [];
  private lostAt: number | null = null;
  private restoredAt: number | null = null;
  private waitTimer: unknown = null;
  private afterLoss = false;     // the links running now follow a loss (frames L2 at 1x, the restore timed)
  private lastWas: 'gpu' | 'software' | null = null;
  private showing: 'gpu' | 'software' | null = null;
  private readonly counts: UiGpuSurfaceStats['frames'] = { L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, waiting: 0, unchanged: 0, shadow: 0 };
  // GM-16: the guard (made at the first shadow frame) and the session's escalation to `exact` (a trip).
  private guardRef: UiGpuGuard | null = null;
  private escalated = false;
  private losses = 0;
  private restores: UiGpuSurfaceStats['restores'] = [];
  private caps: UiGpuCaps | null = null;
  private refusedBy: UiGpuCapabilityReason | null = null;
  private readonly onLost = (e: Event): void => this.contextLost(e);
  private readonly onRestored = (): void => this.contextRestored();

  constructor(private readonly o: UiGpuSurfaceOptions) {}

  get state(): UiGpuSurfaceState { return this.st; }
  /** Every program linked: frames go to the GPU. */
  get ready(): boolean { return this.st === 'ready'; }
  /** The path the last frame took. */
  get lastPath(): 'gpu' | 'software' | null { return this.lastWas; }
  /** GM-16: the surface's guard, once a shadow frame made it (null before). */
  get guard(): UiGpuGuard | null { return this.guardRef; }
  get stats(): UiGpuSurfaceStats {
    return { frames: { ...this.counts }, losses: this.losses, restores: this.restores.map((r) => ({ ...r })), caps: this.caps, unavailable: this.refusedBy };
  }

  /** The context made now, in this call, and checked; `{ ok: false }` with the gate's reason is L4. Idempotent. */
  create(): { ok: true } | { ok: false; reason: UiGpuCapabilityReason } {
    if (this.st !== 'unmade') return this.refusedBy ? { ok: false, reason: this.refusedBy } : { ok: true };
    const gl = this.o.canvas.getContext('webgl2', UI_GPU_CONTEXT_ATTRIBUTES_ADAPTATION(this.o.transparent)) as WebGL2RenderingContext | null;
    if (!gl) return this.unavailable('no-webgl2');
    this.gl = gl;
    this.o.canvas.addEventListener('webglcontextlost', this.onLost);
    this.o.canvas.addEventListener('webglcontextrestored', this.onRestored);
    this.listening = true;
    this.loseExt = gl.getExtension(UI_GPU_GL.LOSE_CONTEXT) as LoseExt | null;
    this.setCounted(true);
    this.caps = readUiGpuCaps(gl, true);
    const gate = uiGpuCapability(this.caps, this.o.allowSoftwareAdapter === true);
    if (!gate.ok) return this.unavailable(gate.reason);
    const khr = gl.getExtension(UI_GPU_GL.KHR_PARALLEL) as { COMPLETION_STATUS_KHR: number } | null;
    this.completion = khr ? khr.COMPLETION_STATUS_KHR : null;
    this.build();
    return { ok: true };
  }

  /** Settle the links (`ready` once all are linked); a page may call it between frames. Each present calls it. */
  poll(): void {
    if (this.st !== 'compiling' || !this.backend) return;
    if (this.gl?.isContextLost()) { this.lose('context', 'the context was lost while its programs linked'); return; }
    let settled: ReturnType<UiGpuBackend['programsSettled']>;
    try {
      settled = this.backend.programsSettled(this.completion);
    } catch (e) {
      this.lose('error', `a GL error while the programs linked: ${message(e)}`);
      return;
    }
    if (settled.state === 'pending') return;
    if (settled.state === 'failed') {
      this.o.log?.(`[uiGpu] ${this.o.surface}: ${settled.why}`);
      this.caps = this.caps ? { ...this.caps, programsLinked: false } : null;
      this.unavailable('program-link');
      return;
    }
    this.st = 'ready';
  }

  present(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions = {}, probe?: UiPresentProbe | null): UiPresented {
    if (this.st === 'unmade') this.create();
    if (this.st === 'released' && this.wantBack) this.reacquire();
    this.poll();
    if (this.st === 'ready' && this.gl?.isContextLost()) this.lose('context', 'the context was lost before a frame');
    if (this.o.host?.resolve?.(this.o.surface, options.scale ?? 1).mode === 'shadow') return this.shadow(items, textures, options, probe);
    if (this.st === 'ready' && this.gpu) {
      const wasAfterLoss = this.afterLoss;
      try {
        this.backend!.setHdKeys(this.o.hdKeys?.() ?? null);   // GM-14a: the page's HD keys, on whichever backend is live
        const out = this.gpu.present(items, textures, options, probe);
        const rec = this.gpu.last!;
        this.frameAt(rec.path === 'gpu' ? 'L0' : 'L1');
        if (rec.path === 'software') this.o.host?.refused?.(this.o.surface, rec.why);   // GM-16c: why the frame was L1
        if (rec.unchanged) this.counts.unchanged++;
        if (wasAfterLoss) this.restoreDone();
        this.lastWas = 'gpu';
        this.show('gpu');
        return out;
      } catch (e) {
        const lost = this.gl?.isContextLost() === true;
        this.lose(lost ? 'context' : 'error', `${lost ? 'the context was lost during a frame' : 'a GL error inside present, counted as a loss'} (plan ${this.gpu?.attempt ?? 'none'}): ${message(e)}`);
      }
    }
    return this.software(items, textures, options, probe);
  }

  /** The frame last presented, from the path that drew it. */
  readFrame(): Rgba | null {
    return this.lastWas === 'gpu' && this.gpu ? this.gpu.readFrame() : this.o.software.readFrame();
  }

  undrawn(): readonly string[] {
    return this.lastWas === 'gpu' && this.gpu ? this.gpu.undrawn() : this.o.software.undrawn();
  }

  /**
   * The match's `leave`: the front end's GPU textures and programs deleted and its context let go (`loseContext`, not
   * counted as a loss), so a match runs beside at most the overlay's context. Frames go to the software until
   * `returned` and the re-made context's links. Without `WEBGL_lose_context` the context is kept (and stays counted).
   */
  release(): void {
    if (this.st !== 'compiling' && this.st !== 'ready' && this.st !== 'lost') return;
    this.clearWait();
    this.dropBackend(this.gl?.isContextLost() !== true);
    this.wantBack = false; this.asked = false; this.afterLoss = false;
    if (this.loseExt && this.gl && !this.gl.isContextLost()) {
      this.releasing = true;
      this.loseExt.loseContext();
    }
    if (this.loseExt) this.setCounted(false);
    this.st = 'released';
    this.show('software');
  }

  /** The match's return: the next present asks for the context back (lazily, behind the return fade). */
  returned(): void {
    if (this.st === 'released') this.wantBack = true;
  }

  /** The page's `stop()` / the session's `close()`: everything let go, for good; later frames are the software's. */
  dispose(): void {
    if (this.st === 'disposed') return;
    this.clearWait();
    if (this.backend) this.dropBackend(this.gl?.isContextLost() !== true);
    this.unlisten();
    if (this.loseExt && this.gl && !this.gl.isContextLost()) this.loseExt.loseContext();
    this.setCounted(false);
    this.st = 'disposed';
  }

  // ---- the transitions ------------------------------------------------------------------------------------------------

  /** A new backend on the live context, its links begun (create, restore in place, a rebuild after a GL error). */
  private build(): void {
    const gl = this.gl!;
    // GM-14a (GM-13 review F3): every build -- create, a restore in place, a rebuild after a GL error -- takes the page's
    // texture options and HD keys (asked again at each frame), never only the first.
    this.backend = new UiGpuBackend(gl, this.o.canvas, this.o.transparent, false, this.o.textures);
    this.backend.setHdKeys(this.o.hdKeys?.() ?? null);
    // GM-16: the blend table's value at each frame's scale, or `exact` once a guard trip escalated the surface.
    this.gpu = new GpuUiPresenter(this.backend, { blend: (scale) => this.blendAt(scale) });
    this.st = 'compiling';
    try {
      this.backend.startPrograms();
    } catch (e) {
      this.lose(gl.isContextLost() ? 'context' : 'error', `a GL error while the programs began: ${message(e)}`);
    }
  }

  /** The backend let go: deleted on a live context, abandoned (no GL call) on a lost one. */
  private dropBackend(live: boolean): void {
    this.guardRef?.cancel();                                  // GM-16: a read-back in flight belongs to this backend's context
    const b = this.backend;
    this.backend = null; this.gpu = null;
    if (!b) return;
    if (live) {
      try { b.dispose(); } catch { b.abandon(); }
    } else b.abandon();
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.o.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.o.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.listening = false;
  }

  /** L4: no GPU for this surface (the gate's reason); the context let go. */
  private unavailable(reason: UiGpuCapabilityReason): { ok: false; reason: UiGpuCapabilityReason } {
    this.refusedBy = reason;
    if (this.backend) this.dropBackend(this.gl?.isContextLost() !== true);
    this.unlisten();
    if (this.loseExt && this.gl && !this.gl.isContextLost()) this.loseExt.loseContext();
    this.setCounted(false);
    this.st = 'unavailable';
    return { ok: false, reason };
  }

  /**
   * A loss: a context lost (`context`) or a GL error inside a present (`error`, GM.R13). Counted toward the loss limit;
   * at the limit the session is killed (L3). A lost context waits for its restore (`UI_GPU_RESTORE_WAIT_MS_ADAPTATION`);
   * after an error the context is alive, and the backend is rebuilt on it now.
   */
  private lose(cause: 'context' | 'error', why: string): void {
    if (this.st !== 'compiling' && this.st !== 'ready') return;
    const now = this.o.clock.now();
    this.o.log?.(`[uiGpu] ${this.o.surface}: ${why}`);
    this.losses++;
    this.lossTimes = this.lossTimes.filter((t) => now - t < UI_GPU_LOSS_LIMIT_ADAPTATION.windowMs);
    this.lossTimes.push(now);
    this.lostAt = now; this.restoredAt = null; this.afterLoss = true;
    const live = cause === 'error' && this.gl?.isContextLost() !== true;
    this.dropBackend(live);
    if (!live) this.setCounted(false);
    if (this.lossTimes.length >= UI_GPU_LOSS_LIMIT_ADAPTATION.losses) { this.die('loss-limit'); return; }
    if (live) {
      this.restoredAt = now;
      this.build();
      return;
    }
    this.st = 'lost';
    this.show('software');
    this.waitTimer = this.o.clock.setTimeout(() => { this.waitTimer = null; if (this.st === 'lost') this.die('restore-timeout'); }, UI_GPU_RESTORE_WAIT_MS_ADAPTATION);
  }

  /**
   * L3: the software for the rest of the session, and the switch's session kill. A context still live (a death by GL
   * errors, GM.R13) is let go and counted down, as `unavailable` does (GM-12a review F1: a dead surface's context would
   * otherwise sit beside the match's for the session); without `WEBGL_lose_context` it is kept and stays counted.
   */
  private die(reason: UiGpuKillReason): void {
    this.clearWait();
    if (this.backend) this.dropBackend(this.gl?.isContextLost() !== true);
    this.letGo();
    this.st = 'dead';
    this.show('software');
    this.o.host?.kill(reason, this.o.surface);
  }

  private contextLost(e: Event): void {
    e.preventDefault();                                   // so the browser may restore it (WebGL 1.0 §5.15.3)
    if (this.releasing) { this.releasing = false; return; }
    const status = (e as Event & { statusMessage?: string }).statusMessage;
    this.lose('context', `webglcontextlost${status ? `: ${status}` : ''}`);
  }

  /** Restore in place: the same context, a new backend on it. */
  private contextRestored(): void {
    if (this.st === 'lost') {
      this.clearWait();
      this.restoredAt = this.o.clock.now();
      this.setCounted(true);
      this.reenable();
      this.build();
    } else if (this.st === 'released' && (this.asked || this.wantBack)) {
      // Asked back, or `returned` already said so (a browser restore before the next present): taken up now.
      this.asked = false; this.wantBack = false;
      this.setCounted(true);
      this.reenable();
      this.build();
    } else if (this.st === 'dead' || this.st === 'released') {
      // GM-12a review F1/F2: a restore no path will use (after the session's kill, or during a match after a loss the
      // leave released) is let go again, never counted; `returned` asks for it back as after any release.
      this.letGo();
    }
  }

  /**
   * GM-11b box fold: the extensions asked again on a restored context. A restored context is a new one whose
   * extensions are disabled until `getExtension` asks for them, so `COMPLETION_STATUS_KHR` kept from before the loss
   * is refused (INVALID_ENUM, read as "not complete") and the links never settle -- the box's llvmpipe leg at 5650fe4fc
   * stayed on the software for 600 frames after `returned`. `WEBGL_lose_context` is kept where the browser gives none.
   */
  private reenable(): void {
    const gl = this.gl!;
    const khr = gl.getExtension(UI_GPU_GL.KHR_PARALLEL) as { COMPLETION_STATUS_KHR: number } | null;
    this.completion = khr ? khr.COMPLETION_STATUS_KHR : null;
    this.loseExt = (gl.getExtension(UI_GPU_GL.LOSE_CONTEXT) as LoseExt | null) ?? this.loseExt;
  }

  /** A live context nothing draws on let go (`loseContext`, its event not a loss) and counted down; kept and counted without the extension. */
  private letGo(): void {
    if (!this.gl || this.gl.isContextLost()) { this.setCounted(false); return; }
    if (!this.loseExt) { this.setCounted(true); return; }
    this.releasing = true;
    this.loseExt.loseContext();
    this.setCounted(false);
  }

  /** `returned`'s re-create, at the first present after it: the context asked back, or (no extension) rebuilt at once. */
  private reacquire(): void {
    this.wantBack = false;
    if (!this.gl) return;
    if (this.gl.isContextLost()) {
      if (this.loseExt && !this.asked) { this.asked = true; this.loseExt.restoreContext(); }
      return;
    }
    this.setCounted(true);
    this.build();
  }

  private restoreDone(): void {
    const now = this.o.clock.now();
    this.restores.push({ sinceLoss: now - (this.lostAt ?? now), sinceRestored: now - (this.restoredAt ?? now) });
    this.afterLoss = false;
  }

  private clearWait(): void {
    if (this.waitTimer !== null) { this.o.clock.clearTimeout(this.waitTimer); this.waitTimer = null; }
  }

  private setCounted(on: boolean): void {
    if (on === this.counted) return;
    this.counted = on;
    this.o.host?.adjustContexts(on ? 1 : -1);
  }

  private frameAt(level: UiGpuLevel): void {
    this.counts[level]++;
    this.o.host?.count(level);
  }

  private show(which: 'gpu' | 'software'): void {
    if (this.showing === which) return;
    this.showing = which;
    this.o.shown?.(which);
  }

  /** GM-16: the blend the next frame is planned with -- `exact` after a guard trip, else the table's (GM.R6). */
  private blendAt(scale: number): UiPlanBlendMode | undefined {
    if (this.escalated) return 'exact';
    const b = this.o.blend;
    return typeof b === 'function' ? b(scale) : b;
  }

  /**
   * GM-16: a shadow frame (see the class's comment). The page's frame is the software's at the shown scale, whatever
   * the GPU did; the GPU draws offscreen only when `ready`, and a GL error or a loss there is counted as on `on`.
   */
  private shadow(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions, probe?: UiPresentProbe | null): UiPresented {
    let job: { plan: UiFramePlan; readback: UiGpuReadback } | null = null;
    if (this.st === 'ready' && this.gpu && this.backend) {
      const wasAfterLoss = this.afterLoss;
      try {
        this.backend.setHdKeys(this.o.hdKeys?.() ?? null);
        const d = this.gpu.drawOffscreen(items, textures, options);
        if (wasAfterLoss) this.restoreDone();
        if (d.drawn && this.guardOf().wants(this.o.clock.now(), d.plan.hash)) job = { plan: d.plan, readback: this.backend.beginReadback() };
      } catch (e) {
        const lost = this.gl?.isContextLost() === true;
        this.lose(lost ? 'context' : 'error', `${lost ? 'the context was lost during a shadow frame' : 'a GL error inside a shadow frame, counted as a loss'} (plan ${this.gpu?.attempt ?? 'none'}): ${message(e)}`);
      }
    }
    const keeps = this.o.software as UiPresenter & UiRetainingPresenter;
    if (job) keeps.retainNext?.();
    const out = this.o.software.present(items, textures, options, probe);   // the page's frame: today's, at the shown scale
    if (job) {
      const reference = keeps.takeFrame ? keeps.takeFrame() : this.o.software.readFrame();
      if (reference && this.backend) this.guardOf().submit({ readback: job.readback, reference, plan: job.plan, probe, at: this.o.clock.now() });
      else job.readback.cancel();
    }
    this.counts.shadow++;
    this.lastWas = 'software';
    this.show('software');
    return out;
  }

  /** GM-16: the surface's guard, made at its first shadow frame. */
  private guardOf(): UiGpuGuard {
    this.guardRef ??= new UiGpuGuard({
      surface: this.o.surface, now: () => this.o.clock.now(), idle: this.o.idle ?? uiGpuIdle(), caps: () => this.caps,
      bound: this.o.guardBound ?? null, sample: this.o.guardSample, divide: divideTransparentFrame,
      onRecord: (r) => this.o.host?.guarded?.(r), onTrip: (r, n) => this.tripped(r, n),
    });
    return this.guardRef;
  }

  /**
   * GM-16: a guard trip (GM.R5, GM.R6; `UI_GPU_GUARD_TRIP_ADAPTATION`): logged with its plan, scale, blend and renderer;
   * on a frame drawn at `ff`, the surface escalated to `exact` for the session; on one drawn at `exact`, or at the trip
   * limit, the session kill (`guard-trip`: the switch resolves the surface `off`, today's path).
   */
  private tripped(r: UiGpuGuardRecord, trips: number): void {
    this.o.log?.(`[uiGpu] ${this.o.surface}: guard trip (${r.trip}) on plan ${r.hash} at ${r.scale}x ${r.blend} on ${r.renderer ?? 'an unknown renderer'}: ${r.why.join('; ')}`);
    if (this.st === 'dead' || this.st === 'disposed') return;
    if (r.blend === 'exact' || trips >= UI_GPU_GUARD_TRIP_ADAPTATION.killAt) { this.die('guard-trip'); return; }
    this.escalated = true;
    this.o.host?.escalateBlend?.(this.o.surface);
    this.gpu?.invalidate();
  }

  /** A frame by the software: at 1x after a loss (L2, L3), today's path at the shown scale otherwise (L4, waiting, released). */
  private software(items: readonly UiDrawItem[], textures: UiTextures, options: RasterOptions, probe?: UiPresentProbe | null): UiPresented {
    const loss = this.st === 'lost' || this.st === 'dead' || (this.st === 'compiling' && this.afterLoss);
    if (this.st === 'dead') this.frameAt('L3');
    else if (loss) this.frameAt('L2');
    else if (this.st === 'unavailable') this.frameAt('L4');
    else this.counts.waiting++;
    this.lastWas = 'software';
    this.show('software');
    return this.o.software.present(items, textures, loss ? uiGpuLossFallbackOptions(options) : options, probe);
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
