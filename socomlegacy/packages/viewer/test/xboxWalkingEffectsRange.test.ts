import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Matrix4, Mesh, PerspectiveCamera } from 'three';
import { FsAssetSource } from '@s2u/archive/node';
import { fixture } from '../../archive/test/fixtures';
import { effectsFromDisc } from '../src/effectData';
import { walkingEffects } from '../src/xboxPrototype/walkingEffects';

const FIXTURES = resolve(process.env.S2U_TEST_FIXTURES || resolve(dirname(fileURLToPath(import.meta.url)), '../../../test-fixtures'));
const MP2 = fixture('RUN/MP2.ZDB');

// A batch made for particles that all fade out in its first frame was left visible with no draw range (the raw pass
// refused it on the console, 2026-11-19: 'Unsupported particle draw range'); it is hidden until a frame fills it.
describe.skipIf(!MP2)('every visible particle batch has a whole draw range', () => {
  it('under slow frames, many weapons, body hits and round ends', async () => {
    const d = await effectsFromDisc(new FsAssetSource(FIXTURES), 'RUN/MP2.ZDB', 'MP2');
    let r = 7; const random = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    const light = walkingEffects({ data: d, grid: () => null, hull: () => null, feet: () => null, projectionAspect: null, random, sound: () => {} });
    const view = new PerspectiveCamera(49, 640 / 448, 1, 5000); view.position.set(0, 14, -30); view.lookAt(0, 6, 20); view.updateMatrixWorld();
    const muzzles = d.programs.map(p => p.name).filter(n => /^muzzle_/i.test(n) && !/_zoom$/i.test(n));
    const node = new Matrix4().makeTranslation(0, 12, 0);
    const bad: string[] = [];
    for (let step = 0; step < 3000 && bad.length < 5; step++) {
      const dt = [0.1, 0.033, 0.066, 0.016][step % 4]!;
      for (let k = 0; k < 3; k++) {
        const fireAnim = muzzles[Math.floor(random() * muzzles.length)]!;
        light.onRound({ type: 'round', weapon: { name: 'X', id: 0, fireAnim, sounds: { close: null, med: null, far: null, reload: null } },
          from: [0, 12, 0], to: [random() * 300 - 150, random() * 20, random() * 300], hit: true, rounds: 0, normal: [0, 1, 0],
          material: 1 + Math.floor(random() * (d.materials.length - 1)), ...(step % 4 === 0 ? { tracer: true as const, tracerKind: 'enemy' as const } : {}) },
          { node, muzzle: [7.8, 0.8, 0] }, false);
      }
      if (step % 700 === 699) light.clearRound();
      view.position.set(random() * 100 - 50, 14, random() * 100 - 80); view.lookAt(0, 6, 20); view.updateMatrixWorld();
      light.update(dt, view);
      for (const child of light.object.children) {
        if (!(child instanceof Mesh) || !child.visible) continue;
        const { start, count } = child.geometry.drawRange;
        if (start !== 0 || !Number.isInteger(count) || count % 6 !== 0) bad.push(`step ${step} ${child.name} start ${start} count ${count} particles ${light.stats().particles}`);
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});
