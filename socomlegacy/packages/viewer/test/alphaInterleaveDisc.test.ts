// @vitest-environment node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Mesh, PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import type { ParticleSource } from '@s2u/scene';
import { loadMap } from '../src/loadMap';
import { buildWorld } from '../src/world';
import { ParticleSystem, PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION } from '../src/particles';
import { alphaItemOrder } from '../src/alphaInterleave';

/**
 * LATER 593 on the maps the water-look report names (INV-WATER-LOOK F1-F3): The Ruins (MP12) and Night Stalker (MP7),
 * at `e2e/waterLook.spec.ts`'s poses. Off the dev disc (`SOCOM_DISC`, else `<SOCOM_PC_ROOT>/game/disc`; skipped -- and
 * said so -- without it). It measures what the per-frame order costs: the alpha pass's items (and how many are
 * instanced draws of several placements, one key for them all: `ALPHA_INSTANCED_KEY_ADAPTATION`), the time to number
 * them and to key them for the particles, and the batches a field of rain over the water takes; and it holds that every
 * item has its own number in [1, 2) and every alpha-pass reflection follows its base before any other draw.
 */
const PC_ROOT = process.env.SOCOM_PC_ROOT ? resolve(process.env.SOCOM_PC_ROOT) : null;
const DISC = process.env.SOCOM_DISC ? resolve(process.env.SOCOM_DISC) : PC_ROOT ? join(PC_ROOT, 'game', 'disc') : '';

type V3 = [number, number, number];
/** The spec's poses (eye, look-at) over each map's water, and the water's height and extent there. */
const POSES: Record<string, { eye: V3; at: V3 }[]> = {
  MP12: [
    { eye: [1200, 68, 1200], at: [1200, 55, 1480] }, { eye: [920, 58, 1890], at: [1250, 43, 1900] },
    { eye: [1200, 64, 1250], at: [1203, 55, 1272] }, { eye: [1100, 120, 2060], at: [1100, 43, 1800] },
    { eye: [1350, 70, 1860], at: [1350, 48, 1700] }, { eye: [1200, 66, 1280], at: [1200, 55, 1340] },
  ],
  MP7: [
    { eye: [1525, 62, 1740], at: [1530, 47, 1700] }, { eye: [1525, 80, 1900], at: [1525, 47, 1700] },
    { eye: [1525, 58, 1700], at: [1527, 47, 1690] }, { eye: [1525, 140, 1950], at: [1525, 47, 1700] },
    { eye: [1700, 70, 1700], at: [1525, 47, 1700] }, { eye: [1525, 60, 1760], at: [1525, 47, 1700] },
  ],
};
/** A rain field: drops over the water's extent at its height (MP12's sectors at y 55, MP7's pool at y 47). */
const RAIN: Record<string, { min: [number, number]; max: [number, number]; y: number }> = {
  MP12: { min: [1170, 1170], max: [1530, 1530], y: 56 },
  MP7: { min: [1440, 1632], max: [1610, 1763], y: 48 },
};

/** One drop that lives the whole probe (`walkDecalOrder.test.ts`'s source, placed by its node). */
function drop(): ParticleSource {
  return {
    flagsA: 0x3, flagsB: 0, name: 'drop', setActive: true, node: -6, follow: false, perEvent: 1, events: 1, interval: 0.01,
    perDistance: false, type: 2, streak: null, spin: null, offset: [0, 0, 0], baseVelocity: [0, 0, 0], worldVelocity: [0, 0, 0],
    baseFrom: 'fixed', worldFrom: 'fixed', baseScale: 0, worldScale: 0, baseUnit: false, worldUnit: false, atContext: false,
    atNode: true, positionBlock: null, randomVelocity: [[0, 0], [0, 0], [0, 0]], box: [[0, 0], [0, 0], [0, 0]], accel: [0, 0, 0],
    friction: 0, size: [1, 1], startAge: [0, 0], lifetime: [100, 100], nearFade: null, farFade: null, textures: [], textureMode: 'first',
    texture: 'ring.tif', colours: [[0, 0.5, 0.5, 0.5, 1], [1, 0.5, 0.5, 0.5, 1]], scales: [],
  };
}

describe.skipIf(DISC === '')('LATER 593 on the dev disc: the alpha pass and the particles at the water poses (skipped without SOCOM_DISC)', () => {
  for (const stem of ['MP12', 'MP7']) {
    it(`${stem}: every item of the pass at its own number in [1, 2), each reflection right after its base; the cost`, async () => {
      const file = join(DISC, 'RUN', `${stem}.ZDB`);
      expect(existsSync(file), `${file} on the dev disc`).toBe(true);
      const map = await loadMap(new FsAssetSource(DISC), `RUN/${stem}.ZDB`);
      const view = buildWorld(map);
      for (const task of [...view.revealWorld, ...view.revealProps]) task();
      const meshes: Mesh[] = [];
      view.group.traverse((o) => { if (o instanceof Mesh) meshes.push(o); });
      const camera = new PerspectiveCamera(50, 4 / 3, 1, 10000);
      const pose = (p: { eye: V3; at: V3 }) => { camera.position.set(...p.eye); camera.lookAt(...p.at); camera.updateMatrixWorld(); };
      pose(POSES[stem]![0]!);
      view.frame(camera, 0);
      // The pass: what `frame` numbered in [1, 2) -- the bases, not their passes (named ' (env)' / ' (detail)').
      const items = meshes.filter((m) => !/ \((env|detail)\)$/.test(m.name) && m.renderOrder >= 1 && m.renderOrder < 2);
      const n = items.length;
      const instanced = items.filter((m) => m instanceof InstancedMesh && m.count > 1).length;
      const envs = meshes.filter((m) => m.name.endsWith(' (env)') && m.parent instanceof Mesh && items.includes(m.parent));
      // The pass's numbers from one frame to the next under the poses: each its own, each reflection after its base and
      // before the next item, the particles' slots between.
      const orders = items.map((m) => m.renderOrder).sort((a, b) => a - b);
      for (const p of POSES[stem]!) {
        pose(p);
        view.frame(camera, 0);
        const now = items.map((m) => m.renderOrder).sort((a, b) => a - b);
        expect(now).toEqual(orders);                     // a permutation of the same numbers: one per rank
        expect(new Set(now).size).toBe(n);
        for (const env of envs) {
          const base = env.parent as Mesh;
          const next = Math.min(...items.map((m) => m.renderOrder).filter((o) => o > base.renderOrder), 2);
          expect(env.renderOrder, `${stem} ${env.name}`).toBeGreaterThan(base.renderOrder);
          expect(env.renderOrder, `${stem} ${env.name}`).toBeLessThan(next);
        }
      }
      expect(orders[0]).toBe(alphaItemOrder(0, n));
      // The cost: `frame` with its numbering, and the particles' keys, averaged over a pose sweep.
      const frames = 200;
      let t0 = performance.now();
      for (let i = 0; i < frames; i++) { pose(POSES[stem]![i % POSES[stem]!.length]!); view.frame(camera, 0); }
      const frameMs = (performance.now() - t0) / frames;
      t0 = performance.now();
      for (let i = 0; i < frames; i++) view.alphaPass!.keys(camera.position);
      const keysMs = (performance.now() - t0) / frames;
      // A rain field of 600 drops over the water, seen from each pose: the batches it takes.
      const ps = new ParticleSystem(() => 0.5);
      ps.setAlphaPass(view.alphaPass ?? null);
      const r = RAIN[stem]!;
      for (let i = 0; i < 600; i++) {
        const x = r.min[0] + ((i * 37) % 600) / 600 * (r.max[0] - r.min[0]), z = r.min[1] + ((i * 113) % 600) / 600 * (r.max[1] - r.min[1]);
        ps.emit(drop(), new Matrix4().makeTranslation(x, r.y, z), {}, `drop${i}`, () => true);
      }
      ps.update(0.01, camera);                           // the first tick records each source's place
      ps.update(0.01, camera);                           // the second emits its one drop
      expect(ps.count()).toBe(600);
      const batches: number[] = [];
      let drawMs = 0;
      for (const p of POSES[stem]!) {
        pose(p);
        view.frame(camera, 0);
        t0 = performance.now();
        ps.update(0.001, camera);
        drawMs += performance.now() - t0;
        batches.push(ps.object.children.filter((c) => c.visible).length);
      }
      console.log(`${stem}: alpha items ${n} (instanced of several placements ${instanced}), alpha-pass reflections ${envs.length}; `
        + `frame ${frameMs.toFixed(3)} ms, keys ${keysMs.toFixed(4)} ms; 600 drops: batches per pose ${batches.join(',')}, `
        + `update+draw ${(drawMs / POSES[stem]!.length).toFixed(3)} ms`);
      expect(n).toBeGreaterThan(0);
      for (const b of batches) expect(b).toBeLessThanOrEqual(PARTICLE_BUCKETS_PER_TEXTURE_ADAPTATION);
    }, 120_000);
  }
});
