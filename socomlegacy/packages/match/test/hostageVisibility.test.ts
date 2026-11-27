import { describe, expect, it } from 'vitest';
import type { AiLoc } from '@s2u/scene';
import type { HostageProbeCell } from '../src/hostagePath';
import { HOSTAGE_DANGER_VISIBILITY_READING, navVisibility, type VisibilityNav } from '../src/hostageVisibility';

/**
 * LATER 1245 (research 445 s3; simulation track, reading, pending review): the hostage's danger visibility as the
 * original's -- `FUN_00538d10` (D:L403738-403775): the eye 18 over the hostage's cell, a walk over the AI navigation grid
 * toward the object (`FUN_005352d0` D:L401979-402107, the end cell counted) accumulating occlusion: `LAB_005390d0`
 * (machine code 0x5390d0-0x539234: a cell of kind 0, 8 or 10 occludes whole) and `FUN_00539240` (D:L403883-403932: a
 * floor above the line occludes whole; past 30 u, kinds 12 / 4 / 5 add 0.35 / 0.5 / 0.85 within 15 / 18 / 20 u of
 * their floor); visibility = 1 - clamp(occlusion, 0, 1), 0 for a failed walk. Here a fake grid feeds the walk.
 */

const L = (x: number): AiLoc => ({ map: 0, x, z: 0 });
/** A straight walk of cells 0..n-1, each with its kind, floor height and distance along the line. */
function nav(cells: { kind: number; floor: number; flag?: boolean }[], length = 100, eyeFloor = 0): VisibilityNav {
  return {
    point: () => [0, eyeFloor, 0],
    worldProbeCells: (_from, _to, visit) => {
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i]!, fraction = cells.length === 1 ? 1 : i / (cells.length - 1);
        const word = (c.kind & 31) | (c.flag ? 1 << 25 : 0);
        const s: HostageProbeCell = { loc: L(i), word, previousWord: null, distance: fraction * length, fraction, direction: [1, 0, 0], height: c.floor };
        if (!visit(s)) return false;
      }
      return true;
    },
  };
}
const target = (y: number): [number, number, number] => [100, y, 0];
const R = HOSTAGE_DANGER_VISIBILITY_READING;

describe('LATER 1245: the danger visibility walks the navigation grid (FUN_00538d10)', () => {
  it('the readings: the eye 18 up, the 0.2-cell step, the cover past 30 u by kind', () => {
    expect(R.eye).toBe(18);
    expect(R.cover).toEqual({ minDistance: 30, kinds: { 12: { within: 15, add: 0.35 }, 4: { within: 18, add: 0.5 }, 5: { within: 20, add: 0.85 } } });
  });

  it('open, level cells all the way: fully visible', () => {
    expect(navVisibility(nav(Array.from({ length: 6 }, () => ({ kind: 1, floor: 0 }))), L(0), target(5))).toBe(1);
  });

  it('a blocked cell (kind 0, 8 or 10) anywhere on the walk, the end cell included: hidden', () => {
    for (const kind of [0, 8, 10]) {
      expect(navVisibility(nav([{ kind: 1, floor: 0 }, { kind, floor: 0 }, { kind: 1, floor: 0 }]), L(0), target(5)), `kind ${kind}`).toBe(0);
      expect(navVisibility(nav([{ kind: 1, floor: 0 }, { kind: 1, floor: 0 }, { kind, floor: 0 }]), L(0), target(5)), `end ${kind}`).toBe(0);
    }
    expect(navVisibility(nav([{ kind: 1, floor: 0 }, { kind: 9, floor: 0 }, { kind: 1, floor: 0 }]), L(0), target(5))).toBe(1);   // 9 does not occlude here
  });

  it('a floor above the line hides it, unless the cell is flagged (byte 3 bit 1)', () => {
    const hill = [{ kind: 1, floor: 0 }, { kind: 1, floor: 40 }, { kind: 1, floor: 0 }];
    expect(navVisibility(nav(hill), L(0), target(0))).toBe(0);
    expect(navVisibility(nav([{ kind: 1, floor: 0 }, { kind: 1, floor: 40, flag: true }, { kind: 1, floor: 0 }]), L(0), target(0))).toBe(1);
  });

  it('low cover past 30 u: a kind-5 cell with the line within 20 u of its floor takes 0.85 (visible 0.15, under the 0.25 the scan asks)', () => {
    const v = navVisibility(nav([{ kind: 1, floor: 0 }, { kind: 1, floor: 0 }, { kind: 5, floor: 5 }, { kind: 1, floor: 0 }], 100), L(0), target(18));
    expect(v).toBeCloseTo(0.15, 6);
    // before 30 u the cover counts nothing
    const near = navVisibility(nav([{ kind: 5, floor: 5 }, { kind: 1, floor: 0 }], 20), L(0), target(18));
    expect(near).toBe(1);
  });

  it('a bit-7 cell whose marker is type 1 or 7 (the door types, as loaded) occludes whole; another type does not (the review F3)', () => {
    const marked = (type: number): VisibilityNav => {
      const base = nav([{ kind: 1, floor: 0 }, { kind: 1, floor: 0 }, { kind: 1, floor: 0 }]);
      return {
        ...base,
        markerType: (loc) => (loc.x === 1 ? type : null),
        worldProbeCells: (from, to, visit) => base.worldProbeCells(from, to, (s) => visit(s.loc.x === 1 ? { ...s, word: s.word | 128 } : s)),
      };
    };
    expect(navVisibility(marked(1), L(0), target(5))).toBe(0);
    expect(navVisibility(marked(7), L(0), target(5))).toBe(0);
    expect(navVisibility(marked(4), L(0), target(5))).toBe(1);
  });

  it('a failed walk (a cell that does not resolve) sees nothing', () => {
    const failing: VisibilityNav = { point: () => [0, 0, 0], worldProbeCells: () => false };
    expect(navVisibility(failing, L(0), target(5))).toBe(0);
  });
});
