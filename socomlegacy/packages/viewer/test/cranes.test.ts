// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial } from 'three';
import { Zar, parseZdb, zdbMember } from '@s2u/archive';
import { FsAssetSource } from '@s2u/archive/node';
import { DEFAULT_GRID_PARAMS, flattenScene, IDENTITY, NODE_GENERIC, NODE_INSTANCE, NODE_MODEL, parseAnimSets, parseSceneGraph, segmentHit, type CollisionOwner, type GridParams, type ModelEntry, type SceneNode, type SpawnSlot, type WorldPoly } from '@s2u/scene';
import { Room, type Conn } from '../../match/src/room';
import { craneScene } from '../src/craneHook';
import { CranePage } from '../src/cranePage';
import { loadMap, transferables, type LoadedMap, type LoadedMesh } from '../src/loadMap';
import { simMapFromBytes } from '../src/simMap';
import { buildWorld } from '../src/world';
import {
  ACTION_TYPE_CODES, bareMeta, C4_SURFACE_SLACK_PLACEHOLDER, c4Line, craneSurfaceOffRay, CraneSet, chainReactionCraneSpecs, craneDisc, craneOffset, cranePressSlack, craneRides, craneSwingAngle, craneUnresolved, decodeSnapshot,
  encodeCommands, encodeSnapshot, forkGround, groundGrid, groundPolygons, headEye, headPoint, packGround, PROTOCOL_VERSION, readCranes, splitCranePlacements, TICK_HZ,
  type ClientEvent, type CraneActionMiss, type CraneWire, type ServerEvent, type SimMap,
} from '../src/sim';
import { CRANE_PRESS_BASE_SLACK, CRANE_PRESS_FRAME_SECONDS } from '../src/cranes';
import { decodeSnapshot as decodeSnapshotPre337, encodeSnapshot as encodeSnapshotPre337 } from './fixtures/codecPre337';

/**
 * Chain Reaction's hooks (research 176 §9, §11). The numbers are the audit's: 15 seconds a leg, Z only, the three
 * published displacements. What the audit left open stays a named placeholder (`craneUnresolved`).
 */

const DT = 1 / TICK_HZ;
const HOOK_Z = [230, -320, 280] as const;

function steps(set: CraneSet, n: number): void {
  for (let i = 0; i < n; i++) set.step(DT);
}

describe('Chain Reaction hook motion (research 176 §9.2)', () => {
  it('walks each published Z leg at delta/seconds and repeats', () => {
    const set = new CraneSet(chainReactionCraneSpecs(), null);
    for (let i = 0; i < 3; i++) {
      expect(set.state(i)).toMatchObject({ paused: false, valve: 0, moving: 1, mesh: 'on', leg: 0, t: 0 });
    }
    steps(set, 450);
    for (let i = 0; i < 3; i++) {
      const s = set.state(i);
      expect(s.leg).toBe(0);
      expect(s.paused).toBe(false);
      expect(s.t).toBeCloseTo(7.5, 2);
      expect(s.offset[0]).toBe(0);
      expect(s.offset[1]).toBe(0);
      expect(s.offset[2]).toBeCloseTo(HOOK_Z[i]! / 2, 1);
      expect(s.offset[2]).toBeCloseTo(craneOffset(set.specs[i]!.legs, s.leg, s.t)[2], 4);
    }
    const outbound = new CraneSet(chainReactionCraneSpecs(), null);
    let n = 0;
    while (outbound.state(0).leg === 0 && n < 2000) { outbound.step(DT); n++; }
    expect(n).toBeGreaterThan(890);
    expect(n).toBeLessThan(910);
    expect(outbound.state(0).offset[2]).toBeCloseTo(230, 1);
    expect(outbound.state(0).t).toBeLessThan(DT * 2);
    while (outbound.state(0).leg === 1 && n < 4000) { outbound.step(DT); n++; }
    expect(outbound.state(0).leg).toBe(0);
    expect(outbound.state(0).offset[2]).toBeCloseTo(0, 1);
    expect(outbound.state(1).offset[2]).toBeCloseTo(0, 1);
    expect(outbound.state(2).offset[2]).toBeCloseTo(0, 1);
  });

  it('a pause holds the translation and leaves the swing clock running', () => {
    const set = new CraneSet(chainReactionCraneSpecs(), null);
    steps(set, 450);
    set.toggle(0);
    const held = set.state(0);
    expect(held.paused).toBe(true);
    expect(held.valve).toBe(1);
    expect(held.moving).toBe(0);
    expect(held.mesh).toBe('off');
    steps(set, 30);
    const later = set.state(0);
    expect(later.t).toBeCloseTo(held.t, 6);
    expect(later.offset[2]).toBeCloseTo(held.offset[2], 4);
    expect(Math.abs(later.swing - held.swing)).toBeGreaterThan(0.005);
    expect(set.state(1).t).toBeGreaterThan(held.t);
    set.toggle(0);
    expect(set.state(0)).toMatchObject({ paused: false, valve: 0, moving: 1, mesh: 'on' });
    steps(set, 450);
    expect(set.state(0).offset[2]).toBeCloseTo(230, 1);
  });

  it('the swing angle is 1 degree at half a second and back at the second (research 176 §9.2)', () => {
    expect(craneSwingAngle(0)).toBe(0);
    expect(craneSwingAngle(0.5)).toBeCloseTo(Math.PI / 180, 6);
    expect(craneSwingAngle(1)).toBeCloseTo(0, 8);
    expect(craneSwingAngle(1.5)).toBeCloseTo(-Math.PI / 180, 6);
    const swung: number[] = [];
    const shown: string[] = [];
    const watched = new CraneSet(chainReactionCraneSpecs(), null, {
      swung: (spec, angle) => { if (spec.index === 0) swung.push(angle); },
      shown: (spec, mesh) => { if (spec.index === 0) shown.push(mesh); },
    });
    expect(shown).toEqual(['on']);
    expect(swung[0]).toBe(0);
    watched.step(0.5);
    expect(swung.at(-1)).toBeCloseTo(Math.PI / 180, 6);
    expect(watched.state(0).swing).toBeCloseTo(Math.PI / 180, 6);
    watched.toggle(0);
    expect(shown.at(-1)).toBe('off');
    watched.toggle(0);
    expect(shown.at(-1)).toBe('on');
    expect(craneDisc()).toEqual({
      flags: 0x9, flag8: 0x8, repeat: 'while forever', swingNode: 'swingplate', axis: 'local x',
      valve: 0, moving: 1, mesh: 'go_on_switch shown at load; go_off_now hidden; resume go_on_switch; pause go_off_now',
      panel: 'epan and hcont take the hook translation; swing stays on swingplate',
    });
    expect(craneUnresolved()).toEqual({
      ride: 'not carried', crush: 'no damage', sound: 'not played', onoff: 'set 2 cmd 16, 20, 5',
    });
  });

  it('reset puts every hook back at rest and moving', () => {
    const set = new CraneSet(chainReactionCraneSpecs(), null);
    steps(set, 200);
    set.toggle(1);
    set.reset();
    for (let i = 0; i < 3; i++) {
      const s = set.state(i);
      expect(s).toMatchObject({ paused: false, valve: 0, moving: 1, mesh: 'on', leg: 0, t: 0, swing: 0 });
      expect(s.offset).toEqual([0, 0, 0]);
    }
  });
});

describe('Chain Reaction hook collision', () => {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 64, cellsX: 8, cellsZ: 8, originX: -64, originZ: -64 };
  /** A wall in the XY plane at z = 0, one polygon. */
  const wall: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/hook1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1, 0, 0, 1, 0, 0, 1, 4, 0, -1, 4, 0]),
  };

  function hull() {
    const owners: CollisionOwner[] = [{
      modelName: 'worldmodel', path: 'worldmodel/hook1', first: 0, count: 1, flags: 0x1001,
      sweep: { minX: -2, maxX: 2, minZ: -2, maxZ: 240 },
    }];
    const ground = packGround(params, [wall], owners);
    const set = new CraneSet(chainReactionCraneSpecs([[0]]), ground);
    return { set, grid: groundGrid(ground) };
  }

  const through = (grid: ReturnType<typeof hull>['grid'], z: number) =>
    segmentHit(grid, [0, 2, z - 2], [0, 2, z + 2]);

  it('the hook polygon is at rest, then at the end of the outbound leg', () => {
    const { set, grid } = hull();
    expect(through(grid, 0)?.point[2]).toBeCloseTo(0, 4);
    expect(through(grid, 230)).toBeNull();
    let n = 0;
    while (set.state(0).leg === 0 && n < 2000) { set.step(DT); n++; }
    expect(through(grid, 0)).toBeNull();
    expect(through(grid, 230)?.point[2]).toBeCloseTo(230, 1);
    expect(through(grid, 230)?.owner.path).toBe('worldmodel/hook1');
  });
});

describe('Chain Reaction panels ride the hook (research 176 §9.2)', () => {
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 64, cellsX: 16, cellsZ: 16, originX: -64, originZ: -64 };
  const sweep = { minX: -2, maxX: 2, minZ: -2, maxZ: 280 };
  const quad = (z: number): WorldPoly => ({
    modelName: 'worldmodel', path: 'panel', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1, 0, z, 1, 0, z, 1, 4, z, -1, 4, z]),
  });

  function hull() {
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/hook1', first: 0, count: 1, flags: 0x1001, sweep },
      { modelName: 'worldmodel', path: 'worldmodel/epan_1', first: 1, count: 1, flags: 0x1001, sweep },
      { modelName: 'worldmodel', path: 'worldmodel/hcont_1', first: 2, count: 1, flags: 0x1001, sweep },
    ];
    const ground = packGround(params, [quad(0), quad(12), quad(40)], owners);
    const set = new CraneSet(chainReactionCraneSpecs([[0, 1, 2]]), ground);
    return { set, grid: groundGrid(ground) };
  }

  const through = (grid: ReturnType<typeof hull>['grid'], z: number) =>
    segmentHit(grid, [0, 2, z - 2], [0, 2, z + 2]);

  it('epan and hcont slide with hook1, a pause holds them, and a late joiner gets the same offset', () => {
    const { set, grid } = hull();
    expect(through(grid, 0)?.owner.path).toBe('worldmodel/hook1');
    expect(through(grid, 12)?.owner.path).toBe('worldmodel/epan_1');
    expect(through(grid, 40)?.owner.path).toBe('worldmodel/hcont_1');
    let n = 0;
    while (set.state(0).leg === 0 && n < 2000) { set.step(DT); n++; }
    expect(through(grid, 0)).toBeNull();
    expect(through(grid, 12)).toBeNull();
    expect(through(grid, 230)?.owner.path).toBe('worldmodel/hook1');
    expect(through(grid, 242)?.owner.path).toBe('worldmodel/epan_1');
    expect(through(grid, 270)?.owner.path).toBe('worldmodel/hcont_1');
    set.toggle(0);
    const held = set.state(0).offset[2];
    expect(held).toBeCloseTo(230, 1);
    steps(set, 60);
    expect(set.state(0).offset[2]).toBeCloseTo(held, 4);
    expect(through(grid, 242)?.point[2]).toBeCloseTo(242, 1);
    expect(through(grid, 270)?.point[2]).toBeCloseTo(270, 1);
    const wire = set.wire();
    const joined = hull();
    joined.set.applyWire(wire);
    expect(joined.set.state(0).paused).toBe(true);
    expect(joined.set.state(0).offset[2]).toBeCloseTo(held, 2);
    expect(through(joined.grid, 242)?.owner.path).toBe('worldmodel/epan_1');
    expect(through(joined.grid, 270)?.owner.path).toBe('worldmodel/hcont_1');
    expect(through(joined.grid, 12)).toBeNull();
  });
});

describe('Chain Reaction hook sync', () => {
  const plain = {
    tick: 3, own: null, bodies: [],
    doors: [{ valve: 1, phase: 9 }],
    env: { revision: 2, epoch: 1, states: [{ id: 4, active: false }] },
  };

  it('a snapshot without hooks has the same bytes as one with an empty hook list', () => {
    const bare = encodeSnapshot(plain);
    const empty = encodeSnapshot({ ...plain, cranes: [] });
    expect([...empty]).toEqual([...bare]);
    expect(decodeSnapshot(bare).cranes).toBeUndefined();
  });

  it('the hook phase round-trips and a second set reproduces the offset', () => {
    const server = new CraneSet(chainReactionCraneSpecs(), null);
    steps(server, 450);
    server.toggle(2);
    const wire = server.wire();
    expect(wire.map((w) => w.valve)).toEqual([0, 0, 1]);
    const bytes = encodeSnapshot({ ...plain, cranes: wire });
    expect(bytes.length).toBe(encodeSnapshot(plain).length + 1 + 7 * 3);
    expect(wire[2]).toMatchObject({ valve: 1, mesh: 2 });
    expect(wire[0]).toMatchObject({ valve: 0, mesh: 1 });
    expect(wire[0]!.swingMs).toBeGreaterThan(1400);
    expect(wire[0]!.swingMs).toBeLessThan(1600);
    const back = decodeSnapshot(bytes);
    expect(back.cranes).toEqual(wire);
    expect(back.doors).toEqual(plain.doors);
    expect(back.env).toEqual(plain.env);
    const page = new CraneSet(chainReactionCraneSpecs(), null);
    page.applyWire(back.cranes);
    for (let i = 0; i < 3; i++) {
      expect(page.state(i).offset[2]).toBeCloseTo(server.state(i).offset[2], 2);
      expect(page.state(i).paused).toBe(server.state(i).paused);
      expect(page.state(i).leg).toBe(server.state(i).leg);
      expect(page.state(i).mesh).toBe(server.state(i).mesh);
      expect(page.state(i).swing).toBeCloseTo(server.state(i).swing, 3);
      expect(page.state(i).moving).toBe(server.state(i).moving);
    }
  });

  it('an archive without the hook programs contributes no hooks', () => {
    expect(readCranes(new Uint8Array(), [], [], [], []).cranes).toEqual([]);
  });
});

describe('the room runs the hooks and the switch toggles them', () => {
  const params: GridParams = {
    atomCount: 8192, posts: 16, cellDim: 200, cellsX: 12, cellsZ: 14, originX: -200, originZ: -200,
  };
  const FLOOR: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/floor', region: 0, ditype: 3, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([900, 75.5, 1700, 1400, 75.5, 1700, 1400, 75.5, 2100, 900, 75.5, 2100]),
  };
  const PANEL: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/epan_1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([
      1114, 60, 1889.718, 1122, 60, 1889.718, 1122, 120, 1889.718, 1114, 120, 1889.718,
    ]),
  };
  const HOOK: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/hook1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-1, 0, 0, 1, 0, 0, 1, 4, 0, -1, 4, 0]),
  };

  function map(hookOwners: readonly number[] = [1], floor: WorldPoly = FLOOR, panel: WorldPoly = PANEL): SimMap {
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/floor', first: 0, count: 1, flags: 0x1001 },
      {
        modelName: 'worldmodel', path: 'worldmodel/hook1', first: 2, count: 1, flags: 0x1001,
        sweep: { minX: -2, maxX: 2, minZ: -2, maxZ: 240 },
      },
      {
        modelName: 'worldmodel', path: 'worldmodel/epan_1', first: 1, count: 1, flags: 0x1001,
        sweep: { minX: 1100, maxX: 1140, minZ: 1700, maxZ: 2200 },
      },
    ];
    const ground = packGround(params, [floor, panel, HOOK], owners);
    const meta = bareMeta('MP81');
    meta.actions.push({
      node: 'epan_1', type: 'SWITCH', typeCode: ACTION_TYPE_CODES.SWITCH!, valve: 'crane_v1',
      anims: ['crane_onoff_1'], team: null, range: 15, elevation: 15, points: 5, bitmap: '',
      path: 'worldmodel/epan_1', at: [1118.335, 75.5, 1889.718],
    });
    const slot = (side: 0 | 1, index: number, x: number, z: number): SpawnSlot => ({
      side, index, position: [x, 75.5, z], onFloor: true, step: side === 0 ? 2 : 6, facing: [0, 1], loc: { map: 0, x: 0, z: 0 },
    });
    const slots = [0, 1, 2, 3].flatMap((i) => [slot(0, i, 1000, 1800 + i * 20), slot(1, i, 1200, 1800 + i * 20)]);
    return {
      stem: 'MP81', name: 'CHAIN REACTION', ground, grid: groundGrid(ground), spawns: null, slots, respawns: [],
      cranes: chainReactionCraneSpecs([hookOwners]), meta, notes: [],
    };
  }

  class Client implements Conn {
    readonly events: ServerEvent[] = [];
    readonly frames: Uint8Array[] = [];
    send(frame: Uint8Array | string): void {
      if (typeof frame === 'string') this.events.push(JSON.parse(frame) as ServerEvent);
      else this.frames.push(frame);
    }
    close(): void { /* not used */ }
    of<T extends ServerEvent['type']>(type: T): Extract<ServerEvent, { type: T }>[] {
      return this.events.filter((e) => e.type === type) as Extract<ServerEvent, { type: T }>[];
    }
    last() { return decodeSnapshot(this.frames[this.frames.length - 1]!); }
  }

  it('the snapshot carries the phase, the switch pauses and scores its record once a round, and a round of steps moves the hull', () => {
    const room = new Room(map(), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const client = new Client();
    const other = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    room.hello(2, other, { type: 'hello', version: PROTOCOL_VERSION, name: 'B', map: 'MP81', cranes: true }, '192.0.2.2');
    expect(room.cranes.state(0)).toMatchObject({ paused: false, valve: 0, moving: 1, mesh: 'on' });
    for (let i = 0; i < 450; i++) room.step();
    const moved = room.cranes.state(0);
    expect(moved.paused).toBe(false);
    expect(moved.t).toBeCloseTo(7.5, 2);
    expect(moved.offset[2]).toBeCloseTo(115, 0);
    const snap = client.last();
    expect(snap.cranes?.[0]).toMatchObject({ valve: 0, leg: 0 });
    expect(snap.cranes?.[0]?.ms).toBeCloseTo(moved.t * 1000, -1);
    expect(segmentHit(room.map.grid, [0, 2, 113], [0, 2, 117])?.point[2]).toBeCloseTo(115, 0);
    expect(segmentHit(room.map.grid, [0, 2, -2], [0, 2, 2])).toBeNull();

    const p = room.player(1)!;
    p.sim.walker.place(1118.335, 80, 1881.718);
    for (let i = 0; i < 40; i++) room.step();
    expect(p.alive).toBe(true);
    const feet = p.sim.walker.state;
    // The reach is feet against the struck point (actionAtPick), and elevation is 15, so the point stays under
    // that and above the floor the head's line would otherwise meet.
    const surface = { path: 'worldmodel/epan_1', point: [1118.335, feet.y + 5, 1889.718] as [number, number, number] };
    const before = room.cranes.state(0).offset[2];
    room.takeDrops();
    const press: ClientEvent = { type: 'action', seq: p.sim.seq, action: 0, surface };
    room.text(1, press);
    expect(room.takeDrops()).toBeNull();
    expect(client.of('action')).toEqual([{ type: 'action', action: 0, by: 1 }]);
    expect(other.of('action')).toEqual([{ type: 'action', action: 0, by: 1 }]);
    // #337 takeover, point 4: the record's points once a round (the host's callers of `FUN_00545530`, D:L160566 and
    // D:L160645, behind the record's `+0x3f` bit 1, which `FUN_002b5510` clears) -- the first press scores the 5.
    expect(p.score).toBe(5);
    expect(room.cranes.state(0)).toMatchObject({ paused: true, valve: 1, moving: 0, mesh: 'off' });
    const pausedAt = room.cranes.state(0).t;
    for (let i = 0; i < 60; i++) room.step();
    expect(room.cranes.state(0).t).toBeCloseTo(pausedAt, 5);
    expect(room.cranes.state(0).offset[2]).toBeCloseTo(before, 0);
    room.text(1, { ...press, seq: p.sim.seq });
    expect(room.cranes.state(0)).toMatchObject({ paused: false, valve: 0, moving: 1, mesh: 'on' });
    expect(client.of('action')).toEqual([
      { type: 'action', action: 0, by: 1 },
      { type: 'action', action: 0, by: 1 },
    ]);
    expect(other.of('action')).toHaveLength(2);
    expect(p.score, 'the second press: the bit already set, nothing more').toBe(5);
  });

  it("#337 takeover (the wire, additive): a page whose hello does not read the Cranes section gets MP81's snapshots without it, decodable by a page from before #337; one that reads it gets the hooks; a leave drops the word", () => {
    const room = new Room(map(), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const reads = new Client(), old = new Client(), watcher = new Client();
    room.hello(1, reads, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    room.hello(2, old, { type: 'hello', version: PROTOCOL_VERSION, name: 'B', map: 'MP81' }, '192.0.2.2');
    room.hello(3, watcher, { type: 'hello', version: PROTOCOL_VERSION, name: 'C', map: 'MP81', watch: true, cranes: true }, '192.0.2.3');
    for (let i = 0; i < 120; i++) room.step();
    expect(old.frames.length).toBeGreaterThan(0);
    for (const f of old.frames) {
      expect(f[5]! & 4, 'no Cranes bit for the old page').toBe(0);
      expect(() => decodeSnapshotPre337(f)).not.toThrow();
      expect(decodeSnapshot(f).cranes).toBeUndefined();
    }
    expect(reads.last().cranes).toHaveLength(3);
    expect(watcher.last().cranes, 'a watcher draws the hooks too').toHaveLength(3);
    expect(() => decodeSnapshotPre337(reads.frames[reads.frames.length - 1]!), 'the section is what an old page refuses').toThrow(/sections/);
    room.leave(1, reads);
    const again = new Client();
    room.hello(1, again, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81' }, '192.0.2.1');
    for (let i = 0; i < 30; i++) room.step();
    expect(again.frames.length).toBeGreaterThan(0);
    for (const f of again.frames) expect(decodeSnapshot(f).cranes, "the next connection's hello, not the last one's").toBeUndefined();
  });

  it("#337 review F1 (CRANE_PRESS_SLACK_ADAPTATION): a press naming the hook where a lagging page saw it pauses at 0, 100 and 200 ms; one lagging past the bound is refused 'missed'", () => {
    // The panel's face lies across Z, the hook's travel: the case the off-ray fallback cannot rescue. The page saw the
    // hook `lag` seconds ago (its view clock that far behind the room); the room's hook is ahead by speed x lag.
    const floor: WorldPoly = { ...FLOOR, points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]) };
    const speed = 230 / 15;
    const press = (lag: number): { paused: boolean; drops: Record<string, number> | null } => {
      const room = new Room(map([1, 2], floor), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
      room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
      for (let i = 0; i < 5 * TICK_HZ; i++) room.step();
      const panelZ = 1889.718 + room.cranes.state(0).offset[2];
      const p = room.player(1)!;
      p.sim.walker.place(1118.335, 65, panelZ - speed * lag - 6);
      p.sim.walker.state.yaw = 180;
      const feet = p.sim.walker.state;
      const body = {
        feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
        moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
      };
      const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
      (p as unknown as { viewTick: number }).viewTick = room.tick - lag * TICK_HZ;   // the page's view clock, `lag` behind the room
      const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), panelZ - speed * lag] as [number, number, number] };
      room.takeDrops();
      room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
      return { paused: room.cranes.state(0).paused, drops: room.takeDrops() };
    };
    for (const lag of [0, 0.1, 0.2]) expect(press(lag), `${lag * 1000} ms`).toEqual({ paused: true, drops: null });
    // Past the bound: the slack counts at most MAX_REWIND_MS of the claimed lag, so a point speed x 0.45 behind the hook
    // (beyond 1 + speed x (0.2 + 0.1)) is not the panel's.
    expect(press(0.45)).toEqual({ paused: false, drops: { 'action: missed': 1 } });
  });

  it("#337 (the review's low 3): a command batch whose view clock is NaN or Infinity leaves the player's clock as it stood, and a lagging crane press is still judged on it", () => {
    const floor: WorldPoly = { ...FLOOR, points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]) };
    const speed = 230 / 15, lag = 0.2;
    for (const bad of [NaN, Infinity, -Infinity]) {
      const room = new Room(map([1, 2], floor), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
      room.hello(1, new Client(), { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
      for (let i = 0; i < 5 * TICK_HZ; i++) room.step();
      const p = room.player(1)!, clock = (): number => (p as unknown as { viewTick: number }).viewTick;
      room.binary(1, encodeCommands({ viewTick: room.tick - lag * TICK_HZ, commands: [] }));
      const good = clock();
      expect(good, 'the finite batch taken').toBeCloseTo(room.tick - lag * TICK_HZ, 3);
      room.binary(1, encodeCommands({ viewTick: bad, commands: [] }));
      expect(clock(), `${bad}: kept as it stood`).toBe(good);
      const panelZ = 1889.718 + room.cranes.state(0).offset[2];
      p.sim.walker.place(1118.335, 65, panelZ - speed * lag - 6);
      p.sim.walker.state.yaw = 180;
      const feet = p.sim.walker.state;
      const head = headEye(room.map.grid, [feet.x, feet.y, feet.z], headPoint({
        feet: [feet.x, feet.y, feet.z], yaw: feet.yaw, posture: p.sim.walker.posture, moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
      }), () => true);
      room.takeDrops();
      room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface: { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), panelZ - speed * lag] } });
      expect({ paused: room.cranes.state(0).paused, drops: room.takeDrops() }, `${bad}: the 200 ms press judged on the kept clock`).toEqual({ paused: true, drops: null });
    }
  });

  it('standing at y 65 and tracking the hook at its real speed still pauses', () => {
    // The stand is the floor at 65 (the disc check), not the switch's record height. The panel is the moving
    // collision the prompt tracks. Hook 1's leg is 230 units in 15 s, about 15 u/s.
    const floor: WorldPoly = {
      ...FLOOR,
      points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]),
    };
    const room = new Room(map([1, 2], floor), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    const ticks = 5 * TICK_HZ;
    for (let i = 0; i < ticks; i++) room.step();
    const speed = 230 / 15;
    const travelled = room.cranes.state(0).offset[2];
    expect(travelled / 5).toBeCloseTo(speed, 0);
    const panelZ = 1889.718 + travelled;
    const p = room.player(1)!;
    // Facing +Z, a few units short of the panel, the way a player walks with the switch.
    p.sim.walker.place(1118.335, 65, panelZ - 6);
    p.sim.walker.state.yaw = 180;
    expect(p.alive).toBe(true);
    const feet = p.sim.walker.state;
    expect(feet.y).toBeCloseTo(65, 1);
    const body = {
      feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
      moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
    };
    const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
    // The page poses one clamped frame (0.1 s) ahead of the hull this room will judge, and the press names that point.
    const lead = speed * 0.1;
    const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), panelZ + lead] as [number, number, number] };
    const slack = cranePressSlack(room.cranes.specs[0]!);
    const plain = c4Line(room.map.grid, head, surface);
    const allowed = c4Line(room.map.grid, head, surface, '', [], slack);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
    const drops = room.takeDrops();
    expect({ feetY: feet.y, head, lead, slack, plain, allowed, drops, paused: room.cranes.state(0).paused }).toMatchObject({
      paused: true,
    });
  });

  it('a side-on look at the hook moving about 15 u/s still pauses, and a stale or far press does not', () => {
    // The panel is a narrow face at constant X (half a unit either side of the rest Z). Hook 1 travels in Z, so a
    // player standing on the page's Z and looking along X never meets that face: the slack is along the ray. The
    // closest point on the room's polygon is inside the same slack. Seat checks before the line: a command more than
    // three ticks behind is stale and is not told to the page; a mounted seat and a release in progress are refused
    // before the line; then the reach. The hull is the room grid as the previous crane step left it.
    const floor: WorldPoly = {
      ...FLOOR,
      points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]),
    };
    const narrow: WorldPoly = {
      ...PANEL,
      points: Float32Array.from([
        1118.335, 60, 1888.718, 1118.335, 60, 1890.718, 1118.335, 120, 1890.718, 1118.335, 120, 1888.718,
      ]),
    };
    const room = new Room(map([1, 2], floor, narrow), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    for (let i = 0; i < 5 * TICK_HZ; i++) room.step();
    const speed = 230 / 15;
    const travelled = room.cranes.state(0).offset[2];
    expect(travelled / 5).toBeCloseTo(speed, 0);
    const roomZ = 1889.718 + travelled;
    const slack = cranePressSlack(room.cranes.specs[0]!);
    const p = room.player(1)!;
    const stand = (z: number): { surface: { path: string; point: [number, number, number] }; head: [number, number, number] } => {
      p.sim.walker.place(1118.335 - 6, 65, z);
      p.sim.walker.state.yaw = 270;
      const feet = p.sim.walker.state;
      const body = {
        feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
        moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
      };
      const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
      const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), z] as [number, number, number] };
      return { surface, head };
    };
    const lead = speed * 0.1;
    const good = stand(roomZ + lead);
    expect(c4Line(room.map.grid, good.head, good.surface, '', [], slack).clear).toBe(false);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq - 4, action: 0, surface: good.surface });
    expect(room.takeDrops()).toEqual({ 'action: stale': 1 });
    expect(client.events.filter((e) => e.type === 'stale')).toEqual([]);
    expect(room.cranes.state(0).paused).toBe(false);
    const far = stand(roomZ + 8);
    expect(c4Line(room.map.grid, far.head, far.surface, '', [], slack).clear).toBe(false);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface: far.surface });
    expect(room.takeDrops()).toEqual({ 'action: missed': 1 });
    expect(room.cranes.state(0).paused).toBe(false);
    const tracked = stand(roomZ + lead);
    expect(c4Line(room.map.grid, tracked.head, tracked.surface, '', [], slack).clear).toBe(false);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface: tracked.surface });
    expect(room.takeDrops()).toBeNull();
    expect(room.cranes.state(0).paused).toBe(true);
  });

  it('a point 1.5 units ahead of the moving panel still pauses the hook', () => {
    const room = new Room(map([1, 2]), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    const p = room.player(1)!;
    for (let i = 0; i < 40; i++) room.step();
    expect(p.alive).toBe(true);
    const ahead = room.cranes.state(0).offset[2];
    expect(ahead).toBeGreaterThan(5);
    const panelZ = 1889.718 + ahead;
    p.sim.walker.place(1118.335, 80, panelZ - 8);
    const feet = p.sim.walker.state;
    const body = {
      feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
      moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
    };
    const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
    // Elevation is 15 against the feet, and the head stands about that far up, so the named point stays just inside
    // the elevation and the extra past the panel is Z only: over the 1-unit line, inside one frame of hook1.
    const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), panelZ + 1.5] as [number, number, number] };
    expect(c4Line(room.map.grid, head, surface).clear).toBe(false);
    expect(c4Line(room.map.grid, head, surface, '', [], cranePressSlack(room.cranes.specs[0]!)).clear).toBe(true);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
    expect(room.takeDrops()).toBeNull();
    expect(room.cranes.state(0)).toMatchObject({ paused: true, valve: 1, moving: 0, mesh: 'off' });
    const held = room.cranes.state(0).offset[2];
    for (let i = 0; i < 30; i++) room.step();
    expect(room.cranes.state(0).offset[2]).toBeCloseTo(held, 4);
  });

  it('a shallow look meets the moving face far along the ray and still pauses', () => {
    // Hook 1 travels in Z. The page names a point one clamped frame ahead of the room face. From the side the
    // head's line meets that face, but the meeting is several units from the point, past the along-ray slack.
    // The face itself is one frame away. Feet at y 65, the disc check's stand.
    const floor: WorldPoly = {
      ...FLOOR,
      points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]),
    };
    const wide: WorldPoly = {
      ...PANEL,
      points: Float32Array.from([
        1110, 60, 1889.718, 1140, 60, 1889.718, 1140, 120, 1889.718, 1110, 120, 1889.718,
      ]),
    };
    const room = new Room(map([1, 2], floor, wide), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    for (let i = 0; i < 5 * TICK_HZ; i++) room.step();
    const speed = 230 / 15;
    const travelled = room.cranes.state(0).offset[2];
    expect(travelled / 5).toBeCloseTo(speed, 0);
    const panelZ = 1889.718 + travelled;
    const lead = speed * 0.1;
    const slack = cranePressSlack(room.cranes.specs[0]!);
    const p = room.player(1)!;
    p.sim.walker.place(1128, 65, panelZ - 6);
    p.sim.walker.state.yaw = 180;
    const feet = p.sim.walker.state;
    expect(feet.y).toBeCloseTo(65, 1);
    const body = {
      feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
      moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
    };
    const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
    const surface = { path: 'worldmodel/epan_1', point: [1138, Math.min(head[1], feet.y + 14), panelZ + lead] as [number, number, number] };
    const line = c4Line(room.map.grid, head, surface, '', [], slack);
    expect(line).toEqual({ clear: false, why: 'missed' });
    expect(craneSurfaceOffRay(room.map.grid, head, surface, slack)?.clear).toBe(true);
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
    expect(room.takeDrops()).toBeNull();
    expect(room.cranes.state(0).paused).toBe(true);
  });

  it('the offline room forks the disc rest, and a press on the page face pauses', () => {
    // `show` poses the page, then the armory, then `simMapOfLoaded` forks the hull. Five seconds of frames before
    // that fork used to hand the room the moved polygons as rest while the page's rest stayed the disc's. The
    // snapshot then put the two on different bases, and every crane's press was farther than the slack.
    const floor: WorldPoly = {
      ...FLOOR,
      points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]),
    };
    const built = map([1, 2], floor);
    const pageGround = built.ground;
    let wire: CraneWire[] | undefined;
    const page = new CranePage({
      move() { /* the drawn node is not this test */ },
      spin() { /* the swing neither */ },
      active() { /* the meshes neither */ },
      net: () => (wire ? { cranes: () => wire } : null),
      followsMatch: () => true,
    });
    page.setMap(built.cranes, pageGround);
    const zOf = (ground: typeof pageGround): number => {
      const poly = groundPolygons(ground).find((p) => p.path === 'worldmodel/epan_1');
      if (!poly) throw new Error('epan_1');
      return poly.points[2]!;
    };
    for (let i = 0; i < 5 * TICK_HZ; i++) page.frame(DT);
    expect(zOf(pageGround)).toBeCloseTo(1889.718, 3);
    const forked = forkGround(pageGround);
    const room = new Room(
      { ...built, ground: forked, grid: groundGrid(forked) },
      null,
      { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 },
    );
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    for (let i = 0; i < 5 * TICK_HZ; i++) {
      room.step();
      wire = room.cranes.wire();
      page.frame(DT);
    }
    const roomZ = zOf(forked);
    const pageZ = zOf(pageGround);
    const slack = cranePressSlack(room.cranes.specs[0]!);
    expect(Math.abs(pageZ - roomZ)).toBeLessThan(slack);
    expect(pageZ).toBeGreaterThan(1889.718 + 50);
    const p = room.player(1)!;
    p.sim.walker.place(1118.335, 65, pageZ - 6);
    p.sim.walker.state.yaw = 180;
    const feet = p.sim.walker.state;
    const body = {
      feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
      moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
    };
    const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
    const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), pageZ] as [number, number, number] };
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
    expect(room.takeDrops()).toBeNull();
    expect(room.cranes.state(0).paused).toBe(true);
  });

  it('a dev room records the room faces a missed crane press was judged against', () => {
    const floor: WorldPoly = {
      ...FLOOR,
      points: Float32Array.from([900, 65, 1700, 1400, 65, 1700, 1400, 65, 2100, 900, 65, 2100]),
    };
    const seen: CraneActionMiss[] = [];
    const room = new Room(map([1, 2], floor), null, {
      now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0,
      onActionMiss: (detail) => {
        detail.page = [{ path: 'worldmodel/hook1', offset: [0, 0, 0], paused: false }];
        seen.push(detail);
      },
    });
    const client = new Client();
    room.hello(1, client, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    for (let i = 0; i < 5 * TICK_HZ; i++) room.step();
    const roomZ = 1889.718 + room.cranes.state(0).offset[2];
    const p = room.player(1)!;
    p.sim.walker.place(1118.335, 65, roomZ - 6);
    p.sim.walker.state.yaw = 180;
    const feet = p.sim.walker.state;
    const body = {
      feet: [feet.x, feet.y, feet.z] as [number, number, number], yaw: feet.yaw, posture: p.sim.walker.posture,
      moveRoot: p.sim.moves?.rootY() ?? null, peek: p.sim.moves?.peek() ?? 0,
    };
    const head = headEye(room.map.grid, body.feet, headPoint(body), () => true);
    const surface = { path: 'worldmodel/epan_1', point: [1118.335, Math.min(head[1], feet.y + 14), roomZ + 8] as [number, number, number] };
    room.takeDrops();
    room.text(1, { type: 'action', seq: p.sim.seq, action: 0, surface });
    expect(room.takeDrops()).toEqual({ 'action: missed': 1 });
    expect(room.cranes.state(0).paused).toBe(false);
    expect(seen).toHaveLength(1);
    const miss = room.lastActionMiss;
    expect(miss).toBe(seen[0]);
    expect(miss?.path).toBe('worldmodel/epan_1');
    expect(miss!.nearest).toBeGreaterThan(miss!.slack);
    expect(miss!.faces.length).toBeGreaterThan(0);
    expect(miss!.faces[0]![0]![2]).toBeCloseTo(roomZ, 1);
    expect(miss!.point[2]).toBeCloseTo(roomZ + 8, 1);
    expect(miss!.eye[0]).toBeCloseTo(head[0], 3);
    expect(miss!.ray.from).toEqual(miss!.eye);
    expect(miss!.roomOffset[2]).toBeCloseTo(room.cranes.state(0).offset[2], 4);
    expect(miss!.page?.[0]?.path).toBe('worldmodel/hook1');
    const quiet = new Room(map([1, 2], floor), null, { now: () => 0, random: () => 0.5, rules: 'respawn', roundSeconds: 600, launchCountdownS: 0 });
    const other = new Client();
    quiet.hello(1, other, { type: 'hello', version: PROTOCOL_VERSION, name: 'A', map: 'MP81', cranes: true }, '192.0.2.1');
    const q = quiet.player(1)!;
    q.sim.walker.place(1118.335, 65, 1889.718 - 6);
    q.sim.walker.state.yaw = 180;
    quiet.text(1, { type: 'action', seq: q.sim.seq, action: 0, surface: { path: 'worldmodel/epan_1', point: [1118.335, 70, 1900] } });
    expect(quiet.lastActionMiss).toBeNull();
  });

  it('a point on the far side of a thick panel stays missed', () => {
    const front: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/epan_1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-4, 0, 0, 4, 0, 0, 4, 20, 0, -4, 20, 0]),
    };
    const back: WorldPoly = { ...front, points: Float32Array.from([-4, 0, 8, 4, 0, 8, 4, 20, 8, -4, 20, 8]) };
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/epan_1', first: 0, count: 2, flags: 0x1001, sweep: { minX: -8, maxX: 8, minZ: -2, maxZ: 12 } },
    ];
    const grid = groundGrid(packGround(params, [front, back], owners));
    const head: [number, number, number] = [0, 12, -6];
    const slack = cranePressSlack(chainReactionCraneSpecs()[0]!);
    const far = { path: 'worldmodel/epan_1', point: [0, 12, 8] as [number, number, number] };
    expect(c4Line(grid, head, far, '', [], slack)).toEqual({ clear: false, why: 'missed' });
    expect(craneSurfaceOffRay(grid, head, far, slack)).toBeNull();
    const near = { path: 'worldmodel/epan_1', point: [0, 12, 0.4] as [number, number, number] };
    expect(craneSurfaceOffRay(grid, head, near, slack)?.clear).toBe(true);
  });
});

describe('the control meshes live under hcont and the page seeds crane_vN', () => {
  it('the published paths are hcont_N/control_switch, go_on shown at the start', () => {
    const specs = chainReactionCraneSpecs();
    expect(specs.map((s) => s.onMesh)).toEqual([
      'worldmodel/hcont_1/control_switch=control_switch/go_on_switch',
      'worldmodel/hcont_2/control_switch=control_switch/go_on_switch',
      'worldmodel/hcont_3/control_switch=control_switch/go_on_switch',
    ]);
    expect(specs.map((s) => s.offMesh)).toEqual([
      'worldmodel/hcont_1/control_switch=control_switch/go_off_now',
      'worldmodel/hcont_2/control_switch=control_switch/go_off_now',
      'worldmodel/hcont_3/control_switch=control_switch/go_off_now',
    ]);
    expect(specs.map((s) => s.mesh)).toEqual(['on', 'on', 'on']);
    expect(specs.map((s) => s.panels)).toEqual([
      ['worldmodel/epan_1', 'worldmodel/hcont_1'],
      ['worldmodel/epan_2', 'worldmodel/hcont_2'],
      ['worldmodel/epan_3', 'worldmodel/hcont_3'],
    ]);
    const first = specs[0]!;
    expect(craneRides(first, 'worldmodel/hook1/swingplate/bolt')).toBe(true);
    expect(craneRides(first, 'worldmodel/epan_1')).toBe(true);
    expect(craneRides(first, 'worldmodel/hcont_1/control_switch=control_switch/go_on_switch')).toBe(true);
    expect(craneRides(first, 'worldmodel/floor')).toBe(false);
    expect(craneRides(first, 'worldmodel/hook2')).toBe(false);
  });

  it('setMap writes valve 0, and a snapshot valve 1 is what the next press tests', () => {
    const valves = new Map<string, number>();
    const shown: { path: string; on: boolean }[] = [];
    let wire: CraneWire[] | undefined;
    const page = new CranePage({
      move() { /* the hook is not drawn here */ },
      spin() { /* the swingplate neither */ },
      active: (path, on) => { shown.push({ path, on }); },
      net: () => (wire ? { cranes: () => wire } : null),
      valve: (name, value) => { valves.set(name, value); },
    });
    page.setMap(chainReactionCraneSpecs(), undefined);
    expect([...valves.entries()]).toEqual([['crane_v1', 0], ['crane_v2', 0], ['crane_v3', 0]]);
    expect(shown.filter((s) => s.on).map((s) => s.path)).toEqual(chainReactionCraneSpecs().map((s) => s.onMesh));
    expect(shown.filter((s) => !s.on).map((s) => s.path)).toEqual(chainReactionCraneSpecs().map((s) => s.offMesh));
    wire = [
      { valve: 1, leg: 0, ms: 0, swingMs: 0, mesh: 2 },
      { valve: 0, leg: 0, ms: 0, swingMs: 0, mesh: 1 },
      { valve: 0, leg: 0, ms: 0, swingMs: 0, mesh: 1 },
    ];
    page.frame(DT);
    expect(valves.get('crane_v1')).toBe(1);
    expect(valves.get('crane_v2')).toBe(0);
    expect(shown.at(-6)).toEqual({ path: 'worldmodel/hcont_1/control_switch=control_switch/go_on_switch', on: false });
    expect(shown.at(-5)).toEqual({ path: 'worldmodel/hcont_1/control_switch=control_switch/go_off_now', on: true });
  });

  it('the page moves epan and hcont with the hook, and the swing stays on swingplate', () => {
    const moves: { path: string; z: number }[] = [];
    const spins: string[] = [];
    let wire: CraneWire[] | undefined;
    const page = new CranePage({
      move: (path, delta) => { moves.push({ path, z: delta[14]! }); },
      spin: (path) => { spins.push(path); },
      active() { /* the meshes are not what this test watches */ },
      net: () => (wire ? { cranes: () => wire } : null),
    });
    page.setMap(chainReactionCraneSpecs(), undefined);
    const last = (path: string): number => moves.filter((m) => m.path === path).at(-1)!.z;
    expect(last('worldmodel/hook1')).toBe(0);
    expect(last('worldmodel/epan_1')).toBe(0);
    expect(last('worldmodel/hcont_1')).toBe(0);
    expect(spins.filter((p) => p.startsWith('worldmodel/hook1'))).toEqual(['worldmodel/hook1/swingplate']);
    expect(spins.some((p) => p.includes('epan') || p.includes('hcont'))).toBe(false);
    wire = [
      { valve: 1, leg: 0, ms: 7500, swingMs: 500, mesh: 2 },
      { valve: 0, leg: 0, ms: 0, swingMs: 0, mesh: 1 },
      { valve: 0, leg: 0, ms: 0, swingMs: 0, mesh: 1 },
    ];
    page.frame(1);
    expect(last('worldmodel/hook1')).toBeCloseTo(115, 1);
    expect(last('worldmodel/epan_1')).toBeCloseTo(115, 1);
    expect(last('worldmodel/hcont_1')).toBeCloseTo(115, 1);
    const held = last('worldmodel/epan_1');
    page.frame(1);
    expect(last('worldmodel/hook1')).toBeCloseTo(held, 4);
    expect(last('worldmodel/hcont_1')).toBeCloseTo(held, 4);
    expect(Math.abs(last('worldmodel/hook2'))).toBeGreaterThan(10);
    const late: { path: string; z: number }[] = [];
    const joiner = new CranePage({
      move: (path, delta) => { late.push({ path, z: delta[14]! }); },
      spin() { /* the joiner's swing is the same clock; this test watches the translation */ },
      active() { /* meshes follow the snapshot in the test above */ },
      net: () => ({ cranes: () => wire! }),
    });
    joiner.setMap(chainReactionCraneSpecs(), undefined);
    joiner.frame(0);
    const joined = (path: string): number => late.filter((m) => m.path === path).at(-1)!.z;
    expect(joined('worldmodel/hook1')).toBeCloseTo(115, 1);
    expect(joined('worldmodel/epan_1')).toBeCloseTo(115, 1);
    expect(joined('worldmodel/hcont_1')).toBeCloseTo(115, 1);
  });

  it('pauses locally only when there is no match', () => {
    const zOf = new Map<string, number>();
    const page = new CranePage({
      move: (path, delta) => { zOf.set(path, delta[14]!); },
      spin() { /* the swing is not this test */ },
      active() { /* the meshes follow the toggle; this test watches the pause */ },
      net: () => null,
    });
    page.setMap(chainReactionCraneSpecs(), undefined);
    expect(page.toggleLocal('crane_v1')).toBe(true);
    expect(page.hookState()[0]).toMatchObject({ paused: true, valve: 1, mesh: 'off' });
    page.frame(1);
    expect(zOf.get('worldmodel/hook1')).toBeCloseTo(0, 4);
    expect(zOf.get('worldmodel/epan_1')).toBeCloseTo(0, 4);
    expect(zOf.get('worldmodel/hcont_1')).toBeCloseTo(0, 4);
    const matched = new CranePage({
      move: (path, delta) => { zOf.set(path, delta[14]!); },
      spin() { /* not watched */ },
      active() { /* not watched */ },
      net: () => ({ cranes: () => undefined }),
    });
    matched.setMap(chainReactionCraneSpecs(), undefined);
    expect(matched.toggleLocal('crane_v1')).toBe(false);
    expect(matched.hookState()[0]?.paused).toBe(false);
    // A match with no hook snapshot yet must not step: the offline room forks this hull, and a moved pose would be its rest.
    matched.frame(1);
    expect(zOf.get('worldmodel/hook1')).toBeCloseTo(0, 4);
    expect(zOf.get('worldmodel/epan_1')).toBeCloseTo(0, 4);
  });
});

describe('crane panels are their own meshes, and a press allows one frame of travel', () => {
  const on = 'worldmodel/hcont_1/control_switch=control_switch/go_on_switch';
  const off = 'worldmodel/hcont_1/control_switch=control_switch/go_off_now';

  it('splits riding instance placements out of a shared group', () => {
    const group = [
      { path: 'worldmodel/floor' },
      { path: on },
      { path: 'worldmodel/hcont_2/control_switch=control_switch/go_on_switch' },
      { path: off },
      { path: 'worldmodel/lamp' },
    ];
    expect(splitCranePlacements(group, [])).toEqual([group]);
    const split = splitCranePlacements(group, chainReactionCraneSpecs());
    expect(split.slice(0, 3)).toEqual([[{ path: on }], [{ path: 'worldmodel/hcont_2/control_switch=control_switch/go_on_switch' }], [{ path: off }]]);
    expect(split[3]).toEqual([{ path: 'worldmodel/floor' }, { path: 'worldmodel/lamp' }]);
    const slack = cranePressSlack(chainReactionCraneSpecs()[0]!);
    expect(slack).toBeCloseTo(1 + (230 / 15) * 0.1, 5);
    expect(cranePressSlack(chainReactionCraneSpecs()[1]!)).toBeGreaterThan(slack);
  });

  it('the default line misses a point 1.8 ahead of the panel, and the crane slack meets it', () => {
    const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 64, cellsX: 4, cellsZ: 4, originX: -64, originZ: -64 };
    const poly: WorldPoly = {
      modelName: 'worldmodel', path: 'worldmodel/epan_1', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: Float32Array.from([-2, 0, 0, 2, 0, 0, 2, 4, 0, -2, 4, 0]),
    };
    const owners: CollisionOwner[] = [
      { modelName: 'worldmodel', path: 'worldmodel/epan_1', first: 0, count: 1, flags: 0x1001 },
    ];
    const grid = groundGrid(packGround(params, [poly], owners));
    const surface = { path: 'worldmodel/epan_1', point: [0, 2, 1.8] as [number, number, number] };
    const head = [0, 2, -10];
    expect(c4Line(grid, head, surface)).toEqual({ clear: false, why: 'missed' });
    expect(c4Line(grid, head, surface, '', [], cranePressSlack(chainReactionCraneSpecs()[0]!)).clear).toBe(true);
  });

  it('reads a nodePath mesh and an instanced nodePaths entry, and says when a root was not drawn', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const group = new Group();
    const panel = new Mesh(geometry);
    panel.userData.nodePath = 'worldmodel/epan_1/skin';
    panel.position.set(9, 8, 7);
    group.add(panel);
    const lever = new InstancedMesh(geometry, new MeshBasicMaterial(), 1);
    lever.userData.nodePaths = [on];
    lever.setMatrixAt(0, new Matrix4().makeTranslation(4, 5, 6));
    group.add(lever);
    const hidden = new Mesh(geometry);
    hidden.userData.nodePath = off;
    hidden.visible = false;
    hidden.position.set(1, 1, 1);
    group.add(hidden);
    const [view] = craneScene(group, [{
      index: 0, paused: true, valve: 1, mesh: 'off', offset: [0, 0, 12],
      hook: 'worldmodel/hook1', panels: ['worldmodel/epan_1', 'worldmodel/hcont_1'],
      onMesh: on, offMesh: off, swingPath: 'worldmodel/hook1/swingplate',
    }]);
    expect(view).toMatchObject({ paused: true, valve: 1, mesh: 'off', offset: [0, 0, 12] });
    const piece = (path: string) => view!.pieces.find((p) => p.path === path);
    expect(piece('worldmodel/epan_1')).toMatchObject({ drawn: false, position: null });
    expect(piece('worldmodel/epan_1/skin')).toMatchObject({ drawn: true, visible: true, position: [9, 8, 7] });
    expect(piece(on)).toMatchObject({ drawn: true, visible: true, position: [4, 5, 6] });
    expect(piece(off)).toMatchObject({ drawn: true, visible: false });
    expect(piece('worldmodel/hook1')).toMatchObject({ drawn: false });
  });

  it('a crane facade is its own movable mesh and is not frustum-culled', () => {
    const part = (): LoadedMesh => ({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
      colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
      textureName: 'panel.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
    });
    const at = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
    const flare = 'worldmodel/hcont_1/control_switch=control_switch/go_on_switch';
    const map = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
      props: [
        { modelName: 'control_switch', parts: [part()], matrices: new Float32Array(at(1, 2, 3)), order: 0, alternate: false, facade: 1, lod: null, paths: [flare] },
        { modelName: 'lamp', parts: [part()], matrices: new Float32Array(at(0, 0, 0)), order: 1, alternate: false, facade: 1, lod: null, paths: ['worldmodel/lamp'] },
      ],
      textures: { 'panel.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
      textureFlags: { 'panel.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
      metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
      collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
      slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
      cranes: chainReactionCraneSpecs(),
    } as LoadedMap;
    const view = buildWorld(map);
    for (const task of view.revealProps) task();
    const mesh = view.group.children.find((c) => c.userData.nodePath === flare);
    const lamp = view.group.children.find((c) => c.name.includes('lamp'));
    expect(mesh).toBeTruthy();
    expect(mesh!.frustumCulled).toBe(false);
    expect(lamp?.userData.nodePath).toBeUndefined();
    const delta = new Float32Array(16);
    delta[0] = delta[5] = delta[10] = delta[15] = 1;
    delta[14] = 10;
    expect(view.moveNode('worldmodel/hcont_1', delta)).toBeGreaterThan(0);
    expect(mesh!.position.z).toBeCloseTo(13, 4);
    view.dispose();
  });

  it('transfers a shared crane mesh buffer once, the way the worker posts the map', () => {
    const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const uvs = new Float32Array(6);
    const colors = new Float32Array(12).fill(1);
    const indices = new Uint32Array([0, 1, 2]);
    const part = (): LoadedMesh => ({
      positions, uvs, colors, normals: null, faceNormals: null, indices,
      textureName: 'panel.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
    });
    const at = (z: number): Float32Array => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]);
    const prop = (path: string, z: number) => ({
      modelName: 'control_switch', parts: [part()], matrices: at(z), order: 0, alternate: false, facade: 0, lod: null, paths: [path],
    });
    const on = (n: number) => `worldmodel/hcont_${n}/control_switch=control_switch/go_on_switch`;
    const shared = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [part()], lines: null,
      props: [prop(on(1), 1), prop(on(2), 2), prop(on(3), 3)],
      textures: { 'panel.tif': { data: new Uint8ClampedArray(4).fill(255), width: 1, height: 1 } },
      textureFlags: {}, metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
      collision: { positions: new Float32Array([9]), colors: new Uint8Array([1]), polygons: 1 },
      slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
    } as LoadedMap;
    const list = transferables(shared);
    expect(list.filter((b) => b === positions.buffer)).toHaveLength(1);
    expect(new Set(list).size).toBe(list.length);
    const spare = new Float32Array([1, 2, 3]);
    expect(() => structuredClone({ spare }, { transfer: [spare.buffer, spare.buffer] })).toThrow(/duplicate|detached|could not be cloned/i);
    const clone = structuredClone(shared, { transfer: list });
    expect(positions.buffer.byteLength).toBe(0);
    expect(clone.props).toHaveLength(3);
    for (const p of clone.props) {
      expect(Array.from(p.parts[0]!.positions)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(p.parts[0]!.positions.buffer).toBe(clone.world[0]!.positions.buffer);
    }
    expect(clone.props.map((p) => p.matrices[14])).toEqual([1, 2, 3]);
    expect(clone.world[0]!.positions[8]).toBe(8);
  });

  it('a realised epan prototype child moves with the hook translation', () => {
    const part = (): LoadedMesh => ({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uvs: new Float32Array(6),
      colors: new Float32Array(12).fill(1), normals: null, faceNormals: null, indices: new Uint32Array([0, 1, 2]),
      textureName: 'panel.tif', fog: true, lit: false, order: 0, orderEnd: 0, cull: true, alternate: false, scroll: null,
    });
    const skin = 'worldmodel/epan_1/panel=epanel/skin';
    const map = {
      archive: 'SYN', camera: null, path: 'SYN.ZDB', name: 'synthetic', world: [], lines: null,
      props: [{
        modelName: 'epanel', parts: [part()], matrices: Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]),
        order: 0, alternate: false, facade: 1, lod: null, paths: [skin],
      }],
      textures: { 'panel.tif': { data: new Uint8ClampedArray(16).fill(255), width: 2, height: 2 } },
      textureFlags: { 'panel.tif': { bilinear: true, transparent: false, graded: false, opaque: true, gs: null } },
      metersPerUnit: 0.1, lightRig: null, origin: [0, 0, 0], detail: {}, grid: DEFAULT_GRID_PARAMS,
      collision: { positions: new Float32Array(0), colors: new Uint8Array(0), polygons: 0 },
      slots: [], diagnostics: [], loadMs: 0, timings: { fetch: 0, decode: 0, postedAt: 0 },
      cranes: chainReactionCraneSpecs(),
    } as LoadedMap;
    const view = buildWorld(map);
    for (const task of view.revealProps) task();
    const mesh = view.group.children.find((c) => c.userData.nodePath === skin);
    expect(mesh).toBeTruthy();
    expect(mesh!.frustumCulled).toBe(false);
    const delta = new Float32Array(16);
    delta[0] = delta[5] = delta[10] = delta[15] = 1;
    delta[14] = 10;
    expect(view.moveNode('worldmodel/epan_1', delta)).toBeGreaterThan(0);
    expect(mesh!.position.z).toBeCloseTo(13, 4);
    const [drawn] = craneScene(view.group, [{
      index: 0, paused: false, valve: 0, mesh: 'on', offset: [0, 0, 10],
      hook: 'worldmodel/hook1', panels: ['worldmodel/epan_1', 'worldmodel/hcont_1'],
      onMesh: 'worldmodel/hcont_1/control_switch=control_switch/go_on_switch',
      offMesh: 'worldmodel/hcont_1/control_switch=control_switch/go_off_now',
      swingPath: 'worldmodel/hook1/swingplate',
    }]);
    expect(drawn!.pieces.find((p) => p.path === 'worldmodel/epan_1')).toMatchObject({ drawn: false, position: null });
    expect(drawn!.pieces.find((p) => p.path === skin)).toMatchObject({ drawn: true, visible: true });
    expect(drawn!.pieces.find((p) => p.path === skin)!.position![2]).toBeCloseTo(13, 4);
    view.dispose();
  });
});

/**
 * The disc's MP81 (skipped without `SOCOM_DISC` or `SOCOM_PC_ROOT`). The meshes are missing when `readCranes` cannot
 * place them under the `hcont_N` that `control_pause_N` roots at, or when those paths are not in the scene.
 */
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : process.env.SOCOM_PC_ROOT ? join(process.env.SOCOM_PC_ROOT, 'game', 'disc') : '';
const MP81 = DISC ? resolve(DISC, 'RUN/MP81.ZDB') : '';
const HAVE_MP81 = MP81 !== '' && existsSync(MP81);

describe.skipIf(!HAVE_MP81)(`MP81's control meshes on the disc${HAVE_MP81 ? '' : ' (SOCOM_DISC with RUN/MP81.ZDB absent: skipped)'}`, () => {
  it('control_pause_N is rooted at hcont_N, and go_off_now starts hidden', () => {
    const bytes = new Uint8Array(readFileSync(MP81));
    const map = simMapFromBytes(bytes, 'RUN/MP81.ZDB');
    const table = chainReactionCraneSpecs();
    expect(map.cranes).toHaveLength(3);
    expect(map.cranes!.map((c) => c.onMesh)).toEqual(table.map((c) => c.onMesh));
    expect(map.cranes!.map((c) => c.offMesh)).toEqual(table.map((c) => c.offMesh));
    expect(map.cranes!.map((c) => c.mesh)).toEqual(['on', 'on', 'on']);
    expect(map.cranes!.map((c) => c.panels)).toEqual(table.map((c) => c.panels));
    expect(map.notes.filter((n) => n.startsWith('cranes:') && /missing|not rooted|no deactivate/.test(n))).toEqual([]);
    const meta = map.meta;
    if (!meta) throw new Error('MP81 has no map meta');
    const placed = new Set(meta.instances.map((i) => i.path));
    for (const crane of map.cranes!) {
      expect(placed.has(crane.onMesh), crane.onMesh).toBe(true);
      expect(placed.has(crane.offMesh), crane.offMesh).toBe(true);
      const off = meta.initial.find((e) => e.path === crane.offMesh);
      expect(off).toMatchObject({ deactivate: true, saveActive: true });
      expect(meta.initial.find((e) => e.path === crane.onMesh)?.deactivate ?? false).toBe(false);
    }
    const anims = parseAnimSets(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MZANIM.ZAR'))).sets.flatMap((s) => s.anims);
    for (let n = 1; n <= 3; n++) {
      const pause = anims.find((a) => a.name.toLowerCase() === `control_pause_${n}`);
      expect(pause, `control_pause_${n}`).toBeTruthy();
      const root = pause!.nodeRefs[pause!.params.rootNodeIndex];
      expect(root?.name.toLowerCase()).toBe(`hcont_${n}`);
      const rooted = anims.filter((a) => {
        const ref = a.nodeRefs[a.params.rootNodeIndex];
        return ref?.name.toLowerCase() === `hcont_${n}`;
      });
      const off = rooted.flatMap((a) => a.nodeRefs).find((r) => r.name.toLowerCase() === 'go_off_now' && (r.init.deactivate || r.init.saveActive));
      expect(off?.init).toMatchObject({ deactivate: true, saveActive: true });
    }
  }, 120_000);

  it("#337 takeover, point 4: each crane's SWITCH record on the disc, its valve and the points it scores once a round", () => {
    const map = simMapFromBytes(new Uint8Array(readFileSync(MP81)), 'RUN/MP81.ZDB');
    const records = map.cranes!.map((c) => map.meta!.actions.find((a) => a.valve.toLowerCase() === c.control.valve.toLowerCase()));
    // Read 2026-10-22 (the takeover's gap run): crane_v1..3, each SWITCH, each 0 points -- so on MP81 the once-a-round
    // score adds nothing (`scoreObjective` skips an action of 0); the rule is held by the synthetic 5 above.
    expect(records.map((r) => r && { valve: r.valve.toLowerCase(), typeCode: r.typeCode, points: r.points })).toEqual(
      [1, 2, 3].map((n) => ({ valve: `crane_v${n}`, typeCode: ACTION_TYPE_CODES.SWITCH, points: 0 })),
    );
  }, 120_000);

  it('the worker transfer of the crane placements moves each shared mesh buffer once', async () => {
    const loaded = await loadMap(new FsAssetSource(DISC), 'RUN/MP81.ZDB');
    const on = loaded.props.filter((p) => p.paths?.some((path) => path.endsWith('/go_on_switch')));
    expect(on.length).toBeGreaterThanOrEqual(2);
    const buffer = on[0]!.parts[0]!.positions.buffer;
    expect(on.filter((p) => p.parts.some((mesh) => mesh.positions.buffer === buffer)).length).toBeGreaterThanOrEqual(2);
    const before = on.map((p) => Array.from(p.parts[0]!.positions));
    const list = transferables(loaded);
    expect(list.filter((b) => b === buffer)).toHaveLength(1);
    expect(new Set(list).size).toBe(list.length);
    const clone = structuredClone(loaded, { transfer: list });
    expect(buffer.byteLength).toBe(0);
    const cloned = clone.props.filter((p) => p.paths?.some((path) => path.endsWith('/go_on_switch')));
    expect(cloned).toHaveLength(on.length);
    cloned.forEach((p, i) => {
      expect(Array.from(p.parts[0]!.positions)).toEqual(before[i]);
      expect(p.matrices.length).toBe(16);
    });
  }, 120_000);

  it('epan_N is an empty collision node, and the drawn lever is under hcont_N', async () => {
    const bytes = new Uint8Array(readFileSync(MP81));
    const models = parseSceneGraph(Zar.parse(zdbMember(bytes, parseZdb(bytes), 'MP81_GEO.ZED')));
    const flat = flattenScene(models, 'worldmodel');
    for (let n = 1; n <= 3; n++) {
      const placed = flat.find((f) => f.node.name.toLowerCase() === `epan_${n}`);
      expect(placed, `epan_${n}`).toBeTruthy();
      expect(placed!.node.children, `epan_${n} children`).toHaveLength(0);
      expect(placed!.node.visuals, `epan_${n} visuals`).toBe(0);
      expect(placed!.node.modelName ?? null, `epan_${n} model`).toBeNull();
      expect(placed!.node.type, `epan_${n} type`).not.toBe(NODE_INSTANCE);
    }
    const loaded = await loadMap(new FsAssetSource(DISC), 'RUN/MP81.ZDB');
    expect(loaded.diagnostics.filter((n) => n.startsWith('cranes:') && n.includes('decodes to no mesh'))).toEqual([]);
    const view = buildWorld(loaded);
    try {
      for (const task of view.revealProps) task();
      const cranes = loaded.cranes ?? [];
      expect(cranes).toHaveLength(3);
      const scene = craneScene(view.group, cranes.map((c, index) => ({
        index, paused: false, valve: 0, mesh: c.mesh, offset: [0, 0, 0] as [number, number, number],
        hook: c.path, panels: [...c.panels], onMesh: c.onMesh, offMesh: c.offMesh, swingPath: c.swing,
      })));
      scene.forEach((drawn, i) => {
        const root = cranes[i]!.panels[0]!;
        const child = drawn.pieces.find((p) => p.drawn && p.path !== root && (p.path.startsWith(`${root}/`) || p.path.startsWith(`${root}=`)));
        expect(child, `${root} pieces ${drawn.pieces.map((p) => `${p.path}:${p.drawn}`).join(', ')}`).toBeUndefined();
        expect(drawn.pieces.find((p) => p.path === root)).toMatchObject({ drawn: false, position: null });
        expect(drawn.pieces.find((p) => p.path === cranes[i]!.onMesh), cranes[i]!.onMesh).toMatchObject({ drawn: true });
      });
    } finally {
      view.dispose();
    }
  }, 120_000);
});

describe('#337 takeover (OT.R69): CRANE_PRESS_SLACK_ADAPTATION is named and tied to its sources', () => {
  it("its base is C4_SURFACE_SLACK_PLACEHOLDER's value and its frame the page's drawn-frame clamp in main.ts and matchMount.ts", () => {
    expect(CRANE_PRESS_BASE_SLACK).toBe(C4_SURFACE_SLACK_PLACEHOLDER);
    for (const f of ['main.ts', 'matchMount.ts']) {
      const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
      const clamp = /Math\.min\(frameTime\.frame\((?:[^()]|\([^()]*\))*\), ([0-9.]+)\)/.exec(src);
      expect(clamp, `${f}: the drawn-frame clamp`).not.toBeNull();
      expect(Number(clamp![1]), f).toBe(CRANE_PRESS_FRAME_SECONDS);
    }
    expect(cranePressSlack({ legs: [{ delta: [0, 0, 230], seconds: 15 }, { delta: [0, 0, -230], seconds: 15 }] }))
      .toBeCloseTo(CRANE_PRESS_BASE_SLACK + (230 / 15) * CRANE_PRESS_FRAME_SECONDS, 12);
  });

  it("a valve that is no crane's is never taken by the hooks: no index, no toggle, no hook's state changed", () => {
    const set = new CraneSet(chainReactionCraneSpecs(), null);
    const before = [0, 1, 2].map((i) => set.state(i));
    for (const valve of ['door_ft_1', 'access_1', '', 'CRANE_V']) {
      expect(set.indexByValve(valve), valve).toBe(-1);
      expect(set.toggleByValve(valve), valve).toBe(false);
    }
    expect([0, 1, 2].map((i) => set.state(i))).toEqual(before);
    expect(new CraneSet([], null).toggleByValve('crane_v1')).toBe(false);
  });
});

describe("#337 takeover (the wire, additive): a map without hooks keeps main's bytes", () => {
  const body = (id: number, x: number) => ({
    id, feet: [x, 0, 0] as [number, number, number], yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, flags: 0, stance: 0, landing: 0, jumps: 0, ground: 1,
    groundForward: 0, groundRight: 0, groundCls: 0, action: 0, actionSerial: 0, actionT: 0, actionSeconds: -1,
    overlay: 0, overlayT: 0, overlaySeconds: -1, turnRate: 0, trav: 0, travFrame: 0, travRootY: NaN, travBlend: 0, travBlendWeight: 0,
    peek: 0, weapon: 255, slot: 0,
  });
  const doors: { valve: number; phase: number }[] = [{ valve: 1, phase: 3 }, { valve: 0, phase: 0 }];
  const env = { revision: 9, epoch: 2, states: [{ id: 4, active: true }, { id: 7, active: false }] };
  const own = { ack: 41, x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, facing: { yaw: 90, pitch: -5 } };

  it("the snapshot: with no hooks named (absent or empty) the encoder writes main's bytes (the frozen pre-#337 codec) to the byte", () => {
    for (const s of [
      { tick: 321, own: null, bodies: [body(1, 10), body(2, -40)], doors, env },
      { tick: 7, own, bodies: [body(3, 0)], doors: [] },
      { tick: 8, own: null, bodies: [], doors, cranes: [] },
    ]) {
      const now = encodeSnapshot(s), before = encodeSnapshotPre337({ ...s, cranes: undefined } as Parameters<typeof encodeSnapshotPre337>[0]);
      expect(Buffer.from(now).toString('hex')).toBe(Buffer.from(before).toString('hex'));
    }
  });

});
