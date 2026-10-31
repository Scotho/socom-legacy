import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsAssetSource } from '@s2u/archive/node';
import { describe, expect, it } from 'vitest';
import { loadSimMap } from '../src/simMap';
import { RegionCull } from '../src/regionCull';

const disc = process.env.SOCOM_DISC;
describe.skipIf(!disc || !existsSync(resolve(disc, 'RUN/MP72.ZDB')))('Crossroads CPU visibility regression (dev disc)', () => {
  it('draws the initially seated players on each side from a fresh camera', async () => {
    const map = await loadSimMap(new FsAssetSource(disc!), 'RUN/MP72.ZDB');
    expect(map.slots.length).toBeGreaterThan(0);
    for (const side of [0, 1] as const) {
      const viewed = map.slots.find(s => s.side === side)!.position;
      const sameSide = map.slots.filter(s => s.side === side);
      const cull = new RegionCull();
      cull.frame(map.grid, {
        viewed, eye: [viewed[0], viewed[1] + 20, viewed[2]], spectator: false,
        bodies: sameSide.map((s, id) => ({ id, feet: s.position })),
      });
      for (const [id, slot] of sameSide.entries()) {
        expect(cull.drawn(id), `side ${side}, slot ${slot.index}, mask ${cull.mask}`).toBe(true);
      }
    }
  });
});
