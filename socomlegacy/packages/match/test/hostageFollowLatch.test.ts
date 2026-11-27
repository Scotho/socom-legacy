import { describe, expect, it } from 'vitest';
import { FOLLOW_RULES_READING, FollowTrail, type FollowLeader } from '../src/hostageFollow';

/**
 * WM-HOSTAGE task 1 (simulation track): the leader's follow heading LATCH, `FUN_005fc970` (D:L509297-509358) and its
 * clear in `FUN_005fcc40` (D:L509375-509376), as research 435 s2 reads them [reading, pending review] -- while the
 * leader's byte +0x515 is set, the facing branch copies the saved heading +0x4f4 instead of the current facing; every
 * update sets +0x515; the tick clears it only while the follower count +0x520 < 1; the sustained run (branch A,
 * `FOLLOW_RULES_READING` headingSpeedSq / headingCos / headingMs, D:L509312-509329) replaces heading and saved.
 *
 * The rig (r0004, MP71, run C5, n = 1, 9157 rows, relayed by the main controller 2026-11-15): the leader's +0x4e8 is
 * constant at his facing at the FOLLOW order through a 90-degree turn and a run east; +0x515 = 1 throughout.
 *
 * No disc: `FollowTrail` alone, the leader's yaw in the walker's convention (forward = (-sin yaw, -cos yaw)).
 */

const DT = 1 / 30;                                     // a test frame; runningMs adds trunc(dt * 1000) = 33 ms each
const leader = (yaw: number, velocity: [number, number, number] = [0, 0, 0]): FollowLeader =>
  ({ id: 1, feet: [0, 0, 0], yaw, velocity, topSpeed: 40, stance: 0 });
const near = (h: [number, number] | null, x: number, z: number): void => {
  expect(h).not.toBeNull();
  expect(h![0]).toBeCloseTo(x, 6);
  expect(h![1]).toBeCloseTo(z, 6);
};

describe('FollowTrail.updateHeading: the leader heading latch (FUN_005fc970 +0x515/+0x4f4; FUN_005fcc40 clear)', () => {
  it('a led leader keeps his facing at the first update, whatever he faces after (branch B, +0x515 set)', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(0));                    // facing (-sin 0, -cos 0) = (0, -1): latched here
    near(t.heading, 0, -1);
    t.updateHeading(DT, leader(90));                   // turned 90 degrees: the facing is now (-1, 0)
    near(t.heading, 0, -1);
    t.updateHeading(DT, leader(200, [5, 0, 5]));       // a slow walk, below the run's speed
    near(t.heading, 0, -1);
  });

  it('release() (the per-tick clear while the follower count < 1) lets the next led update take the new facing', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(0));
    t.updateHeading(DT, leader(90));
    near(t.heading, 0, -1);
    t.release();
    t.updateHeading(DT, leader(90));                   // the first update of a new lead: the current facing, latched
    near(t.heading, -1, 0);
    t.updateHeading(DT, leader(180));
    near(t.heading, -1, 0);
  });

  it('the sustained run (more than headingMs of |v|^2 > headingSpeedSq within headingCos) still replaces the latch', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(90));                   // latched at (-1, 0)
    near(t.heading, -1, 0);
    // Facing yaw 180 = (0, 1), running along it at 30 u/s: |v|^2 = 900 > 800, cos 1 > 0.82.
    const run = leader(180, [0, 0, 30]);
    const per = Math.trunc(DT * 1000), need = Math.floor(FOLLOW_RULES_READING.headingMs / per) + 1;   // 61 frames: 2013 ms
    for (let k = 1; k < need; k++) t.updateHeading(DT, run);
    near(t.heading, -1, 0);                            // 1980 ms: not yet past headingMs, the latch holds
    t.updateHeading(DT, run);
    near(t.heading, 0, 1);                             // past headingMs: heading = saved = the velocity's unit
    t.updateHeading(DT, leader(270));                  // stopped and turned: the run's heading is the saved one now
    near(t.heading, 0, 1);
  });
  // 8f's second read of research 435, correction 2 (relayed by the main controller 2026-11-15; r1 0x5fca30-0x5fcb60 before
  // the latch byte at 0x5fcb70): the running branch is tested BEFORE the latch and while latched; its alignment is the
  // velocity against the CURRENT facing (not the saved heading); all three comparisons strict; the timer is the integer
  // at +0x510 adding (int)(dt x 1000), reset by either failed test and NOT on firing; once fired both words follow the run.
  it('the run branch is aligned against the CURRENT facing, not the latched heading', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(0));                    // latched at (0, -1)
    // He turns to yaw 270 (facing (1, 0)) and runs along it: misaligned with the latch, aligned with his facing.
    const run = leader(270, [30, 0, 0]);
    for (let k = 0; k < 61; k++) t.updateHeading(DT, run);   // 61 x 33 = 2013 ms > 2000
    near(t.heading, 1, 0);
  });

  it('either failed test resets the millisecond timer; the comparisons are strict', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(0));
    const run = leader(180, [0, 0, 30]);
    for (let k = 0; k < 40; k++) t.updateHeading(DT, run);   // 1320 ms
    // |v|^2 = 20^2 + 20^2 = 800 exactly, along the facing (yaw 225: (-sin, -cos) = (0.707, 0.707)): NOT above 800 -- resets
    t.updateHeading(DT, leader(225, [20, 0, 20]));
    for (let k = 0; k < 40; k++) t.updateHeading(DT, run);   // 1320 ms again: not past 2000
    near(t.heading, 0, -1);
    t.updateHeading(DT, leader(270, [0, 0, 30]));            // misaligned with the current facing (1, 0): resets too
    for (let k = 0; k < 60; k++) t.updateHeading(DT, run);   // 1980 ms: not past 2000
    near(t.heading, 0, -1);
  });

  it('once fired, the timer is not reset: heading and saved follow the run direction each update until it ends', () => {
    const t = new FollowTrail();
    t.updateHeading(DT, leader(0));
    for (let k = 0; k < 61; k++) t.updateHeading(DT, leader(180, [0, 0, 30]));
    near(t.heading, 0, 1);
    // Still running, curving: facing yaw 170, velocity along it -- the heading tracks it on the very next update.
    const yaw = 170 * Math.PI / 180, v: [number, number, number] = [-Math.sin(yaw) * 30, 0, -Math.cos(yaw) * 30];
    t.updateHeading(DT, leader(170, v));
    near(t.heading, -Math.sin(yaw), -Math.cos(yaw));
    t.updateHeading(DT, leader(90));                         // the run ends: the last run direction stays (saved)
    near(t.heading, -Math.sin(yaw), -Math.cos(yaw));
  });
});
