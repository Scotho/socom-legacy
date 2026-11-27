import { describe, expect, it } from 'vitest';
import { edgeMap, edgeOfKey, faceVerts, liveFaces } from '../../src/forge/geometry/editMesh';
import { box, plane, sphere, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { edgeLoop, edgeRing } from '../../src/forge/geometry/selection';

/**
 * Loop and ring select (`src/forge/geometry/selection` `edgeLoop`, `edgeRing`; a browser adaptation, the Forge's owner (crispy, OT.R112),
 * 2026-11-18): a loop carries straight on through points with an even number of edges -- a grid's four, a sphere's
 * pole -- (along a border, the border; where it cannot go on, round the face clicked); a ring steps across four-sided
 * faces to the opposite edge.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };

describe('edge loop and ring', () => {
  const g = plane([0, 0, 0], 4, 4, 4, OPTS);
  const faces = liveFaces(g);
  const xz = (v: number): [number, number] => [g.verts[v * 3]!, g.verts[v * 3 + 2]!];
  const edges = [...edgeMap(g, faces).values()];
  const inner = edges.find((e) => xz(e.a)[1] === 0 && xz(e.b)[1] === 0 && Math.min(xz(e.a)[0], xz(e.b)[0]) === -1)!;

  it('loops an inner grid edge across the whole line', () => {
    const loop = edgeLoop(g, faces, inner.a, inner.b);
    expect(loop).toHaveLength(4);
    for (const k of loop) for (const v of edgeOfKey(k)) expect(xz(v)[1]).toBe(0);
  });

  it('rings an inner grid edge across every row', () => {
    const ring = edgeRing(g, faces, inner.a, inner.b);
    expect(ring).toHaveLength(5);
    for (const k of ring) for (const v of edgeOfKey(k)) expect([-1, 0]).toContain(xz(v)[0]);
  });

  it('loops a border edge round the whole border', () => {
    const border = edges.find((e) => e.faces.length === 1)!;
    expect(edgeLoop(g, faces, border.a, border.b)).toHaveLength(16);
  });

  it('rings a box\'s vertical edge round its four sides, and loops it no further than itself', () => {
    const b = box([0, 0, 0], [1, 1, 1], OPTS);
    const bf = liveFaces(b);
    const vertical = [...edgeMap(b, bf).values()].find((e) => b.verts[e.a * 3 + 1] !== b.verts[e.b * 3 + 1])!;
    expect(edgeRing(b, bf, vertical.a, vertical.b)).toHaveLength(4);
    // No loop goes on through a box's three-edged corner: the outline of a face beside the edge instead.
    expect(edgeLoop(b, bf, vertical.a, vertical.b)).toHaveLength(4);
  });

  it('loops a sphere\'s meridian the full circle, through both poles (the Forge\'s owner (crispy, OT.R112), 2026-11-18)', () => {
    const s = sphere([0, 0, 0], 10, 12, 8, OPTS);
    const sf = liveFaces(s);
    const p = (v: number): number[] => [s.verts[v * 3]!, s.verts[v * 3 + 1]!, s.verts[v * 3 + 2]!];
    const meridian = [...edgeMap(s, sf).values()].find((e) => p(e.a)[1] !== p(e.b)[1] && p(e.a)[0]! > 1 && Math.abs(p(e.a)[2]!) < 1e-6 && Math.abs(p(e.b)[2]!) < 1e-6)!;
    const loop = edgeLoop(s, sf, meridian.a, meridian.b);
    expect(loop).toHaveLength(16);
    for (const k of loop) for (const v of edgeOfKey(k)) expect(Math.abs(p(v)[2]!)).toBeLessThan(1e-6);
  });

  it('loops a box edge round the face it was double-clicked on, where no loop goes on (the Forge\'s owner (crispy, OT.R112), 2026-11-18)', () => {
    const b = box([0, 0, 0], [1, 1, 1], OPTS);
    const bf = liveFaces(b);
    const em = edgeMap(b, bf);
    const top = [...em.values()].find((e) => b.verts[e.a * 3 + 1] === 1 && b.verts[e.b * 3 + 1] === 1)!;
    const topFace = top.faces.find((f) => faceVerts(b, f).every((v) => b.verts[v * 3 + 1] === 1))!;
    const loop = edgeLoop(b, bf, top.a, top.b, topFace);
    expect(loop).toHaveLength(4);
    for (const k of loop) for (const v of edgeOfKey(k)) expect(b.verts[v * 3 + 1]).toBe(1);
  });
});
