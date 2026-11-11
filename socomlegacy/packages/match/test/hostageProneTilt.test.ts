import { describe, expect, it } from 'vitest';
import { buildGrid, GameFrameAccumulator, probeGround, selectFloor, type GridParams, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround, PROTOCOL_VERSION, type SimMap } from '../../viewer/src/sim';
import { HOSTAGE_PRONE_TILT_READING, remoteTiltStep } from '../../viewer/src/remotePlayers';
import type { V3 } from '../../viewer/src/net/hitVolumes';
import { Room, type Conn } from '../src/room';
import { ACTION_CLIPS, ACTION_SECONDS, probeLiftOf, TICK } from '../../viewer/src/mover';
import { rootTiltStart, rotateByQuat, stepRootTilt, tiltTopOfSnapshot, tiltWindowOf } from '../../viewer/src/rootTilt';
import { HostageFollow, type FollowPlanner } from '../src/hostageFollow';

/**
 * PRONE-TILT-2 (5) (research 217 s7.10; reading, pending review): a knocked hostage's body runs `FUN_00548090` as a
 * SEAL's does (`CSealEx`, the one vtable holding `FUN_005506a0`), so its `Land forward` leans on a slope by (0.5, 0.9).
 * The room's hostage (`HostageFollow`, its own walker while the knock owns it: `rootTilt`) and the page's copy of it
 * (`remotePlayers` on the escortee snapshot: `tiltTopOfSnapshot`) take the same root (A = B). A synthetic 20-degree slope.
 */

const RAD = (20 * Math.PI) / 180;
const N = [0, Math.cos(RAD), Math.sin(RAD)] as const;
const slopeY = (x: number, z: number): number => -(N[0] * x + N[2] * z) / N[1];

describe('a knocked hostage on a slope (LATER 354 with FUN_00548090)', () => {
  it('its landing leans on the slope in the room (HostageFollow.rootTilt), and the page\'s snapshot path gives the same root', () => {
    const p: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-400, slopeY(-400, 400), 400, 400, slopeY(400, 400), 400, 400, slopeY(400, -400), -400, -400, slopeY(-400, -400), -400]),
    };
    const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 },
      [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
    const planner = { locate: () => null } as unknown as FollowPlanner;
    const follow = new HostageFollow(planner, grid, [0, slopeY(0, 0), 0], 0);
    expect(follow.rootTilt).toBeNull();
    expect(follow.knock({ velocity: [0, 60, 30], fall: 'fallForward' })).toBe(true);
    let copy = rootTiltStart(), leaned = 0, normal: readonly number[] = [0, 1, 0];
    const clock = new GameFrameAccumulator();                      // the page's copy: once a game frame (remoteTilt)
    const frames = (a: string): number => (ACTION_CLIPS as Readonly<Record<string, { frames: number }>>)[a]?.frames ?? 1;
    const seconds = (a: string): number => (ACTION_SECONDS as Readonly<Record<string, number>>)[a] ?? 0;
    for (let i = 0; i < 600 && follow.thrown; i++) {
      follow.physics(TICK);
      if (!follow.thrown) break;
      // the page's copy: the escortee snapshot's knock action and flight, the floor under the room's feet
      const feet = follow.feet;
      const top = tiltTopOfSnapshot({ stance: 'stand', action: follow.action, hold: null, traversal: null }, frames, seconds);
      for (let f = clock.advance(TICK); f > 0; f--) copy = stepRootTilt(copy, {
        normal: () => {                                               // the page's pick (`remoteTilt`) under the feet
          const f = selectFloor(probeGround(grid, feet[0], feet[2]), feet[1] + probeLiftOf('stand'), feet[1]);
          if (f) normal = [f.normal[0], f.normal[1], f.normal[2]];
          return normal;
        }, yaw: follow.yaw, span: tiltWindowOf(top.clip), phase: top.phase,
        prone: false, proneTransition: top.proneTransition, diving: top.diving, airborne: follow.airborne,
      });
      expect(copy.q, `tick ${i}`).toEqual(follow.rootTilt);
      if (follow.rootTilt && Math.acos(Math.min(1, rotateByQuat(follow.rootTilt, [0, 1, 0])[1])) * 180 / Math.PI > 5) leaned++;
      expect(feet[1]).toBeGreaterThan(slopeY(feet[0], feet[2]) - 1);
    }
    expect(normal[1]).toBeCloseTo(N[1], 6);
    expect(leaned).toBeGreaterThan(5);
  });
});

/** A knocked hostage on the slope, the room's walker; each thrown tick hands its state to `each`. */
function knockedOnSlope(stance: 'stand' | 'prone', each: (follow: HostageFollow, grid: ReturnType<typeof buildGrid>) => void): HostageFollow {
  const p: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/slope', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-400, slopeY(-400, 400), 400, 400, slopeY(400, 400), 400, 400, slopeY(400, -400), -400, -400, slopeY(-400, -400), -400]),
  };
  const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 200, cellsX: 4, cellsZ: 4, originX: -400, originZ: -400 },
    [], [], [p], [{ modelName: p.modelName, path: p.path, first: 0, count: 1 }]);
  const follow = new HostageFollow({ locate: () => null } as unknown as FollowPlanner, grid, [0, slopeY(0, 0), 0], 0);
  follow.stance = stance === 'prone' ? 2 : 0;                     // the AI's get-down (CAiSHostage sub-state 1): prone
  follow.knock({ velocity: [0, 60, 30], fall: 'fallForward' });
  for (let i = 0; i < 600 && follow.thrown; i++) {
    follow.physics(TICK);
    if (follow.thrown) each(follow, grid);
  }
  return follow;
}

describe('PRONE-TILT-2 review F1: a prone (get-down) hostage caught by a blast on the slope, the room and the page (A = B)', () => {
  it('the page (remoteTiltStep on the escortee snapshot, the AI\'s stance prone) takes the room\'s root tick for tick (HOSTAGE_PRONE_TILT_READING)', () => {
    expect(HOSTAGE_PRONE_TILT_READING).toBe('unprone');
    let copy = rootTiltStart(), written = 0;
    const clock = new GameFrameAccumulator();
    knockedOnSlope('prone', (follow, grid) => {
      const feet = follow.feet;
      const snap = { stance: 'prone' as const, action: follow.action, hold: null, traversal: null, yaw: follow.yaw, airborne: follow.airborne };
      for (let f = clock.advance(TICK); f > 0; f--) copy = remoteTiltStep(copy, snap, () => {
        const f = selectFloor(probeGround(grid, feet[0], feet[2]), feet[1] + probeLiftOf(snap.stance), feet[1]);   // `remoteTilt`'s lift: the stance word, prone (no stanceState), LATER 785
        return f ? f.normal : [0, 1, 0];
      }, true);
      expect(copy.q).toEqual(follow.rootTilt);
      if (follow.rootTilt) written++;
    });
    expect(written).toBeGreaterThan(5);
  });
});

describe('PRONE-TILT-2 review F2: the room turns a knocked hostage\'s capsules by its tilt (TILT_HIT_TEST_READING "posed")', () => {
  it('the order pick (Room.orderPick) misses a capsule the tilt swung off the ray, and meets it level', () => {
    const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
    };
    const ground = packGround(PARAMS, [floor], [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }]);
    const slot = (side: 0 | 1, x: number): SpawnSlot => ({ side, index: 0, position: [x, 0, 300], onFloor: true, step: 2, facing: [0, -1], loc: { map: 0, x: 0, z: 0 } });
    const map: SimMap = { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: [slot(0, 0), slot(1, 300)], respawns: [], notes: [] };
    const room = new Room(map, null, { now: () => 0, random: () => 0.5, launchCountdownS: 0 }, null, null);
    room.hello(1, { send() {}, close() {} } as Conn, { type: 'hello', version: PROTOCOL_VERSION, name: '', map: 'MP99' });
    room.step();
    // one hostage at the origin, a standing column of a body (one box, x and z -1..1, y 1..15; BONE-BOXES, research 217
    // s3.6b: the volumes are bone boxes, this one a hand-made bone at the identity, where it was one capsule of radius 1)
    // about its root at the feet
    const column = [{ part: 1, bone: 0, box: Float32Array.of(-1, 1, -1, 1, 15, 1), w: Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) }];
    const vols = { stand: column, crouch: column, prone: column, pivot: { stand: [0, 0, 0] as V3, crouch: [0, 0, 0] as V3, prone: [0, 0, 0] as V3 } };
    const tilt = [Math.sin(Math.PI / 6), 0, 0, Math.cos(Math.PI / 6)];   // 60 degrees about x: the top swung along z
    const hostage = { id: 9000, at: [0, 0, 0] as V3, yaw: 0, motion: { rootTilt: tilt as unknown } };
    const r = room as unknown as Record<string, unknown>;
    r.extraction = { hostages: [hostage], targetable: () => true, posture: () => 'stand' };
    r.hostageVolumes = () => vols;
    const pick = (): number | null => (r.orderPick as (i: number, d: V3, s?: number, o?: V3) => { picked: number | null }).call(room, 1, [1, 0, 0], undefined, [-50, 14, 0]).picked;
    expect(pick()).toBeNull();                                      // tilted: the column's top is off the ray at y 14
    hostage.motion.rootTilt = null;
    expect(pick()).toBe(9000);                                      // level: met
  });
});
