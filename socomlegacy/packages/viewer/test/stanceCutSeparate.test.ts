import { describe, expect, it } from 'vitest';
import { SEAL_TUNING } from '@s2u/scene';
import { flat } from './parity/world';
import { ACTION_CLIPS, ACTION_SECONDS, RELOAD_PUSH_LAG, STANCE_CUT_TICK_READING, TICK, type ActionEnd, type Stance } from '../src/mover';
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
 * the velocity zeroed at a transition's push (`Walker.stanceSeparate` off), the pop's code, the hold. Reading, pending
 * review; the pop's figures are proven by EPH (FINDINGS Q3, below).
 */

/** The walker's two words by who runs it: SEPARATE's player, COMBINED's player (the cut, main's zero), a bot (neither). */
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

  it('COMBINED keeps main\'s zero at a push (SEPARATE leaves the velocity, FUN_005817d0 / FUN_00581c10 / FUN_00581540)', () => {
    for (const who of ['combined', 'separate', 'bot'] as const) {
      const r = rig('stand', who);
      r.tick(40, 0, 0.5);
      expect(r.speed()).toBeGreaterThan(0);
      r.w.changeStance('prone');
      expect(r.w.action?.name, who).toBe('standToProne');
      if (who === 'separate') expect(r.speed()).toBeGreaterThan(0);
      else expect(r.speed(), who).toBe(0);
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

describe('SEP-POP / COMBINED-CUT: the bots are byte-for-byte main (a pin of main 60b9d7b49\'s positions)', () => {
  /** Recorded on main 60b9d7b49's mover before SEP-POP: every 10th tick's x, z, stance and action. */
  const MAIN = [[10, 4.965, 0, 'stand', '-'], [20, 15.708, 0, 'stand', '-'], [30, 18.042, 0, 'crouch', '-'], [40, 20.375, 0, 'crouch', '-'],
    [50, 20.375, 0, 'crouch', '-'], [60, 20.375, 0, 'crouch', '-'], [70, 20.375, 0, 'crouch', '-'], [80, 22.027, 0.195, 'prone', 'crouchToProne'],
    [90, 23.68, 0.39, 'prone', 'crouchToProne'], [100, 25.332, 0.585, 'prone', 'crouchToProne'], [110, 26.984, 0.78, 'prone', 'crouchToProne'],
    [120, 28.637, 0.975, 'prone', 'crouchToProne'], [130, 28.637, 1.25, 'prone', '-'], [140, 28.637, 1.525, 'prone', '-'],
    [150, 26.984, 1.33, 'crouch', 'crouchToProne'], [160, 25.332, 1.135, 'crouch', 'crouchToProne'], [170, 23.68, 0.94, 'crouch', 'crouchToProne'],
    [180, 22.027, 0.745, 'crouch', 'crouchToProne'], [190, 20.375, 0.55, 'crouch', 'crouchToProne'], [200, 20.375, 0.55, 'crouch', '-'],
    [210, 20.375, 0.55, 'crouch', '-'], [220, 20.726, 0.882, 'stand', 'standToCrouch'], [230, 21.077, 1.214, 'stand', 'standToCrouch'],
    [240, 21.429, 1.545, 'stand', 'standToCrouch'], [250, 22.506, 1.745, 'stand', '-'], [260, 24.673, 1.745, 'stand', '-'],
    [270, 25.274, 1.464, 'prone', 'standToProne'], [280, 25.875, 1.184, 'prone', 'standToProne'], [290, 26.476, 0.903, 'prone', 'standToProne'],
    [300, 27.078, 0.623, 'prone', 'standToProne'], [310, 27.679, 0.343, 'prone', 'standToProne'], [320, 28.04, 0.219, 'prone', '-'],
    [330, 28.04, 0.329, 'prone', '-'], [340, 27.438, 0.609, 'stand', 'standToProne'], [350, 26.837, 0.889, 'stand', 'standToProne'],
    [360, 26.236, 1.17, 'stand', 'standToProne'], [370, 25.635, 1.45, 'stand', 'standToProne'], [380, 25.033, 1.73, 'stand', 'standToProne'],
    [390, 29.006, 1.899, 'stand', '-'], [400, 39.839, 1.899, 'stand', '-'], [410, 50.673, 1.899, 'stand', '-']];

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

  it('the default walker and the bots\' (stanceCut off) both run main\'s trace exactly', () => {
    expect(trace(undefined)).toEqual(MAIN);
    expect(trace('bot')).toEqual(MAIN);
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
   * script the zero COMBINED keeps at a push moves no row, the held clip's root carrying the body over it -- the zero is
   * pinned by its own speed test above.
   */
  const COMBINED_CUT = [...MAIN.slice(0, 7), [80, 20.705, 0.259, 'prone', '-'], [90, 20.705, 0.534, 'prone', '-'],
    [100, 20.705, 0.809, 'prone', '-'], [110, 20.705, 1.084, 'prone', '-'], [120, 20.705, 1.359, 'prone', '-'],
    [130, 20.705, 1.634, 'prone', '-'], [140, 20.705, 1.909, 'prone', '-'], [150, 20.705, 10.088, 'crouch', '-'],
    [160, 20.705, 20.921, 'crouch', '-'], [170, 20.705, 31.755, 'crouch', '-'], [180, 20.705, 42.588, 'crouch', '-'],
    [190, 20.705, 42.588, 'crouch', '-'], [200, 20.705, 42.588, 'crouch', '-'], [210, 20.705, 42.588, 'crouch', '-'],
    [220, 22.682, 42.588, 'stand', '-'], [230, 24.849, 42.588, 'stand', '-'], [240, 27.016, 42.588, 'stand', '-'],
    [250, 29.182, 42.588, 'stand', '-'], [260, 31.349, 42.588, 'stand', '-'], [270, 31.95, 42.308, 'prone', 'standToProne'],
    [280, 32.552, 42.027, 'prone', 'standToProne'], [290, 33.153, 41.747, 'prone', 'standToProne'],
    [300, 33.754, 41.467, 'prone', 'standToProne'], [310, 34.355, 41.186, 'prone', 'standToProne'], [320, 34.596, 41.14, 'prone', '-'],
    [330, 34.596, 41.25, 'prone', '-'], [340, 33.995, 41.531, 'stand', 'standToProne'], [350, 33.393, 41.811, 'stand', 'standToProne'],
    [360, 32.792, 42.091, 'stand', 'standToProne'], [370, 32.191, 42.372, 'stand', 'standToProne'],
    [380, 31.59, 42.652, 'stand', 'standToProne'], [390, 35.562, 42.82, 'stand', '-'], [400, 46.395, 42.82, 'stand', '-'],
    [410, 57.229, 42.82, 'stand', '-']];

  /**
   * SEPARATE on the same script since MOVE-1 and MOVE-2 (B196; a regression pin, not a capture, recorded on agent/move):
   * row 80 on, x 20.4 where COMBINED's is 20.705 -- the drop's two ticks on top carry the push's 8 / T (0.305 u along
   * the facing's back); every later row follows from that place. Since LATER 678 (SEGMENT-BODY B203, re-measured
   * 2026-11-04): the full-stick crouch run let go at tick 180 plays `Stand -> Crouch` (`CROUCH_RUN_RETURN_READING`,
   * SEPARATE only), rows 190-210, its root carrying the body back about 1.3 u; every later row follows from there.
   */
  const SEPARATE_MOVE = [
    [10, 4.965, 0, 'stand', '-'], [20, 15.708, 0, 'stand', '-'], [30, 18.042, 0, 'crouch', '-'],
    [40, 20.375, 0, 'crouch', '-'], [50, 20.375, 0, 'crouch', '-'], [60, 20.375, 0, 'crouch', '-'],
    [70, 20.375, 0, 'crouch', '-'], [80, 20.4, 0.259, 'prone', '-'], [90, 20.4, 0.534, 'prone', '-'],
    [100, 20.4, 0.809, 'prone', '-'], [110, 20.4, 1.084, 'prone', '-'], [120, 20.4, 1.359, 'prone', '-'],
    [130, 20.4, 1.634, 'prone', '-'], [140, 20.4, 1.909, 'prone', '-'], [150, 20.4, 10.088, 'crouch', '-'],
    [160, 20.4, 20.921, 'crouch', '-'], [170, 20.4, 31.755, 'crouch', '-'], [180, 20.4, 42.588, 'crouch', '-'],
    [190, 20.084, 42.29, 'crouch', 'standToCrouch'], [200, 19.733, 41.958, 'crouch', 'standToCrouch'],
    [210, 19.382, 41.626, 'crouch', 'standToCrouch'], [220, 21.358, 41.626, 'stand', '-'],
    [230, 23.525, 41.626, 'stand', '-'], [240, 25.692, 41.626, 'stand', '-'], [250, 27.858, 41.626, 'stand', '-'],
    [260, 30.025, 41.626, 'stand', '-'], [270, 30.626, 41.346, 'prone', 'standToProne'],
    [280, 31.228, 41.065, 'prone', 'standToProne'], [290, 31.829, 40.785, 'prone', 'standToProne'],
    [300, 32.43, 40.504, 'prone', 'standToProne'], [310, 33.031, 40.224, 'prone', 'standToProne'],
    [320, 33.272, 40.178, 'prone', '-'], [330, 33.272, 40.288, 'prone', '-'],
    [340, 32.671, 40.568, 'stand', 'standToProne'], [350, 32.069, 40.849, 'stand', 'standToProne'],
    [360, 31.468, 41.129, 'stand', 'standToProne'], [370, 30.867, 41.409, 'stand', 'standToProne'],
    [380, 30.266, 41.69, 'stand', 'standToProne'], [390, 34.238, 41.858, 'stand', '-'],
    [400, 45.071, 41.858, 'stand', '-'], [410, 55.905, 41.858, 'stand', '-']];

  it('COMBINED: main\'s rows 10-70, then the cut\'s from row 80 (the first cut); the bots\' trace stays main\'s', () => {
    const t = trace('combined');
    expect(t.slice(0, 7)).toEqual(MAIN.slice(0, 7));
    expect(t[7]).not.toEqual(MAIN[7]);
    expect(t).toEqual(COMBINED_CUT);
    // To MOVE-1 (B196) SEPARATE ran these rows too (the zero moves no row on this script); since, SEPARATE's drop and pop
    // carry `FUN_0054d9a0`'s push under 0x13 (`CROUCH_PRONE_PUSH_READING`, `moveParitySeparate.test.ts`) and COMBINED
    // does not (OT.R93): the two part at row 80, the drop on top two ticks under the stick (review F2: pinned whole).
    const sep = trace('separate');
    expect(sep.slice(0, 7)).toEqual(t.slice(0, 7));
    expect(sep[7]).not.toEqual(t[7]);
    expect(sep).toEqual(SEPARATE_MOVE);
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

  it('the bit came with protocol 12 (B1: a per-tick binary field bumps the version, PF.R33) and stays in 13 (PLANT-AIM bumped it for the JSON alone) and 14 (ER-2: the raise in bit 7 of the same byte) and 15 (PROTO-15: the rules of the mover, the frames of 14)', () => {
    expect(PROTOCOL_VERSION).toBe(15);
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
