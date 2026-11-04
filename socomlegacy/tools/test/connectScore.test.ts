import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, Zar } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { FONTS_RDR, loadLocService } from '@s2u/scene';
import { readTextFaces, type LobbyService } from '@s2u/ui';
import { pageUiTextures } from '../../packages/viewer/src/frontEndAssets';
import { rasterizeUiDrawList } from '../../packages/viewer/src/uiCompositorView';
import { CONNECT, DISC, HAVE_DISC, PERSONA, UNIVERSE, personaRig, type PersonaRigOptions } from '../../packages/ui/test/screens/personaRig';
import { decodePng, rgbToRgba, rgbaToRgb, type Rgb } from '../captureImage';
import { encodePng } from '../png';
import { judge, type Judged, type Rect } from '../captureScore';

/**
 * ONL-07's scores (web research 157 §8; the block's Acceptance: "captures `07_after_connect.png`/`07_write_down.png`
 * and `A_41`/`A_42`"): the persona form's two prompts on CONNECT and the connecting screen, run through the whole
 * front end on the disc -- the dialog built, its scripts through the real command bodies, the pad and the keyboard
 * driven as a player's -- drawn by PLAT-14's drawer with the page's banks and PLAT-04's captions, and scored by
 * PLAT-30's scorer against the archived captures of the golden manifest's rows `online.write-down-notice`,
 * `online.save-prompt` and `online.connecting`:
 *
 * - the console's `A_41_afterconnect.png` (the write-down notice #606 over the form: `socomp`, six `*`) and `A_42.png`
 *   (the save prompt #831, YES lit) -- PCSX2, 640 x 480, each scored with the 4:3 correction (W7.R7, KNOWN
 *   [online-7pct]);
 * - the recomp's `s17_q2_logoff/online1/07_after_connect.png` and `07_write_down.png` (640 x 448: the saved persona
 *   `socomc`, five `*`, the same notice -- the harness shoots the frame before and after it recognises the prompt),
 *   the whole frame and its share of equal pixels (N20's pixel-exact bar).
 *
 * - the connecting screen itself: the recomp's `persona_card_proof2/login/07_after_connect.png` and
 *   `s16_l1b_step0/launch3/07_after_connect.png` (640 x 448) -- two runs whose persona needed no write-down notice, so
 *   the harness's shot "after CONNECT" caught `dlgNetConnect` at "STATE: LOGGED IN" (personas `s17pc`, `s27pa`).
 *   Research 113 recorded "no frame of `dlgNetConnect` was found"; these were found by comparing a drawn frame with
 *   every menu capture of the archive (research 157 §8). The progress strip's lead is wherever its sweep stood at the
 *   shot, so the frame is scored whole and with the strip masked.
 *
 * The error dialogs have no capture (owed to ONL-32: the manifest's `state.connect-*` rows). Each frame is scored
 * against its own state's capture, never another's (W9.R8). The numbers are the record: a drawing change that moves
 * one moves the note with it. Needs the disc and `SOCOM_PC_ROOT`'s captures; skips without.
 */
const ROOT = process.env.SOCOM_PC_ROOT ?? null;
const cap = (p: string): string | null => (ROOT ? resolve(ROOT, p) : null);
const A41 = cap('logs/parity/s4_pcsx2/A_41_afterconnect.png'), A42 = cap('logs/parity/s4_pcsx2/A_42.png');
const R07A = cap('logs/parity/s17_q2_logoff/online1/07_after_connect.png'), R07W = cap('logs/parity/s17_q2_logoff/online1/07_write_down.png');
const CONN_A = cap('logs/parity/persona_card_proof2/login/07_after_connect.png'), CONN_B = cap('logs/parity/s16_l1b_step0/launch3/07_after_connect.png');
const ready = HAVE_DISC && [A41, A42, R07A, R07W, CONN_A, CONN_B].every((p) => p !== null && existsSync(p));
/** The progress strip (`Progress_dummy` at (200, 250), 260 x 20, its top and bottom rules a pixel out): the lead's place is the shot's moment. */
export const CONNECT_STRIP_BOX: Rect = [196, 246, 464, 274];
const png = (p: string): Rgb => decodePng(new Uint8Array(readFileSync(p)));

/** ONSTART's four animations, the build's focus and `menu_fade_up`. */
const SETTLED = 60;
/** A typed password of `n` characters, made up for the test. */
const typed = (n: number): string => 'secret'.padEnd(n, 'x').slice(0, n);

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
    const out = process.env.ONL07_SCORE_OUT;
    if (out) { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, `${name}_ours.png`), encodePng(frame.width, frame.height, rgbToRgba(frame))); }
    return { frame, undrawn: r.undrawn };
  };
  return { t, draw };
}
const console480 = (p: string): Rgb => { const g = png(p); expect([g.width, g.height]).toEqual([640, 480]); return g; };
const recomp448 = (p: string): Rgb => { const g = png(p); expect([g.width, g.height]).toEqual([640, 448]); return g; };
const say = (label: string, j: Judged): void => { console.info(`${label} ${JSON.stringify(j)}`); };
type Drawn = Awaited<ReturnType<typeof drawnRig>>;

/** A new persona typed as the console capture's: `socomp`, a six-character password, then DOWN to CONNECT. */
function typeNewPersona(t: Drawn['t']): void {
  t.run(SETTLED);
  t.press('CROSS', 6);
  t.press('CROSS', 14);
  t.type('socomp');
  t.press('DOWN', 3);
  t.press('CROSS', 14);
  t.type(typed(6));
  for (let i = 0; i < 4; i++) t.press('DOWN', 3);
  expect([t.focused(), t.text('password_val')]).toEqual(['connect_btn', '******']);
}

describe.skipIf(!ready)(`ONL-07's scores against the connect captures${ready ? '' : ' (no disc or no SOCOM_PC_ROOT captures)'}`, () => {
  it('the write-down notice #606 over the form against A_41 (4:3 corrected): socomp, six *, CONTINUE lit', async () => {
    const { t, draw } = await drawnRig();
    typeNewPersona(t);
    t.press('CROSS', 30);
    expect([t.current(), t.shown(), t.popupText()]).toEqual([PERSONA, true, t.loc.byId.get(606)]);
    const { frame, undrawn } = draw('a41_write_down');
    expect(undrawn).toEqual(['models']);                             // no bitmap or glyph is left undrawn; the 3D pass is not this drawer's
    const j = judge(console480(A41!), frame, { pcsx2Letterbox: true });
    say('A_41', j);
    // The record (2026-10-05): a drawing change moves these with research 157 §8.
    expect(triple(j)).toEqual([99.8, 83.5, true]);
  }, 180_000);

  it('the save prompt #831 against A_42 (4:3 corrected): YES lit, NO', async () => {
    const { t, draw } = await drawnRig();
    typeNewPersona(t);
    t.press('CROSS', 10);
    t.press('CROSS', 40);                                            // CONTINUE: memcard_operations -> save_and_leave's #831
    expect([t.current(), t.shown(), t.popupText()]).toEqual([PERSONA, true, t.loc.byId.get(831)]);
    const { frame, undrawn } = draw('a42_save_prompt');
    expect(undrawn).toEqual(['models']);
    const j = judge(console480(A42!), frame, { pcsx2Letterbox: true });
    say('A_42', j);
    expect(triple(j)).toEqual([99.9, 90.3, true]);
  }, 180_000);

  it("the recomp's 07_after_connect.png and 07_write_down.png: the saved persona socomc, five *, the same notice -- the whole frame", async () => {
    const { t, draw } = await drawnRig({ records: [{ host: UNIVERSE.dns, port: UNIVERSE.port, name: 'socomc', password: '', hometown: '', gender: 0, savePassword: 0 }] });
    t.run(SETTLED);
    expect(t.focused()).toBe('passwd_btn');
    t.press('CROSS', 14);
    t.type(typed(5));
    for (let i = 0; i < 4; i++) t.press('DOWN', 3);
    expect([t.focused(), t.text('password_val')]).toEqual(['connect_btn', '*****']);
    t.press('CROSS', 30);
    expect([t.shown(), t.popupText()]).toEqual([true, t.loc.byId.get(606)]);
    const { frame, undrawn } = draw('recomp_07_write_down');
    expect(undrawn).toEqual(['models']);
    const after = judge(recomp448(R07A!), frame), down = judge(recomp448(R07W!), frame);
    say('07_after_connect', after);
    say('07_write_down', down);
    console.info(`07 exact ${exact(recomp448(R07A!), frame)} ${exact(recomp448(R07W!), frame)}`);
    expect(triple(after)).toEqual([99.6, 83.4, true]);
    expect(triple(down)).toEqual([99.6, 83.4, true]);
    expect([exact(recomp448(R07A!), frame), exact(recomp448(R07W!), frame)]).toEqual([0.5166, 0.5166]);   // the pixel-exact bar (N20) is not reached: research 157 §8
  }, 180_000);

  /** The connecting screen at "STATE: LOGGED IN" for `name`, `frames` after CONNECT (inside the profile download's 3 s). */
  const loggedIn = async (name: string, frames: number): Promise<Drawn> => {
    const service: LobbyService = { login: () => Promise.resolve({ status: 0, ticket: 't' }), register: () => Promise.resolve({ status: 0 }) };
    const r = await drawnRig({ records: [{ host: UNIVERSE.dns, port: UNIVERSE.port, name, password: typed(5), hometown: '', gender: 0, savePassword: 1 }], connectService: service });
    await r.t.runReplies(SETTLED);
    r.t.press('CROSS', 0);
    await r.t.runReplies(frames);
    expect([r.t.current(), r.t.text('bar_title'), r.t.text('ConnectingAnim'), r.t.text('ONLINE_LOBBY_STATE'), r.t.text('playername')]).toEqual([
      CONNECT, 'CONNECTING', 'CONNECTING TO SOCOM II ONLINE', 'STATE: LOGGED IN', name,
    ]);
    return r;
  };

  it("the connecting screen against the recomp's two frames of it: CONNECTING, STATE: LOGGED IN, the persona's name -- whole, and with the strip masked", async () => {
    const out: Record<string, [number, number, boolean]> = {};
    const same: number[] = [];
    for (const [key, name, ref] of [['a', 's17pc', CONN_A!], ['b', 's27pa', CONN_B!]] as const) {
      const { draw } = await loggedIn(name, 75);                     // the switch, menu_fade_up, the strip's first sweep under way
      const { frame, undrawn } = draw(`connecting_${name}`);
      expect(undrawn).toEqual(['models']);
      const golden = recomp448(ref);
      const whole = judge(golden, frame), masked = judge(golden, frame, { mask: [CONNECT_STRIP_BOX] });
      say(`connecting ${name} whole`, whole);
      say(`connecting ${name} strip masked`, masked);
      out[`${key} whole`] = triple(whole);
      out[`${key} masked`] = triple(masked);
      same.push(exact(golden, frame));
    }
    console.info(`connecting exact ${JSON.stringify(same)}`);
    expect(out).toEqual({ 'a whole': [99.8, 82.6, true], 'a masked': [99.8, 82.5, true], 'b whole': [99.8, 82.3, true], 'b masked': [99.8, 82.1, true] });
    expect(same).toEqual([0.6276, 0.6271]);                                    // the pixel-exact bar (N20) is not reached: research 157 §8
  }, 180_000);
});
