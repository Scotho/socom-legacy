import { describe, expect, it } from 'vitest';
import * as payload from '../src/payloadBytes';
import { bufferPayloadBytes } from '../src/payloadBytes';

/** `../src/payloadBytes` (a browser adaptation, an instrument): the contributor's two tests, moved verbatim with it. */
describe('bufferPayloadBytes (browser adaptation)', () => {
  it('counts shared backing buffers once, including slices, Maps and cyclic data', () => {
    const bytes = new ArrayBuffer(4096);
    const tree: Record<string, unknown> = { a: new Uint8Array(bytes, 8, 16), b: new Float32Array(bytes) };
    tree.self = tree;
    tree.map = new Map([['x', new Uint8Array(32)]]);
    expect(bufferPayloadBytes(tree)).toEqual({ bytes: 4128, truncated: false });
  });

  it('bounds payload traversal and never evaluates getters', () => {
    let reads = 0;
    const data = { get secret() { reads++; throw new Error('must not read'); }, huge: Array.from({ length: 1000 }, () => ({})) };
    expect(bufferPayloadBytes(data, 32).truncated).toBe(true);
    expect(reads).toBe(0);
  });
});

/**
 * XBOX-790-LOADDIAG review L3/L4 (maintainers'; a browser adaptation): the walk runs on the main thread for every worker
 * reply on every device, so its budget bounds the work on one huge plain array too -- walked by index, never listed
 * whole by `for...in` -- and the budget's name says it is no Xbox-only constant.
 */
describe('bufferPayloadBytes: the budget bounds one huge array or object (review L3, L4)', () => {
  it('the budget is PAYLOAD_WALK_VISITS_ADAPTATION, 8192 (the Xbox-only name gone: it runs on every device)', () => {
    const named = payload as Record<string, unknown>;
    expect(named['PAYLOAD_WALK_VISITS_ADAPTATION']).toBe(8192);
    expect('XBOX_TRACE_VISITS_ADAPTATION' in named).toBe(false);
  });

  it('a very large plain array: walked by index up to the budget, its keys never listed; capped, a buffer past the budget not reached', () => {
    const big: unknown[] = new Array(1_000_000).fill(0);
    big[999_999] = new Uint8Array(4096);
    expect(bufferPayloadBytes({ big })).toEqual({ bytes: 0, truncated: true });
    let listed = 0, read = 0;
    const watched = new Proxy(new Array(100_000).fill(0) as unknown[], {
      ownKeys: (t) => { listed++; return Reflect.ownKeys(t); },
      getOwnPropertyDescriptor: (t, k) => { read++; return Reflect.getOwnPropertyDescriptor(t, k); },
    });
    expect(bufferPayloadBytes(watched, 64).truncated).toBe(true);
    expect(listed).toBe(0);                                             // no up-front listing of 100,000 keys
    expect(read).toBeLessThanOrEqual(65);                               // the budget's indices, the one past it at most
  });

  it('a short array still walked whole, each buffer once; a typed array counted by its bytes, never walked', () => {
    const shared = new ArrayBuffer(2048);
    expect(bufferPayloadBytes([new Uint8Array(shared), [new Float32Array(shared), new Uint8Array(16)], null, 3])).toEqual({ bytes: 2064, truncated: false });
    expect(bufferPayloadBytes(new Float64Array(1_000_000))).toEqual({ bytes: 8_000_000, truncated: false });
  });

  it('an object with more keys than the budget: capped, a buffer behind the budget not reached', () => {
    const wide: Record<string, unknown> = {};
    for (let k = 0; k < 20_000; k++) wide[`k${k}`] = k;
    wide['last'] = new Uint8Array(4096);
    expect(bufferPayloadBytes(wide)).toEqual({ bytes: 0, truncated: true });
    expect(bufferPayloadBytes(wide, 16)).toEqual({ bytes: 0, truncated: true });
  });
});
