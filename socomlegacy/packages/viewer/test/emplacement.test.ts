// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { GAME_FRAME_DT, TURRET_VERTICAL_READING, type CollisionOwner, type GridParams, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { loadKitSource } from '../src/loadout';
import { groundGrid, packGround, Walker } from '../src/mover';
import { oneShotSeconds } from '../src/locomotion';
import { simMapFromBytes } from '../src/simMap';
import {
  canMount, clampAim, mountPhase, mountPlayedOut, mountRootVelocity, mountSteerTicks, muzzleAt, ReleaseTravel, SEAT_TURN_DEG_S, SeatSteer, seatTarget,
  seatTurn, steerEase,
  TURRET_APPROACH_READING, TURRET_SEAT_READING,
  type MountShape, type SeatMover,
} from '../src/net/emplacement';

/**
 * MAP-10b (web sprint 27; research 215 s5, 177 s2-s4): the emplacement's two rules the room and the page share -- the
 * mount test (`FUN_003a90c0` D:L300446-300516) and the aim's clamp to the placement's own limits -- on Crossroads'
 * placements as `@s2u/scene` reads them (the fixture), never a hand-made table.
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP72 = fixture('RUN/MP72.ZDB'), READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR');
type V3 = [number, number, number];
const DEG_R = Math.PI / 180;

describe.skipIf(!MP72 || !READERC || !ZWEAPON)(`the emplacement's rules (MAP-10b)${MP72 && READERC && ZWEAPON ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let one: TurretPlacement, two: TurretPlacement;
  beforeAll(async () => {
    const kits = await loadKitSource(new FsAssetSource(FIXTURES));
    const turrets = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', kits).turrets!;
    one = turrets.find((t) => t.name === 'mp72_turret01')!;
    two = turrets.find((t) => t.name === 'mp72_turret02')!;
  }, 120_000);

  it("a mount needs the turret free, the feet within 22 u squared and the approach within 35 deg of the gun's rear (FUN_003a90c0 D:L300446-300516); the vertical bound is TURRET_VERTICAL_READING", () => {
    // Turret 1's gun points -z (its root unturned: the facing 0, the firepoint 9.7 u ahead); its rear is +z.
    expect(one.facing).toBeCloseTo(0, 3);
    expect(one.mountRange).toBe(22);
    expect(one.mountAngleCos).toBeCloseTo(Math.cos((35 * Math.PI) / 180), 6);
    const [x, y, z] = one.origin;
    const behind = (d: number, dy = 0): V3 => [x, y + dy, z + d];
    // The squared distance (D:L300482-300486: x, y and z, the separation included) against 22 squared = 484.
    expect(canMount(one, behind(21.9), 0, false)).toBe(true);
    expect(canMount(one, behind(22), 0, false)).toBe(true);
    expect(canMount(one, behind(22.01), 0, false)).toBe(false);
    expect(canMount(one, behind(14.54, -13.69), 0, false)).toBe(true);     // the floor behind it, 13.69 below the root
    expect(canMount(one, behind(19, -13.69), 0, false)).toBe(false);       // 23.4 u in three dimensions
    // Free: an occupant (or the unavailable flag) refuses first (D:L300471-300474).
    expect(canMount(one, behind(10), 0, true)).toBe(false);
    // The facing: the player's within the authored 35 deg of the gun's (D:L300494-300504), either way round.
    expect(canMount(one, behind(10), 34.9, false)).toBe(true);
    expect(canMount(one, behind(10), 360 - 34.9, false)).toBe(true);
    expect(canMount(one, behind(10), 35.1, false)).toBe(false);
    expect(canMount(one, behind(10), 180, false)).toBe(false);
    // Turret 2 faces about 90.9 (its root turned): the same test about its own facing, not the world's axes.
    const [x2, y2, z2] = two.origin;
    expect(two.facing).toBeCloseTo(90.92, 1);
    expect(canMount(two, [x2 + 10, y2, z2], two.facing + 30, false)).toBe(true);
    expect(canMount(two, [x2 + 10, y2, z2], 0, false)).toBe(false);
    // The vertical bound (`DAT_003e0828`, D:L300487-300489) is unread: no test of its own -- a mount from 15 u above
    // and 15 behind passes on the distance alone. The approach's side test (`DAT_003e0830`, D:L300505-300512) is unread too.
    expect(TURRET_VERTICAL_READING).toBeNull();
    expect(TURRET_APPROACH_READING).toBeNull();
    expect(canMount(one, behind(15, 15), 0, false)).toBe(true);
  });

  it("the aim is clamped to the placement's own limits: Crossroads turret 1 -10..110 / -45..35, never a symmetric guess", () => {
    const aim = (t: TurretPlacement, yaw: number, pitch: number) => {
      const a = clampAim(t, yaw, pitch);
      return [Number(a.yaw.toFixed(3)), Number(a.pitch.toFixed(3))];
    };
    // Within the limits nothing moves.
    expect(aim(one, 100, 30)).toEqual([100, 30]);
    expect(aim(one, 355, -40)).toEqual([355, -40]);
    // Past either yaw stop: to that stop, measured from the gun's facing in the body's yaw (left positive).
    expect(aim(one, 120, 0)).toEqual([110, 0]);
    expect(aim(one, 340, 0)).toEqual([350, 0]);
    expect(aim(one, 200, 0)).toEqual([350, 0]);                    // -160 the short way: the -10 stop
    expect(aim(one, 175, 0)).toEqual([110, 0]);
    // The pitch's two stops are its own, not the yaw's or a mirror.
    expect(aim(one, 0, 40)).toEqual([0, 35]);
    expect(aim(one, 0, -50)).toEqual([0, -45]);
    // Turret 2 (LMG, +-70 / +-45) about its own facing.
    const f2 = two.facing;
    expect(clampAim(two, f2 + 80, 50).yaw).toBeCloseTo(f2 + 70, 3);
    expect(clampAim(two, f2 - 80, -50).yaw).toBeCloseTo(f2 - 70, 3);
    expect(clampAim(two, f2 - 80, -50).pitch).toBeCloseTo(-45, 3);
    // The muzzle at rest is the firepoint's world origin; turned, it swings about the gun's pivot with the aim.
    expect(muzzleAt(one, 0, 0).map((v) => Number(v.toFixed(2)))).toEqual(one.firepointOrigin.map((v) => Number(v.toFixed(2))));
    const swung = muzzleAt(one, 90, 0);
    expect(swung[0]).toBeLessThan(one.origin[0] - 9);                // the gun turned left points -x
    expect(Math.hypot(swung[0] - one.gunOrigin[0], swung[2] - one.gunOrigin[2])).toBeCloseTo(Math.hypot(one.firepointOrigin[0] - one.gunOrigin[0], one.firepointOrigin[2] - one.gunOrigin[2]), 3);
  });
});

// ---- PB-2, PB-2c (issue #81; research 215 s7.1): the mount's steer, no game data -----------------------------------------

/** A synthetic mount clip: 26 keys at playback 0.3, its skeleton root at (x, 11, z) on every key, `refPt` (0, -2.5, 8). */
function steady(x = 0, z = 0): MountShape {
  const keys = 26, root = new Float32Array(keys * 3);
  for (let k = 0; k < keys; k++) root.set([x, 11, z], k * 3);
  return { clip: 'synthetic', refPt: [0, -2.5, 8], root, keys, seconds: oneShotSeconds(0.3, keys) };
}
/** The synthetic clips' playback and one-shot end (n - 1) / n (`FUN_0028cc10` D:L134494). */
const P = 0.3, E = 25 / 26;

describe('PB-2: the seat is a steer, not a parent (FUN_005b3340 while the mount clip plays)', () => {
  it("PB-2c: the mount clip comes off when the driver's end test passes -- its phase before the tick's advance plus half a game frame's step, past (n - 1) / n (FUN_0028c6e0 D:L134283-134308): at the game's frame after 8 advances, about key 24.06 of 26; at the port's 60 Hz after 16 ticks, key 24.04 -- never 25", () => {
    const shape = steady();
    expect(mountPhase(shape, 0)).toBe(0);
    expect(mountPhase(shape, 0.1)).toBeCloseTo(0.1 / (P * E), 12);            // dt / (playback x e) an advance (FUN_0028c4f0)
    expect(mountPhase(shape, 1)).toBe(E);                                      // held at the one-shot's end
    // The game's frame (GAME_FRAME_DT): off on the driver's tick after 8 advances -- phase 0.9254, key 24.06.
    expect([7, 8].map((m) => mountPlayedOut(m * GAME_FRAME_DT, P, 26))).toEqual([false, true]);
    expect(mountSteerTicks(P, 26, GAME_FRAME_DT)).toBe(8);
    expect(mountPhase(shape, 8 * GAME_FRAME_DT) * 26).toBeCloseTo(24.06, 2);
    // The port's 60 Hz tick: 16 steer ticks (key 24.04), the hold on the 17th. Was: the clip run to key 25 (17 ticks).
    expect(mountSteerTicks(P, 26, 1 / 60)).toBe(16);
    expect(mountPhase(shape, 16 / 60) * 26).toBeCloseTo(24.04, 2);
    // The bound: P e^2 - G / 2 of the clip's run.
    expect(mountPlayedOut(oneShotSeconds(P, 26) - GAME_FRAME_DT / 2 + 1e-9, P, 26)).toBe(true);
    expect(mountPlayedOut(oneShotSeconds(P, 26) - GAME_FRAME_DT / 2 - 1e-9, P, 26)).toBe(false);
  });

  it("PB-2c: each tick the offset to the seat -- the turret's place plus refPt turned to the facing recorded at the mount, less the root with its x and z zeroed -- times sqrt(ease(phase)) at the motion's own phase (0 to (n - 1) / n), the turn toward that facing; the tick the clip comes off moves nothing and lays that facing, the hold's first (FUN_005b3340 D:L468890-468930; FUN_005463c0 D:L412260-412297; FUN_0057a330 D:L439091-439102)", () => {
    // A gun resting at 90 (-x), left turned to 60 by its last occupant: the steer aims at 60's seat, not 90's.
    const t = { origin: [0, 13.5, 0] as V3, facing: 90 }, shape = steady(2, -4), dt = 1 / 60;
    const steer = SeatSteer.start(t, shape, [14, 1, 3], 60)!;
    expect(steer.toward).toBe(60);
    expect(SeatSteer.start(t, shape)!.toward).toBe(90);                        // no gun yaw given: the placement's own
    const seat = seatTarget({ origin: t.origin, facing: 60 }, shape.refPt, [0, 11, 0]);
    expect(steer.target()).toEqual(seat);                                       // the root's x and z (2, -4) not in it
    expect(seat[0]).toBeCloseTo(8 * Math.sin(60 * DEG_R), 9);
    expect(seat[2]).toBeCloseTo(8 * Math.cos(60 * DEG_R), 9);
    const faces: number[] = [], glides: [number, number][] = [];
    const state = { x: 14, y: 1, z: 3, yaw: 40, vx: 2, vz: 2 };
    const w: SeatMover = { state, glide(dx, dz) { glides.push([dx, dz]); state.x += dx; state.z += dz; }, face(yaw) { faces.push(yaw); state.yaw = yaw; } };
    expect(steer.step(w, dt)).toBe(false);
    const k = (j: number): number => Math.sqrt(steerEase(mountPhase(shape, j * dt)));
    expect(k(1)).toBe(Math.sqrt(steerEase(dt / (P * E))));                     // the motion's phase, not dt over the run
    expect(state.x).toBeCloseTo(14 + (seat[0] - 14) * k(1), 12);
    expect(state.z).toBeCloseTo(3 + (seat[2] - 3) * k(1), 12);
    expect(state.y).toBe(1);                                                    // no vertical: the move lays the floor's height
    expect(faces[0]).toBe(seatTurn(40, 60, dt));                                // toward 60, not the rest facing 90
    expect([state.vx, state.vz]).toEqual([0, 0]);
    let ticks = 1;
    while (!steer.step(w, dt)) ticks++;
    expect(ticks).toBe(16);                                                     // 16 steer ticks; off on the 17th
    expect(glides).toHaveLength(16);                                            // which moves nothing
    expect(faces).toHaveLength(17);
    expect(faces.at(-1)).toBe(60);                                              // and lays the recorded facing (FUN_00585cd0)
    expect(steer.facing()).toBe(60);
    // Short of the seat by the ease's product: the clip comes off before its phase reaches 1.
    let left = Math.hypot(14 - seat[0], 3 - seat[2]);
    for (let j = 1; j <= 16; j++) left *= 1 - k(j);
    expect(Math.hypot(state.x - seat[0], state.z - seat[2])).toBeCloseTo(left, 12);
    expect(left).toBeGreaterThan(0);
    // No clip, no steer; the one-shot branch abandons none for distance (FUN_0057a330 D:L439017-439020).
    expect(SeatSteer.start(t, null, [0, 0, 0])).toBeNull();
    expect(SeatSteer.start(t, shape, [8 + 40, 0, 0])).not.toBeNull();
  });

  it("the turn: 2 pi rad/s at most, times the sine of the angle (D:L468863-468886) -- from 30 off it does not close within the clip's 16 ticks; the vertical is no mover's (TURRET_SEAT_READING)", () => {
    const t = { origin: [0, 13.5, 0] as V3, facing: 90 }, dt = 1 / 60;
    expect(TURRET_SEAT_READING).toBe("FUN_005b3340 over the mount clip; its turn to the mover, the height the floor's");
    expect(SEAT_TURN_DEG_S).toBe(360);
    expect([0, 0.25, 0.5, 0.75, 1].map(steerEase)).toEqual([0, 0.125, 0.5, 0.875, 1]);
    const faces: number[] = [];
    const state = { x: 14, y: 1, z: 3, yaw: 60, vx: 0, vz: 0 };
    const steer = SeatSteer.start(t, steady(), [14, 1, 3])!;
    while (!steer.step({ state, glide(dx, dz) { state.x += dx; state.z += dz; }, face(yaw) { faces.push(yaw); state.yaw = yaw; } }, dt));
    expect(faces.slice(0, 6).map((y) => Number(y.toFixed(6)))).toEqual([63, 65.723943, 68.190744, 70.419851, 72.430602, 74.241766]);
    expect(90 - faces.at(-2)!).toBeCloseTo(5.262075799, 6);                    // the 16th tick: 5.26 short
    expect(faces.at(-1)).toBe(90);                                              // the 17th lays it
    expect([seatTurn(60, 90, 0), seatTurn(90, 90, dt)]).toEqual([60, 90]);
    expect(seatTurn(80, 90, dt)).toBeCloseTo(80 + 6 * Math.sin(10 * DEG_R), 9);           // over 6 off: the clamp x sin a
    expect(seatTurn(87, 90, dt)).toBeCloseTo(87 + 3 * Math.sin(3 * DEG_R), 9);            // under: a sin a (3 x sin 3, degrees)
    expect(seatTurn(120, 90, dt)).toBeCloseTo(117, 9);                         // either side: toward the facing
    // A mover that takes no facing: the ground alone, its yaw left to it.
    const bare = { state: { x: 14, y: 1, z: 3, yaw: 60, vx: 0, vz: 0 }, glide(dx: number, dz: number) { bare.state.x += dx; bare.state.z += dz; } };
    const again = SeatSteer.start(t, steady(), [14, 1, 3])!;
    while (!again.step(bare, dt));
    expect([bare.state.y, bare.state.yaw]).toEqual([1, 60]);
  });

  it("PB-2c: refPt moves by the clip root's velocity x dt each tick, after the steer has read it (D:L468947-468951) -- the root's change from the key the phase is on to the next, times the keys over the playback (FUN_0028c250 -> FUN_00289bb0 D:L132691-132754), the last pair at the end", () => {
    const shape = steady();
    for (let k = 0; k < 26; k++) shape.root.set([0.01 * k, 11 - k / 25, -(k * k) / 100], k * 3);
    const kps = 26 / P;                                                         // keys over the playback
    // Phase 0.3: key 7.8, the pair (7, 8); at the end (25 / 26, key 25) the last pair (24, 25).
    const v = mountRootVelocity(shape, 0.3);
    expect(v[0]).toBeCloseTo(0.01 * kps, 4);                                   // the root's float32 keys
    expect(v[1]).toBeCloseTo((-1 / 25) * kps, 4);
    expect(v[2]).toBeCloseTo((-15 / 100) * kps, 4);
    expect(mountRootVelocity(shape, E)[2]).toBeCloseTo((-49 / 100) * kps, 4);
    // The steer: the seat each tick at refPt plus the travel of the ticks before it.
    const t = { origin: [0, 13.5, 0] as V3, facing: 0 }, dt = 1 / 60;
    const steer = SeatSteer.start(t, shape, [0, 0, 20])!;
    const state = { x: 0, y: 0, z: 20, yaw: 0, vx: 0, vz: 0 };
    const ref: V3 = [...shape.refPt];
    for (let j = 1; j <= 16; j++) {
      const at = steer.target(), want = seatTarget({ origin: t.origin, facing: 0 }, ref, [0, 0, 0]);
      expect([at[0] - want[0], at[2] - want[2]].map((d) => Math.abs(d) < 1e-9), `tick ${j}`).toEqual([true, true]);
      expect(steer.step({ state, glide(dx, dz) { state.x += dx; state.z += dz; } }, dt)).toBe(false);
      const vj = mountRootVelocity(shape, mountPhase(shape, j * dt));
      for (let a = 0; a < 3; a++) ref[a] = ref[a]! + vj[a]! * dt;
    }
    // The travel over the 16 ticks: about (n - 1) / n of the root's own over the keys run.
    expect(ref[2] - shape.refPt[2]).toBeLessThan(-3);
  });
});

// ---- LATER 109 (research 215 s7.9): the release's reversed clip, no game data ----------------------------------------------

/** A synthetic mount clip whose root leans 3.4 forward over its 26 keys (the disc's leans 3.37: -0.81 to -4.18). */
function leaning(): MountShape {
  const shape = steady();
  for (let k = 0; k < 26; k++) shape.root.set([0.002 * k, 11 - k / 50, -0.8 - (3.4 * k) / 25], k * 3);
  return shape;
}

describe("LATER 109: the release's reversed clip carries the body by its root's travel, through no wall (FUN_005a6eb0 -> FUN_0028c160; FUN_0057a330 D:L438901-438910; FUN_0054d9a0 D:L416479-416520; FUN_005483d0 D:L413908-413918)", () => {
  it("ends on the 17th step at 60 Hz -- the reversed end test (FUN_0028c6e0 D:L134283-134308: phase - G / (2 P e) < 0) is the forward's -- as SeatSteer.ends; on the 9th at the game's frame", () => {
    const shape = leaning(), t = { origin: [0, 13.5, 0] as V3, facing: 0 };
    expect(ReleaseTravel.start(shape)!.ends(1 / 60)).toBe(17);
    expect(ReleaseTravel.start(shape)!.ends(1 / 60)).toBe(SeatSteer.start(t, shape)!.ends(1 / 60));
    expect(ReleaseTravel.start(shape)!.ends(GAME_FRAME_DT)).toBe(9);
    expect(ReleaseTravel.start(null)).toBeNull();
  });

  it("each step moves the body by minus the root's velocity at the reversed phase e - j dt / (P e) (FUN_0028c160 sets e and the direction -1; FUN_0028c250 x -1), turned by the body's own yaw, x dt; the 17th moves nothing and answers true", () => {
    const shape = leaning(), dt = 1 / 60, yaw = 30, travel = ReleaseTravel.start(shape)!;
    const state = { x: 5, y: 0, z: -7, yaw, vx: 0, vz: 0 };
    const c = Math.cos(yaw * DEG_R), s = Math.sin(yaw * DEG_R);
    for (let j = 1; j <= 16; j++) {
      const before = [state.x, state.z];
      expect(travel.step({ state, glide(dx, dz) { state.x += dx; state.z += dz; } }, dt), `step ${j}`).toBe(false);
      const v = mountRootVelocity(shape, Math.max(0, E - (j * dt) / (P * E)));
      const want = [-(v[0] * c + v[2] * s) * dt, -(-v[0] * s + v[2] * c) * dt];
      expect(Math.abs(state.x - before[0]! - want[0]!), `step ${j} x`).toBeLessThan(1e-9);
      expect(Math.abs(state.z - before[1]! - want[1]!), `step ${j} z`).toBeLessThan(1e-9);
    }
    const end = [state.x, state.z];
    expect(travel.step({ state, glide(dx, dz) { state.x += dx; state.z += dz; } }, dt), 'the 17th: the set returns').toBe(true);
    expect([state.x, state.z]).toEqual(end);
    // The whole travel: back along the body's line (its +z, behind), about e of the root's own lean.
    const back = (end[0]! - 5) * s + (end[1]! + 7) * c;
    expect(back).toBeGreaterThan(3);
  });

  it("a wall does not stop it: laid on the place with no collision, on the floor there (TURRET_STEER_WALLS_READING, widened to the reversed clip) -- where the walk's own move stops 3.5 off the same wall", () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
    const wall: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-20, 0, 2, 20, 0, 2, 20, 40, 2, -20, 40, 2]) };
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: 0x1001 },
      { modelName: 'worldmodel', path: 'worldmodel/wall', first: 1, count: 1, flags: 0x1001 },
    ];
    const grid = groundGrid(packGround(params, [floor, wall], owners));
    const travelled = new Walker(grid);
    travelled.place(0, 1, 0);
    travelled.state.yaw = 0;                                           // facing -z: the travel goes +z, into the wall at z 2
    const travel = ReleaseTravel.start(leaning())!;
    while (!travel.step(travelled, 1 / 60));
    expect(travelled.state.z, 'through the wall at z 2').toBeGreaterThan(3);
    expect(travelled.state.y).toBe(0);
    // SEGMENT-BODY: the wall faces +z (Newell), and a hull face is met only from its front (research 281 s4.3), so the walk
    // comes from +z. The glide's whole move into it: four lines hit over 1 deep, more than two, and the move is put back
    // (`FUN_005483d0` D:L413602-413611) -- it stays at 10, off the wall's front. Was: from -z (the face's back), the
    // disc's 3.5 stand-off.
    const walked = new Walker(grid);
    walked.place(0, 1, 10);
    walked.glide(0, -13);
    expect(walked.state.z, "the walk's own move stops off it, on its front").toBeGreaterThan(5.5);
  });
});
