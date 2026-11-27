import { describe, expect, it } from 'vitest';
import { faceNormal, facePoints, faceVerts, liveFaces, type EditMesh } from '../../src/forge/geometry/editMesh';
import { insetFaces } from '../../src/forge/geometry/ops';
import { box, plane, type PrimitiveOptions } from '../../src/forge/geometry/primitives';

/**
 * Inset (`src/forge/geometry/ops` `insetFaces`; a browser adaptation, the Forge's owner (crispy, OT.R112), 2026-11-18): the selected region shrunk in
 * its own plane with a ring of new faces round it; touching faces one region; the ring takes its border face's mapping,
 * object and, on a hull, collision words by facing.
 */

const OPTS: PrimitiveOptions = { textureName: 'brick', size: () => [64, 64], scaleTexel: 0.5 };

/** Every edge used by exactly two faces, run once each way. */
function closedAndConsistent(m: EditMesh): boolean {
  const runs = new Map<string, number>();
  for (const f of liveFaces(m)) {
    const vs = faceVerts(m, f);
    for (let i = 0; i < vs.length; i++) { const k = `${vs[i]}>${vs[(i + 1) % vs.length]}`; runs.set(k, (runs.get(k) ?? 0) + 1); }
  }
  for (const [k, n] of runs) {
    const [a, b] = k.split('>');
    if (n !== 1 || runs.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

describe('Inset', () => {
  it('shrinks one face in by the distance, a ring of four round it, all facing as it did', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const r = insetFaces(m, [liveFaces(m)[0]!], 0.5);
    expect(r.ring).toHaveLength(4);
    for (const p of facePoints(m, r.faces[0]!)) {
      expect(Math.abs(Math.abs(p[0]!) - 0.5)).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(p[2]!) - 0.5)).toBeLessThan(1e-6);
    }
    for (const f of [...r.ring, ...r.faces]) expect(faceNormal(m, f)[1]).toBeGreaterThan(0.99);
  });

  it('keeps a box closed and every face turned as its neighbours', () => {
    const m = box([0, 0, 0], [2, 2, 2], OPTS);
    const top = liveFaces(m).find((f) => faceNormal(m, f)[1] > 0.99)!;
    insetFaces(m, [top], 0.25);
    expect(liveFaces(m)).toHaveLength(10);
    expect(closedAndConsistent(m)).toBe(true);
  });

  it('insets touching faces as one region: a ring along its outline only', () => {
    const m = plane([0, 0, 0], 2, 2, 2, OPTS);
    const half = liveFaces(m).filter((f) => facePoints(m, f).every((p) => p[2]! <= 0));
    expect(insetFaces(m, half, 0.25).ring).toHaveLength(6);
  });

  it('gives the ring its border face\'s mapping, and on a hull its collision words by facing', () => {
    const m = plane([0, 0, 0], 2, 2, 1, OPTS);
    const f = liveFaces(m)[0]!;
    m.faces[f]!.surface = [3, 5, 0, 7, 8];
    m.faces[f]!.group = 4;
    const mapping = JSON.stringify(m.faces[f]!.mapping);
    const r = insetFaces(m, [f], 0.5);
    for (const w of r.ring) {
      expect(JSON.stringify(m.faces[w]!.mapping)).toBe(mapping);
      expect(m.faces[w]!.surface).toEqual([3, 5, 0, 7, 8]);
      expect(m.faces[w]!.group).toBe(4);
    }
  });
});
