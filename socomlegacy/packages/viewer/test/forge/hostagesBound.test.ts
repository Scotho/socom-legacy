import { describe, expect, it } from 'vitest';
import type { EscorteeStart } from '@s2u/scene';
import { HOSTAGE_ID_BASE, HOSTAGE_SLOTS } from '../../../match/src/extraction';
import { emptyLayout, type ForgeGameType, type HostageMarker, type Layout } from '../../src/forge/layout';
import { floorAiMaps } from '../../src/forge/floorAi';
import { floorGround } from '../../src/forge/ground';
import { hostagesLeftNotes, withPlacedHostages } from '../../src/forge/hostages';
import { checkMap } from '../../src/forge/validate';

/**
 * The combined hostage count is bounded by the room's body ids (a browser adaptation, FG.R2): the room numbers hostages
 * from `HOSTAGE_ID_BASE` (240) and the snapshot writes a body id as a u8, so 16 fit (240..255). The base map's escortees
 * come first; a placed one past the bound is left out and counted, never given an id that wraps onto a player's.
 */
const ai = floorAiMaps(8000);
const escortee = (n: number): EscorteeStart => ({ name: `Hostage${n}`, character: 'mp_fem1', loc: { map: 0, x: 0, z: 0 }, at: [0, 0, 0], yaw: 0, team: 3 });
const base = (n: number) => ({ ai, escortees: Array.from({ length: n }, (_, i) => escortee(i + 1)) });
const placed: HostageMarker[] = [{ p: [100, 0, 100], yaw: 0 }, { p: [200, 0, 100], yaw: 0 }, { p: [300, 0, 100], yaw: 0 }];

describe('placed hostages: the room\'s 16 body ids', () => {
  it('the bound is the u8 ids past HOSTAGE_ID_BASE', () => {
    expect(HOSTAGE_SLOTS).toBe(256 - HOSTAGE_ID_BASE);
    expect(HOSTAGE_SLOTS).toBe(16);
  });

  it('15 escortees + 3 placed: 1 added, 2 unplaced, every index below the bound', () => {
    const h = withPlacedHostages(base(15), placed);
    expect(h.map.escortees!.length - 15).toBe(1);
    expect([h.unplaced, h.pastBound, h.offGrid]).toEqual([2, 2, 0]);
    h.map.escortees!.forEach((_, i) => expect(HOSTAGE_ID_BASE + i).toBeLessThan(256));
  });

  it('16 escortees already: none added, all 3 unplaced', () => {
    const h = withPlacedHostages(base(16), placed);
    expect([h.map.escortees!.length, h.unplaced, h.pastBound, h.offGrid]).toEqual([16, 3, 3, 0]);
  });

  it('14 escortees + 3 placed, one off the grid: 2 added, the one off the grid counted as such, none past the bound', () => {
    const h = withPlacedHostages(base(14), [placed[0]!, { p: [6000, 0, 0], yaw: 0 }, placed[1]!]);
    expect([h.map.escortees!.length, h.unplaced, h.offGrid, h.pastBound]).toEqual([16, 1, 1, 0]);
  });

  it('the Play notice words each case', () => {
    expect(hostagesLeftNotes(1, 0)).toEqual(['1 hostage off the AI grid, left out']);
    expect(hostagesLeftNotes(0, 2)).toEqual(["2 hostages past the room's 16, left out"]);
    expect(hostagesLeftNotes(2, 1)).toEqual(['2 hostages off the AI grid, left out', "1 hostage past the room's 16, left out"]);
    expect(hostagesLeftNotes(0, 0)).toEqual([]);
  });

  it('the normal case is unchanged', () => {
    const h = withPlacedHostages(base(1), placed);
    expect([h.map.escortees!.length, h.unplaced]).toEqual([4, 0]);
  });

  it('Check names the hostages past the room\'s 16', () => {
    const at = (gameType: ForgeGameType, baseHostages: number, hostages: HostageMarker[] = placed): string[] => {
      const l: Layout = { ...emptyLayout({ kind: 'blank', library: 'floor' }), objectives: { gameType }, hostages };
      return checkMap(l, floorGround(2000), [], undefined, undefined, { hostages: baseHostages, zones: 1, safety: true, ai }).issues
        .filter((i) => i.kind === 'hostage-bound').map((i) => i.text);
    };
    expect(at(4, 15)).toEqual(['2 hostages past the room\'s 16: they are left out of Play.']);
    expect(at(3, 16)).toEqual(['3 hostages past the room\'s 16: they are left out of Play.']);
    expect(at(4, 13)).toEqual([]);
    expect(at(2, 16)).toEqual([]);
    // Check counts as Play places: one with no AI cell under it takes no slot (14 + 3, one off the grid: none past).
    expect(at(4, 14, [placed[0]!, { p: [6000, 0, 0], yaw: 0 }, placed[1]!])).toEqual([]);
  });
});
