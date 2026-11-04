import { describe, expect, it } from 'vitest';
import { multiply, partMatrix, partMatrixInto, Skeleton, type SkeletonPart } from '../src';

/**
 * CPS bodies (b) (the client performance sprint's Log, 2026-11-03T02:52Z (B); a product-track adaptation, the same
 * values): `Skeleton.update` composes the pose into the skeleton's own `world` matrices through one scratch the skeleton
 * owns -- no `new Float32Array(16)` per part per pass, as `multiply` made -- and `partMatrixInto` writes `partMatrix`'s
 * sixteen floats into a buffer the caller keeps. The reference is the old code itself: `multiply` and `partMatrix`,
 * unchanged, compared bit for bit.
 */

/** Counts every Float32Array made while `run` runs (`new`, `of`, `from`, a subarray's copy): the global wrapped. */
function countFloat32(run: () => void): number {
  const real = globalThis.Float32Array;
  let made = 0;
  globalThis.Float32Array = new Proxy(real, {
    construct(target, args) { made++; return Reflect.construct(target, args); },
  });
  try { run(); } finally { globalThis.Float32Array = real; }
  return made;
}

const qOf = (ax: number, ay: number, az: number, deg: number): [number, number, number, number] => {
  const l = Math.hypot(ax, ay, az), h = (deg * Math.PI) / 360, s = Math.sin(h) / l;
  return [ax * s, ay * s, az * s, Math.cos(h)];
};

function skeleton(): Skeleton {
  const part = (index: number, name: string, parent: number, q: [number, number, number, number], t: [number, number, number]): SkeletonPart =>
    ({ index, name, parent, bindLocal: partMatrix(q, t), bbox: new Float32Array(6), type: 0, flags: 0 });
  const model = partMatrix(qOf(0, 1, 0, 30), [1.25, -2.5, 7]);
  return new Skeleton('test', model, [
    part(0, 'skel_root', -1, qOf(1, 0, 0, 12), [0, 11.5, 0.5]), part(1, 'hips', 0, qOf(0, 0, 1, -7), [0.3, 1, 0]),
    part(2, 'lthigh', 1, qOf(1, 1, 0, 33), [1, -1, 0]), part(3, 'spinelo', 1, qOf(0, 1, 1, 5), [0, 2.2, 0.1]),
    part(4, 'spinehi', 3, qOf(1, 0, 1, 9), [0, 3.1, 0]), part(5, 'head', 4, qOf(0, 1, 0, -14), [0, 4, 0.25]),
    part(6, 'body', -1, [0, 0, 0, 1], [0, 0, 0]),
  ]);
}

/** The old `update`: each part's world a fresh `multiply(local, parent's world)`, parents first. */
function referenceWorld(s: Skeleton): Float32Array[] {
  const out: Float32Array[] = [];
  for (const p of s.parts) out[p.index] = multiply(s.local[p.index]!, p.parent < 0 ? s.modelMatrix : out[p.parent]!);
  return out;
}

const bits = (m: Float32Array): number[] => [...new Uint32Array(m.buffer, m.byteOffset, 16)];

describe('CPS bodies (b): the skeleton composed with no allocation, the same bits', () => {
  it("update writes the old multiply's bits into the same world arrays, and makes no Float32Array", () => {
    const s = skeleton();
    const kept = [...s.world];                                  // what a caller holds (`palette()`): the same arrays after
    const scratch = new Float32Array(16);
    for (let step = 0; step < 40; step++) {
      for (const p of s.parts) {
        partMatrixInto(qOf(Math.sin(step + p.index), 1, Math.cos(step * 0.7), step * 4.5 + p.index * 11), [step * 0.37, -p.index, 0.125 * step], scratch);
        s.setLocal(p.index, scratch);
      }
      const ref = referenceWorld(s);
      expect(countFloat32(() => s.update())).toBe(0);
      s.world.forEach((m, i) => { expect(m).toBe(kept[i]); expect(bits(m)).toEqual(bits(ref[i]!)); });
    }
    expect(s.palette()).toBe(s.world);
  });

  it("partMatrixInto writes partMatrix's bits into the caller's buffer and makes none", () => {
    const out = new Float32Array(16);
    for (let k = 0; k < 50; k++) {
      const q = qOf(k % 3, 1 + (k % 5), -k, k * 7.3), t: [number, number, number] = [k * 1.1, -k / 3, k * k * 0.01];
      expect(countFloat32(() => partMatrixInto(q, t, out))).toBe(0);
      expect(bits(out)).toEqual(bits(partMatrix(q, t)));
    }
  });

  it('the bind world is a copy of the first pass, not the scratch or a world array', () => {
    const s = skeleton();
    s.bindWorld.forEach((m, i) => { expect(m).not.toBe(s.world[i]); expect(bits(m)).toEqual(bits(s.world[i]!)); });
    s.setLocal(0, partMatrix(qOf(0, 0, 1, 90), [5, 5, 5]));
    s.update();
    expect(bits(s.bindWorld[0]!)).not.toEqual(bits(s.world[0]!));
    expect(bits(s.bindWorld[0]!)).toEqual(bits(referenceWorld(new Skeleton('again', s.modelMatrix, s.parts))[0]!));
  });
});


