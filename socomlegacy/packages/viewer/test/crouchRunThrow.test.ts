import { describe, expect, it } from 'vitest';
import {
  buildGrid, CROUCH_MOVING_SPEED_SQ, CROUCH_RUN_QUICK_THROW_READING, heldPower, maxThrowDistance, maxThrowSpeed,
  releaseSeconds, THROW_ANIMS, THROW_PARAMS, throwAnim, throwClipSeconds, type CollisionOwner, type Grid,
  type GridParams, type WorldPoly,
} from '@s2u/scene';
import { GrenadeThrower, launchOf, type GrenadeItem } from '../src/grenade';
import { releasePowerClears, releaseStance, THROW_CLEARANCE_ENDS, throwClearanceSegment } from '../src/throwCommit';
import { moverSnapshot, Walker, type PlaySnapshot, type WalkInput } from '../src/mover';

/**
 * OBF-8 (research 85 §4.1; plan 2026-10-30-overnight-bugfix, OBF.R5): the crouch-run quick throw -- tap and let go
 * while crouch-running forward -- that a player's clip of the original (Trello xNAdEL9i) puts "about a second" off the
 * port. Every step of the throw was re-read at the original's source and agrees with the port; the second is not
 * traced to any of them, so it stands named (`CROUCH_RUN_QUICK_THROW_READING`) and these pins hold the port as it is.
 */

/** A crouched SEAL at the run, facing yaw 0 (-z), feet at the origin. */
const RUN_SPEED = 60;                                     // well past 15 u/s: any crouch-run the walker makes
const snap = (vz: number, stance: 'crouch' | 'prone' = 'crouch'): PlaySnapshot =>
  ({ feet: [0, 0, 0], yaw: 0, pitch: 0, vx: 0, vz, vy: 0, stance, peek: 0 }) as unknown as PlaySnapshot;

describe('OBF-8: the crouch-run quick throw, as the original reads', () => {
  it('names the reading: the clip, the release, the reach, no thrower velocity, and the unexplained second', () => {
    expect(CROUCH_RUN_QUICK_THROW_READING).toEqual({
      clip: 'seal_throwgrenade',
      releaseSeconds: releaseSeconds(THROW_ANIMS.standThrow),
      maxDistance: THROW_PARAMS.maxDistanceCrouch,
      throwerVelocityAdded: false,
      reportedOffSeconds: 1,
    });
  });

  it('a crouched SEAL moving past 15 u/s throws the standing throw, toss or not (FUN_0057fce0 D:L441827-441843)', () => {
    const speedSq = RUN_SPEED * RUN_SPEED;
    expect(speedSq).toBeGreaterThan(CROUCH_MOVING_SPEED_SQ);
    for (const power of [0.15, 0.3, 0.59, 0.95]) expect(throwAnim(power, 0, 'crouch', speedSq)).toBe(THROW_ANIMS.standThrow);
    expect(throwAnim(0.2, 0, 'crouch', CROUCH_MOVING_SPEED_SQ)).toBe(THROW_ANIMS.crouchThrow);
    expect(THROW_ANIMS.standThrow.clip).toBe(CROUCH_RUN_QUICK_THROW_READING.clip);
  });

  it('the hand opens 0.710 s after the release request, the clip plays 1.49 s (FUN_005802b0 D:L441904)', () => {
    expect(releaseSeconds(THROW_ANIMS.standThrow)).toBeCloseTo(0.7097, 4);
    expect(throwClipSeconds(THROW_ANIMS.standThrow)).toBeCloseTo(1.4878, 4);
    // the crouched still throw lets go 0.020 s later: the clip switch is not the second
    expect(releaseSeconds(THROW_ANIMS.crouchThrow) - releaseSeconds(THROW_ANIMS.standThrow)).toBeCloseTo(0.0198, 3);
  });

  it('the tap: under the abort threshold refused, nothing thrown (FUN_005be9a0 D:L475497-475498)', () => {
    expect(releasePowerClears(heldPower(3 / 60))).toBe(false);   // 0.143: three 60 Hz frames
    expect(releasePowerClears(heldPower(4 / 60))).toBe(true);    // 0.185
    expect(THROW_PARAMS.abortThreshold).toBe(0.15);
  });

  it('the reach is max_distance_crouch, and the launch carries none of the run (FUN_003cb1a0 D:L320727-320731)', () => {
    expect(maxThrowDistance('crouch')).toBe(CROUCH_RUN_QUICK_THROW_READING.maxDistance);
    const running = launchOf(snap(-RUN_SPEED), 0.2, 0, 'crouch', THROW_ANIMS.standThrow, null);
    const still = launchOf(snap(0), 0.2, 0, 'crouch', THROW_ANIMS.standThrow, null);
    expect(running.velocity).toEqual(still.velocity);
    expect(CROUCH_RUN_QUICK_THROW_READING.throwerVelocityAdded).toBe(false);
  });

  it('prone: the toss under 0.6 at a level aim, the throw past it; neither reads the speed (D:L441797-441825)', () => {
    expect(throwAnim(0.2, 0, 'prone', RUN_SPEED * RUN_SPEED)).toBe(THROW_ANIMS.proneToss);
    expect(throwAnim(0.7, 0, 'prone', 0)).toBe(THROW_ANIMS.proneThrow);
    expect(releaseSeconds(THROW_ANIMS.proneToss)).toBeCloseTo(0.5932, 4);
    expect(releaseSeconds(THROW_ANIMS.proneThrow)).toBeCloseTo(1.0169, 4);
    expect(maxThrowDistance('prone')).toBe(300);
  });
});

/**
 * OBF-23 (research 85 §4.2; the owner, 2026-10-30: "in the original client, it seemed to do a short overhand grenade. in
 * ours we do a short lob and stop" -- "a running crouch quick nade"). The crouch-run is the crouched state (`actor+0x174`
 * 1, the switch `FUN_005870e0` D:L445162-445168 into `FUN_00584c60`) whose stick past 12.4 / 14.8 (D:L444145) pushes the
 * standing run's clip with the state left at 1 (D:L444172-444192: `FUN_00588bc0(.., 2, +0x174, ..)`, no write to
 * `+0x174`). Every throw read takes that state -- `GetThrowAnim` (D:L441773, D:L441827-441843: moving, the standing
 * `Throw grenade`, never a toss), the clearance (`FUN_005499e0` D:L414024-414034: the crouched end) and the hand-open's
 * reach (`FUN_005c1970` D:L477069-477075: `max_distance_crouch`). The port's snapshot `stance` is the drawn posture
 * (`Walker.posture`, 'stand' through the crouch-run), so the port tossed (`Toss grenade`, the underhand lob, 1.07 s to
 * the hand, the stick cut at 0.75) from a 600 reach.
 */
const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 };
const floor: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-400, 0, -400, 400, 0, -400, 400, 0, 400, -400, 0, 400]),
};
const owners: CollisionOwner[] = [{ modelName: floor.modelName, path: floor.path, first: 0, count: 1 }];
const forward: WalkInput = { forward: 1, right: 0, boost: false };

/** A crouched SEAL on open floor, the stick full forward for a second: the crouch-run. */
function crouchRun(): { w: Walker; s: PlaySnapshot } {
  const w = new Walker(buildGrid(params, [], [], [floor], owners));
  w.place(0, 20, 0);
  w.state.yaw = 0;
  w.stance = 'crouch';
  for (let i = 0; i < 60; i++) w.tick(forward);
  return { w, s: moverSnapshot(w, null, 0, 0) };
}

/** A quick tap (six 60 Hz frames held) let go at `s`, flown to the hand-open: the throw's record. */
function tap(s: PlaySnapshot, item: GrenadeItem) {
  const g = new GrenadeThrower({ grid: (): Grid | null => null, snapshot: () => s, view: () => 'third' });
  g.select(item);
  g.update(1 / 60);
  g.pull();
  for (let i = 0; i < 6; i++) g.update(1 / 60);
  g.release();
  for (let i = 0; i < 120 && !g.stats().lastThrow; i++) g.update(1 / 60);
  return g.stats().lastThrow;
}

describe('OBF-23: the crouch-run quick tap throws the standing overhand throw, as the original', () => {
  it('the crouch-run is the crouched state, the body on the standing run (FUN_00584c60 D:L444145-444192)', () => {
    const { w, s } = crouchRun();
    expect(w.stance).toBe('crouch');                               // actor+0x174 stays 1
    expect(s.stance).toBe('stand');                                // the drawn posture: the standing run's blend
    expect(s.vx * s.vx + s.vz * s.vz).toBeGreaterThan(CROUCH_MOVING_SPEED_SQ);
    expect(releaseStance(s)).toBe('crouch');                       // what GetThrowAnim and the hand-open read
  });

  it('the clearance asks the crouched end from the standing throw hand (FUN_005499e0 D:L414024-414034)', () => {
    const { s } = crouchRun();
    const seg = throwClearanceSegment(s, 0.3, 0)!;
    const ends = throwClearanceSegment({ ...s, stance: 'crouch' }, 0.3, 0)!;
    expect(seg.to).toEqual(ends.to);
    const { stanceState, ...posture } = s;                        // the posture alone: what the port read before OBF-23
    expect(stanceState).toBe('crouch');
    const toss = throwClearanceSegment(posture, 0.3, 0)!;         // the standing toss's end
    expect(THROW_CLEARANCE_ENDS.crouch).not.toEqual(THROW_CLEARANCE_ENDS.standToss);
    expect(seg.to).not.toEqual(toss.to);
  });

  for (const item of ['M67', 'HE', 'AN-M8', 'Mark141'] as const) {
    it(`${item}: a tap is the overhand Throw grenade at 0.710 s with the crouched reach, not the lob (D:L441827-441843)`, () => {
      const { s } = crouchRun();
      const t = tap(s, item)!;
      expect(t).not.toBeNull();
      expect(t.clip).toBe(THROW_ANIMS.standThrow.clip);           // overhand, not `seal_tossgrenade`
      expect(t.toss).toBe(false);
      expect(t.stance).toBe('crouch');
      expect(t.releaseIn).toBeCloseTo(releaseSeconds(THROW_ANIMS.standThrow), 6);
      expect(t.maxSpeed).toBeCloseTo(maxThrowSpeed(THROW_PARAMS.maxDistanceCrouch, THROW_ANIMS.standThrow.offset[1]).speed, 6);
    });
  }
});
