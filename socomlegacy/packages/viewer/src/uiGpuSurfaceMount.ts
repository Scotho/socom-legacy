/**
 * GM-19a / GM-23 (the GPU menus plan, rows GM-12b, GM-19a, GM-23; "Canvases and contexts"; GM.R15, GM.R17, GM.R19;
 * research 380 §5): one menu surface's GPU canvas on the page -- the front end's (`./uiGpuFront` `FrontEndGpu`), the
 * in-match Settings overlay's (`./nativeSettings`) and the loading screen's (`./loadingPanel`) -- factored from GM-12b's
 * `FrontEndGpu` so the three share one mount. PRODUCT TRACK, a browser adaptation with no original: it decides which of
 * two canvases shows a surface's frame -- the 2D canvas (`twin`: the software frames, `CpuUiPresenter`'s) or the WebGL2
 * canvas the surface draws on -- never a byte of the frame.
 *
 * - **Made only when the switch asks the surface of the GPU** (`uiGpuSurfaceWanted`: `on` or `shadow` at scale 1 or at an
 *   HD scale, through the caller's `resolveAt`: `UiGpuSwitch.resolve(surface, scale)`, or the test room's overlay's
 *   `resolveTestRoomOverlay()`, which reads `overlay.sd` at any scale, GM.R8). Since the flip (GM.R18) the landed table is
 *   every cell `on`, so every page makes it; a surface that cannot present (L4, L3) leaves the page its own 1x software.
 * - **The canvas** is the twin's sibling, placed after it (`place`, the same CSS box), in standby while the software shows
 *   (`UI_GPU_STANDBY_CLASS`: `visibility: hidden`, its box kept, the pointer through to the twin), registered for
 *   BRIGHTNESS (`frameCanvas`). A transparent surface (the overlay, `hideTwin`) hides the twin while the GPU canvas shows
 *   (`UI_GPU_UNDER_CLASS`), since the twin's last software frame would show through it.
 * - **The swap waits for the tick boundary** (`commit`); a `software` said between frames waits for a software frame on
 *   the twin (`want`; GM-12b review F1).
 * - **The surface** is loaded by `load` -- the page's `import()` (GM.R15: the GPU modules never in a static graph) --
 *   after the first software frame, once (`drawn(false)`); until it lands the frames are the twin's.
 * - **The path a scale takes** (`uiGpuSurfacePath`): `on` or `shadow` at that scale is the surface (its own ladder inside);
 *   the surface's own session kill (`loss-limit`, `restore-timeout`) keeps the surface, whose L3 is its 1x software; any
 *   other kill, or `off`, is the page's own software on the twin. GM-28 (GM.R19): the caller hands the HD options to the
 *   surface only and draws its own software frames at 1x (`./uiGpuFront` `uiGpuFrontFrameOptions`).
 * - **GM-30: the frames `readyOn` sends to the page's software are counted** on the switch, per surface
 *   (`uiGpuFallbackFrame`: the level and the reason; the loader's `ladder`, the switch's `hostFor(surface)`), since the
 *   surface's own `software()`, which counts levels, never sees them. A test and playtest instrument: it decides nothing.
 */

import { frameCanvas } from './brightness';
import type { DeviceClass } from './deviceClass';
import type { UiGpuHdKeys } from './uiGpuTextures';
import type { UiGpuFallbackLevel, UiGpuLadder, UiGpuResolution, UiGpuSurface, UiGpuSwitch } from './uiGpuSwitch';
import type { UiPresenter } from './uiPresenter';

/**
 * UI_GPU_STANDBY_CLASS (a browser adaptation): a GPU canvas while the software's frame shows -- `visibility: hidden`
 * (`./styles.css`), so its CSS box stays laid out (SCREEN POSITION reads it) and the pointer passes to the twin.
 */
export const UI_GPU_STANDBY_CLASS = 's2u-ui-gpu-standby';

/**
 * UI_GPU_UNDER_CLASS (GM-19a, a browser adaptation): a transparent surface's 2D canvas while its GPU canvas shows --
 * `visibility: hidden` (`./styles.css`), so the software's last frame does not show through the transparent GPU frame.
 */
export const UI_GPU_UNDER_CLASS = 's2u-ui-gpu-under';

/** The switch's answer for one surface at a frame's scale (what the mount reads of `UiGpuResolution`). */
export type UiGpuResolveAt = (scale: number) => Pick<UiGpuResolution, 'mode' | 'source' | 'requested' | 'reason'>;

/** The surface as a mount uses it (`./uiGpuPresenter` `UiGpuSurfacePresenter`'s calls). */
export interface UiGpuMountSurface extends UiPresenter {
  /** The canvas the last frame went to: `gpu` (L0, L1) or `software` (the twin). */
  readonly lastPath: 'gpu' | 'software' | null;
  release(): void;
  returned(): void;
  dispose(): void;
  /**
   * GM-23 / GM-19a review folds 3-4: the context made and its links begun ahead, without a stall; true once every program
   * linked (`./uiGpuPresenter` `UiGpuSurfacePresenter.prepare`). Absent (the front end's surface, a test's recorder):
   * frames go to the surface as before.
   */
  prepare?(): boolean;
  /** The links can only be asked by a call that waits (no `KHR_parallel_shader_compile`): the mount lets the surface go. */
  readonly linkWaits?: boolean;
  /** GM-30: the surface's lifecycle state (`UiGpuSurfacePresenter.state`), read to count a frame it is not ready for. */
  readonly state?: string;
  /** GM-30: its losses (a frame while the links after a loss run is L2) and its L4 reason (`UiGpuSurfacePresenter.stats`). */
  readonly stats?: { readonly losses: number; readonly unavailable: string | null };
}

/**
 * GM-30: a surface's loader as its owner is handed it -- the page's `import()` (`uiGpuSurfaceLoader`), which carries the
 * switch's ladder for its surface (`ladder`); a test's plain function carries none, and its mount counts nothing.
 */
export type UiGpuLoader<S> = ((at: UiGpuSurfaceLoad) => Promise<S>) & { readonly ladder?: UiGpuLadder };

/** GM-30: what `uiGpuFallbackFrame` reads of a mount and its surface for one frame sent to the page's software. */
export interface UiGpuFallbackState {
  /** The switch's answer at the frame's scale. */
  resolved: Pick<UiGpuResolution, 'mode' | 'source' | 'requested' | 'reason'>;
  /** The surface's state and L4 reason; null before its module lands (or after a failed load, or once let go). */
  surface: { readonly state?: string; readonly unavailable?: string | null } | null;
  /** Why the mount let the surface go or never had one: `no-parallel-link` (`linkWaits`), `load-failed`; null otherwise. */
  refused: string | null;
  /** The mount let go (`dispose`, `remove`). */
  gone: boolean;
  /** A loss since the surface last drew on the GPU (`stats.losses` rose; cleared at a ready frame and at `release`). */
  afterLoss: boolean;
}

/**
 * GM-30 (a test and playtest instrument): the level and the reason of a frame the mount sends to the page's own software,
 * as the surface's `software()` would have counted it (`./uiGpuPresenter`: `dead` L3, `lost` or links after a loss L2,
 * `unavailable` L4, else waiting), or null when the frame is not the ladder's -- `off` by the URL, the stored kill or the
 * table, or a mount let go by its page. A path the switch sends to the page's software for a session kill (a guard trip;
 * a kill of a `shadow` request) is L3 with the kill's reason; a surface let go for `no-parallel-link`, or a load that
 * failed, is L4 with that reason for the rest of the session; before the module lands, `waiting` (`module`).
 */
export function uiGpuFallbackFrame(x: UiGpuFallbackState): { level: UiGpuFallbackLevel; reason: string | null } | null {
  const r = x.resolved;
  if (uiGpuSurfacePath(() => r, 1) === 'software') return r.source === 'session' && r.reason !== undefined ? { level: 'L3', reason: r.reason } : null;
  if (x.refused !== null) return { level: 'L4', reason: x.refused };
  if (x.gone) return null;
  const s = x.surface;
  if (!s) return { level: 'waiting', reason: 'module' };
  switch (s.state) {
    case 'unavailable': return { level: 'L4', reason: s.unavailable ?? null };
    case 'dead': return { level: 'L3', reason: r.source === 'session' ? r.reason ?? null : null };
    case 'lost': return { level: 'L2', reason: null };
    case 'compiling': return x.afterLoss ? { level: 'L2', reason: null } : { level: 'waiting', reason: 'links' };
    case 'released': return { level: 'waiting', reason: 'released' };
    case 'unmade': case undefined: return { level: 'waiting', reason: 'links' };
    default: return null;                                       // `ready` (a prepared surface draws) or `disposed`
  }
}

/**
 * GM-XBOX1 (the GPU menus plan's Log, 2026-11-10; research 380 §5): the surfaces whose GPU option the page withholds on the
 * Xbox device class (`./deviceClass` `pageDeviceClass() === 'xbox'`). No original; bounds the browser's WebGL contexts on
 * one device class: the loading screen's surface lives through the match's load and the in-match Settings overlay's opens
 * beside the match, each a second live WebGL context beside the match's, and Xbox Edge already loses contexts. Withheld,
 * each is also handed the 1x HD option (`() => ({ scale: 1 })`, as v0.4.17 handed both) and draws the original 640 x 448
 * frame on its 2D canvas: the menus' HD pack is NOT refused on the Xbox class in this tree (`./autoQuality`: that refusal
 * is owed to a later lane merge), and with no GPU option a surface's software would raster the pack's scale itself (up to
 * 4x every frame through the load: GM-XBOX1 review F1). The front end keeps its surface: it is released at `leave`,
 * before the match makes its own. What shows: with no HD pack, the same frame (scale 1, where the GPU's blend is `exact`,
 * `UI_GPU_BLEND_ADAPTATION`, and its frames equal the software's); with an HD pack chosen, these two surfaces show the 1x
 * frame on Xbox, as v0.4.17 did, where mega's GPU surfaces showed the pack's scale.
 */
export const UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION: readonly UiGpuSurface[] = Object.freeze(['loading', 'overlay']);

/** GM-XBOX1: whether the page hands `surface` its GPU option on `deviceClass` (`UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION`). */
export function gpuSurfaceAllowed(surface: UiGpuSurface, deviceClass: DeviceClass): boolean {
  return !(deviceClass === 'xbox' && UI_GPU_XBOX_ONE_CONTEXT_ADAPTATION.includes(surface));
}

/** GM-XBOX1: what the page hands a gated surface -- its HD option and its GPU option, decided together (review F1). */
export interface UiGpuSurfaceWiring<H, G> {
  /** The caller's HD option (`undefined` for none) where the GPU option is given; the 1x option where it is withheld. */
  hd: H | (() => { scale: 1 });
  /** The caller's GPU option (`gpu()`, called only here) where allowed; absent where withheld. */
  gpu: G | undefined;
}

/**
 * GM-XBOX1 review F1: the one place the page decides a surface's two options on `deviceClass`, so they cannot drift: where
 * `gpuSurfaceAllowed` says yes, the caller's `hd` and `gpu()`; where it says no, no GPU option (its loader never made) and
 * the 1x HD option, so the surface's software draws the original 640 x 448 frame whatever the menus' pack is.
 */
export function uiGpuSurfaceWiring<H, G>(surface: UiGpuSurface, deviceClass: DeviceClass, hd: H, gpu: () => G): UiGpuSurfaceWiring<H, G> {
  return gpuSurfaceAllowed(surface, deviceClass) ? { hd, gpu: gpu() } : { hd: () => ({ scale: 1 as const }), gpu: undefined };
}

/** Whether a surface's GPU canvas is made: the switch asks `on` or `shadow` of it at scale 1 or at an HD scale. */
export function uiGpuSurfaceWanted(resolveAt: UiGpuResolveAt): boolean {
  const gpu = (m: string): boolean => m === 'on' || m === 'shadow';
  return gpu(resolveAt(1).mode) || gpu(resolveAt(2).mode);
}

/** The path a surface's frame takes at `scale`: the surface (`gpu`) or the page's own software on the twin. */
export function uiGpuSurfacePath(resolveAt: UiGpuResolveAt, scale: number): 'gpu' | 'software' {
  const r = resolveAt(scale);
  if (r.mode === 'on' || r.mode === 'shadow') return 'gpu';     // GM-16: a shadow surface shows the software itself
  if (r.source === 'session' && r.requested === 'on' && (r.reason === 'loss-limit' || r.reason === 'restore-timeout')) return 'gpu';
  return 'software';
}

/**
 * GM-19a / GM-23 review fold 1 (blocking; GM.R19, GM-28's rule per surface): whether a surface's frame at `scale` may carry
 * the HD options -- only when ITS OWN mode at that scale is `on`, or `shadow` on a page the Vite dev server serves
 * (`dev`, `uiGpuDevBuild`: the guard compares at the shown scale, GM.R11). A built page's `shadow` (a URL's) counts as not
 * presenting: its shadow frame is the software's at the scale it is handed, so it is handed 1x. Every other state draws 1x.
 */
export function uiGpuSurfaceHd(resolveAt: UiGpuResolveAt, scale: number, dev: boolean): boolean {
  const m = resolveAt(scale).mode;
  return m === 'on' || (m === 'shadow' && dev);
}

export interface UiGpuCanvasMountOptions {
  doc: Document;
  /** The surface's 2D canvas (`#front-end`, the overlay's canvas, the loading panel's). */
  twin: HTMLCanvasElement;
  /** The switch's answer for the surface at a scale. */
  resolveAt: UiGpuResolveAt;
  /** The surface's name in a log line (`front`, `overlay`, `loading`). */
  label: string;
  /** The GPU canvas's id, if it has one (`#front-end-gpu`). */
  id?: string;
  /** Data attributes on the GPU canvas (its CSS hook: `data-native-settings-gpu`). */
  dataset?: Readonly<Record<string, string>>;
  /** The page's placement of the canvas (the same CSS box as the twin's), if it places by script. */
  place?: (el: HTMLCanvasElement) => void;
  /** A transparent surface: the twin hidden while the GPU canvas shows (`UI_GPU_UNDER_CLASS`). */
  hideTwin?: boolean;
  /** Review fold 1: a page the Vite dev server serves (`uiGpuDevBuild`), whose `shadow` keeps the shown scale (`uiGpuSurfaceHd`). */
  dev?: boolean;
  /** The surface on the GPU canvas, made by the page's `import()` (asked once, after the first software frame). */
  load: (canvas: HTMLCanvasElement) => Promise<UiGpuMountSurface>;
  /** SCREEN POSITION re-laid when a commit shows the other canvas. */
  laid?: () => void;
  /** A failure's line (the console). */
  log?: (line: string) => void;
  /** GM-30: where `readyOn`'s software frames are counted (the loader's `ladder`); absent, nothing is counted. */
  ladder?: UiGpuLadder;
  /**
   * The flip's review F2 (a browser adaptation): told once when the surface can no longer present for the session -- L4
   * (`unavailable`, with its reason; or a failed load) or L3 (`dead`) -- so the page lets go what only a presenting
   * surface uses (the front end: the menus' HD pack).
   */
  down?: (level: 'L3' | 'L4', reason: string | null) => void;
}

/** A surface's GPU canvas, its swap and its surface (see the module's comment). */
export class UiGpuCanvasMount {
  readonly canvas: HTMLCanvasElement;
  private surf: UiGpuMountSurface | null = null;
  private pending: 'gpu' | 'software' = 'software';
  private showing: 'gpu' | 'software' = 'software';
  private asked = false;
  private gone = false;
  /** The twin holds no frame newer than the GPU canvas's (the last frame drawn went to the GPU). */
  private twinStale = false;
  /** A `want('software')` held until a software frame is on the twin (GM-12b review F1). */
  private held = false;
  /** GM-30: why the surface was let go or never landed (`no-parallel-link`, `load-failed`), for the count. */
  private refused: string | null = null;
  /** GM-30: the surface's losses last seen, and whether one came since its last frame on the GPU. */
  private lossesSeen = 0;
  private afterLoss = false;

  protected constructor(private readonly mo: UiGpuCanvasMountOptions) {
    const c = mo.doc.createElement('canvas');
    if (mo.id) c.id = mo.id;
    c.width = 640;
    c.height = 448;
    for (const [k, v] of Object.entries(mo.dataset ?? {})) c.dataset[k] = v;
    mo.place?.(c);
    c.classList.add(UI_GPU_STANDBY_CLASS);
    mo.twin.after(c);
    frameCanvas(c);   // OPT-11 (research 358): BRIGHTNESS on this frame as on the twin's
    this.canvas = c;
  }

  /** The canvas made beside `twin` when the switch asks the surface of the GPU; null otherwise (nothing made). */
  static make(o: UiGpuCanvasMountOptions): UiGpuCanvasMount | null {
    return uiGpuSurfaceWanted(o.resolveAt) ? new UiGpuCanvasMount(o) : null;
  }

  /** The surface, once loaded (null before, after a failed load and after `dispose`). */
  get surface(): UiGpuMountSurface | null { return this.surf; }
  /** The canvas showing since the last commit. */
  get shown(): 'gpu' | 'software' { return this.showing; }

  /** The surface landed: kept, or let go at once when the page has already let this go. */
  attach(surface: UiGpuMountSurface): void {
    if (this.gone) { surface.dispose(); return; }
    this.surf = surface;
  }

  /**
   * Whether this tick's frame at `scale` goes through the surface. The flip's review F3: never while the surface cannot
   * present -- L4 (`unavailable`), L3 (`dead`), let go -- so the page draws its own 1x software then, and GM.R17's skip of
   * a hidden frame binds only a surface that can present. The first such answer is told to `down` (review F2).
   */
  drawsOn(scale: number): boolean {
    if (this.surf === null || this.gone) return false;
    const st = this.surf.state;
    if (st === 'unavailable' || st === 'dead' || st === 'disposed') {
      const r = this.mo.resolveAt(scale);                       // L3: the session kill's reason, as `uiGpuFallbackFrame` reads it
      this.tellDown(st === 'dead' ? 'L3' : 'L4', st === 'unavailable' ? this.surf.stats?.unavailable ?? null : st === 'dead' && r.source === 'session' ? r.reason ?? null : null);
      return false;
    }
    return uiGpuSurfacePath(this.mo.resolveAt, scale) === 'gpu';
  }

  /** The level and reason the surface went down with (L4, L3), once said; null while it can present. */
  protected downAt: { readonly level: 'L3' | 'L4'; readonly reason: string | null } | null = null;
  private tellDown(level: 'L3' | 'L4', reason: string | null): void {
    if (this.downAt) return;
    this.downAt = { level, reason };
    this.mo.down?.(level, reason);
  }

  /** Review fold 1: whether this tick's frame at `scale` may carry the HD options (`uiGpuSurfaceHd`, the surface's own mode). */
  hdOn(scale: number): boolean {
    return uiGpuSurfaceHd(this.mo.resolveAt, scale, this.mo.dev === true);
  }

  /**
   * GM-23 / GM-19a review folds 3-4: whether this tick's frame at `scale` goes to the surface -- it draws this scale
   * (`drawsOn`) and, where it has the step, it is prepared (`prepare`: every program linked, polled without a stall).
   * Until then the owner draws its own 1x software. A surface whose links could only be asked by a call that waits
   * (`linkWaits`: no `KHR_parallel_shader_compile`, found before any compile) is let go for the session, said once.
   */
  readyOn(scale: number): boolean {
    const ready = this.prepared(scale);
    const s = this.surf;
    if (s?.stats) {                                             // GM-30: a loss since the last GPU frame makes links L2
      if (s.stats.losses > this.lossesSeen) this.afterLoss = true;
      this.lossesSeen = s.stats.losses;
    }
    if (ready) this.afterLoss = false;
    else if (this.mo.ladder) {
      const f = uiGpuFallbackFrame({
        resolved: this.mo.resolveAt(scale), refused: this.refused, gone: this.gone, afterLoss: this.afterLoss,
        surface: s ? { ...(s.state !== undefined ? { state: s.state } : {}), unavailable: s.stats?.unavailable ?? null } : null,
      });
      if (f) this.mo.ladder.fallback(f.level, f.reason);
    }
    return ready;
  }

  /** `readyOn`'s answer: drawn on this scale and prepared; a `linkWaits` surface let go for the session (`no-parallel-link`). */
  private prepared(scale: number): boolean {
    const s = this.surf;
    if (!s || !this.drawsOn(scale)) return false;
    if (!s.prepare) return true;
    if (s.prepare()) return true;
    if (s.linkWaits) {
      (this.mo.log ?? console.warn)(`[uiGpu] ${this.mo.label}: no KHR_parallel_shader_compile -- the ${this.mo.label} keeps its 1x software for the session (no link waited on)`);
      this.refused = 'no-parallel-link';
      this.remove();
    }
    return false;
  }

  /** A frame drawn this tick: through the surface (`gpu`; its canvas the one it says) or the page's software on the twin. */
  drawn(gpu: boolean): void {
    this.pending = gpu && this.surf ? this.surf.lastPath ?? 'software' : 'software';
    this.twinStale = this.pending === 'gpu';      // a GPU frame: the twin's last frame is older than what shows
    this.held = false;
    if (!gpu) this.loadOnce();
  }

  /**
   * The canvas to show at the next commit (the surface's `shown`). GM-12b review F1: a `software` said outside a draw (a
   * `webglcontextlost` between frames) while the twin holds no frame newer than the GPU canvas's is held -- the GPU canvas
   * stays until a software frame is drawn (`drawn`), so the twin's old frame never shows; taken at once while the
   * canvases are hidden (the match's `leave`: its release), when nothing shows.
   */
  want(which: 'gpu' | 'software'): void {
    if (which === 'software' && this.twinStale && !this.mo.twin.hidden) { this.held = true; return; }
    this.held = false;
    this.pending = which;
  }

  /** The tick boundary: the canvas to show applied, the twin's `hidden` and classes mirrored (the twin hidden under a transparent GPU frame). */
  commit(): void {
    const c = this.canvas, twin = this.mo.twin;
    if (this.held && twin.hidden) { this.held = false; this.pending = 'software'; }   // hidden: nothing shows, the hold taken
    if (c.hidden !== twin.hidden) c.hidden = twin.hidden;
    const standby = this.pending !== 'gpu';
    if (this.mo.hideTwin && twin.classList.contains(UI_GPU_UNDER_CLASS) === standby) twin.classList.toggle(UI_GPU_UNDER_CLASS, !standby);
    const classes = [...twin.classList].filter((k) => k !== UI_GPU_UNDER_CLASS);
    if (standby) classes.push(UI_GPU_STANDBY_CLASS);
    const want = classes.join(' ');
    if (c.className !== want) c.className = want;
    if (this.showing !== this.pending) {
      this.showing = this.pending;
      this.mo.laid?.();
    }
  }

  /** The surface's context let go (`UiGpuSurfacePresenter.release`: the front end at the match's `leave`, the overlay at the match's end, the loading screen when it hides). */
  release(): void { this.surf?.release(); this.afterLoss = false; }
  /** The surface asks for its context back at its next frame. */
  returned(): void { this.surf?.returned(); }

  /**
   * GM-19a: the canvas back beside the twin (the overlay's canvases leave the page when it closes), in standby until the
   * next frame is drawn, so the GPU canvas's frame from the last open never shows.
   */
  reattach(): void {
    if (this.gone) return;
    this.mo.twin.after(this.canvas);
    // S1 (the controller's level-3 review of mega): BRIGHTNESS again, as at the making -- `setBrightness` dropped the
    // canvas while it was off the page, as the overlay registers its software twin again at each open.
    frameCanvas(this.canvas);
    this.held = false; this.twinStale = false; this.pending = 'software';
    this.commit();
  }
  /** GM-19a: the canvas off the page, the surface kept. */
  detach(): void { this.canvas.remove(); }

  /** The session's close or the page's stop: the surface let go for good, the software shown. */
  dispose(): void {
    this.gone = true;
    this.surf?.dispose();
    this.surf = null;
    this.pending = 'software';
    this.held = false;
    this.commit();
  }

  /** The page's stop: disposed and the canvas taken off the page. */
  remove(): void {
    this.dispose();
    this.canvas.remove();
  }

  private loadOnce(): void {
    if (this.asked || this.gone) return;
    this.asked = true;
    this.mo.load(this.canvas).then((s) => this.attach(s), (e: unknown) => {
      this.refused = 'load-failed';                             // GM-30: L4 for the session, counted by `readyOn`
      this.tellDown('L4', 'load-failed');                       // the flip's review F2
      (this.mo.log ?? console.warn)(`[uiGpu] ${this.mo.label}: the GPU surface did not load, today's path kept: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
}

/** What a surface's loader is handed by its mount's owner: the GPU canvas, the software presenter on the twin, the swap's ear. */
export interface UiGpuSurfaceLoad {
  canvas: HTMLCanvasElement;
  /** The surface's software fallback: the twin's `CpuUiPresenter` (L2-L4, while linking, released). */
  software: UiPresenter;
  /** Which canvas the page should show, said when it changes (`UiGpuCanvasMount.want`). */
  shown: (which: 'gpu' | 'software') => void;
}

export interface UiGpuSurfaceLoaderOptions {
  surface: UiGpuSurface;
  /** A transparent surface (the overlay; P14, P22): its context `alpha: true`, presented premultiplied. */
  transparent: boolean;
  /** The page's switch: the session kill, the counts, the contexts, the blend and the shadow's answers. */
  sw: UiGpuSwitch;
  win: Window;
  /** The page's HD lookup's keys (`HdMenus.keys()`), asked at every frame; null with HD off. */
  hdKeys?: () => UiGpuHdKeys | null;
  log?: (line: string) => void;
}

/**
 * GM-19a / GM-23: a surface's loader for the page -- the GPU presenter's module reached by `import()` only (GM.R15) and
 * `UiGpuSurfacePresenter` made on the mount's canvas, the page's clock and switch, the twin's software presenter as its
 * fallback, as GM-12b's front end makes its own.
 */
export function uiGpuSurfaceLoader(o: UiGpuSurfaceLoaderOptions) {
  // GM-30: the switch as this surface's host, so its frames are counted per surface; carried as the loader's `ladder` for
  // the mount, which counts the frames it sends to the page's software (its owner hands it on: `UiGpuLoader`).
  const host = o.sw.hostFor(o.surface);
  return Object.assign((at: UiGpuSurfaceLoad) => import('./uiGpuPresenter').then((m) => new m.UiGpuSurfacePresenter({
    canvas: at.canvas, transparent: o.transparent, surface: o.surface, host, software: at.software,
    clock: { now: () => o.win.performance.now(), setTimeout: (fn, ms) => o.win.setTimeout(fn, ms), clearTimeout: (t) => { o.win.clearTimeout(t as number); } },
    blend: (scale) => o.sw.blend(o.surface, scale), allowSoftwareAdapter: o.sw.readout().url.allowSoftwareAdapter,
    shown: at.shown, log: o.log ?? ((line) => { console.warn(line); }),
    hdKeys: o.hdKeys ?? (() => null),
  })), { ladder: host as UiGpuLadder });
}
