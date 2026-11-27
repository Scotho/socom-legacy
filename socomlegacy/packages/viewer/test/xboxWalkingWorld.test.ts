import { describe, expect, it } from 'vitest';
import { segmentHits, type GridParams, type WorldPoly } from '@s2u/scene';
import { groundGrid, packGround } from '../src/mover';
import type { MapMeta } from '../src/mapMeta';
import { walkingWorld, type WalkingWorldDeps } from '../src/xboxPrototype/walkingWorld';
import { worldChanges } from '../src/xboxPrototype/worldFrame';
import { worldPlacement } from '../src/xboxPrototype/worldPlacement';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { simMapFromBytes } from '../src/simMap';
import type { ClientEvent, DoorWire } from '../src/net/protocol';
import type { WorldState } from '../src/worldState';

const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 200, cellsX: 10, cellsZ: 10, originX: -1000, originZ: -1000 };
const MP2 = fixture('RUN/MP2.ZDB');
describe('prototype world adapter', () => {
  it('attaches the shared world to the existing movement grid; environment changes affect rendering and collision together', () => {
    const path = 'worldmodel/pane';
    const polygon: WorldPoly = { modelName: 'worldmodel', path, region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
      points: new Float32Array([10, 0, -100, 10, 0, 100, 10, 50, 100, 10, 50, -100]) };
    const ground = packGround(params, [polygon], [{ modelName: 'worldmodel', path, first: 0, count: 1, flags: 0x1001 }]);
    const grid = groundGrid(ground);
    const meta: MapMeta = { stem: 'SYN', actions: [], diagnostics: [], instances: [{ id: 0, path, node: 'pane', modelName: 'worldmodel', root: path }],
      instanceByPath: new Map([[path, 0]]), initial: [{ path, deactivate: false, saveActive: true, saveTransform: false, saveParent: false }] };
    let shared: (() => WorldState | null) | null = null;
    const client = { state: 'open', role: 'player', setWorld: (get: typeof shared) => { shared = get; }, doors: () => undefined };
    const walk = { gridOfGround: () => grid, grid: () => grid, feet: () => [0, 0, 0], fireAim: () => null, mode: () => 'walk', isDead: () => false,
      isLocked: () => false, actionGateShut: () => false };
    const world = walkingWorld({ map: { ground, meta }, walk, client: () => client, enabled: () => true, sound: () => null } as unknown as WalkingWorldDeps);
    world.follow(); const state = (shared as unknown as () => WorldState)();
    expect(state.grid).toBe(grid); expect(state.ground).toBe(ground);
    expect(segmentHits(grid, [0, 25, 0], [20, 25, 0])).toHaveLength(1);
    state.setActive(path, false);
    const binding = worldPlacement({ path, alternate: false }); binding.apply(worldChanges().take(world.frame));
    expect(binding.visible).toBe(false); expect(segmentHits(grid, [0, 25, 0], [20, 25, 0])).toHaveLength(0);
    state.reset(); binding.apply(worldChanges().take(world.frame));
    expect(binding.visible).toBe(true); expect(segmentHits(grid, [0, 25, 0], [20, 25, 0])).toHaveLength(1);
    world.dispose(); expect(shared).toBeNull();
  });
});

describe.skipIf(!MP2)(`prototype disc door adapter${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  function setup() {
    const map = simMapFromBytes(MP2!, 'RUN/MP2.ZDB'), grid = groundGrid(map.ground);
    const sent: ClientEvent[] = [], sounds: string[] = [];
    let wire: DoorWire[] | undefined, active = true, epoch = 1;
    const client = { state: 'open', role: 'player', setWorld: () => {}, send: (event: ClientEvent) => sent.push(event),
      doors: () => wire, lastSeq: () => 41, roundEpoch: () => epoch };
    const walk = { gridOfGround: () => grid, grid: () => grid, feet: () => [582.5, 142, 1135],
      fireAim: () => ({ eye: [582.5, 157.4, 1135], far: [582.5, 157.4, 135] }), mode: () => 'walk', isDead: () => false,
      isLocked: () => false, actionGateShut: () => false };
    const world = walkingWorld({ map, walk, client: () => client, enabled: () => active,
      sound: () => ({ audio: { play: (name: string) => sounds.push(name) }, sceneSound: () => {} }) } as unknown as WalkingWorldDeps);
    return { world, map, grid, sent, sounds, setActive: (v: boolean) => { active = v; }, setWire: (v: DoorWire[]) => { wire = v; }, nextRound: () => { epoch++; } };
  }
  it('uses the actual reticle target and chased pressure on release, moves the hull and publishes the leaf transform', () => {
    const h = setup(), before = h.map.ground.points.slice(); h.world.follow(); h.world.step(1 / 60);
    for (let i = 0; i < 40; i++) h.world.input(true, 1 / 60);
    expect(h.sent).toEqual([]); h.world.input(false, 1 / 60);
    expect(h.sent[0]).toMatchObject({ type: 'door', seq: 41, door: 0, press: expect.any(Number) });
    for (let i = 0; i < 120; i++) h.world.step(1 / 60);
    expect(h.map.ground.points).not.toEqual(before);
    expect(worldChanges().take(h.world.frame).some(op => op.kind === 'move' && op.path === 'worldmodel/bdoor_4')).toBe(true);
    expect(h.sounds.length).toBeGreaterThan(0); h.world.dispose();
  });
  it('cancels held input across focus loss; late join follows the room silently and a new round resets the leaf', () => {
    const h = setup(); h.world.input(true, 1 / 60); h.setActive(false); h.world.input(false, 1 / 60);
    h.world.input(false, 1 / 60); // Unfocused poll returns no pad; it must not clear cancellation.
    h.setActive(true); h.world.input(true, 1 / 60); h.world.input(false, 1 / 60); expect(h.sent).toEqual([]);
    h.setWire([{ valve: 1, phase: 255 }]); h.world.step(1 / 60);
    expect(h.world.report().doors.doors[0]).toMatchObject({ open: true, busy: false }); expect(h.sounds).toEqual([]);
    h.nextRound(); h.world.step(1 / 60); expect(h.world.report().doors.doors[0]).toMatchObject({ open: false, busy: false });
    h.world.dispose();
  });
  it('lets the shared pressure decay during an unfocused live hold cancellation, so a later tap does not inherit a kick', () => {
    const h = setup();
    for (let i = 0; i < 120; i++) h.world.input(true, 1 / 60);
    h.setActive(false);
    for (let i = 0; i < 360; i++) h.world.input(false, 1 / 60);
    h.setActive(true); h.world.input(false, 1 / 60);
    h.world.input(true, 1 / 60); h.world.input(false, 1 / 60);
    expect(h.sent).toHaveLength(1);
    expect((h.sent[0] as Extract<ClientEvent, { type: 'door' }>).press).toBeLessThan(0.1);
    h.world.dispose();
  });
});
