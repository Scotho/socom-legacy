// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { readKitTable, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { FlyCamera } from '../src/camera';
import { Hud } from '../src/hud';
import { PlayerLoadout } from '../src/loadout';
import { mountFirearm } from '../src/matchFirearm';
import type { Walker, WalkInput } from '../src/mover';
import { Play } from '../src/play';
import { RemotePlayers } from '../src/remotePlayers';
import { reloadSeconds } from '../src/reloadClip';
import { reloadCutAt, reloadEnded, reloadLifeSpec, type ReloadLifeSpec } from '../src/reloadLock';
import { simClipsFromBytes } from '../src/simMap';
import { Traversal } from '../src/traversal';
import { groundPolygons, packGround, WalkMode } from '../src/walk';

/**
 * B-18 ("sniper shot locks you prone"; research 150 section 5, "B-18"; reading, reviewed 2026-11-21 by a second reader;
 * only the cases research 150 lists as proven are proven). A bolt rifle's after-shot (the M40A1, `zweapon.rdr` item 102: `ReloadAfterShot`, `ReloadDelayAfterShot`
 * 0.5) pushes the `Shotgun reload` family's still clip for the stance at the kit timer's end (`FUN_005c0fd0`
 * D:L476549-476563 -> `FUN_005c3000` -> `FUN_005a82e0` D:L462845-462851): prone `seal_prone_reload_shotgun`, 14 keys,
 * playback 1.6, no `NoInterrupt` (an absent key loads as 0, D:L131431-131434). A stance request waits while it is the top
 * (`FUN_00552ec0` D:L418927-418930: neither looped nor a transition), but the first move or turn axis past 0.1 cuts it
 * from the driver's next frame (`FUN_00550ef0` D:L418174-418203) and the request is then taken. Under a `dive_to_prone`
 * top `FUN_005b4340(actor, 3)` refuses and nothing is pushed (D:L469334-469335; the review's finding 2-1).
 *
 * The port laid the rifle's `seal_prone_reload` hold (1.7 s, `NoInterrupt` 0.5) as a stand-in: the stick could not cut it
 * for 0.855 s and it ran 1.605 s, so the stance waited to 1.355 s (stick) or 2.105 s (untouched) after the shot. The
 * original's, by the port's own clocks (PAR-67's two game frames to the first cut, PAR-69's lagged end): about 0.567 s
 * and 1.896 s (0.5 + 1.396).
 *
 * Held against the capture (KILL2 record D:/s2u-records/KILL2-PC3/KILL2-PC3.zip, sha256 750abc0e73a88c5045deb8f63d58799be7c1ce798576ddd68fa54afef7ff52a2, summary agent-mail/evidence/weekend-mega-2026-11-14/rig/KILL2-PC3/KILL2-summary.md); tolerance +-1 game frame on the capture's clock column:
 * - the one-frame pop (the captured value: the request taken ONE game frame after the frame the clip comes off, 1 f after
 *   the cut row with the stick): T1, T2, T3 assert life + 2 commands -- proven;
 * - the gate (the captured value: a stance press waits while the still clip is on top, hands off): T2's `t2PendingLate`,
 *   T4 -- proven;
 * - the dive (the captured value: no still clip pushed under the dive, the press after it taken at once): the
 *   finding 2-1 case -- proven;
 * - NOT asserted at the captured value, so reading (proven once a test asserts them): the kit set to push 14-17 f (the
 *   kit timer runs short, LATER 1298), the clip's 41-44 f, the stick's cut 5 f in, the shot-to-change 1.916-1.983 s (T2's
 *   bracket [1.900, 2.033] s is wider than +-1 f of it).
 *
 * The real `WalkMode` with its `Traversal` and the one firearm (`mountFirearm`) over the disc's clips, as
 * `stillReloadLife.test.ts` mounts it; the M40A1's record off the disc.
 */

const motionPack = fixture('RUN/MOTION_P.ZAR'), readerc = fixture('RUN/READERC.ZAR'), zweapon = fixture('RUN/ZWEAPON.ZAR');
const absent = !motionPack || !readerc || !zweapon;

const STILL: WalkInput = { forward: 0, right: 0, boost: false };
const FORWARD: WalkInput = { forward: 1, right: 0, boost: false };
const RUN: WalkInput = { forward: 1, right: 0, boost: true };
const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 400, cellsX: 10, cellsZ: 10, originX: -2000, originZ: -2000 };
const PLAIN: WorldPoly[] = [{
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-2000, 0, 2000, 2000, 0, 2000, 2000, 0, -2000, -2000, 0, -2000]),
}];
const owners = (polys: WorldPoly[]): CollisionOwner[] => polys.map((p, i) => ({ modelName: p.modelName, path: `${p.path}${i}`, first: i, count: 1 }));
const TICK = 1 / 60;

/** The page: `WalkMode` with its moves and the firearm, the M40A1 in hand, ten frames still. */
function rig() {
  const scene = new Scene();
  const c = document.createElement('canvas');
  c.setPointerCapture = () => undefined;
  c.releasePointerCapture = () => undefined;
  c.hasPointerCapture = () => false;
  const fly = new FlyCamera(c);
  const walk = new WalkMode(fly);
  const ground = packGround(PARAMS, PLAIN, owners(PLAIN));
  walk.setGround(ground, [0, 0, 0]);
  walk.useTraversal((w, g) => new Traversal(w.grid, groundPolygons(g)));
  fly.setPose({ x: 5, y: 40, z: 6, yaw: 0, pitch: 0 });
  walk.setMode('walk');
  let wish: WalkInput = STILL;
  fly.groundWish = () => wish;
  walk.setNetTap(() => undefined);
  const sim = simClipsFromBytes(motionPack!, readerc!);
  const play = new Play();
  play.setClips({ clips: sim.clips, table: [...sim.table!] });
  const firearm = mountFirearm({
    scene, fly, walk, play, remote: new RemotePlayers(scene), hud: new Hud(), loadouts: new PlayerLoadout(),
    view: () => null, map: () => null, body: () => null, net: () => null, blocked: () => false, refreshFog: () => {},
  });
  const fire = firearm.fire;
  // No body is mounted, so the weapon pose's `reloadSeconds` has nothing to ask: the same derivation over the disc's clips,
  // in the walk's posture at the event (the stance at the timer's end, D:L462833-462834).
  play.reloadSeconds = (family, reloadTime = 0) => reloadSeconds(sim.clips, sim.table, walk.posture(), false, family ?? 'rifle', reloadTime);
  const m40 = readKitTable(zweapon!).records.get(102)!;
  expect(m40.name).toBe('M40A1');
  fire.setWeapon(m40);
  let afterShotAt = -1;
  fire.subscribe((e) => { if (e.type === 'afterShot') afterShotAt = walk.ticks(); });
  const walker = (): Walker => (walk as unknown as { walker: Walker }).walker;
  const step = (n = 1): void => { for (let i = 0; i < n; i++) { fire.update(TICK); walk.frame(TICK); } };
  step(10);
  const lives = (): boolean => (walk as unknown as { stillClip: { lives(c: number): boolean } }).stillClip.lives(walk.ticks() + 1);
  return {
    walk, fire, walker, step, lives, sim,
    setWish: (w: WalkInput): void => { wish = w; },
    afterShot: (): number => afterShotAt,
    unbind: (): void => walk.unbindKey(),
  };
}

type Rig = ReturnType<typeof rig>;

/** Shoots and runs to the after-shot's command (its clip's first): the commands from the shot to it. */
function shootToAfterShot(r: Rig): { shot: number; after: number } {
  const shot = r.walk.ticks();
  expect(r.fire.shoot()).not.toBeNull();
  for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
  expect(r.afterShot()).toBeGreaterThan(shot);
  return { shot, after: r.afterShot() };
}

/** Steps until `done` or `limit` frames: the frames run (limit + 1 when never). */
function until(r: Rig, done: () => boolean, limit = 240): number {
  for (let k = 1; k <= limit; k++) { r.step(); if (done()) return k; }
  return limit + 1;
}

/**
 * The review of 0b122c4034 (its tests' finding): the COMMAND a stance is taken on, not a time window. Steps until the
 * stance leaves `from` (or `limit` frames): the walk's tick (`ticks()`) after which the still clip's life was gone
 * (`lives` false for the next command) and the tick the stance changed on. The gate (`FUN_00552ec0` D:L418927-418930)
 * keeps the request while the life runs and takes it on the command after the life's end (`StillReloadLife.ranWith`).
 */
function takenAfterLife(r: Rig, from: string, limit = 240): { lifeEnd: number; taken: number } {
  let lifeEnd = r.lives() ? -1 : r.walk.ticks();
  for (let k = 0; k < limit; k++) {
    r.step();
    if (lifeEnd < 0 && !r.lives()) lifeEnd = r.walk.ticks();
    if (r.walker().stance !== from) return { lifeEnd, taken: r.walk.ticks() };
  }
  return { lifeEnd, taken: -1 };
}

/** The after-shot's still clip life on the disc's clips (`reloadLifeSpec`), the M40A1's family, still, in `stance`. */
function shotgunSpec(r: Rig, stance: 'stand' | 'crouch' | 'prone'): ReloadLifeSpec {
  const seconds = reloadSeconds(r.sim.clips, r.sim.table, stance, false, 'shotgun', 0)!;
  return reloadLifeSpec(r.sim.clips, r.sim.table, stance, false, 'shotgun', seconds)!;
}

/** The first command count past `start` the clip of `spec` has played out on (`reloadEnded`, the life's own end test). */
function endCommand(spec: ReloadLifeSpec, start: number): number {
  let n = 1;
  while (!reloadEnded(spec, n / 60)) n++;
  return start + n;
}

/** The first command count from `first` the stick may cut the clip of `spec` begun at `start` on (`reloadCutAt`). */
function cutCommand(spec: ReloadLifeSpec, start: number, first: number): number {
  let c = first;
  while (reloadCutAt(spec, (c - start) / 60) === null) c++;
  return c;
}

/** Settled prone (the drop's clip played out), sticks at rest. */
function prone(r: Rig): void {
  expect(r.walk.setStance('prone')).toBe(true);
  r.step(90);
  expect(r.walker().stance).toBe('prone');
  expect(r.walker().action).toBeNull();
}

describe.skipIf(absent)(`B-18: the bolt's after-shot clip and the stance request${absent ? ` (${FIXTURES_ABSENT})` : ''}`, () => {
  const out = {
    t1Hold: '' as string | null, t1Taken: -1, t1Seconds: -1, t1Life: -1, t1At: -1, t1Cut: -1,
    t2PendingLate: false, t2TakenBy: false, t2Seconds: -1, t2Push: -1, t2Life: -1, t2At: -1, t2End: -1,
    t3Pending: false, t3Stance: '', t3StickTaken: -1, t3Life: -1, t3At: -1, t3Cut: -1,
    t4Taken: false,
    dropStick: -1, dropStickEarly: true, dropRest: -1,
    diveOnTop: false, diveLife: true, diveHold: '' as string | null, diveTaken: -1, diveBefore: false,
  };

  beforeAll(() => {
    // T1: prone and still, shot; five commands into the clip a stand press; one command later the stick forward.
    {
      const r = rig();
      prone(r);
      const { shot, after } = shootToAfterShot(r);
      r.step(5);
      out.t1Hold = r.walker().holding?.clip ?? null;
      r.walk.setStance('stand');
      r.step();
      r.setWish(FORWARD);
      const stick = r.walk.ticks() + 1, before = r.walk.ticks();
      const t = takenAfterLife(r, 'prone');
      out.t1Taken = t.taken - before;
      out.t1Seconds = (r.walk.ticks() - shot) * TICK;
      out.t1Life = t.lifeEnd; out.t1At = t.taken; out.t1Cut = cutCommand(shotgunSpec(r, 'prone'), after, stick);
      r.unbind();
    }
    // T2: the same, sticks and turn at rest throughout: the press waits the clip out.
    {
      const r = rig();
      prone(r);
      const { shot, after } = shootToAfterShot(r);
      r.step(5);
      r.walk.setStance('stand');
      r.step(Math.round(1.30 * 60) - 5 - (r.walk.ticks() - after));
      out.t2PendingLate = r.walker().stance === 'prone' && r.walker().pendingStance === 'stand';
      const t = takenAfterLife(r, 'prone');
      out.t2Seconds = (r.walk.ticks() - shot) * TICK;
      out.t2Push = (r.walk.ticks() - after) * TICK;
      out.t2TakenBy = r.walk.ticks() - after <= Math.round(1.45 * 60);
      out.t2Life = t.lifeEnd; out.t2At = t.taken; out.t2End = endCommand(shotgunSpec(r, 'prone'), after);
      r.unbind();
    }
    // T3: standing still, shot, crouch pressed at 0.6 s with the sticks at rest; then the stick.
    {
      const r = rig();
      const { shot, after } = shootToAfterShot(r);
      r.step(Math.round(0.6 * 60) - (r.walk.ticks() - shot));
      r.walk.setStance('crouch');
      r.step(Math.round(1.30 * 60) - (r.walk.ticks() - after));
      out.t3Pending = r.walker().pendingStance === 'crouch';
      out.t3Stance = r.walker().stance;
      r.setWish(FORWARD);
      const stick = r.walk.ticks() + 1, before = r.walk.ticks();
      const t = takenAfterLife(r, 'stand');
      out.t3StickTaken = t.taken - before;
      out.t3Life = t.lifeEnd; out.t3At = t.taken; out.t3Cut = cutCommand(shotgunSpec(r, 'stand'), after, stick);
      r.unbind();
    }
    // T4: standing, shot, prone at 0.1 s, stand at 0.3 s -- both before the timer's end: the stand is taken at once.
    {
      const r = rig();
      const shot = r.walk.ticks();
      expect(r.fire.shoot()).not.toBeNull();
      r.step(6);
      r.walk.setStance('prone');
      r.step(12);
      expect(r.walk.ticks() - shot).toBeLessThan(30);
      r.walk.setStance('stand');
      r.step();
      out.t4Taken = r.walker().stance === 'stand';
      r.unbind();
    }
    // The drop before the timer, then "up" (stand: the drop, 0x19, refuses crouch only, D:L418995) on the clip's second
    // command: with the stick forward from the press it waits for the stick's cut; untouched, for the clip's end.
    {
      const r = rig();
      const shot = r.walk.ticks();
      expect(r.fire.shoot()).not.toBeNull();
      r.step(6);
      r.walk.setStance('prone');
      for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
      const after = r.afterShot();
      r.walk.setStance('stand');
      r.setWish(FORWARD);
      let early = false;
      const k = until(r, () => r.walker().stance !== 'prone');
      if (r.walk.ticks() - after < 4) early = true;               // before RELOAD_CUT_DELAY_READING's fourth command
      out.dropStick = (r.walk.ticks() - shot) * TICK;
      out.dropStickEarly = early;
      void k;
      r.unbind();
    }
    {
      const r = rig();
      const shot = r.walk.ticks();
      expect(r.fire.shoot()).not.toBeNull();
      r.step(6);
      r.walk.setStance('prone');
      for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
      r.walk.setStance('stand');
      until(r, () => r.walker().stance !== 'prone');
      out.dropRest = (r.walk.ticks() - shot) * TICK;
      r.unbind();
    }
    // Finding 2-1: shot running, then prone at speed: the dive (speed squared 900 or more, `FUN_00584b00`) is the top at
    // the timer's end -- nothing is pushed. Once it is down and at rest a stand press with the sticks at rest is taken.
    {
      const r = rig();
      r.setWish(RUN);
      r.step(60);
      const s = r.walker().state;
      expect(s.vx * s.vx + s.vz * s.vz).toBeGreaterThanOrEqual(900);
      const shot = r.walk.ticks();
      expect(r.fire.shoot()).not.toBeNull();
      r.step(12);
      expect(r.walk.pronePress()).toBe(true);
      const moves = r.walk.traversal() as Traversal;
      for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
      out.diveOnTop = moves.inDive();
      r.setWish(STILL);
      r.step();
      out.diveLife = r.lives();
      out.diveHold = r.walker().holding?.clip ?? null;
      for (let i = 0; i < 240 && moves.inDive(); i++) r.step();
      r.step(2);
      expect(r.walker().stance).toBe('prone');
      out.diveBefore = (r.walk.ticks() - shot) * TICK < 0.5 + 1.396;  // the clip's life would still run
      r.walk.setStance('stand');
      out.diveTaken = until(r, () => r.walker().stance === 'stand', 120);
      r.unbind();
    }
  });

  it('T1: prone, the stick forward a command after a stand press inside the clip -- no stand-in hold, the stance taken within 3 commands (FUN_00550ef0 D:L418180-418203; was: seal_prone_reload, 1.355 s after the shot)', () => {
    expect(out.t1Hold).not.toBe('seal_prone_reload');
    expect(out.t1Hold).toBeNull();
    expect(out.t1Taken).toBeLessThanOrEqual(3);
    expect(out.t1Seconds).toBeLessThan(0.7);
    // the command: the life is cut on the first command of the stick `reloadCutAt` lets (`FUN_00587c20` D:L445550-445556),
    // and the request taken a game frame after it (KILL2: the change 1 f after the cut row; `STANCE_POP_FRAME_COMMANDS`)
    expect(out.t1Life).toBe(out.t1Cut);
    expect(out.t1At).toBe(out.t1Life + 2);
  });

  it('T2: prone, sticks at rest -- the press waits while the clip runs (FUN_00552ec0 D:L418927-418930) and is taken a game frame past its end: the shot to the change in [1.900, 2.033] s, the push to it in [1.383, 1.517] s (KILL2, the capture; was: 1.605 s)', () => {
    expect(out.t2PendingLate).toBe(true);
    expect(out.t2TakenBy).toBe(true);
    expect(out.t2Seconds).toBeGreaterThanOrEqual(1.900);
    expect(out.t2Seconds).toBeLessThanOrEqual(2.033);
    expect(out.t2Push).toBeGreaterThanOrEqual(1.383);
    expect(out.t2Push).toBeLessThanOrEqual(1.517);
    // T2 lands at exactly 1.9 s (57.0 f), one frame below the capture's minimum (57.49 f by the clock): the short kit
    // timer, LATER 1298 (filed on agent/next by the merge seat, 2026-11-21).
    // the command: the life ends on the command `reloadEnded` names for seal_prone_reload_shotgun from the after-shot's
    // command, and the request is taken a game frame after it (KILL2: the posture changes on the row after the first
    // looped one; `STANCE_POP_FRAME_COMMANDS`)
    expect(out.t2Life).toBe(out.t2End);
    expect(out.t2At).toBe(out.t2Life + 2);
  });

  it("T3: standing still -- a crouch pressed at 0.6 s waits under seal_reload_shotgun with the sticks at rest (research 251 section 6's gap closed); the stick cuts it and the crouch follows within 3 commands", () => {
    expect(out.t3Pending).toBe(true);
    expect(out.t3Stance).toBe('stand');
    expect(out.t3StickTaken).toBeLessThanOrEqual(3);
    expect(out.t3Life).toBe(out.t3Cut);
    expect(out.t3At).toBe(out.t3Life + 2);
  });

  // F2 of the review of 0b122c4034 (PTW.R3 with `room.ts`'s `oneShotOnTop`, which reads the life at `p.ran`, the command
  // run): inside `rerunFrom` (a knock's, a dance's or an untake's re-run) the still clip's life is asked at the replayed
  // command's own tick, not the live one -- a press replayed on a command before the life's first is taken as it was.
  it("F2: a stance press replayed (rerunFrom) on a command before the after-shot's life is taken as at that command; one inside it still waits", () => {
    const rerun = (r: Rig, from: number): boolean => (r.walk as unknown as {
      rerunFrom(from: number, between: () => void, stopAfter: null, replayed: undefined, told: 'redone', opts: { relog: true }): boolean;
    }).rerunFrom(from, () => undefined, null, undefined, 'redone', { relog: true });
    const taps = (r: Rig): number => (r.walk as unknown as { taps: number }).taps;
    {
      const r = rig();
      expect(r.fire.shoot()).not.toBeNull();
      r.step(10);
      const from = taps(r);
      r.step(5);
      r.walk.setStance('crouch');                                  // before the timer's end: no life yet, taken at once
      r.step();
      expect(r.walker().stance).toBe('crouch');
      for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
      r.step(3);
      expect(r.lives()).toBe(true);
      expect(rerun(r, from)).toBe(true);
      expect(r.walker().stance, 'the replayed press, on a command before the life').toBe('crouch');
      expect(r.walker().pendingStance).toBeNull();
      r.unbind();
    }
    {
      const r = rig();
      const { after } = shootToAfterShot(r);
      r.step(2);
      const from = taps(r);
      r.step(3);
      r.walk.setStance('crouch');                                  // inside the life: waits (standing still, sticks at rest)
      r.step(3);
      expect(r.walker().stance).toBe('stand');
      expect(rerun(r, from)).toBe(true);
      expect(r.walker().stance, 'the replayed press, inside the life').toBe('stand');
      expect(r.walker().pendingStance).toBe('crouch');
      expect(r.walk.ticks() - after).toBeLessThan(20);
      r.unbind();
    }
  });

  it('T4: standing, prone at 0.1 s and stand at 0.3 s, both before the timer -- the stand is taken at once (0x19 refuses crouch only, D:L418995)', () => {
    expect(out.t4Taken).toBe(true);
  });

  it('the drop before the timer, then stand on the clip: with the stick it waits for the cut (about 0.567 s after the shot), untouched for the clip (about 1.896 s)', () => {
    expect(out.dropStickEarly).toBe(false);
    expect(out.dropStick).toBeGreaterThan(0.55);
    expect(out.dropStick).toBeLessThan(0.65);
    expect(out.dropRest).toBeGreaterThan(1.85);
    expect(out.dropRest).toBeLessThan(1.95);
  });

  it("finding 2-1: the dive on top at the timer's end -- no clip, no hold (FUN_005b4340 D:L469334-469335; D:L476561 zeroes the timer all the same), so the stand after the dive is taken at once", () => {
    expect(out.diveOnTop).toBe(true);
    expect(out.diveLife).toBe(false);
    expect(out.diveHold).toBeNull();
    expect(out.diveBefore).toBe(true);
    expect(out.diveTaken).toBeLessThanOrEqual(2);
  });

  // BOLT_POP_TRANSITION_READING: the original pops an in-flight drop when the still clip is pushed (`FUN_0058a4d0`
  // D:L446753-446781, D:L462924-462927), so a crouch -- which the drop 0x19 refuses (D:L418953) -- waits only for the
  // clip's cut. The port lets the drop run on (the room's mover would have to pop it on the same command: `room.ts`
  // `lockLife`), so the crouch waits for the drop's own end or cut too. Held as a known gap until the pop is built.
  it.fails('BOLT_POP_TRANSITION_READING (reloadClip.ts): the drop before the timer, then crouch with the stick -- taken about 0.567 s after the shot', () => {
    const r = rig();
    const shot = r.walk.ticks();
    expect(r.fire.shoot()).not.toBeNull();
    r.step(6);
    r.walk.setStance('prone');
    for (let i = 0; i < 120 && r.afterShot() < 0; i++) r.step();
    r.walk.setStance('crouch');
    r.setWish(FORWARD);
    until(r, () => r.walker().stance === 'crouch');
    const seconds = (r.walk.ticks() - shot) * TICK;
    r.unbind();
    expect(seconds).toBeLessThan(0.65);
  });
});
