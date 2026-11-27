// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { rootKeyPair, rootKeyStep } from '../src/mover';

/**
 * The one reader of a clip's root key array (the main controller's ruling 2026-11-24T13:4xZ, the AS-34 / B-26
 * PRONE-STRAFE-DRIFT reconciliation): `actionRoots` lays out n keys as the 2n x/z pairs (`keys[2i]`, `keys[2i + 1]`)
 * then the n root y keys (`keys[2n + i]`, AS-34); `rootKeyStep(keys, n, slot, y)` is the root's change at key slot
 * `slot` over the pair `rootKeyPair` gives (the slot and the next, the last slot paired with the one before it:
 * `FUN_00289bb0` D:L132714-132719, r0004 D4:L140476-140480). One length guard: x and z need 2n entries, y 3n.
 * `Walker.clipVelocity`, `Walker.jumpRise` and `proneStrafeHeading` read through it. Stub keys only (unit tier).
 */

const N = 4;
const X = [1, 3, 7, 15], Z = [-2, -5, -11, -20], Y = [0, 4, 6, 7];

function keys3n(): Float32Array {
  const k = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) { k[2 * i] = X[i]!; k[2 * i + 1] = Z[i]!; k[2 * N + i] = Y[i]!; }
  return k;
}

describe('rootKeyStep: the root change at a key slot, one layout and one guard', () => {
  it('a middle slot: the slot to the next, x, z and y', () => {
    expect(rootKeyStep(keys3n(), N, 1, true)).toEqual([X[2]! - X[1]!, Z[2]! - Z[1]!, Y[2]! - Y[1]!]);
  });

  it('the last slot: paired with the one before it, as rootKeyPair pairs it', () => {
    const [a, b] = rootKeyPair(N - 1, N);
    expect([a, b]).toEqual([N - 2, N - 1]);
    expect(rootKeyStep(keys3n(), N, N - 1, true)).toEqual([X[b]! - X[a]!, Z[b]! - Z[a]!, Y[b]! - Y[a]!]);
    expect(rootKeyStep(keys3n(), N, N, true)).toEqual(rootKeyStep(keys3n(), N, N - 1, true));
  });

  it('x and z only: y reads 0 and a 2n array is enough', () => {
    const pairs = keys3n().slice(0, 2 * N);
    expect(rootKeyStep(pairs, N, 1)).toEqual([X[2]! - X[1]!, Z[2]! - Z[1]!, 0]);
    expect(rootKeyStep(keys3n(), N, 1)).toEqual([X[2]! - X[1]!, Z[2]! - Z[1]!, 0]);
  });

  it('refuses a 2n array for y, a short array for x and z, and no array', () => {
    expect(rootKeyStep(keys3n().slice(0, 2 * N), N, 1, true)).toBeNull();
    expect(rootKeyStep(keys3n().slice(0, 3 * N - 1), N, 1, true)).toBeNull();
    expect(rootKeyStep(keys3n().slice(0, 2 * N - 1), N, 1)).toBeNull();
    expect(rootKeyStep(null, N, 1)).toBeNull();
    expect(rootKeyStep(undefined, N, 1, true)).toBeNull();
  });
});
