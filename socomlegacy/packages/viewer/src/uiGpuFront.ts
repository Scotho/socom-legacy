/**
 * GM-12b (the GPU menus plan, row GM-12b; "Canvases and contexts"; GM.R15, GM.R16, GM.R17; research 380 §5): the front
 * end's GPU canvas on the page. PRODUCT TRACK, a browser adaptation with no original: it decides which of two canvases
 * shows the menus' frame -- `#front-end` (the 2D canvas: `say()`, today's software frames, and the surface's software
 * fallback) or `#front-end-gpu` (the WebGL2 canvas the surface draws on) -- never a byte of the frame (the GPU frame is
 * `GpuUiPresenter`'s, the software frame `CpuUiPresenter`'s, both held to the original elsewhere).
 *
 * - **Made only when the switch asks `front` of the GPU** (`uiGpuFrontWanted`: `on` or `shadow` at either scale). The
 *   landed table keeps every cell `off`, so on every player's page nothing here runs and the page is `#front-end` alone
 *   (GM.R16). GM-16: `shadow` makes the canvas and its surface too -- the surface shows the software's frame on
 *   `#front-end` and draws the GPU's offscreen for the guard, so `#front-end-gpu` stays in standby (never presented).
 * - **`#front-end-gpu`** is `#front-end`'s sibling, placed after it with the same placement (`place`), so the same CSS
 *   box; registered for BRIGHTNESS by `frameCanvas` (the same filter on both); SCREEN POSITION lays its origin
 *   (`./screenOrigin` `SCREEN_ORIGIN_CANVASES`, `./styles.css`); the page's keys and taps are attached to it too
 *   (`./menuInput` `MenuPageAttachment.also`). While the software shows it is in standby (`UI_GPU_STANDBY_CLASS`:
 *   `visibility: hidden`, its box kept, the pointer through to `#front-end`).
 * - **The swap waits for the tick boundary**: what a tick drew (`drawn`) or the surface said (`want`, its `shown`) is
 *   applied by `commit`, once the tick's frame is on its canvas, so a canvas is never shown before its frame; a
 *   `software` said between frames (a loss) waits for a software frame on `#front-end` (`want`; GM-12b review F1).
 *   `#front-end`'s `hidden` (the match's hold) hides `#front-end-gpu` at the same commit, and its classes (the touch
 *   layer's `mobile-game-frame`) are mirrored, so the box stays the same.
 * - **The surface** (`./uiGpuPresenter` `UiGpuSurfacePresenter`) is loaded by `load` -- the page's `import()` (GM.R15:
 *   the GPU modules are never in the front end's static graph) -- after the first software frame, once; until it lands
 *   the frames are today's path.
 * - **The path a scale takes** (`uiGpuFrontPath`): `on` or (GM-16) `shadow` at that scale is the surface (its own ladder
 *   inside: L0-L4; in shadow, the software shown).
 *   The surface's own session kill (`loss-limit`, `restore-timeout`) keeps the surface, whose L3 is the 1x software for
 *   the rest of the session (the plan's ladder; `UI_GPU_LOSS_FALLBACK_ADAPTATION`), never today's 65-87 ms 4x frame;
 *   any other kill (a guard trip, GM-16) or `off` at that scale is today's path on `#front-end` at the player's scale
 *   (GM.R16). This settles GM-12a's open question for the controller to confirm (the 16:37Z Log entry).
 */

import { frameCanvas } from './brightness';
import type { UiGpuSurface, UiGpuSwitch } from './uiGpuSwitch';
import type { UiPresenter } from './uiPresenter';

/** The GPU canvas's id (the plan, "Canvases and contexts"). */
export const FRONT_END_GPU_ID = 'front-end-gpu';

/**
 * UI_GPU_STANDBY_CLASS (a browser adaptation): `#front-end-gpu` while the software's frame shows -- `visibility: hidden`
 * (`./styles.css`), so its CSS box stays laid out (SCREEN POSITION reads it) and the pointer passes to `#front-end`.
 */
export const UI_GPU_STANDBY_CLASS = 's2u-ui-gpu-standby';

const FRONT: UiGpuSurface = 'front';

/** What the page needs of the switch. */
export type FrontEndGpuSwitch = Pick<UiGpuSwitch, 'resolve'>;

/** The surface as the page uses it (`UiGpuSurfacePresenter`'s calls). */
export interface FrontEndGpuSurface extends UiPresenter {
  /** The canvas the last frame went to: `gpu` (L0, L1) or `software` (`#front-end`). */
  readonly lastPath: 'gpu' | 'software' | null;
  release(): void;
  returned(): void;
  dispose(): void;
}

/** Whether the page makes the front end's GPU canvas: the switch asks `on` or `shadow` of `front` at scale 1 or at an HD scale. */
export function uiGpuFrontWanted(sw: FrontEndGpuSwitch): boolean {
  const gpu = (m: string): boolean => m === 'on' || m === 'shadow';
  return gpu(sw.resolve(FRONT, 1).mode) || gpu(sw.resolve(FRONT, 2).mode);
}

/** The path the front end's frame takes at `scale`: the surface (`gpu`) or today's software on `#front-end`. */
export function uiGpuFrontPath(sw: FrontEndGpuSwitch, scale: number): 'gpu' | 'software' {
  const r = sw.resolve(FRONT, scale);
  if (r.mode === 'on' || r.mode === 'shadow') return 'gpu';     // GM-16: a shadow surface shows the software itself
  if (r.source === 'session' && r.requested === 'on' && (r.reason === 'loss-limit' || r.reason === 'restore-timeout')) return 'gpu';
  return 'software';
}

export interface FrontEndGpuOptions {
  doc: Document;
  /** `#front-end`, the 2D canvas. */
  twin: HTMLCanvasElement;
  sw: FrontEndGpuSwitch;
  /** The page's placement of the front end's canvases (the same CSS box). */
  place: (el: HTMLCanvasElement) => void;
  /** The surface on `#front-end-gpu`, made by the page's `import()` (asked once, after the first software frame). */
  load: (canvas: HTMLCanvasElement) => Promise<FrontEndGpuSurface>;
  /** SCREEN POSITION re-laid when a commit shows the other canvas (`screenOriginKeeper.lay`). */
  laid?: () => void;
  /** A failure's line (the console). */
  log?: (line: string) => void;
}

/** The front end's GPU canvas, its swap and its surface (see the module's comment). */
export class FrontEndGpu {
  readonly canvas: HTMLCanvasElement;
  private surf: FrontEndGpuSurface | null = null;
  private pending: 'gpu' | 'software' = 'software';
  private showing: 'gpu' | 'software' = 'software';
  private asked = false;
  private gone = false;
  /** `#front-end` holds no frame newer than the GPU canvas's (the last frame drawn went to the GPU). */
  private twinStale = false;
  /** A `want('software')` held until a software frame is on `#front-end` (GM-12b review F1). */
  private held = false;

  private constructor(private readonly o: FrontEndGpuOptions) {
    const c = o.doc.createElement('canvas');
    c.id = FRONT_END_GPU_ID;
    c.width = 640;
    c.height = 448;
    o.place(c);
    c.classList.add(UI_GPU_STANDBY_CLASS);
    o.twin.after(c);
    frameCanvas(c);   // OPT-11 (research 358): BRIGHTNESS on this frame as on #front-end's
    this.canvas = c;
  }

  /** The canvas made beside `twin` when the switch asks `front` of the GPU; null otherwise (nothing made). */
  static mount(o: FrontEndGpuOptions): FrontEndGpu | null {
    return uiGpuFrontWanted(o.sw) ? new FrontEndGpu(o) : null;
  }

  /** The surface, once loaded (null before, after a failed load and after `dispose`). */
  get surface(): FrontEndGpuSurface | null { return this.surf; }
  /** The canvas showing since the last commit. */
  get shown(): 'gpu' | 'software' { return this.showing; }

  /** The surface landed: kept, or let go at once when the page has already let this go. */
  attach(surface: FrontEndGpuSurface): void {
    if (this.gone) { surface.dispose(); return; }
    this.surf = surface;
  }

  /** Whether this tick's frame at `scale` goes through the surface. */
  drawsOn(scale: number): boolean {
    return this.surf !== null && !this.gone && uiGpuFrontPath(this.o.sw, scale) === 'gpu';
  }

  /** A frame drawn this tick: through the surface (`gpu`; its canvas the one it says) or today's path on `#front-end`. */
  drawn(gpu: boolean): void {
    this.pending = gpu && this.surf ? this.surf.lastPath ?? 'software' : 'software';
    this.twinStale = this.pending === 'gpu';      // a GPU frame: #front-end's last frame is older than what shows
    this.held = false;
    if (!gpu) this.loadOnce();
  }

  /**
   * The canvas to show at the next commit (the surface's `shown`). GM-12b review F1: a `software` said outside a draw (a
   * `webglcontextlost` between frames) while `#front-end` holds no frame newer than the GPU canvas's is held -- the GPU
   * canvas stays until a software frame is drawn (`drawn`), so `#front-end`'s old frame never shows; taken at once while
   * the canvases are hidden (the match's `leave`: its release), when nothing shows.
   */
  want(which: 'gpu' | 'software'): void {
    if (which === 'software' && this.twinStale && !this.o.twin.hidden) { this.held = true; return; }
    this.held = false;
    this.pending = which;
  }

  /** The tick boundary: the canvas to show applied, `#front-end`'s `hidden` and classes mirrored. */
  commit(): void {
    const c = this.canvas, twin = this.o.twin;
    if (this.held && twin.hidden) { this.held = false; this.pending = 'software'; }   // hidden: nothing shows, the hold taken
    if (c.hidden !== twin.hidden) c.hidden = twin.hidden;
    const standby = this.pending !== 'gpu';
    const classes = [...twin.classList];
    if (standby) classes.push(UI_GPU_STANDBY_CLASS);
    const want = classes.join(' ');
    if (c.className !== want) c.className = want;
    if (this.showing !== this.pending) {
      this.showing = this.pending;
      this.o.laid?.();
    }
  }

  /** The match's `leave`: the surface's context let go (`UiGpuSurfacePresenter.release`). */
  release(): void { this.surf?.release(); }
  /** The match's return: the surface asks for its context back at its next frame. */
  returned(): void { this.surf?.returned(); }

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
    this.o.load(this.canvas).then((s) => this.attach(s), (e: unknown) => {
      (this.o.log ?? console.warn)(`[uiGpu] front: the GPU surface did not load, today's path kept: ${e instanceof Error ? e.message : String(e)}`);
    });
  }
}
