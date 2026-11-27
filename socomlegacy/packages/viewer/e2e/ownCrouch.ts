import type { Page } from '@playwright/test';
import type { MatchWindowHook } from '../src/matchMount';
import { pressPad } from './startupDevices';
import { PAD_BUTTON } from './padStub';

/**
 * SELFKILL-CROUCH's crouch (a browser-test method, product track; the account is `./menuMatch.ts`'s, above
 * `crouchedOwnFrags`): the self-kill frag's pitch and the crouch settled off the own body's clip. Moved here out of
 * `./menuMatch.ts` unchanged (LATER 1607), so a /testroom helper (`./roomOwnFrag.ts`) reaches them without importing
 * the menu match's module, which starts the central server: the public export keeps the specs that use it.
 * `./menuMatch.ts` re-exports both, so its importers are unchanged.
 */

type Hooked = Window & { __frontEndMatch?: MatchWindowHook };

/** The look's pitch of a self-kill frag, degrees (the specs' -65 since voiceMatch; a test choice, not a game value). */
export const OWN_FRAG_PITCH = -65;
/** The frames the own body's clip must read the crouch idle in a row (throwWallB06's SETTLE_STILL_FRAMES, 30). A test choice. */
const CROUCH_SETTLE_FRAMES = 30;
/** How long a crouch may take to settle, and a press to show its throw or its refusal, ms (test allowances). */
const CROUCH_SETTLE_TIMEOUT_MS = 10_000;
/**
 * The crouch idles, by the disc's own clip names: the three the crouch draws from each time it starts
 * (`../src/locomotion.ts:125-128`: seal_crouch 0.3, seal_crouch_alert01 0.3, seal_crouch_alert02 0.4). Exact names,
 * never a looser match: `/_crouch$/` missed the two alert idles (box-selfkill-crouch-d85fa1d2d-a), and a bare
 * `/crouch/` would also match a stance clip (`seal_stand2crouch`) and defeat the settle. A stance transition clip is
 * throwWallB06's `STANCE_CLIP`, by clip name.
 */
const CROUCH_IDLE = /^(seal_crouch|seal_crouch_alert01|seal_crouch_alert02)$/;
const STANCE_CLIP = /_(stand2crouch|crouch2prone|stand2prone|crouch2stand|prone2crouch)$/;

/**
 * `n` animation frames' own-body clips, one a frame: the menu match's (`MatchWindowHook.ownBody().clip`), else the test
 * room's (`window.__viewer.ownBody().clip`, the same `ownBodyRead` line) -- `voiceLobbyStall.spec.ts`'s /testroom seats.
 */
const clipsOver = (p: Page, n: number): Promise<(string | null)[]> => p.evaluate((count) => new Promise<(string | null)[]>((done) => {
  const out: (string | null)[] = [];
  const room = (window as unknown as { __viewer?: { ownBody?: () => { clip: string | null } } }).__viewer;
  const read = (): void => {
    const menu = (window as Hooked).__frontEndMatch;
    out.push((menu ? menu.ownBody().clip : room?.ownBody?.().clip) ?? null);
    if (out.length >= count) done(out); else requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
}), n);
/** The own body's clip as drawn now. */
const ownClip = async (p: Page): Promise<string | null> => (await clipsOver(p, 1))[0] ?? null;
/** The crouch SETTLED: `CROUCH_SETTLE_FRAMES` frames in a row of the crouch idle -- the posture crouch, no stance clip playing. */
const crouchSettledNow = async (p: Page): Promise<boolean> =>
  (await clipsOver(p, CROUCH_SETTLE_FRAMES)).every((c) => c !== null && CROUCH_IDLE.test(c) && !STANCE_CLIP.test(c));

/**
 * Crouched and SETTLED, gated on the page's state, never a sleep: a Triangle tap (the stance button: a tap crouches,
 * `../src/stanceButton`) unless the body is already in its crouch idle or going into it, then the own body's clip read
 * until it holds the crouch idle `CROUCH_SETTLE_FRAMES` frames in a row. Throws naming the last clip past the timeout.
 * `crouch` replaces the Triangle tap (the /testroom seats: the room hook's `crouch(true)`).
 */
export async function crouchSettled(p: Page, tag: string, crouch: (p: Page) => Promise<unknown> = (q) => pressPad(q, PAD_BUTTON.TRIANGLE)): Promise<void> {
  if (await crouchSettledNow(p)) return;
  const clip = await ownClip(p);
  if (clip === null || !(CROUCH_IDLE.test(clip) || /_stand2crouch$/.test(clip))) await crouch(p);
  for (const end = Date.now() + CROUCH_SETTLE_TIMEOUT_MS; ;) {
    if (await crouchSettledNow(p)) return;
    if (Date.now() > end) {
      throw new Error(`${tag}: the crouch did not settle within ${CROUCH_SETTLE_TIMEOUT_MS} ms (the own body's clip ${JSON.stringify(await ownClip(p))}; wanted ${CROUCH_IDLE} ${CROUCH_SETTLE_FRAMES} frames, no stance clip)`);
    }
  }
}
