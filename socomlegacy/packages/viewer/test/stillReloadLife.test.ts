// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { buildGrid, GAME_FRAME_DT, readKitTable, SEAL_TUNING, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { MagazineRing } from '../src/magazines';
import { mountFirearm } from '../src/matchFirearm';
import type { TraversalPose } from '../src/animator';
import { groundGrid, moverSnapshot, reloadPlayedOut, Walker, type TraversalHooks, type WalkInput } from '../src/mover';
import { MoverSim } from '../src/net/moverSim';
import { Button, type Command } from '../src/net/protocol';
import { Play, reloadCut } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { reloadSeconds } from '../src/reloadClip';
import { reloadCutAt, reloadCutPhase, reloadEnded, reloadLifeSpec, type ReloadLifeSpec } from '../src/reloadLock';
import { simClipsFromBytes } from '../src/simMap';
import { CLIPLESS_LANDING_RELOAD_READING, flinchOnTop, landingPops, reloadPopped, StillReloadLife } from '../src/stillReloadLife';
import { CLIMB_LOCK_RELOAD_DELAY_READING, climbOffered, type TraversalEvent } from '../src/traversal';
import { packGround, WalkMode } from '../src/walk';
import { WeaponPose } from '../src/weaponPose';

/**
 * PARITY-1 D02 (research 251 section 6; research 230 section 1.1 "Still reload, then jump"): the still reload's clip on
 * the page's command clock (`./stillReloadLife`), the room's `reloadLife` by one derivation (`./reloadLock`). In the
 * original `FUN_0057e1b0` refuses the jump while the top of the body's stack is not looped (D:L440805-440810); a reload
 * begun not moving pushes its still clip there (`seal_reload`, `motion.rdr` looped 0) from the kit's timer's end
 * (D:L476550-476558) to its last key or the first command whose stick or turn passes 0.1 past its `NoInterrupt`
 * (`FUN_00550ef0` D:L418174-418190), the jump read before that cut (D:L418119-418130).
 *
 * The unit cases hold the helper's rule. The `WalkMode` cases run the real coordinator with the one firearm
 * (`mountFirearm`) over the disc's clips: written as `it.fails` until the wave-4 wiring landed (the walk's seam and the
 * firearm's line, PAR.R3 -- the hunks were in PARITY-1 wave 2b seat B's report), they are ordinary since (research 251
 * section 6, "Landed at wave 4"). Each runs its setup in `beforeAll`, so a setup error fails its case, never hides.
 */

/**
 * `seal_reload` as the disc has it: 45 keys, playback 1.6 (the M4A1's still seconds), no `NoInterrupt` standing; its
 * overlay 1.164 s.
 */
const STAND: ReloadLifeSpec = { stance: 'stand', family: 'rifle', moving: false, period: 1.6, playback: 1.6, frames: 45, noInterrupt: 0, overlay: 1.2 * (32 / 33) };
/** `seal_crouch_reload`'s shape: `NoInterrupt` 0.35 (research 150 R150.3). */
const CROUCH: ReloadLifeSpec = { ...STAND, stance: 'crouch', frames: 28, period: 1.9, playback: 1.9, noInterrupt: 0.35 };

describe('PARITY-1 D02: the still reload clip\'s life on the command clock (StillReloadLife; the room\'s reloadLife rule)', () => {
  it('lives from its first command to the command its uncut end pops it on (PAR-69: on the lagged clock, a command past its last key): a jump on that command is refused, the next admitted; never before its first command', () => {
    const life = new StillReloadLife();
    life.begin(STAND, 10);
    expect(life.lives(9)).toBe(false);                                           // the kit's timer: nothing on the stack
    expect(life.lives(10)).toBe(true);
    // 1.6 x (44/45)^2 = 1.5297 s = 91.78 commands: the command 10 + 92 is the first at or past the last key. *Moved by
    // PAR-69* (research 251 section 12.5): the driver asks the end before its advance, on the phase a game frame behind
    // the push's clock plus half the clip's own frame step (`FUN_00582540` D:L418193 -> `FUN_0028c6e0`
    // D:L134291-134302), so the clip comes off once t - G + G/2 > 1.5297 s: t > 1.5464 s = 92.78 commands -- the
    // command 10 + 93 (was 10 + 92).
    for (let c = 10; c < 103; c++) { life.ranWith(c, false); expect(life.lives(c + 1)).toBe(true); }
    life.ranWith(103, false);
    expect(life.lives(104)).toBe(false);
  });

  it("a push past NoInterrupt cuts it after the command it rides (the jump on that command refused, read before the cut); a push before NoInterrupt changes nothing", () => {
    const life = new StillReloadLife();
    life.begin(CROUCH, 0);
    // NoInterrupt 0.35 of the phase t / (1.9 x 27/28): a push at command 30 (t 0.5 s, phase 0.27) does not cut.
    for (let c = 1; c <= 30; c++) life.ranWith(c, c === 30);
    expect(life.lives(31)).toBe(true);
    for (let c = 31; c < 50; c++) life.ranWith(c, false);
    expect(life.lives(50)).toBe(true);                                           // a jump on command 50 is still refused
    life.ranWith(50, true);                                                      // its push (phase 0.45) cuts the clip
    expect(life.lives(51)).toBe(false);
  });

  it('holds no life for a moving start, without the clips (no spec: research 251 section 6\'s named gap), or once its reload ends', () => {
    const life = new StillReloadLife();
    life.begin({ ...STAND, moving: true }, 0);
    expect(life.lives(1)).toBe(false);                                           // the overlay rides the looped top
    life.begin(null, 0);
    expect(life.lives(1)).toBe(false);                                           // no clips, no life: nothing refused
    life.start(null, null, 'stand', [0, 0, 0], 'rifle', 1.6, 0);
    expect(life.lives(1)).toBe(false);
    life.begin(STAND, 0);
    expect(life.lives(1)).toBe(true);
    life.end();
    expect(life.lives(1)).toBe(false);
  });

  // LATER 530 (R2 of LATER 526's second re-look): the turret's take sent at send time cuts the reload (`Fire.mountTake`,
  // `reloadEnd` kept); the room refused it before its take's steps (`FUN_005463c0` D:L412131-412166), so the room's
  // `reloadLife` never ended. Kept at the take (`keep`) and handed back at the refusal (`resume`) on its own command clock:
  // the clip's first command stands, so its end (and a jump refused while it lives) is the room's again.
  it("RED: LATER 530 -- kept at a take and handed back at its refusal: the life the room never ended, its end on the room's command", () => {
    type Keeps = { keep(): void; resume(): void };
    const life = new StillReloadLife();
    life.begin(STAND, 10);
    for (let c = 10; c < 40; c++) life.ranWith(c, false);
    (life as unknown as Keeps).keep();                                           // the take's cut
    expect(life.lives(41)).toBe(false);
    (life as unknown as Keeps).resume();                                         // the refusal, 20 commands later
    expect(life.lives(61), "the room's clip lives").toBe(true);                   // today: false (keep/resume unknown: throws)
    for (let c = 61; c < 103; c++) life.ranWith(c, false);
    expect(life.lives(103)).toBe(true);
    life.ranWith(103, false);
    expect(life.lives(104), 'its uncut end where the room\'s is (the first test: 10 + 93)').toBe(false);
    (life as unknown as Keeps).resume();                                         // once
    expect(life.lives(105)).toBe(false);
    life.begin(STAND, 200);
    (life as unknown as Keeps).keep();
    life.begin(STAND, 300);                                                      // a new reload since: the kept one is gone
    life.end();
    (life as unknown as Keeps).resume();
    expect(life.lives(301)).toBe(false);
  });

  it('reads the cut off the walk\'s mover: its cut stick (PAR-64: the pad\'s copy) and its turn past 0.1 (reloadCutOf)', () => {
    const life = new StillReloadLife();
    life.begin(STAND, 0);                                                        // past RELOAD_CUT_DELAY_READING from 3 (PAR-61)
    life.ran(5, { cutStick: { forward: 0.05, right: 0 }, turn: 0, cutAsked: true });
    expect(life.lives(6)).toBe(true);
    life.ran(6, { cutStick: { forward: 0.2, right: 0 }, turn: 0, cutAsked: true });
    expect(life.lives(7)).toBe(false);
  });

  // PAR-60 review F2: off the floor `FUN_005af930` zeroes the turn `+0x23c` with the stick (D:L466805-466815), so the
  // cut's test reads the turn as 0 in the air -- on the walk's mover and on the layer's snapshot (`./play` `reloadCut`).
  it('in the air the turn cuts nothing: an airborne mover turning past 0.1 keeps the clip, the same turn on the floor cuts it (FUN_005af930 D:L466811-466815)', () => {
    const turn = 0.5 * SEAL_TUNING.turnMaxRate, still = { forward: 0, right: 0 };
    const life = new StillReloadLife();
    life.begin(STAND, 0);                                                        // past RELOAD_CUT_DELAY_READING from 3 (PAR-61)
    life.ran(5, { cutStick: still, turn, cutAsked: false });                       // airborne: not asked
    expect(life.lives(6)).toBe(true);
    life.ran(6, { cutStick: still, turn, cutAsked: true });
    expect(life.lives(7)).toBe(false);
    expect(reloadCut({ cutStick: still, turnRate: turn, airborne: true })).toBe(false);
    expect(reloadCut({ cutStick: still, turnRate: turn, airborne: false })).toBe(true);
  });

  // PAR-61 (research 251 section 12.5): the still clip's push sets the initial skip (`FUN_0028dc90` D:L135209-135212),
  // the cut is asked first in the driver (`FUN_00550ef0` D:L418180), strictly past the phase (`FUN_00587c20`
  // D:L445550-445556), the driver's peek spends the skip (`FUN_0028c4f0(dt, top, 0)`, D:L418293) and the advance adds a
  // frame (D:L418454): a clip with no `NoInterrupt` is cut from the second driver tick that sees it, one game frame past
  // its push at the earliest -- the third command from its first. The room's `cutAt` asks the same
  // (`roomReloadLock.test.ts`, PAR-61). *Moved by PAR-67* (research 251 section 12.5): the player's push lands in the
  // actor update's `entity_post_tick`, after the driver's `entity_tick` (`FUN_001ec480` D:L50920-50935; `FUN_005c0fd0`
  // from `FUN_005506a0` D:L417907), so that second driver tick is two game frames past the push -- the fifth command.
  it('PAR-61, moved by PAR-67: a push on the four commands after the first does not cut a standing still clip (no NoInterrupt); the fifth, two game frames past the push, does', () => {
    const life = new StillReloadLife();
    life.begin(STAND, 10);
    for (let c = 11; c <= 14; c++) {
      life.ranWith(c, true);
      expect(life.lives(c + 1), `command ${c}`).toBe(true);
    }
    life.ranWith(15, true);
    expect(life.lives(16)).toBe(false);
  });
});

const motionPack = fixture('RUN/MOTION_P.ZAR'), readerc = fixture('RUN/READERC.ZAR'), zweapon = fixture('RUN/ZWEAPON.ZAR');

// PAR-69 (research 251 section 12.5, "PAR-69: the uncut end lags too"): with the player's push after the frame's driver
// (PAR-67) the driver's end test (`FUN_00582540` D:L418193 -> `FUN_0028c6e0` D:L442925) reads the play's stored phase,
// a game frame behind the push's clock, before the tick's advance (D:L418454), and adds half a frame's step at the
// motion's own playback -- the play's speed (`ReloadTime`'s, D:L462935-462941) not in it (D:L134291-134297) -- against
// the stop `e` = (n-1)/n, strictly (D:L134298-134302). On the port's clock: `(t - G) / (P e) + G / (2 Q e) > e`, i.e.
// `t > P e^2 + G - G P / (2 Q)` (`P` the period, `Q` the clip's playback, `G` = `GAME_FRAME_DT`).
describe('PAR-69: the still clip\'s uncut end on the lagged clock (FUN_00582540 D:L418193, FUN_0028c6e0 D:L134291-134302)', () => {
  const G = GAME_FRAME_DT;
  /** A `ReloadTime` of 2 (the Spas 12's) over `seal_reload_shotgun` (18 keys, playback 1.6). */
  const SHOTGUN_2: ReloadLifeSpec = { ...STAND, family: 'shotgun', period: 2, playback: 1.6, frames: 18, overlay: 0 };

  it("reloadPlayedOut is the cut's lagged phase (reloadCutPhase) plus half the clip's own frame step, past the stop strictly", () => {
    for (const spec of [STAND, CROUCH, SHOTGUN_2]) {
      const e = (spec.frames - 1) / spec.frames;
      for (let k = 0; k <= 200; k++) {
        const t = k / 60;
        const want = reloadCutPhase(spec, t) + G / (2 * spec.playback * e) > e;
        expect(reloadPlayedOut(t, spec.period, spec.frames, spec.playback), `${spec.frames} keys, command ${k}`).toBe(want);
        expect(reloadEnded(spec, t), `${spec.frames} keys, command ${k}`).toBe(want);
      }
    }
  });

  it('seal_reload uncut: played out on the 93rd command (t > 1.5464 s), not the 92nd that first reaches its last key (1.5297 s)', () => {
    const last = 1.6 * (44 / 45) ** 2;
    expect(92 / 60).toBeGreaterThanOrEqual(last);                                 // the port's end before PAR-69
    expect(reloadEnded(STAND, 92 / 60)).toBe(false);
    expect(reloadEnded(STAND, 93 / 60)).toBe(true);
    expect(92 / 60).toBeLessThan(last + G - G / 2);
    expect(93 / 60).toBeGreaterThan(last + G - G / 2);
  });

  it("reloadCutAt's played-out bound is the same end: on the 92nd command the clip is still on the stack and a push cuts it, carrying on from its lagged phase; on the 93rd it is gone", () => {
    const cut = reloadCutAt(STAND, 92 / 60);
    expect(cut).not.toBeNull();
    expect(cut!.carried).toBe(true);
    expect(cut!.left).toBeCloseTo(STAND.overlay * (1 - (92 / 60 - G) / (1.6 * (44 / 45))), 9);
    expect(reloadCutAt(STAND, 93 / 60)).toBeNull();
  });

  it("the half step is at the clip's own playback, not the ReloadTime's: seal_reload_shotgun (18 keys, 1.6) over a ReloadTime of 2 comes off on the 108th command (at the period's step it would be the 109th)", () => {
    const e = 17 / 18, last = 2 * e * e;
    expect(Math.floor((last + G - (G * 2) / (2 * 1.6)) * 60) + 1).toBe(108);
    expect(Math.floor((last + G / 2) * 60) + 1).toBe(109);                      // the speed folded into the step: not the read
    const life = new StillReloadLife();
    life.begin(SHOTGUN_2, 0);
    for (let c = 1; c < 108; c++) { life.ranWith(c, false); expect(life.lives(c + 1), `command ${c}`).toBe(true); }
    life.ranWith(108, false);
    expect(life.lives(109)).toBe(false);
  });

  it.skipIf(!motionPack || !readerc)("reloadLifeSpec carries the clip's own playback beside the period (motion.rdr through the readers)", () => {
    const sim = simClipsFromBytes(motionPack!, readerc!);
    const spec = reloadLifeSpec(sim.clips, sim.table, 'stand', false, 'rifle', 3)!;
    expect(spec.period).toBe(3);
    expect(spec.playback).toBeCloseTo(1.6, 6);
    expect(spec.frames).toBe(45);
  });
});

// PAR-72 (research 251 section 12.5, "PAR-72"): the cut on the end's own tick. The driver asks the cut first
// (`FUN_00550ef0` D:L418180), but its test `FUN_00587c20` asks the end test itself first -- `FUN_0028c6e0` on the
// frame's dt and the top (D:L445526-445527) -- and refuses the cut when it fires (D:L445528, D:L445572-445573); the end
// `FUN_00582540` then asks the same test on the same arguments (D:L418192-418193 -> D:L442925) and the play pops uncut,
// no overlay carried (D:L418204's branch needs the cut). `reloadCutAt`'s played-out bound is that refusal, and the room's
// `cutAt` and the page's `ranWith` ask it: the port already matches. Pinned, nothing changed.
describe('PAR-72: no cut on the end\'s own tick (FUN_00587c20 D:L445526-445528: the end test refuses the cut)', () => {
  const G = GAME_FRAME_DT;
  /** `seal_reload` at the M60E3's `ReloadTime` 3 (PAR-69's table: off on the 173rd command). */
  const M60: ReloadLifeSpec = { ...STAND, period: 3 };

  it('reloadCutAt answers null on every command the end test passes, pushed or not, and cuts the command before it', () => {
    for (const spec of [STAND, CROUCH, M60, { ...STAND, family: 'shotgun', period: 2, frames: 18, overlay: 0 } as ReloadLifeSpec]) {
      let end = -1;
      for (let k = 0; k <= 200; k++) {
        if (!reloadEnded(spec, k / 60)) continue;
        if (end < 0) end = k;
        expect(reloadCutAt(spec, k / 60), `${spec.frames} keys over ${spec.period}, command ${k}`).toBeNull();
      }
      expect(end, `${spec.frames} keys over ${spec.period}`).toBeGreaterThan(0);
      expect(reloadCutAt(spec, (end - 1) / 60), `${spec.frames} keys over ${spec.period}, command ${end - 1}`).not.toBeNull();
    }
  });

  it("seal_reload: pushed on the 93rd command (its end's tick) it is not cut -- no overlay carried, the uncut lock; on the 92nd it is cut, the overlay carried 0.048 s (3 commands, to the 95th: the uncut lock's own end, 96 less a tick)", () => {
    expect(reloadEnded(STAND, 93 / 60)).toBe(true);
    expect(reloadCutAt(STAND, 93 / 60)).toBeNull();
    const cut = reloadCutAt(STAND, 92 / 60)!;
    expect(cut.carried).toBe(true);
    expect(cut.left).toBeCloseTo(STAND.overlay * (1 - (92 / 60 - G) / (1.6 * (44 / 45))), 9);
    expect(92 + Math.ceil(cut.left * 60 - 1e-9)).toBe(95);
    // The page's life: pushed on its end's own tick, gone after it (uncut), as at rest.
    const life = new StillReloadLife();
    life.begin(STAND, 10);
    for (let c = 11; c < 103; c++) life.ranWith(c, false);
    expect(life.lives(103)).toBe(true);
    life.ranWith(103, true);
    // PAR-72's review: a cut and an end both end the life, so this alone does not tell the orders apart -- the
    // `reloadCutAt` asserts in this file, moverHold's reasons and the room's lock do.
    expect(life.lives(104)).toBe(false);
  });

  it("at the M60E3's ReloadTime 3 the end's tick tells: pushed on the 173rd (its end) nothing is cut, the lock its own timer; on the 172nd the cut carries 0.0397 s, to the 175th, before the uncut lock's 179th", () => {
    expect(reloadEnded(M60, 172 / 60)).toBe(false);
    expect(reloadEnded(M60, 173 / 60)).toBe(true);
    expect(reloadCutAt(M60, 173 / 60)).toBeNull();
    const cut = reloadCutAt(M60, 172 / 60)!;
    expect(cut.carried).toBe(true);
    expect(cut.left).toBeCloseTo(M60.overlay * (1 - (172 / 60 - G) / (3 * (44 / 45))), 9);
    expect(172 + Math.ceil(cut.left * 60 - 1e-9)).toBe(175);
    expect(175).toBeLessThan(3 * 60 - 1);                                        // the uncut lock: 3 s less a tick
  });
});

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
const PLAIN: WorldPoly[] = [{
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-200, 0, -200, 200, 0, -200, 200, 0, 200, -200, 0, 200]),
}];
const owners = (polys: WorldPoly[]): CollisionOwner[] => polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));

/**
 * The page as both pages mount it: `WalkMode` with the one firearm (`mountFirearm`) over the disc's clips, its commands
 * kept, ten frames run standing still. Returns the parts and a frame step.
 */
function mounted() {
  const scene = new Scene();
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  walk.setGround(packGround(PARAMS, PLAIN, owners(PLAIN)), [0, 0, 0]);
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  fly.groundWish = () => STILL;
  const sent: Omit<Command, 'seq'>[] = [];
  walk.setNetTap((cmd) => { sent.push(cmd); });
  const sim = simClipsFromBytes(motionPack!, readerc!);
  const play = new Play();
  play.setClips({ clips: sim.clips, table: [...sim.table!] });
  const firearm = mountFirearm({
    scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
  });
  const fire = firearm.fire;
  const step = (): void => { fire.update(1 / 60); walk.frame(1 / 60); };
  for (let i = 0; i < 10; i++) step();
  const walker = (): Walker => (walk as unknown as { walker: Walker }).walker;
  return { walk, fly, fire, firearm, sent, step, sim, walker, play };
}

/**
 * The page as both pages mount it (`mounted`); a still standing reload begun and run `frames` frames. Returns the parts
 * and a frame step.
 */
function standingReload(frames: number) {
  const { walk, fly, fire, firearm, sent, step, sim, walker } = mounted();
  for (let i = 0; i < 3; i++) { fire.shoot(); fire.update(0.2); }
  expect(fire.reload()).toBe(true);
  let reloadAt = -1, seconds = 0;
  fire.subscribe((e) => { if (e.type === 'reloadStart') { reloadAt = walk.ticks(); seconds = e.seconds; } });
  for (let i = 0; i < frames; i++) step();
  expect(fire.state().magazine.reloading).toBe(true);                            // a still standing reload under way
  expect(walk.mover()?.airborne).toBe(false);
  expect(walker().effectiveAction().body).toBeNull();                           // and nothing on the mover (no hold standing)
  expect(reloadAt).toBeGreaterThan(0);
  return { walk, fly, fire, firearm, sent, step, sim, reloadAt, seconds, walker };
}

describe.skipIf(!motionPack || !readerc)(`PARITY-1 D02: the page's jump under its still reload, through the real WalkMode and firearm${motionPack && readerc ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const result = { refused: false, offCommand: false, cutRefused: false, cutAdmitted: false, pagedAt: -1, roomLived: false, roomAdmits: false, roomAt: -1 };

  beforeAll(() => {
    // (1) Pressed 30 frames in: refused, and the press is not on the next command.
    {
      const r = standingReload(30);
      const from = r.sent.length;
      result.refused = r.walk.jump() === false;
      r.step();
      result.offCommand = r.sent.slice(from).every((cmd) => (cmd.buttons & Button.Jump) === 0);
      r.walk.unbindKey();
    }
    // (2) The stick cuts the clip: the press on the cut's frame is refused (read before the cut), the next is taken.
    {
      const r = standingReload(30);
      r.fly.groundWish = () => FORWARD;
      let refusedAll = true, admitted = false;
      for (let i = 0; i < 12 && !admitted; i++) {
        const lived = r.walker().cutStick.forward <= 0.1;                        // no cut yet: the last tick's cut stick under 0.1 (PAR-64: not the ramp)
        const took = r.walk.jump();
        if (lived && took) refusedAll = false;
        if (!lived && took) admitted = true;
        r.step();
      }
      result.cutRefused = refusedAll;
      result.cutAdmitted = admitted;
      r.walk.unbindKey();
    }
    // (3) The page's commands into the room's mover with the room's life (the same rule, from the command the reload
    // names: the last one sent at `reloadStart`, `NetPage`): pressed every frame, the first press on a command is the
    // page's admitted jump, and the room's life lived on every command before it and admits that one.
    {
      const r = standingReload(5);
      for (let i = 0; i < 140 && !r.sent.some((cmd) => cmd.buttons & Button.Jump); i++) { r.walk.jump(); r.step(); }
      const k = r.sent.findIndex((cmd) => (cmd.buttons & Button.Jump) !== 0);
      result.pagedAt = k + 1;                                                    // command i is tick i + 1
      const room = new MoverSim(new Walker(r.walker().grid), null);
      room.walker.place(5, 2, 6);
      const life = new StillReloadLife();
      life.start(r.sim.clips, r.sim.table, 'stand', [0, 0, 0], 'rifle', r.seconds, r.reloadAt);
      let lived = true;
      for (let i = 0; i < r.sent.length; i++) {
        const count = i + 1;
        if (count > r.reloadAt && count < result.pagedAt && !life.lives(count)) lived = false;
        if (count === result.pagedAt) result.roomAdmits = !life.lives(count);
        const jumps = room.jumps;
        room.apply({ ...r.sent[i]!, seq: count });
        life.ran(count, room.walker);
        if (room.jumps > jumps && result.roomAt < 0) result.roomAt = count;
      }
      result.roomLived = lived;
      r.walk.unbindKey();
    }
  });

  it('WalkMode with the firearm: a still standing reload refuses the jump, and the press is spent off the command (FUN_0057e1b0 D:L440805-440810; D:L418128)', () => {
    expect(result.refused && result.offCommand).toBe(true);
  });

  it("WalkMode with the firearm: the stick's cut lets the next jump through, the press on the cut's own frame refused (D:L418119-418130 before D:L418174-418190)", () => {
    expect(result.cutRefused && result.cutAdmitted).toBe(true);
  });

  it("the page's commands into the room's mover: the jump rides the first command the page admits, the room's life refused every command before it and the room jumps on that same command", () => {
    expect(result.roomLived && result.roomAdmits && result.pagedAt > 0 && result.roomAt === result.pagedAt).toBe(true);
  });
});

/**
 * A standing bolt's after-shot (the M40A1, `zweapon.rdr` item 102 off the disc: `ReloadAfterShot`, its 0.5 s lock, then
 * the shotgun reload clip, `FUN_005c3000` D:L477551-477650), the hand's record taken into the fire directly (the kit's
 * own rifle slot is not the point here); run until the clip has begun and 6 frames more. The disc's standing
 * `seal_reload_shotgun` lasts 1.6 s (`reloadSeconds`), past a standing swap's 1.32 s; the 870's pump (0.9 s) is over
 * before the swap's clip, so only a bolt shows the case. `swap`: then L1 to the pistol, run until the swap's clip is off
 * the body. `frames`: else run that many frames still.
 */
function afterShotThen(swap: boolean, frames = 0) {
  const r = mounted();
  // No body is mounted here, so `Play.reloadSeconds` (the weapon pose's) has nothing to ask: the same derivation over the
  // same disc clips stands in for it (`./reloadClip` `reloadSeconds`, still and standing, as `WeaponPose.reloadSeconds`).
  r.play.reloadSeconds = (family, reloadTime = 0) => reloadSeconds(r.sim.clips, r.sim.table, 'stand', false, family ?? 'rifle', reloadTime);
  const m40 = readKitTable(zweapon!).records.get(102)!;
  expect(m40.name).toBe('M40A1');
  r.fire.setWeapon(m40);
  let shotAt = -1;
  r.fire.subscribe((e) => { if (e.type === 'afterShot') shotAt = r.walk.ticks(); });
  expect(r.fire.shoot()).not.toBeNull();
  for (let i = 0; i < 120 && shotAt < 0; i++) r.step();
  expect(shotAt).toBeGreaterThan(0);                                              // the bolt's lock out: its clip begun
  for (let i = 0; i < 6; i++) r.step();
  expect(r.fire.state().afterShot).toBe(true);
  let ran = 0;
  if (swap) {
    expect(r.firearm.selectFirearm('pistol')).toBe(true);                        // the after-shot refuses no swap (room.ts swapRefused)
    for (; ran < 240 && (ran < 2 || r.walk.swapProgress() !== null); ran++) r.step();
    expect(r.walk.swapProgress()).toBeNull();                                     // the standing swap's clip played out
    expect(r.firearm.item()).toBe('pistol');
  } else {
    for (; ran < frames; ran++) r.step();
  }
  return { ...r, ran };
}

describe.skipIf(!motionPack || !readerc || !zweapon)(`PARITY-1 D02: a swap ends the after-shot's still clip life on the page, as the room's aim clears it${motionPack && readerc && zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const result = { swapJump: false, swapRan: 0, stillJump: true, reloadSwap: true, reloadJump: true };

  beforeAll(() => {
    // (1) The M40A1's after-shot clip standing, L1 to the pistol, then a jump once the swap's clip is off the body: the
    // room cleared the old weapon's life at the swap (`room.ts` `aim`, the after-shot lock and `reloadLife` together) and
    // reads the pistol's (`jumpRefused`), none: the jump is taken.
    {
      const r = afterShotThen(true);
      result.swapRan = r.ran;
      result.swapJump = r.walk.jump();
      r.walk.unbindKey();
    }
    // (2) Control: the same after-shot, no swap, run as many frames: its still clip still lives, the jump refused.
    {
      const r = afterShotThen(false, result.swapRan);
      result.stillJump = r.walk.jump();
      r.walk.unbindKey();
    }
    // (3) Control: a still reload, not an after-shot -- the swap is refused under it (`kitFree`; the room's `swapRefused`),
    // so its life stands and the jump is refused.
    {
      const r = standingReload(30);
      result.reloadSwap = r.firearm.selectFirearm('pistol');
      r.step();
      result.reloadJump = r.walk.jump();
      r.walk.unbindKey();
    }
  });

  it("L1 during a standing bolt's after-shot: once the swap's clip is off the body the jump is taken, as the room takes it (room.ts aim clears reloadLife with the after-shot lock)", () => {
    expect(result.swapRan).toBeGreaterThan(60);                                   // the standing swap clip's 1.32 s, near
    expect(result.swapJump).toBe(true);
  });

  it('control: the same after-shot without the swap still refuses the jump after as many frames (its clip outlives the swap\'s)', () => {
    expect(result.stillJump).toBe(false);
  });

  it('control: under a still reload the swap is refused and the jump with it (the life stands)', () => {
    expect([result.reloadSwap, result.reloadJump]).toEqual([false, false]);
  });
});

describe('PAR-28: the stack\'s pops end the page\'s reload (reloadPopped; the room\'s endStillReload, research 251 s12)', () => {
  /** A fake `Fire`: what `popClip` was asked, answering `running`. */
  const fireOf = (running = true) => { const asked: string[] = []; return { asked, popClip: (r: 'knock' | 'cancelled') => { asked.push(r); return running; } }; };

  it("a knock ends the clip under way whatever its life (the second channel cleared too, FUN_005a5da0 D:L461713-461714), the knock's end", () => {
    const fire = fireOf(), life = new StillReloadLife();
    expect(reloadPopped('knock', fire, life, 10)).toBe(true);                    // a moving reload: no still life
    expect(fire.asked).toEqual(['knock']);
    life.begin(STAND, 0);
    expect(reloadPopped('knock', fire, life, 5)).toBe(true);
    expect(life.lives(6)).toBe(false);
  });

  it("a climb's or a ladder's start and a landing that plays a clip pop the stack only: the clip ends while it is still on it (the life lives), an accepted end; a moving reload or a carried overlay is left", () => {
    for (const pop of ['climb', 'ladder', 'landing'] as const) {
      const off = fireOf(), life = new StillReloadLife();
      expect(reloadPopped(pop, off, life, 10)).toBe(false);                      // no still clip: the overlay rides on
      expect(off.asked).toEqual([]);
      life.begin(STAND, 20);
      expect(reloadPopped(pop, off, life, 19)).toBe(false);                      // before its first command: the kit's timer
      expect(off.asked).toEqual([]);
      const on = fireOf();
      expect(reloadPopped(pop, on, life, 20)).toBe(true);
      expect(on.asked).toEqual(['cancelled']);
      expect(life.lives(21)).toBe(false);
    }
  });

  it(`a landing pops the stack only when it plays a clip (FUN_005af590 D:L466691-466693); with none, CLIPLESS_LANDING_RELOAD_READING ('${CLIPLESS_LANDING_RELOAD_READING}')`, () => {
    for (const clip of ['land', 'landHard', 'hit', 'hitStomach', 'landDeath', 'landBackwards'] as const) expect(landingPops({ clip })).toBe(true);
    expect(CLIPLESS_LANDING_RELOAD_READING).toBe('kept');
    expect(landingPops({ clip: null })).toBe(false);
  });
});

/** PAR-28: a fake traversal on the walk's mover: its tick lays `next` (a climb's or a ladder's start) to its listeners, and holds nothing. */
function fakeMoves() {
  const listeners = new Set<(e: TraversalEvent) => void>();
  let next: TraversalEvent | null = null;
  const moves: TraversalHooks & { on(l: (e: TraversalEvent) => void): () => void } = {
    tick: () => { const e = next; next = null; if (e) for (const l of listeners) l(e); return false; },
    pose: () => null, rootY: () => null, yaw: () => null, peek: () => 0, peeking: () => 0,
    action: () => undefined, lean: () => undefined, reset: () => undefined, busy: () => false,
    jump: () => false, dive: () => false, stanceButton: () => false,
    on: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
  return { moves, lay: (e: TraversalEvent) => { next = e; } };
}

describe.skipIf(!motionPack || !readerc)(`PAR-28: WalkMode's stack pops, and the firearm's reload on them (matchFirearm)${motionPack && readerc ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("WalkMode.onStackPop hears a knock at the last command run, a climb's and a ladder's start at the command whose tick laid them, and a landing that plays a clip at its own command", () => {
    const r = mounted();
    const fake = fakeMoves();
    r.walk.useTraversal(() => fake.moves);
    const heard: [string, number][] = [];
    const stop = r.walk.onStackPop((pop, count) => heard.push([pop, count]));
    fake.lay({ type: 'climbStart', kind: 'low' });
    r.step();
    expect(heard).toEqual([['climb', r.walk.ticks()]]);
    fake.lay({ type: 'ladderMount', from: 'bottom' });
    r.step();
    expect(heard.at(-1)).toEqual(['ladder', r.walk.ticks()]);
    expect(r.walk.knock({ velocity: [0, 15, -5], fall: 'fallBackwards' })).toBe(true);
    expect(heard.at(-1)).toEqual(['knock', r.walk.ticks()]);
    let landed = -1;
    for (let i = 0; i < 300 && landed < 0; i++) { r.step(); if (heard.at(-1)?.[0] === 'landing') landed = heard.at(-1)![1]; }
    expect(landed).toBe(r.walk.ticks());                                          // the knock's fall lands with its clip
    expect(r.walker().landing?.clip).not.toBeNull();
    stop();
    r.walk.unbindKey();
  });

  it("a knock ends a standing still reload (its lock and its life: the jump after it is the walk's own again) and a moving one, the magazine kept (end 1, end 3)", () => {
    const still = standingReload(30);
    expect(still.walk.knock({ velocity: [0, 15, -5], fall: 'fallBackwards' })).toBe(true);
    expect(still.fire.state().magazine).toMatchObject({ reloading: false, rounds: 30 });
    still.walk.unbindKey();
    const moving = mounted();
    moving.fly.groundWish = () => FORWARD;
    for (let i = 0; i < 40; i++) moving.step();
    for (let i = 0; i < 3; i++) { moving.fire.shoot(); moving.fire.update(0.2); }
    expect(moving.fire.reload()).toBe(true);
    for (let i = 0; i < 5; i++) moving.step();
    expect(moving.fire.state().magazine.reloading).toBe(true);
    expect(moving.walk.knock({ velocity: [0, 15, -5], fall: 'fallBackwards' })).toBe(true);
    expect(moving.fire.state().magazine.reloading).toBe(false);
    moving.walk.unbindKey();
  });

  it("a climb's start ends a standing still reload's lock and its life: the next jump is the walk's own (end 2)", () => {
    const r = standingReload(30);
    const fake = fakeMoves();
    r.walk.useTraversal(() => fake.moves);
    expect(r.walk.jump()).toBe(false);                                            // the still clip refuses it
    r.step();
    fake.lay({ type: 'climbStart', kind: 'low' });
    r.step();
    expect(r.fire.state().magazine).toMatchObject({ reloading: false, rounds: 30 });
    expect(r.walk.jump()).toBe(true);                                             // no still clip left
    r.walk.unbindKey();
  });

  it("a crouched still reload's lock holds while the body is off the floor and ends at the landing's clip (end 4)", () => {
    const r = mounted();
    expect(r.walk.setStance('crouch')).toBe(true);
    for (let i = 0; i < 90; i++) r.step();
    expect(r.walk.posture()).toBe('crouch');
    for (let i = 0; i < 3; i++) { r.fire.shoot(); r.fire.update(0.2); }
    expect(r.fire.reload()).toBe(true);
    for (let i = 0; i < 5; i++) r.step();
    expect(r.walker().holding?.clip).toBe('seal_crouch_reload');
    const w = r.walker();
    w.state.y += 6;
    w.setAirborne(true);
    let air = 0;
    for (let i = 0; i < 120 && !w.landing; i++) { r.step(); if (w.airborne) { air++; expect(r.fire.state().magazine.reloading).toBe(true); } }
    expect(air).toBeGreaterThan(3);
    expect(w.landing?.clip).toBe('land');
    expect(r.fire.state().magazine.reloading).toBe(false);
    r.walk.unbindKey();
  });
});

/**
 * PAR-61 (research 251 section 12.5): the page's `Fire` takes its reload's cut from the pose (`WeaponPose.takeReloadCut`,
 * through `Play.takeReloadCut`), so the pose's cut of the still clip waits for the same count as the room's `cutAt`
 * (`reloadCutAt`) and hands on the same carried life left (PTW.R3). PAR-67 moves the count (the third frame to the fifth:
 * the push lands after the frame's driver, research 251 section 12.5) and the phase both read (a game frame behind the
 * push's clock).
 */
describe.skipIf(!motionPack || !readerc)(`PAR-61: the page's pose cuts the still clip on the room's count${motionPack && readerc ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  it("the pose holds a standing still reload through a push on the four frames after its start and cuts it on the fifth (PAR-67; the third under PAR-61), handing Fire the carried life left the room's reloadCutAt gives on that command, from the phase a game frame behind the push's clock", () => {
    const sim = simClipsFromBytes(motionPack!, readerc!);
    const pose = new WeaponPose(new Map(sim.clips.map((c) => [c.name, c])), sim.table);
    pose.startReload('stand', 1.6, 'rifle', false);
    for (let k = 1; k <= 4; k++) {
      pose.step(1 / 60, true);
      expect(pose.takeReloadCut(), `frame ${k}`).toBeNull();
      expect(pose.stats().reload, `frame ${k}`).toBe('seal_reload');
    }
    pose.step(1 / 60, true);
    const cut = pose.takeReloadCut();
    const room = reloadCutAt(reloadLifeSpec(sim.clips, sim.table, 'stand', false, 'rifle', 1.6)!, 5 / 60);
    expect(cut).not.toBeNull();
    expect(room).not.toBeNull();
    expect(cut!.carried && room!.carried).toBe(true);
    expect(cut!.left).toBeCloseTo(room!.left, 9);
    // The phase both read: (5/60 - G) / (1.6 x 44/45) = 0.0319 (`seal_mv_reload`'s 1.164 s x (1 - it) = 1.1265 s left).
    const phase = (5 / 60 - GAME_FRAME_DT) / (1.6 * (44 / 45));
    expect(room!.left).toBeCloseTo(1.2 * (32 / 33) * (1 - phase), 9);
    expect(pose.stats().reload).toBe('seal_mv_reload');
  });
});

// PAR-62 (research 230 section 5.2.2): on a landing that plays no clip `FUN_005af930`'s landing branch pops the top once
// (`FUN_00589aa0` D:L466894-466902) before the driver's cut, so the top's action at D:L418176 is not the one read before
// the tick's work (D:L418116) and the cut (D:L418180-418185) is not asked on that tick -- neither the take-off's stick
// the mover hands back for the pose (`land`), nor the tick's own, nor the turn. The next tick reads its own axes. The
// walk's life (`StillReloadLife.ran`) and the layer's snapshot (`./play` `reloadCut`) ask the same test.
describe('PAR-62: a landing that plays no clip asks no cut on its own tick (FUN_00589aa0 D:L466901 before FUN_00550ef0 D:L418176)', () => {
  /** A game frame on the commands: the first command at or past `GAME_FRAME_DT` from the landing's (3). */
  const cutCommands = Math.ceil(GAME_FRAME_DT * 60 - 1e-9);
  const walker = (): Walker => {
    const w = new Walker(groundGrid(packGround(PARAMS, PLAIN, owners(PLAIN))));
    w.place(0, 0, 0);
    return w;
  };

  it("landed turning at a full stick, the still clip is cut a game frame past the landing (PAR-79; was the next tick), never on the landing's; taken off at a full stick and landed under 0.1, the layer asks no cut", () => {
    // The still clip begun at rest, the fall over it, landed turning at a full stick.
    const w = walker();
    for (let i = 0; i < 10; i++) w.tick(STILL);
    const life = new StillReloadLife();
    life.begin(STAND, 0);
    let count = 0;
    const step = (input: WalkInput): void => { w.tick(input); life.ran(++count, w); };
    step(STILL); step(STILL);
    w.state.y += 6; w.setAirborne(true);
    w.turn = 0.5 * SEAL_TUNING.turnMaxRate;
    while (w.airborne) step(FORWARD);
    expect(w.landing?.clip).toBeNull();                                          // moving, the stick not at rest: no clip
    expect(count).toBeGreaterThan(3);                                            // past RELOAD_CUT_DELAY_READING (PAR-61)
    expect(life.lives(count + 1), 'the landing tick: no cut').toBe(true);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn))).toBe(false);
    // *Moved by PAR-79* (research 251 section 12.3, "PAR-79"): the fall covered the clip from the first command in the air
    // (`FUN_005af930` D:L466956-466970 -> `FUN_0057e050` D:L440726) and the clipless landing handed it back
    // (`FUN_00589aa0` D:L466900-466901 -> `FUN_0028da00` D:L135104-135107); the landing's tick asks no cut (D:L418176)
    // and the next driver tick is a game frame on -- the first command at or past it `cutCommands` past the landing's
    // (was: the next command). The layer's snapshot asks the axes again from the next tick, as before: its pose keeps
    // the same game frame (`./weaponPose`, PAR-79).
    step(FORWARD);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn))).toBe(true);
    for (let k = 2; k <= cutCommands; k++) { expect(life.lives(count + 1), `${k - 1} past the landing`).toBe(true); step(FORWARD); }
    expect(life.lives(count + 1)).toBe(false);
    // Taken off at a full stick, landed at 0.05 (past FORWARD_DEAD, under 0.1): the take-off's stick cuts nothing.
    const r = walker();
    for (let i = 0; i < 60; i++) r.tick(FORWARD);
    r.state.y += 6; r.setAirborne(true);
    const slow: WalkInput = { forward: 0.05, right: 0, boost: false };
    while (r.airborne) r.tick(slow);
    expect(r.landing?.clip).toBeNull();
    expect(reloadCut(moverSnapshot(r, null, 0, 0)), 'the landing tick: no cut').toBe(false);
    r.tick(slow);
    expect(reloadCut(moverSnapshot(r, null, 0, 0))).toBe(false);
  });
});

// PAR-66 (research 230 section 5.2.2; PTW.R3 with roomReloadLock.test): a landing that plays a clip changes the top too --
// `FUN_005af930`'s landing branch pops (D:L466897, D:L466900-466901) and `FUN_005af590` pops the stack to its base and
// pushes the clip (D:L466691-466693), all before the driver reads the top again (D:L418169 before D:L418176) -- so the cut
// is not asked on that tick either. A still clip the fall covers is popped there (R251.12): the walk's life is alive for
// the landing's pop (`WalkMode` runs `ran`, then `onStackPop('landing')`), and the layer asks no cut.
describe('PAR-66: a landing that plays a clip asks no cut on its own tick either (FUN_005af590 D:L466691-466693 before FUN_00550ef0 D:L418176)', () => {
  it("landed at rest turning past 0.1 (Jump land), the still clip is not cut on the landing tick: the landing's pop ends it there, on the walk's life and the layer's snapshot alike", () => {
    const w = new Walker(groundGrid(packGround(PARAMS, PLAIN, owners(PLAIN))));
    w.place(0, 0, 0);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    const life = new StillReloadLife();
    life.begin(STAND, 0);
    let count = 0;
    const step = (input: WalkInput): void => { w.tick(input); life.ran(++count, w); };
    step(STILL); step(STILL);
    w.state.y += 6; w.setAirborne(true);
    w.turn = 0.5 * SEAL_TUNING.turnMaxRate;
    while (w.airborne) step(STILL);
    expect(w.landing?.clip).toBe('land');                                        // at rest: `Jump land` (D:L466677-466682)
    expect(count).toBeGreaterThan(5);                                            // past RELOAD_CUT_DELAY_READING (PAR-67)
    expect(life.lives(count), 'the landing tick: no cut').toBe(true);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn)), "the layer's snapshot: no cut").toBe(false);
    expect(w.cutAsked).toBe(false);
    expect(landingPops(w.landing!)).toBe(true);
    const ends: string[] = [];
    const fire = { popClip: (reason: 'knock' | 'cancelled'): boolean => { ends.push(reason); return true; } };
    expect(reloadPopped('landing', fire, life, count), "the landing's pop ends it").toBe(true);
    expect(ends).toEqual(['cancelled']);
    expect(life.lives(count + 1)).toBe(false);
    // The tick after: the cut is asked again, of whatever is on top then.
    w.tick(STILL);
    expect(w.cutAsked).toBe(true);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn))).toBe(true);
  });
});

/**
 * PAR-79 (research 251 section 12.3, "PAR-79"; PTW.R3 with roomReloadLock.test, roomStillReloadJump.test and
 * reloadRun.test): the still clip a walk-off or a fall covers. `FUN_005af930`'s airborne branch pushes `Jump fall` over
 * the clip on the first driver tick in the air (D:L466956-466970 -> `FUN_0057e050` D:L440726), before the tick's cut and
 * end (D:L418169 before D:L418176) and its advance (D:L418454), which moves only the top (`FUN_0057a330` D:L438708,
 * D:L438874, D:L438901): the clip's phase stands through the flight, and neither its end nor its cut is asked of it.
 * A clipless landing pops the fall alone (`FUN_00589aa0` D:L466900-466901) and `FUN_0028da00` hands the clip back with a
 * fresh skip and its phase kept (D:L135104-135107, D:L135109-135110 only for a looped pair): the landing's tick asks
 * neither (the top changed, D:L418176) but advances it (the peek spends the skip, D:L418293, before D:L418454), its end
 * is asked from the next command, its cut from the next driver tick, a game frame on. `Rifle m203 reload` is never
 * covered: the airborne branch is not taken while it is the current action (D:L466828), so it plays on its own clock.
 */
describe("PAR-79: the covered still clip's clock stands through the flight and resumes at a clipless landing", () => {
  const G = GAME_FRAME_DT;
  const cutCommands = Math.ceil(G * 60 - 1e-9);
  /** `seal_reload_m203` as the disc has it: 37 keys at 1.3 (`motion.rdr`; the m203's still clip in every stance). */
  const M203: ReloadLifeSpec = { ...STAND, family: 'm203', period: 1.3, playback: 1.3, frames: 37 };
  /**
   * The life run from command 1: on the floor before `air`, in the air from `air` to `back - 1`, back on the floor at
   * `back` by a clipless landing (`bare`, else a landing with a clip), `push` from the command `pushFrom` on: the first
   * command after which it no longer lives (null: past `to`).
   */
  const run = (spec: ReloadLifeSpec, o: { air: number; back: number; bare?: boolean; pushFrom?: number; to?: number }): number | null => {
    const life = new StillReloadLife();
    life.begin(spec, 0);
    for (let c = 1; c <= (o.to ?? 300); c++) {
      life.ranWith(c, o.pushFrom !== undefined && c >= o.pushFrom, c >= o.air && c < o.back, c === o.back && (o.bare ?? true));
      if (!life.lives(c + 1)) return c;
    }
    return null;
  };

  it("uncut, it plays the commands it had left at the cover from the landing's: seal_reload's end on its 93rd command moves by the flight's (FUN_0057a330 D:L438708; FUN_0028da00 D:L135104-135107)", () => {
    expect(run(STAND, { air: 1000, back: 1000 })).toBe(93);                        // never covered: PAR-69's 93rd
    // Covered from the 20th to the 49th, handed back on the 50th: 30 commands stood.
    expect(run(STAND, { air: 20, back: 50 })).toBe(93 + 30);
    // Covered on its end's own command (the 93rd): the cover runs before the end test (D:L418169 before D:L418193), which
    // the changed top skips (D:L418176) -- covered unpopped; the landing's command asks no end either, the next pops it.
    expect(run(STAND, { air: 93, back: 100 })).toBe(101);
  });

  it("the stick's cut is asked a game frame past the landing, on the phase the stood clock gives (FUN_00550ef0 D:L418176-418190, FUN_00587c20 D:L445550-445556)", () => {
    // Standing, no NoInterrupt: covered from the 40th, handed back on the 70th, the stick held from the landing -- not on
    // the two commands after it, the third cuts it.
    expect(cutCommands).toBe(3);
    expect(run(STAND, { air: 40, back: 70, pushFrom: 70 })).toBe(70 + cutCommands);
    // Crouched, NoInterrupt 0.35 on the lagged phase: the 41st command of its own clock (PAR-67's), so 30 stood
    // commands put it on the 71st -- not the landing's next (the 51st on the push's clock, before PAR-79).
    const at035 = 0.35 * 1.9 * (27 / 28);
    expect(Math.floor((at035 + G) * 60) + 1).toBe(41);
    expect(run(CROUCH, { air: 20, back: 50, pushFrom: 50 })).toBe(41 + 30);
  });

  it("a landing that plays a clip leaves it for its pop (reloadPopped, the room's endStillReload): nothing is asked on that command, whatever its own clock (FUN_005af590 D:L466691-466693)", () => {
    // Covered from the 20th and landed with a clip on the 100th, past its own 93rd: alive for the pop on that command.
    const life = new StillReloadLife();
    life.begin(STAND, 0);
    for (let c = 1; c < 100; c++) life.ranWith(c, false, c >= 20, false);
    life.ranWith(100, false, false, false);
    expect(life.lives(100)).toBe(true);
    const ends: string[] = [];
    expect(reloadPopped('landing', { popClip: (r) => { ends.push(r); return true; } }, life, 100)).toBe(true);
    expect(ends).toEqual(['cancelled']);
  });

  // *PAR-82 (2026-10-13):* the life's own clock only (`ranWith`): any landing pops the m203's clip on its own command,
  // through the stack's pop (`landingPops` with the life's family, then `reloadPopped`) -- the PAR-82 cases below.
  it("Rifle m203 reload is not covered (FUN_005af930 D:L466828): its clip plays on its own clock in the air, its end on its 75th command whatever the flight", () => {
    const own = run(M203, { air: 1000, back: 1000 });
    expect(own).toBe(75);
    expect(run(M203, { air: 20, back: 50 })).toBe(own);
    expect(run(M203, { air: 60, back: 90 })).toBe(own);                           // ended in the air
  });
});

/**
 * PAR-82 (research 251 section 12.3, "PAR-82"; PTW.R3 with roomReloadLock.test, roomStillReloadJump.test, reloadRun.test
 * and moverHold.test): `Rifle m203 reload` (`DAT_003debf8`, the m203's still clip in every stance, `FUN_005a82e0`
 * D:L462844-462851) is in the set that keeps `FUN_005af930` out of its airborne branch (D:L466816-466828): no fall is
 * pushed over it, it stays the top in the air on its own clock. At the landing the same function's landing branch pops
 * the top -- that clip -- under 20 a second (`FUN_0058a5e0(actor, 1, 1)`, D:L466897) and over (`FUN_00589aa0`,
 * D:L466900-466901), whether or not `FUN_005af590` then plays a clip: any landing pops it, its lock with it
 * (`FUN_005a7ab0` D:L462526-462544). The page asks it of the life it already holds (`StillReloadLife.family`).
 */
describe("PAR-82: any landing pops the m203's still reload (FUN_005af930 D:L466816-466828, D:L466897, D:L466900-466901)", () => {
  const M203: ReloadLifeSpec = { ...STAND, family: 'm203', period: 1.3, playback: 1.3, frames: 37 };

  it("landingPops asks the living clip's family: a clipless landing pops Rifle m203 reload and no other family; a landing with a clip pops every one", () => {
    expect(landingPops({ clip: null }, 'm203')).toBe(true);
    for (const family of ['rifle', 'pistol', 'shotgun', 'pump'] as const) expect(landingPops({ clip: null }, family), family).toBe(false);
    expect(landingPops({ clip: null }, null)).toBe(false);                        // no clip on the body: nothing to pop
    expect(landingPops({ clip: null })).toBe(false);
    for (const family of ['rifle', 'm203', null] as const) expect(landingPops({ clip: 'land' }, family)).toBe(true);
    const life = new StillReloadLife();
    expect(life.family()).toBeNull();
    life.begin(M203, 10);
    expect(life.family()).toBe('m203');
    life.end();
    expect(life.family()).toBeNull();
    life.begin(STAND, 10);
    expect(life.family()).toBe('rifle');
  });
});

/**
 * PAR-82, the page as both pages mount it (`mounted`): the M4A1-M203 (`zweapon.rdr` item 61) in its round mode (the
 * M203 FRAG, item 175, off the disc's kit table), a round launched and its after-shot's clip begun (`Rifle m203 reload`,
 * after the round's `ReloadDelayAfterShot`), crouched or standing. Returns the parts, the clip's first command, and the
 * family the after-shot told.
 */
function m203AfterShot(stance: 'stand' | 'crouch') {
  const r = mounted();
  if (stance === 'crouch') {
    expect(r.walk.setStance('crouch')).toBe(true);
    for (let i = 0; i < 90; i++) r.step();
    expect(r.walk.posture()).toBe('crouch');
  }
  // No body is mounted here: the same derivation over the same disc clips stands in for `Play.reloadSeconds`.
  r.play.reloadSeconds = (family, reloadTime = 0) => reloadSeconds(r.sim.clips, r.sim.table, stance, false, family ?? 'rifle', reloadTime);
  const table = readKitTable(zweapon!);
  const carrier = table.records.get(61)!, round = table.rounds.get(175)!;
  expect([carrier.name, round.record.name]).toEqual(['M4A1-M203', 'M203 FRAG']);
  r.fire.setWeapon(carrier);
  r.fire.setRound({ id: 175, round, ring: new MagazineRing(6, 1) });
  let startAt = -1, family: string | null = null;
  r.fire.subscribe((e) => { if (e.type === 'afterShot') { startAt = r.walk.ticks(); family = e.family; } });
  expect(r.fire.shoot()).not.toBeNull();
  for (let i = 0; i < 120 && startAt < 0; i++) r.step();
  expect(startAt).toBeGreaterThan(0);                                             // the round's lock out: its clip begun
  for (let i = 0; i < 4; i++) r.step();
  expect(r.fire.state().afterShot).toBe(true);
  return { ...r, startAt, family: family as string | null };
}

describe.skipIf(!motionPack || !readerc || !zweapon)(`PAR-82: WalkMode with the firearm, the m203's still reload walked off a ledge${motionPack && readerc && zweapon ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** Off the floor (the test's ledge) and run to the landing at `wish`: the frames in the air, and the walk's count at the landing. */
  const flight = (r: ReturnType<typeof m203AfterShot>, wish: WalkInput) => {
    const w = r.walker();
    w.state.y += 6;
    w.setAirborne(true);
    r.fly.groundWish = () => wish;
    let air = 0;
    for (let i = 0; i < 120 && !w.landing; i++) {
      r.step();
      if (w.airborne) { air++; expect(r.fire.state().afterShot, 'not covered: the lock held in the air').toBe(true); }
    }
    expect(air).toBeGreaterThan(3);
    return { w, landed: r.walk.ticks() };
  };
  const SLOW: WalkInput = { forward: 0.05, right: 0, boost: false };            // past FORWARD_DEAD, under 0.1: no cut, no landing clip

  it("standing, landed with no clip: the landing pops the clip -- its lock and its life end on the landing's command (was: kept to its own end)", () => {
    const r = m203AfterShot('stand');
    expect(r.family).toBe('m203');
    const popped: [string, number][] = [];
    r.walk.onStackPop((pop, count) => popped.push([pop, count]));
    const { w, landed } = flight(r, SLOW);
    expect(w.landing?.clip).toBeNull();                                           // moving, the stick not at rest
    expect(popped).toEqual([['landing', landed]]);
    expect(r.fire.state().afterShot).toBe(false);                                 // `Fire.popClip('cancelled')`
    r.walk.unbindKey();
  });

  it("standing, landed with a clip (Jump land): popped on the landing's command, as before", () => {
    const r = m203AfterShot('stand');
    const { w } = flight(r, STILL);
    expect(w.landing?.clip).toBe('land');
    expect(r.fire.state().afterShot).toBe(false);
    r.walk.unbindKey();
  });

  it("crouched: the stand-in hold (seal_crouch_reload, H77) is not covered by the fall, so no landing hands it back; landed with no clip, the lock ends there (was: the hold handed back, the lock kept)", () => {
    const r = m203AfterShot('crouch');
    expect(r.walker().holding?.clip).toBe('seal_crouch_reload');
    const { w } = flight(r, SLOW);
    expect(w.landing?.clip).toBeNull();
    expect(w.holding).toBeNull();
    expect(r.fire.state().afterShot).toBe(false);
    r.walk.unbindKey();
  });

  it("crouched, landed with a clip: the hold and the lock gone at the landing, as before", () => {
    const r = m203AfterShot('crouch');
    const { w } = flight(r, STILL);
    expect(w.landing?.clip).toBe('land');
    expect(w.holding?.clip ?? null).not.toBe('seal_crouch_reload');
    expect(r.fire.state().afterShot).toBe(false);
    r.walk.unbindKey();
  });
});

// PAR-64 (research 230 section 5.2.3; PTW.R3 with roomReloadLock.test): the cut's move axes are the pad's stick as
// `FUN_00551ec0` copies it each frame (D:L418613-418615) before the driver's pass (D:L50922-50925), not the ground state's
// ramped stick, which it writes back only after the cut (`FUN_00584c60` D:L444165-444166).
describe('PAR-64: the cut reads the pad\'s copied stick (FUN_00551ec0 D:L418613-418615), not the ground state\'s ramp', () => {
  it("a full stick pushed from rest cuts a standing still clip on its own tick, on the walk's life and the layer's snapshot alike", () => {
    const w = new Walker(groundGrid(packGround(PARAMS, PLAIN, owners(PLAIN))));
    w.place(0, 0, 0);
    for (let i = 0; i < 10; i++) w.tick(STILL);
    const life = new StillReloadLife();
    life.begin(STAND, 0);
    let count = 0;
    const step = (input: WalkInput): void => { w.tick(input); life.ran(++count, w); };
    for (let i = 0; i < 5; i++) step(STILL);                                     // past RELOAD_CUT_DELAY_READING (PAR-61)
    expect(life.lives(count + 1)).toBe(true);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn))).toBe(false);
    step(FORWARD);                                                               // the push from rest
    expect(w.ground.forward).toBeLessThanOrEqual(0.1);                           // the ramp's first step, under the threshold
    expect(life.lives(count + 1), "the push's own tick").toBe(false);
    expect(reloadCut(moverSnapshot(w, null, 0, w.turn))).toBe(true);
  });
});

/**
 * PAR-78 (research 230 section 5.2.5): the flinch on top, the jump's other one-shot the mover does not carry -- one
 * predicate for the room (`room.ts` `jumpRefused`, on `flinchFrom` .. `flinchUntil`) and the page (`WalkMode.jump`, on
 * `setFlinchPose`'s window). `FUN_0057e1b0` refuses under a top whose looped bit is clear (D:L440810): the window's first
 * command through its pop's own (*PAR-78's review, F1*: was "to its last, not its end"); no window, nothing.
 */
describe('PAR-78: flinchOnTop, the room\'s and the page\'s one answer', () => {
  // *Moved by PAR-78's review (F1)*: `until` is the pop's own command, whose jump is read before the pop
  // (D:L418119-418132 before D:L418193-418203): inside (was: the first past).
  it('inside [start, until] on the commands\' seqs; not before, not past until; none with no window or the room\'s -1s', () => {
    const w = { start: 10, until: 52 };
    expect([9, 10, 52, 53].map((s) => flinchOnTop(w, s))).toEqual([false, true, true, false]);
    expect(flinchOnTop(null, 10)).toBe(false);
    expect(flinchOnTop({ start: -1, until: -1 }, 0)).toBe(false);                 // the room's "none" (`flinchFrom` / `flinchUntil` -1)
    expect([10, 11].map((s) => flinchOnTop({ start: 10, until: 10 }, s))).toEqual([true, false]);   // popped on its first command
  });
});

/**
 * NU-1b on the page, through the real `WalkMode` and firearm (`matchFirearm`'s wiring; research 313 section 8.1): B1's
 * `Walker.climbLock` -- the reload lock the mover does not carry (`FUN_005a7ab0`, `FUN_005b4340(actor, 2)` D:L469416) --
 * set by the walk from its still clip and the firearm's lock; B5's `FireSource.climbHolds` from the walk's move; B7's
 * pop of a running climb by the page's own flinch (`setFlinchPose`, `Traversal.flinchPop`).
 */
describe.skipIf(!motionPack || !readerc)(`NU-1b: the page's climb gates through the real WalkMode and firearm${motionPack && readerc ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  /** Moves whose clip the test sets (`pose`), counting the flinch's pops. */
  function climbMoves() {
    const state = { clip: null as string | null, pops: 0, starting: null as string | null };
    const listeners = new Set<(e: TraversalEvent) => void>();
    const moves: TraversalHooks & { on(l: (e: TraversalEvent) => void): () => void } = {
      // `starting`: the climb begins on the next tick, its `climbStart` heard there (as `Traversal.startClimb` emits it).
      tick: () => {
        if (state.starting) { state.clip = state.starting; state.starting = null; for (const l of listeners) l({ type: 'climbStart', kind: 'low' }); }
        return false;
      },
      on: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
      pose: () => (state.clip ? { clip: state.clip, frame: 3, loop: false, rootY: null } : null), rootY: () => null,
      yaw: () => null, peek: () => 0, peeking: () => 0, action: () => undefined, lean: () => undefined, reset: () => undefined,
      busy: () => state.clip !== null, jump: () => false, dive: () => false, stanceButton: () => false,
      flinchPop: () => { if (state.clip === null) return false; state.pops++; state.clip = null; return true; },
    };
    return { moves, state };
  }

  it("B1: a standing still reload holds the walker's climbLock (the offer refused) until its clip's end; none at rest", () => {
    const r = standingReload(30);
    expect(r.walker().climbLock?.()).toBe(true);                                  // RED before B1: no hook
    for (let i = 0; i < 400 && r.fire.state().magazine.reloading; i++) r.step();
    for (let i = 0; i < 5; i++) r.step();
    expect(r.walker().climbLock?.()).toBe(false);
    r.walk.unbindKey();
    const idle = mounted();
    expect(idle.walker().climbLock?.()).toBe(false);
    // LATER 72 (CLIMB_LOCK_RELOAD_DELAY_READING 'counted'; the press reaches the room): the kit's timer alone (ReloadDelay)
    // is counted, as the original's -- R then Cross inside the timer is not offered. Was (NU-1b review F1): offered.
    expect(idle.fire.reload()).toBe(true);
    expect(idle.walker().climbLock?.()).toBe(true);
    expect(climbOffered(idle.walker())).toBe(false);
    let begun = false;
    idle.fire.subscribe((e) => { if (e.type === 'reloadStart') begun = true; });
    for (let i = 0; i < 3 && !begun; i++) idle.step();
    expect(begun).toBe(true);                                                      // the clip begun (reloadStart): counted
    expect(idle.walker().climbLock?.()).toBe(true);
    expect(CLIMB_LOCK_RELOAD_DELAY_READING).toBe('counted');
    // LATER 72 (its review's coverage note): online the walk's own command decides, the press's window in commands --
    // not the timer's time: a window ending at the walk's next command leaves the offer free though the timer runs.
    const net = mounted();
    expect(net.fire.reload()).toBe(true);
    const next = (net.walk as unknown as { taps: number }).taps + 1;
    net.fire.setPressWindow(next);
    expect(net.walker().climbLock?.()).toBe(false);                               // the command `next` is past the window
    net.fire.setPressWindow(next + 1);
    expect(net.walker().climbLock?.()).toBe(true);                                // inside it
    net.walk.unbindKey();
    idle.walk.unbindKey();
  });

  it("B5: R asked while the walk's move plays a climb clip is spent at the timer's end, nothing begun; asked after it, taken", () => {
    const r = mounted();
    const c = climbMoves();
    r.walk.useTraversal(() => c.moves);
    for (let i = 0; i < 3; i++) { r.fire.shoot(); r.fire.update(0.2); }
    const starts: number[] = [];
    r.fire.subscribe((e) => { if (e.type === 'reloadStart') starts.push(r.walk.ticks()); });
    c.state.clip = 'seal_climbcrate';
    expect(r.walk.climbHolds()).toBe(true);
    expect(r.fire.reload()).toBe(true);
    for (let i = 0; i < 60; i++) r.step();
    expect(starts).toEqual([]);                                                   // RED before B5: begun mid-climb
    expect(r.fire.state().magazine.reloading).toBe(false);
    c.state.clip = null;
    expect(r.fire.reload()).toBe(true);
    for (let i = 0; i < 60; i++) r.step();
    expect(starts.length).toBe(1);
    r.walk.unbindKey();
  });

  // NU-1b review F2: the room's flinch pops the climb its mover runs at the hit (the command before the window's start,
  // `cut.start - 1`); the page hears the event a round trip later. A climb the page began after that command was never the
  // room's to pop: it stands. One begun at or before it is popped.
  it("F2: a climb begun after the hit's command is not popped by the flinch's event; one begun at or before it is", () => {
    const taps = (r: ReturnType<typeof mounted>): number => (r.walk as unknown as { taps: number }).taps;
    const pose = (): TraversalPose => ({ clip: 'seal_flinch_rarm', frame: 0, loop: false, rootY: null });
    const after = mounted();
    const c = climbMoves();
    after.walk.useTraversal(() => c.moves);
    after.step();
    const hit = taps(after);                                                      // the room's flinch after this command
    c.state.starting = 'seal_climbcrate';
    after.step();                                                                 // the climb begun on hit + 1
    expect(c.state.clip).toBe('seal_climbcrate');
    after.walk.setFlinchPose(pose, { start: hit + 1, until: hit + 40 });
    expect(c.state.pops).toBe(0);                                                 // RED before F2: 1, popped on arrival
    expect(c.state.clip).toBe('seal_climbcrate');
    after.walk.setFlinchPose(null);
    after.walk.unbindKey();
    const before = mounted();
    const d = climbMoves();
    before.walk.useTraversal(() => d.moves);
    d.state.starting = 'seal_climbcrate';
    before.step();                                                                // begun on this command
    const at = taps(before);
    before.step();
    before.walk.setFlinchPose(pose, { start: at + 1, until: at + 40 });          // the hit after the climb's own command
    expect(d.state.pops).toBe(1);
    before.walk.setFlinchPose(null);
    before.walk.unbindKey();
  });

  it("B7: the page's own flinch pops the walk's running climb; with none running it pops nothing", () => {
    const r = mounted();
    const c = climbMoves();
    r.walk.useTraversal(() => c.moves);
    c.state.clip = 'seal_climbcrate';
    r.walk.setFlinchPose(() => ({ clip: 'seal_flinch_rarm', frame: 0, loop: false, rootY: null }));
    expect(c.state.pops).toBe(1);                                                 // RED before B7: 0
    r.walk.setFlinchPose(() => ({ clip: 'seal_flinch_rarm', frame: 0, loop: false, rootY: null }));
    expect(c.state.pops).toBe(1);
    r.walk.setFlinchPose(null);
    r.walk.unbindKey();
  });
});
