import { describe, expect, it } from 'vitest';
import { edgeKey, faceVerts, facePoints, liveFaces } from '../../src/forge/geometry/editMesh';
import { box, plane } from '../../src/forge/geometry/primitives';
import { growSelection } from '../../src/forge/geometry/selection';

// Grow / Shrink selection (a browser adaptation, the game has no editor; the reference editor’s rules): a step bigger by
// what is next to the selection, a step smaller by its border.
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };

describe('growSelection', () => {
  const g = plane([0, 0, 0], 50, 50, 5, OPTS);
  const fs = liveFaces(g);
  const centre = fs.find((f) => {
    const p = facePoints(g, f);
    const c = [0, 1, 2].map((k) => p.reduce((s, q) => s + q[k]! / p.length, 0));
    return Math.abs(c[0]!) < 1 && Math.abs(c[2]!) < 1;
  })!;

  it('grows a face across its edges only (the reference editor’s): a cross of 5, then a diamond of 13', () => {
    const cross = growSelection(g, fs, 'face', new Set([centre]), 'grow');
    expect(cross.size).toBe(5);
    expect(growSelection(g, fs, 'face', cross, 'grow').size).toBe(13);
  });

  it('shrinks back to what was grown from; an open edge is a border, so a whole plane loses its rim', () => {
    const cross = growSelection(g, fs, 'face', new Set([centre]), 'grow');
    expect([...growSelection(g, fs, 'face', cross, 'shrink')]).toEqual([centre]);
    expect(growSelection(g, fs, 'face', new Set(fs), 'shrink').size).toBe(9);
    expect(growSelection(g, fs, 'face', new Set([centre]), 'shrink').size).toBe(0);
  });

  it('grows and shrinks points along edges and edges through their ends', () => {
    const vs = faceVerts(g, centre);
    const pts = growSelection(g, fs, 'point', new Set([vs[0]!]), 'grow');
    expect(pts.size).toBe(5);
    expect([...growSelection(g, fs, 'point', pts, 'shrink')]).toEqual([vs[0]]);
    const k = edgeKey(vs[0]!, vs[1]!);
    const es = growSelection(g, fs, 'edge', new Set([k]), 'grow');
    expect(es.size).toBe(7);
    expect([...growSelection(g, fs, 'edge', es, 'shrink')]).toEqual([k]);
  });

  it('on a box: one face grows to five, then six; a closed whole has no border to shrink', () => {
    const b = box([0, 0, 0], [4, 4, 4], OPTS);
    const bf = liveFaces(b);
    const five = growSelection(b, bf, 'face', new Set([bf[0]!]), 'grow');
    expect(five.size).toBe(5);
    expect(growSelection(b, bf, 'face', five, 'grow').size).toBe(6);
    expect(growSelection(b, bf, 'face', new Set(bf), 'shrink').size).toBe(6);
  });
});
