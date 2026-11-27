import { describe, expect, it } from 'vitest';
import { buildGrid, type Grid, type GridParams, type WorldPoly } from '@s2u/scene';
import { GrenadeThrower } from '../src/grenade';
import type { PlaySnapshot } from '../src/walk';

/**
 * WM-17 (LATER 772; the main controller's ruling (a'), 2026-11-15; product track, a renderer warm-up's trigger): the
 * page reads whether a flashbang is in the air -- a live Mark141, the page's own or another's, thrown and not yet gone
 * off (flight or rest) -- and while it is, the renderer brings the drawn bodies' glow compiles forward
 * (`ViewerRenderer.promoteGlow`), so the flash after the fuse builds none in its frame. A read only: it changes nothing
 * the grenades do.
 */

const snap = (): PlaySnapshot => ({
  feet: [100, 50, 200], yaw: 0, pitch: 0, vx: 0, vz: 0, vy: 0, airborne: false, crouched: false, stance: 'stand',
  landing: null, jumps: 0,
} as PlaySnapshot);
const floor = (): Grid => {
  const f: WorldPoly = {
    modelName: 'worldmodel', path: 'worldmodel/f', region: 0, ditype: 3, material: 7, ptcount: 4, cameratype: 0,
    points: Float32Array.from([-2000, 50, 2000, 2000, 50, 2000, 2000, 50, -2000, -2000, 50, -2000]),
  };
  const params: GridParams = { atomCount: 8192, posts: 16, cellDim: 500, cellsX: 8, cellsZ: 8, originX: -2000, originZ: -2000 };
  return buildGrid(params, [], [], [f], [{ modelName: 'worldmodel', path: 'worldmodel/f0', first: 0, count: 1 }]);
};
const run = (u: { update(dt: number): void }, seconds: number): void => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) u.update(1 / 60); };

function thrower(): { g: GrenadeThrower; events: string[] } {
  const events: string[] = [];
  const grid = floor();
  const g = new GrenadeThrower({ grid: () => grid, snapshot: snap, view: () => 'third', handPoint: () => [102, 62, 192] });
  g.on('explode', (e) => events.push(`explode ${e.item}`));
  return { g, events };
}

describe('WM-17: `GrenadeThrower.flashInAir` -- a flashbang thrown and not yet gone off', () => {
  it('none at first; another player\'s Mark141 in flight and at rest; none once it has gone off', () => {
    const { g, events } = thrower();
    expect(g.flashInAir()).toBe(false);
    g.launchRemote('Mark141', [300, 80, 200], [50, 30, 0]);
    expect(g.flashInAir()).toBe(true);
    run(g, 1.0);                                          // the fuse is 1.5 s (the disc's Mark141)
    expect(events.filter((e) => e.startsWith('explode'))).toEqual([]);
    expect(g.flashInAir()).toBe(true);
    run(g, 1.0);
    expect(events.filter((e) => e.startsWith('explode'))).toEqual(['explode Mark141']);
    expect(g.flashInAir()).toBe(false);
  });

  it('another grenade in the air is not a flashbang', () => {
    const { g } = thrower();
    g.launchRemote('M67', [300, 80, 200], [50, 30, 0]);
    expect(g.flashInAir()).toBe(false);
  });
});
