import type { Rgba } from '@s2u/gs';
import { loadingFaderAlpha } from '@s2u/ui/loading';
import type { ArmoryQuad, Rgb } from './armoryLayout';
import type { LoadingScreen } from './loadingAssets';
import { frameCanvas } from './brightness';
import { loadingQuads } from './loadingLayout';
import type { RasterOptions } from './uiCompositorView';
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
 * The frame is drawn on a 640x448 canvas, scaled whole to the window's height as the HUD's native presentation scales
 * the console frame (`./hud`), each quad MODULATE-tinted as `./armoryView` tints the dialogs' (texel x colour / 128,
 * alpha / 128), and over it, last as the foreplane is (research 112 R112.2), the fader: black at `loadingFaderAlpha`
 * -- the screen comes up from black over `OnMenuStart`'s 1.5 s and is taken down with no fade out
 * (`LOADING_FADE_READING`, research 125 §5). The overlay takes no pointer events: it never holds the page.
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

/** A bitmap's texels tinted by a quad's colour on the GS's scale (128 = 1.0), alpha kept. */
export function tintTexels(texels: Uint8ClampedArray, rgb: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(texels.length);
  const k = [rgb[0] / 128, rgb[1] / 128, rgb[2] / 128];
  for (let i = 0; i < texels.length; i += 4) {
    out[i] = Math.round(texels[i]! * k[0]!);
    out[i + 1] = Math.round(texels[i + 1]! * k[1]!);
    out[i + 2] = Math.round(texels[i + 2]! * k[2]!);
    out[i + 3] = texels[i + 3]!;
  }
  return out;
}

const FRAME_W = 640, FRAME_H = 448;

/**
 * HD-4 (OT.R92, HD.R8; a browser adaptation, only under HD (GoE Soul)): the frame's scale and the HD pack's lookup -- the
 * front end's menus' own (`./hdMenuTextures` `HdMenus.options`: one pack, one budget). The panel has no compositor: it
 * draws its quads through Canvas 2D, so under a scale the canvas is 640 x 448 times it with the same scale as its
 * transform (every quad's place in the frame unchanged), and a bitmap the pack replaces is drawn from its HD image, its
 * source rectangle in the HD image's texels. The lookup takes the panel's bitmaps as they are, top row first
 * (`./loadingAssets` `flipRows`), as the menus' are. Absent, or scale 1: the original drawing, call for call.
 */
export type LoadingHd = () => Pick<RasterOptions, 'scale' | 'hd'>;

/** The DOM panel: a canvas the size of the console frame, over the page. */
export class LoadingPanel implements LoadingSurface {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private screen: LoadingScreen | null = null;
  private bitmaps = new Map<string, Rgba>();
  private tinted = new Map<string, HTMLCanvasElement>();
  private sizes: Record<string, { width: number; height: number }> = {};
  private frame = 0;
  private started = 0;
  /** HD-4: the scale the canvas was last drawn at (1: the original's 640 x 448). */
  private scale = 1;

  constructor(private readonly doc: Document, private readonly hd?: LoadingHd) {
    this.root = doc.createElement('div');
    this.root.id = 'original-loading';
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
    // Placed, letterboxed and sized by `./styles.css` (`#original-loading`): no inline style (the design system's rule).
    this.canvas = doc.createElement('canvas');
    this.canvas.width = FRAME_W; this.canvas.height = FRAME_H;
    this.ctx = this.canvas.getContext('2d');
    this.root.append(this.canvas);
    frameCanvas(this.canvas);   // OPT-11 (research 358): the loading screen is the game's picture too
    doc.body.append(this.root);
  }

  /** Cover immediately, before the worker has read the original bitmaps. */
  cover(): void { this.hide(); this.root.hidden = false; this.root.setAttribute('aria-hidden', 'false'); }

  show(screen: LoadingScreen): void {
    this.screen = screen;
    this.bitmaps = new Map(screen.bitmaps);
    this.tinted = new Map();
    this.sizes = Object.fromEntries(screen.bitmaps.map(([n, r]) => [n, { width: r.width, height: r.height }]));
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
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
    this.tinted = new Map();
  }

  /** Draws the frame now, at the time since `show` (the page draws on every animation frame; the tests call it). */
  redraw(): void {
    this.draw(((this.doc.defaultView?.performance.now() ?? 0) - this.started) / 1000);
  }

  /** What is up (the tests'; not wired into the page's `stats()`: `./main` gains one call only). */
  stats(): { visible: boolean; map: string | null; picture: string | null; missing: string[] } {
    return { visible: !this.root.hidden, map: this.screen?.map ?? null, picture: this.screen?.binding?.picture ?? null, missing: this.screen?.missing ?? [] };
  }

  private draw(t: number): void {
    const ctx = this.ctx, screen = this.screen;
    if (!ctx || !screen) return;
    const o = this.hd?.();
    const scale = o?.scale !== undefined && Number.isInteger(o.scale) && o.scale > 1 ? o.scale : 1;
    if (scale !== this.scale) {
      // HD-4: the canvas at the scale and the frame's coordinates under it; back at 1, the original's canvas.
      this.scale = scale;
      this.canvas.width = FRAME_W * scale; this.canvas.height = FRAME_H * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    const lookup = scale > 1 ? o?.hd : undefined;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    for (const q of loadingQuads({ screen, sizes: this.sizes, t })) this.quad(ctx, q, lookup);
    // The fader (MENUFADER, G+0x170: 640x448, black; research 115 §1) over everything, as the foreplane draws last.
    const fader = loadingFaderAlpha(screen.fade, t);
    if (fader > 0) {
      ctx.globalAlpha = Math.min(1, fader / 128);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, FRAME_W, FRAME_H);
    }
  }

  private quad(ctx: CanvasRenderingContext2D, q: ArmoryQuad, lookup?: RasterOptions['hd']): void {
    if (lookup) { this.hdQuad(ctx, q, lookup); return; }
    const image = this.image(q.texture, q.rgb);
    if (!image) return;
    ctx.globalAlpha = Math.min(1, q.alpha / 128);
    const sw = q.u1 - q.u0, sh = q.v1 - q.v0;
    if (sw <= 0 || sh <= 0) return;
    ctx.drawImage(image, q.u0, q.v0, sw, sh, q.x, q.y, q.w, q.h);
  }

  /** HD-4: a quad under HD (GoE Soul): its bitmap's HD image when the pack has one (its texels' rectangle scaled to it), else the original. */
  private hdQuad(ctx: CanvasRenderingContext2D, q: ArmoryQuad, lookup: NonNullable<RasterOptions['hd']>): void {
    const original = this.bitmaps.get(q.texture);
    const hd = original ? lookup(original) : null;
    const image = hd ? this.image(q.texture, q.rgb, hd) : this.image(q.texture, q.rgb);
    if (!image || !original) return;
    ctx.globalAlpha = Math.min(1, q.alpha / 128);
    const sw = q.u1 - q.u0, sh = q.v1 - q.v0;
    if (sw <= 0 || sh <= 0) return;
    const kx = hd ? hd.width / original.width : 1, ky = hd ? hd.height / original.height : 1;
    ctx.drawImage(image, q.u0 * kx, q.v0 * ky, sw * kx, sh * ky, q.x, q.y, q.w, q.h);
  }

  private image(texture: string, rgb: Rgb, hd?: Rgba): HTMLCanvasElement | null {
    const key = `${texture}|${rgb.join(',')}${hd ? '|hd' : ''}`;
    const held = this.tinted.get(key);
    if (held) return held;
    const rgba = hd ?? this.bitmaps.get(texture);
    if (!rgba) return null;
    const c = this.doc.createElement('canvas');
    c.width = rgba.width; c.height = rgba.height;
    const g = c.getContext('2d');
    if (!g) return null;
    const data = new ImageData(rgba.width, rgba.height);
    data.data.set(tintTexels(rgba.data, rgb));
    g.putImageData(data, 0, 0);
    this.tinted.set(key, c);
    return c;
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
