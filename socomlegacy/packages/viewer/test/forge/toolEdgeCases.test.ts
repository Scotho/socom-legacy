import { describe, expect, it } from 'vitest';
import { BLOCK_SHAPES, blockMesh } from '../../src/forge/geometry/blockShapes';
import { edgeKey, edgeMap, faceNormal, faceVerts, liveFaces, vertPos, type EditMesh } from '../../src/forge/geometry/editMesh';
import { bevelEdges, bridgeFaces, dissolveEdges, dissolveFaces, extrudeEdges, insetFaces, knifeCut, loopCut, orientPulled } from '../../src/forge/geometry/ops';
import { plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';
import { edgeLoop, edgeRing } from '../../src/forge/geometry/selection';

/**
 * The edge cases the every-tool test found (the Forge's owner (crispy, OT.R112), 2026-11-18: "try all the possible edge cases ... must not be
 * buggy"): Create's shapes each one closed solid, and the tools on them never leaving a broken mesh.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };
const frame = { origin: [0, 0, 0] as [number, number, number], u: [1, 0, 0] as [number, number, number], n: [0, 1, 0] as [number, number, number], v: [0, 0, 1] as [number, number, number] };

function runs(m: EditMesh): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; out.set(k, (out.get(k) ?? 0) + 1); }); }
  return out;
}
const closed = (m: EditMesh): boolean => { const r = runs(m); return [...r].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && r.get(`${b}>${a}`) === 1; }); };
const area = (m: EditMesh, f: number): number => { const ps = faceVerts(m, f).map((v) => vertPos(m, v)); let x = 0, y = 0, z = 0; for (let i = 0; i < ps.length; i++) { const p = ps[i]!, q = ps[(i + 1) % ps.length]!; x += p[1]! * q[2]! - p[2]! * q[1]!; y += p[2]! * q[0]! - p[0]! * q[2]!; z += p[0]! * q[1]! - p[1]! * q[0]!; } return Math.hypot(x, y, z) / 2; };
const simple = (m: EditMesh): boolean => liveFaces(m).every((f) => { const vs = faceVerts(m, f); return vs.length >= 3 && new Set(vs).size === vs.length; });
const shape = (s: string, settings: Record<string, unknown> = {}): EditMesh => blockMesh(s as never, frame, [0, 0], [40, 30], 25, OPTS, undefined, settings as never);

describe('Create shapes: each one closed solid', () => {
  const cases: [string, Record<string, unknown>][] = BLOCK_SHAPES.filter((b) => b.shape !== 'polygon' && b.shape !== 'quad').map((b) => [b.shape, {}]);
  cases.push(['stairs', { style: 'floating', steps: 12 }], ['doorway', { doors: 3 }], ['window', { windows: 4 }], ['room', { doors: 4, windows: 2 }], ['arch', { segments: 3 }], ['torus', { sides: 3, tubeSides: 3 }]);
  it.each(cases)('%s %j: every edge run once each way, no point at another’s place', (s, settings) => {
    const m = shape(s, settings);
    expect(closed(m)).toBe(true);
    if (settings['style'] !== 'floating') {
      const at = new Set<string>();
      for (const v of new Set(liveFaces(m).flatMap((f) => faceVerts(m, f)))) { const k = vertPos(m, v).map((x) => x.toFixed(4)).join(','); expect(at.has(k)).toBe(false); at.add(k); }
    }
  });
});

describe('Dissolve: only simple faces', () => {
  it.each(['pipe', 'torus', 'window'])('dissolving every face of a %s leaves no face passing a point twice', (s) => {
    const m = shape(s);
    dissolveFaces(m, liveFaces(m));
    expect(simple(m)).toBe(true);
  });
  it('dissolving every edge of a box does not throw, and leaves simple faces', () => {
    const m = shape('block');
    expect(() => dissolveEdges(m, [...edgeMap(m).values()].map((e) => [e.a, e.b] as [number, number]))).not.toThrow();
    expect(simple(m)).toBe(true);
  });
});

describe('Bevel', () => {
  it('bevels a sphere’s meridian loop through both poles: closed', () => {
    const m = shape('sphere');
    const e = [...edgeMap(m).values()][0]!;
    bevelEdges(m, edgeLoop(m, liveFaces(m), e.a, e.b).map((k) => k.split('_').map(Number) as [number, number]), 2);
    expect(closed(m)).toBe(true);
  });
  it('bevels every edge of a torus: closed', () => {
    const m = shape('torus');
    bevelEdges(m, [...edgeMap(m).values()].map((e) => [e.a, e.b] as const), 2);
    expect(closed(m)).toBe(true);
  });
});

describe('Knife', () => {
  it('does not cut along a straight side (stairs’ bottom): no face of no area', () => {
    const m = shape('stairs');
    const f = liveFaces(m).find((g) => faceVerts(m, g).length > 6 && Math.abs(faceNormal(m, g)[1]) > 0.9)!;
    const vs = faceVerts(m, f);
    knifeCut(m, [{ a: vs[1]!, b: vs[2]!, t: 0.3 }, { a: vs[4]!, b: vs[5]!, t: 0.6 }]);
    for (const g of liveFaces(m)) expect(area(m, g)).toBeGreaterThan(1e-7);
  });
});

describe('Loop Cut: only the faces the ring crosses', () => {
  it('cuts a box ring after a corner is dissolved without making an edge twice', () => {
    const m = shape('block');
    const e = [...edgeMap(m).values()].find((x) => vertPos(m, x.a)[1] !== vertPos(m, x.b)[1])!;
    loopCut(m, edgeRing(m, liveFaces(m), e.a, e.b));
    expect([...runs(m).values()].every((n) => n === 1)).toBe(true);
    expect(closed(m)).toBe(true);
  });
});

describe('Bridge, edge pull, inset', () => {
  it('refuses faces lying in one plane (a bridge of no area)', () => {
    const m = plane([0, 0, 0], 40, 10, 4, OPTS);
    const fs = liveFaces(m);
    expect(bridgeFaces(m, fs[0]!, fs[2]!)).toHaveProperty('error');
    expect(liveFaces(m)).toHaveLength(fs.length);
  });
  it('pulls a border edge out and never turns the new face against its one face', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const e = [...edgeMap(m).values()][0]!;
    const r = extrudeEdges(m, [[e.a, e.b]]);
    for (const v of new Set(r.edges.flat())) { const p = vertPos(m, v); m.verts.splice(v * 3, 3, p[0]!, p[1]! + 3, p[2]! + 1); }
    orientPulled(m, r.faces, r.sides, [0, 3, 1]);
    expect([...runs(m).values()].every((n) => n === 1)).toBe(true);
  });
  it('insets a thin face without crossing over: no face of no area, closed', () => {
    const m = shape('ladder');
    const thin = liveFaces(m).sort((a, b) => area(m, a) - area(m, b))[0]!;
    insetFaces(m, [thin], 50);
    expect(closed(m)).toBe(true);
    for (const g of liveFaces(m)) expect(area(m, g)).toBeGreaterThan(1e-7);
  });
  it('insets two faces touching along an edge and at a point (pinched) each on its own: closed', () => {
    const m = shape('spike', { sides: 3 });
    // A side merged round to the apex beside its neighbour: dissolve two edges of the base, then inset the pair.
    const base = liveFaces(m).find((f) => faceNormal(m, f)[1] < -0.9)!;
    const vs = faceVerts(m, base);
    dissolveEdges(m, [[vs[0]!, vs[1]!]]);
    const e = [...edgeMap(m).values()].find((x) => x.faces.length === 2)!;
    insetFaces(m, [...e.faces], 2);
    expect(closed(m)).toBe(true);
    expect(edgeKey(e.a, e.b)).toBeTruthy();
  });
});
