import { describe, expect, it } from 'vitest';
import { buildGrid, SEAL_TUNING, type WorldPoly } from '@s2u/scene';
import { Walker } from '../src/mover';

/**
 * R4P-208 (FEEL-M-TURNBAND; simulation track; reading, pending review): turning and easing the stick forward, the
 * original's ground start waits on a TURN BAND before it walks -- the forward must pass 0.03 + turn^2 x 0.27, the turn
 * the turn word `actor+0x23c` as stored (|turn| up to 1.118 at a full look; the port's `Walker.turn / turnMaxRate`).
 * The port has none, so it walks at every forward past the 0.03 dead zone: the players' "turning sideways slowly / on
 * ice" (atlas's r0004 parity plan, R4P-208; MV-A13, r0001 D:L445056-445085).
 *
 * The values are the capture's: FEELMV-C7B-PC2 (the movement register, C7; Shadow PC 2, r0004): standing after a full
 * look turn (the turn word -1.118, the turn memory set), a forward ramping to and past 0.3675 = 0.03 + 1.118^2 x 0.27
 * walks on no frame below it and on the first frame above it (the memory bits `+0x105e` 0x10 -> 0x08 that frame); a
 * forward of 0.3526 held never walks; with no turn, a forward of 0.036 walks (the 0.03 floor); crouched, the same band
 * (C7's crouched runs: no walk at 0.147 / 0.242 / 0.353 through a full turn).
 *
 * The rules are the read's (r0001 FUN_00586570 / FUN_00586f00, r0004 FUN_0058bba0 / FUN_0058c530, identical): the backward
 * band, the right axis's start, the memory's set and clear (`TURN_BAND_READING` in `../src/mover`).
 *
 * A synthetic floor at y 0. "Walks" = the feet move more than WALK_EPS on the horizontal plane in a tick.
 */

const FULL_TURN_WORD = -1.118;
const BAND = 0.03 + FULL_TURN_WORD ** 2 * 0.27;          // 0.3675
const WALK_EPS = 1e-3;
const TICK_HZ = 60;

function floorGrid() {
  const floor: WorldPoly = { modelName: 'worldmodel', path: 'floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-200, 0, -200, -200, 0, 200, 200, 0, 200, 200, 0, -200]) };
  return buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [],
    [floor], [{ modelName: 'worldmodel', path: 'floor', first: 0, count: 1 }]);
}

/** A body standing (or crouched) on the floor, turning at the turn word `word` for `settleTicks` with the stick at rest. */
function turning(word: number, stance: 'stand' | 'crouch' = 'stand', settleTicks = 30): Walker {
  const w = new Walker(floorGrid());
  w.place(0, 1, 0); w.settle(); w.state.yaw = 0;
  if (stance === 'crouch') { w.stance = 'crouch'; for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false }); }
  w.turn = word * SEAL_TUNING.turnMaxRate;
  for (let i = 0; i < settleTicks; i++) w.tick({ forward: 0, right: 0, boost: false });
  return w;
}

/** One tick at `forward`; whether the feet moved on the horizontal plane. */
function step(w: Walker, forward: number): boolean {
  const x = w.state.x, z = w.state.z;
  w.tick({ forward, right: 0, boost: false });
  return Math.hypot(w.state.x - x, w.state.z - z) > WALK_EPS;
}

describe('R4P-208: the ground start waits on the turn band', () => {
  it(`standing after a full look turn, a forward ramping past ${BAND.toFixed(4)} walks only once above the band`, () => {
    const w = turning(FULL_TURN_WORD);
    // a ramp of the STICK, 0.005 a tick from 0.30 to 0.45: the slew (`FUN_00586c10`) catches it by tick 4 and then follows it,
    // so the band's slewed forward crosses with the stick (`TURN_BAND_READING` 'slewed-state'; green before and after the fix)
    let firstWalk: number | null = null;
    for (let f = 0.30; f <= 0.45 + 1e-9; f += 0.005) {
      if (step(w, f) && firstWalk === null) firstWalk = f;
    }
    expect(firstWalk).not.toBeNull();
    expect(firstWalk!).toBeGreaterThan(BAND);
    expect(firstWalk!).toBeLessThan(BAND + 0.02);           // the first frame above it (one 30 Hz frame of the ramp's slack)
  });

  // FINDING-R4P208-slew (seat-movement, 2026-11-24; reading, pending review): standing, the band compares the forward AFTER the
  // slope scale (`FUN_005b56c0`, r0004 0x5bbb00; 1 on this flat floor) and the slew (`FUN_00586c10`, r0004 0x58c240), the
  // value stored back to `+0x240` (r0004 0x58be20 / 0x58be2c) and kept while the band holds (the per-tick copy at the head of
  // `FUN_0057a330`, r0004 0x57f5c0-0x57f5dc). Held from rest, the slew climbs `lo + (hi - lo)(1 - (1 - |target|)^8)` a second
  // (2.0 / 5.0): ~4.92 a second toward 0.3684, 0.0821 a 60 Hz tick -- 0.0821, 0.1641, 0.2462, 0.3283, then 0.3684 >= 0.3675
  // on TICK 5. The original steps it once a 30 Hz game frame (two of these ticks): 0.164, 0.328, then the target on game
  // frame 3, which spans ticks 5-6 -- the same crossing (the finding's section 4, 0.16395 / 0.32786 captured). In THIS harness
  // the press lands one tick late: `turning` settles 30 ticks, so the first press is not on a throttle frame end and the read
  // defers it a tick (`PRESS_FRAME_READING` 'frame-start'), so every count below is one later than the slew alone: the head
  // walks on tick 6, the raw-stick parent walked on tick 2. The window asserted is ticks 4-7 (game frame 3, one tick either
  // side); a tolerance of two game frames would swallow the whole effect.
  const firstWalkHeld = (word: number, f: number, ticks = 2 * TICK_HZ): { first: number | null; after: number } => {
    const w = turning(word);
    let first: number | null = null, after = 0;
    for (let i = 1; i <= ticks; i++) {
      const moved = step(w, f);
      if (moved && first === null) first = i;
      else if (moved && first !== null && i <= first + 30) after++;
    }
    return { first, after };
  };

  it('standing after a full look turn, a mapped 0.3684 held: no walk on ticks 1-3, the first walk on tick 4-7 (tick 6 here), kept', () => {
    const { first, after } = firstWalkHeld(FULL_TURN_WORD, 0.3684);
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThanOrEqual(4);
    expect(first!).toBeLessThanOrEqual(7);
    expect(after).toBe(30);                                       // walking on every tick after it (the memory 'walked')
  });

  it('standing after a full look turn, a control at 0.4635 held: the same slew hold, the first walk on tick 4-7 (tick 6 here)', () => {
    // 0.0830 a tick toward 0.4635: 0.3320 on tick 4 (held), 0.4150 on tick 5 -- the finding's section 5: bytes 65 / 64 / 60
    // all start on game frame 3, on the slope and on flat ground; not earlier than the borderline 0.3684 here
    const { first } = firstWalkHeld(FULL_TURN_WORD, 0.4635);
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThanOrEqual(4);
    expect(first!).toBeLessThanOrEqual(7);
  });

  it('standing after a turn of word -0.5, a mapped 0.3684 held walks by tick 3 (the band 0.0975: the ramp, not a fixed delay)', () => {
    // 0.03 + 0.25 x 0.27 = 0.0975: the press deferred a tick (above), the slew's 0.0821 on tick 2 holds, its 0.1641 on tick 3
    // walks -- game frame 1 of the press, as the original's (FINDING-R4P208-slew s4: the band crossed on the slew's 2nd step)
    const { first } = firstWalkHeld(-0.5, 0.3684);
    expect(first).not.toBeNull();
    expect(first!).toBeGreaterThanOrEqual(2);
    expect(first!).toBeLessThanOrEqual(3);
  });

  it('standing after a full look turn, a forward of 0.3526 held never walks', () => {
    const w = turning(FULL_TURN_WORD);
    let walked = 0;
    for (let i = 0; i < 2 * TICK_HZ; i++) if (step(w, 0.3526)) walked++;
    expect(walked).toBe(0);
  });

  it('with no turn, a forward of 0.036 walks (the 0.03 floor)', () => {
    const w = turning(0);
    let walked = 0;
    for (let i = 0; i < TICK_HZ; i++) if (step(w, 0.036)) walked++;
    expect(walked).toBeGreaterThan(0);
  });

  // The read (FUN_00586570 D:L444899-444901, FUN_00586f00 D:L445057-445082; r0004 the same): backing up has its own band,
  // -(0.045 + t^2 x 0.455); the right axis past 0.03 always starts; the memory dies once the turn is within 0.025.
  it('standing after a full look turn, backing up holds above -(0.045 + t^2 x 0.455) and walks below it', () => {
    const back = -(0.045 + FULL_TURN_WORD ** 2 * 0.455);   // -0.6137
    const held = turning(FULL_TURN_WORD);
    let walked = 0;
    for (let i = 0; i < TICK_HZ; i++) if (step(held, back + 0.02)) walked++;
    expect(walked).toBe(0);
    const goes = turning(FULL_TURN_WORD);
    let moved = 0;
    for (let i = 0; i < TICK_HZ; i++) if (step(goes, back - 0.02)) moved++;
    expect(moved).toBeGreaterThan(0);
  });

  it('standing after a full look turn, the right axis past 0.03 starts whatever the band', () => {
    const w = turning(FULL_TURN_WORD);
    let moved = 0;
    for (let i = 0; i < TICK_HZ; i++) { const x = w.state.x, z = w.state.z; w.tick({ forward: 0, right: 0.05, boost: false }); if (Math.hypot(w.state.x - x, w.state.z - z) > WALK_EPS) moved++; }
    expect(moved).toBeGreaterThan(0);
  });

  it('the memory dies once the turn stops: then backing up at -0.04 walks (a stale memory would hold it down to -0.045)', () => {
    const w = turning(FULL_TURN_WORD);
    w.turn = 0;
    for (let i = 0; i < 4; i++) w.tick({ forward: 0, right: 0, boost: false });
    let walked = 0;
    for (let i = 0; i < TICK_HZ; i++) if (step(w, -0.04)) walked++;
    expect(walked).toBeGreaterThan(0);
  });

  // The 1349-style review's F1 (seat-kill, keyjob-r4p208-turnband-review.md): every stance writes the memory -- a start
  // sets 0x08 from any memory (standing D:L444887-444888 / 444914-444915 / 444939-444940; crouch D:L444167-444168,
  // 444190-444191; prone D:L443902-443903), a held turn past 0.025 sets 0x10 (crouch D:L444231-444232, prone
  // D:L443930-443931), a hold at rest clears both (crouch D:L444322-444323, but not under +0x21c bit 2; prone D:L443967).
  const walkingThenTurn = (stance: 'stand' | 'crouch' | 'prone', f: number): number => {
    const w = turning(0, stance === 'stand' ? 'stand' : 'crouch', 0);
    if (stance === 'prone') { w.stance = 'prone'; for (let i = 0; i < 120; i++) w.tick({ forward: 0, right: 0, boost: false }); }
    for (let i = 0; i < 30; i++) step(w, stance === 'stand' ? 0.45 : f);           // a start: the memory 'walked'
    w.turn = FULL_TURN_WORD * SEAL_TUNING.turnMaxRate;
    let walked = 0;
    for (let i = 0; i < TICK_HZ; i++) if (step(w, f)) walked++;
    return walked;
  };

  it('crouched, walking at 0.2, a full turn begun mid-walk: it keeps walking', () => {
    expect(walkingThenTurn('crouch', 0.2)).toBeGreaterThan(TICK_HZ - 5);
  });

  it('prone, crawling at 0.2, a full turn begun mid-crawl: it keeps crawling', () => {
    expect(walkingThenTurn('prone', 0.2)).toBeGreaterThan(TICK_HZ - 5);
  });

  it("standing, after the band's start, the forward eased to 0.2 with the turn still full: it keeps walking (the flip)", () => {
    expect(walkingThenTurn('stand', 0.2)).toBeGreaterThan(TICK_HZ - 5);
  });

  it("stand, turn, walk, crouch, stop, full turn: 0.147 held never walks (the crouch's own memory, not the stand's)", () => {
    const w = turning(FULL_TURN_WORD);                                           // 'turning'
    for (let i = 0; i < 30; i++) step(w, 0.5);                                   // the start: 'walked'
    w.stance = 'crouch';
    for (let i = 0; i < 30; i++) step(w, 0.5);
    w.turn = 0;
    for (let i = 0; i < 60; i++) w.tick({ forward: 0, right: 0, boost: false }); // the crouch at rest: cleared
    w.turn = FULL_TURN_WORD * SEAL_TUNING.turnMaxRate;
    for (let i = 0; i < 30; i++) w.tick({ forward: 0, right: 0, boost: false }); // the crouch held turning: 'turning'
    let walked = 0;
    for (let i = 0; i < 2 * TICK_HZ; i++) if (step(w, 0.147)) walked++;
    expect(walked).toBe(0);
  });

  for (const f of [0.147, 0.242, 0.353]) {
    it(`crouched, through a full look turn, a forward of ${f} never walks`, () => {
      const w = turning(FULL_TURN_WORD, 'crouch');
      let walked = 0;
      for (let i = 0; i < 2 * TICK_HZ; i++) if (step(w, f)) walked++;
      expect(walked).toBe(0);
    });
  }
});
