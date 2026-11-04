import { describe, expect, it } from 'vitest';
import { flat } from './parity/world';
import { ACTION_CLIPS, ACTION_SECONDS, CROUCH_PRONE_PUSH_READING, STANCE_CANCEL_CLIP_SPEED_READING, TICK, type Stance } from '../src/mover';
import { Button, COMMAND_STANCE_CODES, type Command } from '../src/net/protocol';

/**
 * MOVE-1 (B196; OT.R93: SEPARATE identical to the original, COMBINED as main has it; reading, pending review; research 80
 * section 6g). While action 0x13 ("Crouch -> Prone", `seal_crouch2prone`) is current, the body tick `FUN_0054d9a0`
 * (r0001 D:L416435-416455; r0004 twin 0x552790, the same code at 0x552800-0x5528b8) replaces the top play's vector with
 * (0, 0, +-8 / (anim+0x10 x (n - 1) / n)) (`FUN_0028ada0` D:L133349-133366, r0004 0x28c130) and adds it to the actor's
 * velocity `+0x2c`: over the clip, 8 units of local z (behind) against the clip's own -8.39 -- the drop and the pop move
 * about 1.17 u, not 8.45. Capture (eph-hunt rerun-sep-pop, r0004, 3 trials): 0.9-1.1 u in each 0x13.
 */

/** The walker in a stance, its words by who runs it (`stanceCutSeparate.test.ts`'s rig). */
function rig(from: Stance, who: 'separate' | 'combined') {
  const r = flat(), w = r.walker;
  w.stance = from;
  w.stanceCut = true;
  w.stanceSeparate = who === 'separate';
  return { ...r, w };
}

/** Runs a stance change to its clip's end, no stick; the body's travel in its own frame (x right, z behind). */
function travel(from: Stance, to: Stance, who: 'separate' | 'combined'): { right: number; back: number; clip: string | undefined; reversed: boolean | undefined } {
  const r = rig(from, who);
  for (let i = 0; i < 10; i++) r.w.tick({ forward: 0, right: 0, boost: false });
  const x0 = r.w.state.x, z0 = r.w.state.z;
  r.w.changeStance(to);
  let clip: string | undefined, reversed: boolean | undefined;
  for (let i = 0; i < 200; i++) {
    r.w.tick({ forward: 0, right: 0, boost: false });
    if (r.w.action && clip === undefined) { clip = r.w.action.name; reversed = r.w.action.reversed; }
    if (clip !== undefined && !r.w.action) break;
  }
  for (let i = 0; i < 5; i++) r.w.tick({ forward: 0, right: 0, boost: false });
  const dx = r.w.state.x - x0, dz = r.w.state.z - z0;
  // The model's frame: right is (cos, -sin), behind is (sin, cos) of the yaw (`Walker.tick`'s root-motion branch).
  const yaw = (r.w.state.yaw * Math.PI) / 180, c = Math.cos(yaw), s = Math.sin(yaw);
  return { right: dx * c - dz * s, back: dx * s + dz * c, clip, reversed };
}

/**
 * The push's period T as the source has it: the clip's `anim+0x10` (its `playback`) times `FUN_0028ada0`'s (n - 1) / n
 * (D:L133349-133366; r0004 0x28c130) -- not `ACTION_SECONDS` (playback x ((n - 1) / n)^2, the port's one-shot length).
 * Over the port's clip the push carries 8 x ACTION_SECONDS / T = 7.76 u (review F1): the drop nets about 1.17 u.
 */
const PUSH_T = ACTION_CLIPS.crouchToProne.playback * (ACTION_CLIPS.crouchToProne.frames - 1) / ACTION_CLIPS.crouchToProne.frames;
const PUSH_TRAVEL = (CROUCH_PRONE_PUSH_READING * ACTION_SECONDS.crouchToProne) / PUSH_T;

describe('MOVE-1: the crouch <-> prone root travel (SEPARATE)', () => {
  it('names its reading', () => {
    expect(CROUCH_PRONE_PUSH_READING).toBe(8);
    expect(PUSH_T).toBeCloseTo(0.8727, 4);
    expect(PUSH_TRAVEL).toBeCloseTo(7.76, 2);
  });

  it('the drop (crouchToProne forward): about 1.17 u, forward 0.63 and right 0.99 (the transcription; the capture 0.9-1.1)', () => {
    const t = travel('crouch', 'prone', 'separate');
    expect(t.clip).toBe('crouchToProne');
    expect(t.reversed).toBe(false);
    const [rx, rz] = ACTION_CLIPS.crouchToProne.travel;
    expect(t.right).toBeCloseTo(rx, 0.5);
    expect(t.back).toBeCloseTo(rz + PUSH_TRAVEL, 1);              // -0.63: a little forward
    expect(Math.hypot(t.right, t.back)).toBeGreaterThan(1.1);
    expect(Math.hypot(t.right, t.back)).toBeLessThan(1.25);
  });

  it('the pop (crouchToProne reversed): the opposite way, about 1.17 u', () => {
    const t = travel('prone', 'crouch', 'separate');
    expect(t.clip).toBe('crouchToProne');
    expect(t.reversed).toBe(true);
    const [rx, rz] = ACTION_CLIPS.crouchToProne.travel;
    expect(t.right).toBeCloseTo(-rx, 0.5);
    expect(t.back).toBeCloseTo(-(rz + PUSH_TRAVEL), 1);
    expect(Math.hypot(t.right, t.back)).toBeGreaterThan(1.1);
    expect(Math.hypot(t.right, t.back)).toBeLessThan(1.25);
  });
});

describe('MOVE-1: COMBINED unchanged (OT.R93)', () => {
  it('the drop and the pop carry the clip\'s whole travel, as main', () => {
    const [rx, rz] = ACTION_CLIPS.crouchToProne.travel;
    const drop = travel('crouch', 'prone', 'combined');
    expect(drop.right).toBeCloseTo(rx, 0.5);
    expect(drop.back).toBeCloseTo(rz, 0.5);
    const pop = travel('prone', 'crouch', 'combined');
    expect(pop.right).toBeCloseTo(-rx, 0.5);
    expect(pop.back).toBeCloseTo(-rz, 0.5);
  });
});

/**
 * MOVE-4 (B196; OT.R93, SEPARATE only; research 80 section 6g; reading, pending review): the crouch walk's direction.
 * `FUN_00582d10` stores the stick and `FUN_00583350`'s w and 1 - w at `+0xf60..+0xf6c` (D:L443197-443200; w = the
 * stick's angle off the forward axis over 90 degrees, D:L443326-443370); `FUN_0057a330` hands w of the class clip's root
 * velocity to x and 1 - w to z, the class axis's own sign kept and the other axis's taken from the stick
 * (D:L438911-438955), clears the -99 sentinel (D:L438956) and scales by `DAT_0064fc80` = 1 / sqrt(w^2 + (1 - w)^2)
 * (D:L438985, D:L443368): the class band's speed, along atan2(w, 1 - w). r0004: `FUN_0057a330`'s twin 0x57f580 (the
 * block at 0x57fba8 on, the class at `+0x133c`), `FUN_00582d10`'s 0x588310 and `FUN_00583350`'s 0x588950, the same code.
 * Capture (eph-hunt rerun-sep-pop, D1, r0004): 225 degrees with yaw 180 -- 45 degrees off the facing -- where the page
 * ran its class axis at 17.45 u/s.
 */
function crouchWalk(forward: number, right: number, who: 'separate' | 'combined') {
  const r = rig('crouch', who);
  for (let i = 0; i < 90; i++) r.w.tick({ forward, right, boost: false });
  const yaw = (r.w.state.yaw * Math.PI) / 180;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const f = r.w.state.vx * fx + r.w.state.vz * fz, s = r.w.state.vx * rx + r.w.state.vz * rz;
  return { ground: r.w.ground.state, speed: Math.hypot(f, s), angle: (Math.atan2(s, f) * 180) / Math.PI };
}

const deg = (a: number): number => (a * Math.PI) / 180;

describe('MOVE-4: the crouched diagonal (SEPARATE)', () => {
  it('the stick at 45 degrees: along 45 degrees, at the band (about 14)', () => {
    const t = crouchWalk(0.6 * Math.cos(deg(45)), 0.6 * Math.sin(deg(45)), 'separate');
    expect(t.ground).toBe('crouch');
    expect(t.angle).toBeCloseTo(45, 0);
    expect(t.speed).toBeGreaterThan(13.8);
    expect(t.speed).toBeLessThan(14.3);
  });

  it('the stick at 30 degrees: along atan2(w, 1 - w), w = 1/3 -- 26.57 degrees, at the forward band', () => {
    const t = crouchWalk(0.6 * Math.cos(deg(30)), 0.6 * Math.sin(deg(30)), 'separate');
    const w = (Math.asin(Math.sin(deg(30))) * 2) / Math.PI;
    expect((Math.atan2(w, 1 - w) * 180) / Math.PI).toBeCloseTo(26.57, 2);
    expect(t.angle).toBeCloseTo((Math.atan2(w, 1 - w) * 180) / Math.PI, 0);
    expect(t.speed).toBeCloseTo(14, 0);
  });

  it('back and to the left at 30 degrees off the back: the mirror, at the back band', () => {
    const t = crouchWalk(-0.6 * Math.cos(deg(30)), -0.6 * Math.sin(deg(30)), 'separate');
    expect(t.angle).toBeCloseTo(-180 + 26.57, 0);
  });

  it('forward alone: unchanged (14.0 along the facing)', () => {
    const sep = crouchWalk(0.6, 0, 'separate'), comb = crouchWalk(0.6, 0, 'combined');
    expect(sep.angle).toBeCloseTo(0, 3);
    expect(sep.speed).toBeCloseTo(comb.speed, 6);
    expect(sep.speed).toBeCloseTo(14, 0);
  });
});

describe('MOVE-4: COMBINED unchanged (OT.R93; the reading reaches it too -- the owner\'s question, HUMAN_TASKS)', () => {
  it('the stick at 45 degrees runs the class axis, 1 / sqrt(w^2 + (1 - w)^2) fast, as main', () => {
    const t = crouchWalk(0.6 * Math.cos(deg(45)), 0.6 * Math.sin(deg(45)), 'combined');
    expect(Math.abs(t.angle) % 90).toBeCloseTo(0, 3);
    expect(t.speed).toBeGreaterThan(19);
  });
});

/** The parity world run up to speed by the room's commands in a stance mode (`pronePop.test.ts`'s runner), then the dive. */
function diveRig(who: 'separate' | 'combined') {
  const r = flat(), w = r.walker;
  let seq = 0;
  const cmd = (forward: number, buttons = 0, stance = 0): Command =>
    ({ seq: ++seq, forward, right: 0, yaw: -90, pitch: 0, turn: 0, buttons, stance, weapon: 0, separate: who === 'separate' });
  const tick = (forward = 1): void => { r.sim.apply(cmd(forward)); };
  const press = (to: Stance, forward = 1): void => { r.sim.apply(cmd(forward, Button.Stance, COMMAND_STANCE_CODES.indexOf(to))); };
  for (let i = 0; i < 90; i++) tick();
  press('prone');
  expect(r.moves.inDive()).toBe(true);
  for (let i = 0; i < 5; i++) tick();
  return { ...r, w, tick, press };
}

/**
 * MOVE-2 (B196; OT.R93, SEPARATE only; research 80 section 6g; reading, pending review): a stance press under a held
 * stance transition. `FUN_00552ec0` takes it unless the transition refuses its one target (D:L418927-419015: 0x11 prone,
 * 0x19 crouch, 0x13 stand; r0004 0x558080, the three refusals at 0x5581e4, 0x55827c and 0x558474 unchanged); the
 * handler (`FUN_00581dc0` stand, `FUN_00581660` prone, `FUN_00581990` crouch) pops the stack and picks from the posture
 * word `+0x174` the previous take wrote (`FUN_00581ed0` D:L442697): `FUN_00581c10` (D:L442622-442641), `FUN_00581540`
 * (D:L442409-442430), `FUN_005817d0` (D:L442481-442524). r0004 twins 0x5873c0, 0x586c10, 0x586f90, 0x587210, 0x586af0,
 * the same code. The press's toggle `FUN_00594cf0` D:L453360-453425 (r0004 0x59b49c-0x59b6a8, the same code). Captures:
 * eph-hunt rerun-sep-pop (r0004, 3 trials each).
 */
/** Ticks until the walker's action ends (or `cap`), and the action that played. */
function runAction(w: ReturnType<typeof rig>['w'], cap = 200): { ticks: number; name: string | undefined; reversed: boolean | undefined } {
  const a = w.action;
  let n = 0;
  while (w.action && w.action.serial === a?.serial && n < cap) { w.tick({ forward: 0, right: 0, boost: false }); n++; }
  return { ticks: n, name: a?.name, reversed: a?.reversed };
}
const idle = (w: ReturnType<typeof rig>['w'], n: number): void => { for (let i = 0; i < n; i++) w.tick({ forward: 0, right: 0, boost: false }); };

describe('MOVE-2: the stance cancels (SEPARATE)', () => {
  it('C1b / S6: stand pressed during the drop to prone -- standToProne reversed from its end, the whole get-up (0.90-0.92 s)', () => {
    const r = rig('stand', 'separate');
    r.w.changeStance('prone');
    idle(r.w, 15);                                                // 250 ms into the drop (the capture's 233-300 ms)
    expect(r.w.action).toMatchObject({ name: 'standToProne', reversed: false });
    r.w.changeStance('stand');
    idle(r.w, 1);
    expect(r.w.action).toMatchObject({ name: 'standToProne', reversed: true });
    expect(r.w.stance).toBe('stand');
    const run = runAction(r.w);
    expect(run.ticks * TICK).toBeGreaterThan(0.85);
    expect(run.ticks * TICK).toBeLessThan(ACTION_SECONDS.standToProne + 2 * TICK);
    idle(r.w, 3);
    expect(r.w.action).toBeNull();
    expect(r.w.stance).toBe('stand');
  });

  it('C1c: prone pressed during the pop -- crouchToProne restarted forward from 0, about 1 u (0.80-0.82 s)', () => {
    const r = rig('prone', 'separate');
    r.w.changeStance('crouch');
    idle(r.w, 12);                                                // 200 ms into the pop
    expect(r.w.action).toMatchObject({ name: 'crouchToProne', reversed: true });
    const x0 = r.w.state.x, z0 = r.w.state.z;
    r.w.changeStance('prone');
    idle(r.w, 1);
    expect(r.w.action).toMatchObject({ name: 'crouchToProne', reversed: false });
    expect(r.w.action!.t).toBeLessThan(2 * TICK);
    const run = runAction(r.w);
    expect(run.ticks * TICK).toBeGreaterThan(0.78);
    expect(run.ticks * TICK).toBeLessThan(ACTION_SECONDS.crouchToProne + 2 * TICK);
    expect(r.w.stance).toBe('prone');
    expect(Math.hypot(r.w.state.x - x0, r.w.state.z - z0)).toBeLessThan(1.5);
  });

  it('C1d: stand pressed during the pop -- kept, then standToCrouch reversed at the pop\'s end (the 0.57-0.58 s rise)', () => {
    const r = rig('prone', 'separate');
    r.w.changeStance('crouch');
    idle(r.w, 12);
    const pop = r.w.action!.serial;
    r.w.changeStance('stand');
    idle(r.w, 1);
    expect(r.w.action).toMatchObject({ name: 'crouchToProne', reversed: true, serial: pop });   // D:L418995: refused, kept
    expect(r.w.pendingStance).toBe('stand');
    runAction(r.w);
    if (r.w.action === null) idle(r.w, 1);
    expect(r.w.action).toMatchObject({ name: 'standToCrouch', reversed: true });
    const run = runAction(r.w);
    expect(run.ticks * TICK).toBeGreaterThan(0.55);
    idle(r.w, 2);
    expect(r.w.stance).toBe('stand');
  });

  for (const [label, at] of [['early (100 ms)', 6], ['late (300 ms)', 18]] as const) {
    it(`C1a ${label}: stand pressed during standToCrouch -- cut back to standing, no second clip`, () => {
      expect(STANCE_CANCEL_CLIP_SPEED_READING).toBe('clip root 3D over 10 under a held transition');
      const r = rig('stand', 'separate');
      const ends: string[] = [];
      r.w.onActionEnd((e) => ends.push(`${e.body?.name}:${e.reason}`));
      r.w.changeStance('crouch');
      idle(r.w, at);
      expect(r.w.action).toMatchObject({ name: 'standToCrouch', reversed: false });
      r.w.changeStance('stand');
      idle(r.w, 1);
      expect(r.w.action).toBeNull();
      expect(ends.at(-1)).toBe('standToCrouch:replaced');
      expect(r.w.stance).toBe('stand');
      expect(r.w.posture).toBe('stand');
      idle(r.w, 40);
      expect(r.w.action).toBeNull();
      expect(ends).toHaveLength(1);
    });
  }

  it('S3: crouch pressed during the dive -- kept to the dive\'s end, then crouchToProne reversed; ends crouched', () => {
    const d = diveRig('separate');
    d.press('crouch');
    expect(d.moves.inDive()).toBe(true);
    expect(d.w.pendingStance).toBe('crouch');
    const seen: string[] = [];
    for (let i = 0; i < 240; i++) {
      d.tick(0);
      const a = d.w.action;
      if (a) seen.push(`${a.name}:${a.reversed}`);
    }
    expect(d.moves.inDive()).toBe(false);
    expect(seen).toContain('crouchToProne:true');
    expect(d.w.stance).toBe('crouch');
  });
});

describe('MOVE-2: COMBINED unchanged (OT.R93)', () => {
  it('C1b and C1a under COMBINED: the held clip kept (main\'s early return)', () => {
    const b = rig('stand', 'combined');
    b.w.changeStance('prone');
    idle(b.w, 15);
    const drop = b.w.action!.serial;
    b.w.changeStance('stand');
    idle(b.w, 1);
    expect(b.w.action).toMatchObject({ name: 'standToProne', reversed: false, serial: drop });
    const a = rig('stand', 'combined');
    a.w.changeStance('crouch');
    idle(a.w, 6);
    const clip = a.w.action!.serial;
    a.w.changeStance('stand');
    idle(a.w, 1);
    expect(a.w.action).toMatchObject({ name: 'standToCrouch', serial: clip });
  });

  it('S3 under COMBINED: the dive ends prone (the press is the traversal\'s, as main)', () => {
    const d = diveRig('combined');
    d.press('crouch');
    for (let i = 0; i < 240; i++) d.tick(0);
    expect(d.moves.inDive()).toBe(false);
    expect(d.w.stance).toBe('prone');
  });
});

/**
 * S6, spam-mixed (ac's acceptance at bd96f2044: eph-hunt-2026-11-01/move-acceptance, runs 20261102T143637Z, 143746Z,
 * 144009Z; capture comparison, r0004, 3 trials). The script: Triangle full at 500 ms (released 650), light 700-800, full
 * 1100 (released 1250), light 1300-1400. The original's request byte `+0x374` (pcsx2.csv `stanceRequest`): 2 at about
 * 500 (the drop, 0x19), 0 at about 1096 (stand: 0x19 reversed from phase 0.937), the standing idle at about 2035 -- and
 * neither light press taken (the byte unchanged at 800 and 1400, 3/3). The stance machine fed the two presses the
 * original took plays the original's sequence; the page's FAIL is the two light presses it took (its harness feeds them
 * on the Crouch bind, L3), which `FUN_00594cf0`'s re-arm refused in the original. A regression pin of the walker's half;
 * the press's half is MOVE-S6's (`STANCE_PRESS_REARM_READING`, `stancePressRearm.test.ts`; research 80 section 6g).
 */
describe('MOVE-2 S6: spam-mixed, the presses the original took (SEPARATE)', () => {
  it('prone at 500 ms, stand at 1100 ms: the drop rewound from its end, standing at about 2.0 s, as the original', () => {
    const r = rig('stand', 'separate');
    const at = (ms: number): number => Math.round(ms / 1000 / TICK);
    let n = 0;
    const until = (ms: number): void => { while (n < at(ms)) { idle(r.w, 1); n++; } };
    until(500);
    r.w.changeStance('prone');
    until(1100);
    expect(r.w.action).toMatchObject({ name: 'standToProne', reversed: false });
    r.w.changeStance('stand');
    idle(r.w, 1); n++;
    expect(r.w.action).toMatchObject({ name: 'standToProne', reversed: true });
    const run = runAction(r.w);
    n += run.ticks;
    expect(n * TICK).toBeGreaterThan(1.95);                        // the original: the standing idle at 2033-2052 ms
    expect(n * TICK).toBeLessThan(2.1);
    idle(r.w, 2);
    expect(r.w.action).toBeNull();
    expect(r.w.stance).toBe('stand');
  });
});
