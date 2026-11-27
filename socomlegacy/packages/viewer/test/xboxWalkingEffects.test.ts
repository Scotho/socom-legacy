import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { buildGrid, type CollisionOwner, type GridParams, type WorldPoly } from '@s2u/scene';
import { fixture, FIXTURES_ABSENT } from '../../archive/test/fixtures';
import { effectsFromDisc, type EffectData } from '../src/effectData';
import { Effects } from '../src/effects';
import { walkingEffects } from '../src/xboxPrototype/walkingEffects';

/**
 * The lightweight match's effects (`../src/xboxPrototype/walkingEffects`) against the production runner (`../src/effects`)
 * on the game's own data: the same rounds with the same draws start the same animations, emit the same particles and
 * play the same sounds, tick for tick -- what the lightweight one leaves undrawn (models, lights) it counts.
 */
const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

function deck(material: number) {
  const poly: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/deck', region: 0, ditype: 2, material, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-100, 0, 100, 100, 0, 100, 100, 0, -100, -100, 0, -100]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 100, cellsX: 4, cellsZ: 4, originX: -200, originZ: -200 };
  const owners: CollisionOwner[] = [{ modelName: 'worldmodel', path: 'worldmodel/deck0', first: 0, count: 1 }];
  return buildGrid(params, [], [], [poly], owners);
}

describe.skipIf(!MP2)(`the lightweight effects on the game's data${MP2 ? '' : ` (${FIXTURES_ABSENT})`}`, () => {
  let data: EffectData | null = null;
  const load = async (): Promise<EffectData> => (data ??= await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2'));
  const M4A1 = { name: 'M4A1', id: 0, fireAnim: 'muzzle_m4', sounds: { close: null, med: null, far: null, reload: null } };
  const round = (k: number) => ({
    type: 'round' as const, weapon: M4A1, from: [0, 12, 0] as [number, number, number], to: [k % 50, 0, 20] as [number, number, number],
    hit: true, rounds: 0, normal: [0, 1, 0] as [number, number, number], material: 25,
    ...(k % 4 === 0 ? { tracer: true as const, tracerKind: 'ally' as const } : {}),
  });
  const seeded = () => { let r = 1; return () => ((r = (r * 9301 + 49297) % 233280) / 233280); };
  const camera = () => { const c = new PerspectiveCamera(49, 640 / 448, 1, 5000); c.position.set(0, 14, -30); c.lookAt(0, 6, 20); c.updateMatrixWorld(); return c; };

  it('the same rounds emit the same particles and play the same sounds as the production runner, tick for tick', async () => {
    const d = { ...(await load()), ambient: [] }, grid = deck(25), node = new Matrix4().makeTranslation(0, 12, 0);
    const heardFull: string[] = [], heardLight: string[] = [];
    const full = new Effects(seeded(), (name, at, volume) => { heardFull.push(`${name}@${at.map(v => v.toFixed(3))}*${volume.toFixed(3)}`); });
    full.setData(d); full.setWorld(() => grid);
    const light = walkingEffects({ data: d, grid: () => grid, hull: () => grid, feet: () => null, projectionAspect: null, random: seeded(),
      sound: (name, at, volume) => { heardLight.push(`${name}@${at.map(v => v.toFixed(3))}*${volume.toFixed(3)}`); } });
    const view = camera(); let drawnVertices = 0;
    for (let step = 0; step < 240; step++) {
      if (step % 6 === 0 && step < 120) {
        full.onRound(round(step / 6), { node, muzzle: [7.8, 0.8, 0] }, false);
        light.onRound(round(step / 6), { node, muzzle: [7.8, 0.8, 0] }, false);
      }
      full.update(1 / 60, view); light.update(1 / 60, view);
      const a = full.stats(), b = light.stats();
      drawnVertices = Math.max(drawnVertices, light.meshes.vertexCount);
      // A frame with a model shown in the production scene draws triangles here too, and none without one.
      expect(light.meshes.vertexCount > 0, `models at step ${step}`).toBe(a.shown.length > 0);
      expect([b.emitted, b.particles, b.sources, b.runs, b.tracers, b.bounces], `step ${step}`).toEqual([a.emitted, a.particles, a.sources, a.runs, a.tracers.length, a.bounces]);
    }
    const a = full.stats(), b = light.stats();
    expect(b.emitted).toBeGreaterThan(0);
    expect(b.played).toEqual(a.played);
    expect(heardLight).toEqual(heardFull);
    expect(heardLight.length).toBeGreaterThan(0);
    // The flashes' and casings' models are drawn from their packets; what it does not draw (the muzzle's lights), it counts.
    expect(b.models.copies).toBeGreaterThan(0);
    expect(drawnVertices).toBeGreaterThan(0);
    expect(b.models.dropped).toBe(0);
    expect(b.omitted.lights).toBeGreaterThan(0);
    light.dispose(); full.setData(null);
  });

  it('a round\'s end stops the rounds\' runs and clears every particle; the ambient runs stay', async () => {
    const d = await load(), grid = deck(25), node = new Matrix4().makeTranslation(0, 12, 0);
    const light = walkingEffects({ data: d, grid: () => grid, hull: () => grid, feet: () => null, projectionAspect: null, random: seeded(), sound: () => {} });
    const view = camera(), ambient = light.stats().runs;
    for (let k = 0; k < 20; k++) light.onRound(round(k), { node, muzzle: [7.8, 0.8, 0] }, false);
    for (let step = 0; step < 6; step++) light.update(1 / 60, view);
    expect(light.stats().runs).toBeGreaterThan(ambient);
    light.clearRound();
    expect(light.stats().tracers).toBe(0);
    expect(light.stats().particles).toBe(0);
    expect(light.stats().runs).toBeLessThanOrEqual(ambient);
    light.dispose();
  });
});
