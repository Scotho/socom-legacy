import { describe, expect, it } from 'vitest';
import type { PadButton } from '../src/gamepad';
import {
  TalkInput, VOICE_ROUND_TALK_BUTTON_READING, VOICE_TALK_LOCKOUT_READING, type ControllerPreset, type TalkOptions,
} from '../src/voice/talkInput';

/**
 * SVC-22a (sprint 20): the talk input. The original's two round routes -- TeamCommand held past 0.3 s (route A,
 * `FUN_002359a0` / `FUN_002360d0` case 5) and RUN AND TALK's SwapWeapon2 (route B, `FUN_002351a0`) -- and the lobby's
 * CIRCLE (`VCButton`), resolved through the controller preset (research 170 §4, C5-C8; research 197 §2). A fake clock in
 * seconds, 60 steps a second; the Chat menu is the real `TauntMenu` the module feeds.
 */

const HZ = 60;
const STEP = 1 / HZ;
interface Out { t: number; talk: boolean; swap2: boolean }

function rig(start: Partial<TalkOptions> = {}) {
  const input = new TalkInput({ send: () => {}, custom: () => [], sound: () => {}, unsupported: () => {} });
  const o: TalkOptions = {
    phase: 'round', preset: 'Default', runAndTalk: false, menuAllowed: true, talkAllowed: true, lateJoiner: false, padPresent: true, focused: true, ...start,
  };
  let i = 0;
  /** `buttons` held for `seconds`, a frame each 1/60 s: every frame's output with its clock. */
  const hold = (buttons: PadButton[], seconds: number, patch: Partial<TalkOptions> = {}): Out[] => {
    Object.assign(o, patch);
    const out: Out[] = [];
    for (let n = Math.max(1, Math.round(seconds * HZ)); n > 0; n--) {
      i++;
      const t = i / HZ;
      out.push({ t, ...input.frame(t, new Set(buttons), { ...o }) });
    }
    return out;
  };
  const now = (): number => i / HZ;
  /** Nothing held until the clock reads `t`. */
  const idleUntil = (t: number): void => { if (t - now() > STEP / 2) hold([], t - now()); };
  return { input, menu: input.menu, hold, now, idleUntil };
}
/** The frame nearest `t`. */
const at = (frames: Out[], t: number): Out => frames.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
const ROUND_LIKE_DEFAULT: ControllerPreset[] = ['Default', 'Reverse', 'Config4'];

describe('the preset table (research 197 §2, C7)', () => {
  it('Default, Reverse and Config4: TeamCommand CIRCLE, SwapWeapon2 L2; Goldeneye: SQUARE and SwapWeapon2 unbound', () => {
    for (const p of ROUND_LIKE_DEFAULT) expect(VOICE_ROUND_TALK_BUTTON_READING[p]).toEqual({ teamCommand: 'Circle', swapWeapon2: 'L2' });
    expect(VOICE_ROUND_TALK_BUTTON_READING.Goldeneye).toEqual({ teamCommand: 'Square', swapWeapon2: null });
    expect(VOICE_TALK_LOCKOUT_READING).toEqual({ menuClose: .3, teamCommand: 1.3, swapWeapon2: 1 });
  });
});

describe('TalkInput: the round', () => {
  // RED 1 and 7: Reverse and Config4 as Default.
  for (const preset of ROUND_LIKE_DEFAULT) {
    it(`${preset}: a CIRCLE tap under 0.3 s opens the Chat menu and never talks; held past 0.3 s it talks until released`, () => {
      const tap = rig({ preset });
      const frames = [...tap.hold(['Circle'], .2), ...tap.hold([], STEP)];
      expect(frames.some((f) => f.talk)).toBe(false);
      expect(tap.menu.isOpen()).toBe(true);

      const r = rig({ preset });
      const held = r.hold(['Circle'], .5);
      const press = held[0]!.t;
      const first = held.find((f) => f.talk)!;
      expect(first.t - press).toBeGreaterThan(.3);
      expect(first.t - press).toBeLessThanOrEqual(.3 + 2 * STEP);
      expect(held.filter((f) => f.t >= first.t).every((f) => f.talk)).toBe(true);
      expect(held.some((f) => f.swap2)).toBe(false);
      const released = r.hold([], STEP)[0]!;
      expect(released.talk).toBe(false);
      expect(r.menu.isOpen()).toBe(false);
    });
  }

  it('RED 2, route A\'s lockout: 1.3 s after a CIRCLE talk, CIRCLE neither talks nor opens the menu; past it, as new', () => {
    const r = rig();
    r.hold(['Circle'], .5);
    const end = r.hold([], STEP)[0]!.t;
    r.idleUntil(end + 1.2);
    const locked = [...r.hold(['Circle'], .05), ...r.hold([], STEP)];
    expect(locked.some((f) => f.talk)).toBe(false);
    expect(r.menu.isOpen()).toBe(false);
    r.idleUntil(end + 1.31);
    r.hold(['Circle'], .1); r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(true);
    // Held instead, the same press past the lockout talks.
    const h = rig();
    h.hold(['Circle'], .5);
    const end2 = h.hold([], STEP)[0]!.t;
    h.idleUntil(end2 + 1.31);
    expect(h.hold(['Circle'], .5).some((f) => f.talk)).toBe(true);
  });

  it('RED 3, route A\'s cap: talks from 0.3 s to 10 s of the hold, then is cleared -- no resume while held, no menu after', () => {
    const r = rig();
    const held = r.hold(['Circle'], 12);
    const press = held[0]!.t;
    expect(at(held, press + .25).talk).toBe(false);
    expect(at(held, press + .4).talk).toBe(true);
    expect(at(held, press + 9.9).talk).toBe(true);
    expect(at(held, press + 10.1).talk).toBe(false);
    const off = held.findIndex((f) => f.t > press + 1 && !f.talk);
    expect(held.slice(off).some((f) => f.talk)).toBe(false);
    r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(false);
  });

  for (const preset of ROUND_LIKE_DEFAULT) {
    it(`RED 4, ${preset}, RUN AND TALK ON: L2 talks from its held state (the frame after the press), never swaps; 1.0 s lockout; a 25 s hold cuts at 10 s and resumes at 20 s`, () => {
      const r = rig({ preset, runAndTalk: true });
      const held = r.hold(['L2'], .5);
      // R116.1: 1 on the press frame, 2 after it; route B talks in 2 (D:L83904) and clears in 0, the frame after the release (D:L83906).
      expect(held[0]!.talk).toBe(false);
      expect(held.slice(1).every((f) => f.talk)).toBe(true);
      expect(held.some((f) => f.swap2)).toBe(false);
      const [rising, up] = r.hold([], 2 * STEP);
      expect(rising!.talk).toBe(true);
      expect(up!.talk).toBe(false);
      const end = up!;
      // The 1.0 s on the shared TeamCommand timer (+0xdb4): neither L2 nor CIRCLE inside it.
      r.idleUntil(end.t + .5);
      r.hold(['Circle'], .05); r.hold([], STEP);
      expect(r.menu.isOpen()).toBe(false);
      r.idleUntil(end.t + .9);
      const locked = r.hold(['L2'], .05);
      expect(locked.some((f) => f.talk || f.swap2)).toBe(false);
      r.hold([], STEP);
      r.idleUntil(end.t + 1.01);
      const again = r.hold(['L2'], 25);
      const press = again[0]!.t;
      expect(again[0]!.talk).toBe(false);
      expect(again[1]!.talk).toBe(true);
      expect(at(again, press + 9.9).talk).toBe(true);
      expect(at(again, press + 10.1).talk).toBe(false);
      expect(at(again, press + 19.9).talk).toBe(false);
      expect(at(again, press + 20.1).talk).toBe(true);
      expect(at(again, press + 24.9).talk).toBe(true);
      expect(again.some((f) => f.swap2)).toBe(false);
      expect(r.hold([], 2 * STEP)[1]!.talk).toBe(false);
    });

    it(`RED 5, ${preset}, RUN AND TALK OFF: L2 swaps on its press frame only and never talks`, () => {
      const r = rig({ preset, runAndTalk: false });
      const held = r.hold(['L2'], 1);
      expect(held.map((f) => f.swap2)).toEqual(held.map((_, k) => k === 0));
      expect(held.some((f) => f.talk)).toBe(false);
      r.hold([], STEP);
      expect(r.hold(['L2'], STEP)[0]!.swap2).toBe(true);
    });
  }

  it('RED 6, Goldeneye: SQUARE held past 0.3 s talks; L2 with RUN AND TALK neither talks nor swaps; CIRCLE does nothing', () => {
    const r = rig({ preset: 'Goldeneye', runAndTalk: true });
    const sq = r.hold(['Square'], .5);
    const first = sq.find((f) => f.talk)!;
    expect(first.t - sq[0]!.t).toBeGreaterThan(.3);
    expect(r.hold([], STEP)[0]!.talk).toBe(false);
    r.hold([], 1.5);
    const l2 = [...r.hold(['L2'], 1), ...r.hold([], STEP)];
    expect(l2.some((f) => f.talk || f.swap2)).toBe(false);
    const off = rig({ preset: 'Goldeneye', runAndTalk: false });
    expect(off.hold(['L2'], 1).some((f) => f.talk || f.swap2)).toBe(false);
    const circle = [...r.hold(['Circle'], .1), ...r.hold([], STEP), ...r.hold(['Circle'], 1), ...r.hold([], STEP)];
    expect(circle.some((f) => f.talk || f.swap2)).toBe(false);
    expect(r.menu.isOpen()).toBe(false);
    r.hold(['Square'], .1); r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(true);
  });
});

describe('TalkInput: the lobby (VCButton, research 170 §4.1)', () => {
  it('RED 8: CIRCLE talks on its press frame and stops on release, no lockout; a 25 s hold cuts at 10 s and resumes at 20 s', () => {
    for (const preset of ['Default', 'Goldeneye'] as const) {
      const r = rig({ phase: 'lobby', preset });
      const held = r.hold(['Circle'], .5);
      expect(held.every((f) => f.talk)).toBe(true);
      expect(r.hold([], STEP)[0]!.talk).toBe(false);
      expect(r.hold(['Circle'], STEP)[0]!.talk).toBe(true);
      r.hold([], STEP);
      const long = r.hold(['Circle'], 25);
      const press = long[0]!.t;
      expect(at(long, press + 9.9).talk).toBe(true);
      expect(at(long, press + 10.1).talk).toBe(false);
      expect(at(long, press + 19.9).talk).toBe(false);
      expect(at(long, press + 20.1).talk).toBe(true);
      expect(long.some((f) => f.swap2)).toBe(false);
      expect(r.menu.isOpen()).toBe(false);
    }
  });
});

describe('TalkInput: releases a browser has (research 197 §2\'s acceptance)', () => {
  it('RED 9: the pad lost or the window blurred while talking ends the talk that frame; no resume without a new press', () => {
    const r = rig();
    r.hold(['Circle'], .5);
    expect(r.hold(['Circle'], STEP, { padPresent: false })[0]!.talk).toBe(false);
    const back = r.hold(['Circle'], 2, { padPresent: true });
    expect(back.some((f) => f.talk)).toBe(false);
    r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(false);
    r.hold([], 1.5);
    expect(r.hold(['Circle'], .5).some((f) => f.talk)).toBe(true);

    const b = rig({ runAndTalk: true });
    expect(b.hold(['L2'], .5).slice(1).every((f) => f.talk)).toBe(true);
    expect(b.hold(['L2'], STEP, { focused: false })[0]!.talk).toBe(false);
    expect(b.hold(['L2'], 2, { focused: true }).some((f) => f.talk || f.swap2)).toBe(false);
    b.hold([], 1.1);
    expect(b.hold(['L2'], 2 * STEP)[1]!.talk).toBe(true);

    const l = rig({ phase: 'lobby' });
    l.hold(['Circle'], .5);
    expect(l.hold(['Circle'], STEP, { focused: false })[0]!.talk).toBe(false);
    expect(l.hold(['Circle'], 1, { focused: true }).some((f) => f.talk)).toBe(false);
  });

  it('RED 10: a preset change while held synthesises no second action', () => {
    const r = rig();
    r.hold(['Circle'], .5);
    expect(r.hold(['Circle'], STEP, { preset: 'Goldeneye' })[0]!.talk).toBe(false);
    const still = [...r.hold(['Circle'], 2), ...r.hold([], STEP)];
    expect(still.some((f) => f.talk || f.swap2)).toBe(false);
    expect(r.menu.isOpen()).toBe(false);
    r.hold([], 1.5);
    expect(r.hold(['Square'], .5).some((f) => f.talk)).toBe(true);

    // SwapWeapon2 held across a change to a preset that binds it: no swap until a release and a new press.
    const s = rig({ preset: 'Goldeneye' });
    s.hold(['L2'], .2);
    expect(s.hold(['L2'], 1, { preset: 'Default' }).some((f) => f.swap2 || f.talk)).toBe(false);
    s.hold([], STEP);
    expect(s.hold(['L2'], STEP)[0]!.swap2).toBe(true);

    // RUN AND TALK switched on under a held L2: no talk until a new press.
    const t = rig({ runAndTalk: false });
    t.hold(['L2'], .2);
    expect(t.hold(['L2'], 1, { runAndTalk: true }).some((f) => f.talk || f.swap2)).toBe(false);
  });
});

describe('the review of e5bd22729: the voice object\'s wait, the talk gate, the lockout\'s edges, the late joiner', () => {
  it('F1: the 10 s wait after a cut outlasts a release -- a new press in it is silent until 20 s; past it, a press talks at once', () => {
    const l = rig({ phase: 'lobby' });
    const first = l.hold(['Circle'], 12);
    const press = first[0]!.t;
    expect(at(first, press + 10.1).talk).toBe(false);
    l.idleUntil(press + 13);
    const again = l.hold(['Circle'], 8);
    expect(at(again, press + 13.1).talk).toBe(false);
    expect(at(again, press + 19.9).talk).toBe(false);
    expect(at(again, press + 20.1).talk).toBe(true);

    const m = rig({ phase: 'lobby' });
    const p2 = m.hold(['Circle'], 12)[0]!.t;
    m.idleUntil(p2 + 21);
    expect(m.hold(['Circle'], STEP)[0]!.talk).toBe(true);

    const b = rig({ runAndTalk: true });
    const pb = b.hold(['L2'], 12)[0]!.t;
    b.idleUntil(pb + 13.5);
    const bAgain = b.hold(['L2'], 7);
    expect(at(bAgain, pb + 13.6).talk).toBe(false);
    expect(at(bAgain, pb + 19.9).talk).toBe(false);
    expect(at(bAgain, pb + 20.2).talk).toBe(true);
  });

  it('F2: the talk has its own gate -- the menu refused (the dead), route A still talks and a tap opens nothing; the talk refused, a tap still opens the menu', () => {
    const dead = rig({ menuAllowed: false, talkAllowed: true });
    expect(dead.hold(['Circle'], .5).some((f) => f.talk)).toBe(true);
    dead.hold([], STEP);
    dead.hold([], 1.5);
    dead.hold(['Circle'], .1); dead.hold([], STEP);
    expect(dead.menu.isOpen()).toBe(false);
    const mute = rig({ menuAllowed: true, talkAllowed: false });
    expect(mute.hold(['Circle'], .5).some((f) => f.talk)).toBe(false);
    mute.hold([], STEP);
    expect(mute.menu.isOpen()).toBe(false);
    mute.hold(['Circle'], .1); mute.hold([], STEP);
    expect(mute.menu.isOpen()).toBe(true);
    const muteB = rig({ runAndTalk: true, talkAllowed: false });
    expect(muteB.hold(['L2'], 1).some((f) => f.talk || f.swap2)).toBe(false);
  });

  it('F4 (a): a press made inside the lockout and held across its end talks once the lockout ends and the hold is past 0.3 s', () => {
    const r = rig();
    r.hold(['Circle'], .5);
    const end = r.hold([], STEP)[0]!.t;
    r.idleUntil(end + .9);
    const held = r.hold(['Circle'], 1);
    const first = held.find((f) => f.talk)!;
    expect(first.t).toBeGreaterThanOrEqual(end + 1.3 - 1e-9);
    expect(first.t).toBeLessThanOrEqual(end + 1.3 + 2 * STEP);
    const late = rig();
    late.hold(['Circle'], .5);
    const end2 = late.hold([], STEP)[0]!.t;
    late.idleUntil(end2 + 1.2);
    const held2 = late.hold(['Circle'], 1);
    const press = held2[0]!.t;
    const first2 = held2.find((f) => f.talk)!;
    expect(first2.t - press).toBeGreaterThan(.3);
    expect(first2.t - press).toBeLessThanOrEqual(.3 + 2 * STEP);
    late.hold([], STEP);
    expect(late.menu.isOpen()).toBe(false);
  });

  it('F4 (b): a short press made inside the lockout and released after it opens the menu', () => {
    const r = rig();
    r.hold(['Circle'], .5);
    const end = r.hold([], STEP)[0]!.t;
    r.idleUntil(end + 1.2);
    const tap = [...r.hold(['Circle'], .2), ...r.hold([], STEP)];
    expect(tap.some((f) => f.talk)).toBe(false);
    expect(r.menu.isOpen()).toBe(true);
  });

  it('F4 (c): CIRCLE held past 0.3 s while route B talks does not talk on route A; released, it opens the menu', () => {
    const r = rig({ runAndTalk: true });
    r.hold(['L2'], .3);
    const both = r.hold(['L2', 'Circle'], .6);
    expect(both.every((f) => f.talk)).toBe(true);
    expect(r.menu.isOpen()).toBe(false);
    r.hold(['L2'], STEP);
    expect(r.menu.isOpen()).toBe(true);
  });

  it('F4: a menu closed sets the TeamCommand timer 0.3 s -- a CIRCLE tap inside it opens nothing', () => {
    const r = rig();
    r.hold(['Circle'], .1); r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(true);
    r.hold(['Triangle'], STEP);
    const closed = r.hold([], STEP)[0]!.t;
    expect(r.menu.isOpen()).toBe(false);
    r.idleUntil(closed + .1);
    r.hold(['Circle'], .1); r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(false);
    r.idleUntil(closed + .5);
    r.hold(['Circle'], .1); r.hold([], STEP);
    expect(r.menu.isOpen()).toBe(true);
  });

  it('F8: the late joiner\'s lobby CIRCLE is inert (VCButton\'s +0xcc guard)', () => {
    const l = rig({ phase: 'lobby', lateJoiner: true });
    expect(l.hold(['Circle'], 1).some((f) => f.talk)).toBe(false);
  });
});
