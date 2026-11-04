import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FsAssetSource } from '@s2u/archive/node';
import { Matrix4 } from 'three';
import { buildGrid, M67, GAME_FRAME_DT, type EffectOp, type EffectProgram, type WorldPoly } from '@s2u/scene';
import { BombPage } from '../src/bombPage';
import { Effects } from '../src/effects';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import type { BombWire } from '../src/net/objective';
import type { ServerEvent } from '../src/net/protocol';

const root = resolve(process.env.SOCOM_DISC ?? fileURLToPath(new URL('../../../test-fixtures', import.meta.url)));
const maps = ['MP1', 'MP7', 'MP9', 'MP12', 'MP72', 'MP83'];
// Research 173's complete Demolition census, including Night Stalker (MP7).
for (const map of maps) describe.skipIf(!existsSync(resolve(root, `RUN/${map}.ZDB`)))(`${map} planted bomb explosion (disc)`, () => {
  it('runs the authored satchel effects at the planted position exactly once', async () => {
    const data = await effectsFromDisc(new FsAssetSource(root), `RUN/${map}.ZDB`, map);
    const ops = data.programs.find(p => p.name === 'base_explosion1')?.sequences.flatMap(s => s.ops);
    expect(ops).toEqual([expect.objectContaining({ op: 'fireWeapon', weapon: 'MPBOMB', ammo: 'MPBOMB Ammo', node: -6, f1: 0.001, f2: 0.01 })]);
    const sounds: { name: string; at: number[] }[] = [];
    const fx = new Effects(() => 0.5, (name, at) => sounds.push({ name, at: [...at] }));
    fx.setData(data);
    let listener: (e: ServerEvent) => void = () => {};
    const page = new BombPage({ on: l => { listener = l; return () => {}; } }, {
      id: () => 2, team: () => 'seal', alive: () => true, feet: () => [350, 20, -470],
      actions: () => [], look: () => ({ forward: 0, right: 0, pitch: 0 }), serverTick: () => 100,
    }, { effects: fx });
    const bomb: BombWire = { state: 3, pos: [350, 20, -470], carrier: null, planter: 2, plantingTeam: 'seal', defuser: null, detonateTick: 100, pickupAfterTick: 0 };
    listener({ type: 'bomb', ...bomb });
    listener({ type: 'bomb', ...bomb, state: 5 });
    for (let i = 0; i < 6; i++) fx.update(GAME_FRAME_DT, null);
    expect(fx.stats().played.satchel).toBe(1);
    expect(fx.stats().emitted).toBeGreaterThan(0);
    expect(sounds.length).toBeGreaterThan(0);
    // The named initial-phase reading uses a full first step: zero initial speed still falls before fuse expiry.
    const record = data.scriptWeapons!.find(w => w.name === 'MPBOMB')!;
    expect(record.gravity).toBe(98);
    for (const sound of sounds) {
      expect(sound.at[0]).toBe(bomb.pos[0]); expect(sound.at[2]).toBe(bomb.pos[2]);
      expect(sound.at[1]).toBeCloseTo(bomb.pos[1] - record.gravity * GAME_FRAME_DT ** 2, 8);
    }
    const count = sounds.length;
    listener({ type: 'bomb', ...bomb, state: 5 });
    for (let i = 0; i < 6; i++) fx.update(GAME_FRAME_DT, null);
    expect(fx.stats().played.satchel).toBe(1);
    expect(sounds).toHaveLength(count);
    page.dispose();
    fx.setData(null);
  }, 30000);
});


function fixtureData(fuse = 0.001): EffectData {
  const program = (name: string, ops: EffectOp[]): EffectProgram => ({ name, root: 0, flags: 0, nodes: [], sequences: [{ name: 'start', activation: 1, ops }] });
  return { archive: 'test', models: [], textures: [], absent: [], materials: ['UNKNOWN', 'STONE'], defaultMaterial: 1,
    marks: [], footprints: [], ambient: [], sceneNodes: [], hitAnims: [], missing: [],
    scriptWeapons: [{ ...M67, name: 'test weapon', ammo: 'test ammo', muzzleVelocity: 0, gravity: 0, model: 'NONE', explosionAnim: 'burst', materialAnim: 'burst', fuse: 0.1 }],
    programs: [program('start', [{ op: 'fireWeapon', weapon: 'test weapon', ammo: 'test ammo', node: -6, f1: fuse, f2: 0.01 }]),
      program('burst', [{ op: 'sound', sound: '.DEFAULT', node: 0, flags: 0x80, newPlay: true, volume: 1 }]),
      program('burst_stone', [{ op: 'sound', sound: '.STONE', node: 0, flags: 0x80, newPlay: true, volume: 1 }])],
  };
}

describe('zero-muzzle script rounds (unit)', () => {
  it('outlives its parent, snapshots the node, counts game frames and explodes once after the fuse', () => {
    const heard: {name: string; at: number[]}[] = [];
    const fx = new Effects(() => 0.5, (name, at) => heard.push({name, at}));
    fx.setData(fixtureData());
    const node = new Matrix4().makeTranslation(100, 20, -300);
    fx.play('start', {node}); fx.update(0, null);
    node.makeTranslation(900, 900, 900);
    fx.update(GAME_FRAME_DT / 2, null); expect(heard).toEqual([]);
    fx.update(GAME_FRAME_DT / 2, null); expect(heard).toEqual([]);
    fx.update(GAME_FRAME_DT, null);
    expect(heard).toEqual([{name: '.DEFAULT', at: [100, 20, -300]}]);
    fx.update(1, null); expect(heard).toHaveLength(1);
  });
  it('lets a zero-muzzle round fall under its record gravity before Timer1 expires', () => {
    const data = fixtureData(-1);
    data.scriptWeapons![0]!.gravity = 98;
    const heard: number[][] = [];
    const fx = new Effects(() => 0.5, (_name, at) => heard.push(at));
    fx.setData(data); fx.play('start', {node: new Matrix4().makeTranslation(0, 20, 0)}); fx.update(0, null);
    // Timer1=.1 expires on frame 3; symplectic Euler traverses g*dt^2*(1+2+3), then the next frame emits.
    fx.update(3 * GAME_FRAME_DT, null); expect(heard).toEqual([]);
    fx.update(GAME_FRAME_DT, null);
    expect(heard).toHaveLength(1);
    expect(heard[0]![1]).toBeCloseTo(20 - 98 * GAME_FRAME_DT ** 2 * 6, 8);
  });
  it('uses Timer1 for -1 and pauses without advancing a pending blast', () => {
    const fx = new Effects(); fx.setData(fixtureData(-1));
    fx.play('start', {node: new Matrix4()}); fx.update(0, null);
    fx.paused = true; fx.update(3, null); expect(fx.stats().played.burst).toBeUndefined();
    fx.paused = false; fx.update(3 * GAME_FRAME_DT, null); expect(fx.stats().played.burst).toBeUndefined();
    fx.update(2 * GAME_FRAME_DT, null); expect(fx.stats().played.burst).toBe(1);
  });
  for (const reset of ['reset', 'map'] as const) it(`${reset} clears pending rounds`, () => {
    const fx = new Effects(); fx.setData(fixtureData());
    fx.play('start', {node: new Matrix4()}); fx.update(0, null);
    if (reset === 'reset') fx.reset(); else fx.setData(fixtureData());
    fx.update(1, null); expect(fx.stats().played.burst).toBeUndefined();
  });

  for (const [height, variant, expected] of [[0, true, '.STONE'], [10, true, '.DEFAULT'], [0, false, '.DEFAULT']] as const) {
    it(`selects the ground variant at height ${height}, variant present ${variant}`, () => {
      const poly: WorldPoly = { modelName: 'worldmodel', path: 'worldmodel/deck', region: 0, ditype: 2, material: 0, ptcount: 4, cameratype: 0,
        points: Float32Array.from([-100, 0, -100, 100, 0, -100, 100, 0, 100, -100, 0, 100]) };
      const grid = buildGrid({ atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 }, [], [], [poly],
        [{ modelName: 'worldmodel', path: 'worldmodel/deck0', first: 0, count: 1 }]);
      const data = fixtureData(); if (!variant) data.programs.pop();
      const heard: string[] = []; const fx = new Effects(() => 0.5, name => heard.push(name));
      fx.setData(data); fx.setWorld(() => grid);
      fx.play('start', {node: new Matrix4().makeTranslation(0, height, 0)}); fx.update(0, null); fx.update(3 * GAME_FRAME_DT, null);
      expect(heard).toEqual([expected]);
    });
  }
  it('adds flagged local offset/context position before transforming through the caller node', () => {
    const data = fixtureData(); const op = data.programs[0]!.sequences[0]!.ops[0]!;
    if (op.op !== 'fireWeapon') throw Error('fixture');
    op.offset = [1, 2, 3]; op.atContext = true;
    const heard: number[][] = []; const fx = new Effects(() => 0.5, (_name, at) => heard.push(at));
    fx.setData(data); fx.play('start', {node: new Matrix4().makeTranslation(100, 20, 300), position: [4, 5, 6]});
    fx.update(0, null); fx.update(3 * GAME_FRAME_DT, null);
    expect(heard).toEqual([[105, 27, 309]]);
  });
  it('never substitutes an effect for a missing weapon, wrong ammo, moving round or absent caller node', () => {
    for (const kind of ['missing', 'ammo', 'moving', 'node']) {
      const data = fixtureData();
      if (kind === 'missing') data.scriptWeapons = [];
      if (kind === 'ammo') data.scriptWeapons![0]!.ammo = 'different';
      if (kind === 'moving') data.scriptWeapons![0]!.muzzleVelocity = 1;
      const fx = new Effects(); fx.setData(data);
      fx.play('start', kind === 'node' ? {} : {node: new Matrix4()}); fx.update(0, null); fx.update(1, null);
      expect(fx.stats().played.burst).toBeUndefined();
    }
  });
});
