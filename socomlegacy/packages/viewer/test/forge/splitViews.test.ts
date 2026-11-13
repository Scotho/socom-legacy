import { describe, expect, it } from 'vitest';
import {
  clampCuts, clampRatio, parseSplitRecord, parseViewLook, parseViewState, splitCount, splitCutAxes, splitDefaultRatios,
  splitRects, splitSashes, SPLIT_GAP_PX, SPLIT_LAYOUTS, SPLIT_MIN_PX,
} from '../../src/forge/splitViews';

/**
 * The split viewport's layouts (`../../src/forge/splitViews`; a browser adaptation, the owner's 2026-11-11 ask): the
 * views' rectangles and dividers, and the kept record read back. Unit tests only: no original to compare with.
 */
const area = (rects: { w: number; h: number }[]): number => rects.reduce((n, r) => n + r.w * r.h, 0);
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('splitRects', () => {
  it('gives each layout its count of views, inside the viewport, none overlapping', () => {
    for (const l of SPLIT_LAYOUTS) {
      const rects = splitRects(l.id, splitDefaultRatios(l.id), 1200, 900);
      expect(rects).toHaveLength(l.count);
      expect(splitCount(l.id)).toBe(l.count);
      for (const [i, r] of rects.entries()) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1200);
        expect(r.y + r.h).toBeLessThanOrEqual(900);
        for (const o of rects.slice(i + 1)) expect(overlaps(r, o)).toBe(false);
      }
    }
  });

  it('one view is the whole viewport', () => {
    expect(splitRects('1', [], 800, 500)).toEqual([{ x: 0, y: 0, w: 800, h: 500 }]);
  });

  it('leaves the gap between views (the areas sum to the viewport less the gaps)', () => {
    const side = splitRects('2-side', [0.5], 1000, 600);
    expect(side[1]!.x - (side[0]!.x + side[0]!.w)).toBe(SPLIT_GAP_PX);
    expect(area(side)).toBe((1000 - SPLIT_GAP_PX) * 600);
    expect(area(splitRects('4', [0.5, 0.5], 1000, 600))).toBe((1000 - SPLIT_GAP_PX) * (600 - SPLIT_GAP_PX));
    expect(area(splitRects('4-side', splitDefaultRatios('4-side'), 1000, 600))).toBe((1000 - 3 * SPLIT_GAP_PX) * 600);
  });

  it('puts the large view first, at its side', () => {
    const at = (id: Parameters<typeof splitRects>[0]) => splitRects(id, splitDefaultRatios(id), 1200, 900);
    expect(at('3-top')[0]).toMatchObject({ x: 0, y: 0, w: 1200 });
    expect(at('3-bottom')[0]!.y + at('3-bottom')[0]!.h).toBe(900);
    expect(at('3-left')[0]).toMatchObject({ x: 0, y: 0, h: 900 });
    expect(at('3-right')[0]!.x + at('3-right')[0]!.w).toBe(1200);
    const four = at('4-left');
    expect(four[1]!.x).toBe(four[2]!.x);
    expect(four[2]!.x).toBe(four[3]!.x);
  });

  it('follows the cuts, each piece held to the smallest view', () => {
    expect(splitRects('2-side', [0.25], 1000, 600)[0]!.w).toBe(250 - SPLIT_GAP_PX / 2);
    expect(splitRects('2-side', [0.01], 1000, 600)[0]!.w).toBeGreaterThanOrEqual(SPLIT_MIN_PX);
  });
});

describe('clampCuts', () => {
  it('keeps every piece at least the smallest view, pushing a cut on; even pieces when the length cannot hold them', () => {
    expect(clampRatio(0, 1000)).toBeCloseTo((SPLIT_MIN_PX + SPLIT_GAP_PX / 2) / 1000);
    expect(clampRatio(1, 1000)).toBeCloseTo(1 - (SPLIT_MIN_PX + SPLIT_GAP_PX / 2) / 1000);
    expect(clampRatio(0.3, 200)).toBe(0.5);
    expect(clampRatio(Number.NaN, 1000)).toBe(0.5);
    const [a, b] = clampCuts([0.5, 0.5], 1000);
    expect(b! - a!).toBeCloseTo((SPLIT_MIN_PX + SPLIT_GAP_PX) / 1000);
    expect(clampCuts([0.2, 0.4, 0.6], 300)).toEqual([0.25, 0.5, 0.75]);
  });
});

describe('splitSashes', () => {
  it('draws a divider a cut, and the grid its crossing too', () => {
    for (const l of SPLIT_LAYOUTS) {
      const cuts = splitDefaultRatios(l.id);
      expect(splitCutAxes(l.id)).toHaveLength(cuts.length);
      expect(splitSashes(l.id, cuts, 1200, 900)).toHaveLength(cuts.length + (l.id === '4' ? 1 : 0));
    }
    expect(splitSashes('4', [0.5, 0.5], 1000, 600).map((s) => s.moves)).toEqual([[0], [1], [0, 1]]);
    expect(splitSashes('2-side', [0.5], 1000, 600)[0]!.axis).toBe('x');
    expect(splitSashes('2-stack', [0.5], 1000, 600)[0]!.axis).toBe('y');
  });
});

describe('the kept split', () => {
  const camera = { view: 'top', position: [1, 2, 3], yaw: 0, pitch: -1.5, orthographicHeight: 40, orthographicFocusDistance: 100, orthographicZoom: 1 };
  it('reads a camera back, and refuses a broken one', () => {
    expect(parseViewState(camera)).toEqual(camera);
    expect(parseViewState({ ...camera, view: 'sideways' })).toBeNull();
    expect(parseViewState({ ...camera, position: [1, 2] })).toBeNull();
    expect(parseViewState({ ...camera, orthographicHeight: 0 })).toBeNull();
  });

  it('reads marks back, keeping only the kinds it knows, and its own Draw switches', () => {
    expect(parseViewLook({ on: true, off: ['doors', 'nope'], onlyUser: true }, ['doors'])).toEqual({ on: true, off: ['doors'], onlyUser: true, glows: true, arrows: true });
    expect(parseViewLook({ on: true, off: [], draw: { geometry: false, wireframe: 'yes' } }, [])?.draw).toEqual({ geometry: false });
    expect(parseViewLook({ off: [] }, [])).toBeNull();
  });

  it('reads the record back, a view at most four, its projection defaulted, cuts of the right count only', () => {
    const r = parseSplitRecord({ layout: '4', ratios: { '4': [0.3, 0.6], '4-side': [0.5], '2-side': { a: 0.5, b: 0.5 } }, map: 'MP2', views: [{}, { kind: 'top', camera }, {}, {}, {}] }, []);
    expect(r?.layout).toBe('4');
    expect(r?.ratios).toEqual({ '4': [0.3, 0.6] });
    expect(r?.map).toBe('MP2');
    expect(r?.views).toHaveLength(4);
    expect(r?.views[0]!.kind).toBe('perspective');
    expect(r?.views[1]!.camera).toEqual(camera);
    expect(r?.views[2]!.kind).toBe('front');
    expect(parseSplitRecord({ layout: '5' }, [])).toBeNull();
  });
});
