/**
 * SCREEN POSITION (the parked rows, b; OPT-12): VIDEO's SCREEN POSITION opens `dlgScreenAdjust.rdr`, whose d-pad scripts
 * step `ScreenOriginX` over 0..250 and `ScreenOriginY` over 80..250, one a press, from 128 (the disc's, pinned in
 * `test/originalOptions.test.ts`); `SetScreenOrigin` (`FUN_0027bf10` D:L125261-125278) and every `StoreOptions`
 * (D:L125255-125256) lay each less 128 on the GS DISPLAY register (D:L304788-304791). X goes into DX times `DAT_004a4500`,
 * in VCK -- 4 in mode 0, the 448-line NTSC mode (`FUN_003b14a0` D:L305384), four VCK a pixel at 640 wide, so **one frame
 * pixel a step** (a reading). Y goes into DY in raster lines -- one line of the 448 frame or two (a field's, interlaced) is
 * not read: `SCREEN_ORIGIN_Y_LINES_PLACEHOLDER`.
 */

/**
 * SCREEN_ORIGIN_Y_LINES_PLACEHOLDER (the merge controller's call, 2026-10-23): the frame lines one step of `ScreenOriginY`
 * moves the picture -- DY counts raster lines (D:L304791), but whether in interlaced frame mode a step is a line of the
 * 448 frame or of one field (two frame lines) is not read. Settles: the GS manual's DY definition for interlaced frame
 * mode, or a capture of the original with the origin moved. 1 meanwhile.
 */
export const SCREEN_ORIGIN_Y_LINES_PLACEHOLDER = 1;

/**
 * SCREEN_ORIGIN_ADAPTATION (a browser adaptation: the canvas has no GS DISPLAY register): the origin the card's valves hold
 * moves the drawn 640 x 448 frame inside its canvas -- the front end's (`#front-end`) and the match's (`#view`) -- by the
 * origin in frame pixels (X one a step, Y `SCREEN_ORIGIN_Y_LINES_PLACEHOLDER` lines a step) at the frame's drawn scale,
 * through two custom properties each canvas's `translate` reads (`styles.css`). Re-laid when the window's size changes.
 */
export const SCREEN_ORIGIN_ADAPTATION = 'the drawn frame translated by the origin, in frame pixels at the drawn scale' as const;

/**
 * The canvases the origin moves: the front end's, its GPU twin (`#front-end-gpu`, GM-12b `./uiGpuFront`: the same box,
 * the same origin), the test room's (`#view`) and the front end's match's (`./picture` MATCH_CANVAS_CLASS).
 */
export const SCREEN_ORIGIN_CANVASES = ['#front-end', '#front-end-gpu', '#view', 'canvas.s2u-match'] as const;

/** The frame's drawn scale in a box (`object-fit: contain` of 640 x 448). */
export function frameScale(box: { width: number; height: number }): number {
  return Math.min(box.width / 640, box.height / 448);
}

/** The origin (frame pixels, X; steps, Y) as CSS pixels in a box of that size. */
export function screenOriginPx(origin: { x: number; y: number }, box: { width: number; height: number }): { dx: number; dy: number } {
  const s = frameScale(box);
  return { dx: origin.x * s, dy: origin.y * SCREEN_ORIGIN_Y_LINES_PLACEHOLDER * s };
}

/** Lays `origin` on each canvas present (`SCREEN_ORIGIN_ADAPTATION`). */
export function layScreenOrigin(doc: Document, origin: { x: number; y: number }): void {
  for (const sel of SCREEN_ORIGIN_CANVASES) {
    const el = doc.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const { dx, dy } = screenOriginPx(origin, { width: r.width, height: r.height });
    el.style.setProperty('--s2u-origin-x', `${dx}px`);
    el.style.setProperty('--s2u-origin-y', `${dy}px`);
  }
}

/** The page's origin, kept: set by `SetScreenOrigin` and each store, re-laid on a resize and on demand (a canvas made later). */
export function screenOriginKeeper(doc: Document, win: Window | null) {
  let origin = { x: 0, y: 0 };
  const lay = (): void => layScreenOrigin(doc, origin);
  win?.addEventListener('resize', lay);
  return {
    set(x: number, y: number): void { origin = { x, y }; lay(); },
    lay,
    /** Re-laid two frames on: a canvas shown now (the match's, at the hand-over) has its size only once it is drawn. */
    layLater(): void { win?.requestAnimationFrame(() => win.requestAnimationFrame(lay)); },
    origin: (): { x: number; y: number } => ({ ...origin }),
    stop(): void { win?.removeEventListener('resize', lay); },
  };
}
