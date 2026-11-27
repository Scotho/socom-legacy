// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WeaponRecord, WeaponStanceName } from '@s2u/scene';
import { Accuracy, defaultFireMode, fireFrames, TICK, type AccuracyInput } from '../src/accuracy';

/**
 * BUG-B14 ("gun feel": the AK-47 blooms and climbs too hard) is (mostly) PARITY, held here.
 *
 * The original, measured: IQ-159 (r0004, seat-shadow's Shadow PC 3, Desert Glory LAN, the weapons taken at the armory; a
 * capture of the original running, UNSCORED). Its record (B14-GUNFEEL-PC3.zip) has not landed on the hub: the values
 * below are the capture's SUMMARY as the controller relayed it in the score report
 * (agent-mail `planning/mega-2026-11-21/pilot/kill/iq159-b14-port-score.md`, 2026-11-24) -- no raw rows, round frames
 * or trial spread were read. When the record lands this pin can be tightened to its rows.
 *
 * The port, here: the real `Accuracy` (`../src/accuracy`, research 84) on the disc's own weapon records (the scene
 * golden `weapon-records.json`, `zweapon.rdr` through `readKitTable`), still for 240 game frames (size at `TargetMin`,
 * climb 0), then one pull, a game frame's `update(TICK)` each frame and `round()` on every fire frame of the original's
 * cadence `fireFrames(FireWait, mode)`; values read at the round's frame. `round()` gets no depth ratio (f = 1,
 * LATER 1141): only values the score report matches WITHOUT a fitted f are pinned.
 *
 * Tolerance: 0.05 px, half a unit of the summary's one decimal ("-4.0", "~10.5", "+3.67" is given to two, held at its
 * own 0.05 too), unless a test says otherwise. A cap the record clamps to is pinned exactly.
 *
 * NOT pinned, and why:
 * - The HK5 SD's size at round 10 (port 18.25, capture 17.3-17.8) and the DE .50's recovery (port ~22 frames for the
 *   climb, capture "before 11") DIFFER: they are v0.4.33's, not this pin's.
 * - The climb CAPS (AK-47 stand ~-21.1, crouch ~-19.2, prone ~-11.1; the 552 SD's absolute -38.9 at round 10, -39.36 at
 *   f = 1): they match only through a depth ratio f fitted to the capture (LATER 1141; the port's own f at the capture's
 *   spot is unscored). The 552 SD's round 4 (port -11.0; the summary's "~-4.73/round" does not show the step) waits on
 *   the raw rows.
 * - The start modes are pinned as the page shows them (`defaultFireMode`); the port labels the AUTO start an adaptation
 *   (OT.R100, `DEFAULT_FIRE_MODE_FULL_AUTO_ADAPTATION`), a labelling question the controller holds open -- this pin
 *   does not touch the label; it holds the page's AUTO start, so turning that flag off would fail it (the capture shows
 *   AUTO, so that failure would be the right signal).
 *
 * These pin behaviour that already matches: they pass on the base (agent/next adadaace32) with no source change.
 */

const GOLDEN = resolve(import.meta.dirname, '../../scene/test/golden/weapon-records.json');
const RECORDS = Object.values(JSON.parse(readFileSync(GOLDEN, 'utf8')).records as Record<string, WeaponRecord>);
const rec = (id: number, name: string): WeaponRecord => {
  const w = RECORDS.find((r) => r.id === id)!;
  expect(w.name).toBe(name);
  return w;
};
const AK47 = (): WeaponRecord => rec(58, 'AK-47');
const SD552 = (): WeaponRecord => rec(67, '552SD');
const HK5SD = (): WeaponRecord => rec(33, 'HK5SD');
const M16A2 = (): WeaponRecord => rec(51, 'M16A2');

const TOL = 0.05;
const SINGLE = 1, BURST = 2, AUTO = 3;

interface Round { frame: number; size: number; climb: number }

/** One pull of `rounds` rounds at the original's cadence, from 8 s still in `stance` (the score report's protocol). */
function pull(w: WeaponRecord, stance: WeaponStanceName, mode: number, rounds: number): Round[] {
  const input: AccuracyInput = { stance, velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 1 };
  const a = new Accuracy(w);
  a.update(TICK, input);
  a.reset();
  for (let i = 0; i < 240; i++) a.update(TICK, input);
  expect(a.state().size).toBe(w.stances[stance].targetMin);
  expect(a.state().offset[1]).toBe(0);
  const gap = fireFrames(w.fireWait, mode);
  const out: Round[] = [];
  a.trigger();
  for (let frame = 0; out.length < rounds; frame++) {
    a.update(TICK, input);
    if (frame % gap === 0) {
      a.round(1, stance);
      const s = a.state();
      out.push({ frame, size: s.size, climb: s.offset[1] });
    }
  }
  return out;
}

const steps = (xs: number[]): number[] => xs.slice(1).map((x, i) => x - xs[i]!);

describe('BUG-B14: the gun feel is the original\'s (IQ-159, r0004 PC 3; unscored capture, summary values, record pending)', () => {
  it('start modes as the page shows them: the AK-47, the 552 SD and the HK5 SD on AUTO, the M16A2 on BURST', () => {
    expect(defaultFireMode(AK47())).toBe(AUTO);
    expect(defaultFireMode(SD552())).toBe(AUTO);
    expect(defaultFireMode(HK5SD())).toBe(AUTO);
    expect(defaultFireMode(M16A2())).toBe(BURST);
  });

  it('AK-47 standing single: the size 1.5 -> ~10.5, no climb; tapped singles never climb', () => {
    const r = pull(AK47(), 'stand', SINGLE, 1)[0]!;
    expect(AK47().stances.stand.targetMin).toBe(1.5);
    expect(r.size).toBeCloseTo(10.5, 1);
    expect(Math.abs(r.size - 10.5)).toBeLessThanOrEqual(TOL);
    expect(r.climb).toBe(0);
    // Taps: each a new pull (trigger() resets the count), so round 1 of every pull is under KnockCount 2.
    const w = AK47();
    const input: AccuracyInput = { stance: 'stand', velocity: [0, 0, 0], airborne: false, yawRate: 0, pitchRate: 0, zoomState: 1 };
    const a = new Accuracy(w);
    const gap = fireFrames(w.fireWait, SINGLE);
    for (let tap = 0; tap < 6; tap++) {
      a.trigger();
      a.round(1, 'stand');
      expect(a.state().offset[1]).toBe(0);
      for (let f = 0; f < gap; f++) a.update(TICK, input);
    }
  });

  it('AK-47 standing auto: the size +3.67 a round to the cap 31; the climb 0, -4.0, -10.5, -17.1 over rounds 1-4', () => {
    const rs = pull(AK47(), 'stand', AUTO, 10);
    expect(rs.map((r) => r.frame).slice(0, 4)).toEqual([0, 4, 8, 12]);
    const open = rs.filter((r) => r.size < 31).map((r) => r.size);
    expect(open.length).toBe(6);                                       // 10.5 ... 28.85, then 31
    for (const d of steps(open)) expect(Math.abs(d - 3.67)).toBeLessThanOrEqual(TOL);
    expect(rs.slice(6).every((r) => r.size === 31)).toBe(true);        // TargetMax 31
    const want = [0, -4.0, -10.5, -17.1];
    rs.slice(0, 4).forEach((r, i) => expect(Math.abs(r.climb - want[i]!)).toBeLessThanOrEqual(TOL));
  });

  it('AK-47 crouched auto: the size caps at 27', () => {
    const rs = pull(AK47(), 'crouch', AUTO, 10);
    expect(rs[0]!.size).toBeLessThan(27);
    expect(rs.slice(5).every((r) => r.size === 27)).toBe(true);
    expect(rs.slice(0, 5).every((r) => r.size < 27)).toBe(true);
  });

  it('AK-47 prone auto: the size +2.67 a round to the cap 25', () => {
    const rs = pull(AK47(), 'prone', AUTO, 10);
    const open = rs.filter((r) => r.size < 25).map((r) => r.size);
    expect(open.length).toBe(6);
    for (const d of steps(open)) expect(Math.abs(d - 2.67)).toBeLessThanOrEqual(TOL);
    expect(rs.slice(6).every((r) => r.size === 25)).toBe(true);
  });

  it('M16A2 burst: rounds at frames 0 / 3 / 6 (capture 0 / 2-4 / 5-7), size 20 on all three, climb only on round 3 (-4.4)', () => {
    const rs = pull(M16A2(), 'stand', BURST, 3);
    expect(rs.map((r) => r.frame)).toEqual([0, 3, 6]);
    expect(rs[1]!.frame).toBeGreaterThanOrEqual(2);
    expect(rs[1]!.frame).toBeLessThanOrEqual(4);
    expect(rs[2]!.frame).toBeGreaterThanOrEqual(5);
    expect(rs[2]!.frame).toBeLessThanOrEqual(7);
    expect(rs.map((r) => r.size)).toEqual([20, 20, 20]);
    expect(rs[0]!.climb).toBe(0);
    expect(rs[1]!.climb).toBe(0);
    expect(Math.abs(rs[2]!.climb - -4.4)).toBeLessThanOrEqual(TOL);
  });

  it('552 SD auto: the size +3.0 a round to the cap 27; the climb 0, 0, first on round 3, then ~-4.73 a round to round 10', () => {
    const rs = pull(SD552(), 'stand', AUTO, 10);
    const open = rs.filter((r) => r.size < 27).map((r) => r.size);
    expect(open.length).toBe(6);
    for (const d of steps(open)) expect(Math.abs(d - 3.0)).toBeLessThanOrEqual(TOL);
    expect(rs.slice(6).every((r) => r.size === 27)).toBe(true);
    expect(rs[0]!.climb).toBe(0);
    expect(rs[1]!.climb).toBe(0);
    expect(Math.abs(rs[2]!.climb - -4.4)).toBeLessThanOrEqual(TOL);      // KnockCount 3: the first climb, 11 x 0.4
    // Rounds 5-9 (round 4 waits on the raw rows): each ~-4.73. The round 9-10 step is NOT pinned: it is -4.73 only if
    // the knock cap is not reached by round 10, which depends on the fitted f (review F1; f = 0.682 caps it).
    for (const d of steps(rs.slice(3, 9).map((r) => r.climb))) expect(Math.abs(d - -4.73)).toBeLessThanOrEqual(TOL);
  });
});
