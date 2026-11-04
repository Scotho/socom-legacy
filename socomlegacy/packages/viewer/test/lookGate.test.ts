// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { HELD_RIFLE, HELD_SIDEARM } from '@s2u/scene';
import { FlyCamera } from '../src/camera';
import { pitchLimits } from '../src/playerCamera';
import { RifleKick } from '../src/rifleKick';
import { TICK_HZ } from '../src/net/protocol';
import { SEAL_TUNING } from '@s2u/scene';
import { LookLaw, MAX_PITCH_RATE, MAX_YAW_RATE, PITCH_RETURN } from '../src/look';
import { TOUCH_LOOK } from '../src/camera';
import { TICK, INTERRUPT_STICK } from '../src/mover';
import { Button } from '../src/net/protocol';
import {
  BINOCULARS_LOOK_SCALE, LOOK_NARROW_SNAP_ADAPTATION, LOOK_RATE_MAX_ADAPTATION, LOOK_SLACK_TICKS_PLACEHOLDER, LOOK_SNAP_GRACE_PLACEHOLDER, LookGate, lookAllowance, lookContextOf, LookLog, looserLookContext,
  OPEN_LOOK_CONTEXT,
  type LookContext,
} from '../src/net/lookGate';
import { shortTurn, wrapYaw } from '../src/yaw';

/**
 * NET-LOOK (OT.R38 / H115, "Controller only"; research 223 §3.1 MEDIUM-4): the look held to the stick's law and the
 * turn derived from it, one gate for the room's mover and the page's prediction (`MoverSim.prepare`, `WalkMode`).
 */

const DEG = 180 / Math.PI;
/** A gate past its spawn grace: one command facing the mover arms it. */
function armed(ref = { yaw: 0, pitch: 0 }): LookGate {
  const g = new LookGate();
  g.step(ref, { yaw: ref.yaw, pitch: ref.pitch, buttons: 0 });
  return g;
}
/** The page's camera pitch at a spawn (`walk.ts` `respawn`: `INIT_AIM_PITCH`, -9.167). */
const INIT_PITCH = -9.167;
const M4A1: LookContext = { scopeScale: 1 / 2.5, kickRate: 0.5 };

describe('the law the gate holds (look.ts)', () => {
  it('the full stick: 2.236 rad/s yaw, 0.950 rad/s pitch at RECRUIT; the gate a tick of the fastest a player can set (CTL.R2)', () => {
    expect(MAX_YAW_RATE).toBeCloseTo(2.236, 3);
    expect(MAX_PITCH_RATE).toBeCloseTo(0.950, 3);
    // OT.R72: CONTROLLER OPTIONS' fastest gain (1.0, SEAL and the LOOK SPEED slider's top): 3.44 and 1.462 rad/s.
    expect(LOOK_RATE_MAX_ADAPTATION.yaw).toBeCloseTo(3.44, 3);
    expect(LOOK_RATE_MAX_ADAPTATION.pitch).toBeCloseTo(1.462, 3);
    const a = lookAllowance(1, { scopeScale: 1, kickRate: 0 });
    expect(a.yaw).toBeCloseTo(LOOK_RATE_MAX_ADAPTATION.yaw * TICK * DEG, 9);    // 3.285 degrees a tick
    expect(a.pitch).toBeCloseTo((LOOK_RATE_MAX_ADAPTATION.pitch + PITCH_RETURN) * TICK * DEG, 9);   // the stick and the return add (stepPitch)
  });

  it('every view state: normal 1, scoped 1 / the least scope level, the binoculars 1 / 1.5 x 0.2', () => {
    expect(BINOCULARS_LOOK_SCALE).toBeCloseTo(0.2 / 1.5, 12);
    const ctx = lookContextOf({ zoomModes: [1.5, 2.5], rifleKick: { stand: { rate: 0.5, returnRate: 0.18 }, crouch: null, prone: null } });
    expect(ctx).toEqual({ scopeScale: 1 / 2.5, kickRate: 0.5 });
    expect(lookContextOf({ zoomModes: [1.5, 3, 6, 10], rifleKick: { stand: null } }).scopeScale).toBeCloseTo(1 / 3, 12);
    expect(lookContextOf({ zoomModes: [1.5], rifleKick: {} }).scopeScale).toBe(1);      // no scope: nothing narrower
    for (const [buttons, scale] of [[0, 1], [Button.Scope, 1 / 2.5], [Button.Scope | Button.Binoculars, BINOCULARS_LOOK_SCALE]] as const) {
      const h = new LookGate();
      h.step({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0, buttons }, M4A1);   // arms in this view (laid as given: no bank)
      // A turn far past the law: the tick's own allowance, nothing banked.
      const out = h.step({ yaw: 0, pitch: 0 }, { yaw: 90, pitch: 60, buttons }, M4A1);
      const kicking = buttons !== 0;                                     // P13 (AR-5): the kick's rate a scoped view's only
      const a = lookAllowance(scale, M4A1, kicking);
      expect(out.clampedYaw, `buttons ${buttons}`).toBe(true);
      expect(shortTurn(0, out.yaw)).toBeCloseTo(a.yaw, 9);
      expect(out.pitch, `buttons ${buttons}`).toBeCloseTo(a.pitch, 9);
      expect(a.yaw).toBeCloseTo(LOOK_RATE_MAX_ADAPTATION.yaw * scale * TICK * DEG, 9);
      expect(out.pitch, `buttons ${buttons}`).toBeCloseTo((LOOK_RATE_MAX_ADAPTATION.pitch * scale + PITCH_RETURN + (kicking ? 0.5 : 0)) * TICK * DEG, 9);
    }
  });
});

describe('a snap is held to the law, and its turn derived from what it was let do', () => {
  it('a 180 degree snap in one command moves at most the tick and the bank, and its turn passes the cut (0.1 of turn_maxrate)', () => {
    const g = armed();
    for (let i = 0; i < 10; i++) g.step({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0, buttons: 0 });   // still: the bank full
    const out = g.step({ yaw: 0, pitch: 0 }, { yaw: 180, pitch: 0, buttons: 0 });
    const a = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    expect(out.clampedYaw).toBe(true);
    expect(Math.abs(shortTurn(0, out.yaw))).toBeCloseTo(a * (1 + LOOK_SLACK_TICKS_PLACEHOLDER), 9);
    expect(Math.abs(out.turn / SEAL_TUNING.turnMaxRate)).toBeGreaterThan(INTERRUPT_STICK);
    expect(g.clamps).toBe(1);
  });

  it('the page reporting turn 0 changes nothing: the turn is the look\'s, never the command\'s', () => {
    const g = armed();
    const out = g.step({ yaw: 0, pitch: 0 }, { yaw: 2, pitch: 0, buttons: 0 });
    expect(out.clampedYaw).toBe(false);
    expect(out.yaw).toBe(2);
    expect(out.turn).toBeCloseTo((2 / DEG) / TICK / LOOK_SLACK_TICKS_PLACEHOLDER, 9);
  });
});

describe('the snaps the game makes are allowed', () => {
  /**
   * LATER 14 (research 270's row; the original snaps the facing at spawn, research 91 §4.2 D:L395768-395800): after a
   * facing the room set on a new mover, a command beyond the law's reach of it -- the page's stale look, sent before it
   * heard -- holds the mover at the set facing (was: laid as given, ~0.5 s of free turn); one within the reach (the
   * command's own allowance and the slack bank; the law over any commands the gate never stepped) arms the gate, as given.
   * A stale command holds the set pitch with the yaw. The command that faces the spawn is laid as given, pitch included.
   */
  it("LATER 14: a new mover's stale looks hold the set facing; the page's first command within the law's reach arms the gate", () => {
    const g = new LookGate();
    const spawn = { yaw: 270, pitch: 0 };
    // Sent before the page heard of the spawn: its old facing and pitch -- held at the set facing, turn 0.
    for (let i = 0; i < 5; i++) {
      const out = g.step(spawn, { yaw: 40, pitch: -5, buttons: 0 });
      expect([out.yaw, out.pitch, out.clampedYaw, out.turn]).toEqual([270, 0, false, 0]);
    }
    // The page's first command facing the spawn arms the gate, its pitch laid as given (the camera's snap).
    expect(g.step(spawn, { yaw: 270, pitch: -9.167, buttons: 0 })).toMatchObject({ yaw: 270, pitch: -9.167, clampedYaw: false });
    expect(g.step(spawn, { yaw: 90, pitch: 0, buttons: 0 }).clampedYaw).toBe(true);
    expect(g.clamps).toBe(1);
  });

  it('LATER 14: a modified page gets no free turn -- far looks in the grace hold the set facing, none laid', () => {
    const g = new LookGate();
    const spawn = { yaw: 0, pitch: 0 };
    // Far from the set facing on every command (150-169 degrees off: past the reach, 1 + 4 ticks of 2.135), so none is
    // laid -- a look that came within the reach would be the page's snap, as given. The pitch is held with the yaw.
    for (let i = 0; i < LOOK_SNAP_GRACE_PLACEHOLDER; i++) {
      const out = g.step(spawn, { yaw: wrapYaw(150 + (i % 20)), pitch: 70, buttons: 0 });
      expect(out.yaw, `command ${i}`).toBe(0);
      expect(out.pitch, `command ${i}`).toBe(0);
    }
  });

  it('LATER 14: a page that never faces the set facing arms at the grace\'s end from the held facing, then the law', () => {
    const g = new LookGate();
    for (let i = 0; i < LOOK_SNAP_GRACE_PLACEHOLDER; i++) g.step({ yaw: 0, pitch: 0 }, { yaw: 120, pitch: 0, buttons: 0 });
    const out = g.step({ yaw: 0, pitch: 0 }, { yaw: 120, pitch: 0, buttons: 0 });
    expect(out.clampedYaw).toBe(true);
    expect(Math.abs(shortTurn(0, out.yaw))).toBeLessThanOrEqual(lookAllowance(1, OPEN_LOOK_CONTEXT).yaw * (1 + LOOK_SLACK_TICKS_PLACEHOLDER) + 1e-6);
  });

  it('LATER 14 (e3\'s pin): an honest page that hears the spawn 20 commands late, then turns at the full stick, arms at once and is never held', () => {
    const g = new LookGate();
    const spawn = { yaw: 90, pitch: 0 };
    for (let i = 0; i < 20; i++) g.step(spawn, { yaw: 300, pitch: 12, buttons: 0 });   // stale: its old look
    // Heard: the camera at the spawn's yaw, the stick full on -- one tick's turn a command (a frame of two ticks: two).
    const tick = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    let ref = spawn, look = 90 + 2 * tick;
    for (let k = 0; k < 40; k++) {
      const out = g.step(ref, { yaw: wrapYaw(look), pitch: INIT_PITCH, buttons: 0 });
      expect(out.clampedYaw, `command ${k}`).toBe(false);
      expect(out.yaw, `command ${k}`).toBeCloseTo(wrapYaw(look), 6);
      ref = { yaw: out.yaw, pitch: out.pitch };
      look += tick;
    }
    expect(g.clamps).toBe(0);
  });

  /**
   * LATER 157 (LATER 14's re-check F1 / F2): the room tells the gate what it never ran (`skipped`: a dropped stretch's
   * unstepped commands within the ticks it observed, the numbers lost past its wait within the credit) -- the grace's reach
   * widens by the law over them; a number gap the room did not report buys nothing, and a fresh gate needs no number.
   */
  it("LATER 157: a drop the room reports in the grace (the page's snap among it) arms on the next command it runs; untold, held", () => {
    const tick = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    const spawn = { yaw: 0, pitch: 0 };
    const told = new LookGate();
    told.skipped(7);                                                          // the snap and 6 more, dropped at the spawn
    const out = told.step(spawn, { yaw: wrapYaw(8 * tick), pitch: 0, buttons: 0 });
    expect(out.yaw).toBeCloseTo(wrapYaw(8 * tick), 6);                       // armed, as the page's gate is
    expect(told.step({ yaw: out.yaw, pitch: 0 }, { yaw: wrapYaw(9 * tick), pitch: 0, buttons: 0 }).clampedYaw).toBe(false);
    const untold = new LookGate();
    expect(untold.step(spawn, { yaw: wrapYaw(8 * tick), pitch: 0, buttons: 0 }).yaw).toBe(0);   // held: nothing reported
  });

  it("LATER 157 (its re-check's F1): several reports before one step are held to the cap together, not each", () => {
    const tick = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    const spawn = { yaw: 0, pitch: 0 };
    const g = new LookGate();
    g.skipped(6, 6); g.skipped(6, 6); g.skipped(6, 6);                        // three reports, each within 6 ticks since the spawn
    expect(g.step(spawn, { yaw: wrapYaw(14 * tick), pitch: 0, buttons: 0 }).yaw).toBe(0);   // 6 + 1 + 4 = 11 ticks: held
    const h = new LookGate();
    h.skipped(6, 6); h.skipped(6, 6);
    expect(h.step(spawn, { yaw: wrapYaw(10 * tick), pitch: 0, buttons: 0 }).yaw).toBeCloseTo(wrapYaw(10 * tick), 6);   // within 11: armed
  });

  it('LATER 157: a gap in the command numbers alone buys nothing -- a modified page skipping numbers is held as before', () => {
    const tick = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    const spawn = { yaw: 0, pitch: 0 };
    const g = new LookGate();
    g.step(spawn, { seq: 1, yaw: 200, pitch: 0, buttons: 0 } as never);
    expect(g.step(spawn, { seq: 30, yaw: wrapYaw(20 * tick), pitch: 0, buttons: 0 } as never).yaw).toBe(0);
  });

  it("LATER 14: a takeover's or respawn's replay (the page's `respawn`, the same gate) holds the stale commands the room holds", () => {
    const room = new LookGate(), page = new LookGate();
    const spawn = { yaw: 180, pitch: 0 };
    const cmds = [{ yaw: 10, pitch: 0, buttons: 0 }, { yaw: 12, pitch: 0, buttons: 0 }, { yaw: 181, pitch: 0, buttons: 0 }, { yaw: 182, pitch: 0, buttons: 0 }];
    let a = spawn, b = spawn;
    for (const c of cmds) { const x = room.step(a, c), y = page.step(b, c); expect(x).toEqual(y); a = { yaw: x.yaw, pitch: x.pitch }; b = { yaw: y.yaw, pitch: y.pitch }; }
    expect(a.yaw).toBeCloseTo(182, 6);
  });

  it("LATER 14 (d1's pin): a turret mount inside a spawn's grace -- `allowSnap` on every steer command (room.ts PB-2) -- lays each steer yaw as given, the spawn's count not carried", () => {
    const g = new LookGate();
    const spawn = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 3; i++) g.step(spawn, { yaw: 200, pitch: 0, buttons: 0 });   // stale, held
    let ref = spawn;
    for (const yaw of [150, 155, 330, 10]) {
      g.allowSnap();
      const out = g.step(ref, { yaw, pitch: 4, buttons: 0 });
      expect([out.yaw, out.pitch, out.clampedYaw]).toEqual([yaw, 4, false]);
      ref = { yaw: out.yaw, pitch: out.pitch };
    }
    expect(g.step(ref, { yaw: 180, pitch: 4, buttons: 0 }).clampedYaw).toBe(true);    // the steer done: held again
  });

  it('a move holding the yaw (the ladder and its 180): the move lays the yaw, the gate neither holds nor turns', () => {
    const g = armed();
    const out = g.step({ yaw: 0, pitch: 0 }, { yaw: 180, pitch: 0, buttons: 0 }, OPEN_LOOK_CONTEXT, true);
    expect([out.yaw, out.clampedYaw, out.turn]).toEqual([180, false, 0]);
    expect(g.clamps).toBe(0);
  });

  it("a facing the room sets on a mover it keeps (a turret's mount, `allowSnap`): the one command as given, then held", () => {
    const g = armed();
    g.allowSnap();
    expect(g.step({ yaw: 0, pitch: 0 }, { yaw: 150, pitch: 10, buttons: 0 })).toMatchObject({ yaw: 150, pitch: 10, clampedYaw: false });
    expect(g.step({ yaw: 150, pitch: 10 }, { yaw: 0, pitch: 10, buttons: 0 }).clampedYaw).toBe(true);
  });
});

describe('an honest controller is never held', () => {
  /** The full stick's look, sampled once a drawn frame of `frameS` and laid on that frame's whole ticks (`Walker.advance`). */
  function stick(frameS: number, seconds: number, jitter = 0, buttons = 0, ctx: LookContext = OPEN_LOOK_CONTEXT, scale = 1): { clamps: number; turns: number[] } {
    const g = armed();
    for (let i = 0; i < LOOK_SLACK_TICKS_PLACEHOLDER; i++) g.step({ yaw: 0, pitch: 0 }, { yaw: 0, pitch: 0, buttons }, ctx);   // at rest first
    let yaw = 0, pitch = 0, acc = 0, t = 0, ref = { yaw: 0, pitch: 0 }, k = 0;
    const turns: number[] = [];
    while (t < seconds) {
      const dt = frameS + (k++ % 2 ? jitter : -jitter);
      t += dt;
      yaw = wrapYaw(yaw + MAX_YAW_RATE * scale * dt * DEG);
      pitch = Math.max(-60, Math.min(60, pitch + MAX_PITCH_RATE * scale * dt * DEG * (Math.sin(t) > 0 ? 1 : -1)));
      acc += dt;
      while (acc >= TICK - 1e-9) {
        acc -= TICK;
        const q = { yaw: Math.round(yaw * 65536 / 360) * 360 / 65536, pitch: Math.round(pitch * 100) / 100, buttons };
        const out = g.step(ref, q, ctx);
        ref = { yaw: out.yaw, pitch: out.pitch };
        turns.push(out.turn);
      }
    }
    return { clamps: g.clamps, turns };
  }
  it('at 60, 30 and 20 frames a second, with a jittered 60, at full push: no clamp, and the turn is the law\'s on the mean', () => {
    for (const [frame, jitter] of [[1 / 60, 0], [1 / 60, 0.004], [1 / 30, 0], [1 / 20, 0], [1 / 144, 0]] as const) {
      const r = stick(frame, 5, jitter);
      expect(r.clamps, `frame ${frame}, jitter ${jitter}`).toBe(0);
      const tail = r.turns.slice(30);
      expect(tail.reduce((a, b) => a + b, 0) / tail.length).toBeCloseTo(MAX_YAW_RATE, 1);
    }
  });
  it('scoped and in the binoculars at their own rates: no clamp', () => {
    expect(stick(1 / 30, 3, 0, Button.Scope, M4A1, M4A1.scopeScale).clamps).toBe(0);
    expect(stick(1 / 30, 3, 0, Button.Scope | Button.Binoculars, M4A1, BINOCULARS_LOOK_SCALE).clamps).toBe(0);
  });
});

describe('the pitch as the game moves it: the stick and the return together, the kick, a stance\'s narrower limits', () => {
  /**
   * The page's own look (`FlyCamera` walking, the pad's stick), laid tick by tick through the gate with the room's
   * context and the stance's limits, as `MoverSim.prepare` and the page's tick run it. Looks up 60 degrees standing,
   * then goes prone pushing down; `fire` rounds of the rifle's kick (`RifleKick`) on the way down. P13 (AR-5): the page
   * kicks only in the 9x view or a scope (`accuracy.ts` `kickStarts` / `kickTicks`, research 84 §8), so a firing run is
   * scoped -- the camera at the record's least scope level (`ZoomMode1`), every command `Button.Scope`. `unscopeAt`: the
   * tick of the way down the scope is left -- the kick's last step laid on that first unscoped command (a kick the page
   * laid after the frame's commands reaches the next frame's), then no kick, the stick at its unscoped rate.
   */
  function proneDown(record: typeof HELD_RIFLE, fire: boolean, unscopeAt = Infinity): number {
    const c = document.createElement('canvas');
    const fly = new FlyCamera(c);
    fly.setWalking(true);
    fly.setPose({ yaw: 0, pitch: 0 });
    const ctx = lookContextOf(record);
    let buttons = fire ? Button.Scope : 0;
    if (fire) fly.setZoom(record.zoomModes[1]!);
    const kick = new RifleKick(record, () => 0.5);
    const g = new LookGate();
    let ref = { yaw: 0, pitch: 0 };
    let limits = pitchLimits('stand');
    fly.setPitchLimits(...limits);
    const tick = (): void => {
      fly.update(TICK);
      const p = fly.pose();
      const out = g.step(ref, { yaw: Math.round(p.yaw * 65536 / 360) * 360 / 65536, pitch: Math.round(p.pitch * 100) / 100, buttons }, ctx, false, limits);
      ref = { yaw: out.yaw, pitch: out.pitch };
    };
    g.step(ref, { yaw: 0, pitch: 0, buttons }, ctx, false, limits);              // arms
    fly.setLook(0, 1);
    const seconds = fire ? 2 * record.zoomModes[1]! : 2;                         // scoped, the stick's rate / the level
    for (let i = 0; i < seconds * TICK_HZ; i++) tick();
    expect(fly.pose().pitch).toBeCloseTo(limits[1], 3);                          // up at the standing limit
    limits = pitchLimits('prone');
    fly.setPitchLimits(...limits);
    fly.setLook(0, -1);
    for (let i = 0; i < seconds * TICK_HZ; i++) {
      if (i === unscopeAt) { buttons = 0; fly.setZoom(1); }
      if (fire && i < unscopeAt && i % 8 === 0) kick.round(fly.pose().pitch / DEG, 'prone');
      if (fire && i <= unscopeAt) fly.addPitch(kick.frame(TICK, fly.pose().pitch / DEG, -1));
      tick();
    }
    fly.dispose();
    return g.clamps;
  }
  it('the Mark 23: up 60 degrees, then prone pushing down (the stick and the 0.5 rad/s return add): never held', () => {
    expect(proneDown(HELD_SIDEARM, false)).toBe(0);
  });
  it('a rifle the same, scoped and firing on the way down (the kick, and its step into the prone limits at once): never held', () => {
    expect(proneDown(HELD_RIFLE, true)).toBe(0);
  });
  it('P13 (AR-5): leaving the scope mid-kick, its last step on the first unscoped command, the stick then at full: never held', () => {
    for (const at of [1, 2, 3, 42, 43, 44]) expect(proneDown(HELD_RIFLE, true, at), `unscoped at tick ${at}`).toBe(0);
  });
  /**
   * The review fold's finding 2: the tight direction -- the stick UP with the kick, a scoped page frame at the 0.1 s cap (a
   * hitch: six commands spread over it, `WalkMode`'s frame), its kick laid on the camera after its commands (`Fire.frame`
   * runs after the walk's ticks), then a one-tick unscoped frame whose one command carries that whole frame's kick (0.1 s
   * rising at `FireRifleKickRate`) and a full unscoped stick step. More than one unscoped tick's allowance, inside the bank
   * the slow scoped stick left: never held.
   */
  it('P13 (AR-5): the stick up, a scoped 0.1 s hitch frame rising on the kick, then a one-tick unscoped frame: never held', () => {
    const record = HELD_RIFLE, ctx = lookContextOf(record);
    const fly = new FlyCamera(document.createElement('canvas'));
    fly.setWalking(true);
    fly.setPose({ yaw: 0, pitch: 0 });
    const limits = pitchLimits('stand');
    fly.setPitchLimits(...limits);
    fly.setZoom(record.zoomModes[1]!);
    const kick = new RifleKick(record, () => 1);                               // the largest kick the record gives
    const g = new LookGate();
    let ref = { yaw: 0, pitch: 0 }, buttons: number = Button.Scope;
    g.step(ref, { yaw: 0, pitch: 0, buttons }, ctx, false, limits);              // arms, scoped
    const deltas: number[] = [];
    /** One page frame: the stick over `dt`, its ticks' commands spread from the frame's start to its end, then the kit. */
    const frame = (dt: number, fire: boolean): void => {
      const from = fly.pose().pitch;
      fly.update(dt);
      const to = fly.pose().pitch, n = Math.round(dt / TICK);
      for (let k = 1; k <= n; k++) {
        const pitch = Math.round((from + ((to - from) * k) / n) * 100) / 100;
        const out = g.step(ref, { yaw: 0, pitch, buttons }, ctx, false, limits);
        deltas.push(out.pitch - ref.pitch);
        ref = { yaw: out.yaw, pitch: out.pitch };
      }
      if (buttons & Button.Scope) {                                            // the kick ticks only scoped (research 84 §8)
        if (fire) kick.round(fly.pose().pitch / DEG, 'stand');
        fly.addPitch(kick.frame(dt, fly.pose().pitch / DEG, 1));
      } else kick.reset();
    };
    fly.setLook(0, 1);                                                         // the stick full up throughout
    for (let i = 0; i < 60; i++) frame(TICK, i % 9 === 0);                     // a scoped second, firing
    frame(0.1, true);                                                          // the hitch: a round, the kick rising 0.1 s
    buttons = 0;
    fly.setZoom(1);
    frame(TICK, false);                                                        // one tick, unscoped: the hitch's kick on it
    const last = deltas[deltas.length - 1]!;
    expect(last).toBeGreaterThan(lookAllowance(1, ctx, false).pitch);         // past one unscoped tick's own allowance
    for (let i = 0; i < 30; i++) frame(TICK, false);                           // the stick on at its unscoped rate
    fly.dispose();
    expect(g.clamps).toBe(0);
  });
  it('the pitch allowance is the stick, the return and -- in a kicking view -- the kick summed', () => {
    const a = lookAllowance(1, { scopeScale: 1, kickRate: 0.5 }, true);
    expect(a.pitch).toBeCloseTo((LOOK_RATE_MAX_ADAPTATION.pitch + PITCH_RETURN + 0.5) * TICK * DEG, 9);
    const b = lookAllowance(1, { scopeScale: 1, kickRate: 0.5 }, false);
    expect(b.pitch).toBeCloseTo((LOOK_RATE_MAX_ADAPTATION.pitch + PITCH_RETURN) * TICK * DEG, 9);
    // OPEN_LOOK_CONTEXT (a page without the records) holds no pitch in any view.
    expect(lookAllowance(1, OPEN_LOOK_CONTEXT, false).pitch).toBe(Infinity);
    expect(lookAllowance(1, OPEN_LOOK_CONTEXT, true).pitch).toBe(Infinity);
  });

  /**
   * P13 (the online-parity sweep's AR-5; reading, pending review): the page kicks the aim's pitch only in the 9x view or
   * a scope -- the kick starts on a round only at view state > 4 and ticks only at state >= 4 (`FUN_005c5340`
   * D:L479398-479406, `FUN_00550ef0` D:L418390-418393; `accuracy.ts` `kickStarts` / `kickTicks`, `fire.ts` `Fire.frame`;
   * research 84 §8) -- which the command says by `Button.Scope` (the 9x view or a scope, `walk.ts` `setScopedMove`) or
   * `Button.Binoculars`. The gate's pitch allowance takes the kick's rate on those commands alone; was: on every command,
   * so a forged unscoped page had the kick's 0.5 rad/s of pitch on top of the fastest stick and the return.
   */
  it("AR-5: an unscoped command at the fastest stick plus the kick's rate is held; scoped or in the binoculars, its own view's is not", () => {
    const ref = { yaw: 0, pitch: 0 };
    const g = new LookGate();
    g.step(ref, { yaw: 0, pitch: 0, buttons: 0 }, M4A1);                     // arms unscoped (as given: no bank)
    const forged = (LOOK_RATE_MAX_ADAPTATION.pitch + PITCH_RETURN + 0.5 * 0.9) * TICK * DEG;
    const out = g.step(ref, { yaw: 0, pitch: forged, buttons: 0 }, M4A1);
    expect(out.clampedPitch).toBe(true);
    expect(out.pitch).toBeCloseTo((LOOK_RATE_MAX_ADAPTATION.pitch + PITCH_RETURN) * TICK * DEG, 9);
    expect(g.clamps).toBe(1);
    for (const [buttons, scale] of [[Button.Scope, M4A1.scopeScale], [Button.Scope | Button.Binoculars, BINOCULARS_LOOK_SCALE]] as const) {
      const h = new LookGate();
      h.step(ref, { yaw: 0, pitch: 0, buttons }, M4A1);                      // arms in the view
      const honest = (LOOK_RATE_MAX_ADAPTATION.pitch * scale + PITCH_RETURN + 0.5 * 0.9) * TICK * DEG;
      const o = h.step(ref, { yaw: 0, pitch: honest, buttons }, M4A1);
      expect(o.clampedPitch, `buttons ${buttons}`).toBe(false);
      expect(o.pitch).toBe(honest);
      expect(h.clamps).toBe(0);
    }
  });
});

describe('ticks the room has no command for (a dropped backlog, commands lost past the gap wait): `cover`', () => {
  it('the next command may turn as far as the covered ticks and its own allow, and its turn is spread over them', () => {
    const g = armed();
    const a = lookAllowance(1, OPEN_LOOK_CONTEXT).yaw;
    g.cover(13);
    const out = g.step({ yaw: 0, pitch: 0 }, { yaw: 14 * a * 0.4, pitch: 0, buttons: 0 });
    expect(out.clampedYaw).toBe(false);
    expect(out.turn).toBeCloseTo(0.4 * LOOK_RATE_MAX_ADAPTATION.yaw, 6);
    const g2 = armed();
    g2.cover(13);
    expect(g2.step({ yaw: 0, pitch: 0 }, { yaw: 179, pitch: 0, buttons: 0 }).clampedYaw).toBe(true);   // still the law
  });
});

describe('the touch look on the stick law (TOUCH_LOOK_STICK_LAW_ADAPTATION; OT.R38 / H115)', () => {
  it('a 2000 px/s flick is never held by the room, and the view reaches where the finger sent it', () => {
    const c = document.createElement('canvas');
    c.setPointerCapture = () => undefined; c.releasePointerCapture = () => undefined; c.hasPointerCapture = () => false;
    const fly = new FlyCamera(c);
    fly.setWalking(true);
    fly.setPose({ yaw: 0, pitch: 0 });
    const g = armed();
    let ref = { yaw: 0, pitch: 0 };
    const tick = (): void => {
      fly.update(TICK);
      const p = fly.pose();
      const out = g.step(ref, { yaw: Math.round(p.yaw * 65536 / 360) * 360 / 65536, pitch: Math.round(p.pitch * 100) / 100, buttons: 0 }, OPEN_LOOK_CONTEXT, false, pitchLimits('stand'));
      ref = { yaw: out.yaw, pitch: out.pitch };
    };
    const at = (x: number, type: string): void => { c.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: x, clientY: 200, bubbles: true })); };
    // A flick of 300 px in 0.15 s (2000 px a second), 9 frames of 33 px.
    at(1000, 'pointerdown');
    for (let i = 1; i <= 9; i++) { at(1000 - i * (2000 / TICK_HZ), 'pointermove'); tick(); }
    at(1000 - 300, 'pointerup');
    for (let i = 0; i < 4 * TICK_HZ; i++) tick();
    const law = new LookLaw();
    const [want] = law.mouse(-300 * TOUCH_LOOK, 0);
    expect(g.clamps).toBe(0);
    expect(shortTurn(0, fly.pose().yaw)).toBeCloseTo(want * DEG, 3);
    expect(Math.abs(want * DEG)).toBeGreaterThan(30);                           // a turn worth the name
    fly.dispose();
  });
});

describe("the stance's edge is a snap only on the tick the limits narrow (NET-LOOK round 3, finding 4)", () => {
  const STAND: [number, number] = [-70, 60], PRONE: [number, number] = [-20, 25];
  const ctx: LookContext = { scopeScale: 1, kickRate: 0 };
  it('the tick the limits narrow, a mover outside them may be put at their edge at once', () => {
    const g = armed({ yaw: 0, pitch: -60 });
    g.step({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: -60, buttons: 0 }, ctx, false, STAND);
    const out = g.step({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: -20, buttons: 0 }, ctx, false, PRONE);
    expect(out.clampedPitch).toBe(false);
    expect(out.pitch).toBe(-20);
  });
  it('outside the limits on a later tick (drifted to -80 prone), a jump to the edge is held', () => {
    const g = armed({ yaw: 0, pitch: -60 });
    g.step({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: -60, buttons: 0 }, ctx, false, PRONE);
    g.step({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: -60, buttons: 0 }, ctx, false, PRONE);
    const out = g.step({ yaw: 0, pitch: -60 }, { yaw: 0, pitch: -20, buttons: 0 }, ctx, false, PRONE);
    expect(out.clampedPitch).toBe(true);
  });
  it('PRONE-TILT-2 F1 (LOOK_NARROW_SNAP_ADAPTATION "stance"): the prone pair leaned less as the body turns narrows no stance -- a jump to its edge is held; the pitch comes back by the law (FUN_00594600 D:L452908-452919, 0.5 rad/s)', () => {
    expect(LOOK_NARROW_SNAP_ADAPTATION).toBe('stance');
    // facing across to uphill on a 20-degree slope the lean grows; turning back it shrinks: the upper edge falls a degree a tick
    const g = armed({ yaw: 0, pitch: 50 });
    g.step({ yaw: 0, pitch: 50 }, { yaw: 0, pitch: 50, buttons: 0 }, ctx, false, [0, 45]);
    const out = g.step({ yaw: 0, pitch: 50 }, { yaw: 0, pitch: 44, buttons: 0 }, ctx, false, [-1, 44]);
    expect(out.clampedPitch).toBe(true);
    expect(out.pitch).toBeGreaterThan(45);                                            // the law's reach (with its bank), not the edge
    // the stance change still narrows the pair: standing to prone on the slope, its edge at once
    const h = armed({ yaw: 0, pitch: 50 });
    h.step({ yaw: 0, pitch: 50 }, { yaw: 0, pitch: 50, buttons: 0 }, ctx, false, STAND);
    expect(h.step({ yaw: 0, pitch: 50 }, { yaw: 0, pitch: 45, buttons: 0 }, ctx, false, [0, 45]).clampedPitch).toBe(false);
  });
});

describe('a weapon record changed under the gate (a pickup): the looser of the two', () => {
  it('looserLookContext takes the wider scope and the faster kick', () => {
    expect(looserLookContext({ scopeScale: 1 / 3, kickRate: 0.2 }, { scopeScale: 0.1, kickRate: 0.5 })).toEqual({ scopeScale: 1 / 3, kickRate: 0.5 });
    // OT.R72 (the gameplay seat's fix): a side at slower rates merged with one at the default bound gives the default --
    // the looser is never stricter than either side; neither side setting it leaves it unset.
    const slow = { yaw: MAX_YAW_RATE, pitch: MAX_PITCH_RATE };
    expect(looserLookContext({ scopeScale: 1, kickRate: 0, rateMax: slow }, { scopeScale: 1, kickRate: 0 }).rateMax).toEqual({ ...LOOK_RATE_MAX_ADAPTATION });
    expect(looserLookContext({ scopeScale: 1, kickRate: 0, rateMax: slow }, { scopeScale: 1, kickRate: 0, rateMax: slow }).rateMax).toEqual(slow);
    expect('rateMax' in looserLookContext({ scopeScale: 1, kickRate: 0 }, { scopeScale: 1, kickRate: 0 })).toBe(false);
  });
});

describe("the facing's replay starts each step where the mover stood (PTT-8, LATER 16; research 224 §4)", () => {
  it("a replay step after a turn a move laid (the 180) starts where the turn left the mover, not on the command's yaw", () => {
    // The walk's order (`WalkMode.frame`): each step recorded with the mover's facing after the tick before (`tickRef`),
    // the gate stepped from it, then the tick -- where a move holding the yaw lays its own (`Traversal.turning`).
    const gate = armed(), log = new LookLog(), mover = { yaw: 0, pitch: 0 };
    const tick = (seq: number, cmdYaw: number, held: boolean, laid: number | null): void => {
      log.record(seq, gate, { yaw: cmdYaw, pitch: 0, buttons: 0 }, OPEN_LOOK_CONTEXT, held, null, { ...mover });
      const out = gate.step(mover, { yaw: cmdYaw, pitch: 0, buttons: 0 }, OPEN_LOOK_CONTEXT, held, null);
      mover.yaw = laid ?? out.yaw; mover.pitch = out.pitch;
    };
    tick(1, 2, false, null);                                     // the acked command: a turn of 2 degrees
    tick(2, 2, true, 92);                                        // the 180 holds the yaw and lays its own: half way
    tick(3, 92, true, 182);                                      // the camera held at the lock: the turn ends at 182
    tick(4, 183, false, null);                                   // the move over: a 1 degree turn from where it left
    expect(mover.yaw).toBe(183);
    // The room's facing after command 1 differs in the pitch only (3 degrees lower); the yaw agrees.
    const r = log.replay(1, { yaw: 2, pitch: -3 }, gate, { ...mover })!;
    expect(r.facings.get(2)).toEqual([92, 0]);                    // the mover's after the tick: the 180's, not the command's 2
    expect(r.facings.get(3)).toEqual([182, 0]);
    expect(r.facings.get(4)).toEqual([183, 0]);                   // step 4 from 182: one degree, under the law -- not held from 92
    expect(r.ref).toEqual({ yaw: 183, pitch: 0 });
    expect(r.gate.clamps).toBe(gate.clamps);
    // A second correction at a later ack replays from the corrected record the same way.
    const again = log.replay(2, { yaw: 92, pitch: 0 }, r.gate, r.ref)!;
    expect(again.facings.get(3)).toEqual([182, 0]);
    expect(again.facings.get(4)).toEqual([183, 0]);
  });
});
