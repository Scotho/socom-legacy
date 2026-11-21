import { describe, expect, it } from 'vitest';
import { decodeGeometry, encodeGeometry } from '../../src/forge/geometry/geometryFile';
import { box, plane } from '../../src/forge/geometry/primitives';
import type { WorldGeometry } from '../../src/forge/geometry/world';

/**
 * The edited geometry as a file (the Forge geometry audit's bug 1, the owner, 2026-11-16: "Edits aren't saved"): what a
 * layout's geometry asset holds read back exactly -- every point, corner, face and style; deleted faces kept as holes
 * (a face's index is its name); a mesh several objects share written once and shared again; what the base gives back
 * (the hull as read, the original mesh) named, not written.
 */
const solid = [3, 0, 0, 0, 0] as [number, number, number, number, number];
function geometry(): WorldGeometry {
  const a = box([0, 0, 0], [2, 2, 2], { textureName: 'brick', size: () => [64, 64], scaleTexel: 1 / 64 });
  a.faces[1]!.mapping = { u: [1, 0, 0], v: [0, 0, 1], scaleU: 0.25, scaleV: 0.5, shiftU: 3, shiftV: -1 };
  a.faces[2]!.normal = [0, 1, 0];
  a.faces[3] = null;                                          // a deleted face: a hole, its index kept
  const p = plane([5, 0, 5], 4, 4, 1, { textureName: 'grass', size: () => [32, 32], scaleTexel: 1 / 64 });
  p.faces[0]!.disp = { power: 2, heights: Array.from({ length: 25 }, (_, i) => i / 10) };
  p.faces[0]!.surface = [3, 7, 0, 2, 9];
  p.faces[0]!.owner = 4;
  p.faces[0]!.group = 12;
  return {
    objects: [
      { id: 'a', name: 'Box', kind: 'box', mesh: a, solid, basis: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], scale: [2, 1, 1] },
      { id: 'n1', name: 'Node 1', kind: 'world', mesh: p, group: 12, reshaped: true, moved: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1] },
      { id: 'n2', name: 'Node 2', kind: 'world', mesh: p, group: 13, hidden: true },
    ],
    collision: null, ownerNodes: null, original: p, clearedNodes: [4, 5], clearedSolids: ['x'],
  };
}

describe('the edited geometry file', () => {
  it('reads back every object, mesh and face exactly', () => {
    const g = geometry();
    const back = decodeGeometry(encodeGeometry({ geo: g, hull: null, lent: ['texture.MP5:brick'] }));
    expect(back.lent).toEqual(['texture.MP5:brick']);
    expect(back.hull).toBeNull();
    expect(back.geo.original).toBe(true);
    expect(back.geo.collision).toBe(false);
    expect(back.geo.clearedNodes).toEqual([4, 5]);
    expect(back.geo.clearedSolids).toEqual(['x']);
    expect(back.geo.objects.map(({ mesh: _m, ...o }) => o)).toEqual(g.objects.map(({ mesh: _m, ...o }) => o));
    for (const [i, o] of back.geo.objects.entries()) {
      const want = g.objects[i]!.mesh;
      expect(o.mesh.verts).toEqual(want.verts);
      expect(o.mesh.cVert).toEqual(want.cVert);
      expect(o.mesh.cUv).toEqual(want.cUv);
      expect(o.mesh.cColor).toEqual(want.cColor);
      expect(o.mesh.cNormal).toEqual(want.cNormal);
      expect(o.mesh.cCentroid).toEqual(want.cCentroid);
      expect(o.mesh.faces).toEqual(want.faces);
      expect(o.mesh.styles).toEqual(want.styles);
    }
  });

  it('writes a mesh several objects share once, and shares it again', () => {
    const back = decodeGeometry(encodeGeometry({ geo: geometry(), hull: null, lent: [] }));
    expect(back.geo.objects[1]!.mesh).toBe(back.geo.objects[2]!.mesh);
    expect(back.geo.objects[0]!.mesh).not.toBe(back.geo.objects[1]!.mesh);
  });

  it('keeps an edited collision layer beside the drawn one', () => {
    const g = geometry();
    const hull: WorldGeometry = { objects: [{ ...g.objects[0]!, id: 'h', hullOf: 'a', manual: true }], collision: null, ownerNodes: null };
    const back = decodeGeometry(encodeGeometry({ geo: g, hull, lent: [] }));
    expect(back.hull?.objects[0]?.hullOf).toBe('a');
    expect(back.hull?.objects[0]?.manual).toBe(true);
    expect(back.hull?.original).toBe(false);
  });

  it('refuses bytes that are not a geometry file', () => {
    expect(() => decodeGeometry(new Uint8Array(32))).toThrow(/not a geometry file/);
  });
});
