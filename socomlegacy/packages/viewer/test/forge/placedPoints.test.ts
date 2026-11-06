import { describe, expect, it } from 'vitest';
import { nextNavName, nextViewName, withPlacedPoints, withPlacedViews, type Tac } from '../../src/forge/placedPoints';

const none: { tac: Tac | null } = { tac: null };

/**
 * The layout's placed tactical points and spectator views in the match (a browser adaptation, FG.R2): beside the map's
 * own -- a point on its tactical map (kind 1 the compass's nav mark, `navBitmap` by the name's first letter), a view in
 * its Scenic_Views the spectator steps through.
 */
describe('placed tactical points and views', () => {
  it('a point joins the tactical map, made where the map has none', () => {
    const tac = { lines: [], zones: [], points: [{ name: 'Bravo', kind: 1, x: 0, z: 0 }], bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 } };
    expect(withPlacedPoints({ tac }, [{ name: 'Charlie', kind: 1, at: [5, 0, 6] }]).tac!.points).toEqual([...tac.points, { name: 'Charlie', kind: 1, x: 5, z: 6 }]);
    const made = withPlacedPoints(none, [{ name: 'Delta', kind: 1, at: [100, 0, -50] }]).tac!;
    expect(made.points).toEqual([{ name: 'Delta', kind: 1, x: 100, z: -50 }]);
    expect(made.bounds.minX).toBeLessThan(100);
    expect(withPlacedPoints(none, [])).toEqual({ tac: null });
  });

  it('a view joins the spectator views, its roll 0 as every disc view', () => {
    expect(withPlacedViews({ scenicViews: [] }, [{ name: 'View1', at: [1, 2, 3], yaw: 90, pitch: -20 }]).scenicViews)
      .toEqual([{ name: 'View1', at: [1, 2, 3], yaw: 90, pitch: -20, roll: 0 }]);
  });

  it('names: the next nav word by its first letter free (Charlie..Zulu), the next View', () => {
    expect(nextNavName([])).toBe('Charlie');
    expect(nextNavName(['charlie', 'Delta'])).toBe('Echo');
    expect(nextNavName(['Cobra'])).toBe('Delta');                       // C is taken by its first letter
    expect(nextViewName(['View1'])).toBe('View2');
  });
});
