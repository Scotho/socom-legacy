import { describe, expect, it } from 'vitest';
import { edgeKey, edgeMap, faceNormal, faceVerts, liveFaces, vertPos, type EditMesh } from '../../src/forge/geometry/editMesh';
import { deleteFaces, edgeMergeGroups, MERGE_EDGES_NOT_OPEN, MERGE_EDGES_SAME_WAY, mergeGroups, mergeVerts } from '../../src/forge/geometry/ops';
import { box } from '../../src/forge/geometry/primitives';

// Merge points and edges (browser adaptations, the game has no editor; the reference editor's rules).
const OPTS = { textureName: 'brick', size: () => [64, 64] as [number, number], scaleTexel: 0.5 };
const closed = (m: EditMesh): boolean => {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) { const vs = faceVerts(m, f); vs.forEach((v, i) => { const k = `${v}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }); }
  return [...runs].every(([k, n]) => { const [a, b] = k.split('>'); return n === 1 && runs.get(`${b}>${a}`) === 1; });
};
const solid = (): EditMesh => box([20, 10, 20], [40, 20, 40], OPTS);   // 20..40 x 10..20 x 20..40
const top = (m: EditMesh): number => liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.9)!;

describe('mergeVerts', () => {
  it('merges a top face to one point at its middle: a pyramid', () => {
    const m = solid();
    const [k] = mergeVerts(m, [faceVerts(m, top(m))]);
    expect(liveFaces(m)).toHaveLength(5);
    expect(closed(m)).toBe(true);
    expect(vertPos(m, k!)).toEqual([30, 20, 30]);
  });

  it('merges at the last point; opposite corners of a face merged take that face away (the reference editor’s pre-connect)', () => {
    const m = solid();
    const vs = faceVerts(m, top(m));
    const at = vertPos(m, vs[1]!);
    expect(mergeVerts(m, [[vs[0]!, vs[1]!]], 'last')).toEqual([vs[1]]);
    expect(vertPos(m, vs[1]!)).toEqual(at);
    const n = solid();
    const ws = faceVerts(n, top(n));
    const far = vertPos(n, ws[2]!);
    expect(mergeVerts(n, [[ws[0]!, ws[2]!]], 'last')).toEqual([ws[2]]);
    expect(liveFaces(n)).toHaveLength(5);
    expect(closed(n)).toBe(true);
    expect(vertPos(n, ws[2]!)).toEqual(far);
  });
});

describe('mergeGroups (the reference editor’s merge range)', () => {
  it('Everything: one group in the order picked; a distance: each group the points near its first', () => {
    const m = solid();
    const vs = faceVerts(m, top(m));          // the top's corners, 20 apart
    expect(mergeGroups(m, [vs[2]!, vs[0]!, vs[1]!], null)).toEqual([[vs[2], vs[0], vs[1]]]);
    expect(mergeGroups(m, vs, 1)).toEqual(vs.map((v) => [v]));
    expect(mergeGroups(m, vs, 21)[0]).toHaveLength(3);   // the first and its two neighbours; the diagonal (28.3) is out
    expect(mergeGroups(m, vs, 21)).toHaveLength(2);
  });
});

describe('edgeMergeGroups (the reference editor’s edge Merge)', () => {
  const open = (): EditMesh => { const m = solid(); deleteFaces(m, [top(m)]); return m; };
  const rim = (m: EditMesh): [number, number][] => [...edgeMap(m).values()].filter((e) => e.faces.length === 1).map((e) => [e.a, e.b]);
  const sharing = (a: [number, number], b: [number, number]): boolean => a.some((v) => b.includes(v));

  it('welds two opposite open edges into one: each end met with the other edge’s far end, at the middle', () => {
    const m = open();
    const r = rim(m);
    expect(r).toHaveLength(4);
    const a = r[0]!, b = r.find((e) => !sharing(e, a))!;
    const g = edgeMergeGroups(m, liveFaces(m), [a, b]);
    if ('error' in g) throw new Error(g.error);
    expect(g.at).toBe('centre');
    expect(g.groups).toHaveLength(2);
    const kept = mergeVerts(m, g.groups, g.at);
    expect(kept).toHaveLength(2);
    expect(edgeMap(m).get(edgeKey(kept[0]!, kept[1]!))?.faces).toHaveLength(2);
  });

  it('two open edges sharing an end: only their other ends meet', () => {
    const m = open();
    const r = rim(m);
    const a = r[0]!, b = r.find((e) => e !== a && sharing(e, a))!;
    const g = edgeMergeGroups(m, liveFaces(m), [a, b]);
    if ('error' in g) throw new Error(g.error);
    const ends = [a.find((v) => !b.includes(v))!, b.find((v) => !a.includes(v))!].sort((x, y) => x - y);
    expect(g.groups.map((p) => [...p].sort((x, y) => x - y))).toEqual([ends]);
  });

  it('refuses an edge with faces on both sides', () => {
    const m = solid();
    const e = [...edgeMap(m).values()].slice(0, 2).map((x) => [x.a, x.b] as [number, number]);
    expect(edgeMergeGroups(m, liveFaces(m), e)).toEqual({ error: MERGE_EDGES_NOT_OPEN });
  });

  it('refuses two open edges that run the same way (their faces would face opposite ways)', () => {
    const m = open();
    const r = rim(m);
    const a = r[0]!, b = r.find((e) => !sharing(e, a))!;
    // The same edge given twice, reversed, runs the same way as itself.
    expect(edgeMergeGroups(m, liveFaces(m), [a, [a[1], a[0]]])).toEqual({ error: MERGE_EDGES_SAME_WAY });
    expect('error' in edgeMergeGroups(m, liveFaces(m), [a, b])).toBe(false);
  });
});
