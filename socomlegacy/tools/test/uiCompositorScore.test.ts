import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, readZdbMember, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { PaletteTable, type Rgba } from '@s2u/gs';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { buildDialogScreen, composeScreen, findNode, loadDialog, readTextFaces } from '@s2u/ui';
import { decodeNamedTextures } from '../../packages/viewer/src/hudBitmaps';
import { flipRows } from '../../packages/viewer/src/hudAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { decodePng, rgbaToRgb, type Rgb } from '../captureImage';
import { judge, letterboxBox, resample, type Rect } from '../captureScore';

/**
 * PLAT-14's scored items (W7.R6; web research 112 §7), run through PLAT-30's scorer: a dialog built and composed by
 * `@s2u/ui`, drawn by the viewer's drawer with the disc's bitmaps and faces, scored against the PC project's
 * references. What the frame lacks is named, not padded: no script has run (ONSTART's shows and hides are the runtime's,
 * bound to the tree by PLAT-10), the BUTTON rows are PLAT-15's, the movie is black (PLAT-19b / PLAT-21). The numbers
 * are the record; a change to the drawing that moves one moves the note with it.
 *
 * Needs the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`) and the references (`SOCOM_PC_ROOT/scripts/parity/refs`);
 * skips without them.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const REFS = ROOT ? resolve(ROOT, 'scripts/parity/refs') : null;
const ready = DISC !== null && REFS !== null && existsSync(resolve(REFS, 'main_menu.png'));
const read = (p: string): Uint8Array => new Uint8Array(readFileSync(resolve(DISC ?? '', p)));

interface Library { has(name: string): boolean; decode(name: string): Rgba | null }
function library(txr: Uint8Array, pal: Uint8Array): Library {
  const t = Zar.parse(txr), palettes = PaletteTable.fromZars([Zar.parse(pal)]);
  const keys = new Map((t.find('textures')?.children ?? []).map((k) => [k.name.toLowerCase(), k]));
  const texdat = (n: string): Uint8Array | null => {
    const key = keys.get(n.toLowerCase());
    const child = key ? t.child(key, 'texdat') : undefined;
    return child ? t.data(child) : null;
  };
  return { has: (n) => keys.has(n.toLowerCase()), decode: (n) => decodeNamedTextures(texdat, palettes, [n]).textures[n] ?? null };
}

/**
 * A dialog drawn as built: its `LIBRARIES` (`ui/assetlib/<stem>` -> `RUN/UI/<STEM cut to 4>_TXR.ZED`, `FUN_003199c0`,
 * research 95 §5.1), UIMP (the titlebar face's atlas) and the font library (`FONT_TXR` in a map archive), each bitmap
 * flipped top row first; MENUFADER at 0, where `menu_fade_up` leaves it (research 115 §5).
 */
async function drawDialog(name: string): Promise<{ frame: Rgb; undrawn: string[]; hide: (n: string) => Rgb }> {
  const src = new FsAssetSource(DISC ?? '');
  const fz = Zar.parse(read(FONTS_RDR.archive));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const z = Zar.parse(read('RUN/UI/READERC.ZAR'));
  const design = loadDialog(parseRdr(z.data(z.find(name)!)));
  const libs: Library[] = [];
  for (const l of design.libraries) {
    if (!('name' in l)) continue;
    const stem = l.name.split('/').pop()!.slice(0, 4).toUpperCase();
    if (existsSync(resolve(DISC ?? '', `RUN/UI/${stem}_TXR.ZED`))) libs.push(library(read(`RUN/UI/${stem}_TXR.ZED`), read(`RUN/UI/${stem}_PAL.ZED`)));
  }
  libs.push(library(read('RUN/UI/UIMP_TXR.ZED'), read('RUN/UI/UIMP_PAL.ZED')));
  libs.push(library(await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_TXR.ZED'), await readZdbMember(src, 'RUN/MP2.ZDB', 'FONT_PAL.ZED')));
  const cache = new Map<string, Rgba | null>();
  const textures = (n: string): Rgba | null => {
    const k = n.toLowerCase();
    if (!cache.has(k)) {
      const got = libs.find((l) => l.has(n))?.decode(n) ?? null;
      cache.set(k, got ? flipRows(got) : null);
    }
    return cache.get(k)!;
  };
  const screen = buildDialogScreen(design, {
    face: (n) => faces.find((f) => f.name === n) ?? null, captions: service, hasTexture: (n) => libs.some((l) => l.has(n)),
  });
  screen.fader.opacity = 0;
  const draw = (): { frame: Rgb; undrawn: string[] } => {
    const r = rasterizeUiDrawList(composeScreen(screen), textures);
    return { frame: rgbaToRgb(640, 448, r.frame.data), undrawn: r.undrawn };
  };
  return { ...draw(), hide: (n) => { findNode(screen.root, n)!.visible = false; return draw().frame; } };
}

const png = (rel: string): Rgb => decodePng(new Uint8Array(readFileSync(resolve(REFS ?? '', rel))));
const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};
/** Our pixel-exact frame as PCSX2's 640x448 window shows it: the picture squeezed into the 4:3 box, bars black (W7.R7). */
const inPcsx2Window = (img: Rgb): Rgb => {
  const box = letterboxBox(640, 448);
  const pic = resample({ width: 640, height: 448, channels: 3, data: img.data }, Math.round(box[2] - box[0]), 448, 'bicubic');
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) out.data.set(pic.data.subarray(y * pic.width * 3, (y + 1) * pic.width * 3), (y * 640 + Math.round(box[0])) * 3);
  return out;
};

describe.skipIf(!ready)(`PLAT-14's scores against the parity references${ready ? '' : ' (no disc or no SOCOM_PC_ROOT refs)'}`, () => {
  it('dlgMenu as built against main_menu.png: the whole frame, and the logo with the rest masked', async () => {
    const { frame, undrawn, hide } = await drawDialog('dlgMenu.rdr');
    expect(undrawn).toEqual([
      'widget new_game_button (BUTTON)', 'widget load_game_button (BUTTON)', 'widget multiplayer_button (BUTTON)',
      'widget options_button (BUTTON)', 'widget Extras_button (BUTTON)', 'widget LAN_button (BUTTON)', 'widget SavedGames (LISTBOX)', 'models',
    ]);
    // main_menu.png is 320x224 -- the scorer's own grid, not a 640x448 PCSX2 window: no 4:3 correction (W7.R7).
    const golden = png('main_menu.png');
    expect([golden.width, golden.height]).toEqual([320, 224]);
    const whole = judge(golden, frame);
    expect([whole.score, whole.control, whole.matched]).toEqual([95.8, 60.2, true]);
    const logo: Rect[] = [[0, 0, 640, 45], [0, 240, 640, 448], [0, 45, 70, 240], [570, 45, 640, 240]];   // SplashLogo (70, 45) 500 x 195 left
    const masked = judge(golden, frame, { mask: logo });
    expect([masked.score, masked.control, masked.matched]).toEqual([98.1, 38.2, true]);
    // LoadGameBack (popup_bg.tif, the full frame) is what stands in the movie's place here; without it, black does.
    expect(judge(golden, hide('LoadGameBack')).score).toBe(79.4);
  });

  it('dlgMenu as built against PCSX2\'s full main-menu frame (640x448 window: the 4:3 correction) -- the block\'s bar', async () => {
    // The console's lit main menu (`scripts/parity/ref_main_menu_ours.pcsx2.png`, pinned in the PC project's
    // pins_refs.json; drive.py's per-target sibling; research 108 §4's control 63.8). Its three lit rows and its movie
    // are what our frame lacks (PLAT-15, PLAT-19b / PLAT-21); the score, like the 95.8, does not see the rows.
    const path = resolve(ROOT ?? '', 'scripts/parity/ref_main_menu_ours.pcsx2.png');
    if (!existsSync(path)) return;
    const { frame, hide } = await drawDialog('dlgMenu.rdr');
    const pcsx2 = decodePng(new Uint8Array(readFileSync(path)));
    expect([pcsx2.width, pcsx2.height]).toEqual([640, 448]);
    const corrected = judge(pcsx2, inPcsx2Window(frame));
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([97.1, 63.8, true]);
    expect(judge(pcsx2, frame).score).toBe(94.9);                                  // uncorrected
    const bare = judge(pcsx2, inPcsx2Window(hide('LoadGameBack')));
    expect([bare.score, bare.matched]).toEqual([80.7, false]);                     // popup_bg.tif carries the match
  });

  it('dlgCreateGame\'s title band against PCSX2\'s (640x448 window: the 4:3 correction) and the recompiled game\'s', async () => {
    const { frame } = await drawDialog('dlgCreateGame.rdr');
    const band: Rect = [20, 18, 360, 58];   // the PC project's TITLE box (tools_py/tests/fixtures/lobby/make_screen_fixtures.py)
    const pcsx2 = png('lobby/title_create_game.pcsx2.png'), recomp = png('lobby/title_create_game.png');
    const corrected = judge(pcsx2, crop(inPcsx2Window(frame), band));
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([98.1, 75.2, true]);   // 98.0 until BOOT-06 sent a quad's alpha as the GS's integer (research 141 §2)
    expect(judge(pcsx2, crop(frame, band)).score).toBe(88.2);              // uncorrected: the letterbox's 21 px and 0.933 show
    const own = judge(recomp, crop(frame, band));
    expect([own.score, own.control, own.matched]).toEqual([97.9, 73.9, true]);   // 97.8 before the same change
  });
});
