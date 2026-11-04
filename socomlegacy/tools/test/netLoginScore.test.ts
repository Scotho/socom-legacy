import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { HAVE_DISC, DISC as RIG_DISC, netLoginRig, type NetLoginRigOptions } from '../../packages/ui/test/screens/netLoginRig';
import { decodePng, rgbToRgba, rgbaToRgb, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import { judge, letterboxBox, resample, toGrey, type Rect } from '../captureScore';

/**
 * ONL-01's score (OT.R4: "The DNAS and Login screen is important and must match the original"; web research 144 §7):
 * LOGIN TO SOCOM II ONLINE run through the whole front end on the disc -- the dialog built, its ONSTART and
 * OpenCardOne through the real command bodies, the one configuration listed, LOGIN lit -- drawn by PLAT-14's drawer
 * with the page's banks (`frontEndAssets.ts`) and PLAT-04's captions, and scored by PLAT-30's scorer against the
 * archived captures of the golden manifest's `online.login` row: the console's `A_31` (PCSX2, 640x480: the whole
 * frame with the 4:3 correction, and the configuration rows alone, W7.R7), the harness's title crop
 * `scripts/parity/refs/login.png` (the recomp's, 245x24 at the box of `refs.json`), and the recomp's own
 * `s17_q2_logoff/online1/00_login.png` (the `online.login.no-config` row's frame: the same screen with an empty list,
 * SELECT MEMORY CARD slot lit -- so "the rest" of the frame is scored with the rows and the lit rows masked).
 * `netcfg1/01_after_continue.png` and `netcfg2/01_2_DOWN.png` are not references (OT.R4). The second suite scores the
 * `online.login.no-config` row's console frame `A_06_login.png` (slot 1 empty, the popup continued) the same way. The numbers are the record:
 * a drawing change that moves one moves the note with it. Needs the disc and `SOCOM_PC_ROOT`'s captures; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const DISC = RIG_DISC;
const A31 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_31.png') : null;
const TITLE = ROOT ? resolve(ROOT, 'scripts/parity/refs/login.png') : null;
const RECOMP = ROOT ? resolve(ROOT, 'logs/parity/s17_q2_logoff/online1/00_login.png') : null;
const A06 = ROOT ? resolve(ROOT, 'logs/parity/s4_pcsx2/A_06_login.png') : null;
const ready = HAVE_DISC && A31 !== null && [A31, TITLE!, RECOMP!].every((p) => existsSync(p));
const readyA06 = HAVE_DISC && A06 !== null && existsSync(A06);
const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

/** ONSTART's `SuspendMenuInput(3.0)`, its 2-s WAIT and OpenCardOne: 3.1 s of ticks, then the lists' scroll settles. */
const SETTLED = 93 + 10;
/**
 * The harness's title box (`scripts/parity/refs/refs.json` `login.box`): x0, y0, x1, y1 of the frame converted to grey and
 * resized to 320 x 224 (PC `tools_py/parity/online_login_ours.py` L1147: `convert("L").resize((320, 224))`, PIL's default
 * BICUBIC), which is how `refs/login.png` (245 x 24) was cut.
 */
export const LOGIN_TITLE_BOX: Rect = [5, 8, 250, 32];
/** The configuration rows: `MainWindow` (25, 175) 590 x 140 below `Slot_title`, down to the HARDWARE line's row (`HWLIST` at y 313). */
export const LOGIN_ROWS_BAND: Rect = [25, 210, 615, 332];
/** What differs by state between the recomp's empty-list frame and ours: the help line, the four rows' lit states, the rows band. */
export const LOGIN_STATE_BANDS: readonly Rect[] = [[16, 76, 626, 100], [25, 105, 312, 172], LOGIN_ROWS_BAND, [25, 318, 312, 384]];

const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};
/** Everything but `keep` masked: the four rectangles around it. */
const allBut = ([x0, y0, x1, y1]: Rect): Rect[] => [[0, 0, 640, y0], [0, y1, 640, 448], [0, y0, x0, y1], [x1, y0, 640, y1]];
/** Our pixel-exact frame as PCSX2's 640x448 window shows it: the picture squeezed into the 4:3 box, bars black (W7.R7). */
const inPcsx2Window = (img: Rgb): Rgb => {
  const box = letterboxBox(640, 448);
  const pic = resample({ width: 640, height: 448, channels: 3, data: img.data }, Math.round(box[2] - box[0]), 448, 'bicubic');
  const out: Rgb = { width: 640, height: 448, data: new Uint8Array(640 * 448 * 3) };
  for (let y = 0; y < 448; y++) out.data.set(pic.data.subarray(y * pic.width * 3, (y + 1) * pic.width * 3), (y * 640 + Math.round(box[0])) * 3);
  return out;
};
/** The harness's view of a 640 x 448 frame: grey, 320 x 224 (bicubic), as an RGB image for the scorer. */
const harnessGrey = (img: Rgb): Rgb => {
  const g = resample(toGrey(img), 320, 224, 'bicubic');
  const data = new Uint8Array(g.width * g.height * 3);
  for (let i = 0; i < g.width * g.height; i++) { data[i * 3] = g.data[i]!; data[i * 3 + 1] = g.data[i]!; data[i * 3 + 2] = g.data[i]!; }
  return { width: g.width, height: g.height, data };
};
/** The share of pixels equal in both frames, to four places (the pixel-exact bar, reported as a number). */
const exact = (a: Rgb, b: Rgb): number => {
  let same = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) if (a.data[i * 3] === b.data[i * 3] && a.data[i * 3 + 1] === b.data[i * 3 + 1] && a.data[i * 3 + 2] === b.data[i * 3 + 2]) same++;
  return Math.round((same / n) * 10_000) / 10_000;
};

/** The disc's faces, the MP2 captions and the UIMP bank: what a drawn LOGIN frame needs. */
async function drawnRig(o: NetLoginRigOptions = {}) {
  const src = new FsAssetSource(DISC);
  const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const banks = pageUiTextures(src, ['UIMP']);
  expect(await banks.ready).toEqual([]);
  const t = netLoginRig({ ...o, face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
  const draw = (): { frame: Rgb; undrawn: string[] } => {
    const r = rasterizeUiDrawList(t.last(), banks.textures);
    return { frame: rgbaToRgb(640, 448, r.frame.data), undrawn: r.undrawn };
  };
  return { t, draw };
}

/** LOGIN's settled frame off the disc: the rig's draw list through the drawer with the page's banks. */
async function loginFrame(): Promise<{ frame: Rgb; undrawn: string[] }> {
  const { t, draw } = await drawnRig();
  t.run(1 + SETTLED);
  expect(t.notImplemented()).toEqual([]);
  expect(t.focused()).toBe('login_btn');
  return draw();
}

describe.skipIf(!ready)(`ONL-01's scores against the LOGIN captures${ready ? '' : ' (no disc or no SOCOM_PC_ROOT captures)'}`, () => {
  it('LOGIN with "1 Setting 1" and the HARDWARE line, LOGIN lit: against A_31 (4:3 corrected), the title crop and the recomp\'s frame', async () => {
    const { frame, undrawn } = await loginFrame();
    expect(undrawn).toEqual(['models']);                             // no bitmap or glyph is left undrawn; the 3D pass is not this drawer's
    if (process.env.ONL01_SCORE_OUT) { mkdirSync(process.env.ONL01_SCORE_OUT, { recursive: true }); writeFileSync(resolve(process.env.ONL01_SCORE_OUT, 'login_ours.png'), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
    // The console's frame (PCSX2, 640x480; the 4:3 correction, W7.R7): the whole frame, then the configuration rows alone.
    const a31 = png(A31!);
    expect([a31.width, a31.height]).toEqual([640, 480]);
    const whole = judge(a31, inPcsx2Window(frame), { pcsx2Letterbox: false });
    const corrected = judge(a31, frame, { pcsx2Letterbox: true });
    const rows = judge(a31, frame, { pcsx2Letterbox: true, mask: allBut(LOGIN_ROWS_BAND) });
    console.info(`A_31 whole (our frame in the window) ${JSON.stringify(whole)}; corrected ${JSON.stringify(corrected)}; rows ${JSON.stringify(rows)}`);
    // The harness's title crop (the recomp's, 245 x 24 at the box of refs.json): pixel-exact is the proven bar.
    const title = png(TITLE!);
    expect([title.width, title.height]).toEqual([245, 24]);
    const ourTitle = crop(harnessGrey(frame), LOGIN_TITLE_BOX);
    const titled = judge(title, ourTitle);
    console.info(`title crop ${JSON.stringify(titled)}; exact ${exact(title, ourTitle)}`);
    // The recomp's own frame of the screen (640 x 448, its list empty and SELECT MEMORY CARD slot lit): the whole
    // frame, then the rest with what differs by state masked.
    const recomp = png(RECOMP!);
    expect([recomp.width, recomp.height]).toEqual([640, 448]);
    const all = judge(recomp, frame);
    const rest = judge(recomp, frame, { mask: LOGIN_STATE_BANDS });
    console.info(`recomp whole ${JSON.stringify(all)}; rest ${JSON.stringify(rest)}; exact ${exact(recomp, frame)}`);
    // The record (the numbers are pinned; a drawing change moves them with the note).
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([99.8, 67.1, true]);
    expect([rows.score, rows.control, rows.matched]).toEqual([99.8, 47.4, true]);
    expect([titled.score, titled.control, titled.matched, exact(title, ourTitle)]).toEqual([94.4, 70.8, true, 0.359]); // exact 0.3546 -> 0.359 at BOOT-06 (the glyph's colour words as packed bytes, research 141 §2)
    expect([all.score, all.control, all.matched]).toEqual([94.9, 69.9, true]);
    expect([rest.score, rest.control, rest.matched]).toEqual([99.4, 82.6, true]);
    expect(exact(recomp, frame)).toBe(0.1354);                       // 0.1352 -> 0.1354 at BOOT-06 (the packed glyph colour)                        // the pixel-exact bar (N20) is not reached: §7 says where
  }, 180_000);
});

describe.skipIf(!readyA06)(`the no-configuration state against A_06${readyA06 ? '' : ' (no disc or no SOCOM_PC_ROOT capture)'}`, () => {
  /**
   * The `online.login.no-config` row's console frame (`A_06_login.png`, PCSX2 640 x 480): LOGIN TO SOCOM II ONLINE on
   * slot 1 with a card that holds no configuration -- the list empty under "MEMORY CARD slot 1", the HARDWARE line
   * blank, LOGIN and SELECT disabled, EDIT NETWORK CONFIGURATIONS lit with its help line (#583), slot 1 checked. The port
   * reaches it as the console did: `OpenCardOne` on an empty `mc0:` raises the no-configuration popup (#578 / #581,
   * `A_05`), CONTINUE (`SitHere`) activates EDIT NETWORK CONFIGURATIONS. On the page slot 1 is empty only when the
   * first-use write failed (research 144 §6); the rig hands the empty list directly.
   */
  it('slot 1 empty, the popup continued: EDIT NETWORK CONFIGURATIONS lit, against A_06 (4:3 corrected) and its rows', async () => {
    const { t, draw } = await drawnRig({ lists: { 'mc0:': { result: 0, entries: [] }, 'mc1:': { result: 0, entries: [] } } });
    t.run(1 + SETTLED);
    const g = t.m.shell()!;
    expect(g.popups.shown(g.screen)).toBe(true);                     // #581 over the dimmed screen, as A_05
    t.press('CROSS', 8);                                             // CONTINUE
    expect(g.popups.shown(g.screen)).toBe(false);
    t.run(30);
    expect(t.notImplemented()).toEqual([]);
    expect(t.focused()).toBe('configureBtn');
    expect([t.text('DescriptionText'), t.text('Slot_title')]).toEqual(['¦ Edit your NETWORK CONFIGURATIONS.', 'MEMORY CARD slot 1']);   // #583 (¦ the CROSS glyph), #559: A_06's help and slot lines
    const { frame, undrawn } = draw();
    expect(undrawn).toEqual(['models']);
    if (process.env.ONL01_SCORE_OUT) { mkdirSync(process.env.ONL01_SCORE_OUT, { recursive: true }); writeFileSync(resolve(process.env.ONL01_SCORE_OUT, 'login_noconfig_ours.png'), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
    const a06 = png(A06!);
    expect([a06.width, a06.height]).toEqual([640, 480]);
    const corrected = judge(a06, frame, { pcsx2Letterbox: true });
    const rows = judge(a06, frame, { pcsx2Letterbox: true, mask: allBut(LOGIN_ROWS_BAND) });
    console.info(`A_06 corrected ${JSON.stringify(corrected)}; rows ${JSON.stringify(rows)}`);
    // The record: the state the console shows, met; a drawing change moves the note with it. 98.1 at sprint 11's close
    // (2026-10-03), 99.8 since FOCUS-RING (the same day): until then the build's focus rested on the IMAGE `MainWindow`,
    // LOGIN was disabled before it was ever activated, its ONACTIVATE (`OnLoginactive`: the title, #568) never ran and
    // this frame had no title; `A_06` shows the title. The build now activates LOGIN, the first enabled control
    // (research 116 §17), as the console's frame says the original does.
    expect([corrected.score, corrected.control, corrected.matched]).toEqual([99.8, 67.7, true]);
    expect([rows.score, rows.control, rows.matched]).toEqual([99.8, 48.1, true]);
  }, 180_000);
});
