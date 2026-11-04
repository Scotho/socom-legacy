import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { DISC, HAVE_DISC, UNIVERSE, personaRig, type PersonaRigOptions } from '../../packages/ui/test/screens/personaRig';
import { decodePng, rgbToRgba, rgbaToRgb, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import { judge, resample, toGrey, type Judged, type Rect } from '../captureScore';

/**
 * ONL-06's scores (web research 153 §4; the block's Acceptance: "against `02_persona.png` and `A_35`..`A_38`"):
 * CONNECT TO SOCOM II run through the whole front end on the disc -- the dialog built, its ONSTART through the real
 * command bodies, the pad and the keyboard driven as a player's -- drawn by PLAT-14's drawer with the page's banks
 * (`frontEndAssets.ts`) and PLAT-04's captions, and scored by PLAT-30's scorer against the archived captures of the
 * golden manifest's rows `online.persona-form`, `online.persona-list` and `online.name-keyboard`:
 *
 * - the console's `A_35_persona.png` (the empty form), `A_36_personalist.png` (the list), `A_37_namekbd.png` (the name
 *   keyboard), `A_38_named.png` (a name typed) and `A_39_pw.png` (a password typed, PASSWORD lit) -- PCSX2, 640 x 480,
 *   each scored with the 4:3 correction (W7.R7, KNOWN [online-7pct]);
 * - the recomp's `s17_q2_logoff/online1/02_persona.png` (640 x 448: the saved persona `socomc`, PASSWORD lit and empty
 *   -- the state OT.R17 gives every login), the whole frame and its share of equal pixels (N20's pixel-exact bar);
 * - the harness's title crop `scripts/parity/refs/persona.png` (245 x 24, cut as `refs.json`'s `persona` box).
 *
 * Each frame is scored against its own state's capture, never another's (W9.R8). The numbers are the record: a drawing
 * change that moves one moves the note with it. Needs the disc and `SOCOM_PC_ROOT`'s captures; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const cap = (p: string): string | null => (ROOT ? resolve(ROOT, p) : null);
const A35 = cap('logs/parity/s4_pcsx2/A_35_persona.png'), A36 = cap('logs/parity/s4_pcsx2/A_36_personalist.png');
const A37 = cap('logs/parity/s4_pcsx2/A_37_namekbd.png'), A38 = cap('logs/parity/s4_pcsx2/A_38_named.png'), A39 = cap('logs/parity/s4_pcsx2/A_39_pw.png');
const RECOMP = cap('logs/parity/s17_q2_logoff/online1/02_persona.png'), TITLE = cap('scripts/parity/refs/persona.png');
const ready = HAVE_DISC && [A35, A36, A37, A38, A39, RECOMP, TITLE].every((p) => p !== null && existsSync(p));
const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

/** ONSTART's four animations, the build's focus and `menu_fade_up`. */
const SETTLED = 60;
/** The harness's title box (`scripts/parity/refs/refs.json` `persona.box`), on the frame grey at 320 x 224 (as LOGIN's, research 144 §7). */
export const PERSONA_TITLE_BOX: Rect = [5, 8, 250, 32];
/** PersonaList's size (the layout's XSIZE, YSIZE): the panel `popupOp.tif` fills, at the node's place once `OnLoginRoomstart` has moved it. */
export const PERSONA_LIST_SIZE = [200, 150] as const;
/** Everything but `keep` masked: the four rectangles around it. */
const allBut = ([x0, y0, x1, y1]: Rect): Rect[] => [[0, 0, 640, y0], [0, y1, 640, 448], [0, y0, x0, y1], [x1, y0, 640, y1]];

const crop = (img: Rgb, [x0, y0, x1, y1]: Rect): Rgb => {
  const w = x1 - x0, h = y1 - y0, data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((y + y0) * img.width + x0) * 3, ((y + y0) * img.width + x1) * 3), y * w * 3);
  return { width: w, height: h, data };
};
/** The harness's view of a 640 x 448 frame: grey, 320 x 224 (bicubic), as an RGB image for the scorer. */
const harnessGrey = (img: Rgb): Rgb => {
  const g = resample(toGrey(img), 320, 224, 'bicubic');
  const data = new Uint8Array(g.width * g.height * 3);
  for (let i = 0; i < g.width * g.height; i++) { data[i * 3] = g.data[i]!; data[i * 3 + 1] = g.data[i]!; data[i * 3 + 2] = g.data[i]!; }
  return { width: g.width, height: g.height, data };
};
/** The share of pixels equal in both frames, to four places. */
const exact = (a: Rgb, b: Rgb): number => {
  let same = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) if (a.data[i * 3] === b.data[i * 3] && a.data[i * 3 + 1] === b.data[i * 3 + 1] && a.data[i * 3 + 2] === b.data[i * 3 + 2]) same++;
  return Math.round((same / n) * 10_000) / 10_000;
};
const triple = (j: Judged): [number, number, boolean] => [j.score, j.control, j.matched];

/** The rig with the disc's faces, the MP2 captions and the page's banks: what a drawn frame needs. */
async function drawnRig(o: PersonaRigOptions = {}) {
  const src = new FsAssetSource(DISC);
  const fz = Zar.parse(new Uint8Array(readFileSync(resolve(DISC, FONTS_RDR.archive))));
  const faces = readTextFaces(parseRdr(fz.data(fz.find(FONTS_RDR.member)!)));
  const { service } = await loadLocService(src, 'RUN/MP2.ZDB');
  const banks = pageUiTextures(src);
  expect(await banks.ready).toEqual([]);
  const t = personaRig({ ...o, face: (n) => faces.find((f) => f.name.toLowerCase() === n.toLowerCase()) ?? null, captions: service, hasTexture: (n) => banks.textures(n) !== null });
  const draw = (name: string): { frame: Rgb; undrawn: string[] } => {
    const r = rasterizeUiDrawList(t.last(), banks.textures);
    const frame = rgbaToRgb(640, 448, r.frame.data);
    const out = process.env.ONL06_SCORE_OUT;
    if (out) { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, `${name}_ours.png`), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
    return { frame, undrawn: r.undrawn };
  };
  return { t, draw };
}
const console480 = (p: string): Rgb => { const g = png(p); expect([g.width, g.height]).toEqual([640, 480]); return g; };
const say = (label: string, j: Judged): void => { console.info(`${label} ${JSON.stringify(j)}`); };

describe.skipIf(!ready)(`ONL-06's scores against the persona captures${ready ? '' : ' (no disc or no SOCOM_PC_ROOT captures)'}`, () => {
  it('the empty form against A_35 (4:3 corrected) and the title crop', async () => {
    const { t, draw } = await drawnRig();
    t.run(SETTLED);
    expect(t.notImplemented()).toEqual([]);
    expect(t.focused()).toBe('playername_btn');
    const { frame, undrawn } = draw('a35_form');
    expect(undrawn).toEqual(['models']);                             // no bitmap or glyph is left undrawn; the 3D pass is not this drawer's
    const form = judge(console480(A35!), frame, { pcsx2Letterbox: true });
    say('A_35', form);
    const title = png(TITLE!);
    expect([title.width, title.height]).toEqual([245, 24]);
    const ourTitle = crop(harnessGrey(frame), PERSONA_TITLE_BOX);
    const titled = judge(title, ourTitle);
    say('title crop', titled);
    console.info(`title exact ${exact(title, ourTitle)}`);
    // The record (2026-10-04): a drawing change moves these with research 153 §4.
    expect(triple(form)).toEqual([99.8, 76, true]);
    expect([...triple(titled), exact(title, ourTitle)]).toEqual([96.9, 75.5, true, 0.4616]);
  }, 180_000);

  it('the persona list against A_36: three <New Persona> rows over the dimmed form, the first lit', async () => {
    const { t, draw } = await drawnRig();
    t.run(SETTLED);
    t.press('CROSS', 20);
    expect([t.focused(), t.listbox().focus, t.node('PersonaList')!.visible]).toEqual(['PersonaList', 0, true]);
    const { frame, undrawn } = draw('a36_list');
    expect(undrawn).toEqual(['models']);
    const list = judge(console480(A36!), frame, { pcsx2Letterbox: true });
    say('A_36', list);
    // The dimmed frame is close to black (its control is high), so the panel is scored alone as well: the three rows and the legends.
    const n = t.node('PersonaList')!;
    const box: Rect = [Math.round(n.x), Math.round(n.y), Math.round(n.x) + PERSONA_LIST_SIZE[0], Math.round(n.y) + PERSONA_LIST_SIZE[1]];
    console.info(`PersonaList box ${JSON.stringify(box)}`);
    const panel = judge(console480(A36!), frame, { pcsx2Letterbox: true, mask: allBut(box) });
    say('A_36 panel', panel);
    expect(box).toEqual([168, 127, 368, 277]);
    expect(triple(list)).toEqual([99.9, 93.2, true]);
    expect(triple(panel)).toEqual([99.7, 42, true]);
  }, 180_000);

  it('the name keyboard against A_37: "Enter Player Name" over the dimmed form', async () => {
    const { t, draw } = await drawnRig();
    t.run(SETTLED);
    t.press('CROSS', 6);
    t.press('CROSS', 30);
    expect(t.skb.keyboard.isOpen).toBe(true);
    const { frame, undrawn } = draw('a37_keyboard');
    expect(undrawn).toEqual(['models']);                             // the keyboard's bitmaps are the UISK bank's
    const kb = judge(console480(A37!), frame, { pcsx2Letterbox: true });
    say('A_37', kb);
    expect(triple(kb)).toEqual([99.1, 79.5, true]);
  }, 180_000);

  it('a typed name against A_38: "socomp", the rows answering, Male, CONNECT dark', async () => {
    const { t, draw } = await drawnRig();
    t.run(SETTLED);
    t.press('CROSS', 6);
    t.press('CROSS', 14);
    t.type('socomp');
    t.run(30);
    expect([t.focused(), t.str('PLAYERNAMEVAR')]).toEqual(['playername_btn', 'socomp']);
    const { frame, undrawn } = draw('a38_named');
    expect(undrawn).toEqual(['models']);
    const named = judge(console480(A38!), frame, { pcsx2Letterbox: true });
    say('A_38', named);
    expect(triple(named)).toEqual([99.8, 75.8, true]);
  }, 180_000);

  it('a typed password against A_39: six *, PASSWORD lit, CONNECT answering', async () => {
    const { t, draw } = await drawnRig();
    t.run(SETTLED);
    t.press('CROSS', 6);
    t.press('CROSS', 14);
    t.type('socomp');
    t.press('DOWN', 3);
    t.press('CROSS', 14);
    t.type('secret');
    t.run(30);
    expect([t.focused(), t.text('password_val')]).toEqual(['passwd_btn', '******']);
    const { frame, undrawn } = draw('a39_password');
    expect(undrawn).toEqual(['models']);
    const pw = judge(console480(A39!), frame, { pcsx2Letterbox: true });
    say('A_39', pw);
    expect(triple(pw)).toEqual([99.8, 76.7, true]);
  }, 180_000);

  it("a saved persona, PASSWORD lit and empty, against the recomp's 02_persona.png: the whole frame", async () => {
    const { t, draw } = await drawnRig({ records: [{ host: UNIVERSE.dns, port: UNIVERSE.port, name: 'socomc', password: '', hometown: '', gender: 0, savePassword: 0 }] });
    t.run(SETTLED);
    expect([t.focused(), t.str('PLAYERNAMEVAR'), t.str('PLAYERPASSWORD')]).toEqual(['passwd_btn', 'socomc', '']);
    const { frame, undrawn } = draw('recomp_02_persona');
    expect(undrawn).toEqual(['models']);
    const recomp = png(RECOMP!);
    expect([recomp.width, recomp.height]).toEqual([640, 448]);
    const whole = judge(recomp, frame);
    say('recomp whole', whole);
    console.info(`recomp exact ${exact(recomp, frame)}`);
    expect(triple(whole)).toEqual([99.6, 76, true]);
    expect(exact(recomp, frame)).toBe(0.5508);                       // the pixel-exact bar (N20) is not reached: research 153 §4 says where
  }, 180_000);
});
