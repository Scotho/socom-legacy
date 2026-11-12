import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FONTS_RDR } from '@s2u/scene';
import { decodePng, type Rgb } from '../captureImage';
import { drawDialog as drawOn } from './menuCaptureFrames';
import { menuCRow, scoreCRow } from './menuCaptureScore';

/**
 * PLAT-14's scored items (W7.R6; web research 112 §7), run through PLAT-30's scorer: a dialog built and composed by
 * `@s2u/ui`, drawn by the viewer's drawer with the disc's bitmaps and faces, scored against the PC project's
 * references. What the frame lacks is named, not padded: no script has run (ONSTART's shows and hides are the runtime's,
 * bound to the tree by PLAT-10), the BUTTON rows are PLAT-15's, the movie is black (PLAT-19b / PLAT-21). The numbers
 * are the record; a change to the drawing that moves one moves the note with it.
 *
 * Needs the disc (`SOCOM_DISC`, else `SOCOM_PC_ROOT/game/disc`) and the references (`SOCOM_PC_ROOT/scripts/parity/refs`);
 * skips without them. GM-11c: each score is a row of the one shared table (`menuCaptureScore.ts` `MENU_C_ROWS`), scored
 * by its function; the literals below are this scorer's own pins, unchanged by the move.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = [process.env.SOCOM_DISC, ROOT ? resolve(ROOT, 'game/disc') : undefined]
  .find((d) => d !== undefined && existsSync(resolve(d, FONTS_RDR.archive))) ?? null;
const REFS = ROOT ? resolve(ROOT, 'scripts/parity/refs') : null;
const ready = DISC !== null && REFS !== null && existsSync(resolve(REFS, 'main_menu.png'));
/** PLAT-14's dialog drawn as built (GM-11c: moved to `menuCaptureFrames.ts`, one frame for this scorer and the tool's test). */
const drawDialog = (name: string) => drawOn(DISC ?? '', name);

const png = (rel: string): Rgb => decodePng(new Uint8Array(readFileSync(resolve(REFS ?? '', rel))));
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
    const whole = scoreCRow(menuCRow('dlgMenu.main_menu.whole'), frame, golden);
    expect([whole.score, whole.control, whole.matched]).toEqual([95.8, 60.2, true]);
    // SplashLogo (70, 45) 500 x 195 left: the rest masked (the row's `mask`, `menuCaptureScore.ts` LOGO)
    const masked = scoreCRow(menuCRow('dlgMenu.main_menu.logo'), frame, golden);
    expect([masked.score, masked.control, masked.matched]).toEqual([98.1, 38.2, true]);
    // LoadGameBack (popup_bg.tif, the full frame) is what stands in the movie's place here; without it, black does.
    expect(scoreCRow(menuCRow('dlgMenu.main_menu.no_LoadGameBack'), hide('LoadGameBack'), golden).score).toBe(79.4);
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
    const corrected = scoreCRow(menuCRow('dlgMenu.pcsx2.corrected'), frame, pcsx2);
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([97.1, 63.8, true]);
    expect(scoreCRow(menuCRow('dlgMenu.pcsx2.uncorrected'), frame, pcsx2).score).toBe(94.9);   // uncorrected
    const bare = scoreCRow(menuCRow('dlgMenu.pcsx2.no_LoadGameBack'), hide('LoadGameBack'), pcsx2);
    expect([bare.score, bare.matched]).toEqual([80.7, false]);                     // popup_bg.tif carries the match
  });

  it('dlgCreateGame\'s title band against PCSX2\'s (640x448 window: the 4:3 correction) and the recompiled game\'s', async () => {
    const { frame } = await drawDialog('dlgCreateGame.rdr');
    // the band: the PC project's TITLE box (tools_py/tests/fixtures/lobby/make_screen_fixtures.py), the rows' `band`
    const pcsx2 = png('lobby/title_create_game.pcsx2.png'), recomp = png('lobby/title_create_game.png');
    const corrected = scoreCRow(menuCRow('dlgCreateGame.title.pcsx2.corrected'), frame, pcsx2);
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([98.1, 75.2, true]);   // 98.0 until BOOT-06 sent a quad's alpha as the GS's integer (research 141 §2)
    expect(scoreCRow(menuCRow('dlgCreateGame.title.pcsx2.uncorrected'), frame, pcsx2).score).toBe(88.2);   // uncorrected: the letterbox's 21 px and 0.933 show
    const own = scoreCRow(menuCRow('dlgCreateGame.title.recomp'), frame, recomp);
    expect([own.score, own.control, own.matched]).toEqual([97.9, 73.9, true]);   // 97.8 before the same change
  });
});
