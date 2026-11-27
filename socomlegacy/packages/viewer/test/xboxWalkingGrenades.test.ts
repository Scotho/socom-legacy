import { describe, expect, it } from 'vitest';
import { buildGrid, CLAYMORE, M67, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { walkingGrenades } from '../src/xboxPrototype/walkingGrenades';

/** The lightweight match's throwables, first part: another player's grenade as the room tells it. */
function deck() {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/deck', region: 0, ditype: 2, material: 25, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-100, 0, 100, 100, 0, 100, 100, 0, -100, -100, 0, -100]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/deck0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}

describe('the lightweight match: another player\'s grenade', () => {
  const mount = () => {
    const grid = deck(), heard: string[] = [], shakes: unknown[] = [];
    const grenades = walkingGrenades({ table: null, models: [M67.model], grid: () => grid, hull: () => grid, snapshot: () => null, view: () => 'third' as never,
      feet: () => [0, 0, 0], dead: () => false, fly: { shakeScreen: (s) => { shakes.push(s); } }, effects: null,
      sound: (name) => { heard.push(name); }, ownId: () => 1 });
    return { grenades, heard, shakes };
  };

  it('is drawn as its record\'s model from the room\'s event, flies, and goes off with its sound; then it is gone', () => {
    const { grenades, heard } = mount();
    grenades.event({ type: 'grenade', id: 2, kind: M67.name, from: [0, 12, 0], velocity: [20, 30, 0], pid: 7 } as never);
    grenades.frame(1 / 30, 1 / 30);
    expect(grenades.objects).toHaveLength(1);
    expect(grenades.objects[0]!.model).toBe(M67.model);
    const first = [...grenades.objects[0]!.matrix.slice(12, 15)];
    for (let i = 0; i < 15; i++) grenades.frame(1 / 30, 1 / 30);
    const later = [...grenades.objects[0]!.matrix.slice(12, 15)];
    expect(later[0]).toBeGreaterThan(first[0]!);                       // it travelled along its throw
    for (let i = 0; i < 30 * 12 && grenades.report().explosions === 0; i++) grenades.frame(1 / 30, 1 / 30);
    expect(grenades.report().explosions).toBe(1);
    expect(grenades.report().withoutAnimation).toBe(1);                // no effect data here: the animation's name goes to the sound
    expect(heard.length).toBeGreaterThan(0);
    for (let i = 0; i < 30 * 12; i++) grenades.frame(1 / 30, 1 / 30);
    expect(grenades.objects).toHaveLength(0);
    grenades.dispose();
  });

  it('ignores the page\'s own throw and a model the map does not hold is counted, not drawn', () => {
    const { grenades } = mount();
    grenades.event({ type: 'grenade', id: 1, kind: M67.name, from: [0, 12, 0], velocity: [20, 30, 0], pid: 8 } as never);
    grenades.frame(1 / 30, 1 / 30);
    expect(grenades.report().launched).toBe(0);
    expect(grenades.objects).toHaveLength(0);
    const bare = walkingGrenades({ table: null, models: [], grid: () => null, hull: () => null, snapshot: () => null, view: () => 'third' as never,
      feet: () => null, dead: () => false, fly: { shakeScreen: () => {} }, effects: null, sound: () => {}, ownId: () => 1 });
    bare.event({ type: 'grenade', id: 2, kind: M67.name, from: [0, 12, 0], velocity: [20, 30, 0], pid: 9 } as never);
    bare.frame(1 / 30, 1 / 30);
    expect(bare.report().missingModels).toBe(1);
    expect(bare.objects).toHaveLength(0);
    grenades.dispose(); bare.dispose();
  });
});

/**
 * LATER 929/930 on the Xbox page (product track; the page's source answers `online: () => true`): a placed charge the
 * room refused `stale` is taken back through the page's `staleThrow` -> `GrenadeCore.giveBack` (its drawn copy gone,
 * the charge back), and a PMN copy is never tripped by the page's own proximity test (`roomTrips`): the room's
 * `detonate` is the one trip.
 */
describe('the lightweight match: LATER 929/930 (the room tells and trips the charges)', () => {
  const PMN_RECORD = { ...CLAYMORE, name: 'PMN Mine', id: 158, fuse: 8, removal: 10, explosionDamage: 6.5, explosionRadius: 40, proximity: 10, model: 'pmn', icon: 'pmn.tif', capacity: 4 };
  const frames = (g: { frame(dt: number, real: number): void }, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 30) g.frame(1 / 30, 1 / 30); };
  const snapAt = (feet: [number, number, number]) => ({ feet, yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand', landing: null, jumps: 0 }) as never;

  it('RED: LATER 929 -- a claymore the room refused stale is taken back: its copy gone, the charge back', () => {
    const grid = deck(), sent: { type: string; seq?: number; kind?: string }[] = [];
    let seq = 40;
    const client = { state: 'open', role: 'player', lastSeq: () => seq, send: (m: { type: string }) => { sent.push(m); } };
    const loadout = [0, 0, CLAYMORE.id, 0, 0];
    const grenades = walkingGrenades({ table: null, models: [CLAYMORE.model], grid: () => grid, hull: () => grid, snapshot: () => snapAt([0, 0, 0]), view: () => 'third' as never,
      feet: () => [0, 0, 0], dead: () => false, fly: { shakeScreen: () => {} }, effects: null, sound: () => {}, ownId: () => 1,
      own: {
        play: { partPoint: () => [2, 12, -8] }, walk: { hold: () => true, fireAim: () => null, fireAllowed: () => true, mode: () => 'walk' } as never,
        pose: { start: () => true, cut: () => {}, released: () => {}, letGo: () => {} } as never,
        client: () => client as never, loadout: () => loadout as never, pistol: () => false, viewState: () => 0, handSeq: (s) => s,
        suspendFirearm: () => {}, hand: () => null,
      } });
    grenades.spawn();
    expect(grenades.kit.selectEquipment(1)).toBe(true);
    grenades.trigger(true); frames(grenades, 3); grenades.trigger(false); frames(grenades, 0.5);
    const placed = sent.filter((m) => m.type === 'throw' && m.kind === 'Claymore');
    expect(placed).toHaveLength(1);
    expect(grenades.report().shown).toBe(1);
    expect(grenades.kit.left('Claymore')).toBe(CLAYMORE.capacity - 1);
    seq++;
    grenades.event({ type: 'stale', request: 'throw', seq: placed[0]!.seq! } as never);
    expect(grenades.report().stale).toBe(1);
    expect(grenades.report().shown).toBe(0);                          // trunk: the refused copy stays drawn
    expect(grenades.kit.left('Claymore')).toBe(CLAYMORE.capacity);
    grenades.dispose();
  });

  it('RED: LATER 930 -- a PMN copy is not tripped by the page\'s own feet inside 10 u; the room\'s `detonate` sets it off', () => {
    const grid = deck();
    let feet: [number, number, number] = [90, 0, 90];
    const table = { throwables: new Map([[PMN_RECORD.id, PMN_RECORD]]), rounds: new Map(), arsenal: { items: new Map(), byName: new Map() } } as never;
    const grenades = walkingGrenades({ table, models: ['pmn'], grid: () => grid, hull: () => grid, snapshot: () => snapAt(feet), view: () => 'third' as never,
      feet: () => feet, dead: () => false, fly: { shakeScreen: () => {} }, effects: null, sound: () => {}, ownId: () => 1 });
    grenades.event({ type: 'grenade', id: 2, kind: 'PMN Mine', from: [40, 0.1, 0], velocity: [1, 0, 0], pid: 5 } as never);
    frames(grenades, PMN_RECORD.fuse + 0.5);                         // armed, no one near
    expect(grenades.report().explosions).toBe(0);
    feet = [43, 0, 0];                                              // the page's own feet 3 u from it
    frames(grenades, 1);
    expect(grenades.report().explosions).toBe(0);                   // trunk: the page trips its copy itself
    grenades.event({ type: 'detonate', pid: 5 } as never);
    frames(grenades, 0.5);
    expect(grenades.report().explosions).toBe(1);
    grenades.dispose();
  });
});
