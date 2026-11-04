import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { UI_TICK_SECONDS } from '@s2u/ui';
import { FrontEndSession, readFrontEndDisc } from '../../packages/viewer/src/frontEnd';
import { withMenuArt } from '../../packages/viewer/src/menuArt';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge, letterboxBox, resample } from '../captureScore';
import { menuloopMask } from '../menuloopMask';

/**
 * MENU-02a's capture acceptance (web research 140 §5): `dlgMenu` drawn by the page's path -- `FrontEndSession` on the
 * disc's dialogs, sets, faces, bitmaps, the roller's model and the strings (`withMenuArt`), the scripts run 2.5 s past
 * the build (SetMenuValve's fade over, NEW GAME lit on the empty card, the arrows mid-pulse) -- scored by PLAT-30's
 * `judge` against the console's main menu: `logs/parity/s4_pcsx2/A_04.png` (640 x 480, the 4:3 picture whole: the
 * scorer squeezes it onto its grid) and `scripts/parity/ref_main_menu_ours.pcsx2.png` (640 x 448, the picture
 * letterboxed in the window: the 4:3 correction, `letterboxBox`), both rows of the manifest's `menu.main`.
 *
 * The MENULOOP movie is not decoded here (no built wasm in Node; the page's source placeholder), so the frame is black
 * where the movie would show. "The MENULOOP region masked" (the block's acceptance) is read as the 32 x 32 blocks of our
 * frame that hold no lit pixel -- where nothing of the dialog draws, so only the movie would -- computed from the frame
 * (`menuloopMask`), never hand-picked; inside the dialog's own blocks the movie still shows through and counts against
 * us. The numbers are pinned beside the bar: one under 90 is recorded as under 90, with its cause (W9.R8). The same
 * frame with MENULOOP decoded in Node is `mainMenuMovie.test.ts`'s (96.0 / 95.7 masked: both met).
 *
 * Skips without the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`); the capture test skips, naming the file,
 * without a capture under `SOCOM_PC_ROOT`.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, 'RUN/UI/READERC.ZAR')) && existsSync(resolve(d, 'RUN/UI/UI_GEO.ZED'))) ?? null;
const A04 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_04.png') : null;
const REF = ROOT ? resolve(ROOT, 'scripts/parity/ref_main_menu_ours.pcsx2.png') : null;
const has = (p: string | null): p is string => p !== null && existsSync(p);

/** The walk's eight states as `logs/parity/runs/menu_explore` holds them: s01 before the first DOWN, s08 after the seventh. */
const WALK = ['new', 'online', 'lan', 'options', 'extras', 'load', 'new', 'online'] as const;
const WALK_PNG = (k: number): string | null => (ROOT ? resolve(ROOT, `logs/parity/runs/menu_explore/s0${k}_${k === 8 ? 'none' : 'DOWN'}.png`) : null);

/**
 * `dlgMenu` through the page's path (`FrontEndSession` on the disc with `withMenuArt`), ticked by PLAT-12's clock; a
 * frame grabbed through the session's renderer; a DOWN pressed for one frame through PLAT-11's source, as the ui
 * tests drive it (`FrontEndSession.press` is the opener's step-4 tap, which `dlgMenu`'s buttons do not read:
 * research 140 §7).
 */
function menuSession() {
  let s: FrontEndSession;
  let now = 0;
  const tick = (n: number): void => { for (let i = 0; i < n; i++) { now += UI_TICK_SECONDS * 1000; s.advance(now); } };
  const grab = (): { frame: Rgb; undrawn: string[]; lit: string[] } => {
    let frame: Rgb | null = null;
    const r = s.render({ createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img) => { frame = rgbaToRgb(img.width, img.height, img.data); } });
    const lit = s.machine.shell()!.screen.models[0]!.parts.filter((p) => p.active && p.name.endsWith('_on')).map((p) => p.name);
    return { frame: frame!, undrawn: r.undrawn, lit };
  };
  const press = (name: 'DOWN' | 'UP'): void => {
    let frames = 0;
    s.input.source = { read: () => ({ down: new Set(frames++ === 0 ? [name] : []), stickX: 0, stickY: 0 }) };
    tick(1);
    s.input.source = { read: () => ({ down: new Set(), stickX: 0, stickY: 0 }) };
  };
  return {
    async open(): Promise<void> {
      const src = new FsAssetSource(DISC!);
      const disc = await withMenuArt(src, await readFrontEndDisc(src));
      s = new FrontEndSession({ disc, startDialog: 'dlgMenu.rdr', loader: false });
    },
    tick, grab, press,
  };
}

/** The frame 2.5 s into `dlgMenu` through the page's path (75 ticks of PLAT-12's). */
async function menuFrame(): Promise<{ frame: Rgb; undrawn: string[]; lit: string[] }> {
  const s = menuSession();
  await s.open();
  s.tick(75);
  return s.grab();
}

const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));
/** Our frame as PCSX2's 640 x 448 window shows it: squeezed into the 4:3 box, bars black (W7.R7; `uiCompositorScore.test.ts`). */
const inPcsx2Window = (img: Rgb): Rgb => {
  const box = letterboxBox(640, 448);
  const pic = resample({ width: 640, height: 448, channels: 3, data: img.data }, Math.round(box[2] - box[0]), 448, 'bicubic');
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) out.data.set(pic.data.subarray(y * pic.width * 3, (y + 1) * pic.width * 3), (y * 640 + Math.round(box[0])) * 3);
  return out;
};

describe.skipIf(DISC === null)(`the main menu's frame through the page's path${DISC === null ? ' (no disc)' : ''}`, () => {
  let got: Awaited<ReturnType<typeof menuFrame>>;
  beforeAll(async () => { got = await menuFrame(); }, 120_000);

  it('draws every bitmap, glyph and the roller (nothing undrawn); NEW GAME lit; the MENULOOP mask covers the frame\'s unlit blocks only', () => {
    expect(got.undrawn).toEqual([]);
    expect(got.lit).toEqual(['new_on']);
    const mask = menuloopMask(got.frame);
    expect(mask.length).toBeGreaterThan(100);
    expect(mask.length).toBeLessThan(200);
    // The logo's, the items' and the legalese's blocks are never masked.
    for (const [x, y] of [[320, 96], [320, 320], [320, 416]] as const) expect(mask.some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1), `${x},${y}`).toBe(false);
  });

  it.skipIf(!has(A04))('against PCSX2\'s A_04 (640 x 480, the picture whole): >= 90 with the MENULOOP masked; the whole frame recorded under it (the movie black here)', () => {
    const golden = png(A04!);
    expect([golden.width, golden.height]).toEqual([640, 480]);
    const masked = judge(golden, got.frame, { mask: menuloopMask(got.frame) });
    expect(masked.score).toBeGreaterThanOrEqual(90);
    expect([masked.score, masked.control, masked.matched]).toEqual([91.1, 41.6, true]);
    const whole = judge(golden, got.frame);
    expect([whole.score, whole.control, whole.matched]).toEqual([81.9, 58.7, false]);      // under the bar: the movie's dark brown vs our black
  });

  it.skipIf(!has(REF))('against ref_main_menu_ours.pcsx2.png (640 x 448 window: the 4:3 correction): under 90 even masked, recorded as such -- the movie\'s rig and sky show through the dialog\'s own blocks', () => {
    const golden = png(REF!);
    expect([golden.width, golden.height]).toEqual([640, 448]);
    const ours = inPcsx2Window(got.frame);
    const masked = judge(golden, ours, { mask: menuloopMask(got.frame) });
    expect([masked.score, masked.control, masked.matched]).toEqual([86.9, 44, false]);
    const whole = judge(golden, ours);
    expect([whole.score, whole.control, whole.matched]).toEqual([83.9, 63.8, false]);
  });
});

describe.skipIf(DISC === null || !has(WALK_PNG(1)))(`the DOWN walk through the page's path against the archived menu_explore run${DISC === null ? ' (no disc)' : !has(WALK_PNG(1)) ? ' (no logs/parity/runs/menu_explore)' : ''}`, () => {
  /**
   * `scripts/parity/menu_explore.txt` on the recompiled game (2026-09-10; `logs/parity/runs/menu_explore`, 640 x 448 the
   * picture whole, so no 4:3 box): a capture before each press, seven DOWNs 1.5 s apart (`stable+1.5:DOWN`). Ours: the
   * frame at 2.5 s, then each DOWN for one frame and 1.5 s on; each step scored with its own frame's MENULOOP mask. The
   * score does not tell the roller's faces apart (research 140 §5: a frame stuck on NEW GAME still scored 92.1 masked
   * against the LAN-lit s03), so the face is held by `lit`, the score by the pin; a step under 90 is pinned under 90
   * with its cause in the note, never rounded (W9.R8).
   */
  const steps: { lit: string[]; score: number; control: number; matched: boolean; masked: number }[] = [];
  beforeAll(async () => {
    const s = menuSession();
    await s.open();
    s.tick(75);
    for (let k = 1; k <= 8; k++) {
      if (k > 1) { s.press('DOWN'); s.tick(45); }
      const got = s.grab();
      expect(got.undrawn, `s0${k}`).toEqual([]);
      const mask = menuloopMask(got.frame);
      const j = judge(png(WALK_PNG(k)!), got.frame, { mask });
      steps.push({ lit: got.lit, score: j.score, control: j.control, matched: j.matched, masked: mask.length });
    }
  }, 180_000);

  it('lights NEW GAME, ONLINE, LAN, OPTIONS, EXTRAS, LOAD GAME, NEW GAME, ONLINE (M3; s01..s08)', () => {
    expect(steps.map((x) => x.lit)).toEqual(WALK.map((w) => [`${w}_on`]));
  });

  it('scores each step masked against its capture: the pins (the steps under 90 are the movie\'s brighter moments inside the dialog\'s blocks, research 140 §5)', () => {
    expect(steps.map((x) => [x.score, x.control, x.matched, x.masked])).toEqual([
      [90, 41.4, true, 149],      // s01 NEW GAME
      [89.1, 42.2, false, 153],   // s02 ONLINE: under by 0.9
      [95.7, 46.2, true, 155],    // s03 LAN
      [90, 43.9, true, 153],      // s04 OPTIONS
      [86.3, 42.3, false, 151],   // s05 EXTRAS
      [82.5, 39.7, false, 149],   // s06 LOAD GAME
      [82.8, 39.3, false, 149],   // s07 NEW GAME again: the same face as s01's 90.0 -- the movie, not the roller
      [81.4, 40.7, false, 153],   // s08 ONLINE again
    ]);
  });
});

