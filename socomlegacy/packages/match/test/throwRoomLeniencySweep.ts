import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import {
  DEFAULT_RIFLE, HELD_SIDEARM, M67, ROOM_START_TIE_RENDER_GRID_ADAPTATION, actorToWorldDir, actorToWorldPoint, arsenalOf, maxThrowDistance,
  throwAnim, throwAnimKey, throwVelocity, type CollisionOwner, type Grid, type GridParams, type Loadout, type SpawnSlot, type WorldPoly,
} from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { Button, encodeCommands, groundGrid, packGround, PROTOCOL_VERSION, type Command, type ServerEvent, type SimKits, type SimMap } from '../../viewer/src/sim';
import { STANCE_CODES } from '../../viewer/src/net/protocol';
import { loadMap } from '../../viewer/src/loadMap';
import { PlayerCamera, INIT_AIM_PITCH, pitchLimits, viewFar } from '../../viewer/src/playerCamera';
import { rootY } from '../../viewer/src/mover';
import { throwAimKept, throwAimReach, throwAimVector } from '../../viewer/src/throwAim';
import { handOpenClear, throwClear } from '../../viewer/src/throwCommit';
import { Room, THROW_AIM_FLOOR_MARGIN_ADAPTATION, type Conn } from '../src/room';

/**
 * LANE-KILL B-06, the controller's conditions on the pitch floor (2026-11-21; THROW_AIM_FLOOR_ADAPTATION): the room must
 * TAKE every throw the page itself lets go -- its request (`throwClear`) and its hand-open (`handOpenClear`) clear at the
 * aim its camera gives (`throwAimVector`) -- over the camera's whole pitch range (`pitchLimits`) at 2-degree steps and
 * `init_aim_pitch`, for each stance (one file a stance: `throwRoomLeniency.<stance>.sweep.test.ts`). A unit test on a
 * synthetic floor, and the capture's own legs on MP6 where the fixture is present; no capture is scored here.
 *
 * The grid: three wall extents across the facing (the whole width, and an edge at the body's axis reaching right and
 * left), heights 20-200 (35 and 40 among them), distances 3.6-24 u (18, 19 and 20 among them), a lintel (12-22 u up),
 * yaw 0 and +-30 degrees; powers 0, 0.3, 0.6, 0.895 and 1; the table hand and the posed one (the room's `ROOM_START_TIE_RENDER_GRID_ADAPTATION`, LATER 1428 ruling B).
 * A throw the page refuses is not sent. Each pose's room is staged once (the stance taken away from the wall, then the
 * body carried to the pose, the posture asserted), its commands at the pitch; between throws the room's rate and air are
 * reset and the grenade refunded, so each throw meets the room as the first.
 *
 * The cross-latch cases (LANE-KILL B-06, the ship-named fold, 2026-11-21: research 256 s5.4): the M67 selected in one
 * posture and thrown in another (`crossLatches`) -- the page's aim from the select's origin (THROW_AIM_ORIGIN_LATCH_READING)
 * under the throwing stance's camera, the room staged at the throwing stance and told nothing of the select.
 *
 * It also measures what THROW_AIM_FLOOR_ADAPTATION's margin rests on: over every pose the page's aim sine less
 * sin(pitch), its worst printed; standing and crouched it must not fall below the margin's 0 geometry (O under the
 * camera's line) less the frame sampling's share.
 *
 * Two limits (the review of 77da3bbe1b, N4): it always waits for the room to hold the pitch before the throw, so the
 * margin's 3-command frame sampling is never exercised here (a separate probe with the look moving between the request and
 * the hand-open covered it); and its synthetic floor does not stop the camera, so the prone camera sinks under the feet
 * (on MP6 the prone eye is 0.68-8 u above them).
 */

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, 1000, 1000, 0, 1000, 1000, 0, -1000, -1000, 0, -1000]),
};
const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
  side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
});
const SLOTS = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
function flat(extra: readonly WorldPoly[]): SimMap {
  const polys: WorldPoly[] = [FLOOR, ...extra];
  const owners: CollisionOwner[] = polys.map((q, i) => ({ modelName: 'worldmodel', path: `${q.path}0`, first: i, count: 1 }));
  const ground = packGround(PARAMS, polys, owners);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots: SLOTS, respawns: [], notes: [] };
}
const kit = (...ids: number[]): Loadout => ids as unknown as Loadout;
const item = (name: string, id: number): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]]];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('M67', 121)] as never]);
function kits(loadout: Loadout): SimKits {
  return {
    table: { arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])), rounds: new Map(), throwables: new Map([[M67.id, { record: M67, piercing: 4 }]]) },
    map: {
      valves: new Map(), selectable: { seal: [], terrorist: [] },
      kits: { seal: [{ type: 'S', character: 's', loadout }], terrorist: [{ type: 'T', character: 't', loadout }] },
    },
  };
}
class Client implements Conn {
  readonly events: ServerEvent[] = [];
  send(frame: Uint8Array | string): void { if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent); }
  close(): void { /* not used */ }
  grenades(): number { return this.events.filter((e) => e.type === 'grenade').length; }
}
type V3 = [number, number, number];
export type Stance = 'stand' | 'crouch' | 'prone';

/** The room's private state the sweep resets between throws (each throw meets the room as the first). */
interface Seat { lastThrow: number; throwClock: number; equipmentSlots: { refund(kind: string): boolean }; sim: { seq: number; walker: { state: { x: number; y: number; z: number; yaw: number }; place(x: number, y: number, z: number): void } } }

/**
 * Player 2 in `stance` at `feet` facing `yaw` on `world`: the stance taken `back` u behind the pose (clear of a wall
 * ahead), then the body carried to the pose and settled; the posture the room holds asserted.
 */
export function stage(world: SimMap, stance: Stance, feet: readonly number[], yaw: number, back = 40) {
  let seed = 1;
  const random = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const room = new Room(world, null, { now: () => 0, random }, null, kits(kit(62, 15, 121, 126, 255)));
  const join = (id: number): Client => {
    const c = new Client();
    room.hello(id, c, { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: world.stem, session: `tab${id}`.padEnd(22, '_') }, `10.0.0.${id}`);
    return c;
  };
  const a = join(1), b = join(2);
  room.step();
  const r = yaw * Math.PI / 180;               // behind the facing: +z at yaw 0, turned by the yaw
  const p1 = room.player(1)!.sim.walker;
  p1.place(feet[0]! + 300, feet[1]! + 20, feet[2]! + 300);
  const seat = (): Seat => room.player(2) as unknown as Seat;
  seat().sim.walker.place(feet[0]! + Math.sin(r) * back, feet[1]! + 20, feet[2]! + Math.cos(r) * back);
  seat().sim.walker.state.yaw = yaw;
  let pitch = 0;
  const run = (ticks: number, once: Partial<Command> = {}): void => {
    for (let i = 0; i < ticks; i++) {
      const cmd: Command = { seq: seat().sim.seq + 1, forward: 0, right: 0, yaw, pitch, turn: 0, buttons: 0, stance: 0, weapon: 0, ...(i === 0 ? once : {}) };
      room.binary(2, encodeCommands({ viewTick: room.tick, commands: [cmd] }));
      room.step();
    }
  };
  run(30);
  if (stance !== 'stand') { run(1, { buttons: Button.Stance, stance: STANCE_CODES.indexOf(stance) }); run(90); }
  seat().sim.walker.place(feet[0]!, feet[1]! + 1, feet[2]!);
  seat().sim.walker.state.yaw = yaw;
  run(30);
  const cone = (room.player(2) as unknown as { cone: { frame(seq: number): { posture: string; pitch: number } | null } }).cone;
  expect(cone.frame(seat().sim.seq)?.posture, `the room's posture at the pose (${feet.map((x) => x.toFixed(2))})`).toBe(stance);
  /**
   * Look at `p`: the room moves its pitch toward the command's at the look's rate (a 3-command look reached -13 of a
   * -70), so the commands run until the room's frame holds `p` and three more after; the throw's frame and its
   * predecessors carry it.
   */
  const look = (p: number): void => {
    pitch = p;
    for (let i = 0; i < 600 && !(Math.abs((cone.frame(seat().sim.seq)?.pitch ?? NaN) - p) <= 0.005); i++) run(1);
    run(3);
    expect(Math.abs(cone.frame(seat().sim.seq)!.pitch - p), `the room's pitch at the look ${p} (the wire holds 0.01 degree)`).toBeLessThanOrEqual(0.005);
  };
  const settled = (): V3 => { const w = seat().sim.walker.state; return [w.x, w.y, w.z]; };
  /** Send the throw; whether the room took it (no drop, one grenade more). */
  const send = (from: V3, velocity: V3): { taken: boolean; drops: Record<string, number> | null } => {
    const s = seat();
    s.lastThrow = -1e9; s.throwClock = -1e9;
    (room as unknown as { clearAir(): void }).clearAir();
    room.takeDrops();
    const before = a.grenades();
    room.text(2, { type: 'throw', seq: s.sim.seq, kind: 'M67', from, velocity });
    const drops = room.takeDrops();
    const taken = drops === null && a.grenades() === before + 1;
    if (a.grenades() > before) s.equipmentSlots.refund('M67');
    (room as unknown as { clearAir(): void }).clearAir();   // the taken grenade never lands: the next look's commands run on
    expect((room.player(2) as unknown as { alive: boolean }).alive, 'the seat alive').toBe(true);
    return { taken, drops };
  };
  return { room, a, b, look, settled, send, yaw: () => seat().sim.walker.state.yaw, seq: () => seat().sim.seq, frame: () => { const f = cone.frame(seat().sim.seq) as unknown as Record<string, unknown> | null; return f && { pitch: f.pitch, posture: f.posture, feet: f.feet, airborne: f.airborne }; } };
}

export const HEIGHTS = [20, 35, 40, 60, 100, 200];
export const AHEAD = [3.6, 4.5, 5.5, 7, 9, 10.25, 12, 16, 18, 19, 20, 24];
export const YAWS = [0, 30, -30];
export const POWERS = [0, 0.3, 0.6, 0.895, 1];
/** The wall across the facing at z 100 - ahead: the whole width, an edge at the body's axis reaching right, reaching left. */
export const EXTENTS: readonly [string, number, number][] = [['whole', 0, 200], ['right of the axis', 100, 200], ['left of the axis', 0, 100]];
const wall = (x0: number, x1: number, ahead: number, y0: number, y1: number): WorldPoly => {
  const z = 100 - ahead;
  return { ...FLOOR, path: `worldmodel/w${x0}_${x1}_${ahead}_${y0}_${y1}`, ditype: 2, points: Float32Array.from([x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z]) };
};

/** The pitches of a stance: its limits at 2-degree steps, the top bound and `init_aim_pitch`. */
export function pitchesOf(stance: Stance): number[] {
  const [lo, hi] = pitchLimits(stance);
  const out: number[] = [];
  for (let p = lo; p < hi - 1e-9; p += 2) out.push(p);
  out.push(hi, INIT_AIM_PITCH);
  return out;
}

export interface Tally { total: number; cleared: number; refused: string[]; worst: { d: number; at: string } }
export const tally = (): Tally => ({ total: 0, cleared: 0, refused: [], worst: { d: Infinity, at: '' } });

/**
 * Every pitch and throw at one pose (a staged room), into `t`, for each posture in `latches` the M67 was selected at
 * (the page's `selectPosture_`, `throwAimVector`'s `latch`; THROW_AIM_ORIGIN_LATCH_READING). The room is staged at
 * `stance` and never told the latch: it knows no H (LATER 1294).
 */
function pose(t: Tally, world: SimMap, grid: Grid, material: string, stance: Stance, feet: readonly number[], yaw: number, name: string, latches: readonly Stance[] = [stance]): void {
  const s = stage(world, stance, feet, yaw);
  for (const pitch of pitchesOf(stance)) {
    try { s.look(pitch); } catch (e) { throw new Error(`${name}, yaw ${yaw}, pitch ${pitch}: ${(e as Error).message}; frame ${JSON.stringify(s.frame())}`); }
    const at = s.settled(), ryaw = s.yaw();
    const cam = new PlayerCamera(grid);
    for (let i = 0; i < 120; i++) cam.tick(at, ryaw, pitch, rootY(stance));
    cam.settle();
    const v = cam.view(1);
    const ray = { eye: [...v.aim.eye], far: [...viewFar(v.aim.eye, v.aim.target, v.far)] };
    for (const latch of latches) {
      const aim = throwAimVector(grid, { ...ray, reach: throwAimReach(M67.maximumRange), kept: throwAimKept(material) }, { feet: at, yaw: ryaw, stance, latch }).aim;
      const d = aim[1] - Math.sin((pitch * Math.PI) / 180);
      const where = `${name}, yaw ${yaw}, pitch ${pitch.toFixed(3)}${latch === stance ? '' : `, selected ${latch}`}, aim ${aim[1].toFixed(4)}`;
      if (d < t.worst.d) t.worst = { d, at: where };
      const snap = { feet: [...at], yaw: ryaw, pitch, vx: 0, vz: 0, vy: 0, airborne: false, crouched: stance === 'crouch', stance, landing: null, jumps: 0 };
      for (const power of POWERS) {
        const anim = throwAnim(power, aim[1], stance, 0);
        const key = throwAnimKey(anim);
        const posed = key ? ROOM_START_TIE_RENDER_GRID_ADAPTATION[key]?.[1] : undefined;
        const hands: [string, readonly number[]][] = [['table', anim.offset], ...(posed ? [['posed', posed] as [string, readonly number[]]] : [])];
        for (const [handName, hand] of hands) {
          t.total++;
          if (!(throwClear(grid, snap as never, power, aim) && handOpenClear(grid, snap as never, power, aim))) continue;
          t.cleared++;
          const from = actorToWorldPoint(at, ryaw, hand as V3);
          const velocity = actorToWorldDir(ryaw, throwVelocity(power, aim[1], hand as V3, maxThrowDistance(stance)).velocity);
          const r = s.send(from, velocity);
          if (!r.taken) t.refused.push(`${where}, power ${power}, ${handName} hand: ${JSON.stringify(r.drops)}`);
        }
      }
    }
  }
}

/** The two postures other than `stance`: a grenade selected in one and thrown in `stance` (the cross-latch cases). */
export const crossLatches = (stance: Stance): Stance[] => (['stand', 'crouch', 'prone'] as const).filter((x) => x !== stance);

/** The synthetic grid at `stance`, the M67 selected at each of `latches` (its own stance by default). */
export function sweepFlat(stance: Stance, latches: readonly Stance[] = [stance]): Tally {
  const t = tally();
  const walls: [string, WorldPoly][] = [];
  for (const [extent, x0, x1] of EXTENTS) for (const h of HEIGHTS) for (const ahead of AHEAD) walls.push([`${extent} wall ${h} at ${ahead}`, wall(x0, x1, ahead, 0, h)]);
  for (const ahead of AHEAD) walls.push([`lintel 12-22 at ${ahead}`, wall(0, 200, ahead, 12, 22)]);
  for (const [name, w] of walls) {
    const world = flat([w]);
    for (const yaw of YAWS) pose(t, world, world.grid, '', stance, [100, 0, 100], yaw, name, latches);
  }
  return t;
}

/** The capture's legs (`throwAimCapture.disc.test.ts`'s VERDICTS and POSES; rows as `throwClearCapture.disc.test.ts`'s). */
const yawOf = (row0: readonly number[]): number => (Math.atan2(-row0[2]!, row0[0]!) * 180) / Math.PI;
const FAR: V3 = [1722, 20.004, 1868], NEAR: V3 = [1722, 3.11719, 1838];
export const LEGS: readonly { name: string; feet: V3; yaw: number; stance: Stance }[] = [
  { name: 'B FAR', feet: FAR, yaw: yawOf([0.929, 0, 0.37007]), stance: 'stand' },
  { name: 'B FAR', feet: FAR, yaw: yawOf([0.92512, 0, 0.37967]), stance: 'crouch' },
  { name: 'B FAR', feet: FAR, yaw: yawOf([0.92512, 0, 0.37967]), stance: 'prone' },
  { name: 'C NEAR', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'stand' },
  { name: 'C NEAR', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'crouch' },
  { name: 'C NEAR', feet: NEAR, yaw: yawOf([0.61462, 0, 0.78883]), stance: 'prone' },
  { name: 'B LEFT of FAR', feet: [1714.61, 20, 1864.94], yaw: yawOf([0.92822, 0, 0.37203]), stance: 'stand' },
  { name: 'C LEFT of NEAR', feet: [1717.13, 0, 1831.65], yaw: yawOf([0.61462, 0, 0.78883]), stance: 'stand' },
  { name: 'D along-R', feet: [1560.2, 30, 2125], yaw: yawOf([0.99993, 0, -0.01193]), stance: 'stand' },
  { name: 'D along-Rb', feet: [1560.2, 30, 2125], yaw: yawOf([0.99992, 0, 0.01299]), stance: 'stand' },
  { name: 'D T10', feet: [1560.2, 30, 2125], yaw: yawOf([0.98695, 0, 0.161]), stance: 'stand' },
  { name: 'D T20', feet: [1560.2, 30, 2125], yaw: yawOf([0.94467, 0, 0.32804]), stance: 'stand' },
  { name: 'D along-L', feet: [1560.2, 30.004, 2060], yaw: yawOf([-0.99992, 0, -0.01234]), stance: 'stand' },
  { name: '10.25 u from wc1di2', feet: [1555.75, 30, 2090], yaw: 270, stance: 'stand' },
  { name: '20 u from wc1di2', feet: [1546, 30, 2090], yaw: 270, stance: 'stand' },
];

const FIXTURE_ROOT = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
export const MP6_ZDB = fixture('RUN/MP6.ZDB');

/** The capture's legs at `stance` on MP6 (the fixture), every pitch, every throw, the M67 selected at each of `latches`. */
export async function sweepLegs(stance: Stance, latches: readonly Stance[] = [stance]): Promise<Tally> {
  const m = await loadMap(new FsAssetSource(FIXTURE_ROOT), 'RUN/MP6.ZDB');
  const grid = groundGrid(m.ground!), material = m.grenade?.defaultMaterial ?? '';
  const world: SimMap = { stem: 'MP6', name: 'MP6', ground: m.ground!, grid, spawns: null, slots: SLOTS, respawns: [], notes: [], defaultMaterial: material } as SimMap;
  const t = tally();
  for (const leg of LEGS.filter((l) => l.stance === stance)) pose(t, world, grid, material, stance, leg.feet, leg.yaw, leg.name, latches);
  return t;
}

/**
 * The tally's verdict: printed, then every page-cleared throw taken, and the aim never under sin(pitch) by the margin.
 * `margin` false (the cross-latch cases): the margin's derivation assumes the stance's own origin under its camera
 * (research 256 s5.2, "the margin, derived"), so the worst is printed, not asserted; the room's refusals still are.
 */
export function judge(label: string, stance: Stance, t: Tally, started: number, margin = true): void {
  console.log(`SWEEP ${label}: ${t.total} throws, ${t.cleared} page-cleared, ${t.refused.length} refused by the room among them; worst aim - sin(pitch) ${t.worst.d.toFixed(5)} at ${t.worst.at}; ${((Date.now() - started) / 1000).toFixed(0)} s`);
  for (const r of t.refused.slice(0, 40)) console.log(`SWEEP ${label} refused: ${r}`);
  expect(t.cleared, 'the grid holds page-cleared throws').toBeGreaterThan(0);
  expect(t.refused, 'an honest throw the page lets go, refused by the room').toEqual([]);
  if (margin && stance !== 'prone') expect(t.worst.d, 'the aim under the camera by more than the margin').toBeGreaterThanOrEqual(-THROW_AIM_FLOOR_MARGIN_ADAPTATION[stance]);
}

/**
 * The delta review of 7bf7ac69cf, F1, at `stance`: a forged full-power LEVEL throw from past a thin wall (80 u tall,
 * 6 ahead), the start 9.889 or 14 ahead at the stance's posed release height, the commands at pitch 0. With the floor
 * per throw (crouched sin(0) less the margin; prone the cone's -20) the room must still refuse each.
 */
export function forgedThinWall(stance: Stance): string[] {
  const world = flat([wall(0, 200, 6, 0, 80)]);
  const key = throwAnimKey(throwAnim(0.895, 0, stance, 0));
  const posed = (key ? ROOM_START_TIE_RENDER_GRID_ADAPTATION[key]?.[1] : undefined) ?? throwAnim(0.895, 0, stance, 0).offset;
  const taken: string[] = [];
  for (const ahead of [9.889, 14]) for (const power of [0.895, 1]) {
    const s = stage(world, stance, [100, 0, 100], 0);
    s.look(0);
    const at = s.settled(), ryaw = s.yaw();
    const hand: V3 = [posed[0]!, posed[1]!, -ahead];
    const from = actorToWorldPoint(at, ryaw, hand);
    expect(from[2], 'the start past the wall').toBeLessThan(100 - 6);
    const velocity = actorToWorldDir(ryaw, throwVelocity(power, 0, hand, maxThrowDistance(stance)).velocity);
    const r = s.send(from, velocity);
    if (r.taken) taken.push(`${ahead} ahead, power ${power}`);
  }
  return taken;
}
