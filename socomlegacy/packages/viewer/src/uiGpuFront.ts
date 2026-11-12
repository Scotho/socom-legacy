/**
 * GM-12b (the GPU menus plan, row GM-12b; "Canvases and contexts"; GM.R15, GM.R16, GM.R17; research 380 §5): the front
 * end's GPU canvas on the page. PRODUCT TRACK, a browser adaptation with no original: it decides which of two canvases
 * shows the menus' frame -- `#front-end` (the 2D canvas: `say()`, today's software frames, and the surface's software
 * fallback) or `#front-end-gpu` (the WebGL2 canvas the surface draws on) -- never a byte of the frame (the GPU frame is
 * `GpuUiPresenter`'s, the software frame `CpuUiPresenter`'s, both held to the original elsewhere).
 *
 * - **Made only when the switch asks `front` of the GPU** (`uiGpuFrontWanted`: `on` or `shadow` at either scale). Since
 *   the flip (GM.R18) the landed table is every cell `on`, so every page makes it; `?uiGpu=off` and the storage kill leave
 *   the page `#front-end` alone. GM-16: `shadow` makes the canvas and its surface too -- the surface shows the software's frame on
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
 *   any other kill (a guard trip, GM-16) or `off` at that scale is the page's own software on `#front-end`.
 *   This settles GM-12a's open question for the controller to confirm (the 16:37Z Log entry).
 * - **GM-28 (GM.R19, the owner's "the original 1x frame"): the scale a frame is drawn at follows what presents.** The
 *   menus' HD options (the pack's scale, its lookup, the quad cache) go to the surface only (`uiGpuFrontFrameOptions`),
 *   which draws them on the GPU while it presents and the 1x software otherwise (`./uiGpuPresenter`); every frame the
 *   page draws on `#front-end` itself -- before the surface's `import()` lands, after a failed load, a guard trip, `off`
 *   by any route -- is the 1x frame (`UI_GPU_LOSS_FALLBACK_ADAPTATION`). GM.R16's "`off` at the player's scale" is
 *   withdrawn by GM.R19.
 */

import { uiGpuLossFallbackOptions, type UiGpuFallbackable, type UiGpuSurface, type UiGpuSwitch } from './uiGpuSwitch';
import type { UiGpuLadder } from './uiGpuSwitch';
import { UiGpuCanvasMount, uiGpuSurfacePath, uiGpuSurfaceWanted, type UiGpuMountSurface, type UiGpuResolveAt } from './uiGpuSurfaceMount';

/** The GPU canvas's id (the plan, "Canvases and contexts"). */
export const FRONT_END_GPU_ID = 'front-end-gpu';

/**
 * UI_GPU_STANDBY_CLASS (a browser adaptation): `#front-end-gpu` while the software's frame shows -- `visibility: hidden`
 * (`./styles.css`), so its CSS box stays laid out (SCREEN POSITION reads it) and the pointer passes to `#front-end`.
 * GM-19a: defined with the shared mount (`./uiGpuSurfaceMount`), which every surface's GPU canvas uses.
 */
export { UI_GPU_STANDBY_CLASS } from './uiGpuSurfaceMount';

const FRONT: UiGpuSurface = 'front';

/** What the page needs of the switch. */
export type FrontEndGpuSwitch = Pick<UiGpuSwitch, 'resolve'>;

/** The surface as the page uses it (`UiGpuSurfacePresenter`'s calls; GM-19a: the shared mount's `UiGpuMountSurface`). */
export type FrontEndGpuSurface = UiGpuMountSurface;

const frontAt = (sw: FrontEndGpuSwitch): UiGpuResolveAt => (scale) => sw.resolve(FRONT, scale);

/** Whether the page makes the front end's GPU canvas: the switch asks `on` or `shadow` of `front` at scale 1 or at an HD scale. */
export function uiGpuFrontWanted(sw: FrontEndGpuSwitch): boolean {
  return uiGpuSurfaceWanted(frontAt(sw));
}

/** The path the front end's frame takes at `scale`: the surface (`gpu`) or today's software on `#front-end`. */
export function uiGpuFrontPath(sw: FrontEndGpuSwitch, scale: number): 'gpu' | 'software' {
  return uiGpuSurfacePath(frontAt(sw), scale);
}

/**
 * GM-28 (GM.R19; `UI_GPU_LOSS_FALLBACK_ADAPTATION`, a browser adaptation): the options a front-end frame is drawn with --
 * the menus' HD options as chosen (`hd`) when `gpu` (the frame goes to the GPU surface, which keeps them only while it
 * presents; or the perf instrument's forced HD path, `?uiPerfHd`, a development build only), the original 1x frame
 * otherwise (`uiGpuLossFallbackOptions`: scale 1, no HD lookup, no quad cache). A scale-1 frame is unchanged in substance.
 * GM-19a / GM-23: the overlay's and the loading screen's frames are decided by the same rule.
 */
export function uiGpuFrontFrameOptions<O extends UiGpuFallbackable & { readonly scale: number }>(hd: O, gpu: boolean): O | (Omit<O, 'hd' | 'quadCache' | 'scale'> & { scale: number }) {
  if (gpu || (hd.scale === 1 && hd.hd === undefined && hd.quadCache === undefined)) return hd;   // nothing to drop: no copy a frame
  return uiGpuLossFallbackOptions(hd);
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
  /** The flip's review F2: the surface down for the session (L4, L3), told once (`UiGpuCanvasMountOptions.down`). */
  down?: (level: 'L3' | 'L4', reason: string | null) => void;
  /**
   * The flip's re-check 2 (GM-30's rule; a test and playtest instrument): where the page's own software frames are counted
   * while the surface is down -- the switch's `hostFor('front')`. Absent, nothing is counted.
   */
  ladder?: UiGpuLadder;
}

/**
 * The front end's GPU canvas, its swap and its surface (see the module's comment): `#front-end-gpu` on the shared mount
 * (`./uiGpuSurfaceMount` `UiGpuCanvasMount`, GM-19a's factoring of what was this class), for `front`.
 */
export class FrontEndGpu extends UiGpuCanvasMount {
  private readonly ladder: UiGpuLadder | undefined;
  private constructor(o: FrontEndGpuOptions) {
    const { ladder, ...rest } = o;                              // not the mount's: its `readyOn` count is the overlay's and the panel's
    super({ ...rest, id: FRONT_END_GPU_ID, label: 'front', resolveAt: frontAt(o.sw) });
    this.ladder = ladder;
  }

  /** The canvas made beside `twin` when the switch asks `front` of the GPU; null otherwise (nothing made). */
  static mount(o: FrontEndGpuOptions): FrontEndGpu | null {
    return uiGpuFrontWanted(o.sw) ? new FrontEndGpu(o) : null;
  }

  /**
   * The flip's re-check 2: a frame drawn this tick; while the surface is down (L4, L3), a frame of the page's own software
   * is counted on the ladder with the level and reason `down` carried, as the overlay's and the panel's are (GM-30). A
   * frame through the surface (`gpu`) is the surface's own to count, never counted here. The front end's loop calls no
   * `readyOn`, so this is its only count of those frames.
   */
  override drawn(gpu: boolean): void {
    super.drawn(gpu);
    if (!gpu && this.downAt) this.ladder?.fallback(this.downAt.level, this.downAt.reason);
  }
}
