import { describe, expect, it } from 'vitest';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { floorGround } from '../../src/forge/ground';
import { checkMap, type DiscSpawn } from '../../src/forge/validate';

/**
 * Check map: each side has at least one spawn (a browser adaptation, FG.R2) -- the layout's markers, or on a map base
 * with none placed the disc's slots (what the server plays) -- each side with none said.
 */
const blank = (spawns: Layout['spawns']): Layout => ({ ...emptyLayout({ kind: 'blank', library: 'floor' }), spawns });
const none = (l: Layout, disc?: DiscSpawn[]) => checkMap(l, floorGround(2000), [], undefined, disc).issues
  .filter((i) => i.kind === 'spawn-none').map((i) => i.text);

describe('checkMap: a spawn a side', () => {
  it('names each side with no spawn', () => {
    expect(none(blank([]))).toEqual([
      'There is no SEAL spawn: place one with the Spawn SEAL tool.',
      'There is no Terrorist spawn: place one with the Spawn Terrorist tool.',
    ]);
    expect(none(blank([{ team: 'A', p: [0, 0, 0], yaw: 0 }]))).toEqual([
      'There is no Terrorist spawn: place one with the Spawn Terrorist tool.',
    ]);
  });

  it('a spawn each side, or a map base\'s disc slots with none placed, is no issue', () => {
    expect(none(blank([{ team: 'A', p: [0, 0, 0], yaw: 0 }, { team: 'B', p: [50, 0, 0], yaw: 0 }]))).toEqual([]);
    const map: Layout = { ...emptyLayout({ kind: 'map', archive: 'mp01' }), spawns: [] };
    expect(none(map, [{ side: 0, at: [0, 0, 0] }, { side: 1, at: [50, 0, 0] }])).toEqual([]);
  });
});
