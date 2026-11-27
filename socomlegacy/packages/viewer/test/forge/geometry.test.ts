import { describe, expect, it } from 'vitest';
import type { LoadedMesh } from '../../src/loadMap';
import { packGround } from '../../src/mover';
import { importCollision, packCollision, hullOfMesh } from '../../src/forge/geometry/collision';
import { displacementGrid, makeDisplacement, sculpt } from '../../src/forge/geometry/displacement';
import { edgeMap, faceNormal, facePoints, faceVerts, liveFaces, polygonNormal, triangulate, vertPos } from '../../src/forge/geometry/editMesh';
import { cutFace, dissolveEdges, dissolveFaces, dissolveVerts, extrudeFaces, mergeFaces, splitEdge, transformVerts, translation, weldVerts } from '../../src/forge/geometry/ops';
import { box, cylinder, plane, sphere, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { convertSelection, emptySelection, pick, pickFace, selectionVerts } from '../../src/forge/geometry/selection';
import { adjustMapping, alignToView, applyTexture, fitMapping, justify, lockMapping, mappedUv, mappingRotation, resetMapping, textureState, textureTexelScales, worldAligned } from '../../src/forge/geometry/texturing';
import { addObject, buildHull, compileDraws, compileGeometry, geometryOfMap, markReshaped, objectFaces, separateFaces, transformObject, type WorldGeometry } from '../../src/forge/geometry/world';
import { compileMesh, importWorld } from '../../src/forge/geometry/worldMesh';

/** The Forge's editable geometry (`src/forge/geometry`; a browser adaptation, FG.R2). Unit tests on built meshes. */

const SIZE = (name: string | null): readonly [number, number] | null => (name ? [64, 32] : null);
const OPTS: PrimitiveOptions = { textureName: 'brick', size: SIZE, scaleTexel: 0.5 };

/** Two draws sharing an edge, one with an unused vertex, one without normals. */
function twoDraws(): LoadedMesh[] {
  const base = { lit: true, order: 1, orderEnd: 1, cull: true, alternate: false, scroll: null, fog: true };
  return [
    {
      ...base, textureName: 'a', cells: [3],
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 9, 9, 9, -0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 5, 5, 0, 1]),
      colors: new Float32Array(20).fill(0.25),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
      faceNormals: new Float32Array([0, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 2, 1, 0, 4, 2]),
    },
    {
      ...base, textureName: 'b', order: 2, orderEnd: 2,
      positions: new Float32Array([1, 0, 0, 1, 0, 1, 2, 0, 0]),
      uvs: new Float32Array([0, 0, 0, 1, 1, 0]),
      colors: new Float32Array(12).fill(0.5),
      normals: null, faceNormals: null,
      indices: new Uint32Array([0, 1, 2]),
    },
  ];
}

describe('import and compile', () => {
  it('an untouched mesh compiles to the very draws it was read from, an unused vertex and -0 kept', () => {
    const world = twoDraws();
    const out = compileMesh(importWorld(world));
    expect(out).toHaveLength(2);
    out.forEach((d, i) => {
      const w = world[i]!;
      expect(Array.from(d.positions)).toEqual(Array.from(w.positions));
      if (i === 0) expect(Object.is(d.positions[12], -0)).toBe(true);   // the first draw's -0 (the second has 3 points)
      expect(Array.from(d.indices)).toEqual(Array.from(w.indices));
      expect(Array.from(d.uvs)).toEqual(Array.from(w.uvs));
      expect(d.normals && Array.from(d.normals)).toEqual(w.normals && Array.from(w.normals));
      expect(d.faceNormals && Array.from(d.faceNormals)).toEqual(w.faceNormals && Array.from(w.faceNormals));
      expect(d.textureName).toBe(w.textureName);
      expect(d.cells).toEqual(w.cells);
    });
  });

  it('a position two draws share is one point: moving it moves both draws', () => {
    const m = importWorld(twoDraws());
    expect(m.verts.length / 3).toBe(6); // 5 + 3 positions, two shared, -0 apart from 0
    const shared = [...Array(m.verts.length / 3).keys()].find((v) => vertPos(m, v).join() === '1,0,1')!;
    transformVerts(m, [shared], translation([0, 2, 0]));
    const [a, b] = compileMesh(m);
    expect(Array.from(a!.positions.subarray(6, 9))).toEqual([1, 2, 1]);
    expect(Array.from(b!.positions.subarray(3, 6))).toEqual([1, 2, 1]);
  });

  it('the hull layer packs back to the ground it came from', () => {
    const ground = packGround({ minX: 0, minZ: 0, cellSize: 64, cellsX: 1, cellsZ: 1 } as never, [
      { modelName: 'worldmodel', path: 'a', region: 7, ditype: 3, material: 2, ptcount: 3, cameratype: 0, appflags: 4, points: new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0]) },
      { modelName: 'worldmodel', path: 'b', region: 1, ditype: 2, material: 5, ptcount: 4, cameratype: 1, points: new Float32Array([0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0]) },
    ], [{ modelName: 'worldmodel', path: 'a', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'b', first: 1, count: 1 }]);
    const back = packCollision(importCollision(ground));
    expect(Array.from(back.points)).toEqual(Array.from(ground.points));
    expect(Array.from(back.fields)).toEqual(Array.from(ground.fields));
    expect(back.owners.map((o) => [o.first, o.count])).toEqual([[0, 1], [1, 1]]);
  });
});

describe('primitives', () => {
  it('a box: 8 points, 6 quads facing out, closed (every edge on two faces)', () => {
    const m = box([0, 0, 0], [2, 4, 6], OPTS);
    expect(m.verts.length / 3).toBe(8);
    expect(liveFaces(m)).toHaveLength(6);
    for (const e of edgeMap(m).values()) expect(e.faces).toHaveLength(2);
    for (const f of liveFaces(m)) {
      const n = faceNormal(m, f);
      const c = m.faces[f]!.corners.map((x) => vertPos(m, m.cVert[x]!)).reduce((s, p) => [s[0]! + p[0], s[1]! + p[1], s[2]! + p[2]], [0, 0, 0]);
      const out = [c[0]! / 4 - 1, c[1]! / 4 - 2, c[2]! / 4 - 3];
      expect(n[0] * out[0]! + n[1] * out[1]! + n[2] * out[2]!).toBeGreaterThan(0);
    }
  });

  it('a sphere and a cylinder are closed; a plane is a grid facing up', () => {
    for (const m of [sphere([0, 0, 0], 5, 8, 6, OPTS), cylinder([0, 0, 0], 2, 3, 6, OPTS)]) for (const e of edgeMap(m).values()) expect(e.faces).toHaveLength(2);
    const p = plane([0, 0, 0], 10, 10, 4, OPTS);
    expect(liveFaces(p)).toHaveLength(16);
    expect(faceNormal(p, 0)[1]).toBeCloseTo(1);
  });

  it('a primitive compiles to triangles with uvs from its world-aligned mapping', () => {
    const m = box([0, 0, 0], [32, 32, 32], OPTS);
    const [d] = compileMesh(m);
    expect(d!.indices.length / 3).toBe(12);
    expect(d!.textureName).toBe('brick');
    // 32 units at 0.5 a texel: 64 texels, one repeat of a 64-wide texture across each face.
    for (const f of liveFaces(m)) {
      const us = m.faces[f]!.corners.map((c) => m.cUv[c * 2]!);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(1);
    }
  });
});

describe('tools', () => {
  it('extrude: the top of a box raised, four walls added, still closed', () => {
    const m = box([0, 0, 0], [1, 1, 1], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const r = extrudeFaces(m, [top], 2);
    expect(r.walls).toHaveLength(4);
    for (const e of edgeMap(m).values()) expect(e.faces).toHaveLength(2);
    expect(m.faces[top]!.corners.map((c) => vertPos(m, m.cVert[c]!)[1])).toEqual([3, 3, 3, 3]);
    for (const w of r.walls) expect(Math.abs(faceNormal(m, w)[1])).toBeLessThan(1e-9);
  });

  it("an extrude's walls and a cut's half are in the face's own object (its node's group): selectable, and in its hull", () => {
    // A map's world is one mesh, its objects its faces' groups: a face with none is in no object (the Forge's owner (crispy, OT.R112), 2026-11-17:
    // "the side walls don't have any geometry I can select and they don't have any collision").
    const m = box([0, 0, 0], [2, 2, 2], OPTS);
    for (const f of liveFaces(m)) { m.faces[f]!.group = 7; m.faces[f]!.surface = [3, 1, 0, 0, 0]; }
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const { walls } = extrudeFaces(m, [top], 2);
    for (const w of walls) {
      expect(m.faces[w]!.group).toBe(7);
      expect(m.faces[w]!.surface).toBeUndefined();   // a wall's words by its slope (`wordsOf`), not the floor's it came off
    }
    const cut = cutFace(m, top, 0, 2)!;
    expect(m.faces[cut[1]]!.group).toBe(7);
    expect(m.faces[cut[1]]!.surface).toEqual([3, 1, 0, 0, 0]);
  });

  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects cutFace to cut the split face; gets null.
  it.fails('split an edge, cut a face, merge it back', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const [a, b] = [m.cVert[m.faces[0]!.corners[0]!]!, m.cVert[m.faces[0]!.corners[1]!]!];
    splitEdge(m, a, b);
    expect(m.faces[0]!.corners).toHaveLength(5);
    const cut = cutFace(m, 0, 0, 2)!;
    expect(cut).not.toBeNull();
    expect(m.faces[cut[0]]!.corners.length + m.faces[cut[1]]!.corners.length).toBe(7);
    expect(mergeFaces(m, cut[0], cut[1])).toBe(cut[0]);
    expect(m.faces[cut[0]]!.corners).toHaveLength(5);
  });

  it('weld two points: faces that collapse are dropped', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const vs = m.faces[0]!.corners.map((c) => m.cVert[c]!);
    weldVerts(m, [vs[0]!, vs[1]!]);
    expect(m.faces[0]!.corners).toHaveLength(3);
    weldVerts(m, [vs[0]!, vs[2]!]);
    expect(m.faces[0]).toBeNull();
  });

  it('triangulates a concave ring inside itself', () => {
    const L = [[0, 0, 0], [0, 0, 2], [1, 0, 2], [1, 0, 1], [2, 0, 1], [2, 0, 0]];
    const tris = triangulate(L);
    expect(tris).toHaveLength(4);
    for (const t of tris) expect(polygonNormal(t.map((i) => L[i]!))[1]).toBeCloseTo(polygonNormal(L)[1]);
  });
});

describe('texturing (as a level editor does it)', () => {
  it('world-aligned: a floor maps x to u and z to v at its scale', () => {
    const map = worldAligned([0, 1, 0], 2);
    expect(mappedUv(map, [64, 0, 32], [32, 16])).toEqual([1, 1]);
  });

  it('pick-up fits the mapping a face already has', () => {
    const m = box([0, 0, 0], [8, 8, 8], OPTS);
    const fitted = fitMapping(m, 0, [64, 32])!;
    const p = vertPos(m, m.cVert[m.faces[0]!.corners[2]!]!);
    const uv = mappedUv(fitted, p, [64, 32]);
    expect(uv[0]).toBeCloseTo(m.cUv[m.faces[0]!.corners[2]! * 2]!);
    expect(uv[1]).toBeCloseTo(m.cUv[m.faces[0]!.corners[2]! * 2 + 1]!);
  });

  it('apply a texture to one face of a disc draw: a draw of its own, the rest untouched', () => {
    const m = importWorld(twoDraws());
    applyTexture(m, [0], 'c', SIZE);
    const out = compileMesh(m);
    expect(out.map((d) => d.textureName)).toEqual(['a', 'c', 'b']);
    expect(out[0]!.indices.length).toBe(3);
    expect(out[1]!.cells).toEqual([3]); // the draw's other flags kept
  });

  it('justify fit puts one repeat across the face; shift and rotate move it', () => {
    const m = plane([0, 0, 0], 10, 10, 1, OPTS);
    justify(m, [0], 'fit', SIZE);
    const us = m.faces[0]!.corners.map((c) => m.cUv[c * 2]!);
    expect(Math.min(...us)).toBeCloseTo(0);
    expect(Math.max(...us)).toBeCloseTo(1);
    adjustMapping(m, [0], { shiftU: 32, relative: true }, SIZE);
    expect(Math.min(...m.faces[0]!.corners.map((c) => m.cUv[c * 2]!))).toBeCloseTo(0.5);
    adjustMapping(m, [0], { rotate: 90 }, SIZE);
    expect(Math.abs(m.faces[0]!.mapping!.u[2])).toBeCloseTo(1);
  });

  // A level editor 2's Texture State and Modify Texture (the Forge's owner (crispy, OT.R112), 2026-11-17: "Align, Scale, Shift, Rotate, Fit, Justify").
  it('Texture State: rotation read off the axes, set absolutely; shared values, null where faces differ', () => {
    expect(mappingRotation(worldAligned([0, 1, 0], 1))).toBeCloseTo(0);
    const m = plane([0, 0, 0], 10, 10, 2, OPTS);
    justify(m, [0, 1, 2, 3], 'fit', SIZE);
    adjustMapping(m, [0, 1, 2, 3], { rotateTo: 30 }, SIZE);
    expect(mappingRotation(m.faces[0]!.mapping!)).toBeCloseTo(30);
    adjustMapping(m, [0, 1, 2, 3], { rotateTo: -45 }, SIZE);
    expect(mappingRotation(m.faces[0]!.mapping!)).toBeCloseTo(-45);
    adjustMapping(m, [1], { scaleU: 3 }, SIZE);
    const st = textureState(m, [0, 1], SIZE);
    expect(st.count).toBe(2);
    expect(st.scaleU).toBeNull();                              // the two differ
    expect(st.rotate).toBeCloseTo(-45);                        // the two share it
  });

  it('flip mirrors along its axis; a shift by world units moves the texture that far', () => {
    const m = plane([0, 0, 0], 10, 10, 1, OPTS);
    justify(m, [0], 'fit', SIZE);
    const u0 = m.faces[0]!.corners.map((c) => m.cUv[c * 2]!);
    adjustMapping(m, [0], { flipU: true }, SIZE);
    m.faces[0]!.corners.forEach((c, k) => expect(m.cUv[c * 2]!).toBeCloseTo(-u0[k]!));
    adjustMapping(m, [0], { flipU: true }, SIZE);              // twice: as it was
    const map = m.faces[0]!.mapping!;
    const p = [3, 0, 3];
    const before = mappedUv(map, p, [64, 32]);
    adjustMapping(m, [0], { nudgeU: 2 }, SIZE);
    const moved = [p[0]! + 2 * map.u[0], 0, p[2]! + 2 * map.u[2]];
    expect(mappedUv(m.faces[0]!.mapping!, moved, [64, 32])[0]).toBeCloseTo(before[0]);
  });

  it('fit X by Y repeats; Treat as one off fits each face on its own', () => {
    const m = plane([0, 0, 0], 10, 10, 2, OPTS);
    justify(m, [0, 1, 2, 3], 'fit', SIZE, 1, { repeat: [2, 3], together: true });
    const all = [0, 1, 2, 3].flatMap((f) => m.faces[f]!.corners.map((c) => [m.cUv[c * 2]!, m.cUv[c * 2 + 1]!]));
    expect(Math.max(...all.map((x) => x[0]!)) - Math.min(...all.map((x) => x[0]!))).toBeCloseTo(2);
    expect(Math.max(...all.map((x) => x[1]!)) - Math.min(...all.map((x) => x[1]!))).toBeCloseTo(3);
    justify(m, [0, 1, 2, 3], 'fit', SIZE, 1, { together: false });
    for (const f of [0, 1, 2, 3]) {
      const us = m.faces[f]!.corners.map((c) => m.cUv[c * 2]!);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(1);
    }
  });

  it('align to view: the texture upright as the camera looks at a wall', () => {
    const m = box([0, 0, 0], [8, 8, 8], OPTS);
    const wall = liveFaces(m).find((f) => faceNormal(m, f)[2] > 0.9)!;
    alignToView(m, [wall], [1, 0, 0], [0, 1, 0], SIZE);
    const map = m.faces[wall]!.mapping!;
    expect(map.u[0]).toBeCloseTo(1);                           // u along the camera's right
    expect(map.v[1]).toBeCloseTo(-1);                          // v down the wall
  });

  it('natural size: read off the faces that wear a texture; Reset lays it back world-aligned at that size', () => {
    const m = plane([0, 0, 0], 10, 10, 2, OPTS);               // 'brick' at 0.5 world units a texel
    const natural = textureTexelScales(m, SIZE);
    expect(natural.get('brick')).toBeCloseTo(0.5);
    adjustMapping(m, [0, 1, 2, 3], { scaleU: 3, rotateTo: 30, shiftU: 7 }, SIZE);
    resetMapping(m, [0, 1, 2, 3], SIZE, (n) => natural.get((n ?? '').toLowerCase()) ?? 1);
    const st = textureState(m, [0, 1, 2, 3], SIZE);
    expect(st.scaleU).toBeCloseTo(0.5);
    expect(st.rotate).toBeCloseTo(0);
    expect(st.shiftU).toBeCloseTo(0);
  });

  it('texture lock: a moved face keeps its texels', () => {
    const map = worldAligned([0, 1, 0], 0.5);
    const mat = [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 10, 0, 5, 1]; // a quarter turn about y, then a shift
    const locked = lockMapping(map, mat);
    const p = [3, 0, 7];
    const moved = [mat[0]! * 3 + mat[8]! * 7 + mat[12]!, 0, mat[2]! * 3 + mat[10]! * 7 + mat[14]!];
    const a = mappedUv(map, p, [64, 64]), b = mappedUv(locked, moved, [64, 64]);
    expect(b[0]).toBeCloseTo(a[0]);
    expect(b[1]).toBeCloseTo(a[1]);
  });
});

describe('displacement', () => {
  it('a plane displaced: a grid drawn in its place, raised by a sculpt, with a hull', () => {
    const m = plane([0, 0, 0], 16, 16, 1, OPTS);
    expect(makeDisplacement(m, 0, 2)).toBe(true);
    expect(sculpt(m, [0], [0, 0, 0], 4, 3, 'raise')).toBeGreaterThan(0);
    const g = displacementGrid(m, 0);
    expect(g.points).toHaveLength(25);
    expect(Math.max(...g.points.map((p) => p[1]))).toBeCloseTo(3);
    const [d] = compileMesh(m);
    expect(d!.indices.length / 3).toBe(32);
    expect(hullOfMesh(m, [3, 0, 0, 0, 0])).toHaveLength(32);
  });

  it("a shape's collision is its faces as they are drawn: a flat convex face one polygon, as the disc's quads are", () => {
    const b = box([0, 0, 0], [2, 2, 2], OPTS);
    const hull = hullOfMesh(b, [3, 0, 0, 0, 0]);
    expect(hull).toHaveLength(6);                                         // six quads, not twelve triangles
    expect(hull.every((p) => p.points.length === 4)).toBe(true);
    const cyl = cylinder([0, 0, 0], 1, 2, 8, OPTS);
    expect(hullOfMesh(cyl, [3, 0, 0, 0, 0]).some((p) => p.points.length === 8)).toBe(true);   // its caps whole
    // A face bent out of its plane is no polygon of the hull's: triangles, as drawn.
    const bent = box([0, 0, 0], [2, 2, 2], OPTS);
    const top = liveFaces(bent).find((f) => facePoints(bent, f).every((q) => q[1] === 2))!;
    transformVerts(bent, [faceVerts(bent, top)[0]!], translation([0, 1, 0]));
    const h2 = hullOfMesh(bent, [3, 0, 0, 0, 0]);
    expect(h2).toHaveLength(5 + 2);
  });

  it('a face not four-cornered is not displaced', () => {
    const m = sphere([0, 0, 0], 1, 6, 4, OPTS);
    expect(makeDisplacement(m, 0, 2)).toBe(false);
  });
});

describe('objects and the four modes', () => {
  const world = (): WorldGeometry => {
    const g = geometryOfMap({ world: twoDraws() });
    g.objects.push({ id: 'crate', name: 'Crate', kind: 'box', mesh: box([10, 0, 10], [12, 2, 12], OPTS), solid: [3, 0, 0, 0, 0] });
    return g;
  };
  const down = (x: number, z: number) => ({ origin: [x, 50, z], dir: [0, -1, 0] });

  it('picks a face, an object, a point, an edge by a ray', () => {
    const g = world();
    expect(pickFace(g, down(11, 11))!.object.id).toBe('crate');
    const sel = emptySelection('object');
    expect(pick(g, sel, down(11, 11), 0.5)).toBe(true);
    expect([...sel.objects]).toEqual(['crate']);
    const pt = emptySelection('point');
    pick(g, pt, down(11.9, 11.9), 0.5);
    expect(vertPos(g.objects[1]!.mesh, [...pt.items.get('crate')!][0] as number)).toEqual([12, 2, 12]);
    const ed = emptySelection('edge');
    expect(pick(g, ed, down(11, 11.95), 0.2)).toBe(true);
  });

  it('a face selection converts to its points and back', () => {
    const g = world();
    const sel = emptySelection('face');
    pick(g, sel, down(11, 11), 0.5);
    const pts = convertSelection(g, sel, 'point');
    expect(pts.items.get('crate')!.size).toBe(4);
    expect(convertSelection(g, pts, 'face').items.get('crate')!.size).toBe(1);
    expect(selectionVerts(sel, g.objects[1]!).size).toBe(4);
  });

  it('separating faces of the world makes an object of them, and the compile draws both', () => {
    const g = world();
    const piece = separateFaces(g, g.objects[0]!, [1], 'Piece')!;
    expect(liveFaces(piece.mesh)).toHaveLength(1);
    expect(compileGeometry(g).world.reduce((n, d) => n + d.indices.length / 3, 0)).toBe(3 + 12);
  });
});

describe('world nodes as objects', () => {
  /** `twoDraws` tagged as a `worldNodes` load tags it: draw a's triangles under node 0 and 1, draw b's under none. */
  const tagged = (): LoadedMesh[] => {
    const [a, b] = twoDraws();
    return [{ ...a!, triNodes: new Uint16Array([0, 0]) }, { ...b!, triNodes: new Uint16Array([1]) }];
  };
  const nodes = [{ key: 'world:hut#0', name: 'hut' }, { key: 'world:wall#0', name: 'wall' }];

  it('an object each node, all over one mesh; a node has points of its own', () => {
    const g = geometryOfMap({ world: tagged(), worldNodes: nodes });
    expect(g.objects.map((o) => o.id)).toEqual(['world:hut#0', 'world:wall#0']);
    expect(new Set(g.objects.map((o) => o.mesh)).size).toBe(1);
    expect(g.objects.map((o) => objectFaces(o).length)).toEqual([2, 1]);
    // The wall's (1,0,0) and (1,0,1) are not the hut's, though they stand in the same place.
    expect(g.objects[0]!.mesh.verts.length / 3).toBe(5 + 3);
  });

  it('the faces under no node are an object of their own', () => {
    const [a, b] = twoDraws();
    const g = geometryOfMap({ world: [{ ...a!, triNodes: new Uint16Array([0, 0xffff]) }, { ...b!, triNodes: new Uint16Array([0]) }], worldNodes: nodes });
    expect(g.objects.map((o) => o.id)).toEqual(['world:hut#0', 'world:root']);
  });

  it('untouched, the tagged draws compile back with their tags; a hidden node is left out', () => {
    const world = tagged();
    const g = geometryOfMap({ world, worldNodes: nodes });
    const out = compileDraws(g);
    expect(out.map((d) => Array.from(d.triNodes ?? []))).toEqual([[0, 0], [1]]);
    expect(Array.from(out[0]!.indices)).toEqual(Array.from(world[0]!.indices));
    expect(Array.from(out[1]!.positions)).toEqual(Array.from(world[1]!.positions));
    g.objects[1]!.hidden = true;
    expect(compileDraws(g)).toHaveLength(1);
  });

  it('moving a node moves its faces only; picking finds the node', () => {
    const g = geometryOfMap({ world: tagged(), worldNodes: nodes });
    transformObject(g.objects[0]!, translation([0, 5, 0]));
    const [a, b] = compileDraws(g);
    expect(Array.from(a!.positions.subarray(3, 6))).toEqual([1, 5, 0]);
    expect(Array.from(b!.positions)).toEqual([1, 0, 0, 1, 0, 1, 2, 0, 0]);
    expect(pickFace(g, { origin: [1.5, 50, 0.2], dir: [0, -1, 0] })!.object.id).toBe('world:wall#0');
  });
});

describe('Build: the hull from the edited geometry', () => {
  const grid = { minX: 0, minZ: 0, cellSize: 64, cellsX: 1, cellsZ: 1 } as never;
  /** The tagged `twoDraws`, with a hull of one polygon each node: the hut's owner 0, the wall's owner 1. */
  const map = () => {
    const [a, b] = twoDraws();
    return {
      world: [{ ...a!, triNodes: new Uint16Array([0, 0]) }, { ...b!, triNodes: new Uint16Array([1]) }],
      worldNodes: [{ key: 'world:hut#0', name: 'hut' }, { key: 'world:wall#0', name: 'wall' }],
      ownerNodes: [0, 1],
      ground: packGround(grid, [
        { modelName: 'worldmodel', path: 'worldmodel/hut', region: 0, ditype: 3, material: 7, ptcount: 3, cameratype: 0, points: new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0]) },
        { modelName: 'worldmodel', path: 'worldmodel/wall', region: 0, ditype: 3, material: 9, ptcount: 3, cameratype: 0, points: new Float32Array([1, 0, 0, 1, 0, 1, 2, 0, 0]) },
      ], [{ modelName: 'worldmodel', path: 'worldmodel/hut', first: 0, count: 1 }, { modelName: 'worldmodel', path: 'worldmodel/wall', first: 1, count: 1 }]),
    };
  };

  it('untouched, Build gives the hull read', () => {
    const m = map();
    const built = buildHull(geometryOfMap(m))!;
    expect(Array.from(built.points)).toEqual(Array.from(m.ground.points));
  });

  it('a node moved whole carries its own hull, the other node’s left', () => {
    const g = geometryOfMap(map());
    transformObject(g.objects[0]!, translation([10, 0, 0]));
    const built = buildHull(g)!;
    expect(Array.from(built.points.subarray(0, 3))).toEqual([10, 0, 0]);
    expect(Array.from(built.points.subarray(9, 12))).toEqual([1, 0, 0]);
  });

  it('a node reshaped with nothing changed keeps the hull read (a ramp over drawn steps stays a ramp)', () => {
    const m = map();
    const g = geometryOfMap(m);
    markReshaped(g.objects[0]!);
    markReshaped(g.objects[1]!);
    expect(Array.from(buildHull(g)!.points)).toEqual(Array.from(m.ground.points));
  });

  it('a node reshaped: the polygon under a changed face goes, the changed and the unchanged faces under it take its place', () => {
    const g = geometryOfMap(map());
    const hut = g.objects[0]!;
    markReshaped(hut);
    // The hut's second face alone has the point (-0, 0, 1): lifted, that face is changed; the first is not.
    const v = [...Array(hut.mesh.verts.length / 3).keys()].find((i) => Object.is(vertPos(hut.mesh, i)[0], -0) && vertPos(hut.mesh, i)[2] === 1)!;
    transformVerts(hut.mesh, [v], translation([0, 5, 0]));
    const built = buildHull(g)!;
    // The wall's polygon first, as read; the hut's two faces after it (its polygon covered both), its material, 7.
    expect(built.fields.length / 6).toBe(3);
    expect(Array.from(built.points.subarray(0, 9))).toEqual([1, 0, 0, 1, 0, 1, 2, 0, 0]);
    expect(built.fields[1 * 6 + 2]).toBe(7);
    expect(Array.from(built.points).some((y, i) => i % 3 === 1 && y === 5)).toBe(true);
  });

  it('a node moved and then reshaped keeps its hull, moved, where its faces did not change', () => {
    const g = geometryOfMap(map());
    transformObject(g.objects[1]!, translation([0, 0, 10]));
    markReshaped(g.objects[1]!);
    const built = buildHull(g)!;
    expect(built.fields.length / 6).toBe(2);
    expect(Array.from(built.points.subarray(9, 12))).toEqual([1, 0, 10]);
  });

  it('a solid box: one owner each polygon, so the probe finds its top over its bottom', () => {
    const g = geometryOfMap(map());
    addObject(g, { name: 'Box', kind: 'box', mesh: box([0, 0, 0], [1, 1, 1], OPTS), solid: [3, 0, 0, 0, 0] });
    const built = buildHull(g)!;
    const mine = built.owners.filter((o) => o.path.startsWith('forge/'));
    expect(mine).toHaveLength(6);                                         // a polygon each face (was each triangle: 12)
    expect(mine.every((o) => o.count === 1)).toBe(true);
  });
});

describe("dissolve (a level editor's Backspace; Delete leaves a hole)", () => {
  const corners = (m: ReturnType<typeof box>): number[] => liveFaces(m).map((f) => m.faces[f]!.corners.length);
  const closed = (m: ReturnType<typeof box>): boolean => [...edgeMap(m).values()].every((e) => e.faces.length === 2);

  it('an edge of a box: its two faces become one, the two points left with two edges taken out (the box closed)', () => {
    const m = box([0, 0, 0], [4, 4, 4], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const [a, b] = faceVerts(m, top);
    expect(dissolveEdges(m, [[a!, b!]])).toEqual({ faces: [expect.any(Number)], kept: 0 });
    // The edge's two ends had three edges each, two once it went, both inside the surface: taken out of their faces --
    // the joined face four-cornered, the two side faces beside it triangles.
    expect(corners(m).sort()).toEqual([3, 3, 4, 4, 4]);
    expect(closed(m)).toBe(true);
  });

  it('a border edge has nothing to merge with and stays', () => {
    const m = plane([0, 0, 0], 8, 8, 1, OPTS);
    const [a, b] = faceVerts(m, 0);
    expect(dissolveEdges(m, [[a!, b!]]).kept).toBe(1);
    expect(liveFaces(m)).toHaveLength(1);
  });

  it('a corner of a box: its three faces merge round it, the point gone, the box closed', () => {
    const m = box([0, 0, 0], [4, 4, 4], OPTS);
    dissolveVerts(m, [0]);
    expect(corners(m).sort()).toEqual([4, 4, 4, 6]);
    expect(liveFaces(m).some((f) => faceVerts(m, f).includes(0))).toBe(false);
    expect(closed(m)).toBe(true);
  });

  it('a point on a straight run leaves its edge, the faces keeping their shape', () => {
    const m = box([0, 0, 0], [4, 4, 4], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;
    const [a, b] = faceVerts(m, top);
    const v = splitEdge(m, a!, b!);
    dissolveVerts(m, [v]);
    expect(corners(m)).toEqual([4, 4, 4, 4, 4, 4]);
  });

  it('the middle of a 2x2 plane: one face round its border, no spike left', () => {
    const m = plane([0, 0, 0], 8, 8, 2, OPTS);
    const centre = [...Array(m.verts.length / 3).keys()].find((v) => vertPos(m, v).every((x) => Math.abs(x) < 1e-9))!;
    dissolveVerts(m, [centre]);
    expect(corners(m)).toEqual([8]);
  });

  it('faces: a 2x2 plane combined into one quad (the points in a line on its sides taken out); a 3x3 grid\'s inner edges too', () => {
    const m = plane([0, 0, 0], 8, 8, 2, OPTS);
    expect(dissolveFaces(m, liveFaces(m))).toHaveLength(1);
    expect(corners(m)).toEqual([4]);
    const g = plane([0, 0, 0], 12, 12, 3, OPTS);
    const inner = [...edgeMap(g).values()].filter((e) => e.faces.length === 2).map((e) => [e.a, e.b] as [number, number]);
    expect(dissolveEdges(g, inner).kept).toBe(0);
    expect(corners(g)).toEqual([4]);
  });

  it('faces at an angle are never combined: a box\'s six stay six', () => {
    const m = box([0, 0, 0], [4, 4, 4], OPTS);
    dissolveFaces(m, liveFaces(m));
    expect(liveFaces(m)).toHaveLength(6);
  });
});
