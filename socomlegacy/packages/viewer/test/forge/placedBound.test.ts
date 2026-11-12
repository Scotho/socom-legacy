import { describe, expect, it } from 'vitest';
import { FORGE_PLACED_MAX_ADAPTATION } from '@s2u/creator-contracts';
import { emptyLayout, type Layout } from '../../src/forge/layout';
import { floorGround } from '../../src/forge/ground';
import { checkMap } from '../../src/forge/validate';

/**
 * FP-1a, Codex P1 on #745 (a browser adaptation's warning, FG.R2): the page's Check says a placed kind past the record's
 * marker bound (`FORGE_PLACED_MAX_ADAPTATION`, 48) before Play or a lobby -- the lobby refuses it
 * (`central/test/forgePlacedBound.test.ts`). Counts only.
 */
const door = (i: number) => ({ source: 'MP2', name: 'bdoor_4', at: [i, 0, 0] as [number, number, number], yaw: 0 });
const rows = (extra: Partial<Layout>): string[] => {
  const l: Layout = { ...emptyLayout({ kind: 'blank', library: 'floor' }), ...extra };
  return checkMap(l, floorGround(2000), []).issues.filter((i) => i.kind === 'placed-bound').map((i) => i.text);
};

describe("Check: each placed kind's bound", () => {
  it('green at the bound, red one past it, the kind named', () => {
    const n = FORGE_PLACED_MAX_ADAPTATION;
    expect(rows({ barriers: Array.from({ length: n }, (_, i) => door(i)) })).toEqual([]);
    expect(rows({ barriers: Array.from({ length: n + 1 }, (_, i) => door(i)) })).toEqual(['49 barriers: a layout holds at most 48; a lobby refuses it.']);
    expect(rows({
      respawns: Array.from({ length: n + 2 }, (_, i) => ({ team: 'A' as const, p: [i, 0, 0] as [number, number, number], yaw: 0 })),
      doors: Array.from({ length: n + 1 }, (_, i) => door(i)),
    })).toEqual(['50 respawn points: a layout holds at most 48; a lobby refuses it.', '49 doors: a layout holds at most 48; a lobby refuses it.']);
  });
});
