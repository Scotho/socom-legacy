import { describe, expect, it } from 'vitest';
import { SEAL_TUNING } from '@s2u/scene';
import { flat } from './parity/world';
import { ACTION_CLIPS, ACTION_SECONDS, CROUCH_PRONE_PUSH_READING, RELOAD_PUSH_LAG, STANCE_CUT_TICK_READING, TICK, type ActionEnd, type Stance } from '../src/mover';
import { Button, COMMAND_STANCE_CODES, PROTOCOL_VERSION, STANCE_CODES, type Command } from '../src/net/protocol';
import { decodeCommands, encodeCommands } from '../src/net/codec';

/**
 * SEP-POP (OT.R93; the owner, 2026-10-31: SEPARATE identical to the original, COMBINED as it is): in SEPARATE the stick
 * cuts the player's stance-transition clips past each clip's own `NoInterrupt`, as the original's `FUN_00587c20`
 * (D:L445532, D:L445550-445563) with `FUN_00550ef0`'s stick test (D:L418180-418186) and `FUN_005870e0`'s pop and ground
 * state (D:L445113-445170) -- the quick drop and the pop are that one rule. The disc's `NoInterrupt` (`motion.rdr`):
 * `seal_stand2crouch` and `seal_crouch2prone` absent (0), `seal_stand2prone` 0.9. A forward clip is cut once its phase
 * passes it, a reversed one while its phase (from its end) is under 1 - it; the prone -> stand clip never (its node's
 * bit 0x2 cleared, `FUN_00581c10` D:L442626-442629). The original refuses the three by id only for a controller whose
 * slot +0x30 (`IsAi`) answers (D:L445536-445545; research 191 section 4): the bots. COMBINED-CUT (OT.R93, the owner,
 * 2026-10-31: "3 + 4"): COMBINED's player takes the same cut (`Walker.stanceCut`) and keeps everything else of main's --
 * the pop's code, the hold (`Walker.stanceSeparate` off). The velocity a push leaves is the original's in every mode since
 * the main controller's reading of H392 (redotcom-67, 2026-11-14; COMBINED zeroed it before). Reading, pending
 * review; the pop's figures are proven by EPH (FINDINGS Q3, below).
 */

/** The walker's two words by who runs it: SEPARATE's player, COMBINED's player (the cut, the pop's code), a bot (neither). */
type Who = 'separate' | 'combined' | 'bot';

function rig(from: Stance, who: Who = 'separate') {
  const r = flat(), w = r.walker;
  w.stance = from;
  w.stanceCut = who !== 'bot';
  w.stanceSeparate = who === 'separate';
  const ends: ActionEnd[] = [];
  w.onActionEnd((e) => ends.push(e));
  const tick = (n = 1, right = 0, forward = 0): void => { for (let i = 0; i < n; i++) w.tick({ forward, right, boost: false }); };
  const speed = (): number => Math.hypot(w.state.vx, w.state.vz);
  return { ...r, w, ends, tick, speed };
}

describe('SEP-POP: the quick drop (SEPARATE)', () => {
  it('crouched at stick 0.3, a prone press: the drop on top one game frame, then cut -- prone and crawling (STM.R3)', () => {
    expect(STANCE_CUT_TICK_READING).toBe('a frame behind');
    const r = rig('crouch');
    r.tick(30, 0.3);
    expect(r.w.ground.state).toBe('crouch');
    r.w.changeStance('prone');
    r.tick(2, 0.3);                                              // the push's frame: a forward clip's phase 0 is not past 0
    expect(r.w.action?.name).toBe('crouchToProne');
    r.tick(1, 0.3);                                              // the next frame's driver: cut
    expect(r.w.action).toBeNull();
    expect(r.w.stance).toBe('prone');
    expect(r.w.posture).toBe('prone');
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
    r.tick(1, 0.3);
    expect(r.w.ground.state).toBe('prone');
    expect(r.speed()).toBeGreaterThan(0);
  });
});

describe('SEP-POP: the pop (SEPARATE; EPH FINDINGS Q3, runs 20261031T162343Z..162614Z)', () => {
  it('prone, stick right 0.963, a light press (crouch): the reversed drop is cut on its push, the run at 0.963 x 65', () => {
    const r = rig('prone');
    r.tick(30, 0.963);
    r.w.changeStance('crouch');
    r.tick(1, 0.963);
    // Q3: on the first frame after the release posture crouch, the top action 2 (the run, 0x42 "Run right"); the reversed
    // 0x13 never on top in any frame; 62.7 u/s (0.963 x 65).
    expect(r.w.action).toBeNull();
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
    expect(r.w.stance).toBe('crouch');
    expect(r.w.ground.state).toBe('stand');                    // FUN_00584c60's state 2: the standing run sets
    expect(r.speed()).toBeCloseTo(0.963 * 65, 1);
    for (let i = 0; i < 20; i++) { r.tick(1, 0.963); expect(r.speed()).toBeCloseTo(0.963 * 65, 1); }
    expect(r.w.stance).toBe('crouch');
  });

  it('half a stick (0.40, under 0.838): the crouch walk, its axis ramped at 5 a second (EPH round 4, pop-stick-half)', () => {
    // EPH round 4 (capture, unscored; runs 20261031T170731Z, 170803Z, 170838Z): pad 0.40 -- first frame action 0x14 (the
    // crouch walk), posture 1, the reversed 0x13 never seen; the lateral climbs 0.167 a frame (FUN_00586c10's 5 a second)
    // to 0.911 and holds: 8.5, 11.0, 13.4, then 13.68 u/s. The port's axis goes to 14 / 14.8 = 0.946 (FUN_00584c60
    // D:L444158-444170), 14.19 u/s aside: the 0.911 the capture settles at is open (research 80 section 6f).
    const r = rig('prone');
    r.tick(30, 0.4);
    r.w.changeStance('crouch');
    r.tick(1, 0.4);
    expect(r.w.action).toBeNull();
    expect(r.w.stance).toBe('crouch');
    expect(r.w.ground.state).toBe('crouch');
    let last = r.speed();
    for (let i = 0; i < 30; i++) {
      r.tick(1, 0.4);
      expect(r.w.ground.state).toBe('crouch');
      expect(r.speed()).toBeGreaterThanOrEqual(last - 1e-9);
      expect(r.speed()).toBeLessThanOrEqual((14 / 14.8) * 15 + 1e-6);
      last = r.speed();
    }
    expect(r.speed()).toBeCloseTo((14 / 14.8) * 15, 2);
  });

  it('no stick: the reversed Crouch -> Prone plays whole, 0.846 s (EPH round 4, pop-nostick: 25-26 frames, 0.834-0.851 s)', () => {
    // EPH round 4 (capture, unscored; runs 20261031T170910Z, 170944Z, 171016Z): the reversed 0x13 on top 25-26 frames, its
    // phase from 0.931 down (a frame past (n - 1) / n = 0.970, 0.0372 a frame), then 0x12.
    const r = rig('prone');
    r.w.changeStance('crouch');
    let n = 0;
    while (r.w.action && n < 200) { r.tick(); n++; }
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'complete' });
    expect(n * TICK).toBeGreaterThanOrEqual(0.834 - TICK);
    expect(n * TICK).toBeLessThanOrEqual(0.851 + TICK);
  });
});

describe('SEP-POP: each transition by its own NoInterrupt (SEPARATE)', () => {
  it("the disc's NoInterrupt: stand -> crouch and crouch -> prone 0 (absent), stand -> prone 0.9", () => {
    expect(ACTION_CLIPS.standToCrouch.noInterrupt).toBe(0);
    expect(ACTION_CLIPS.crouchToProne.noInterrupt).toBe(0);
    expect(ACTION_CLIPS.standToProne.noInterrupt).toBe(0.9);
  });

  it('stand -> prone is cut only once its phase passes 0.9', () => {
    const r = rig('stand');
    r.w.changeStance('prone');
    const span = ACTION_CLIPS.standToProne.playback * ((ACTION_CLIPS.standToProne.frames - 1) / ACTION_CLIPS.standToProne.frames);
    const asked = (t: number): number => Math.max(0, t - RELOAD_PUSH_LAG) / span;   // the driver's phase, a frame behind
    while (r.w.action && asked(r.w.action.t + TICK) < 0.85) r.tick();
    let cutAt: number | null = null;
    while (r.w.action) {
      const before = r.w.action.t;
      r.tick(1, 1);
      if (!r.w.action) cutAt = before + TICK;
      else expect(asked(r.w.action.t)).toBeLessThanOrEqual(0.9);
    }
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'standToProne' }, reason: 'cut' });
    expect(asked(cutAt!)).toBeGreaterThan(0.9);
    expect(cutAt!).toBeLessThan(ACTION_SECONDS.standToProne);
    expect(r.w.stance).toBe('prone');
  });

  it('prone -> stand (the drop reversed, its bit 0x2 cleared) is never cut, the stick full over it', () => {
    const r = rig('prone');
    r.w.changeStance('stand');
    r.tick(1, 1);
    expect(r.w.action).toMatchObject({ name: 'standToProne', reversed: true });
    let n = 1;
    while (r.w.action && n < 200) { r.tick(1, 1); n++; }
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'standToProne' }, reason: 'complete' });
    expect(n * TICK).toBeGreaterThanOrEqual(ACTION_SECONDS.standToProne - 1e-9);
  });

  it('stand -> crouch (forward) and crouch -> stand (reversed, bit kept) are cut by the stick', () => {
    const a = rig('stand');
    a.w.changeStance('crouch');
    a.tick(3, 0.5);
    expect(a.ends.at(-1)).toMatchObject({ body: { name: 'standToCrouch' }, reason: 'cut' });
    expect(a.w.stance).toBe('crouch');
    const b = rig('crouch');
    b.w.changeStance('stand');
    b.tick(1, 0.5);
    expect(b.ends.at(-1)).toMatchObject({ body: { name: 'standToCrouch' }, reason: 'cut' });
    expect(b.w.stance).toBe('stand');
  });

  it('a stick under 0.1 never cuts; past 0.1 it does; the turn axis alone cuts (FUN_00550ef0 D:L418182-418185)', () => {
    const slight = rig('crouch');
    slight.w.changeStance('prone');
    let n = 0;
    while (slight.w.action && n < 200) { slight.tick(1, 0.08); n++; }
    expect(slight.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'complete' });
    const past = rig('crouch');
    past.w.changeStance('prone');
    past.tick(3, 0.12);
    expect(past.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
    const turn = rig('crouch');
    turn.w.turn = 0.12 * SEAL_TUNING.turnMaxRate;
    turn.w.changeStance('prone');
    turn.tick(3);
    expect(turn.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
  });

  it('a transition past its NoInterrupt gives way to the peek in SEPARATE (FUN_005b4340(seal, 1) asks FUN_00587c20)', () => {
    const r = rig('crouch');
    r.w.changeStance('prone');
    r.tick(2);
    expect(r.w.actionInterruptible()).toBe(false);              // its push's frame
    r.tick(1);
    expect(r.w.action?.name).toBe('crouchToProne');
    expect(r.w.actionInterruptible()).toBe(true);
  });
});

describe('COMBINED-CUT: COMBINED\'s player takes the stick\'s cut (OT.R93, the owner 2026-10-31: "3 + 4")', () => {
  it('the quick drop: crouched at stick 0.3, a prone (the hold\'s full press): on top one game frame, then prone and crawling', () => {
    const r = rig('crouch', 'combined');
    r.tick(30, 0.3);
    expect(r.w.ground.state).toBe('crouch');
    r.w.changeStance('prone');
    r.tick(2, 0.3);
    expect(r.w.action?.name).toBe('crouchToProne');
    r.tick(1, 0.3);
    expect(r.w.action).toBeNull();
    expect(r.w.stance).toBe('prone');
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
    r.tick(1, 0.3);
    expect(r.w.ground.state).toBe('prone');
    expect(r.speed()).toBeGreaterThan(0);
  });

  it('the pop: prone, the stick full, a crouch: the reversed drop cut on its push, into the crouch run at 65 u/s', () => {
    const r = rig('prone', 'combined');
    r.tick(30, 1);
    r.w.changeStance('crouch');
    r.tick(1, 1);
    expect(r.w.action).toBeNull();
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'cut' });
    expect(r.w.stance).toBe('crouch');
    expect(r.w.ground.state).toBe('stand');
    for (let i = 0; i < 20; i++) r.tick(1, 1);
    expect(r.speed()).toBeCloseTo(65, 1);
    expect(r.w.stance).toBe('crouch');
  });

  /**
   * The main controller's reading of H392 (redotcom-67, 2026-11-14; for the owner to overturn): a stance push's velocity
   * is movement, so the original's in every mode -- `FUN_005817d0` (D:L442494-442518), `FUN_00581c10`
   * (D:L442622-442641) and `FUN_00581540` push the transition and write no velocity. Re-pinned from "COMBINED keeps
   * main's zero at a push": COMBINED and the bots zeroed it (SEP-POP's OT.R93 split, 2026-10-31).
   */
  it('every mode and the bots: a push leaves the velocity as it was (FUN_005817d0 / FUN_00581c10 / FUN_00581540)', () => {
    for (const who of ['combined', 'separate', 'bot'] as const) {
      const r = rig('stand', who);
      r.tick(40, 0, 0.5);
      const vx = r.w.state.vx, vz = r.w.state.vz;
      expect(r.speed()).toBeCloseTo(0.5 * 65, 6);
      r.w.changeStance('prone');
      expect(r.w.action?.name, who).toBe('standToProne');
      expect([r.w.state.vx, r.w.state.vz], who).toEqual([vx, vz]);
    }
  });

  it('prone -> stand stays whole in COMBINED too (bit 0x2), the stick full', () => {
    const r = rig('prone', 'combined');
    r.w.changeStance('stand');
    let n = 0;
    while (r.w.action && n < 200) { r.tick(1, 1); n++; }
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'standToProne' }, reason: 'complete' });
  });

  it('no stick: COMBINED\'s drop plays whole, as on main', () => {
    const r = rig('crouch', 'combined');
    r.w.changeStance('prone');
    let n = 0;
    while (r.w.action && n < 200) { r.tick(); n++; }
    expect(r.ends.at(-1)).toMatchObject({ body: { name: 'crouchToProne' }, reason: 'complete' });
  });
});

describe('SEP-POP: the refusal by id -- the bots (IsAi) keep main\'s held transitions', () => {
  it('stanceCut off: every transition held whole whatever the stick; never interruptible', () => {
    for (const [from, to, name] of [['crouch', 'prone', 'crouchToProne'], ['prone', 'crouch', 'crouchToProne'],
      ['stand', 'prone', 'standToProne'], ['stand', 'crouch', 'standToCrouch'], ['crouch', 'stand', 'standToCrouch']] as const) {
      const r = rig(from, 'bot');
      r.w.changeStance(to);
      r.tick(1, 1);
      expect(r.w.action?.name, `${from} -> ${to}`).toBe(name);
      let n = 0;
      while (r.w.action && n < 200) { expect(r.w.actionInterruptible()).toBe(false); r.tick(1, 1); n++; }
      expect(r.ends.at(-1), `${from} -> ${to}`).toMatchObject({ body: { name }, reason: 'complete' });
    }
  });

  it('a new Walker refuses (the bots\' movers and the room\'s before a command states its mode)', () => {
    expect(flat().walker.stanceCut).toBe(false);
    expect(flat().walker.stanceSeparate).toBe(false);
  });
});

describe('SEP-POP / COMBINED-CUT: the bots are main but for H392\'s drop and pop (a pin of main 60b9d7b49\'s positions)', () => {
  /**
   * Recorded on main 60b9d7b49's mover before SEP-POP: every 10th tick's x, z, stance and action.
   * LATER 1164 (RAMP_LEAD; strafeRamp.test.ts; 2026-11-18): the move reads the stick ramp half a tick ahead, so the
   * opening 20 ticks of full forward from rest cover 0.4965 more (walkSpeed's 1 s total; 0.452 at row 10) and every
   * later row carries that x. Every x here is carried by the head's measured per-row shift of the default walker's trace
   * (+0.452 at row 10, +0.496/+0.497 from row 20). z, every stance and every clip on top are unchanged, so the rows
   * 80-190 relation `x70 + (x - x70) x ratio` holds with the new x70, 20.872. These are the port's own positions, not a
   * capture.
   */
  const MAIN = [
    [10, 5.417, 0, 'stand', '-'], [20, 16.205, 0, 'stand', '-'], [30, 18.538, 0, 'crouch', '-'],
    [40, 20.872, 0, 'crouch', '-'], [50, 20.872, 0, 'crouch', '-'], [60, 20.872, 0, 'crouch', '-'],
    [70, 20.872, 0, 'crouch', '-'], [80, 22.523, 0.195, 'prone', 'crouchToProne'], [90, 24.177, 0.39, 'prone', 'crouchToProne'],
    [100, 25.828, 0.585, 'prone', 'crouchToProne'], [110, 27.481, 0.78, 'prone', 'crouchToProne'], [120, 29.133, 0.975, 'prone', 'crouchToProne'],
    [130, 29.133, 1.25, 'prone', '-'], [140, 29.133, 1.525, 'prone', '-'], [150, 27.481, 1.33, 'crouch', 'crouchToProne'],
    [160, 25.828, 1.135, 'crouch', 'crouchToProne'], [170, 24.177, 0.94, 'crouch', 'crouchToProne'], [180, 22.523, 0.745, 'crouch', 'crouchToProne'],
    [190, 20.872, 0.55, 'crouch', 'crouchToProne'], [200, 20.872, 0.55, 'crouch', '-'], [210, 20.872, 0.55, 'crouch', '-'],
    [220, 21.223, 0.882, 'stand', 'standToCrouch'], [230, 21.574, 1.214, 'stand', 'standToCrouch'], [240, 21.925, 1.545, 'stand', 'standToCrouch'],
    [250, 23.002, 1.745, 'stand', '-'], [260, 25.169, 1.745, 'stand', '-'], [270, 25.77, 1.464, 'prone', 'standToProne'],
    [280, 26.372, 1.184, 'prone', 'standToProne'], [290, 26.973, 0.903, 'prone', 'standToProne'], [300, 27.574, 0.623, 'prone', 'standToProne'],
    [310, 28.175, 0.343, 'prone', 'standToProne'], [320, 28.536, 0.219, 'prone', '-'], [330, 28.536, 0.329, 'prone', '-'],
    [340, 27.935, 0.609, 'stand', 'standToProne'], [350, 27.334, 0.889, 'stand', 'standToProne'], [360, 26.732, 1.17, 'stand', 'standToProne'],
    [370, 26.131, 1.45, 'stand', 'standToProne'], [380, 25.53, 1.73, 'stand', 'standToProne'], [390, 29.502, 1.899, 'stand', '-'],
    [400, 40.336, 1.899, 'stand', '-'], [410, 51.169, 1.899, 'stand', '-']];

  function trace(who: Who | undefined): (string | number)[][] {
    const r = flat(), w = r.walker;
    if (who !== undefined) { w.stanceCut = who !== 'bot'; w.stanceSeparate = who === 'separate'; }
    const out: (string | number)[][] = [];
    let n = 0;
    const run = (k: number, forward: number, right: number): void => {
      for (let i = 0; i < k; i++) {
        w.tick({ forward, right, boost: false });
        if (++n % 10 === 0) out.push([n, +w.state.x.toFixed(3) || 0, +w.state.z.toFixed(3) || 0, w.stance, w.action?.name ?? '-']);
      }
    };
    const to = (s: Stance): void => w.changeStance(s);
    run(20, 1, 0); to('crouch'); run(20, 0.5, 0); run(30, 0, 0); to('prone'); run(70, 0, 0.3);
    to('crouch'); run(40, 0, 1); run(30, 0, 0); to('stand'); run(50, 0.2, 0); to('prone'); run(70, 0, 0.12); to('stand'); run(80, 1, 0);
    return out;
  }

  /**
   * H392 (the owner, 2026-11-14 ~04:05Z in the main controller's seat, verbatim: "Always the original's (Recommended)"):
   * the default walker and the bots carry MOVE-1's push under the drop and the pop (`CROUCH_PRONE_PUSH_READING`,
   * `FUN_0054d9a0` D:L416435-416455), so main's trace holds but for rows 80-190: the drop (ticks 71-120) and the pop
   * (ticks 141-190) move the body along x (the facing) by the clip's root plus the push, each tick 1 + PUSH_TRAVEL / rz
   * (0.0754) of the clip's own, so x = x70 + (main's x - x70) x that ratio; z is untouched (the push is local z alone,
   * which this facing puts on x). The pop brings x back to x70, so rows 200 on are main's. Derived by reading, to 0.005
   * (main's x70 is 20.375 to three places); pinned byte for byte as `H392_MAIN` (was: both equal MAIN).
   */
  /**
   * H392's default walker and bots, recorded byte for byte by a unit-test run on the hub (f88cb14742, the v0422 merge
   * of da8a071948, 2026-11-14; seat 67, `h392-hub-probe.sh`); the derivation below holds it too.
   * LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): re-recorded byte for byte at the head (coreB, the hub, one file,
   * agent/later-1164). Every x is +0.4965 from row 20 on (+0.452 at row 10), from the opening 20 ticks of full forward
   * read half a tick ahead. z, the stances and the clips are identical on all 41 rows.
   */
  const H392_MAIN = [
    [10, 5.417, 0, 'stand', '-'], [20, 16.205, 0, 'stand', '-'], [30, 18.538, 0, 'crouch', '-'],
    [40, 20.872, 0, 'crouch', '-'], [50, 20.872, 0, 'crouch', '-'], [60, 20.872, 0, 'crouch', '-'],
    [70, 20.872, 0, 'crouch', '-'], [80, 20.996, 0.195, 'prone', 'crouchToProne'], [90, 21.121, 0.39, 'prone', 'crouchToProne'],
    [100, 21.245, 0.585, 'prone', 'crouchToProne'], [110, 21.37, 0.78, 'prone', 'crouchToProne'], [120, 21.494, 0.975, 'prone', 'crouchToProne'],
    [130, 21.494, 1.25, 'prone', '-'], [140, 21.494, 1.525, 'prone', '-'], [150, 21.37, 1.33, 'crouch', 'crouchToProne'],
    [160, 21.245, 1.135, 'crouch', 'crouchToProne'], [170, 21.121, 0.94, 'crouch', 'crouchToProne'], [180, 20.996, 0.745, 'crouch', 'crouchToProne'],
    [190, 20.872, 0.55, 'crouch', 'crouchToProne'], [200, 20.872, 0.55, 'crouch', '-'], [210, 20.872, 0.55, 'crouch', '-'],
    [220, 21.223, 0.882, 'stand', 'standToCrouch'], [230, 21.574, 1.214, 'stand', 'standToCrouch'], [240, 21.925, 1.545, 'stand', 'standToCrouch'],
    [250, 23.002, 1.745, 'stand', '-'], [260, 25.169, 1.745, 'stand', '-'], [270, 25.77, 1.464, 'prone', 'standToProne'],
    [280, 26.372, 1.184, 'prone', 'standToProne'], [290, 26.973, 0.903, 'prone', 'standToProne'], [300, 27.574, 0.623, 'prone', 'standToProne'],
    [310, 28.175, 0.343, 'prone', 'standToProne'], [320, 28.536, 0.219, 'prone', '-'], [330, 28.536, 0.329, 'prone', '-'],
    [340, 27.935, 0.609, 'stand', 'standToProne'], [350, 27.334, 0.889, 'stand', 'standToProne'], [360, 26.732, 1.17, 'stand', 'standToProne'],
    [370, 26.131, 1.45, 'stand', 'standToProne'], [380, 25.53, 1.73, 'stand', 'standToProne'], [390, 29.502, 1.899, 'stand', '-'],
    [400, 40.336, 1.899, 'stand', '-'], [410, 51.169, 1.899, 'stand', '-']];

  it('H392: the default walker and the bots (stanceCut off) run main\'s trace but for the drop and the pop, now about 1.17 u', () => {
    const c2p = ACTION_CLIPS.crouchToProne, period = (c2p.playback * (c2p.frames - 1)) / c2p.frames;
    const ratio = 1 + ((CROUCH_PRONE_PUSH_READING * ACTION_SECONDS.crouchToProne) / period) / c2p.travel[1];
    expect(ratio).toBeCloseTo(0.0754, 4);
    const x70 = MAIN[6]![1] as number;
    for (const who of [undefined, 'bot'] as const) {
      const t = trace(who);
      expect(t, `${who ?? 'default'}: the recorded trace`).toEqual(H392_MAIN);
      expect(t.length).toBe(MAIN.length);
      for (let i = 0; i < MAIN.length; i++) {
        const [n, x, z, stance, action] = MAIN[i]! as [number, number, number, string, string];
        if (n < 80 || n >= 200) { expect(t[i], `${who ?? 'default'} row ${n}`).toEqual(MAIN[i]); continue; }
        expect(t[i]![0]).toBe(n);
        expect(t[i]![1] as number, `${who ?? 'default'} row ${n} x`).toBeCloseTo(x70 + (x - x70) * ratio, 2);
        expect(t[i]![2] as number, `${who ?? 'default'} row ${n} z`).toBeCloseTo(z, 3);
        expect(t[i]!.slice(3)).toEqual([stance, action]);
      }
    }
  });

  it('SEPARATE runs another (the control: the pin can tell)', () => {
    expect(trace('separate')).not.toEqual(MAIN);
  });

  /**
   * COMBINED-CUT: COMBINED's player on the same script, recorded on this branch's mover (agent/combined-cut; a regression
   * pin, not a capture). Rows 10-70 are main's to the digit (no transition under a stick yet). Row 80 is the first
   * cut-dependent one: the drop pressed at tick 70 under the stick 0.3 is cut a game frame after it is on top, so the
   * body crawls prone (x held at 20.705, z climbing) where main slid the clip's root to x 28.637. Every later row
   * follows from that place and from the later cuts: the crouch at 140 under the full stick cut on its push into the
   * crouch run (z 10.088 at row 150, where main's reversed clip still slid back), the stand at 210 cut by the stick 0.2
   * (no `standToCrouch` at rows 220-240), the stand -> prone at 260 under the stick 0.12 cut once past its 0.9. Prone ->
   * stand at 330 is never cut (bit 0x2) and plays whole, as on main (rows 340-380). The rows equal SEPARATE's: on this
   * script the zero COMBINED once kept at a push moved no row, the held clip's root carrying the body over it -- since
   * H392 (the main controller's reading) no mode zeroes it, pinned by the push test above.
   * THROTTLE-FRAME (2026-11-14, MISSION R8.1; `FUN_00586c10` D:L445017-445031): rows 150 on moved 0.1625 in z (was z
   * 10.088 at row 150). The push into the crouch run at tick 140 ramps the lateral from the prone's raw 0.3 at 5 a
   * second; the 60 Hz tick snapped its tail (0.8 -> 1 on the 7th tick: past 0.78, 12 a second), and option B judges the
   * snap from the last game frame's value, so it ramps on (0.883, 0.967, 1): 0.15 of a stick-tick less at the strafe's
   * 65, 0.15 x 65 / 60 = 0.1625 u, every later row carried over on the flat floor. Re-pinned to b0's box ft1 at
   * da0f756c8e (data view), which ran the stateless numbering's frames (baadb10904: the same for direct ticks).
   * LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): carried by the head's measured per-row shift of COMBINED's trace, so the
   * `x - shift` relation below still reads it. The shift is x +0.496 from row 20 (the opening full forward), z +0.352
   * from row 150 (the crouch-run press at tick 140: its full-stick lateral ramp read half a tick ahead), and x +0.082 more
   * from row 220 (the stand at 210 under the stick 0.2, its ramp read half a tick ahead). The cut structure is unchanged:
   * no clip on top at rows 80-260, standToProne at 270-310 and 340-380.
   */
  const COMBINED_CUT = [...MAIN.slice(0, 7),
    [80, 21.201, 0.259, 'prone', '-'], [90, 21.201, 0.534, 'prone', '-'], [100, 21.201, 0.809, 'prone', '-'],
    [110, 21.201, 1.084, 'prone', '-'], [120, 21.201, 1.359, 'prone', '-'], [130, 21.201, 1.634, 'prone', '-'],
    [140, 21.201, 1.909, 'prone', '-'], [150, 21.201, 10.278, 'crouch', '-'], [160, 21.201, 21.111, 'crouch', '-'],
    [170, 21.201, 31.944, 'crouch', '-'], [180, 21.201, 42.778, 'crouch', '-'], [190, 21.201, 42.778, 'crouch', '-'],
    [200, 21.201, 42.778, 'crouch', '-'], [210, 21.201, 42.778, 'crouch', '-'], [220, 23.043, 42.778, 'stand', '-'],
    [230, 25.210, 42.778, 'stand', '-'], [240, 27.377, 42.778, 'stand', '-'], [250, 29.543, 42.778, 'stand', '-'],
    [260, 31.710, 42.778, 'stand', '-'], [270, 32.310, 42.497, 'prone', 'standToProne'], [280, 32.913, 42.217, 'prone', 'standToProne'],
    [290, 33.514, 41.937, 'prone', 'standToProne'], [300, 34.114, 41.656, 'prone', 'standToProne'], [310, 34.716, 41.376, 'prone', 'standToProne'],
    [320, 34.957, 41.33, 'prone', '-'], [330, 34.957, 41.44, 'prone', '-'], [340, 34.356, 41.72, 'stand', 'standToProne'],
    [350, 33.754, 42.001, 'stand', 'standToProne'], [360, 33.152, 42.281, 'stand', 'standToProne'], [370, 32.552, 42.561, 'stand', 'standToProne'],
    [380, 31.951, 42.842, 'stand', 'standToProne'], [390, 35.922, 43.01, 'stand', '-'], [400, 46.756, 43.01, 'stand', '-'],
    [410, 57.590, 43.01, 'stand', '-']];

  /**
   * SEPARATE on the same script since MOVE-1 and MOVE-2 (B196; a regression pin, not a capture, recorded on agent/move):
   * row 80 on, x 20.4 where COMBINED's is 20.705 -- the drop's two ticks on top carry the push's 8 / T (0.305 u along
   * the facing's back); every later row follows from that place. Since LATER 678 (SEGMENT-BODY B203, re-measured
   * 2026-11-04): the full-stick crouch run let go at tick 180 plays `Stand -> Crouch` (`CROUCH_RUN_RETURN_READING`,
   * SEPARATE only), rows 190-210, its root carrying the body back about 1.3 u; every later row follows from there.
   * THROTTLE-FRAME (2026-11-14, R8.1): option B's frame-end snap moves the crouch-run press at tick 140 by 0.1625 in z
   * from row 150 on (a regression pin, not a capture). Re-recorded exactly on the box at dd3923dbca (ft5's probe, the
   * trace printed whole); rows 150-180 equal COMBINED's z, as they did before B.
   * LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): re-recorded at the head (coreB, the hub, one file). It moves the same as
   * COMBINED's trace: x +0.496 from row 20, z +0.352 from row 150, x +0.082 more from row 220. Stances and clips are
   * unchanged, and it still agrees with COMBINED to row 180 and parts at 190.
   */
  /** LATER 1219 (the walls trial, 2026-11-21): from row 220 x 0.2167 less, as COMBINED's (below): the stand at 210, cut by the stick 0.2, starts its ground state inside a frame and the press from rest is read a tick later. Re-recorded on the hub. */
  const SEPARATE_MOVE = [
    [10, 5.417, 0, 'stand', '-'], [20, 16.205, 0, 'stand', '-'], [30, 18.538, 0, 'crouch', '-'],
    [40, 20.872, 0, 'crouch', '-'], [50, 20.872, 0, 'crouch', '-'], [60, 20.872, 0, 'crouch', '-'],
    [70, 20.872, 0, 'crouch', '-'], [80, 20.896, 0.259, 'prone', '-'], [90, 20.896, 0.534, 'prone', '-'],
    [100, 20.896, 0.809, 'prone', '-'], [110, 20.896, 1.084, 'prone', '-'], [120, 20.896, 1.359, 'prone', '-'],
    [130, 20.896, 1.634, 'prone', '-'], [140, 20.896, 1.909, 'prone', '-'], [150, 20.896, 10.278, 'crouch', '-'],
    [160, 20.896, 21.111, 'crouch', '-'], [170, 20.896, 31.944, 'crouch', '-'], [180, 20.896, 42.778, 'crouch', '-'],
    [190, 20.58, 42.479, 'crouch', 'standToCrouch'], [200, 20.229, 42.147, 'crouch', 'standToCrouch'], [210, 19.878, 41.815, 'crouch', 'standToCrouch'],
    [220, 21.719, 41.815, 'stand', '-'], [230, 23.886, 41.815, 'stand', '-'], [240, 26.053, 41.815, 'stand', '-'],
    [250, 28.219, 41.815, 'stand', '-'], [260, 30.386, 41.815, 'stand', '-'], [270, 30.987, 41.535, 'prone', 'standToProne'],
    [280, 31.589, 41.255, 'prone', 'standToProne'], [290, 32.19, 40.974, 'prone', 'standToProne'], [300, 32.791, 40.694, 'prone', 'standToProne'],
    [310, 33.392, 40.414, 'prone', 'standToProne'], [320, 33.633, 40.368, 'prone', '-'], [330, 33.633, 40.478, 'prone', '-'],
    [340, 33.032, 40.758, 'stand', 'standToProne'], [350, 32.43, 41.038, 'stand', 'standToProne'], [360, 31.829, 41.319, 'stand', 'standToProne'],
    [370, 31.228, 41.599, 'stand', 'standToProne'], [380, 30.627, 41.879, 'stand', 'standToProne'], [390, 34.599, 42.048, 'stand', '-'],
    [400, 45.433, 42.048, 'stand', '-'], [410, 56.266, 42.048, 'stand', '-']];

  /**
   * H392 (the owner, 2026-11-14: "Always the original's (Recommended)"): COMBINED's drop carries MOVE-1's push too. Its
   * two ticks on top under the stick (rows 80 on) moved the body 2 x 8 / T (0.3056 u) less along x than `COMBINED_CUT`
   * recorded -- SEPARATE's 20.4 where COMBINED had 20.705 -- and every later row follows from that place, the script's
   * pop cut on its push (no tick on top). So x = `COMBINED_CUT`'s - 0.3056 from row 80, z and the rest as recorded.
   * Derived by reading, to 0.005; pinned byte for byte as `H392_COMBINED` (was: `trace('combined')` equals
   * `COMBINED_CUT`). Rows 80-180 now agree with SEPARATE's; the two part at row 190, SEPARATE's crouch-run release
   * (LATER 678, `CROUCH_RUN_RETURN_READING`, SEPARATE only -- H405, not this ruling). The push's zero, gone with the
   * main controller's reading of H392 (2026-11-14), moves no row of either trace: the push runs at the press
   * (`changeStance` -> `applyStance`), and the next tick's held branch (or the cut's ground state) writes the velocity
   * afresh before any move -- the reason the SEPARATE and COMBINED traces agreed before MOVE-1.
   */
  /**
   * COMBINED under H392 and THROTTLE-FRAME, recorded byte for byte by the same hub run as `H392_MAIN`; the derivation
   * below holds it too.
   * LATER 1164 (RAMP_LEAD; strafeRamp.test.ts): re-recorded byte for byte at the head (coreB, the hub, one file). The
   * changes are x +0.496 from row 20, z +0.352 from row 150 (the crouch-run press at tick 140 read half a tick ahead) and
   * x +0.082 more from row 220 (the stand under the stick 0.2). The cut structure is unchanged.
   */
  /**
   * LATER 1219 (the walls trial, 2026-11-21; box/walls-trial-91c233c6c, red only with the press read at a frame's start,
   * the cause-split box): from row 220 every x is 0.2167 less (13 u/s x one 60 Hz tick: the stick 0.2's walk). COMBINED's
   * stand at tick 210 is cut by that stick at once, so its ground state starts at tick 211, inside a game frame, and the
   * press from rest is read at the next frame's start, a tick later (`Walker.idleRead`). z, stances and clips unchanged.
   * Re-recorded on the hub at agent/walls (this commit's parent + the clip read). The port's own trace.
   */
  const H392_COMBINED = [
    [10, 5.417, 0, 'stand', '-'], [20, 16.205, 0, 'stand', '-'], [30, 18.538, 0, 'crouch', '-'],
    [40, 20.872, 0, 'crouch', '-'], [50, 20.872, 0, 'crouch', '-'], [60, 20.872, 0, 'crouch', '-'],
    [70, 20.872, 0, 'crouch', '-'], [80, 20.896, 0.259, 'prone', '-'], [90, 20.896, 0.534, 'prone', '-'],
    [100, 20.896, 0.809, 'prone', '-'], [110, 20.896, 1.084, 'prone', '-'], [120, 20.896, 1.359, 'prone', '-'],
    [130, 20.896, 1.634, 'prone', '-'], [140, 20.896, 1.909, 'prone', '-'], [150, 20.896, 10.278, 'crouch', '-'],
    [160, 20.896, 21.111, 'crouch', '-'], [170, 20.896, 31.944, 'crouch', '-'], [180, 20.896, 42.778, 'crouch', '-'],
    [190, 20.896, 42.778, 'crouch', '-'], [200, 20.896, 42.778, 'crouch', '-'], [210, 20.896, 42.778, 'crouch', '-'],
    [220, 22.738, 42.778, 'stand', '-'], [230, 24.905, 42.778, 'stand', '-'], [240, 27.071, 42.778, 'stand', '-'],
    [250, 29.238, 42.778, 'stand', '-'], [260, 31.405, 42.778, 'stand', '-'], [270, 32.006, 42.497, 'prone', 'standToProne'],
    [280, 32.607, 42.217, 'prone', 'standToProne'], [290, 33.208, 41.937, 'prone', 'standToProne'], [300, 33.81, 41.656, 'prone', 'standToProne'],
    [310, 34.411, 41.376, 'prone', 'standToProne'], [320, 34.651, 41.33, 'prone', '-'], [330, 34.651, 41.44, 'prone', '-'],
    [340, 34.05, 41.72, 'stand', 'standToProne'], [350, 33.449, 42.001, 'stand', 'standToProne'], [360, 32.848, 42.281, 'stand', 'standToProne'],
    [370, 32.246, 42.561, 'stand', 'standToProne'], [380, 31.645, 42.842, 'stand', 'standToProne'], [390, 35.618, 43.01, 'stand', '-'],
    [400, 46.451, 43.01, 'stand', '-'], [410, 57.284, 43.01, 'stand', '-']];

  it('COMBINED: main\'s rows 10-70, then the cut\'s from row 80 (the first cut), with MOVE-1\'s push (H392)', () => {
    const t = trace('combined');
    expect(t, 'COMBINED: the recorded trace').toEqual(H392_COMBINED);
    expect(t.slice(0, 7)).toEqual(MAIN.slice(0, 7));
    expect(t[7]).not.toEqual(MAIN[7]);
    const c2p = ACTION_CLIPS.crouchToProne, period = (c2p.playback * (c2p.frames - 1)) / c2p.frames;
    const shift = 2 * TICK * (CROUCH_PRONE_PUSH_READING / period);
    expect(shift).toBeCloseTo(0.3056, 4);
    expect(t.length).toBe(COMBINED_CUT.length);
    for (let i = 0; i < COMBINED_CUT.length; i++) {
      const [n, x, z, stance, action] = COMBINED_CUT[i]! as [number, number, number, string, string];
      if (n < 80) { expect(t[i]).toEqual(COMBINED_CUT[i]); continue; }
      expect(t[i]![0]).toBe(n);
      expect(t[i]![1] as number, `row ${n} x`).toBeCloseTo(x - shift, 2);
      expect(t[i]![2] as number, `row ${n} z`).toBeCloseTo(z, 3);
      expect(t[i]!.slice(3)).toEqual([stance, action]);
    }
    // SEPARATE's drop and pop carry the same push (`CROUCH_PRONE_PUSH_READING`, `moveParitySeparate.test.ts`): the two
    // agree to row 180 and part at 190 (review F2 of B196: SEPARATE pinned whole).
    const sep = trace('separate');
    expect(sep).toEqual(SEPARATE_MOVE);
    for (let i = 0; i < 18; i++) {
      expect(sep[i]![1] as number, `row ${sep[i]![0]} x`).toBeCloseTo(t[i]![1] as number, 2);
      expect(sep[i]![2] as number, `row ${sep[i]![0]} z`).toBeCloseTo(t[i]![2] as number, 3);
      expect(sep[i]!.slice(3)).toEqual(t[i]!.slice(3));
    }
    expect(sep[18]).not.toEqual(t[18]);
  });
});

describe('SEP-POP: the command carries the mode (the room\'s mover resolves it as the page\'s)', () => {
  const cmd = (over: Partial<Command>): Command => ({ seq: 1, forward: 0, right: 0, yaw: 0, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0, ...over });
  const wire = (c: Command): Command => decodeCommands(encodeCommands({ viewTick: 0, commands: [c] })).commands[0]!;

  it('separate round-trips beside every stance code and both weapons', () => {
    for (let stance = 0; stance < COMMAND_STANCE_CODES.length; stance++) for (const weapon of [0, 1]) for (const separate of [false, true]) {
      const back = wire(cmd({ stance, weapon, separate, buttons: Button.Stance }));
      expect(back.stance).toBe(stance);
      expect(back.weapon).toBe(weapon);
      expect(back.separate).toBe(separate);
    }
  });

  it('the bit came with protocol 12 (B1: a per-tick binary field bumps the version, PF.R33) and stays in 13 (PLANT-AIM bumped it for the JSON alone) and 14 (ER-2: the raise in bit 7 of the same byte) and 15 (PROTO-15: the rules of the mover, the frames of 14) and 16 (WIRE-16: the view\'s three bytes after the same byte) and 17 (WM-DATA-17: the body\'s hand byte, the command unchanged)', () => {
    expect(PROTOCOL_VERSION).toBe(19);   // LATER 1141 (the round's `at`, research 441)
  });

  it('N1: a SEPARATE command\'s pop code (3) is ignored -- SEPARATE has no pop (STM.R2a); COMBINED\'s still pops', () => {
    const pop = COMMAND_STANCE_CODES.indexOf('pop');
    for (const separate of [true, false]) {
      const r = flat();
      let seq = 0;
      const c = (over: Partial<Command> = {}): Command => cmd({ seq: ++seq, separate, yaw: -90, ...over });
      r.sim.apply(c({ buttons: Button.Stance, stance: STANCE_CODES.indexOf('prone') }));
      for (let i = 0; i < 90; i++) r.sim.apply(c());
      expect(r.walker.stance).toBe('prone');
      r.sim.apply(c({ buttons: Button.Stance, stance: pop }));
      expect(r.walker.stance, `separate ${separate}`).toBe(separate ? 'prone' : 'stand');
    }
  });

  it('a command without the field reads as COMBINED on the wire', () => {
    expect(wire(cmd({})).separate).toBe(false);
  });

  it('MoverSim lays it on the walker: a stating command cuts (a player\'s, either mode), its mode on stanceSeparate', () => {
    const r = flat();
    expect(r.walker.stanceCut).toBe(false);
    expect(r.walker.stanceSeparate).toBe(false);
    r.sim.apply(cmd({ seq: 1, separate: true }));
    expect([r.walker.stanceCut, r.walker.stanceSeparate]).toEqual([true, true]);
    r.sim.apply(cmd({ seq: 2 }));                               // a filler keeps what the last said
    expect([r.walker.stanceCut, r.walker.stanceSeparate]).toEqual([true, true]);
    r.sim.apply(cmd({ seq: 3, separate: false }));              // COMBINED-CUT: COMBINED's player cuts too
    expect([r.walker.stanceCut, r.walker.stanceSeparate]).toEqual([true, false]);
  });

  it('COMBINED-CUT: a bot\'s mover (MoverSim.ai, the room\'s CPU seat: IsAi) never cuts, whatever its command says', () => {
    for (const separate of [false, true]) {
      const r = flat();
      r.sim.ai = true;
      r.sim.apply(wire(cmd({ seq: 1, separate })));
      expect(r.walker.stanceCut).toBe(false);
      expect(r.walker.stanceSeparate).toBe(separate);
      let seq = 1;
      r.sim.apply(wire(cmd({ seq: ++seq, yaw: -90, buttons: Button.Stance, stance: STANCE_CODES.indexOf('prone') })));
      for (let i = 0; i < 90; i++) r.sim.apply(wire(cmd({ seq: ++seq, yaw: -90 })));
      r.sim.apply(wire(cmd({ seq: ++seq, yaw: -90, right: 1, buttons: Button.Stance, stance: STANCE_CODES.indexOf('crouch') })));
      expect(r.walker.action?.name).toBe('crouchToProne');
    }
  });

  it('COMBINED-CUT: the room\'s COMBINED pop -- prone, the stick across, a crouch command: the run on that command', () => {
    const r = flat();
    let seq = 0;
    const c = (right: number, stance?: Stance): Command => wire(cmd({ seq: ++seq, right, separate: false, yaw: -90,
      ...(stance ? { buttons: Button.Stance, stance: STANCE_CODES.indexOf(stance) } : {}) }));
    r.sim.apply(c(0, 'prone'));
    for (let i = 0; i < 90; i++) r.sim.apply(c(0));
    for (let i = 0; i < 20; i++) r.sim.apply(c(1));
    r.sim.apply(c(1, 'crouch'));
    expect(r.walker.action).toBeNull();
    expect(r.walker.stance).toBe('crouch');
    for (let i = 0; i < 20; i++) r.sim.apply(c(1));
    expect(Math.hypot(r.walker.state.vx, r.walker.state.vz)).toBeCloseTo(65, 1);
  });

  it('COMBINED-CUT: COMBINED\'s pop code (3) still pops on the room, settled prone and in the drop, the stick across', () => {
    const pop = COMMAND_STANCE_CODES.indexOf('pop');
    // settled prone, the stick across
    const a = flat();
    let seq = 0;
    const c = (r: ReturnType<typeof flat>, right: number, over: Partial<Command> = {}): Command =>
      wire(cmd({ seq: ++seq, right, separate: false, yaw: -90, ...over }));
    a.sim.apply(c(a, 0, { buttons: Button.Stance, stance: STANCE_CODES.indexOf('prone') }));
    for (let i = 0; i < 90; i++) a.sim.apply(c(a, 1));
    expect(a.walker.stance).toBe('prone');
    a.sim.apply(c(a, 1, { buttons: Button.Stance, stance: pop }));
    expect(a.walker.stance).toBe('stand');
    // in the drop, no stick (never cut): the pop replaces it, as on main
    const b = flat();
    seq = 0;
    b.sim.apply(c(b, 0, { buttons: Button.Stance, stance: STANCE_CODES.indexOf('prone') }));
    for (let i = 0; i < 10; i++) b.sim.apply(c(b, 0));
    expect(b.walker.action?.name).toBe('standToProne');
    b.sim.apply(c(b, 0, { buttons: Button.Stance, stance: pop }));
    expect(b.walker.stance).toBe('stand');
    expect(b.walker.action).toBeNull();
  });

  it('the room\'s pop: prone, the stick across, a crouch command -- the run on that command, as the walker\'s own', () => {
    const r = flat();
    let seq = 0;
    const c = (right: number, stance?: Stance): Command => wire(cmd({ seq: ++seq, right, separate: true, yaw: -90,
      ...(stance ? { buttons: Button.Stance, stance: STANCE_CODES.indexOf(stance) } : {}) }));
    r.sim.apply(c(0, 'prone'));
    for (let i = 0; i < 90; i++) r.sim.apply(c(0));
    expect(r.walker.stance).toBe('prone');
    for (let i = 0; i < 20; i++) r.sim.apply(c(1));
    r.sim.apply(c(1, 'crouch'));
    expect(r.walker.action).toBeNull();
    expect(r.walker.stance).toBe('crouch');
    expect(Math.hypot(r.walker.state.vx, r.walker.state.vz)).toBeCloseTo(65, 1);
  });
});
