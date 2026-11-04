import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { DISC, HAVE_DISC, worldRig } from '../../packages/ui/test/screens/worldOfSocomRig';
import { decodePng, rgbToRgba, rgbaToRgb, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import { judge, resample, toGrey, type Judged, type Rect } from '../captureScore';

/**
 * ONL-09's scores (web research 158 §5; the golden manifest's rows `online.server-news` and `online.menu`): SOCOM II
 * ONLINE (`dlgWorldOfSOCOM.rdr`) run through the front end on the disc -- the dialog built from `RUN/UI/READERC.ZAR`
 * and `RUN/UIZANIM.ZAR` with the session's modules in PLAT-08's host (`worldOfSocomRig.ts`), its texts from fake
 * services answering as the match server does -- drawn by PLAT-14's drawer with the page's banks (`frontEndAssets.ts`)
 * and the disc's faces and MP2 captions, and scored by PLAT-30's scorer against the rows' captures:
 *
 * - SERVER NEWS up: the console's `A_44_lobby.png` (PCSX2 against our local Horizon, 640 x 480, the 4:3 correction,
 *   W7.R7), the recomp's `s17_q2_logoff/online1/09_lobby.png` (640 x 448, N20) and the harness's caption crop
 *   `scripts/parity/refs/lobby_news.png` (72 x 12 at `refs.json`'s `lobby_news` box);
 * - the menu, MESSAGES lit: `A_45_lobby2.png` and the recomp's `09_lobby_no_news.png`.
 *
 * Each frame is scored against its own state's capture, never another's (W9.R8). Two regions differ from the captures
 * for reasons that are not the drawing's, so each frame is scored apart, never folded into one number:
 *
 * - **The news text** (`NEWS_TEXT_REGION` in the popup, `MESSAGES_TEXT_REGION` in the pane): the captures show our
 *   Horizon's announcement; the port's match server serves SVC-04's store's latest, none on a fresh server -- an empty
 *   text (the owner's to write: H73). So the **chrome** is scored with the text region masked, the **text region
 *   alone** with the fresh server's empty text (the difference reported, not met), and the text region alone with the
 *   capture's own announcement served -- which measures the WRAPPEDTEXT's drawing, not the port's text.
 * - **The medal** (`MEDAL_REGION`, left of the persona's name): the captures show `Medal_Black`, which this dialog
 *   shows on `ON_LADDER_REFRESH` when Horizon answers the ladder (research 155 §3). The ladder is parked: the port
 *   draws no medal, as the original draws a player with no ladder answer. Masked in the chrome, scored alone, not met;
 *   its decode is ONL-34's.
 *
 * The persona's name is the test's (`PLAYERNAMEVAR`, set to each capture's persona). The numbers are the record: a
 * drawing change that moves one moves the note with it. Needs the disc and `SOCOM_PC_ROOT`'s captures; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const cap = (p: string): string | null => (ROOT ? resolve(ROOT, p) : null);
const A44 = cap('logs/parity/s4_pcsx2/A_44_lobby.png'), A45 = cap('logs/parity/s4_pcsx2/A_45_lobby2.png');
const NEWS = cap('logs/parity/s17_q2_logoff/online1/09_lobby.png'), MENU = cap('logs/parity/s17_q2_logoff/online1/09_lobby_no_news.png');
const CROP = cap('scripts/parity/refs/lobby_news.png');
const ready = HAVE_DISC && [A44, A45, NEWS, MENU, CROP].every((p) => p !== null && existsSync(p));
const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

/** ONSTART's eight animations, the queue's two activations and `menu_fade_up`. */
const SETTLED = 90;
/** After CROSS on the popup: `popup_motd_response`, MESSAGES' activation, then the row's glow at this phase. */
const MENU_SETTLE = 30;
/** `popup_motd_text` (135, 163 in the frame), WIDTH 400, HEIGHT 197: from above its first line to the box's foot, inside the panel. */
export const NEWS_TEXT_REGION: Rect = [130, 132, 540, 344];
/** `motd` (205, 125), WIDTH 390, HEIGHT 99: from above its first line down to the "Clan messages" band. */
export const MESSAGES_TEXT_REGION: Rect = [196, 96, 600, 198];
/** The five `Medal_*` images, children of `playername` (45, 432) at (-23, -23), 16 x 16, with a margin. */
export const MEDAL_REGION: Rect = [16, 403, 44, 431];
/** The harness's caption box (`scripts/parity/refs/refs.json` `lobby_news.box`), on the frame grey at 320 x 224. */
export const LOBBY_NEWS_BOX: Rect = [128, 47, 200, 59];
/** The persona and the announcement each capture set shows (the server's configuration of its day: `MLS.cs:356-399` composes title, "\n", body, "\n"). */
const S4 = { persona: 'socomp', text: 'Horizon Medius Server\nSource available on GitHub\n' } as const;
const S17 = { persona: 'socomc', text: 'Welcome to the SOCOM Unzipped Project\nHorizon Medius Server\nSource available on GitHub\n' } as const;
/** A fresh match server's announcement: none in SVC-04's store, a success with an empty text (`serverTexts.ts` `announcement()`). */
const FRESH = '';

const allBut = ([x0, y0, x1, y1]: Rect): Rect[] => [[0, 0, 640, y0], [0, y1, 640, 448], [0, y0, x0, y1], [x1, y0, 640, y1]];
const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};
const harnessGrey = (img: Rgb): Rgb => {
  const g = resample(toGrey(img), 320, 224, 'bicubic');
  const data = new Uint8Array(g.width * g.height * 3);
  for (let i = 0; i < g.width * g.height; i++) { data[i * 3] = g.data[i]!; data[i * 3 + 1] = g.data[i]!; data[i * 3 + 2] = g.data[i]!; }
  return { width: g.width, height: g.height, data };
};
const triple = (j: Judged): [number, number, boolean] => [j.score, j.control, j.matched];

async function drawnRig(persona: string, announcement: string) {
  const src = new FsAssetSource(DISC);
  const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const banks = pageUiTextures(src);
  expect(await banks.ready).toEqual([]);
  const t = worldRig({ name: persona, announcement, face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
  const draw = (name: string): Rgb => {
    const r = rasterizeUiDrawList(t.last(), banks.textures);
    expect(r.undrawn, name).toEqual(['models']);                      // no bitmap or glyph is left undrawn; the 3D pass is not this drawer's
    const frame = rgbaToRgb(640, 448, r.frame.data);
    const out = process.env.ONL09_SCORE_OUT;
    if (out) { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, `${name}.png`), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
    return frame;
  };
  return { t, draw };
}

/** The two frames of one run: SERVER NEWS up on arrival, then the menu after CROSS. */
async function frames(label: string, persona: string, announcement: string): Promise<{ news: Rgb; menu: Rgb }> {
  const { t, draw } = await drawnRig(persona, announcement);
  await t.settle(SETTLED);
  expect([t.current(), t.focused(), t.node('popup_motd')!.visible]).toEqual(['dlgWorldOfSOCOM.rdr', 'popup_motd_button', true]);
  const news = draw(`${label}_news`);
  t.press('CROSS', MENU_SETTLE);
  expect([t.focused(), t.node('popup_motd')!.visible, t.node('invitations')!.visible]).toEqual(['newsandmessages', false, true]);
  const menu = draw(`${label}_menu`);
  return { news, menu };
}

interface Ways { whole: Judged; chrome: Judged; text: Judged; medal: Judged }
/** One frame against a full-frame reference: whole, the chrome (text and medal masked), the text region alone, the medal alone. */
function ways(ref: Rgb, frame: Rgb, text: Rect, pcsx2: boolean): Ways {
  const o = { pcsx2Letterbox: pcsx2 };
  return {
    whole: judge(ref, frame, o), chrome: judge(ref, frame, { ...o, mask: [text, MEDAL_REGION] }),
    text: judge(ref, frame, { ...o, mask: allBut(text) }), medal: judge(ref, frame, { ...o, mask: allBut(MEDAL_REGION) }),
  };
}
const show = (label: string, w: Ways): [number, number, boolean][] => {
  console.info(`${label}: whole ${JSON.stringify(triple(w.whole))}; chrome ${JSON.stringify(triple(w.chrome))}; text ${JSON.stringify(triple(w.text))}; medal ${JSON.stringify(triple(w.medal))}`);
  return [triple(w.whole), triple(w.chrome), triple(w.text), triple(w.medal)];
};
const console480 = (p: string): Rgb => { const g = png(p); expect([g.width, g.height]).toEqual([640, 480]); return g; };
const recomp448 = (p: string): Rgb => { const g = png(p); expect([g.width, g.height]).toEqual([640, 448]); return g; };

describe.skipIf(!ready)(`ONL-09's scores against the SOCOM II ONLINE captures${ready ? '' : ' (no disc or no SOCOM_PC_ROOT captures)'}`, () => {
  it("a fresh server's empty announcement, against the recomp's 09_lobby.png and 09_lobby_no_news.png: the chrome met, the text and the medal apart", async () => {
    const f = await frames('s17_fresh', S17.persona, FRESH);
    const news = show('09_lobby (SERVER NEWS)', ways(recomp448(NEWS!), f.news, NEWS_TEXT_REGION, false));
    const menu = show('09_lobby_no_news (the menu)', ways(recomp448(MENU!), f.menu, MESSAGES_TEXT_REGION, false));
    expect(news).toEqual(RECORD.s17Fresh.news);
    expect(menu).toEqual(RECORD.s17Fresh.menu);
  }, 240_000);

  it("a fresh server's empty announcement, against the console's A_44 and A_45 (PCSX2, 4:3 corrected)", async () => {
    const f = await frames('s4_fresh', S4.persona, FRESH);
    const news = show('A_44 (SERVER NEWS)', ways(console480(A44!), f.news, NEWS_TEXT_REGION, true));
    const menu = show('A_45 (the menu)', ways(console480(A45!), f.menu, MESSAGES_TEXT_REGION, true));
    expect(news).toEqual(RECORD.s4Fresh.news);
    expect(menu).toEqual(RECORD.s4Fresh.menu);
  }, 240_000);

  it("the captures' own announcements served (Horizon's of each day): the text regions measure the WRAPPEDTEXT's drawing; the caption crop", async () => {
    const s17 = await frames('s17_horizon', S17.persona, S17.text);
    const s4 = await frames('s4_horizon', S4.persona, S4.text);
    const out = {
      s17News: show('09_lobby, its own text', ways(recomp448(NEWS!), s17.news, NEWS_TEXT_REGION, false)),
      s17Menu: show('09_lobby_no_news, its own text', ways(recomp448(MENU!), s17.menu, MESSAGES_TEXT_REGION, false)),
      s4News: show('A_44, its own text', ways(console480(A44!), s4.news, NEWS_TEXT_REGION, true)),
      s4Menu: show('A_45, its own text', ways(console480(A45!), s4.menu, MESSAGES_TEXT_REGION, true)),
    };
    const ref = png(CROP!);
    expect([ref.width, ref.height]).toEqual([72, 12]);
    const caption = judge(ref, crop(harnessGrey(s17.news), LOBBY_NEWS_BOX));
    console.info(`lobby_news crop ${JSON.stringify(triple(caption))}`);
    expect(out).toEqual(RECORD.horizon);
    expect(triple(caption)).toEqual(RECORD.caption);
  }, 360_000);
});

/** The record (2026-10-03): [score, black control, matched] for the whole frame, the chrome, the text region, the medal region. */
type Row = [number, number, boolean][];
const RECORD: {
  s17Fresh: { news: Row; menu: Row }; s4Fresh: { news: Row; menu: Row };
  horizon: { s17News: Row; s17Menu: Row; s4News: Row; s4Menu: Row }; caption: [number, number, boolean];
} = {
  // The fresh server's empty text. The text regions are not met whatever their number says: nothing is drawn where the
  // captures have two or three lines, and the lines are a small share of each region (the popup's 91.0 and 94.9 and
  // A_45's 92.0 are the panel behind them matching). The medal is not met: no ladder answer, no Medal_Black (ONL-34).
  s17Fresh: {
    news: [[97.1, 65.1, true], [99.7, 71.5, true], [91, 41.4, true], [71.1, 56.5, false]],
    menu: [[96.7, 73.6, true], [99.5, 75, true], [83.3, 69.9, false], [71.1, 56.5, false]],
  },
  s4Fresh: {
    news: [[98.6, 65.2, true], [99.9, 71.4, true], [94.9, 42.1, true], [71.3, 56.8, false]],
    menu: [[98.6, 75.1, true], [99.8, 75.7, true], [92, 74.8, true], [71.3, 56.8, false]],
  },
  // The captures' own announcements served: the text regions met; the medal as above.
  horizon: {
    s17News: [[99.6, 65.1, true], [99.7, 71.5, true], [99.4, 41.4, true], [71.1, 56.5, false]],
    s17Menu: [[99.4, 73.6, true], [99.5, 75, true], [99.1, 69.9, true], [71.1, 56.5, false]],
    s4News: [[99.8, 65.2, true], [99.9, 71.4, true], [99.8, 42.1, true], [71.3, 56.8, false]],
    s4Menu: [[99.8, 75.1, true], [99.8, 75.7, true], [99.8, 74.8, true], [71.3, 56.8, false]],
  },
  caption: [98.3, 39.9, true],
};
