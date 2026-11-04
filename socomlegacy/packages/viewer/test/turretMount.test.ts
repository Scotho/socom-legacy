// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRdr, parseZdb, rdrGet, Zar, type RdrNode } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { GAME_FRAME_DT, IDENTITY, multiply, parseMotionZar, partMatrix, probeGround, readKitTable, sampleClip, selectFloor, type CollisionOwner, type GridParams, type MotionClip, type TurretPlacement, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { Animator, partIndex, type MoverSnapshot } from '../src/animator';
import { characterTableFor, loadBody } from '../src/body';
import { heldSkeleton, mountMatrix } from '../src/heldItem';
import { actorToWorld, bodySkeleton } from '../src/play';
import { loadMap } from '../src/loadMap';
import { turretHoldKey } from '../src/turretPage';
import { oneShotSeconds } from '../src/locomotion';
import { motionTableFromArchive, type MotionEntry } from '../src/motionTable';
import {
  firepointFrame, gunDelta, holdPlace, holdStep, mountClipOf, mountPhase, mountRootAt, mountShape, muzzleAt, ReleaseTravel, SeatSteer, seatTarget, steerEase, TURRET_CLIPS,
  TURRET_STOW_PHASE, turretStow,
  TURRET_HOLD_CLIP, TURRET_HOLD_OFFSET_READING, TURRET_HOLD_PUSH_READING, TURRET_HELD_WEAPON_READING, TURRET_MOUNT_CLIPS,
  TURRET_MUZZLE_NODE_READING, TURRET_SEAT_READING, type MountShape,
} from '../src/net/emplacement';
import { groundGrid, packGround, STEP_PROBE_LIFT_READING, Walker } from '../src/mover';
import { simMapFromBytes, SIM_CLIPS, type SimMap } from '../src/simMap';

/**
 * The mount's body (research 215 s7): the turret anim set's clips off `animset.rdr` and `motion.rdr` (`FUN_005a6fc0`
 * D:L462173-462200, the names D:L495412-495414), the seat `FUN_005463c0` (D:L412260-412316) records and `FUN_005b3340` (PB-2)
 * steers the actor to -- `origin + R(facing) x (refPt - root)` -- on Crossroads (the fixture) and Vigilance (the disc),
 * the room's steer onto it (`SeatSteer`, TURRET_SEAT_READING), and the firepoint's frame a mounted round's flash is placed
 * on (TURRET_MUZZLE_NODE_READING).
 */

const FIXTURES = process.env.S2U_TEST_FIXTURES ? resolve(process.env.S2U_TEST_FIXTURES) : resolve(import.meta.dirname, '../../../test-fixtures');
const MP72 = fixture('RUN/MP72.ZDB'), READERC = fixture('RUN/READERC.ZAR'), ZWEAPON = fixture('RUN/ZWEAPON.ZAR'), PACK = fixture('RUN/MOTION_P.ZAR');
const READY = MP72 !== null && READERC !== null && ZWEAPON !== null && PACK !== null;
type V3 = [number, number, number];

/** A synthetic mount shape: its root from (0, 11, 0) to (0, 10, -4) over `keys`, `refPt` (0, -2.5, 8). */
function shapeOf(keys = 26, seconds = 0.3): MountShape {
  const root = new Float32Array(keys * 3);
  for (let k = 0; k < keys; k++) { const f = k / (keys - 1); root.set([0, 11 - f, -4 * f], k * 3); }
  return { clip: 'synthetic', refPt: [0, -2.5, 8], root, keys, seconds };
}

/** PB-2c: where a mount's steer starts the feet -- `d` behind the place on the gun's line and `side` to its right. */
const LANDINGS: readonly (readonly [number, number])[] = [[12, 0], [8, 6], [20, 0], [14, -8]];

/**
 * PB-2c: where the steer leaves the feet when the clip comes off, from the hold's place: measured through the read law on the
 * disc's `seal_stand2turret` (the fixture's pack), the same from every start and on every turret -- 0.215 at the port's
 * 60 Hz (16 ticks; the last aims with 15 ticks of the root's travel) and 0.293 at the game's frame (8; 7). The hold places
 * the body on the next tick. PB-2b's estimate, about 0.13, took the whole clip's travel.
 */
const LANDED_60 = 0.215, LANDED_GAME = 0.293;

/**
 * PB-2c: a mount from `d` behind and `side` aside steered on open ground (a free glide) at ticks of `dt` until the clip
 * comes off, toward the turret's own facing (a gun at rest): the feet's horizontal distance then from the hold's place at
 * that facing.
 */
function landed(t: TurretPlacement, shape: MountShape, d: number, side: number, dt = 1 / 60): number {
  const y = (t.facing * Math.PI) / 180, c = Math.cos(y), s = Math.sin(y);
  const state = { x: t.origin[0] + side * c + d * s, y: 0, z: t.origin[2] - side * s + d * c, yaw: t.facing, vx: 0, vz: 0 };
  const steer = SeatSteer.start(t, shape, [state.x, 0, state.z])!;
  while (!steer.step({ state, glide(dx: number, dz: number) { state.x += dx; state.z += dz; } }, dt));
  const hold = holdPlace(t, t.facing);
  return Math.hypot(state.x - hold[0], state.z - hold[2]);
}

/**
 * T81 (issue #81's rendered check, 2026-10-17; research 215 s7.7): how far a mounted body's hands lie from the drawn gun.
 * Nothing places the hands (`FUN_00585cd0` D:L444509-444628 and `FUN_005463c0` have no grip target; research 215 s7.4):
 * the hold `seal_turret_poses` at the key its gun's elevation picks carries the arms, and the hold places the body each
 * tick at the turret's place plus (-3.257, 0, 4.282) turned by the gun's yaw (`FUN_00585cd0` D:L444603-444625). With the
 * body where the hold puts it the clip's hands meet the gun at every aim -- measured 0.42-0.67 on Vigilance's
 * `mp51_turret01`, `02`, `04` and 0.11-0.59 on Crossroads' two (the nearest vertex of the gun's drawn parts, `loadMap`'s
 * placements turned by `gunDelta`, as the page's `WorldView.moveNode` draws them). `mp51_turret03` is left out: the floor
 * at its hold place is 0.8-1.3 above the one the clip stands on (the pivot 12.30-12.79 over it, not 13.56), so its left
 * hand rides 0.76-0.98 off the gun -- the floor's height is the original's own rule too (`FUN_0059afd0`,
 * D:L413943-413946); capture B 13. Before PAR-44 the hold left the body where the steer stopped and only turned it: the
 * owner's picture of 2026-10-11 (the hands 2.8-10 off; the hold's placement taken out, this test reads 0.71-3.14 at the
 * turned aims). The bound is a test tolerance over the measured 0.67 (`mp51_turret04`'s left hand), no game value.
 */
const T81_HAND_REACH = 0.7;
/** T81's aims: (yaw from the gun's facing, pitch), degrees. */
const T81_AIMS: readonly (readonly [number, number])[] = [[0, 0], [30, 0], [-30, 0], [70, 0], [0, 20], [0, -20], [0, 45], [0, -45]];

/**
 * T81: for each named turret of the map at `root` and each of `T81_AIMS`, a mount from 12 behind on the gun's line -- the
 * steer (`SeatSteer`, a free glide) to its end, the aim laid as the mover's yaw, then one tick of the hold (`holdStep`) --
 * and the hands of the map's SEAL in `seal_turret_poses` at `turretHoldKey(pitch)` through the port's animator, placed by
 * `actorToWorld`: the lines whose right or left hand lies further than `T81_HAND_REACH` from the drawn gun, and the reach
 * over every line (min, max) for the record.
 */
async function handsOffGun(root: string, stem: string, names: readonly string[]): Promise<{ off: string[]; range: [number, number] }> {
  const bytes = new Uint8Array(readFileSync(resolve(root, `RUN/${stem}.ZDB`))), toc = parseZdb(bytes);
  const sim = simMapFromBytes(bytes, `RUN/${stem}.ZDB`, { table: readKitTable(ZWEAPON!), readerc: READERC! });
  const map = await loadMap(new FsAssetSource(root), `RUN/${stem}.ZDB`);
  const all = parseMotionZar(Zar.parse(PACK!)), table = motionTableFromArchive(READERC!);
  const shape = mountShape(all.filter((c) => TURRET_CLIPS.includes(c.name)), table, 0)!;
  const characters = await characterTableFor(new FsAssetSource(root), `RUN/${stem}.ZDB`);
  const sk = heldSkeleton(bodySkeleton(loadBody(bytes, toc, characters, () => undefined, 'navyseals', 0)!));
  const anim = new Animator(sk, all.filter((c) => TURRET_CLIPS.includes(c.name) || c.name === 'seal_stand'), table);
  const REST: MoverSnapshot = {
    vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
    ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
  };
  for (let f = 0; f < 60; f++) anim.step(1 / 60, REST);
  const hands = (key: number): V3[] => {
    for (let f = 0; f < 90; f++) anim.step(1 / 60, { ...REST, traversal: { clip: TURRET_HOLD_CLIP, frame: key, loop: false, rootY: null } });
    return ['rhand', 'lhand'].map((n): V3 => { const m = sk.world[sk.indexOf(n)]!; return [m[12]!, m[13]!, m[14]!]; });
  };
  const off: string[] = [];
  let lo = Infinity, hi = 0;
  for (const name of names) {
    const t = sim.turrets!.find((x) => x.name === name)!;
    // The gun's drawn vertices at rest: every placement beneath the gun part, through its own matrix (column-major).
    const rest: V3[] = [];
    for (const prop of map.props) {
      (prop.paths ?? []).forEach((path, i) => {
        if (path !== t.parts.gun && !path.startsWith(`${t.parts.gun}/`)) return;
        const M = prop.matrices.subarray(i * 16, i * 16 + 16);
        for (const mesh of prop.parts) {
          const p = mesh.positions;
          for (let k = 0; k < p.length; k += 3) {
            const x = p[k]!, y = p[k + 1]!, z = p[k + 2]!;
            rest.push([M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!]);
          }
        }
      });
    }
    expect(rest.length, `${name}: the gun's drawn parts`).toBeGreaterThan(500);
    const f = (t.facing * Math.PI) / 180;
    for (const [rel, pitch] of T81_AIMS) {
      const x0 = t.origin[0] + 12 * Math.sin(f), z0 = t.origin[2] + 12 * Math.cos(f);
      const floor = selectFloor(probeGround(sim.grid, x0, z0), t.origin[1] + STEP_PROBE_LIFT_READING, t.origin[1])!;
      const state = { x: x0, y: floor.y, z: z0, yaw: t.facing, vx: 0, vz: 0 };
      const steer = SeatSteer.start(t, shape, [x0, floor.y, z0], t.facing)!;
      while (!steer.step({ state, glide(dx: number, dz: number) { state.x += dx; state.z += dz; }, face(y: number) { state.yaw = y; } }, 1 / 60));
      state.yaw = t.facing + rel;                                     // the aim, laid as the mounted command's yaw
      holdStep(t, { state, grid: sim.grid });
      const feet: V3 = [state.x, state.y, state.z];
      const D = gunDelta(t, t.facing + rel, pitch);
      const gun = rest.map((v): V3 => [D[0]! * v[0] + D[4]! * v[1] + D[8]! * v[2] + D[12]!, D[1]! * v[0] + D[5]! * v[1] + D[9]! * v[2] + D[13]!, D[2]! * v[0] + D[6]! * v[1] + D[10]! * v[2] + D[14]!]);
      const near = (q: V3): number => Math.min(...gun.map((v) => Math.hypot(v[0] - q[0], v[1] - q[1], v[2] - q[2])));
      const [r, l] = hands(turretHoldKey(pitch)).map((h) => near(actorToWorld(feet, state.yaw, h)));
      lo = Math.min(lo, r!, l!); hi = Math.max(hi, r!, l!);
      if (!(r! <= T81_HAND_REACH && l! <= T81_HAND_REACH)) off.push(`${name} at ${rel}/${pitch}: rhand ${r!.toFixed(2)}, lhand ${l!.toFixed(2)}`);
    }
  }
  return { off, range: [lo, hi] };
}

/**
 * T81-4 (research 215 s7.1, s7.9; reading, pending review): a mount from 12 behind steered on the map's own ground by the
 * room's mover (a `Walker` on `sim.grid`, handed to `SeatSteer.step` whole, as the room's hunk hands it): the feet's
 * distance from the hold's place when the clip comes off. The original's steer passes every wall in the turret set
 * (`FUN_005483d0` D:L413908-413918, `TURRET_STEER_WALLS_READING`), so it lands where the free steer does, 0.215 (was:
 * stopped by the turret's own hull, the instance node's DI, 3.5 off it -- 2.434 short).
 */
function steeredOnGround(sim: SimMap, t: TurretPlacement, shape: MountShape): number {
  const f = (t.facing * Math.PI) / 180, w = new Walker(sim.grid);
  expect(w.place(t.origin[0] + 12 * Math.sin(f), t.origin[1] + STEP_PROBE_LIFT_READING, t.origin[2] + 12 * Math.cos(f)), `${t.name}: a floor 12 behind`).toBe(true);
  w.state.yaw = t.facing;
  const steer = SeatSteer.start(t, shape, [w.state.x, w.state.y, w.state.z], t.facing)!;
  let n = 0;
  while (!steer.step(w, 1 / 60)) n++;
  expect(n, t.name).toBe(16);
  const hold = holdPlace(t, t.facing);
  return Math.hypot(w.state.x - hold[0], w.state.z - hold[2]);
}

/**
 * T81-4's scope, both edges (the merge controller's condition): the walk outside the mount clip still meets the turret's
 * own hull. Before the mount, a walk from 12 behind straight at the hold's place stops short of it (the hull 3.5 off,
 * `BODY_RADIUS`); after the release, a still tick of the walk (its push-out, `Walker.glide(0, 0)`) moves a body left at the
 * hold's place back out of the hull's radius. Each would read 0 if the no-collision move leaked into the walk.
 */
function hullOutsideTheClip(sim: SimMap, t: TurretPlacement): { before: number; after: number } {
  const f = (t.facing * Math.PI) / 180, hold = holdPlace(t, t.facing), w = new Walker(sim.grid);
  w.place(t.origin[0] + 12 * Math.sin(f), t.origin[1] + STEP_PROBE_LIFT_READING, t.origin[2] + 12 * Math.cos(f));
  for (let i = 0; i < 40; i++) {
    const dx = hold[0] - w.state.x, dz = hold[2] - w.state.z, d = Math.hypot(dx, dz);
    if (d < 1e-6) break;
    w.glide((dx / d) * Math.min(1, d), (dz / d) * Math.min(1, d));
  }
  const before = Math.hypot(w.state.x - hold[0], w.state.z - hold[2]);
  const r = new Walker(sim.grid);
  r.place(hold[0], t.origin[1] + STEP_PROBE_LIFT_READING, hold[2]);
  holdStep(t, r);                                                   // where the hold leaves it, as the release finds it
  r.glide(0, 0);                                                    // the walk's next still tick
  return { before, after: Math.hypot(r.state.x - hold[0], r.state.z - hold[2]) };
}

describe('the seat and its steer (no game data)', () => {
  it("PB-2b's rework: the mount clip's stow (FUN_00588bc0 D:L446318-446343) -- Stand -> Turret at phase 0.5 (0x3f000000), Pistol stand -> Turret at 0.4 (0x3ecccccd): forward past it the rifle to its carry (FUN_005a73c0) or the pistol to its holster (FUN_005a75d0), reversed past it back in the hand (FUN_005a7520, FUN_005a7730)", () => {
    const bits = (v: number): string => new Uint32Array(Float32Array.of(v).buffer)[0]!.toString(16);
    expect([bits(TURRET_STOW_PHASE.rifle), bits(TURRET_STOW_PHASE.pistol)]).toEqual(['3f000000', '3ecccccd']);
    // The rifle's clip: before the phase the hand's (no override), at and past it the carry.
    expect(turretStow(0, 0.49, false)).toEqual({});
    expect(turretStow(0, 0.5, false)).toEqual({ rifle: 'carry' });
    expect(turretStow(0, 25 / 26, false)).toEqual({ rifle: 'carry' });
    // Reversed (the release): stowed above the phase, the hand's again at and below it.
    expect(turretStow(0, 25 / 26, true)).toEqual({ rifle: 'carry' });
    expect(turretStow(0, 0.51, true)).toEqual({ rifle: 'carry' });
    expect(turretStow(0, 0.5, true)).toEqual({});
    // The pistol's clip at 0.4 (float32).
    expect(turretStow(1, 0.39, false)).toEqual({});
    expect(turretStow(1, Math.fround(0.4), false)).toEqual({ pistol: 'holster' });
    expect(turretStow(1, 0.41, true)).toEqual({ pistol: 'holster' });
    expect(turretStow(1, Math.fround(0.4), true)).toEqual({});
    expect(TURRET_HELD_WEAPON_READING).toBe('carry');
  });

  it('the seat is origin + R(facing) x (refPt - root), the body frame x right, z behind: facing 0 puts it behind on +z, 90 on +x', () => {
    const at = (facing: number): V3 => seatTarget({ origin: [100, 50, 200], facing }, [-3, -2.5, 8], [-3, 11, -1]);
    expect(at(0).map((v) => Number(v.toFixed(6)))).toEqual([100, 36.5, 209]);
    // Facing 90 (left of -z, i.e. -x): behind is +x.
    expect(at(90).map((v) => Number(v.toFixed(6)))).toEqual([109, 36.5, 200]);
    expect(at(180).map((v) => Number(v.toFixed(6)))).toEqual([100, 36.5, 191]);
    // An x offset to the right: facing 0, +x.
    expect(seatTarget({ origin: [0, 0, 0], facing: 0 }, [2, 0, 0], [0, 0, 0])).toEqual([2, 0, 0]);
  });

  it("PAR-44: the hold's place is the turret's place plus (-3.257, ., 4.282), float32 c05072b0 / 40890625, turned by the aim's yaw -- 3.257 left of the gun's line and 4.282 behind; the hold writes it with the floor's height, no wall test, a falling mover stood on the floor (FUN_00585cd0 D:L444603-444625, FUN_005483d0 D:L413914-413947; research 215 s7.5)", () => {
    const bits = (v: number): string => new Uint32Array(Float32Array.of(v).buffer)[0]!.toString(16);
    expect(TURRET_HOLD_OFFSET_READING.map(bits)).toEqual(['c05072b0', '0', '40890625']);
    expect(TURRET_HOLD_OFFSET_READING[0]).toBe(Math.fround(-3.257));
    expect(TURRET_HOLD_OFFSET_READING[2]).toBe(Math.fround(4.282));
    expect(TURRET_HOLD_PUSH_READING).toBeNull();                     // the mover's push in the hold: unread, not applied
    const x = Math.fround(-3.257), z = Math.fround(4.282);
    const near = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
    // Facing 0 (down -z): left is -x, behind +z.
    expect(near(holdPlace({ origin: [100, 50, 200] }, 0), [100 + x, 50, 200 + z])).toBeLessThan(1e-12);
    // Facing 90 (down -x): behind is +x, left +z.
    expect(near(holdPlace({ origin: [100, 50, 200] }, 90), [100 + z, 50, 200 - x])).toBeLessThan(1e-12);
    expect(near(holdPlace({ origin: [100, 50, 200] }, 180), [100 - x, 50, 200 - z])).toBeLessThan(1e-12);
    // On a floor 13.69 under the place: written there, its height the floor's; a falling mover is stood on it.
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
    const floor: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]) };
    const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
    const w = new Walker(groundGrid(packGround(params, [floor], owners)));
    expect(w.place(0, STEP_PROBE_LIFT_READING, 12)).toBe(true);
    w.state.yaw = 30; w.state.vx = 4; w.state.vz = -2;
    w.setAirborne(true);
    expect(w.airborne).toBe(true);
    expect(holdStep({ origin: [0, 13.69, 0] }, w)).toBe(true);
    const at = holdPlace({ origin: [0, 13.69, 0] }, 30);
    expect(near([w.state.x, w.state.y, w.state.z], [at[0], 0, at[2]])).toBeLessThan(1e-12);
    expect([w.state.vx, w.state.vz, w.airborne]).toEqual([0, 0, false]);
  });

  it("the steer runs as the mount clip does (FUN_005b3340, PB-2; PB-2c): each tick the offset to the seat -- refPt moved by the root's travel so far, the root's x and z zeroed -- times sqrt(ease(phase)) at the motion's own phase, unclamped; 16 ticks at 60, off on the 17th; never abandoned for distance; not FUN_005b2d20's 30 a second (TURRET_SEAT_READING)", () => {
    expect(TURRET_SEAT_READING).toBe("FUN_005b3340 over the mount clip; its turn to the mover, the height the floor's");
    const t = { origin: [0, 13.5, 0] as V3, facing: 0 };
    const shape = shapeOf(26, 0.3 * (25 / 26) ** 2);
    expect(SeatSteer.start(t, null, [0, 0, 8])).toBeNull();                       // no clips: no steer
    const dt = 1 / 60;
    const s = { x: 6, y: 0, z: 20, yaw: 0, vx: 3, vz: 3 };
    const free = (state: typeof s) => ({ state, glide(dx: number, dz: number) { state.x += dx; state.z += dz; } });   // open ground
    const steer = SeatSteer.start(t, shape, [s.x, 0, s.z])!;
    // The first tick: refPt's (0, ., 8) behind the place -- the root's x and z not in it -- sqrt(ease) of the motion's phase.
    const at1 = steer.target(), k1 = Math.sqrt(steerEase(mountPhase(shape, dt)));
    expect([at1[0], at1[2]].map((v) => Number(v.toFixed(9)) + 0)).toEqual([0, 8]);
    expect(steer.step(free(s), dt)).toBe(false);
    expect(s.x).toBeCloseTo(6 + (0 - 6) * k1, 12);
    expect(s.z).toBeCloseTo(20 + (8 - 20) * k1, 12);
    expect([s.vx, s.vz]).toEqual([0, 0]);
    let n = 1;
    while (!steer.step(free(s), dt)) n++;
    expect(n).toBe(16);                                                         // 16 steer ticks, off on the 17th
    // Where the 16th tick aimed: refPt moved by 15 ticks of the root's velocity (4 forward over 25 keys, 26 / 0.3 keys a second).
    const travel = 15 * (-4 / 25) * (26 / 0.3) * dt;
    expect(Math.hypot(s.x, s.z - (8 + travel))).toBeLessThan(0.01);
    // A seat 40 away is still steered onto (the one-shot branch has no 30 abandon; the mount's reach bounds it).
    const far = { x: 0, y: 0, z: 52, yaw: 0, vx: 0, vz: 0 };
    const long = SeatSteer.start(t, shape, [far.x, 0, far.z])!;
    while (!long.step(free(far), dt));
    expect(Math.hypot(far.x, far.z - (8 + travel))).toBeLessThan(0.05);
  });

  // T81-4: a mover handed without its ground takes the steer's move through its own `glide` (no caller since T81-4: the
  // room and the page hand the walker); with the ground the move is laid with no collision (`TURRET_STEER_WALLS_READING`).
  // *Was* (PB-2): every mover's steer went through `Walker.glide`, a mount from in front stopped at the gun's hull.
  it("a mover without its ground takes the steer's move through its own glide, its wall its own (the caller's; T81-4's walker-handed steer passes the hull: TURRET_STEER_WALLS_READING)", () => {
    const t = { origin: [0, 13.5, 0] as V3, facing: 0 };
    const dt = 1 / 60;
    // A mover in front of the gun (-z), its seat behind (+z); a wall at z = -2 its glide stops at, as the hull does.
    const state = { x: 0, y: 0, z: -12, yaw: 0, vx: 1, vz: 1 };
    const glides: [number, number][] = [];
    const w = {
      state,
      glide(dx: number, dz: number) { glides.push([dx, dz]); state.x += dx; state.z = Math.min(-2, state.z + dz); },
    };
    const steer = SeatSteer.start(t, shapeOf(), [state.x, 0, state.z])!;
    let n = 0;
    while (!steer.step(w, dt)) { n++; expect(state.z).toBeLessThanOrEqual(-2); }
    expect(state.z).toBeLessThanOrEqual(-2);
    expect(glides.length).toBe(n);                                              // PB-2c: the tick it comes off moves nothing
    expect([state.vx, state.vz]).toEqual([0, 0]);
  });

  it('the mount clip is the hand\'s: the rifle seal_stand2turret, the pistol seal_p_stand2turret; the hold seal_turret_poses; every one in the sim\'s clips', () => {
    expect([mountClipOf(0), mountClipOf(1)]).toEqual(['seal_stand2turret', 'seal_p_stand2turret']);
    expect(TURRET_HOLD_CLIP).toBe('seal_turret_poses');
    expect(TURRET_CLIPS).toEqual(['seal_stand2turret', 'seal_p_stand2turret', 'seal_turret_poses']);
    for (const c of TURRET_CLIPS) expect(SIM_CLIPS, c).toContain(c);
    expect(TURRET_MUZZLE_NODE_READING).toBe('firepoint');
  });
});

describe.skipIf(!READY)(`the mount's clips and seat on the fixture${READY ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  const readerc = (): Zar => Zar.parse(READERC!);
  const table = (): Map<string, MotionEntry> => motionTableFromArchive(READERC!)!;
  const clips = (): MotionClip[] => parseMotionZar(Zar.parse(PACK!)).filter((c) => TURRET_CLIPS.includes(c.name));

  it("animset.rdr's turret anim set: Stand and Turret poses seal_turret_poses, Stand -> Turret seal_stand2turret, Pistol stand -> Turret seal_p_stand2turret", () => {
    const zar = readerc();
    const key = zar.root.children.find((k) => k.name.toLowerCase() === 'animset.rdr')!;
    const text = JSON.stringify(parseRdr(zar.data(key)));
    const at = text.indexOf('"turret anim set"');
    expect(at).toBeGreaterThan(0);
    const set = JSON.parse(text.slice(text.lastIndexOf('["anim_set_name"', at), text.indexOf(']]]]', at) + 4)) as RdrNode;
    const anims = rdrGet(set, 'anim_set_anims') as RdrNode[];
    const pairs = anims.map((a) => [rdrGet(a, 'type_name'), rdrGet(a, 'anim_name')]);
    expect(pairs).toEqual([
      ['Stand', TURRET_HOLD_CLIP], ['Turret poses', TURRET_HOLD_CLIP],
      ['Stand -> Turret', TURRET_MOUNT_CLIPS.rifle], ['Pistol stand -> Turret', TURRET_MOUNT_CLIPS.pistol],
    ]);
  });

  it("motion.rdr: both mount clips playback 0.3, NoInterrupt, NoFire, NoPitchtwist, refPt (-3.31, -2.526, 7.655); the hold looped at 1, NoPitchtwist, no refPt (FUN_00287620 D:L131598-131611)", () => {
    const t = table();
    for (const name of [TURRET_MOUNT_CLIPS.rifle, TURRET_MOUNT_CLIPS.pistol]) {
      const e = t.get(name)!;
      expect([e.looped, e.playback, e.noInterrupt, e.noFire, e.noPitchtwist, e.refPt], name).toEqual([false, 0.3, 1, 1, true, [-3.31, -2.526, 7.655]]);
    }
    const hold = t.get(TURRET_HOLD_CLIP)!;
    expect([hold.looped, hold.playback, hold.noPitchtwist, hold.refPt]).toEqual([true, 1, true, undefined]);
  });

  it("the pack: the mount clips 26 keys, the root from (-3.258, 11.035, -0.8125) to the hold's (-3.203, 10.520, -4.184); the hold 3 keys; the run 0.3 x (25/26)^2", () => {
    const c = clips();
    const shape = mountShape(c, table(), 0)!;
    expect(shape.clip).toBe(TURRET_MOUNT_CLIPS.rifle);
    expect(shape.keys).toBe(26);
    expect(shape.seconds).toBeCloseTo(oneShotSeconds(0.3, 26), 9);
    expect(mountRootAt(shape, 0)).toEqual([-3.2578125, 11.03515625, -0.8125]);
    expect(mountRootAt(shape, 99)).toEqual([-3.203125, 10.51953125, -4.18359375]);
    expect(mountShape(c, table(), 1)!.clip).toBe(TURRET_MOUNT_CLIPS.pistol);
    expect(c.find((x) => x.name === TURRET_HOLD_CLIP)!.frameCount).toBe(3);
    expect(mountShape(null, table(), 0)).toBeNull();
    expect(mountShape(c, null, 0)).toBeNull();
  });

  it("PB-2c: on Crossroads' two turrets the mount's steer lands the feet near the hold's place -- refPt moved by the clip root's travel, the root's x and z zeroed -- 0.21 from place + R(facing)(-3.257, ., 4.282) at the port's 60 Hz (0.29 at the game's frame), from behind, a side and 20 away; then the hold places them (was 8.19 from it; research 215 s7.5 item 2)", () => {
    const kits = { table: readKitTable(ZWEAPON!), readerc: READERC! };
    const map = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', kits);
    const shape = mountShape(clips(), table(), 0)!;
    for (const t of map.turrets!) {
      for (const [d, side] of LANDINGS) {
        expect(landed(t, shape, d, side), `${t.name} from ${d} behind, ${side} aside`).toBeCloseTo(LANDED_60, 2);
        expect(landed(t, shape, d, side, GAME_FRAME_DT), `${t.name} at the game's frame`).toBeCloseTo(LANDED_GAME, 2);
      }
      // The old seat (the root's x and z kept, refPt unmoved): 7.56 behind the hold's place.
      const was = seatTarget(t, shape.refPt, mountRootAt(shape, shape.seconds)), hold = holdPlace(t, t.facing);
      expect(Math.hypot(was[0] - hold[0], was[2] - hold[2]), t.name).toBeGreaterThan(7.5);
    }
  });

  it("the firepoint's frame at an aim carries its rest place to muzzleAt's, turned with the gun (gunDelta x the rest matrix)", () => {
    const kits = { table: readKitTable(ZWEAPON!), readerc: READERC! };
    const t = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', kits).turrets!.find((x) => x.name === 'mp72_turret01')!;
    expect(t.firepointMatrix).toHaveLength(16);
    const rest = firepointFrame(t, t.facing, 0)!;
    expect([rest[12], rest[13], rest[14]].map((v) => Number(v!.toFixed(3)))).toEqual(t.firepointOrigin.map((v) => Number(v.toFixed(3))));
    for (const [yaw, pitch] of [[40, -20], [110, 35], [-10, -45]] as const) {
      const f = firepointFrame(t, yaw, pitch)!;
      expect([f[12], f[13], f[14]].map((v) => Number(v!.toFixed(3)))).toEqual(muzzleAt(t, yaw, pitch).map((v) => Number(v.toFixed(3))));
      // The rotation is the gun's turn on the rest's: column 0 is gunDelta's applied to the rest's column 0.
      const d = gunDelta(t, yaw, pitch), b = t.firepointMatrix!;
      const col = [0, 1, 2].map((r) => d[r]! * b[0]! + d[4 + r]! * b[1]! + d[8 + r]! * b[2]!);
      expect([f[0], f[1], f[2]].map((v) => Number(v!.toFixed(5)))).toEqual(col.map((v) => Number(v.toFixed(5))));
    }
    expect(firepointFrame({ ...t, firepointMatrix: undefined } as TurretPlacement, 0, 0)).toBeNull();
  });

  it("PB-2 (a): seal_stand2turret's rifle track carries the rifle from the grip round to the back -- its last key (25) within 0.06 and 14 degrees of the carry on Crossroads' SEAL and terrorist -- seal_turret_poses has no prop track, and the pistol's mount clip holds the pistol at the grip (TURRET_HELD_WEAPON_READING)", async () => {
    expect(TURRET_HELD_WEAPON_READING).toBe('carry');                        // PB-2b's rework (FUN_005a73c0); was 'hand' (PB-2b)
    const c = parseMotionZar(Zar.parse(PACK!));
    const clip = (name: string) => c.find((x) => x.name === name)!;
    const hold = clip(TURRET_HOLD_CLIP);
    expect(hold.parts.filter((p) => ['rifle', 'weapon', 'pistol', 'launcher'].includes(p.name))).toEqual([]);
    const pistol = clip(TURRET_MOUNT_CLIPS.pistol).parts.find((p) => p.name === 'pistol')!;
    expect([...pistol.translations.slice(0, 3), ...pistol.rotations.slice(0, 4)].map((v) => v + 0)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    const mount = clip(TURRET_MOUNT_CLIPS.rifle);
    const characters = await characterTableFor(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const toc = parseZdb(MP72!);
    for (const team of ['navyseals', 'terrorists'] as const) {
      const body = loadBody(MP72!, toc, characters, () => undefined, team, 0)!;
      const sk = heldSkeleton(bodySkeleton(body));
      const pose = (key: number): void => {
        sk.resetToBind();
        const parts = sampleClip(mount, (key / mount.frameCount) * mount.duration).parts;
        for (const p of parts) {
          const i = partIndex(sk, parts, p.name);
          if (i >= 0) sk.setLocal(i, partMatrix(p.rotation, i === 0 ? [0, p.translation[1], 0] : p.translation));
        }
        sk.update();
      };
      pose(0);
      const grip = sk.world[sk.indexOf('rifle')]!, hand = sk.world[sk.indexOf('rhand')]!;
      expect(Math.hypot(grip[12]! - hand[12]!, grip[13]! - hand[13]!, grip[14]! - hand[14]!), team).toBeLessThan(1.5);   // in the hand
      pose(mount.frameCount - 1);                                                // a one-shot holds its last key (FUN_0028d670)
      const rifle = sk.world[sk.indexOf('rifle')]!, carry = mountMatrix(sk, 'rifle', 'carry', body.carries ?? null)!;
      expect(Math.hypot(rifle[12]! - carry[12]!, rifle[13]! - carry[13]!, rifle[14]! - carry[14]!), team).toBeLessThan(0.06);
      const along = (rifle[0]! * carry[0]! + rifle[1]! * carry[1]! + rifle[2]! * carry[2]!) / Math.hypot(rifle[0]!, rifle[1]!, rifle[2]!) / Math.hypot(carry[0]!, carry[1]!, carry[2]!);
      expect(along, team).toBeGreaterThan(Math.cos((14 * Math.PI) / 180));
    }
  }, 120_000);

  /**
   * PB-2b (research 77 s10; reading, pending review): the general rule on the disc's clips -- the pose writes no node the
   * playing clip has no track for (`FUN_005777d0` D:L437201-437230, D:L437257-437291; `FUN_00577700` D:L437155-437170), so
   * the rifle node keeps the mount clip's last local through the hold and moves with the hand by the hold's key; the
   * reversed clip's own track brings it back to the grip. What is DRAWN in the hold is not that node: the mount clip's
   * phase 0.5 stows the rifle on its carry (`FUN_00588bc0` -> `FUN_005a73c0`; research 215 s7.3, PB-2b's rework).
   * *Was:* "... on the back" -- the node drawn on the hand's mount, 1.66 from the carry at the level key.
   */
  it("PB-2b: through the animator the rifle node keeps the mount clip's last local through the hold, moving with the hand by the hold's key, and the release's reversed clip takes it back to the grip -- the node the hold does not draw: its rifle is stowed on the carry (TURRET_HELD_WEAPON_READING)", async () => {
    const all = parseMotionZar(Zar.parse(PACK!));
    const characters = await characterTableFor(new FsAssetSource(FIXTURES), 'RUN/MP72.ZDB');
    const toc = parseZdb(MP72!);
    const REST: MoverSnapshot = {
      vx: 0, vz: 0, vy: 0, yaw: 0, airborne: false, crouched: false, landing: null, jumps: 0, stance: 'stand',
      ground: { state: 'idle', forward: 0, right: 0, cls: -1 }, action: null,
    };
    const at = (clip: string, frame: number): MoverSnapshot => ({ ...REST, traversal: { clip, frame, loop: false, rootY: null } });
    const shape = mountShape(clips(), table(), 0)!;
    const keysPerTick = (shape.keys - 1) / shape.seconds / 60;                // the run's keys a 60 Hz tick
    const dist = (a: ArrayLike<number>, b: ArrayLike<number>): number => Math.hypot(a[12]! - b[12]!, a[13]! - b[13]!, a[14]! - b[14]!);
    const same = (a: ArrayLike<number>, b: ArrayLike<number>, what: string): void => {
      for (let i = 0; i < 16; i++) expect(a[i]!, `${what} [${i}]`).toBeCloseTo(b[i]!, 4);
    };
    for (const team of ['navyseals', 'terrorists'] as const) {
      const body = loadBody(MP72!, toc, characters, () => undefined, team, 0)!;
      const sk = heldSkeleton(bodySkeleton(body));
      const anim = new Animator(sk, all.filter((c) => TURRET_CLIPS.includes(c.name) || c.name === 'seal_stand'), table());
      for (let f = 0; f < 60; f++) anim.step(1 / 60, REST);
      for (let k = 0; k < shape.keys - 1; k += keysPerTick) anim.step(1 / 60, at(TURRET_MOUNT_CLIPS.rifle, k));
      anim.step(1 / 60, at(TURRET_MOUNT_CLIPS.rifle, shape.keys - 1));
      const left = anim.heldLocal('rifle')!;                                   // the mount clip's last drawn local
      expect(dist(left, IDENTITY), `${team}: the mount leaves it off the grip`).toBeGreaterThan(3);
      const drawn = (): Float32Array => mountMatrix(sk, 'rifle', 'hand', body.carries ?? null, anim.heldLocal('rifle'))!;
      const carry = (): Float32Array => mountMatrix(sk, 'rifle', 'carry', body.carries ?? null)!;
      for (const key of [1, 0, 2, 1]) {
        for (let f = 0; f < 60; f++) anim.step(1 / 60, at(TURRET_HOLD_CLIP, key));
        same(anim.heldLocal('rifle')!, left, `${team}: the rifle's local in the hold at key ${key}`);
        // The node on the hand's frame: its local on rhand as the hold's key poses the hand.
        same(drawn(), multiply(left, sk.world[sk.indexOf('rhand')]!), `${team}: moving with the hand, key ${key}`);
      }
      // Drawn: the stow's carry (TURRET_HELD_WEAPON_READING), the "rifle" gear's local on spinelo.
      same(mountMatrix(sk, 'rifle', TURRET_HELD_WEAPON_READING, body.carries ?? null, anim.heldLocal('rifle'))!, carry(), `${team}: drawn on its carry`);
      // The release: the mount clip reversed (FUN_005a6eb0), its own track back to the grip at its first key.
      for (let k = shape.keys - 1; k > 0; k -= keysPerTick) anim.step(1 / 60, at(TURRET_MOUNT_CLIPS.rifle, k));
      for (let f = 0; f < 60; f++) anim.step(1 / 60, at(TURRET_MOUNT_CLIPS.rifle, 0));
      const grip = sampleClip(all.find((c) => c.name === TURRET_MOUNT_CLIPS.rifle)!, 0).parts.find((p) => p.name === 'rifle')!;
      same(anim.heldLocal('rifle')!, partMatrix(grip.rotation, grip.translation), `${team}: the grip again`);
    }
    expect(TURRET_HELD_WEAPON_READING).toBe('carry');                        // drawn on its carry (was 'hand', PB-2b)
  }, 120_000);

  it("T81-4: the steer is not stopped by the turret's own hull -- on Crossroads' two turrets the room's mover (a Walker on the map's ground) steered from 12 behind lands 0.215 from the hold's place (FUN_005483d0 D:L413908-413918: the turret set restores the unresolved move; was 2.434, the hull 3.5 off); outside the clip the walk still meets the hull, before the mount and after the release", () => {
    const sim = simMapFromBytes(MP72!, 'RUN/MP72.ZDB', { table: readKitTable(ZWEAPON!), readerc: READERC! });
    const shape = mountShape(clips(), table(), 0)!;
    for (const t of sim.turrets!) {
      expect(steeredOnGround(sim, t, shape), `${t.name}: the clip's end from the hold's place`).toBeCloseTo(LANDED_60, 2);
      const edges = hullOutsideTheClip(sim, t);
      expect(edges.before, `${t.name}: a walk before the mount stops short of the hold's place`).toBeGreaterThan(2);
      expect(edges.after, `${t.name}: the walk after the release pushes out of the hull`).toBeGreaterThan(1);
    }
  });

  it("T81 (issue #81): in the hold the hands lie within 0.7 of the drawn gun -- Crossroads' two turrets, at yaw 0/+-30/70 and pitch 0/+-20/+-45 (FUN_00585cd0 D:L444592-444625: the body placed on the gun, the hold's key by its elevation; research 215 s7.7)", async () => {
    const { off, range } = await handsOffGun(FIXTURES, 'MP72', ['mp72_turret01', 'mp72_turret02']);
    expect(off, `the reach over every line ${range.map((v) => v.toFixed(2)).join('-')}`).toEqual([]);
  }, 180_000);

  it("LATER 109: the release's reversed clip on the disc's seal_stand2turret and seal_p_stand2turret -- 16 steps at 60 Hz, the last at key 0.964, the body carried (-0.062, 3.165) in its own frame (x right, z behind): 3.165 back along the gun's line; at the game's frame 8 steps, (-0.045, 3.163) (FUN_0028c160, FUN_0028c6e0, FUN_0028c250 x -1; TURRET_RELEASE_TRAVEL_READING)", () => {
    for (const hand of [0, 1] as const) {
      const shape = mountShape(clips(), table(), hand)!;
      for (const [dt, steps, key, x, z] of [[1 / 60, 16, 0.964, -0.0621, 3.1654], [GAME_FRAME_DT, 8, 0.94, -0.0452, 3.1629]] as const) {
        const travel = ReleaseTravel.start(shape)!;
        const state = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 };     // yaw 0 faces -z: the body's frame is the world's
        let n = 0;
        while (!travel.step({ state, glide(dx: number, dz: number) { state.x += dx; state.z += dz; } }, dt)) { n++; expect(n).toBeLessThan(100); }
        expect(n, `${shape.clip} at ${dt}`).toBe(steps);
        expect(travel.key(), `${shape.clip} at ${dt}: the last key`).toBeCloseTo(key, 2);
        expect(state.x, `${shape.clip} at ${dt}: x`).toBeCloseTo(x, 3);
        expect(state.z, `${shape.clip} at ${dt}: z`).toBeCloseTo(z, 3);
      }
    }
  });
});

const DISC = process.env.SOCOM_DISC;
const HAVE_MP51 = !!DISC && existsSync(resolve(DISC, 'RUN/MP51.ZDB')) && READY;
describe.skipIf(!HAVE_MP51)(`Vigilance's four seats on the disc${HAVE_MP51 ? '' : ' (SOCOM_DISC with RUN/MP51.ZDB absent, or the fixtures)'}`, () => {
  it("PB-2c: on Vigilance's four turrets the mount's steer lands the feet 0.21 from the hold's place at 60 Hz (0.29 at the game's frame), from behind, a side and 20 away (research 215 s7.5 item 2); the height is the floor's, never the steer's (mp51_turret03's seat 1.08 under its raised floor: D:L413943-413946)", () => {
    const kits = { table: readKitTable(ZWEAPON!), readerc: READERC! };
    const map: SimMap = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB', kits);
    const shape = mountShape(parseMotionZar(Zar.parse(PACK!)).filter((c) => TURRET_CLIPS.includes(c.name)), motionTableFromArchive(READERC!), 0)!;
    expect(map.turrets!.map((t) => t.name)).toEqual(['mp51_turret01', 'mp51_turret02', 'mp51_turret03', 'mp51_turret04']);
    for (const t of map.turrets!) {
      for (const [d, side] of LANDINGS) {
        expect(landed(t, shape, d, side), `${t.name} from ${d} behind, ${side} aside`).toBeCloseTo(LANDED_60, 2);
        expect(landed(t, shape, d, side, GAME_FRAME_DT), `${t.name} at the game's frame`).toBeCloseTo(LANDED_GAME, 2);
      }
    }
  });
  it("T81-4: the steer is not stopped by the turret's own hull -- on Vigilance's four turrets the room's mover steered from 12 behind lands 0.215 from the hold's place (was 2.434); outside the clip the walk still meets the hull, before the mount and after the release", () => {
    const kits = { table: readKitTable(ZWEAPON!), readerc: READERC! };
    const sim: SimMap = simMapFromBytes(new Uint8Array(readFileSync(resolve(DISC!, 'RUN/MP51.ZDB'))), 'RUN/MP51.ZDB', kits);
    const shape = mountShape(parseMotionZar(Zar.parse(PACK!)).filter((c) => TURRET_CLIPS.includes(c.name)), motionTableFromArchive(READERC!), 0)!;
    for (const t of sim.turrets!) {
      expect(steeredOnGround(sim, t, shape), `${t.name}: the clip's end from the hold's place`).toBeCloseTo(LANDED_60, 2);
      const edges = hullOutsideTheClip(sim, t);
      expect(edges.before, `${t.name}: a walk before the mount stops short of the hold's place`).toBeGreaterThan(2);
      expect(edges.after, `${t.name}: the walk after the release pushes out of the hull`).toBeGreaterThan(1);
    }
  });

  it("T81 (issue #81): in the hold the hands lie within 0.7 of the drawn gun -- Vigilance's mp51_turret01, 02 and 04, at yaw 0/+-30/70 and pitch 0/+-20/+-45 (FUN_00585cd0 D:L444592-444625; mp51_turret03's raised floor left out, research 215 s7.7)", async () => {
    const { off, range } = await handsOffGun(DISC!, 'MP51', ['mp51_turret01', 'mp51_turret02', 'mp51_turret04']);
    expect(off, `the reach over every line ${range.map((v) => v.toFixed(2)).join('-')}`).toEqual([]);
  }, 240_000);
});
