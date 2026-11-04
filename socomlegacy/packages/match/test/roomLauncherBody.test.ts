import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, type Object3D } from 'three';
import {
  DEFAULT_RIFLE, HELD_SIDEARM, M67, arsenalOf, type CollisionOwner, type GridParams, type Loadout, type SpawnSlot, type ThrowableRecord,
  type WorldPoly,
} from '@s2u/scene';
import {
  ACTION_CODES, BodyFlag, Button, decodeSnapshot, encodeCommands, encodeSnapshot, EYE_HEIGHT, groundGrid, packGround, PROTOCOL_VERSION, TICK_HZ,
  type BodyState, type Command, type SimKits, type SimMap,
} from '../../viewer/src/sim';
import { firstLauncher, RemotePlayers, type HeldRef, type SideKit } from '../../viewer/src/remotePlayers';
import type { LoadedMap } from '../../viewer/src/loadMap';
import type { PlayClips } from '../../viewer/src/play';
import { DEFAULT_LIGHTING } from '../../viewer/src/lighting';
import { Room, type Conn } from '../src/room';

/**
 * NU-6 F1 (the fresh review of 384b7d288; research 324 §6 R1 + P3, PTW.R3): the room's raise and still lower as the
 * others see them, through the room's real event path -- the page's `throw` event at its last command `seq`
 * (`room.text` -> `raiseLauncher` / `lowerLauncher`), then its commands (`binary` -> `step`), the room's own body for the
 * snapshot (`Room.body`) taken after every step and handed, in order, across the codec to another page's real
 * `RemotePlayers`. The body's item and the launcher clip must change on the same command: a snapshot with the item
 * changed and the clip not yet begun draws the launcher where it is not (a still lower drawn with the LAW on the back;
 * a raise drawn as the LAW in the hand with no clip). Only the body's view and `Play` are stand-ins.
 */
/** NU-6 F2: the stub callback's `launcher` -- the kit's first rocket launcher's model, named for its id, or null. */
const launcherRef = (k: readonly number[]): HeldRef | null => {
  const id = firstLauncher(k);
  if (id === null) return null;
  const g = new Group(); g.name = `model${id}`;
  return { object: g, points: [] };
};

const output = vi.hoisted(() => ({ stowed: [] as boolean[], plays: [] as { launcher: Object3D; hand: Object3D }[] }));
vi.mock('../../viewer/src/bodyView', () => ({ buildBody: () => ({ group: new Group(), dispose: () => {} }) }));
vi.mock('../../viewer/src/play', async () => { const { Group: G } = await import('three'); return { Play: class {
  launcher = Object.assign(new G(), { name: 'launcher' });
  hand = Object.assign(new G(), { name: 'rifle' });
  constructor() { output.plays.push(this); }
  launcherNode() { return this.launcher; }
  heldNode() { return this.hand; }
  setRifleStowed(on: boolean) { output.stowed.push(on); }
  stopVictory() {} setBody() {} setFlyToggle() {} setClips() {} setWeaponInput() {} setItem() {} setMounts() {} setAnimSet() {}
  setWeapon() {} setSidearm() {} addPoseLayer() {} motionSource() { return null; } onEvent() {} frame() {}
} }; });

const PARAMS: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const FLOOR: WorldPoly = {
  modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
  points: Float32Array.from([-1000, 0, -1000, 1000, 0, -1000, 1000, 0, 1000, -1000, 0, 1000]),
};
function flatMap(): SimMap {
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/floor0', first: 0, count: 1 }];
  const ground = packGround(PARAMS, [FLOOR], owners);
  const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
    side, index, position: [x, 0, z], onFloor: true, step: side === 0 ? 2 : 6, facing: side === 0 ? [1, 0] : [-1, 0], loc: { map: 0, x: 0, z: 0 },
  });
  const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, -400, -200 + i * 50), slot(1, i, 400, -200 + i * 50)]);
  return { stem: 'MP99', name: 'FLAT', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [], notes: [] };
}
/** The LAW (145) and its HEAT round (185), as `roomEquipment.test.ts` builds them (research 94 §C11). */
const HEAT: ThrowableRecord = { ...M67, name: 'LAW HEAT', id: 185, muzzleVelocity: 200, acceleration: 980, armingDistance: 100, impact: true, hasBackblast: true, fuse: 20, removal: 20.1, capacity: 1, explosionDamage: 20, explosionRadius: 150, impactDamage: 20, effectiveRange: 3500, maximumRange: 100000 };
const item = (name: string, id: number, extra: unknown[] = []): unknown[] => ['InternalName', [name], 'ID', [String(id)], 'Ammo_Capacity', ['1'], 'NumMags', ['1'], 'AMMO_TYPES', [[]], ...extra];
const arsenal = arsenalOf(['ZAMMO', [], 'ZWEAPON', [item('LAW', 145, ['SlotCost', ['2']]), item('LAW HEAT', 185), item('M67', 121)] as never]);
const LAW_KIT = [62, 15, 145, 185, 255] as unknown as Loadout, OTHER = [62, 15, 121, 126, 255] as unknown as Loadout;
function kits(): SimKits {
  return {
    table: {
      arsenal, records: new Map([DEFAULT_RIFLE, HELD_SIDEARM].map((x) => [x.id, x])),
      rounds: new Map([[185, { record: HEAT, piercing: 0, fireWait: 3, reloadAfterShot: true, reloadDelayAfterShot: 1, icon: null }]]),
      throwables: new Map([[M67.id, { record: M67, piercing: 4 }]]),
    },
    map: { valves: new Map(), selectable: { seal: [], terrorist: [] }, kits: { seal: [{ type: 'S', character: 's', loadout: LAW_KIT }], terrorist: [{ type: 'T', character: 't', loadout: OTHER }] } },
  };
}
class Client implements Conn { send(): void { /* the frames are not read: the room's body is taken directly */ } close(): void { /* not used */ } }

/** Player 2 (a SEAL with the LAW) in a room: its events, its commands one a step, its body after each step. */
function seat() {
  const room = new Room(flatMap(), null, { now: () => 0, random: () => 0.5 }, null, kits());
  for (const id of [1, 2]) room.hello(id, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: `P${id}`, map: 'MP99', session: `tab${id}`.padEnd(22, '_') }, `10.0.0.${id}`);
  room.step();
  room.player(2)!.sim.walker.place(0, 20, 0);
  room.player(1)!.sim.walker.place(0, 20, 500);
  for (let i = 0; i < 30; i++) room.step();
  const p = room.player(2)!;
  const body = (): BodyState => decodeSnapshot(encodeSnapshot({
    tick: room.tick, own: null, bodies: [(room as unknown as { body(p: unknown): BodyState }).body(p)],
  })).bodies[0]!;
  /** The page's `throw` of `kind` at its last command (`netPage.ts`: `seq` the last command sent). */
  const event = (kind: string): void => {
    const w = p.sim.walker.state;
    room.text(2, { type: 'throw', seq: p.sim.seq, kind, from: [w.x, w.y + EYE_HEIGHT, w.z], velocity: [0, 0, 0] });
  };
  /** One step with no command arrived (the event came first), or with the next command: the body after it. */
  const gap = (): BodyState => { room.step(); return body(); };
  const command = (): BodyState => {
    const c: Command = { seq: p.sim.seq + 1, forward: 0, right: 0, yaw: p.sim.walker.state.yaw, pitch: 0, turn: 0, buttons: 0, stance: 0, weapon: 0 };
    room.binary(2, encodeCommands({ viewTick: room.tick, commands: [c] }));
    room.step();
    return body();
  };
  return { room, p, event, gap, command, body };
}

const RAISE = ACTION_CODES.indexOf('rifleToLauncher') + 1;
const ref = (id: number): HeldRef => { const g = new Group(); g.name = `model${id}`; return { object: g, points: [] }; };
const kitOf: SideKit = (_t, kit) => { const k = kit ?? [...LAW_KIT]; return { rifle: ref(k[0]!), pistol: ref(k[1]!), loadout: k, ids: [k[0]!, k[1]!], launcher: launcherRef(k) }; };

describe("NU-6 F1: the room's launcher item and its clip change on one command, and another page draws them so", () => {
  /** The room's bodies through a raise and, held a while, the still lower, each event followed by one gap step. */
  function run(): { raise: BodyState[]; lower: BodyState[]; rifle: number } {
    const s = seat();
    for (let i = 0; i < 10; i++) s.command();
    const rifle = s.body().weapon;
    s.event('LAW');
    const raise = [s.gap()];
    for (let i = 0; i < 100; i++) raise.push(s.command());
    s.event(s.p.records[0].name);
    const lower = [s.gap()];
    for (let i = 0; i < 100; i++) lower.push(s.command());
    return { raise, lower, rifle };
  }
  const launcherAction = (b: BodyState): boolean => b.action === RAISE;
  const reversed = (b: BodyState): boolean => (b.flags & BodyFlag.ActionReversed) !== 0;

  it('the room: no body between the event and the clip shows the item changed with no clip -- the raise\'s LAW with no raise, the lower\'s firearm with no still lower', () => {
    const { raise, lower, rifle } = run();
    // The raise: the LAW's id only with the raise's clip begun (or after it ran out).
    const raiseStart = raise.findIndex(launcherAction);
    expect(raiseStart).toBeGreaterThanOrEqual(0);
    expect(raise.slice(0, raiseStart).map((b) => b.weapon), 'before the raise\'s clip').toEqual(raise.slice(0, raiseStart).map(() => rifle));
    expect(raise[raiseStart]!.weapon).toBe(145);
    // The lower: the firearm's id only with the still lower's clip begun (or after it ran out).
    const lowerStart = lower.findIndex((b) => launcherAction(b) && reversed(b));
    expect(lowerStart).toBeGreaterThanOrEqual(0);
    expect(lower.slice(0, lowerStart).map((b) => b.weapon), 'before the still lower\'s clip').toEqual(lower.slice(0, lowerStart).map(() => 145));
    expect(lower[lowerStart]!.weapon).toBe(rifle);
  });

  it('another page fed those bodies in order: the LAW on the back until the raise, in the hand from it, through the whole still lower, on the back after; the rifle stowed exactly while it is in the hand', () => {
    const { raise, lower } = run();
    const remote = new RemotePlayers(new Scene()), camera = new PerspectiveCamera();
    remote.setMap({ body: {} } as LoadedMap, DEFAULT_LIGHTING, kitOf);
    remote.setClips({ clips: [], table: null } as unknown as PlayClips);
    remote.setKit(2, [...LAW_KIT]);
    const drawn = (b: BodyState) => {
      remote.frame(1 / 60, [b], camera);
      const play = output.plays.at(-1)!;
      return { hand: play.hand.children.map((o) => o.name), back: play.launcher.children.map((o) => o.name), stowed: output.stowed.at(-1) ?? false };
    };
    const HAND = { hand: ['model145'], back: [], stowed: true }, BACK = { hand: [], back: ['model145'], stowed: false };
    raise.forEach((b, i) => expect(drawn(b), `raise ${i}`).toEqual(launcherAction(b) || b.weapon === 145 ? HAND : BACK));
    const lowerEnd = lower.findIndex((b, i) => i > 0 && !launcherAction(b) && b.weapon !== 145);
    expect(lowerEnd).toBeGreaterThan(60);                       // the still lower's 84 commands
    lower.forEach((b, i) => expect(drawn(b), `lower ${i}`).toEqual(i < lowerEnd ? HAND : BACK));
  });
});

/**
 * NU-6 N1 (the re-review of d5d8edc99, its case B): a firearm swap on a command before a pending raise's own. The page's
 * swap rides s0 + 1 and its raise s0 + 6, the raise's event arriving while the room still stands on s0 (a stall, then a
 * burst). In the original the raise's press lands inside the swap's clip, where the take is refused: `FUN_005a8cb0`
 * (D:L463150) asks `FUN_005a7de0(.., 1, 1)` (D:L462594), which refuses while `FUN_005a7ab0` (D:L462512) answers for the
 * swap's clip (D:L462636) -- so `FUN_005a6d30` never runs and the launcher never comes up. The room must leave no
 * launcher state behind: no raise clip played on the pistol, no set with an infinite end, a jump taken once the swap is
 * over (the page's own state: the pistol, no launcher).
 */
describe("NU-6 N1: a swap before a pending raise's command refuses the raise, leaving nothing behind", () => {
  it('the raise refused inside the swap: no launcher item or raise clip on the body, no launcher set, up or pending item; a jump taken after', () => {
    const s = seat(), p = s.p;
    for (let i = 0; i < 10; i++) s.command();
    const s0 = p.sim.seq, yaw = p.sim.walker.state.yaw;
    const mk = (seq: number, buttons = 0): Command => ({ seq, forward: 0, right: 0, yaw, pitch: 0, turn: 0, buttons, stance: 0, weapon: 1 });
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [mk(s0 + 1, Button.Swap), mk(s0 + 2), mk(s0 + 3), mk(s0 + 4), mk(s0 + 5)] }));
    const w = p.sim.walker.state;
    s.room.text(2, { type: 'throw', seq: s0 + 5, kind: 'LAW', from: [w.x, w.y + EYE_HEIGHT, w.z], velocity: [0, 0, 0] });
    expect(p.sim.seq).toBe(s0);                                  // the raise decided before the swap's command ran
    for (let i = 0; i < 10 && p.sim.seq < s0 + 5; i++) s.room.step();
    expect(p.sim.seq).toBe(s0 + 5);
    const bodies: BodyState[] = [];
    for (let i = 0; i < 120; i++) {
      s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [mk(p.sim.seq + 1)] }));
      s.room.step();
      bodies.push(s.body());
    }
    expect(p.sim.weapon).toBe(1);
    expect(bodies.filter((b) => b.action === RAISE || b.weapon === 145)).toEqual([]);
    const state = p as unknown as { held: number | null; heldNext: unknown; launcherUp: unknown; launcherSet: { start: number; until: number } | null };
    expect({ held: state.held, heldNext: state.heldNext, launcherUp: state.launcherUp }).toEqual({ held: null, heldNext: null, launcherUp: null });
    expect(state.launcherSet?.until ?? 0).not.toBe(Infinity);
    const jumps = p.sim.jumps;
    s.room.binary(2, encodeCommands({ viewTick: s.room.tick, commands: [mk(p.sim.seq + 1, Button.Jump)] }));
    s.room.step();
    expect(p.sim.jumps).toBe(jumps + 1);
  });
});
