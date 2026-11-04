import { describe, expect, it } from 'vitest';
import { ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, GlbWriter, UNSIGNED_SHORT } from '../gltf';
import { preflightOriginalGlb, type OriginalGlbAuthoringSource, type OriginalGlbHullSource, type SourcePoint } from '../creator-import/src/originalGlb';
import { GLB_CHECK_BUDGET_ADAPTATION } from '../creator-import/src/limits';

/**
 * FCW-09 TEST-FIRST PREPARATION. Synthetic authoring source only; a browser adaptation, no original-game data.
 * Retained assertion RED on b92f9b77f preceded implementation. Newell alone cannot prove convexity.
 * Future runs use codex-seatrun.sh ONE file at a time, after root grants dependencies, allowlist and runtime window.
 * Direct Vitest, worker overrides and multi-file invocations are not authorized for this batch.
 * These tests establish neither player collision nor client/match equality, which require the reviewed adapter.
 */
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function box(): OriginalGlbHullSource {
  return {
    vertices: [
      [-1, 0, -0.5], [1, 0, -0.5], [1, 0, 0.5], [-1, 0, 0.5],
      [-1, 1.5, -0.5], [1, 1.5, -0.5], [1, 1.5, 0.5], [-1, 1.5, 0.5],
    ],
    faces: [[0, 1, 2, 3], [4, 7, 6, 5], [3, 2, 6, 7], [0, 4, 5, 1], [0, 3, 7, 4], [1, 5, 6, 2]],
  };
}
function source(hulls: readonly OriginalGlbHullSource[] = [box()]): OriginalGlbAuthoringSource {
  return { unit: 'metre', up: '+Y', transformsBaked: true, nodeMatrixColumnMajor: [...IDENTITY], collision: { intent: 'convex', hulls } };
}
function visual(): Uint8Array {
  const hull = box();
  const writer = new GlbWriter('redotcom FCW-09 synthetic collision test input; original-authored');
  const positions = new Float32Array(hull.vertices.flat());
  const triangles = new Uint16Array(hull.faces.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]));
  const p = writer.addAccessor(writer.addBufferView(new Uint8Array(positions.buffer), ARRAY_BUFFER), FLOAT, 8, 'VEC3',
    { min: [-1, 0, -0.5], max: [1, 1.5, 0.5] });
  const i = writer.addAccessor(writer.addBufferView(new Uint8Array(triangles.buffer), ELEMENT_ARRAY_BUFFER), UNSIGNED_SHORT, triangles.length, 'SCALAR');
  writer.meshes.push({ primitives: [{ attributes: { POSITION: p }, indices: i, mode: 4 }] });
  writer.nodes.push({ mesh: 0 });
  writer.roots.push(0);
  return writer.finish();
}
function cylinder(n: number): OriginalGlbHullSource {
  const bottom: SourcePoint[] = Array.from({ length: n }, (_,i) => [Math.cos(i*2*Math.PI/n),0,Math.sin(i*2*Math.PI/n)]);
  const vertices: SourcePoint[] = [...bottom,...bottom.map(([x,_y,z]): SourcePoint => [x,1.5,z])];
  const ring = Array.from({ length: n }, (_,i) => i);
  return { vertices, faces: [ring,[...ring].reverse().map(i => i+n),...ring.map(i => [i,n+i,n+(i+1)%n,(i+1)%n])] };
}
function refused(authoring: OriginalGlbAuthoringSource, code: string): void {
  const before = structuredClone(authoring);
  const result = preflightOriginalGlb(visual(), authoring);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  if (result.ok) throw new Error('invalid collision source produced prepared output');
  expect(result.diagnostics.map(d => d.code)).toContain(code);
  expect(authoring).toEqual(before);
}

describe('original authored collision source preflight (provisional tool seam)', () => {
  it('retains the exact outward closed convex box without inventing engine collision fields', () => {
    const authoring = source();
    const result = preflightOriginalGlb(visual(), authoring);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics.map(d => d.code).join(', '));
    expect(result.prepared.baked.collision).toEqual({ kind: 'convex', hulls: [box()] });
    expect(result.prepared.baked.boundsMetres).toEqual({ min: [-1, 0, -0.5], max: [1, 1.5, 0.5] });
    expect(result.prepared.baked.transformsBaked).toBe(true);
  });

  it('keeps explicit empty collision visual-only despite a full-volume render mesh', () => {
    const authoring: OriginalGlbAuthoringSource = { ...source(), collision: { intent: 'none', hulls: [] } };
    const result = preflightOriginalGlb(visual(), authoring);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics.map(d => d.code).join(', '));
    expect(result.prepared.baked.collision).toEqual({ kind: 'visual-only', hulls: [] });
    expect(result.prepared.baked.primitives[0]!.positionsMetres).toHaveLength(8);
  });

  it('refuses missing collision declaration instead of deriving solidity from render bounds', () => {
    const { collision: _collision, ...missing } = source();
    refused(missing, 'COLLISION_MISSING');
  });

  it('refuses claimed convex collision with no hull', () => {
    refused(source([]), 'COLLISION_MISSING');
  });

  it('refuses a sparse convex hull list instead of publishing an unvalidated solid claim', () => {
    const sparse = new Array<OriginalGlbHullSource>(1);
    refused(source(sparse),'COLLISION_MISSING');
  });

  it('refuses contradictory none intent with nonempty hulls', () => {
    refused({ ...source(), collision: { intent: 'none', hulls: [box()] } }, 'COLLISION_INTENT');
  });

  it('refuses a collapsed zero-volume hull even though render bounds are healthy', () => {
    const hull = box();
    const collapsed = hull.vertices.map(([x, _y, z]) => [x, 0, z] as SourcePoint);
    refused(source([{ ...hull, vertices: collapsed }]), 'COLLISION_DEGENERATE');
  });

  it('refuses an open hull with its top face missing', () => {
    const hull = box();
    refused(source([{ ...hull, faces: hull.faces.filter((_face, index) => index !== 1) }]), 'COLLISION_OPEN');
  });

  it('refuses a fully inward-wound closed hull instead of silently reversing it', () => {
    const hull = box();
    refused(source([{ ...hull, faces: hull.faces.map(f => [...f].reverse()) }]), 'COLLISION_WINDING');
  });

  it('refuses duplicated-coordinate disconnected shells disguised as one convex hull', () => {
    const hull = box();
    refused(source([{
      vertices: [...hull.vertices, ...hull.vertices.map(p => [...p] as SourcePoint)],
      faces: [...hull.faces, ...hull.faces.map(f => f.map(i => i + hull.vertices.length))],
    }]), 'COLLISION_DEGENERATE');
  });

  it('refuses one reversed face in an otherwise outward hull', () => {
    const hull = box();
    refused(source([{ ...hull, faces: hull.faces.map((f, index) => index === 1 ? [...f].reverse() : [...f]) }]), 'COLLISION_WINDING');
  });

  it('refuses a nonplanar quad rather than accepting its nonzero Newell normal', () => {
    const hull = box();
    const vertices = hull.vertices.map(p => [...p] as SourcePoint);
    vertices[6] = [1, 1.25, 0.5];
    refused(source([{ ...hull, vertices }]), 'COLLISION_NONPLANAR');
  });

  it('refuses a closed triangulated hull with an inward dent, despite individually planar nonzero faces', () => {
    const hull = box();
    const vertices = hull.vertices.map(p => [...p] as SourcePoint);
    vertices[6] = [0, 0.75, 0];
    // All topological edges still have opposite partners; triangles are individually planar. Convexity is separate.
    const faces = hull.faces.flatMap(([a, b, c, d]) => [[a!, b!, c!], [a!, c!, d!]]);
    refused(source([{ vertices, faces }]), 'COLLISION_NONCONVEX');
  });

  it.each([NaN, Infinity, -Infinity])('refuses nonfinite hull coordinates %s', value => {
    const hull = box();
    const vertices = hull.vertices.map(p => [...p] as SourcePoint);
    vertices[0] = [value, 0, -0.5];
    refused(source([{ ...hull, vertices }]), 'COLLISION_COORDINATE');
  });

  it.each([-1, 8, 1.5])('refuses invalid collision face index %s', index => {
    const hull = box();
    const faces = hull.faces.map(f => [...f]);
    faces[0]![0] = index;
    refused(source([{ ...hull, faces }]), 'COLLISION_INDEX');
  });

  it.each(['', 'centimetre', 'game-unit'])('refuses unsupported declared unit %j without guessing a conversion', unit => {
    refused({ ...source(), unit }, 'SOURCE_UNIT');
  });

  it.each(['', '+Z', '-Y'])('refuses declared up axis %j instead of silently reorienting authoring geometry', up => {
    refused({ ...source(), up }, 'SOURCE_UP');
  });

  it('accepts a source marked unbaked and records the identity-baked output as baked', () => {
    const authoring = { ...source(), transformsBaked: false };
    const result = preflightOriginalGlb(visual(), authoring);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.diagnostics.map(d => d.code).join(', '));
    expect(result.prepared.baked.transformsBaked).toBe(true);
    expect(result.prepared.baked.collision).toEqual({ kind: 'convex', hulls: [box()] });
    expect(authoring.transformsBaked).toBe(false);
  });

  it('refuses a mirrored source matrix even when render metadata claims identity', () => {
    refused({ ...source(), nodeMatrixColumnMajor: [-1, ...IDENTITY.slice(1)] }, 'MIRRORED_TRANSFORM');
  });

  it.each([NaN, Infinity, -Infinity])('refuses a nonfinite source matrix component %s', value => {
    refused({ ...source(), nodeMatrixColumnMajor: [value, ...IDENTITY.slice(1)] }, 'NONFINITE_TRANSFORM');
  });

  it('refuses a source matrix of the wrong length', () => {
    refused({ ...source(), nodeMatrixColumnMajor: IDENTITY.slice(1) }, 'SOURCE_TRANSFORM');
  });

  it('refuses the whole source when its second hull is invalid, without publishing the first hull', () => {
    const hull = box();
    const broken = { ...hull, faces: hull.faces.slice(1) };
    refused(source([hull, broken]), 'COLLISION_OPEN');
  });

  it('accepts a high-face hull just below the aggregate work budget and refuses the next complete ring', () => {
    // Each source + baked hull charges V*F + V + F + face-index visits; the render box charges V+triangles.
    const cost = (n: number): number => 2 * (2*n*n + 13*n + 2) + 20;
    let under = 1;
    while (cost(under+1) <= GLB_CHECK_BUDGET_ADAPTATION) under++;
    const good = preflightOriginalGlb(visual(),source([cylinder(under)]));
    expect(good.ok).toBe(true);
    const result = preflightOriginalGlb(visual(),source([cylinder(under+1)]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('hull work exceeded the tool budget');
    expect(result.diagnostics[0]!.code).toBe('CHECK_BUDGET_EXCEEDED');
    // The first reservation over the cap refuses immediately; later face entries are deliberately not visited.
    const measured = Number(/Preparation checks (\d+)/.exec(result.diagnostics[0]!.message)?.[1]);
    expect(measured).toBeGreaterThan(GLB_CHECK_BUDGET_ADAPTATION);
    expect(measured).toBeLessThanOrEqual(cost(under+1));
    expect(result.diagnostics[0]!.message).toContain(String(GLB_CHECK_BUDGET_ADAPTATION));
  });

  it('reserves known hull vertex/face cost before touching any oversized face-list entry', () => {
    const hull = box();
    const count = Math.floor(GLB_CHECK_BUDGET_ADAPTATION / (hull.vertices.length+1))+1;
    const faces = new Array<readonly number[]>(count).fill(hull.faces[0]!);
    let touched = 0;
    Object.defineProperty(faces,0,{ get: () => { touched++; return hull.faces[0]!; } });
    const result = preflightOriginalGlb(visual(),source([{ ...hull,faces }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('oversized hull was accepted');
    expect(result.diagnostics[0]!.code).toBe('CHECK_BUDGET_EXCEEDED');
    expect(result.diagnostics[0]!.message).toContain(String(20 + hull.vertices.length*count + hull.vertices.length + count));
    expect(touched).toBe(0);
  });

  it('charges each face index count before iterating that face', () => {
    const hull = box();
    const oversizedFace = new Array<number>(GLB_CHECK_BUDGET_ADAPTATION);
    let touched = 0;
    Object.defineProperty(oversizedFace,Symbol.iterator,{ value: function* () { touched++; yield 0; } });
    const result = preflightOriginalGlb(visual(),source([{ ...hull,faces: [oversizedFace,...hull.faces.slice(1)] }]));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('oversized face was accepted');
    expect(result.diagnostics[0]!.code).toBe('CHECK_BUDGET_EXCEEDED');
    expect(result.diagnostics[0]!.message).toContain(String(20 + hull.vertices.length*hull.faces.length + hull.vertices.length + hull.faces.length + oversizedFace.length));
    expect(touched).toBe(0);
  });

  it.todo('published adapter converts render and collision identically into reviewed engine units');
  it.todo('published placement contract permits yaw only and refuses pitch/roll without changing source geometry');
  it.todo('published provider produces equal client/match hulls for translated and yaw-only placements');
  it.todo('actual Blender export, render and normal-player collision acceptance complete FCW-09');
});
