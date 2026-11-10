import type { Rgba } from '@s2u/gs';
import { FADER_NAME, UI_FRAME, type UiDrawItem } from '@s2u/ui';
import { loadingFaderAlpha } from '@s2u/ui/loading';
import type { ArmoryQuad } from './armoryLayout';
import { armoryDrawList } from './armoryRaster';
import type { LoadingScreen } from './loadingAssets';
import { frameCanvas } from './brightness';
import { loadingQuads } from './loadingLayout';
import type { RasterOptions, UiBitmap, UiBlend, UiTextures } from './uiCompositorView';
import { CpuUiPresenter, type UiPresenter } from './uiPresenter';
import { uiGpuFrontFrameOptions } from './uiGpuFront';
import { UiGpuCanvasMount, type UiGpuLoader, type UiGpuMountSurface, type UiGpuResolveAt } from './uiGpuSurfaceMount';
import type { ViewerResponse } from './worker';

/**
 * The original's loading screen over the page while a map loads (INT-LOADING; socomlegacy/docs/research/125) -- an
 * **interim** ahead of ONL-18, whose generic dialog runtime (PLAT-05..PLAT-10, the 640x448 compositor PLAT-13) will
 * draw `dlgLoad.rdr` as every other screen, with its fades, its TRIANGLE binding and `ON_LOAD_COMPLETE`; this module
 * and its one call in `./main` then go.
 *
 * Ported from Chris's browser-beta-v5 `loadingPanel.ts` and his `main.ts` hook-up (chris/browser-beta-integration
 * d578f347): a fixed overlay over the page, shown on the worker's early answer for the wanted map and hidden when that
 * map arrives in the legacy watch; the page now explicitly completes it after join readiness. What changed: the frame is `./loadingLayout`'s quads -- every place, size, colour and scale from
 * `dlgLoad.rdr`'s records, the title through `fonts.rdr`'s face -- where his were typed in (his numbers were the
 * records', read by hand: research 125 §6); the disc turns by `SpinLoadingCD`'s own keys, not a CSS keyframe; and his
 * "SUPPRESSION COMBAT TEST" notice and its Arial fallback are not ported (no text of the page's own is drawn).
 *
 * GM-22 (research 380 §4, `LOADING_PANEL_ALPHA_CLAMP_READING`; the code step, 2026-11-09): the frame is drawn as the
 * menus' frame is, because the original draws it so -- LoadState's Init builds `dlgLoad.rdr` with the menus' own
 * `CGameMenu` constructor `FUN_00369b60` and builder `FUN_00368570` (LoadState `FUN_001f6660` D:L55818, D:L55826), and
 * its Tick `FUN_001f5e70` draws it with `FUN_003691c0` (D:L55769) through the menus' walker `FUN_00336c10(0x4887c0, ...)`
 * (D:L264266-264274). So its quads are `UiDrawItem`s (`loadingDrawList`) put through the menus' software rasteriser
 * behind the presenter seam (`./uiPresenter` `CpuUiPresenter`, GM-09; a GPU presenter takes its place at GM-23) under
 * the compositor's rules (research 380 §2, P1-P23): the modulate and the alpha as it stands, unclamped (P8-P10), the
 * bilinear filter and the integer coverage (P3, P6). Over them, last as the foreplane is (research 112 R112.2), the
 * fader: an untextured black quad at `loadingFaderAlpha` -- the screen comes up from black over `OnMenuStart`'s 1.5 s
 * and is taken down with no fade out (`LOADING_FADE_READING`, research 125 §5). The 640 x 448 frame (times the HD
 * scale) is scaled whole to the window's height by `./styles.css`, as the HUD's native presentation scales the console
 * frame (`./hud`). The overlay takes no pointer events: it never holds the page.
 */

/** What shows and hides the screen (the DOM panel; a recorder in the tests). */
export interface LoadingSurface { show(screen: LoadingScreen): void; hide(): void }

/**
 * Which answers show and hide the screen: the wanted load's `loading` shows it (when `accept` takes it); that load's
 * `map` or `error` hides it in legacy mode; the page defers `map` until `ready`. Any answer for a newer wanted
 * load takes a stale screen down first.
 */
export class LoadingWatch {
  private shown: number | null = null;
  /** The last completed or failed load: its screen, should it arrive late, is not shown. */
  private ended = -1;
  constructor(
    private readonly wanted: () => number,
    private readonly surface: LoadingSurface,
    private readonly accept: (screen: LoadingScreen) => boolean = () => true,
    private readonly deferMap = false,
  ) {}

  /** Retire the old surface before the page covers its next request. */
  begin(): void { this.down(); }

  onMessage(message: ViewerResponse): void {
    const wanted = this.wanted();
    if (this.shown !== null && this.shown !== wanted && message.id === wanted) this.down();
    if (message.kind === 'loading') {
      if (message.id === wanted && message.id !== this.ended && this.shown !== wanted && this.accept(message.data)) {
        this.shown = wanted;
        this.surface.show(message.data);
      }
      return;
    }
    if (message.kind === 'map' && this.deferMap) return;
    if (message.kind === 'map' || message.kind === 'error') {
      this.ended = message.id;
      if (message.id === this.shown) this.down();
    }
  }

  ready(id: number): void {
    if (id !== this.wanted()) return;
    this.ended = id;
    this.down();
  }

  /** The worker failed without an answer (`./decodeFailure`): nothing will hide the screen otherwise. */
  failed(): void { this.down(); }

  private down(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.surface.hide();
  }
}

const FRAME_W = UI_FRAME.width, FRAME_H = UI_FRAME.height;

/**
 * LOADING_TEXTURE_BLEND_READING: the loading screen's bitmaps blend by `source` (`ALPHA_1` 0x44, research 380 P10), the
 * default a `UiBitmap` without `blend` takes. They come from the map archive's own libraries (the layout's and the
 * binding's `<stem>_TXR.ZED`; `./loadingAssets`), whose bind packets' `ALPHA_1` no tally has read:
 * `GS_MODULATE_BLEND_READING`'s tally (0x44 on every texture but the main menu roller's twelve;
 * `tools/test/menuEntryFadeDisc.test.ts`) covers `FONT_TXR` and the 57 `RUN/UI/*_TXR.ZED` libraries, not the map
 * archives'. A tally of their binds over the 22 MP maps would settle it (research 380 §4).
 */
export const LOADING_TEXTURE_BLEND_READING: UiBlend = 'source';

/**
 * GM-22 review F3: a loading-screen bitmap as the compositor takes it -- its texels with `blend` set
 * (`LOADING_TEXTURE_BLEND_READING`, which `uiRasterRules.ts` `blendAfterBind` reads at the bind). Made once per bitmap
 * when the screen is shown, never per frame; the texels are shared, not copied (the HD lookup keys by them).
 */
export function loadingBitmap(bitmap: Rgba, blend: UiBlend = LOADING_TEXTURE_BLEND_READING): UiBitmap {
  return { width: bitmap.width, height: bitmap.height, data: bitmap.data, blend };
}

/**
 * GM-22: the screen's frame as the menus' draw list -- each quad a sprite of its bitmap in `loadingQuads`' order (its
 * texels over the bitmap's size, the GS colour and alpha as they stand: `./armoryRaster` `armoryDrawList`, the lobby
 * ARMORY's own conversion, with no models), then MENUFADER over the whole frame, an untextured black quad at `fader`
 * (0..128 on the GS's scale), blended by the register the last bind left (P2; `GS_MODULATE_BLEND_READING`).
 */
export function loadingDrawList(
  quads: readonly ArmoryQuad[], sizes: Readonly<Record<string, { width: number; height: number }>>, fader: number,
): UiDrawItem[] {
  const items = armoryDrawList(quads, [], sizes, () => null);
  items.push({
    kind: 'sprite', node: FADER_NAME, texture: null, x0: 0, y0: 0, x1: FRAME_W, y1: FRAME_H,
    u0: 0, v0: 0, u1: 0, v1: 0, rgba: [0, 0, 0, fader], clip: null,
  });
  return items;
}

/**
 * HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the frame's scale, the HD pack's lookup and its
 * raster cache -- the page's (the front end hands it `./hdMenuTextures` `HdMenus.options`: one pack, one budget; which
 * scale it hands is the page's, GM-28). Under a whole scale over 1 the compositor draws the frame at 640 x 448 times it
 * (HD-3: every quad's place in the frame unchanged) and a bitmap the pack replaces is sampled from its HD image; the
 * lookup takes the panel's bitmaps as they are, top row first (`./loadingAssets` `flipRows`), as the menus' are. Absent,
 * or scale 1: the original frame, the lookup unused.
 */
export type LoadingHd = () => Pick<RasterOptions, 'scale' | 'hd' | 'quadCache'>;

/**
 * GM-23: the loading screen's GPU surface as the panel uses it -- the mount's calls, and the two that keep the loading
 * thread free of a stall: `prepare` (the context made and its links begun ahead; polled only where the poll cannot wait;
 * true once every program linked) and `linkWaits` (the links can only be asked by a call that waits: no
 * `KHR_parallel_shader_compile`). `./uiGpuPresenter` `UiGpuSurfacePresenter` has both.
 */
export interface LoadingGpuSurface extends UiGpuMountSurface {
  prepare(): boolean;
  readonly linkWaits: boolean;
}

// (Review folds 3-4: the mount's `readyOn` runs `prepare` and lets a `linkWaits` surface go, for the overlay too.)

/**
 * GM-23 (a browser adaptation; the GPU menus plan, row GM-23): what the panel needs to put its frame on the GPU -- the
 * switch's answer at a scale (`UiGpuSwitch.resolve('loading', scale)`) and the surface's loader (`./uiGpuSurfaceMount`
 * `uiGpuSurfaceLoader`, the page's `import()`, GM.R15). It decides which drawer makes the frame, never a byte of it.
 */
export interface LoadingPanelGpu {
  resolveAt: UiGpuResolveAt;
  /** GM-30: the page's loader carries the switch's ladder for `loading` (`UiGpuLoader`), so the panel's software frames are counted. */
  load: UiGpuLoader<LoadingGpuSurface>;
  /** A failure's line (the console). */
  log?: (line: string) => void;
  /** Review fold 1: a page the Vite dev server serves (`uiGpuDevBuild`): its `shadow` keeps the shown scale; elsewhere 1x. */
  dev?: boolean;
}

/** The DOM panel: a canvas the size of the console frame (times the HD scale), over the page. */
export class LoadingPanel implements LoadingSurface {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  /** GM-22: what puts the frame on the canvas (GM-09's seam; the software path today); null with no 2D context. */
  private readonly presenter: UiPresenter | null;
  private screen: LoadingScreen | null = null;
  private bitmaps = new Map<string, UiBitmap>();
  private sizes: Record<string, { width: number; height: number }> = {};
  private frame = 0;
  private started = 0;
  /** GM-09: what the last frame drawn left undrawn (the compositor's own strings). */
  private left: readonly string[] = [];
  /** The draw list's bitmaps: the screen's own, by the name its quads carry (`LOADING_TEXTURE_BLEND_READING`). */
  private readonly textures: UiTextures = (name) => this.bitmaps.get(name) ?? null;
  /** GM-23: the panel's GPU canvas and surface (made when the switch asks `loading` of the GPU; null otherwise). */
  private gpuMount: UiGpuCanvasMount | null = null;
  /** GM-23: the surface's context let go when the screen hid; asked back at the next show. */
  private gpuReleased = false;
  /** GM-23: what drew the frame on show (the GPU surface or the software presenter), for `readFrame`. */
  private drawer: UiPresenter | null = null;

  /**
   * `hd`: HD-4's options (see `LoadingHd`). GM-23's `gpu`: given, those options reach only a presenting GPU surface and
   * every software frame is the original 1x frame (GM-28, GM.R19); absent (`./main`'s map viewer, the HD-4 tests), the
   * software draws at `hd`'s scale as HD-4 did.
   */
  constructor(private readonly doc: Document, private readonly hd?: LoadingHd, private readonly gpu?: LoadingPanelGpu) {
    this.root = doc.createElement('div');
    this.root.id = 'original-loading';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    // Placed, letterboxed and sized by `./styles.css` (`#original-loading`): no inline style (the design system's rule).
    const canvas = this.canvas = doc.createElement('canvas');
    canvas.width = FRAME_W; canvas.height = FRAME_H;
    const ctx = canvas.getContext('2d');
    // HD-4: the canvas follows the frame's size (640 x 448 times the scale), as the in-match overlay's does.
    this.presenter = ctx ? new CpuUiPresenter(ctx, { fit: (w, h) => { if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } } }) : null;
    this.root.append(this.canvas);
    frameCanvas(this.canvas);   // OPT-11 (research 358): the loading screen is the game's picture too
    doc.body.append(this.root);
    // GM-23: the GPU canvas beside the panel's, in the same grid cell (`./styles.css`), opaque as the panel's frame is;
    // made when the switch asks `loading` of the GPU (`on` on the landed table since the flip, GM.R18), its
    // surface imported after the first software frame (GM.R15).
    const software = this.presenter;
    if (gpu && software) {
      this.gpuMount = UiGpuCanvasMount.make({
        doc, twin: canvas, resolveAt: gpu.resolveAt, label: 'loading screen', dataset: { loadingGpu: 'true' }, dev: gpu.dev === true,
        load: (c) => gpu.load({ canvas: c, software, shown: (w) => { this.gpuMount?.want(w); } }),
        ...(gpu.log ? { log: gpu.log } : {}),
        ...(gpu.load.ladder ? { ladder: gpu.load.ladder } : {}),   // GM-30: its software frames counted per surface
      });
    }
  }

  /** Cover immediately, before the worker has read the original bitmaps. */
  cover(): void { this.hide(); this.root.hidden = false; this.root.setAttribute('aria-hidden', 'false'); }

  show(screen: LoadingScreen): void {
    this.screen = screen;
    this.bitmaps = new Map(screen.bitmaps.map(([n, r]) => [n, loadingBitmap(r)]));
    this.sizes = Object.fromEntries(screen.bitmaps.map(([n, r]) => [n, { width: r.width, height: r.height }]));
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    if (this.gpuReleased) { this.gpuReleased = false; this.gpuMount?.returned(); }   // GM-23: the context asked back
    const win = this.doc.defaultView;
    this.started = win?.performance.now() ?? 0;
    const tick = (): void => {
      if (!this.screen) return;
      this.draw(((win?.performance.now() ?? 0) - this.started) / 1000);
      this.frame = win?.requestAnimationFrame?.(tick) ?? 0;
    };
    win?.cancelAnimationFrame?.(this.frame);
    tick();
  }

  hide(): void {
    this.screen = null;
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    this.doc.defaultView?.cancelAnimationFrame?.(this.frame);
    this.bitmaps = new Map();
    this.left = [];
    this.drawer = null;
    // GM-23: the screen's context let go while it is down (a match runs beside at most the overlay's), asked back at `show`.
    if (this.gpuMount && !this.gpuReleased) { this.gpuMount.release(); this.gpuReleased = true; }
  }

  /**
   * GM-09 (a test seam, a browser adaptation): the frame the panel shows (straight RGBA, top row first, at its scale),
   * read through its presenter; null while hidden, before its first frame, or with no 2D context.
   */
  readFrame(): Rgba | null {
    if (this.root.hidden || !this.presenter) return null;
    return (this.drawer ?? this.presenter).readFrame();
  }
  /** GM-09: what the last frame drawn left undrawn (`<node>: no bitmap <name>`, in draw order; empty while hidden). */
  undrawn(): readonly string[] { return this.root.hidden ? [] : this.left; }

  /** Draws the frame now, at the time since `show` (the page draws on every animation frame; the tests call it). */
  redraw(): void {
    this.draw(((this.doc.defaultView?.performance.now() ?? 0) - this.started) / 1000);
  }

  /** What is up (the tests'; not wired into the page's `stats()`: `./main` gains one call only). */
  stats(): { visible: boolean; map: string | null; picture: string | null; missing: string[] } {
    return { visible: !this.root.hidden, map: this.screen?.map ?? null, picture: this.screen?.binding?.picture ?? null, missing: this.screen?.missing ?? [] };
  }

  private draw(t: number): void {
    const presenter = this.presenter, screen = this.screen;
    if (!presenter || !screen) return;
    const o = this.hd?.();
    const scale = o?.scale !== undefined && Number.isInteger(o.scale) && o.scale > 1 ? o.scale : 1;
    // HD-4: the scale and the pack's lookup only over 1; the raster cache (a browser implementation cache) as handed.
    const options: RasterOptions = {};
    if (scale > 1) { options.scale = scale; if (o?.hd) options.hd = o.hd; }
    if (o?.quadCache) options.quadCache = o.quadCache;
    const items = loadingDrawList(loadingQuads({ screen, sizes: this.sizes, t }), this.sizes, loadingFaderAlpha(screen.fade, t));
    if (this.gpu) { this.gpuFrame(items, { ...options, scale }); return; }
    this.left = presenter.present(items, this.textures, options).undrawn;
    this.drawer = presenter;
  }

  /**
   * GM-23 (GM-28's rule, GM.R19): a frame with the GPU option given. The panel draws while a match loads, so the surface
   * adds no stall: it is prepared ahead (`prepare`: the context made and its links begun at the first frame after it
   * lands, polled only under `KHR_parallel_shader_compile`), and the frame goes to it -- with the HD options, which it
   * keeps only while it presents -- only once every program has linked. Until then, and on any path that is not the
   * surface's, the panel's own software draws the original 1x frame (`uiGpuFrontFrameOptions`). A browser whose links can
   * only be asked by a call that waits (`linkWaits`) keeps that 1x software for the session: the surface is let go.
   */
  private gpuFrame(items: UiDrawItem[], hd: RasterOptions & { scale: number }): void {
    const g = this.gpuMount;
    const gpu = g?.readyOn(hd.scale) ?? false;               // prepared, or let go for the session (`linkWaits`)
    const surface = gpu ? g!.surface : null;
    // Review fold 1: the HD options only where the surface's own mode presents (`hdOn`), else 1x even on the surface.
    const options = uiGpuFrontFrameOptions(hd, gpu && g!.hdOn(hd.scale));
    if (gpu && surface) {
      this.left = surface.present(items, this.textures, options).undrawn;
      this.drawer = surface;
    } else {
      this.left = this.presenter!.present(items, this.textures, options).undrawn;
      this.drawer = this.presenter;
    }
    this.gpuMount?.drawn(gpu);
    this.gpuMount?.commit();
  }
}

/**
 * The page's one call (`./main`): the panel, and its watch on the worker's answers. `wanted` is the page's wanted map
 * request id. The page explicitly calls watch.ready after scene and join readiness. The page's `cover()` puts a black
 * screen with no picture over every load at once; a screen with no layout (a source without `RUN/UI/READERC.ZAR`) adds
 * nothing to it -- the cover stays black until the page lets it go.
 */
export function attachLoadingScreen(worker: Worker, wanted: () => number, doc: Document): { panel: LoadingPanel; watch: LoadingWatch } {
  const panel = new LoadingPanel(doc);
  const watch = new LoadingWatch(wanted, panel, (s) => s.layout !== null, true);
  worker.addEventListener('message', (event: MessageEvent<ViewerResponse>) => watch.onMessage(event.data));
  worker.addEventListener('error', () => { watch.failed(); panel.hide(); });
  worker.addEventListener('messageerror', () => { watch.failed(); panel.hide(); });
  return { panel, watch };
}
