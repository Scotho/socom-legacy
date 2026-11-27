import { describe, expect, it } from 'vitest';
import { Skeleton, type SkeletonPart } from '../src/skeleton';

/**
 * LATER 1221 part 2 (its review's F1): `updateChain` composes a part and its ancestors as `update` would -- including the
 * root's parent, the skeleton's MODEL matrix, which the animator's skeletons hold at the identity (so the dev-disc digest
 * could not see it dropped). A non-identity model matrix and a three-deep chain: the chain's world floats equal `update`'s.
 */
const m = (tx: number, ty: number, tz: number, a = 0): Float32Array => {
  const c = Math.cos(a), s = Math.sin(a);
  return Float32Array.from([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, tx, ty, tz, 1]);   // row-major, row vectors: a turn about y, then the place
};
const part = (index: number, name: string, parent: number, local: Float32Array): SkeletonPart =>
  ({ index, name, parent, bindLocal: local, bbox: new Float32Array(6), type: 0, flags: 0 });

describe('LATER 1221 part 2: Skeleton.updateChain', () => {
  it('a part and its ancestors composed to the same floats as a whole update, under a non-identity model matrix', () => {
    const parts = [part(0, 'root', -1, m(1, 2, 3, 0.3)), part(1, 'lo', 0, m(0, 5, 0, -0.7)), part(2, 'hi', 1, m(0, 4, 1, 1.1)), part(3, 'arm', 1, m(2, 0, 0, 0.2))];
    const model = m(10, -4, 7, 0.9);
    const a = new Skeleton('t', model, parts), b = new Skeleton('t', model, parts);
    for (const s of [a, b]) { s.setLocal(1, m(0.5, 5, 0.25, -0.4)); s.setLocal(2, m(0, 4.5, 1, 1.4)); }
    a.update();
    b.updateChain(2);
    for (const i of [0, 1, 2]) expect(Array.from(b.world[i]!), `part ${i}`).toEqual(Array.from(a.world[i]!));
    expect(Array.from(b.world[3]!)).not.toEqual(Array.from(a.world[3]!));   // off the chain: left as it was (the bind)
  });
});
