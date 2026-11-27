import { describe, expect, it } from 'vitest';
import { faceNormal, liveFaces, type Vec3 } from '../../src/forge/geometry/editMesh';
import { blockKind, blockMakes, blockMesh, blockParts, frameToWorld, STAIR_STEP_RISE_ADAPTATION, stairsRampMesh, stairsRun, worldToFrame, type BlockFrame } from '../../src/forge/geometry/blockShapes';

// The block tool's shapes (a browser adaptation, after a level editor's block tool): built in a plane's frame over the
// dragged rectangle and the pulled height, faces facing out.
const OPTS = { textureName: null, size: () => null, scaleTexel: 1 };
const FLAT: BlockFrame = { origin: [0, 0, 0], u: [1, 0, 0], n: [0, 1, 0], v: [0, 0, 1] };
const centreOf = (ps: Vec3[]): Vec3 => [0, 1, 2].map((k) => ps.reduce((t, p) => t + p[k]!, 0) / ps.length) as Vec3;

describe('block tool shapes', () => {
  it('a frame carries its coordinates into the world and back', () => {
    const k = Math.SQRT1_2;
    const f: BlockFrame = { origin: [5, 6, 7], u: [k, k, 0], n: [-k, k, 0], v: [0, 0, 1] };
    const p = frameToWorld(f, 3, 4, 5);
    expect(worldToFrame(f, p).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([3, 4, 5]);
  });

  it('a block fills the rectangle and the height, every face facing out', () => {
    const m = blockMesh('block', FLAT, [0, 0], [30, 30], 20, OPTS);
    const ps: Vec3[] = [];
    for (let i = 0; i < m.verts.length; i += 3) ps.push([m.verts[i]!, m.verts[i + 1]!, m.verts[i + 2]!]);
    expect(centreOf(ps)).toEqual([15, 10, 15]);
    for (const f of liveFaces(m)) {
      const n = faceNormal(m, f);
      // Out of the middle: the normal points away from the centre.
      const c = centreOf(m.faces[f]!.corners.map((cn) => { const v = m.cVert[cn]!; return [m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!] as Vec3; }));
      expect(n[0] * (c[0] - 15) + n[1] * (c[1] - 10) + n[2] * (c[2] - 15)).toBeGreaterThan(0);
    }
  });

  it('a pull the other way mirrors it under the plane, still facing out', () => {
    const m = blockMesh('block', FLAT, [0, 0], [10, 10], -10, OPTS);
    const ys = []; for (let i = 1; i < m.verts.length; i += 3) ys.push(m.verts[i]!);
    expect(Math.min(...ys)).toBe(-10);
    expect(Math.max(...ys)).toBe(0);
    for (const f of liveFaces(m)) {
      const n = faceNormal(m, f);
      const c = centreOf(m.faces[f]!.corners.map((cn) => { const v = m.cVert[cn]!; return [m.verts[v * 3]!, m.verts[v * 3 + 1]!, m.verts[v * 3 + 2]!] as Vec3; }));
      expect(n[0] * (c[0] - 5) + n[1] * (c[1] + 5) + n[2] * (c[2] - 5)).toBeGreaterThan(0);
    }
  });

  it('a quad is one face on the plane, facing along its normal', () => {
    const parts = blockParts('quad', FLAT, [0, 0], [4, 6], 99);
    expect(parts.rings).toHaveLength(1);
    expect(parts.points.every((p) => p[1] === 0)).toBe(true);
    const m = blockMesh('quad', FLAT, [0, 0], [4, 6], 0, OPTS);
    expect(faceNormal(m, 0)).toEqual([0, 1, 0]);
  });

  it('a cylinder, a spike and a sphere: their faces, and their kinds', () => {
    expect(blockParts('cylinder', FLAT, [0, 0], [2, 2], 3).rings).toHaveLength(16 + 2);
    expect(blockParts('spike', FLAT, [0, 0], [2, 2], 3).rings).toHaveLength(16 + 1);
    expect(blockParts('sphere', FLAT, [0, 0], [2, 2], 3).rings).toHaveLength(16 * 10);
    expect([blockKind('block'), blockKind('quad'), blockKind('cylinder'), blockKind('spike'), blockKind('sphere')]).toEqual(['box', 'plane', 'cylinder', 'mesh', 'sphere']);
  });

  it('a click (no rectangle) or no height makes nothing; a quad needs no height', () => {
    expect(blockMakes('block', [0, 0], [0, 0], 5)).toBe(false);
    expect(blockMakes('block', [0, 0], [3, 3], 0)).toBe(false);
    expect(blockMakes('quad', [0, 0], [3, 3], 0)).toBe(true);
    expect(blockMakes('block', [0, 0], [3, 3], 2)).toBe(true);
  });

  // Stairs (the Forge's owner (crispy, OT.R112), 2026-11-17: "a stair geometry in the create dropdown ... a smooth collision box for it").
  const pointsOf = (m: ReturnType<typeof blockMesh>): Vec3[] => {
    const ps: Vec3[] = [];
    for (let i = 0; i < m.verts.length; i += 3) ps.push([m.verts[i]!, m.verts[i + 1]!, m.verts[i + 2]!]);
    return ps;
  };
  // His own red at 0ed80a521b (the owner, 2026-11-22: "Mark as known failures"): expects a tread 16 high at the far end; finds none (topAt undefined, not iterable).
  it.fails('stairs climb the longer side from where the drag began, a step each STAIR_STEP_RISE_ADAPTATION of height', () => {
    const m = blockMesh('stairs', FLAT, [0, 0], [10, 40], 4 * STAIR_STEP_RISE_ADAPTATION, OPTS);
    const treads = liveFaces(m).filter((f) => faceNormal(m, f)[1] > 0.99);
    expect(treads.length).toBe(4);
    // The top tread at the far end (z 30..40), the lowest at the start (z 0..10).
    const tops = treads.map((f) => m.faces[f]!.corners.map((c) => m.verts[m.cVert[c]! * 3 + 2]!));
    const topAt = (y: number): number[] => tops[treads.findIndex((f) => Math.abs(m.verts[m.cVert[m.faces[f]!.corners[0]!]! * 3 + 1]! - y) < 1e-9)]!;
    expect(Math.min(...topAt(16))).toBe(30);
    expect(Math.max(...topAt(4))).toBe(10);
    // Dragged the other way: the steps climb the other way.
    const back = blockMesh('stairs', FLAT, [10, 40], [0, 0], 16, OPTS);
    const high = liveFaces(back).filter((f) => faceNormal(back, f)[1] > 0.99).find((f) => Math.abs(back.verts[back.cVert[back.faces[f]!.corners[0]!]! * 3 + 1]! - 16) < 1e-9)!;
    expect(Math.max(...back.faces[high]!.corners.map((c) => back.verts[back.cVert[c]! * 3 + 2]!))).toBe(10);
    expect(blockKind('stairs')).toBe('mesh');
  });

  it('stairs are closed, every face facing out of the steps', () => {
    const m = blockMesh('stairs', FLAT, [0, 0], [10, 40], 16, OPTS);
    const ps = pointsOf(m);
    // Every edge used twice, once each way (a closed, consistently wound solid).
    const edges = new Map<string, number>();
    for (const f of liveFaces(m)) {
      const vs = m.faces[f]!.corners.map((c) => m.cVert[c]!);
      vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; edges.set(k, (edges.get(k) ?? 0) + 1); });
    }
    for (const k of edges.keys()) { const [a, b] = k.split('>'); expect(edges.get(`${b}>${a}`)).toBe(1); }
    expect(ps.every((p) => p[1] >= 0 && p[1] <= 16)).toBe(true);
  });

  it("stairs' ramp is one slope from the first step's foot to the last one's top, closed", () => {
    const r = stairsRampMesh(FLAT, [0, 0], [10, 40], 16, OPTS);
    expect(liveFaces(r).length).toBe(5);
    const slope = liveFaces(r).map((f) => faceNormal(r, f)).find((n) => n[1] > 0 && n[1] < 0.99)!;
    // Up 16 over 40: the normal leans back toward the foot (-z).
    expect(slope[1]).toBeCloseTo(40 / Math.hypot(40, 16), 9);
    expect(slope[2]).toBeCloseTo(-16 / Math.hypot(40, 16), 9);
    expect(stairsRun([0, 0], [10, 40])).toEqual({ alongZ: true, rev: false });
    expect(stairsRun([40, 0], [0, 10])).toEqual({ alongZ: false, rev: true });
  });
});
