import { describe, expect, it } from 'vitest';
import { CROUCH_BUTTON, FRAME_MS, GAMEPAD_BUTTON, PRONE_BUTTON, actMoments, pageEvents, pageWrites } from '../eph/pageMap';
import { parseScript } from '../eph/script';

/**
 * The original-terms script translated for the page (EPH-2; da, 2026-10-30, in the design note): the page reads no
 * pressure, so a Triangle is played by the moment the original acts -- a full one (peak >= 0.3) presses Prone
 * (Triangle's physical button) as the pressure crosses 0.3; a light one (peak < 0.3) acts on its release, so the page
 * holds Crouch (L3) from a few frames before and releases it at that moment.
 */
describe('the page pad map', () => {
  it('carries the standard Gamepad indices of gamepad.ts', () => {
    expect(GAMEPAD_BUTTON).toEqual({
      cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
      select: 8, start: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15,
    });
    expect(PRONE_BUTTON).toBe(3);
    expect(CROUCH_BUTTON).toBe(10);
  });

  it('presses Prone for a full Triangle at the crossing and releases it with Triangle', () => {
    const s = parseScript('0 triangle 0.2\n40 triangle 1\n150 triangle 0');
    expect(pageEvents(s)).toEqual([
      { t: 40, kind: 'button', index: 3, pressed: true, value: 1, line: 2 },
      { t: 150, kind: 'button', index: 3, pressed: false, value: 0, line: 3 },
    ]);
    expect(actMoments(s)).toEqual([{ kind: 'full', t: 40, pressT: 0, releaseT: 150, line: 2 }]);
  });

  it('holds Crouch (L3) for a light Triangle from three frames before its release to the release', () => {
    const s = parseScript('250 triangle 0.2\n400 triangle 0');
    expect(pageEvents(s)).toEqual([
      { t: 400 - 3 * FRAME_MS, kind: 'button', index: 10, pressed: true, value: 1, line: 2 },
      { t: 400, kind: 'button', index: 10, pressed: false, value: 0, line: 2 },
    ]);
    expect(actMoments(s)).toEqual([{ kind: 'light', t: 400, pressT: 250, releaseT: 400, line: 2 }]);
  });

  it('takes the lead in frames as a parameter, and never before time 0', () => {
    const s = parseScript('0 triangle 0.2\n20 triangle 0');
    expect(pageEvents(s, { leadFrames: 1 })[0]!.t).toBeCloseTo(20 - FRAME_MS, 9);
    expect(pageEvents(s, { leadFrames: 3 })[0]!.t).toBe(0);
  });

  it('plays the design note example in time order', () => {
    const s = parseScript('0 triangle 1.0\n150 triangle 0\n250 triangle 0.2\n400 triangle 0');
    expect(pageEvents(s).map((e) => [e.t, e.kind === 'button' ? e.index : -1, e.kind === 'button' && e.pressed])).toEqual([
      [0, 3, true], [150, 3, false], [400 - 3 * FRAME_MS, 10, true], [400, 10, false],
    ]);
    expect(actMoments(s).map((a) => [a.kind, a.t])).toEqual([['full', 0], ['light', 400]]);
  });

  it('a light Triangle never released does not act; a full one never released stays pressed', () => {
    expect(pageEvents(parseScript('0 triangle 0.2'))).toEqual([]);
    expect(actMoments(parseScript('0 triangle 0.2'))).toEqual([]);
    expect(pageEvents(parseScript('0 triangle 1'))).toEqual([
      { t: 0, kind: 'button', index: 3, pressed: true, value: 1, line: 1 },
    ]);
    expect(actMoments(parseScript('0 triangle 1'))).toEqual([{ kind: 'full', t: 0, pressT: 0, releaseT: null, line: 1 }]);
  });

  it('passes other buttons through as pressed with value 1', () => {
    expect(pageEvents(parseScript('0 square 0.6\n10 square 0\n20 up 1\n30 up 0'))).toEqual([
      { t: 0, kind: 'button', index: 2, pressed: true, value: 1, line: 1 },
      { t: 10, kind: 'button', index: 2, pressed: false, value: 0, line: 2 },
      { t: 20, kind: 'button', index: 12, pressed: true, value: 1, line: 3 },
      { t: 30, kind: 'button', index: 12, pressed: false, value: 0, line: 4 },
    ]);
  });

  it('turns stick halves into axes, y down, both halves of an axis summed', () => {
    expect(pageEvents(parseScript('0 lup 0.5\n10 lright 1\n20 ldown 1\n30 lup 0\n40 rleft 1\n50 rdown 1'))).toEqual([
      { t: 0, kind: 'axis', index: 1, value: -0.5, line: 1 },
      { t: 10, kind: 'axis', index: 0, value: 1, line: 2 },
      { t: 20, kind: 'axis', index: 1, value: 0.5, line: 3 },
      { t: 30, kind: 'axis', index: 1, value: 1, line: 4 },
      { t: 40, kind: 'axis', index: 2, value: -1, line: 5 },
      { t: 50, kind: 'axis', index: 3, value: 1, line: 6 },
    ]);
  });

  it('refuses a script line on L3 (the page Crouch bind)', () => {
    expect(() => pageEvents(parseScript('0 cross 1\n10 l3 1'))).toThrow(/script line 2: l3 is the page Crouch bind/);
    expect(() => actMoments(parseScript('10 l3 1'))).toThrow(/script line 1: l3/);
  });
});

/**
 * The hunt (agent-mail/evidence/eph-hunt-2026-11-01 REPORT D4, M5): a release and a press at one ms on one axis went to
 * the page as two writes (0, then +-1), each its own page.evaluate, and a walk tick landed between them in 22 of 22
 * flips. The page's events at one ms are one write: each axis and button once, at its last value.
 */
describe('the page writes: one per ms', () => {
  it('a same-ms release and press on one axis is one write of the final value, never the 0 between', () => {
    const w = pageWrites(parseScript('0 lleft 1\n300 lleft 0\n300 lright 1\n'));
    expect(w).toEqual([
      { t: 0, line: 1, lines: [1], events: [{ t: 0, kind: 'axis', index: 0, value: -1, line: 1 }] },
      { t: 300, line: 2, lines: [2, 3], events: [{ t: 300, kind: 'axis', index: 0, value: 1, line: 3 }] },
    ]);
  });

  it('every page event at one ms rides one write (a stick zero and a Square together: the M1 confound)', () => {
    const w = pageWrites(parseScript('0 lup 1\n500 lup 0\n500 square 1\n600 square 0\n'));
    expect(w.map((x) => [x.t, x.events.map((e) => `${e.kind}${e.index}=${e.value}`)])).toEqual([
      [0, ['axis1=-1']], [500, ['axis1=0', 'button2=1']], [600, ['button2=0']],
    ]);
  });

  it('keeps a light Triangle lead write apart from the release, and stays in time order', () => {
    const w = pageWrites(parseScript('100 triangle 0.2\n200 triangle 0\n200 lup 1\n'));
    expect(w.map((x) => x.t)).toEqual([200 - 3 * FRAME_MS, 200]);
    expect(w[1]!.events.map((e) => `${e.kind}${e.index}`)).toEqual([`button${CROUCH_BUTTON}`, 'axis1']);
  });
});

describe('the crouch button option (the owner setup: Crouch on R3)', () => {
  it('holds R3 (11) for a light Triangle when asked', () => {
    const e = pageEvents(parseScript('100 triangle 0.2\n200 triangle 0\n'), { crouchButton: 11 });
    expect(e.map((x) => x.index)).toEqual([11, 11]);
  });
});
