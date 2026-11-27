import { describe, expect, it } from 'vitest';
import { edgeMap, faceNormal, faceVerts, liveFaces, vertPos } from '../../src/forge/geometry/editMesh';
import { extrudeEdges, orientPulled } from '../../src/forge/geometry/ops';
import { box, plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';

/**
 * Shift-drag on edges (`src/forge/geometry/ops` `extrudeEdges`, `orientPulled`; a browser adaptation, the Forge's owner (crispy, OT.R112),
 * 2026-11-18): each edge pulled out into a new face, which carries on the face of its edge that lies along the pull.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };

describe('extrude edges', () => {
  it.each([
    ['up', [0, 1, 0], [0, 0, 1]],
    ['forward', [0, 0, 1], [0, 1, 0]],
  ] as const)('a box\'s top-front edge pulled %s carries on the face along the pull', (_name, dir, want) => {
    const m = box([0, 0, 0], [2, 2, 2], OPTS);
    const e = [...edgeMap(m).values()].find((x) => [x.a, x.b].every((v) => m.verts[v * 3 + 1] === 2 && m.verts[v * 3 + 2] === 2))!;
    const r = extrudeEdges(m, [[e.a, e.b]]);
    for (const v of new Set(r.edges.flat())) { const p = vertPos(m, v); m.verts.splice(v * 3, 3, p[0] + dir[0], p[1] + dir[1], p[2] + dir[2]); }
    orientPulled(m, r.faces, r.sides, dir);
    const n = faceNormal(m, r.faces[0]!);
    for (let k = 0; k < 3; k++) expect(n[k]).toBeCloseTo(want[k]!, 6);
  });

  it('pulls side-by-side edges into one strip, their copied points shared', () => {
    const m = plane([0, 0, 0], 2, 2, 2, OPTS);
    const border = [...edgeMap(m).values()].filter((e) => e.faces.length === 1 && m.verts[e.a * 3 + 2] === -1 && m.verts[e.b * 3 + 2] === -1);
    expect(border).toHaveLength(2);
    const r = extrudeEdges(m, border.map((e) => [e.a, e.b] as const));
    expect(r.faces).toHaveLength(2);
    expect(new Set(r.edges.flat()).size).toBe(3);                          // three copied points, not four
    expect(liveFaces(m)).toHaveLength(6);
  });

  it('runs a border edge the other way from its face: one surface across it', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const e = [...edgeMap(m).values()][0]!;
    extrudeEdges(m, [[e.a, e.b]]);
    const runs = new Set(liveFaces(m).flatMap((f) => { const vs = faceVerts(m, f); return vs.map((v, i) => `${v}>${vs[(i + 1) % vs.length]}`); }));
    expect(runs.has(`${e.a}>${e.b}`) && runs.has(`${e.b}>${e.a}`)).toBe(true);
  });
});
