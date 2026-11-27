// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LoadedMap, LoadedMesh } from '../../packages/viewer/src/loadMap';
import { GRADE_SIZE } from '../../packages/viewer/src/variants/profile';
import { buildPropsPack, type Range, type S1Prop } from '../variants/buildAbandonedDay';

/**
 * IQ-143's props pack (product track: the builder's rule; what it draws is DAY-P1b's), on hand-built props -- no disc.
 * The fresh review's F1 (2026-11-24): SOCOM II's and SOCOM (USA)'s `a_bridge` entries all stand at one placement, so
 * the nearest-placement order tied and the first SOCOM (USA) entry was searched first for every SOCOM II entry; a piece
 * whose own counterpart is a later entry took another piece's colour where the two share a vertex position. The
 * candidates are ranked by how many of the SOCOM II entry's vertices they hold first, then by distance, then by index.
 */
const placed = (x: number, y: number, z: number) => Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const mesh = (positions: number[], colors: number[], lit = false): LoadedMesh =>
  ({ textureName: 'wall01.tif', positions: Float32Array.from(positions), colors: Float32Array.from(colors), lit } as unknown as LoadedMesh);
const map = (props: { modelName: string; parts: LoadedMesh[]; at: [number, number, number] }[]): LoadedMap =>
  ({ props: props.map((p) => ({ modelName: p.modelName, parts: p.parts, matrices: placed(...p.at), order: 0, alternate: false, facade: 0, lod: null })) } as unknown as LoadedMap);

/** SOCOM (USA)'s side as the render dump holds it: arrays in one pool, each range [offset in floats, count]. */
function s1Side(entries: { modelName: string; at: [number, number, number]; parts: { positions: number[]; colors: number[] }[] }[]) {
  const pool: number[] = [];
  const put = (a: number[]): Range => { const at = pool.length; pool.push(...a); return [at, a.length]; };
  const props: S1Prop[] = entries.map((e) => ({
    modelName: e.modelName, matrices: put(Array.from(placed(...e.at))),
    parts: e.parts.map((q) => ({ texture: 'wall01.tif', positions: put(q.positions), colors: put(q.colors), indices: null })),
  }));
  const f = Float32Array.from(pool);
  return { props, f32: (r: Range | undefined) => (r ? f.slice(r[0], r[0] + r[1]) : new Float32Array(0)) };
}
const grey = (v: number, n: number) => Array.from({ length: n }, () => [v, v, v, 1]).flat();
const LUT = new Uint8Array(GRADE_SIZE ** 3 * 3);

describe('buildPropsPack (IQ-143)', () => {
  it('a SOCOM II entry takes the colours of the SOCOM (USA) entry holding its geometry, not of an earlier entry at the same place', () => {
    // Two pieces at one placement; piece B shares its first vertex's position with piece A.
    const s2 = map([
      { modelName: 'a_bridge', at: [768, 21, 1358], parts: [mesh([0, 0, 0, 1, 0, 0], grey(0.02, 2))] },
      { modelName: 'a_bridge', at: [768, 21, 1358], parts: [mesh([0, 0, 0, 5, 0, 0, 6, 0, 0], grey(0.02, 3))] },
    ]);
    const s1 = s1Side([
      { modelName: 'a_bridge', at: [768, 21, 1358], parts: [{ positions: [0, 0, 0, 1, 0, 0], colors: grey(0.25, 2) }] },
      { modelName: 'a_bridge', at: [768, 21, 1358], parts: [{ positions: [0, 0, 0, 5, 0, 0, 6, 0, 0], colors: grey(0.5, 3) }] },
    ]);
    const r = buildPropsPack(s2, s1.props, s1.f32, LUT);
    expect(r.key.vertices).toBe(5);
    expect(Array.from(r.rgb8)).toEqual([32, 32, 32, 32, 32, 32, 64, 64, 64, 64, 64, 64, 64, 64, 64]);
    expect(r.coverage.byModel.a_bridge).toMatchObject({ vertices: 5, matched: 5, graded: 0, own: 0 });
  });

  it('with the geometry held alike, the nearer placement first; unmatched: the grade on an unlit part, its own colour on a lit one', () => {
    const s2 = map([
      { modelName: 'tree', at: [0, 0, 0], parts: [mesh([0, 0, 0], grey(0.1, 1)), mesh([9, 9, 9], [0.5, 0.25, 0.125, 1], true)] },
      { modelName: 'tree', at: [100, 0, 0], parts: [mesh([0, 0, 0], grey(0.1, 1)), mesh([7, 7, 7], grey(0.1, 1))] },
    ]);
    const s1 = s1Side([
      { modelName: 'tree', at: [100, 0, 0], parts: [{ positions: [0, 0, 0], colors: grey(0.75, 1) }] },
      { modelName: 'tree', at: [1, 0, 0], parts: [{ positions: [0, 0, 0], colors: grey(0.375, 1) }] },
    ]);
    const lut = new Uint8Array(GRADE_SIZE ** 3 * 3).fill(16);
    const r = buildPropsPack(s2, s1.props, s1.f32, lut);
    expect(Array.from(r.rgb8)).toEqual([48, 48, 48, 64, 32, 16, 96, 96, 96, 16, 16, 16]);
    expect(r.coverage.byModel.tree).toMatchObject({ vertices: 4, matched: 2, graded: 1, own: 1 });
  });
});
